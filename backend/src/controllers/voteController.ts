import type { Request, Response } from "express";
import { ErrorMessages, voteQuotaMessage } from "../constants/errorMessages.js";
import { extractVideoId } from "../services/downloadService.js";
import type { QueueManager } from "../services/queueManager.js";
import type { SongRequestService } from "../services/songRequestService.js";
import type { SongService } from "../services/songService.js";
import { VoteQuotaExceededError, type VoteService } from "../services/voteService.js";
import type { YoutubeMetadataService } from "../services/youtubeMetadataService.js";
import type { IRealtimeHub } from "../realtime/events.js";

export class VoteController {
  constructor(
    private readonly voteService: VoteService,
    private readonly songService: SongService,
    private readonly queueManager: QueueManager,
    private readonly youtubeMetadata: YoutubeMetadataService,
    private readonly songRequestService: SongRequestService,
    private readonly realtime?: IRealtimeHub,
  ) {}

  vote = async (request: Request, response: Response): Promise<void> => {
    const { songId, youtubeUrl } = request.body || {};
    const userId = request.user?.id;
    const isAdmin = !!request.user?.isAdmin;
    if (!userId) {
      response.status(401).json({ message: ErrorMessages.invalidToken });
      return;
    }

    if (songId) {
      const song = this.songService.getById(songId);
      if (!song) {
        response.status(404).json({ message: ErrorMessages.songNotFound });
        return;
      }
      if (song.status !== "verified") {
        response.status(400).json({ message: ErrorMessages.songNotVerified });
        return;
      }
      if (!this.songService.getVotableSongIds().includes(songId)) {
        response.status(400).json({ message: ErrorMessages.cannotVoteNow });
        return;
      }
      try {
        this.voteService.addVote(userId, songId, { enforceQuota: !isAdmin });
      } catch (error) {
        if (error instanceof VoteQuotaExceededError) {
          const quota = this.voteService.getVoteQuota();
          response.status(429).json({ message: voteQuotaMessage(quota.perUser, quota.periodHours) });
          return;
        }
        throw error;
      }
      this.queueManager.refreshQueueFile();
      this.realtime?.publish({ event: "votes:changed", songId, title: song.title, author: song.author });
      response.json({ success: true });
      return;
    }

    if (youtubeUrl) {
      const videoId = extractVideoId(youtubeUrl);
      if (!videoId) {
        response.status(400).json({ message: ErrorMessages.invalidYoutubeUrl });
        return;
      }
      const song = this.songService.findByYoutubeVideoId(videoId);
      if (song) {
        if (song.status === "verified") {
          if (!this.songService.getVotableSongIds().includes(song.id)) {
            response.status(400).json({ message: ErrorMessages.cannotVoteNow });
            return;
          }
          try {
            this.voteService.addVote(userId, song.id, { enforceQuota: !isAdmin });
          } catch (error) {
            if (error instanceof VoteQuotaExceededError) {
              const quota = this.voteService.getVoteQuota();
              response.status(429).json({ message: voteQuotaMessage(quota.perUser, quota.periodHours) });
              return;
            }
            throw error;
          }
          this.queueManager.refreshQueueFile();
          this.realtime?.publish({ event: "votes:changed", songId: song.id, title: song.title, author: song.author });
          response.json({ success: true, message: "Oddano głos" });
          return;
        }
        this.songRequestService.add(userId, song.id, song.youtubeUrl);
        this.realtime?.publish({ event: "requests:updated", songId: song.id, title: song.title });
        response.json({ success: true, message: "Piosenka czeka na weryfikację" });
        return;
      }
      const meta = await this.youtubeMetadata.fetchYouTubeMetadata(youtubeUrl).catch(() => null);
      const pendingId = this.songService.createPending({
        title: meta?.title || "Zgłoszona piosenka",
        author: meta?.author || "-",
        coverUrl: meta?.coverUrl || null,
        youtubeUrl,
      });
      this.songRequestService.add(userId, pendingId, youtubeUrl);
      this.realtime?.publish({ event: "requests:updated", songId: pendingId });
      response.json({ success: true, message: "Dodano do zgłoszeń. Czeka na weryfikację." });
      return;
    }

    response.status(400).json({ message: ErrorMessages.voteTargetRequired });
  };

  getQuota = (request: Request, response: Response): void => {
    const userId = request.user?.id;
    if (!userId) {
      response.status(401).json({ message: ErrorMessages.invalidToken });
      return;
    }
    response.json(this.voteService.getQuotaStatus(userId));
  };
}
