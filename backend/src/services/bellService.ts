import type { Bell } from "../@types/models.js";
import { ErrorMessages } from "../constants/errorMessages.js";
import type { BellRepository } from "../repositories/bellRepository.js";
import type { PollOptionRepository } from "../repositories/pollOptionRepository.js";
import type { PollVoteRepository } from "../repositories/pollVoteRepository.js";
import type { UserRepository } from "../repositories/userRepository.js";
import { clipRange } from "../utils/clipRange.js";
import { PollActionError } from "./pollActionError.js";

export class BellService {
  constructor(
    private readonly bellRepository: BellRepository,
    private readonly pollOptionRepository: PollOptionRepository,
    private readonly pollVoteRepository: PollVoteRepository,
    private readonly userRepository: UserRepository,
  ) {}

  getById(id: string): Bell | undefined {
    return this.bellRepository.findById(id);
  }

  listApproved(): Bell[] {
    return this.bellRepository.listApproved();
  }

  listPending(): Bell[] {
    return this.bellRepository.listPending();
  }

  findByYoutubeVideoId(videoId: string): Bell | undefined {
    return this.bellRepository.findByYoutubeVideoId(videoId);
  }

  create(input: {
    title: string;
    artist: string;
    youtubeUrl: string;
    startTimeSec?: unknown;
    endTimeSec?: unknown;
    isApproved?: boolean;
    requestedById?: string | null;
  }): Bell {
    const title = input.title.trim();
    const artist = input.artist.trim() || "-";
    if (!title) {
      throw new PollActionError(ErrorMessages.pollTitleRequired, 400);
    }
    const range = clipRange(input.startTimeSec, input.endTimeSec);
    const id = crypto.randomUUID();
    this.bellRepository.insert({
      id,
      title,
      artist,
      youtubeUrl: input.youtubeUrl.trim(),
      startTimeSec: range.startTimeSec,
      endTimeSec: range.endTimeSec,
      isApproved: input.isApproved === true,
      requestedById: input.requestedById ?? null,
    });
    const created = this.bellRepository.findById(id);
    if (!created) {
      throw new PollActionError(ErrorMessages.bellNotFound, 500);
    }
    return created;
  }

  approve(
    id: string,
    patch: {
      title?: unknown;
      artist?: unknown;
      youtubeUrl?: unknown;
      startTimeSec?: unknown;
      endTimeSec?: unknown;
    } = {},
  ): { bell: Bell; notifyEmails: string[] } {
    const existing = this.bellRepository.findById(id);
    if (!existing) {
      throw new PollActionError(ErrorMessages.bellNotFound, 404);
    }
    const title = typeof patch.title === "string" && patch.title.trim() ? patch.title.trim() : existing.title;
    const artist = typeof patch.artist === "string" && patch.artist.trim() ? patch.artist.trim() : existing.artist;
    const youtubeUrl =
      typeof patch.youtubeUrl === "string" && patch.youtubeUrl.trim() ? patch.youtubeUrl.trim() : existing.youtubeUrl;
    const range = clipRange(patch.startTimeSec ?? existing.startTimeSec, patch.endTimeSec ?? existing.endTimeSec);
    this.bellRepository.updateApproved({
      id,
      title,
      artist,
      youtubeUrl,
      startTimeSec: range.startTimeSec,
      endTimeSec: range.endTimeSec,
    });
    this.pollOptionRepository.syncFromBell({
      id,
      title,
      youtubeUrl,
      startTimeSec: range.startTimeSec,
      endTimeSec: range.endTimeSec,
    });
    const updated = this.bellRepository.findById(id);
    if (!updated) {
      throw new PollActionError(ErrorMessages.bellNotFound, 404);
    }
    return { bell: updated, notifyEmails: this.notifyEmails(updated) };
  }

  private notifyEmails(bell: Bell): string[] {
    const emails = new Set(this.pollVoteRepository.listVoterEmailsByBellId(bell.id));
    if (bell.requestedById) {
      const requester = this.userRepository.findById(bell.requestedById);
      if (requester?.email) {
        emails.add(requester.email);
      }
    }
    return [...emails];
  }
}
