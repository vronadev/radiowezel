import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import type { NowPlaying, PlayerStatus } from "../@types/models.js";
import type { IAudioPlayer } from "../interfaces/IAudioPlayer.js";
import type { IClock } from "../interfaces/IClock.js";
import type { IFileStore } from "../interfaces/IFileStore.js";
import { buildFfplayArgs, planFfplayPlayback } from "./ffplayPlayback.js";
import { NodeFileStore } from "./nodeFileStore.js";
import type { QueueManager } from "./queueManager.js";
import type { SlotSchedule } from "./slotSchedule.js";
import type { SongService } from "./songService.js";
import { SystemClock } from "./systemClock.js";

export type ProcessSpawner = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface PlayerFfmpegOptions {
  queueManager: QueueManager;
  songService: SongService;
  slotSchedule: SlotSchedule;
  fadeOutSecondsBeforeEnd: number;
  ffplayPath: string;
  ffmpegPath: string;
  pulseAudioServer?: string;
  clock?: IClock;
  fileStore?: IFileStore;
  spawnProcess?: ProcessSpawner;
  intervalMs?: number;
  onSongStarted?: (entry: {
    songId: string;
    title: string;
    author: string;
    durationSeconds: number;
    startedAt: string;
  }) => void;
}

type PlaybackOutcome = "completed" | "aborted" | "failed";

export function safeKillProcess(proc: ChildProcess | null | undefined): void {
  if (!proc) {
    return;
  }
  try {
    if (proc.exitCode != null || proc.signalCode != null) {
      return;
    }
    proc.kill("SIGTERM");
  } catch {
    // Process may already have exited, or kill is unsupported.
  }
}

export class PlayerFFMPEG implements IAudioPlayer {
  private readonly queueManager: QueueManager;
  private readonly songService: SongService;
  private readonly slotSchedule: SlotSchedule;
  private readonly fadeOutSecondsBeforeEnd: number;
  private readonly ffplayPath: string;
  private readonly pulseAudioServer?: string;
  private readonly clock: IClock;
  private readonly fileStore: IFileStore;
  private readonly spawnProcess: ProcessSpawner;
  private readonly intervalMs: number;
  private readonly onSongStarted?: PlayerFfmpegOptions["onSongStarted"];

  private playProcess: ChildProcess | null = null;
  private lastPlayedSongId: string | null = null;
  private nowPlayingData: NowPlaying | null = null;
  private paused = false;
  private starting = false;
  private consumedSongId: string | null = null;
  private resumeOffsetSeconds = 0;
  private segmentStartOffsetSeconds = 0;
  private playbackGeneration = 0;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(options: PlayerFfmpegOptions) {
    this.queueManager = options.queueManager;
    this.songService = options.songService;
    this.slotSchedule = options.slotSchedule;
    this.fadeOutSecondsBeforeEnd = options.fadeOutSecondsBeforeEnd;
    this.ffplayPath = options.ffplayPath;
    this.pulseAudioServer = options.pulseAudioServer;
    this.clock = options.clock ?? new SystemClock();
    this.fileStore = options.fileStore ?? new NodeFileStore();
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.intervalMs = options.intervalMs ?? 1000;
    this.onSongStarted = options.onSongStarted;
  }

  play(): void {
    if (this.intervalHandle) {
      return;
    }
    this.intervalHandle = setInterval(() => {
      this.tick();
    }, this.intervalMs);
  }

  stop(): void {
    this.abortPlayback(false);
    this.clearNowPlaying();
    this.resumeOffsetSeconds = 0;
  }

  skip(): void {
    this.notifySongConsumed();
    this.abortPlayback(false);
    this.clearNowPlaying();
    this.resumeOffsetSeconds = 0;
  }

  pause(paused: boolean): void {
    this.paused = !!paused;
    if (this.paused && this.playProcess) {
      this.captureResumeOffset();
      this.abortPlayback(false);
    }
  }

  getStatus(): PlayerStatus {
    return {
      paused: this.paused,
      nowPlaying: this.nowPlayingData ?? this.queueManager.readQueueFile().nowPlaying,
    };
  }

  dispose(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.stop();
  }

  tick(): void {
    const inMusicWindow = this.slotSchedule.isMusicWindow();
    const endOfBreak = this.slotSchedule.getSlotEndSeconds();
    const now = this.slotSchedule.nowSeconds();
    const inFadeZone = endOfBreak != null && endOfBreak - now <= this.fadeOutSecondsBeforeEnd;

    if (this.playProcess) {
      if (!inMusicWindow) {
        this.abortPlayback(true);
        return;
      }
      return;
    }

    if (!inMusicWindow || this.paused || this.starting) {
      return;
    }
    if (inFadeZone && !this.nowPlayingData) {
      return;
    }

    this.starting = true;
    const generation = this.playbackGeneration;
    void this.playNext().finally(() => {
      if (generation === this.playbackGeneration) {
        this.starting = false;
      }
    });
  }

  private spawnEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    if (this.pulseAudioServer) {
      env.PULSE_SERVER = this.pulseAudioServer;
      env.SDL_AUDIODRIVER = env.SDL_AUDIODRIVER || "pulse";
    }
    return env;
  }

  private captureResumeOffset(): void {
    if (!this.nowPlayingData?.startedAt) {
      return;
    }
    const elapsed = Math.max(0, (this.clock.now().getTime() - new Date(this.nowPlayingData.startedAt).getTime()) / 1000);
    this.resumeOffsetSeconds = this.segmentStartOffsetSeconds + elapsed;
  }

  private abortPlayback(consume: boolean): void {
    this.playbackGeneration += 1;
    this.starting = false;
    const proc = this.playProcess;
    this.playProcess = null;
    safeKillProcess(proc);
    if (consume) {
      this.notifySongConsumed();
      this.clearNowPlaying();
      this.resumeOffsetSeconds = 0;
    }
  }

  private getNextSongToPlay(): (NowPlaying & { localPath: string }) | null {
    const songsById = this.songService.getSongsById();
    if (this.nowPlayingData) {
      const current = songsById[this.nowPlayingData.songId];
      if (current?.localPath && this.fileStore.exists(current.localPath)) {
        return {
          ...this.nowPlayingData,
          localPath: current.localPath,
          estimatedPlayAt: this.nowPlayingData.estimatedPlayAt,
        };
      }
    }

    const data = this.queueManager.readQueueFile();
    const queue = data.queue || [];
    const withPath = queue
      .map((item) => ({ ...item, song: songsById[item.songId] }))
      .filter((item) => item.song?.localPath && this.fileStore.exists(item.song.localPath));
    const next = withPath.find((item) => item.songId !== this.lastPlayedSongId) ?? withPath[0];
    return next && next.song?.localPath
      ? { ...next, localPath: next.song.localPath, estimatedPlayAt: next.estimatedPlayAt }
      : null;
  }

  private playMp3(args: string[]): Promise<PlaybackOutcome> {
    const generation = this.playbackGeneration;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (outcome: PlaybackOutcome): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (this.playProcess === proc) {
          this.playProcess = null;
        }
        resolve(outcome);
      };

      let proc: ChildProcess;
      try {
        proc = this.spawnProcess(this.ffplayPath, args, { stdio: "ignore", env: this.spawnEnv() });
      } catch (err) {
        console.error("[Player] spawn error:", err instanceof Error ? err.message : String(err));
        finish("failed");
        return;
      }

      this.playProcess = proc;
      proc.on("close", (code) => {
        if (generation !== this.playbackGeneration) {
          finish("aborted");
          return;
        }
        if (code === 0) {
          finish("completed");
          return;
        }
        finish(code == null ? "aborted" : "failed");
      });
      proc.on("error", (err) => {
        console.error("[Player] play error:", err instanceof Error ? err.message : String(err));
        if (generation !== this.playbackGeneration) {
          finish("aborted");
          return;
        }
        finish("failed");
      });
    });
  }

  private setNowPlaying(data: NowPlaying): void {
    this.nowPlayingData = data;
    this.queueManager.setNowPlaying(data);
  }

  private clearNowPlaying(): void {
    this.nowPlayingData = null;
    this.queueManager.setNowPlaying(null);
  }

  private async playNext(): Promise<void> {
    const next = this.getNextSongToPlay();
    if (!next) {
      this.clearNowPlaying();
      this.resumeOffsetSeconds = 0;
      return;
    }
    if (!this.fileStore.exists(next.localPath)) {
      console.error("[Player] missing file, skipping:", next.localPath);
      this.lastPlayedSongId = next.songId;
      this.clearNowPlaying();
      this.notifySongConsumed(next.songId);
      this.resumeOffsetSeconds = 0;
      return;
    }

    const startSeconds = this.nowPlayingData?.songId === next.songId ? this.resumeOffsetSeconds : 0;
    const isResume = this.nowPlayingData?.songId === next.songId;
    this.resumeOffsetSeconds = 0;
    this.lastPlayedSongId = next.songId;
    this.consumedSongId = this.nowPlayingData?.songId === next.songId ? this.consumedSongId : null;
    this.segmentStartOffsetSeconds = startSeconds;
    const startedAt = this.clock.now().toISOString();
    this.setNowPlaying({
      id: `now-${next.songId}`,
      songId: next.songId,
      title: next.title,
      author: next.author,
      coverUrl: next.coverUrl,
      votes: next.votes,
      position: 1,
      estimatedPlayAt: null,
      durationSeconds: next.durationSeconds,
      startedAt,
    });
    if (!isResume) {
      this.onSongStarted?.({
        songId: next.songId,
        title: next.title,
        author: next.author,
        durationSeconds: next.durationSeconds,
        startedAt,
      });
    }

    const remainingSlot = (() => {
      const endOfBreak = this.slotSchedule.getSlotEndSeconds();
      if (endOfBreak == null) {
        return null;
      }
      return Math.max(0, endOfBreak - this.slotSchedule.nowSeconds());
    })();
    const plan = planFfplayPlayback({
      filePath: next.localPath,
      startSeconds,
      songDurationSeconds: next.durationSeconds,
      remainingSlotSeconds: remainingSlot,
      fadeOutSecondsBeforeEnd: this.fadeOutSecondsBeforeEnd,
    });
    const outcome = await this.playMp3(buildFfplayArgs(plan));
    if (outcome === "completed") {
      this.notifySongConsumed();
      this.clearNowPlaying();
      this.resumeOffsetSeconds = 0;
      return;
    }
    if (outcome === "failed") {
      console.error("[Player] play error: ffplay failed");
      this.lastPlayedSongId = null;
      this.clearNowPlaying();
      this.resumeOffsetSeconds = 0;
    }
  }

  private notifySongConsumed(songId = this.nowPlayingData?.songId ?? this.lastPlayedSongId): void {
    if (!songId || this.consumedSongId === songId) {
      return;
    }
    this.consumedSongId = songId;
    this.queueManager.consumePlayedSong(songId);
  }
}
