import type { Request, Response } from "express";
import type { VoteTieBreakMode } from "../config/voteTieBreak.js";
import { ErrorMessages } from "../constants/errorMessages.js";
import { sendPollError } from "../http/pollError.js";
import { routeParam } from "../middlewares/routeParam.js";
import type { IRealtimeHub } from "../realtime/events.js";
import { extractVideoId } from "../services/downloadService.js";
import { PollActionError } from "../services/pollActionError.js";
import type { PollOptionInput, PollService } from "../services/pollService.js";
import type { YoutubeMetadataService } from "../services/youtubeMetadataService.js";

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export class PollController {
  constructor(
    private readonly pollService: PollService,
    private readonly youtubeMetadata: YoutubeMetadataService,
    private readonly tieBreakMode: VoteTieBreakMode,
    private readonly realtime?: IRealtimeHub,
  ) {}

  listActive = (request: Request, response: Response): void => {
    const userId = request.user?.id;
    if (!userId) {
      response.status(401).json({ message: ErrorMessages.invalidToken });
      return;
    }
    response.json({ polls: this.pollService.listActive(userId, new Date(), this.tieBreakMode) });
  };

  list = (request: Request, response: Response): void => {
    response.json({
      polls: this.pollService.listAll(request.user?.id ?? null, this.tieBreakMode),
      tieBreakMode: this.tieBreakMode,
    });
  };

  results = (request: Request, response: Response): void => {
    try {
      response.json({
        poll: this.pollService.results(routeParam(request, "id"), request.user?.id ?? null, this.tieBreakMode),
        tieBreakMode: this.tieBreakMode,
      });
    } catch (error) {
      sendPollError(error, response);
    }
  };

  vote = (request: Request, response: Response): void => {
    const userId = request.user?.id;
    if (!userId) {
      response.status(401).json({ message: ErrorMessages.invalidToken });
      return;
    }
    const pollOptionId = stringField(request.body?.pollOptionId);
    if (!pollOptionId) {
      response.status(400).json({ message: ErrorMessages.pollOptionRequired });
      return;
    }
    try {
      const poll = this.pollService.vote(routeParam(request, "id"), userId, pollOptionId, new Date(), this.tieBreakMode);
      this.realtime?.publish({ event: "polls:updated", pollId: poll.id });
      response.json({ poll });
    } catch (error) {
      sendPollError(error, response);
    }
  };

  clearVote = (request: Request, response: Response): void => {
    const userId = request.user?.id;
    if (!userId) {
      response.status(401).json({ message: ErrorMessages.invalidToken });
      return;
    }
    try {
      const poll = this.pollService.clearVote(routeParam(request, "id"), userId, new Date(), this.tieBreakMode);
      this.realtime?.publish({ event: "polls:updated", pollId: poll.id });
      response.json({ poll });
    } catch (error) {
      sendPollError(error, response);
    }
  };

  addOption = async (request: Request, response: Response): Promise<void> => {
    const userId = request.user?.id;
    if (!userId) {
      response.status(401).json({ message: ErrorMessages.invalidToken });
      return;
    }
    const pollId = routeParam(request, "id");
    try {
      const result = stringField(request.body?.bellId)
        ? this.pollService.addApprovedBell(pollId, stringField(request.body?.bellId), new Date(), this.tieBreakMode, userId)
        : await this.propose(pollId, userId, request.body);
      this.realtime?.publish({ event: "polls:updated", pollId: result.poll.id });
      response.status(201).json(result);
    } catch (error) {
      sendPollError(error, response);
    }
  };

  create = (request: Request, response: Response): void => {
    try {
      const options = Array.isArray(request.body?.options) ? request.body.options.filter(hasOptionContent) : [];
      const poll = this.pollService.create({ ...request.body, options }, this.tieBreakMode);
      this.realtime?.publish({ event: "polls:updated", pollId: poll.id });
      response.status(201).json({ poll });
    } catch (error) {
      sendPollError(error, response);
    }
  };

  update = (request: Request, response: Response): void => {
    try {
      const poll = this.pollService.update(routeParam(request, "id"), request.body ?? {}, request.user?.id ?? null, this.tieBreakMode);
      this.realtime?.publish({ event: "polls:updated", pollId: poll.id });
      response.json({ poll });
    } catch (error) {
      sendPollError(error, response);
    }
  };

  adminAddOption = async (request: Request, response: Response): Promise<void> => {
    try {
      const input = await this.withMetadata(request.body ?? {});
      const poll = this.pollService.adminAddOption(routeParam(request, "id"), input, request.user?.id ?? null, this.tieBreakMode);
      this.realtime?.publish({ event: "polls:updated", pollId: poll.id });
      response.status(201).json({ poll });
    } catch (error) {
      sendPollError(error, response);
    }
  };

  removeOption = (request: Request, response: Response): void => {
    try {
      const poll = this.pollService.removeOption(
        routeParam(request, "id"),
        routeParam(request, "optionId"),
        request.user?.id ?? null,
        this.tieBreakMode,
      );
      this.realtime?.publish({ event: "polls:updated", pollId: poll.id });
      response.json({ poll });
    } catch (error) {
      sendPollError(error, response);
    }
  };

  private async propose(pollId: string, userId: string, body: { youtubeUrl?: unknown; title?: unknown; artist?: unknown; startTimeSec?: unknown; endTimeSec?: unknown }) {
    const youtubeUrl = stringField(body.youtubeUrl);
    if (!youtubeUrl) {
      throw new PollActionError(ErrorMessages.pollOptionRequired, 400);
    }
    if (!extractVideoId(youtubeUrl)) {
      throw new PollActionError(ErrorMessages.invalidYoutubeUrl, 400);
    }
    const meta = await this.youtubeMetadata.fetchYouTubeMetadata(youtubeUrl).catch(() => null);
    return this.pollService.proposeYoutube(
      pollId,
      {
        youtubeUrl,
        title: stringField(body.title) || meta?.title,
        artist: stringField(body.artist) || meta?.author,
        startTimeSec: body.startTimeSec,
        endTimeSec: body.endTimeSec,
        requestedById: userId,
      },
      new Date(),
      this.tieBreakMode,
      userId,
    );
  }

  private async withMetadata(body: PollOptionInput): Promise<PollOptionInput> {
    const youtubeUrl = stringField(body.youtubeUrl);
    if (!youtubeUrl || stringField(body.title)) {
      return body;
    }
    const meta = await this.youtubeMetadata.fetchYouTubeMetadata(youtubeUrl).catch(() => null);
    return { ...body, title: meta?.title, artist: meta?.author };
  }
}

function hasOptionContent(option: unknown): boolean {
  if (!option || typeof option !== "object") {
    return false;
  }
  const record = option as { title?: unknown; youtubeUrl?: unknown; bellId?: unknown };
  return Boolean(stringField(record.title) || stringField(record.youtubeUrl) || stringField(record.bellId));
}
