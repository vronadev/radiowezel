import type { SongStatus } from "../@types/models.js";
import type { IDownloader } from "../interfaces/IDownloader.js";
import type { IEmailService } from "../interfaces/IEmailService.js";
import type { IFileStore } from "../interfaces/IFileStore.js";
import {
  DEFAULT_DOWNLOAD_MAX_ATTEMPTS,
  DEFAULT_DOWNLOAD_MAX_CONCURRENCY,
  DEFAULT_DOWNLOAD_RETRY_DELAY_MS,
  isUnrecoverableYoutubeError,
} from "../constants/downloadQueue.js";
import { logEvent } from "./logger.js";
import { NodeFileStore } from "./nodeFileStore.js";
import type { PlaylistService } from "./playlistService.js";
import type { QueueManager } from "./queueManager.js";
import { purgeSongMediaFiles } from "./songMediaCleanup.js";
import type { SongRequestService } from "./songRequestService.js";
import type { SongService } from "./songService.js";
import type { UserService } from "./userService.js";
import type { IRealtimeHub } from "../realtime/events.js";

export type DownloadJobPublicStatus =
  | "pending"
  | "scheduled_for_download"
  | "downloading"
  | "failed"
  | "verified";

export interface DownloadJobStatus {
  songId: string;
  status: DownloadJobPublicStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
}

export interface DownloadQueueItem {
  songId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  youtubeUrl: string;
  status: "scheduled_for_download" | "downloading" | "failed";
  queuePosition: number | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
}

export interface DownloadQueueSnapshot {
  maxConcurrency: number;
  activeCount: number;
  queuedCount: number;
  items: DownloadQueueItem[];
}

export interface DownloadQueueOptions {
  maxConcurrency?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  fileStore?: IFileStore;
  sleep?: (ms: number) => Promise<void>;
  email?: IEmailService;
  songRequestService?: SongRequestService;
  userService?: UserService;
  votePageUrl?: string;
  realtime?: IRealtimeHub;
}

interface DownloadJob {
  songId: string;
  addToPlaylistId: string | null;
}

function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class SongVerificationService {
  private readonly maxConcurrency: number;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly fileStore: IFileStore;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly email?: IEmailService;
  private readonly songRequestService?: SongRequestService;
  private readonly userService?: UserService;
  private readonly votePageUrl?: string;
  private readonly realtime?: IRealtimeHub;
  private readonly queue: DownloadJob[] = [];
  private readonly queuedIds = new Set<string>();
  private readonly activeIds = new Set<string>();
  private readonly retryingIds = new Set<string>();
  private readonly cancelledIds = new Set<string>();
  private readonly attempts = new Map<string, number>();
  private readonly lastError = new Map<string, string>();
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly songService: SongService,
    private readonly playlistService: PlaylistService,
    private readonly queueManager: QueueManager,
    private readonly downloader: IDownloader,
    private readonly songsDir: string,
    private readonly ffmpegLocation?: string,
    options: DownloadQueueOptions = {},
  ) {
    this.maxConcurrency = options.maxConcurrency ?? DEFAULT_DOWNLOAD_MAX_CONCURRENCY;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_DOWNLOAD_MAX_ATTEMPTS;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_DOWNLOAD_RETRY_DELAY_MS;
    this.fileStore = options.fileStore ?? new NodeFileStore();
    this.sleep = options.sleep ?? defaultSleep;
    this.email = options.email;
    this.songRequestService = options.songRequestService;
    this.userService = options.userService;
    this.votePageUrl = options.votePageUrl;
    this.realtime = options.realtime;
  }

  start(songId: string, addToPlaylistId: string | null = null): void {
    const song = this.songService.getById(songId);
    if (!song || song.status === "verified") {
      return;
    }
    this.cancelledIds.delete(songId);
    if (this.isBusy(songId)) {
      return;
    }
    if (song.status === "failed") {
      this.attempts.delete(songId);
    }
    this.enqueue({ songId, addToPlaylistId });
    logEvent("download", "enqueued", { songId, addToPlaylistId });
    this.realtime?.publish({ event: "downloads:updated", songId });
    this.pump();
  }

  recover(): void {
    const stuck = this.songService.listStuckDownloads();
    for (const song of stuck) {
      this.start(song.id);
    }
  }

  getQueue(): DownloadQueueSnapshot {
    const items: DownloadQueueItem[] = [];
    const seen = new Set<string>();
    const push = (
      songId: string,
      status: DownloadQueueItem["status"],
      queuePosition: number | null,
    ): void => {
      if (seen.has(songId)) {
        return;
      }
      const song = this.songService.getById(songId);
      if (!song || song.status === "verified") {
        return;
      }
      seen.add(songId);
      items.push({
        songId,
        title: song.title,
        author: song.author,
        coverUrl: song.coverUrl,
        youtubeUrl: song.youtubeUrl,
        status,
        queuePosition,
        attempts: this.attempts.get(songId) ?? 0,
        maxAttempts: this.maxAttempts,
        lastError: this.lastError.get(songId) ?? null,
      });
    };

    for (const songId of this.activeIds) {
      push(songId, "downloading", null);
    }
    for (const songId of this.retryingIds) {
      push(songId, "scheduled_for_download", null);
    }
    this.queue.forEach((job, index) => {
      push(job.songId, "scheduled_for_download", index + 1);
    });
    for (const song of this.songService.listDownloadCandidates()) {
      const status =
        song.status === "downloading"
          ? "downloading"
          : song.status === "failed"
            ? "failed"
            : "scheduled_for_download";
      push(song.id, status, null);
    }

    return {
      maxConcurrency: this.maxConcurrency,
      activeCount: this.activeIds.size,
      queuedCount: this.queue.length + this.retryingIds.size,
      items,
    };
  }

  cancel(songId: string): void {
    this.cancelledIds.add(songId);
    this.removeFromQueue(songId);
    this.retryingIds.delete(songId);
    this.notifyIdle();
  }

  isBusy(songId: string): boolean {
    return this.activeIds.has(songId) || this.queuedIds.has(songId) || this.retryingIds.has(songId);
  }

  getStatus(songId: string): DownloadJobStatus | null {
    const song = this.songService.getById(songId);
    if (!song) {
      return null;
    }
    return {
      songId,
      status: this.mapSongStatus(songId, song.status),
      attempts: this.attempts.get(songId) ?? 0,
      maxAttempts: this.maxAttempts,
      lastError: this.lastError.get(songId) ?? null,
    };
  }

  waitForIdle(): Promise<void> {
    if (this.isIdle()) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  async verify(songId: string, addToPlaylistId: string | null = null): Promise<void> {
    await this.runAttempt(songId, addToPlaylistId, { retry: false });
  }

  private mapSongStatus(songId: string, status: SongStatus): DownloadJobPublicStatus {
    if (status === "verified") {
      return "verified";
    }
    if (this.activeIds.has(songId) || status === "downloading") {
      return "downloading";
    }
    if (this.isBusy(songId) || status === "scheduled_for_download") {
      return "scheduled_for_download";
    }
    if (status === "failed") {
      return "failed";
    }
    return "pending";
  }

  private isIdle(): boolean {
    return this.activeIds.size === 0 && this.queue.length === 0 && this.retryingIds.size === 0;
  }

  private notifyIdle(): void {
    if (!this.isIdle()) {
      return;
    }
    const waiters = this.idleWaiters.splice(0);
    for (const waiter of waiters) {
      waiter();
    }
  }

  private enqueue(job: DownloadJob): void {
    if (this.queuedIds.has(job.songId) || this.activeIds.has(job.songId)) {
      return;
    }
    this.queuedIds.add(job.songId);
    this.queue.push(job);
    const song = this.songService.getById(job.songId);
    if (song && song.status !== "verified" && song.status !== "downloading") {
      this.songService.updateStatus(job.songId, "scheduled_for_download");
    }
  }

  private removeFromQueue(songId: string): void {
    const index = this.queue.findIndex((job) => job.songId === songId);
    if (index >= 0) {
      this.queue.splice(index, 1);
    }
    this.queuedIds.delete(songId);
  }

  private pump(): void {
    while (this.activeIds.size < this.maxConcurrency && this.queue.length > 0) {
      const job = this.queue.shift();
      if (!job) {
        break;
      }
      this.queuedIds.delete(job.songId);
      if (this.cancelledIds.has(job.songId)) {
        continue;
      }
      this.activeIds.add(job.songId);
      void this.runQueuedJob(job)
        .then((shouldRetry) => {
          this.activeIds.delete(job.songId);
          if (shouldRetry) {
            this.scheduleRetry(job);
          }
          this.pump();
          this.notifyIdle();
        })
        .catch(() => {
          this.activeIds.delete(job.songId);
          this.pump();
          this.notifyIdle();
        });
    }
    this.notifyIdle();
  }

  private async runQueuedJob(job: DownloadJob): Promise<boolean> {
    return this.runAttempt(job.songId, job.addToPlaylistId, { retry: true });
  }

  private scheduleRetry(job: DownloadJob): void {
    this.retryingIds.add(job.songId);
    void this.sleep(this.retryDelayMs).then(() => {
      this.retryingIds.delete(job.songId);
      if (!this.cancelledIds.has(job.songId) && this.songService.getById(job.songId)) {
        this.songService.updateStatus(job.songId, "scheduled_for_download");
        this.enqueue(job);
      }
      this.pump();
      this.notifyIdle();
    });
  }

  private async runAttempt(
    songId: string,
    addToPlaylistId: string | null,
    options: { retry: boolean },
  ): Promise<boolean> {
    if (this.cancelledIds.has(songId)) {
      return false;
    }
    const song = this.songService.getById(songId);
    if (!song || song.status === "verified") {
      return false;
    }
    if (!options.retry && song.status === "downloading") {
      return false;
    }
    this.songService.updateStatus(songId, "downloading");
    const attempt = (this.attempts.get(songId) ?? 0) + 1;
    this.attempts.set(songId, attempt);
    logEvent("download", "attempt_started", { songId, attempt });
    try {
      const result = await this.downloader.downloadAsMp3(song.youtubeUrl, this.songsDir, {
        ffmpegLocation: this.ffmpegLocation,
      });
      if (this.cancelledIds.has(songId) || !this.songService.getById(songId)) {
        this.fileStore.unlink(result.filePath);
        purgeSongMediaFiles({ ...song, localPath: result.filePath }, this.songsDir, this.fileStore);
        return false;
      }
      this.songService.markVerified(
        songId,
        result.filePath,
        result.title,
        result.author,
        result.coverUrl,
        result.durationSeconds,
      );
      if (addToPlaylistId) {
        try {
          this.playlistService.addSongIfMissing(addToPlaylistId, songId, "manual");
        } catch {
          // Match legacy: ignore playlist insert failures after verify.
        }
      }
      this.queueManager.refreshQueueFile();
      this.lastError.delete(songId);
      await this.notifyRequestersAndPurge(songId, result.title);
      logEvent("download", "verified", { songId, title: result.title, attempt });
      this.realtime?.publish({ event: "downloads:updated", songId });
      this.realtime?.publish({ event: "library:updated", songId, title: result.title });
      this.realtime?.publish({ event: "requests:updated", songId });
      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logEvent("download", "attempt_failed", { songId, attempt, error: message });
      this.lastError.set(songId, message);
      if (this.cancelledIds.has(songId) || !this.songService.getById(songId)) {
        return false;
      }
      if (isUnrecoverableYoutubeError(message)) {
        this.dropUnavailableSong(songId, message);
        return false;
      }
      if (options.retry && attempt < this.maxAttempts) {
        return true;
      }
      this.songService.updateStatus(songId, "failed");
      logEvent("download", "failed", { songId, attempt, error: message });
      this.realtime?.publish({ event: "downloads:updated", songId });
      return false;
    }
  }

  private dropUnavailableSong(songId: string, reason: string): void {
    logEvent("download", "dropped_unrecoverable", { songId, reason });
    this.cancel(songId);
    this.attempts.delete(songId);
    this.lastError.delete(songId);
    this.songService.delete(songId, { songsDir: this.songsDir, fileStore: this.fileStore });
    this.queueManager.refreshQueueFile();
    this.realtime?.publish({ event: "downloads:updated", songId });
    this.realtime?.publish({ event: "library:updated", songId });
    this.realtime?.publish({ event: "requests:updated", songId });
  }

  private async notifyRequestersAndPurge(songId: string, songTitle: string): Promise<void> {
    const requestService = this.songRequestService;
    if (!requestService) {
      return;
    }
    const userIds = requestService.listRequesterUserIds(songId);
    const emails = new Set<string>();
    for (const userId of userIds) {
      const email = this.userService?.findById(userId)?.email;
      if (email) {
        emails.add(email);
      }
    }
    const voteUrl = this.votePageUrl || "/vote";
    for (const email of emails) {
      try {
        await this.email?.sendSongApproved(email, songTitle, voteUrl);
      } catch (error) {
        logEvent("email", "song_approved_failed", {
          songId,
          email,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    requestService.deleteBySongId(songId);
    logEvent("song-requests", "approved_and_purged", { songId, notified: emails.size });
  }
}
