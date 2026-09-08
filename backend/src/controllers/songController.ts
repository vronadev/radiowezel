import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { ErrorMessages } from "../constants/errorMessages.js";
import { routeParam } from "../middlewares/routeParam.js";
import type { IFileStore } from "../interfaces/IFileStore.js";
import type { QueueManager } from "../services/queueManager.js";
import { NodeFileStore } from "../services/nodeFileStore.js";
import type { PlaylistService } from "../services/playlistService.js";
import type { SongService } from "../services/songService.js";
import type { SongVerificationService } from "../services/songVerificationService.js";
import type { VoteService } from "../services/voteService.js";
import type { IRealtimeHub } from "../realtime/events.js";
import { applyLibraryOrder } from "../http/libraryOrder.js";
import { VOTE_TIE_BREAK_MODE, type VoteTieBreakMode } from "../config/voteTieBreak.js";

export class SongController {
  constructor(
    private readonly songService: SongService,
    private readonly voteService: VoteService,
    private readonly playlistService: PlaylistService,
    private readonly queueManager: QueueManager,
    private readonly verification: SongVerificationService,
    private readonly songsDir: string,
    private readonly fileStore: IFileStore = new NodeFileStore(),
    private readonly realtime?: IRealtimeHub,
    private readonly voteTieBreakMode: VoteTieBreakMode = VOTE_TIE_BREAK_MODE,
  ) {}

  getLibrary = (request: Request, response: Response): void => {
    const q = String(request.query.q || "").trim();
    const sort = String(request.query.sort || "").toLowerCase();
    const limit = Math.min(100, parseInt(String(request.query.limit || ""), 10) || 50);
    const offset = Math.max(0, parseInt(String(request.query.offset || ""), 10) || 0);
    let rows = this.songService.listVerified();
    if (q) {
      const lower = q.toLowerCase();
      rows = rows.filter(
        (row) => row.title.toLowerCase().includes(lower) || row.author.toLowerCase().includes(lower),
      );
    }
    const voteCounts = this.voteService.getVotesBySong();
    const allowedIds = this.playlistService.getAllowedSongIds();
    const votableIds = this.songService.getVotableSongIds();
    rows = applyLibraryOrder(rows, votableIds, voteCounts, sort, this.voteTieBreakMode);
    rows = rows.slice(offset, offset + limit);
    response.json({
      songs: rows.map((row) => ({
        id: row.id,
        title: row.title,
        author: row.author,
        coverUrl: row.coverUrl,
        youtubeUrl: row.youtubeUrl,
        durationSeconds: row.durationSeconds,
        status: row.status,
        createdAt: row.createdAt,
        voteCount: voteCounts[row.id]?.count ?? 0,
        totalVotes: row.totalVotes ?? 0,
        inEffectivePlaylist: allowedIds == null || allowedIds.includes(row.id),
        canVote: votableIds.includes(row.id),
      })),
    });
  };

  getRanking = (request: Request, response: Response): void => {
    const limit = Math.min(100, parseInt(String(request.query.limit || ""), 10) || 50);
    const rows = this.songService.listRanking(limit);
    response.json({
      songs: rows.map((row) => ({
        id: row.id,
        title: row.title,
        author: row.author,
        coverUrl: row.coverUrl,
        totalVotes: row.totalVotes ?? 0,
      })),
    });
  };

  getFile = (request: Request, response: Response): void => {
    if (routeParam(request, "id") === "library") {
      response.status(404).json({ message: "Not found" });
      return;
    }
    const song = this.songService.getById(routeParam(request, "id"));
    if (!song || song.status !== "verified" || !song.localPath || !fs.existsSync(song.localPath)) {
      response.status(404).json({ message: ErrorMessages.fileNotFound });
      return;
    }
    response.sendFile(path.resolve(song.localPath));
  };

  listPending = (_request: Request, response: Response): void => {
    response.json({
      songs: this.songService.listPendingReview().map((row) => ({
        id: row.id,
        title: row.title,
        author: row.author,
        coverUrl: row.coverUrl,
        youtubeUrl: row.youtubeUrl,
        durationSeconds: row.durationSeconds,
        status: row.status,
        createdAt: row.createdAt,
      })),
    });
  };

  deletePermanent = (request: Request, response: Response): void => {
    const id = routeParam(request, "id");
    console.log("[Admin] Permanent delete requested for song id:", id);
    const song = this.songService.getById(id);
    if (!song) {
      console.log("[Admin] Song not found:", id);
      response.status(404).json({ message: ErrorMessages.notFound });
      return;
    }
    if (song.status !== "verified") {
      response.status(400).json({ message: ErrorMessages.onlyVerifiedPermanentDelete });
      return;
    }
    this.verification.cancel(id);
    this.songService.delete(id, { songsDir: this.songsDir, fileStore: this.fileStore });
    this.queueManager.refreshQueueFile();
    this.realtime?.publish({ event: "library:updated", songId: id });
    console.log("[Admin] Song removed from DB:", id);
    response.json({ success: true });
  };

  deletePending = (request: Request, response: Response): void => {
    const id = routeParam(request, "id");
    const song = this.songService.getById(id);
    if (!song) {
      response.status(404).json({ message: ErrorMessages.notFound });
      return;
    }
    if (song.status === "verified") {
      response.status(400).json({ message: ErrorMessages.verifiedNeedsPermanentDelete });
      return;
    }
    this.verification.cancel(id);
    this.songService.delete(id, { songsDir: this.songsDir, fileStore: this.fileStore });
    this.queueManager.refreshQueueFile();
    this.realtime?.publish({ event: "requests:updated", songId: id });
    this.realtime?.publish({ event: "downloads:updated", songId: id });
    response.json({ success: true });
  };

  setQueueVotes = (request: Request, response: Response): void => {
    const id = routeParam(request, "id");
    const { count } = request.body || {};
    const song = this.songService.getById(id);
    if (!song) {
      response.status(404).json({ message: ErrorMessages.notFound });
      return;
    }
    const parsed = typeof count === "number" ? count : Number.parseInt(String(count), 10);
    const votes = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    this.voteService.setQueueOverride(id, votes);
    this.queueManager.refreshQueueFile();
    response.json({ success: true, count: votes });
  };

  verify = (request: Request, response: Response): void => {
    const id = routeParam(request, "id");
    const { addToPlaylistId } = request.body || {};
    const song = this.songService.getById(id);
    if (!song) {
      response.status(404).json({ message: ErrorMessages.notFound });
      return;
    }
    if (this.verification.isBusy(id)) {
      response.status(400).json({ message: ErrorMessages.downloadInProgress });
      return;
    }
    if (song.status === "verified") {
      response.status(400).json({ message: ErrorMessages.alreadyVerified });
      return;
    }
    this.verification.start(id, addToPlaylistId || null);
    this.realtime?.publish({ event: "downloads:updated", songId: id });
    response.json({ success: true });
  };

  getDownloadQueue = (_request: Request, response: Response): void => {
    response.json(this.verification.getQueue());
  };

  getDownloadStatus = (request: Request, response: Response): void => {
    const id = routeParam(request, "id");
    const status = this.verification.getStatus(id);
    if (!status) {
      response.status(404).json({ message: ErrorMessages.notFound });
      return;
    }
    response.json(status);
  };
}
