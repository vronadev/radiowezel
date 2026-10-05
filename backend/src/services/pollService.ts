import type { Bell, Poll, PollType, PollView } from "../@types/models.js";
import type { VoteTieBreakMode } from "../config/voteTieBreak.js";
import { ErrorMessages } from "../constants/errorMessages.js";
import type { IDatabase } from "../interfaces/IDatabase.js";
import type { BellRepository } from "../repositories/bellRepository.js";
import type { PollOptionJoined, PollOptionRepository } from "../repositories/pollOptionRepository.js";
import type { PollRepository } from "../repositories/pollRepository.js";
import type { PollVoteRepository } from "../repositories/pollVoteRepository.js";
import { extractVideoId } from "./downloadService.js";
import { PollActionError } from "./pollActionError.js";
import { optionEligible, selectPollWinner } from "./pollTally.js";
import { clipRange } from "../utils/clipRange.js";
import { formatLocalDate } from "../utils/localCalendar.js";
import { recurringWeeklyBellWindows, weeklyBellPollTitle, type WeeklyBellWindow } from "../utils/weeklyBellWindow.js";
import { logEvent } from "./logger.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface PollOptionInput {
  title?: unknown;
  artist?: unknown;
  youtubeUrl?: unknown;
  startTimeSec?: unknown;
  endTimeSec?: unknown;
  bellId?: unknown;
}

export interface YoutubeProposal {
  youtubeUrl: string;
  title?: string;
  artist?: string;
  startTimeSec?: unknown;
  endTimeSec?: unknown;
  requestedById: string | null;
  isApproved?: boolean;
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE";
}

function assertIsoDate(value: string): void {
  if (!ISO_DATE.test(value)) {
    throw new PollActionError(ErrorMessages.invalidPollDate, 400);
  }
  const [year, month, day] = value.split("-").map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new PollActionError(ErrorMessages.invalidPollDate, 400);
  }
}

function assertPollType(value: unknown): PollType {
  if (value === "WEEKLY_BELL" || value === "ONE_OFF") {
    return value;
  }
  throw new PollActionError(ErrorMessages.invalidPollType, 400);
}

export class PollService {
  constructor(
    private readonly database: IDatabase,
    private readonly pollRepository: PollRepository,
    private readonly pollOptionRepository: PollOptionRepository,
    private readonly pollVoteRepository: PollVoteRepository,
    private readonly bellRepository: BellRepository,
  ) {}

  ensureRecurringWeeklyBellPolls(at: Date): Poll[] {
    return this.database.transaction(() => {
      const localDate = formatLocalDate(at);
      const ids: string[] = [];
      for (const window of recurringWeeklyBellWindows(at)) {
        ids.push(this.ensureWindow(window).id);
      }
      this.pollRepository.syncWeeklyActive(localDate);
      return ids.map((id) => this.requirePoll(id));
    });
  }

  listActive(userId: string, at: Date, mode: VoteTieBreakMode): PollView[] {
    this.ensureRecurringWeeklyBellPolls(at);
    const day = formatLocalDate(at);
    return this.pollRepository
      .listAll()
      .filter((poll) => poll.isActive && poll.startDate <= day && poll.endDate >= day)
      .map((poll) => this.compose(poll, userId, mode));
  }

  listAll(userId: string | null, mode: VoteTieBreakMode): PollView[] {
    return this.pollRepository.listAll().map((poll) => this.compose(poll, userId, mode));
  }

  results(pollId: string, userId: string | null, mode: VoteTieBreakMode): PollView {
    return this.compose(this.requirePoll(pollId), userId, mode);
  }

  create(
    input: {
      title: unknown;
      type: unknown;
      startDate: unknown;
      endDate: unknown;
      isActive?: unknown;
      options?: PollOptionInput[];
    },
    mode: VoteTieBreakMode,
  ): PollView {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) {
      throw new PollActionError(ErrorMessages.pollTitleRequired, 400);
    }
    const type = assertPollType(input.type);
    const startDate = typeof input.startDate === "string" ? input.startDate : "";
    const endDate = typeof input.endDate === "string" ? input.endDate : "";
    assertIsoDate(startDate);
    assertIsoDate(endDate);
    if (endDate < startDate) {
      throw new PollActionError(ErrorMessages.invalidPollRange, 400);
    }
    const options = input.options ?? [];
    if (options.length === 0) {
      throw new PollActionError(ErrorMessages.pollOptionsRequired, 400);
    }
    const id = crypto.randomUUID();
    try {
      this.database.transaction(() => {
        this.pollRepository.insert({
          id,
          title,
          type,
          startDate,
          endDate,
          isActive: input.isActive !== false,
        });
        for (const option of options) {
          this.insertCreatedOption(id, type, option, null);
        }
      });
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new PollActionError(ErrorMessages.weeklyPollExists, 409);
      }
      throw error;
    }
    return this.compose(this.requirePoll(id), null, mode);
  }

  update(
    pollId: string,
    patch: { title?: unknown; startDate?: unknown; endDate?: unknown; isActive?: unknown },
    userId: string | null,
    mode: VoteTieBreakMode,
  ): PollView {
    const poll = this.requirePoll(pollId);
    const title = typeof patch.title === "string" && patch.title.trim() ? patch.title.trim() : poll.title;
    const startDate = typeof patch.startDate === "string" ? patch.startDate : poll.startDate;
    const endDate = typeof patch.endDate === "string" ? patch.endDate : poll.endDate;
    assertIsoDate(startDate);
    assertIsoDate(endDate);
    if (endDate < startDate) {
      throw new PollActionError(ErrorMessages.invalidPollRange, 400);
    }
    const isActive = typeof patch.isActive === "boolean" ? patch.isActive : poll.isActive;
    try {
      this.pollRepository.save({ ...poll, title, startDate, endDate, isActive });
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new PollActionError(ErrorMessages.weeklyPollExists, 409);
      }
      throw error;
    }
    return this.compose(this.requirePoll(pollId), userId, mode);
  }

  vote(pollId: string, userId: string, pollOptionId: string, at: Date, mode: VoteTieBreakMode): PollView {
    this.ensureRecurringWeeklyBellPolls(at);
    const poll = this.requireOpenPoll(pollId, at);
    const option = this.pollOptionRepository.findById(pollOptionId);
    if (!option || option.pollId !== poll.id) {
      throw new PollActionError(ErrorMessages.pollOptionNotFound, 400);
    }
    this.pollVoteRepository.upsert({
      id: crypto.randomUUID(),
      pollId: poll.id,
      userId,
      pollOptionId: option.id,
    });
    return this.compose(poll, userId, mode);
  }

  clearVote(pollId: string, userId: string, at: Date, mode: VoteTieBreakMode): PollView {
    this.ensureRecurringWeeklyBellPolls(at);
    const poll = this.requireOpenPoll(pollId, at);
    this.pollVoteRepository.deleteByPollAndUser(poll.id, userId);
    return this.compose(poll, userId, mode);
  }

  addApprovedBell(
    pollId: string,
    bellId: string,
    at: Date,
    mode: VoteTieBreakMode,
    userId: string,
  ): { poll: PollView; added: boolean } {
    this.ensureRecurringWeeklyBellPolls(at);
    const poll = this.requireOpenPoll(pollId, at);
    if (poll.type !== "WEEKLY_BELL") {
      throw new PollActionError(ErrorMessages.weeklyOptionsOnly, 400);
    }
    const bell = this.bellRepository.findById(bellId);
    if (!bell) {
      throw new PollActionError(ErrorMessages.bellNotFound, 404);
    }
    if (!bell.isApproved) {
      throw new PollActionError(ErrorMessages.bellNotApproved, 400);
    }
    const added = this.linkBell(poll.id, bell);
    return { poll: this.compose(this.requirePoll(poll.id), userId, mode), added };
  }

  proposeYoutube(
    pollId: string,
    proposal: YoutubeProposal,
    at: Date,
    mode: VoteTieBreakMode,
    userId: string,
  ): { poll: PollView; added: boolean } {
    this.ensureRecurringWeeklyBellPolls(at);
    const poll = this.requireOpenPoll(pollId, at);
    if (poll.type !== "WEEKLY_BELL") {
      throw new PollActionError(ErrorMessages.weeklyOptionsOnly, 400);
    }
    const bell = this.upsertProposalBell(proposal);
    const added = this.linkBell(poll.id, bell);
    return { poll: this.compose(this.requirePoll(poll.id), userId, mode), added };
  }

  proposeToWeekly(proposal: YoutubeProposal, at: Date, mode: VoteTieBreakMode): { poll: PollView | null; bell: Bell; added: boolean } {
    const bell = this.upsertProposalBell(proposal);
    const target = this.weeklyTarget(at);
    const added = target ? this.linkBell(target.id, bell) : false;
    return {
      bell,
      added,
      poll: target ? this.compose(this.requirePoll(target.id), proposal.requestedById, mode) : null,
    };
  }

  adminAddOption(pollId: string, input: PollOptionInput, userId: string | null, mode: VoteTieBreakMode): PollView {
    const poll = this.requirePoll(pollId);
    this.insertCreatedOption(poll.id, poll.type, input, null);
    return this.compose(poll, userId, mode);
  }

  removeOption(pollId: string, optionId: string, userId: string | null, mode: VoteTieBreakMode): PollView {
    const poll = this.requirePoll(pollId);
    const changes = this.pollOptionRepository.delete(poll.id, optionId);
    if (changes === 0) {
      throw new PollActionError(ErrorMessages.pollOptionNotFound, 404);
    }
    return this.compose(this.requirePoll(poll.id), userId, mode);
  }

  private ensureWindow(window: WeeklyBellWindow): Poll {
    const existing = this.pollRepository.findWeeklyByStartDate(window.startDate);
    if (existing) {
      return existing;
    }
    const id = crypto.randomUUID();
    this.pollRepository.insert({
      id,
      title: weeklyBellPollTitle(window),
      type: "WEEKLY_BELL",
      startDate: window.startDate,
      endDate: window.endDate,
      isActive: false,
    });
    logEvent("polls", "weekly-bell-created", { pollId: id, startDate: window.startDate, endDate: window.endDate });
    return this.requirePoll(id);
  }

  private weeklyTarget(at: Date): Poll | null {
    this.ensureRecurringWeeklyBellPolls(at);
    const day = formatLocalDate(at);
    const polls = this.pollRepository.listByType("WEEKLY_BELL");
    const open = polls.find((poll) => poll.isActive && poll.startDate <= day && poll.endDate >= day);
    if (open) {
      return open;
    }
    return polls.filter((poll) => poll.startDate >= day).sort((left, right) => left.startDate.localeCompare(right.startDate))[0] ?? null;
  }

  private requirePoll(id: string): Poll {
    const poll = this.pollRepository.findById(id);
    if (!poll) {
      throw new PollActionError(ErrorMessages.pollNotFound, 404);
    }
    return poll;
  }

  private requireOpenPoll(id: string, at: Date): Poll {
    const poll = this.requirePoll(id);
    const day = formatLocalDate(at);
    if (!poll.isActive || day < poll.startDate || day > poll.endDate) {
      throw new PollActionError(ErrorMessages.pollClosed, 400);
    }
    return poll;
  }

  private upsertProposalBell(proposal: YoutubeProposal): Bell {
    const videoId = extractVideoId(proposal.youtubeUrl);
    if (!videoId) {
      throw new PollActionError(ErrorMessages.invalidYoutubeUrl, 400);
    }
    const existing = this.bellRepository.findByYoutubeVideoId(videoId);
    if (existing) {
      return existing;
    }
    const range = clipRange(proposal.startTimeSec, proposal.endTimeSec);
    const title = proposal.title?.trim() || "Dzwonek z YouTube";
    const artist = proposal.artist?.trim() || "-";
    const id = crypto.randomUUID();
    this.bellRepository.insert({
      id,
      title,
      artist,
      youtubeUrl: proposal.youtubeUrl.trim(),
      startTimeSec: range.startTimeSec,
      endTimeSec: range.endTimeSec,
      isApproved: proposal.isApproved === true,
      requestedById: proposal.requestedById,
    });
    return this.bellRepository.findById(id) ?? existing ?? this.requireBell(id);
  }

  private requireBell(id: string): Bell {
    const bell = this.bellRepository.findById(id);
    if (!bell) {
      throw new PollActionError(ErrorMessages.bellNotFound, 500);
    }
    return bell;
  }

  private linkBell(pollId: string, bell: Bell): boolean {
    if (this.pollOptionRepository.findByPollAndBell(pollId, bell.id)) {
      return false;
    }
    this.pollOptionRepository.insert({
      id: crypto.randomUUID(),
      pollId,
      bellId: bell.id,
      title: bell.title,
      youtubeUrl: bell.youtubeUrl,
      startTimeSec: bell.startTimeSec,
      endTimeSec: bell.endTimeSec,
    });
    return true;
  }

  private insertCreatedOption(pollId: string, pollType: PollType, input: PollOptionInput, requestedById: string | null): void {
    if (typeof input.bellId === "string" && input.bellId.trim()) {
      const bell = this.bellRepository.findById(input.bellId.trim());
      if (!bell) {
        throw new PollActionError(ErrorMessages.bellNotFound, 404);
      }
      this.linkBell(pollId, bell);
      return;
    }
    const youtubeUrl = typeof input.youtubeUrl === "string" ? input.youtubeUrl.trim() : "";
    if (!extractVideoId(youtubeUrl)) {
      throw new PollActionError(ErrorMessages.invalidYoutubeUrl, 400);
    }
    const title = typeof input.title === "string" && input.title.trim() ? input.title.trim() : "Dzwonek z YouTube";
    const range = clipRange(input.startTimeSec, input.endTimeSec);
    if (pollType === "WEEKLY_BELL") {
      const artist = typeof input.artist === "string" && input.artist.trim() ? input.artist.trim() : "-";
      const bell = this.upsertProposalBell({
        youtubeUrl,
        title,
        artist,
        startTimeSec: range.startTimeSec,
        endTimeSec: range.endTimeSec,
        requestedById,
        isApproved: true,
      });
      this.linkBell(pollId, bell);
      return;
    }
    this.pollOptionRepository.insert({
      id: crypto.randomUUID(),
      pollId,
      bellId: null,
      title,
      youtubeUrl,
      startTimeSec: range.startTimeSec,
      endTimeSec: range.endTimeSec,
    });
  }

  private compose(poll: Poll, userId: string | null, mode: VoteTieBreakMode): PollView {
    const joined = this.pollOptionRepository.listJoined(poll.id);
    const counts = new Map(this.pollVoteRepository.aggregates(poll.id).map((row) => [row.pollOptionId, row]));
    const myOptionId = userId ? (this.pollVoteRepository.findByPollAndUser(poll.id, userId)?.pollOptionId ?? null) : null;
    const options = joined.map((option) => this.toOptionView(poll, option, counts.get(option.id)));
    return {
      id: poll.id,
      title: poll.title,
      type: poll.type,
      startDate: poll.startDate,
      endDate: poll.endDate,
      isActive: poll.isActive,
      myOptionId,
      winnerOptionId: selectPollWinner(
        options.map((option) => ({
          optionId: option.id,
          voteCount: option.voteCount,
          firstVoteAt: option.firstVoteAt,
          lastVoteAt: option.lastVoteAt,
          eligible: option.eligible,
        })),
        mode,
      ),
      options,
    };
  }

  private toOptionView(
    poll: Poll,
    option: PollOptionJoined,
    count: { count: number; firstVoteAt: string; lastVoteAt: string } | undefined,
  ): PollView["options"][number] {
    const eligible = optionEligible(poll.type, option.bellApproved);
    const isApproved = option.bellId ? option.bellApproved === true : poll.type !== "WEEKLY_BELL";
    return {
      id: option.id,
      pollId: poll.id,
      bellId: option.bellId,
      title: option.title,
      artist: option.artist,
      youtubeUrl: option.youtubeUrl,
      startTimeSec: option.startTimeSec,
      endTimeSec: option.endTimeSec,
      isApproved,
      eligible,
      voteCount: count?.count ?? 0,
      firstVoteAt: count?.firstVoteAt ?? "",
      lastVoteAt: count?.lastVoteAt ?? "",
    };
  }
}
