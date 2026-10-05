import type { Request, Response } from "express";
import type { VoteTieBreakMode } from "../config/voteTieBreak.js";
import { ErrorMessages } from "../constants/errorMessages.js";
import { sendPollError } from "../http/pollError.js";
import type { IEmailService } from "../interfaces/IEmailService.js";
import { routeParam } from "../middlewares/routeParam.js";
import type { IRealtimeHub } from "../realtime/events.js";
import type { BellService } from "../services/bellService.js";
import { extractVideoId } from "../services/downloadService.js";
import { logEvent } from "../services/logger.js";
import type { PollService } from "../services/pollService.js";
import type { YoutubeMetadataService } from "../services/youtubeMetadataService.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export class BellController {
  constructor(
    private readonly bellService: BellService,
    private readonly pollService: PollService,
    private readonly youtubeMetadata: YoutubeMetadataService,
    private readonly email: IEmailService,
    private readonly pollsUrl: string,
    private readonly tieBreakMode: VoteTieBreakMode,
    private readonly realtime?: IRealtimeHub,
  ) {}

  listApproved = (_request: Request, response: Response): void => {
    response.json({ bells: this.bellService.listApproved() });
  };

  listPending = (_request: Request, response: Response): void => {
    response.json({ bells: this.bellService.listPending() });
  };

  request = async (request: Request, response: Response): Promise<void> => {
    const userId = request.user?.id;
    if (!userId) {
      response.status(401).json({ message: ErrorMessages.invalidToken });
      return;
    }
    const youtubeUrl = stringField(request.body?.youtubeUrl);
    if (!extractVideoId(youtubeUrl)) {
      response.status(400).json({ message: ErrorMessages.invalidYoutubeUrl });
      return;
    }
    try {
      const meta = await this.youtubeMetadata.fetchYouTubeMetadata(youtubeUrl).catch(() => null);
      const result = this.pollService.proposeToWeekly(
        {
          youtubeUrl,
          title: stringField(request.body?.title) || meta?.title,
          artist: stringField(request.body?.artist) || meta?.author,
          startTimeSec: request.body?.startTimeSec,
          endTimeSec: request.body?.endTimeSec,
          requestedById: userId,
        },
        new Date(),
        this.tieBreakMode,
      );
      this.realtime?.publish({ event: "polls:updated", pollId: result.poll?.id });
      response.status(201).json({ bell: result.bell, poll: result.poll });
    } catch (error) {
      sendPollError(error, response);
    }
  };

  approve = async (request: Request, response: Response): Promise<void> => {
    const youtubeUrl = stringField(request.body?.youtubeUrl);
    if (youtubeUrl && !extractVideoId(youtubeUrl)) {
      response.status(400).json({ message: ErrorMessages.invalidYoutubeUrl });
      return;
    }
    try {
      const result = this.bellService.approve(routeParam(request, "id"), {
        title: request.body?.title,
        artist: request.body?.artist,
        youtubeUrl: youtubeUrl || undefined,
        startTimeSec: request.body?.startTimeSec,
        endTimeSec: request.body?.endTimeSec,
      });
      await this.notifyApproved(result.bell.title, result.notifyEmails);
      this.realtime?.publish({ event: "polls:updated" });
      response.json({ bell: result.bell });
    } catch (error) {
      sendPollError(error, response);
    }
  };

  private async notifyApproved(title: string, emails: string[]): Promise<void> {
    const subject = `Dzwonek „${title}” został zatwierdzony`;
    const html = `<p>Dzwonek <strong>${escapeHtml(title)}</strong> został zatwierdzony i jego głosy liczą się w ankiecie.</p><p><a href="${escapeHtml(this.pollsUrl)}">${escapeHtml(this.pollsUrl)}</a></p>`;
    for (const email of emails) {
      try {
        await this.email.sendMail({ to: email, subject, html, text: `${subject}\n${this.pollsUrl}` });
      } catch (error) {
        logEvent("email", "bell_approved_failed", {
          email,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
