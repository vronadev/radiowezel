import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerFFMPEG, type PlayerFfmpegOptions, type ProcessSpawner } from "../../src/services/playerFfmpeg.js";
import { SlotSchedule } from "../../src/services/slotSchedule.js";
import type { QueueManager } from "../../src/services/queueManager.js";
import type { SongService } from "../../src/services/songService.js";
import type { NowPlaying, QueueItem, Song } from "../../src/@types/models.js";
import { FixedClock, MemoryFileStore, atLocalTime } from "../helpers/testDoubles.js";

class FakeProcess extends EventEmitter {
  stdout = new PassThrough();
  killed = false;
  exitCode: number | null = null;

  kill(): boolean {
    this.killed = true;
    this.exitCode = 1;
    this.emit("close", 1);
    return true;
  }
}

const queueItem: QueueItem = {
  id: "q-song-1-0",
  songId: "song-1",
  title: "Track",
  author: "Artist",
  coverUrl: null,
  votes: 3,
  position: 1,
  estimatedPlayAt: null,
  durationSeconds: 120,
};

const song: Song = {
  id: "song-1",
  title: "Track",
  author: "Artist",
  coverUrl: null,
  youtubeUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
  durationSeconds: 120,
  status: "verified",
  localPath: "/tmp/song-1.mp3",
  totalVotes: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
};

function createPlayer(options: {
  inBreak: boolean;
  spawnProcess: (...args: Parameters<ProcessSpawner>) => FakeProcess;
  onSongStarted?: PlayerFfmpegOptions["onSongStarted"];
}): { player: PlayerFFMPEG; consumed: string[] } {
  const clock = new FixedClock(atLocalTime(options.inBreak ? 8 : 7, 47));
  const fileStore = new MemoryFileStore();
  fileStore.addSongFile(song.localPath!);
  let storedNowPlaying: NowPlaying | null = null;
  const consumed: string[] = [];
  const player = new PlayerFFMPEG({
    queueManager: {
      refreshQueueFile: () => ({}),
      readQueueFile: () => ({ nowPlaying: storedNowPlaying, queue: [queueItem], updatedAt: null }),
      setNowPlaying: (value: NowPlaying | null) => {
        storedNowPlaying = value;
      },
      consumePlayedSong: (songId: string) => consumed.push(songId),
    } as unknown as QueueManager,
    songService: { getSongsById: () => ({ [song.id]: song }) } as unknown as SongService,
    slotSchedule: new SlotSchedule([{ start: "08:45", end: "08:50" }], clock),
    fadeOutSecondsBeforeEnd: 5,
    ffplayPath: "ffplay",
    ffmpegPath: "ffmpeg",
    pulseAudioServer: "tcp:host.docker.internal:4713",
    clock,
    fileStore,
    spawnProcess: options.spawnProcess as unknown as ProcessSpawner,
    onSongStarted: options.onSongStarted,
  });
  return { player, consumed };
}

describe("PlayerFFMPEG", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("play starts the scheduler once and stop clears nowPlaying", async () => {
    const processes: FakeProcess[] = [];
    const { player } = createPlayer({
      inBreak: true,
      spawnProcess: (command, _args, spawnOptions) => {
        expect(command).toBe("ffplay");
        expect(spawnOptions.env?.PULSE_SERVER).toBe("tcp:host.docker.internal:4713");
        expect(spawnOptions.env?.SDL_AUDIODRIVER).toBe("pulse");
        const proc = new FakeProcess();
        processes.push(proc);
        return proc;
      },
    });

    player.play();
    player.play();
    player.tick();
    await vi.waitFor(() => {
      expect(player.getStatus().nowPlaying?.songId).toBe("song-1");
    });
    expect(processes).toHaveLength(1);
    expect(player.getStatus().nowPlaying?.title).toBe("Track");

    player.stop();
    expect(processes[0]?.killed).toBe(true);
    expect(player.getStatus().nowPlaying).toBeNull();
    player.dispose();
  });

  it("does not spawn ffplay when paused or outside a break", () => {
    const spawned: string[] = [];
    const { player: paused } = createPlayer({
      inBreak: true,
      spawnProcess: (command) => {
        spawned.push(command);
        return new FakeProcess();
      },
    });
    paused.pause(true);
    paused.tick();
    expect(paused.getStatus().paused).toBe(true);

    const { player: idle } = createPlayer({
      inBreak: false,
      spawnProcess: (command) => {
        spawned.push(command);
        return new FakeProcess();
      },
    });
    idle.tick();
    expect(spawned).toEqual([]);
    paused.dispose();
    idle.dispose();
  });

  it("does not treat an ffplay crash as a successful play that rebuilds the queue", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const processes: FakeProcess[] = [];
    const { player, consumed } = createPlayer({
      inBreak: true,
      spawnProcess: () => {
        const proc = new FakeProcess();
        processes.push(proc);
        return proc;
      },
    });
    player.tick();
    await vi.waitFor(() => expect(processes).toHaveLength(1));
    processes[0]?.emit("close", 1);
    await vi.waitFor(() => expect(player.getStatus().nowPlaying).toBeNull());
    expect(consumed).toEqual([]);
    player.dispose();
    errorSpy.mockRestore();
  });

  it("skips a queued song whose file is missing", async () => {
    const clock = new FixedClock(atLocalTime(8, 47));
    const fileStore = new MemoryFileStore();
    fileStore.addSongFile("/tmp/song-2.mp3");
    const missingItem: QueueItem = { ...queueItem, id: "q-missing", songId: "missing", title: "Missing" };
    const playableItem: QueueItem = {
      ...queueItem,
      id: "q-song-2",
      songId: "song-2",
      title: "Playable",
    };
    const playableSong: Song = { ...song, id: "song-2", localPath: "/tmp/song-2.mp3", title: "Playable" };
    const missingSong: Song = { ...song, id: "missing", localPath: "/tmp/missing.mp3", title: "Missing" };
    let storedNowPlaying: NowPlaying | null = null;
    const processes: FakeProcess[] = [];
    const player = new PlayerFFMPEG({
      queueManager: {
        refreshQueueFile: () => ({}),
        readQueueFile: () => ({ nowPlaying: storedNowPlaying, queue: [missingItem, playableItem], updatedAt: null }),
        setNowPlaying: (value: NowPlaying | null) => {
          storedNowPlaying = value;
        },
        consumePlayedSong: () => {},
      } as unknown as QueueManager,
      songService: {
        getSongsById: () => ({ missing: missingSong, "song-2": playableSong }),
      } as unknown as SongService,
      slotSchedule: new SlotSchedule([{ start: "08:45", end: "08:50" }], clock),
      fadeOutSecondsBeforeEnd: 5,
      ffplayPath: "ffplay",
      ffmpegPath: "ffmpeg",
      clock,
      fileStore,
      spawnProcess: () => {
        const proc = new FakeProcess();
        processes.push(proc);
        return proc;
      },
    });

    player.tick();
    await vi.waitFor(() => expect(player.getStatus().nowPlaying?.songId).toBe("song-2"));
    expect(processes).toHaveLength(1);
    player.dispose();
  });

  it("asks the queue to consume a song after ffplay exits successfully", async () => {
    const processes: FakeProcess[] = [];
    const { player, consumed } = createPlayer({
      inBreak: true,
      spawnProcess: () => {
        const proc = new FakeProcess();
        processes.push(proc);
        return proc;
      },
    });
    player.tick();
    await vi.waitFor(() => expect(processes).toHaveLength(1));
    processes[0]?.emit("close", 0);
    await vi.waitFor(() => expect(consumed).toEqual(["song-1"]));
    expect(player.getStatus().nowPlaying).toBeNull();
    player.dispose();
  });

  it("kills ffplay without throwing when the process is already gone", async () => {
    const { player } = createPlayer({
      inBreak: true,
      spawnProcess: () => {
        const proc = new FakeProcess();
        proc.kill = () => {
          throw new Error("ESRCH");
        };
        return proc;
      },
    });
    player.tick();
    await vi.waitFor(() => expect(player.getStatus().nowPlaying?.songId).toBe("song-1"));
    expect(() => player.stop()).not.toThrow();
    player.dispose();
  });

  it("replays the same song after pause instead of skipping it", async () => {
    const spawnedArgs: string[][] = [];
    const { player } = createPlayer({
      inBreak: true,
      spawnProcess: (_command, args) => {
        spawnedArgs.push([...args]);
        return new FakeProcess();
      },
    });
    player.tick();
    await vi.waitFor(() => expect(player.getStatus().nowPlaying?.songId).toBe("song-1"));
    player.pause(true);
    expect(player.getStatus().paused).toBe(true);
    expect(player.getStatus().nowPlaying?.songId).toBe("song-1");
    player.pause(false);
    player.tick();
    await vi.waitFor(() => expect(spawnedArgs.length).toBe(2));
    expect(player.getStatus().nowPlaying?.songId).toBe("song-1");
    player.dispose();
  });

  it("logs a song only when playback starts, not when it resumes after pause", async () => {
    const onSongStarted = vi.fn();
    const { player } = createPlayer({
      inBreak: true,
      onSongStarted,
      spawnProcess: () => new FakeProcess(),
    });
    player.tick();
    await vi.waitFor(() => expect(player.getStatus().nowPlaying?.songId).toBe("song-1"));
    expect(onSongStarted).toHaveBeenCalledTimes(1);
    expect(onSongStarted).toHaveBeenCalledWith(
      expect.objectContaining({
        songId: "song-1",
        title: "Track",
        author: "Artist",
        durationSeconds: 120,
      }),
    );
    player.pause(true);
    player.pause(false);
    player.tick();
    await vi.waitFor(() => expect(player.getStatus().nowPlaying?.songId).toBe("song-1"));
    expect(onSongStarted).toHaveBeenCalledTimes(1);
    player.dispose();
  });

  it("starts ffplay with a live afade filter instead of a second ffmpeg clip", async () => {
    const clock = new FixedClock(atLocalTime(8, 49));
    const fileStore = new MemoryFileStore();
    fileStore.addSongFile(song.localPath!);
    let storedNowPlaying: NowPlaying | null = null;
    const spawned: Array<{ command: string; args: string[] }> = [];
    const player = new PlayerFFMPEG({
      queueManager: {
        refreshQueueFile: () => ({}),
        readQueueFile: () => ({ nowPlaying: storedNowPlaying, queue: [queueItem], updatedAt: null }),
        setNowPlaying: (value: NowPlaying | null) => {
          storedNowPlaying = value;
        },
        consumePlayedSong: () => {},
      } as unknown as QueueManager,
      songService: { getSongsById: () => ({ [song.id]: song }) } as unknown as SongService,
      slotSchedule: new SlotSchedule([{ start: "08:45", end: "08:50" }], clock),
      fadeOutSecondsBeforeEnd: 5,
      ffplayPath: "ffplay",
      ffmpegPath: "ffmpeg",
      clock,
      fileStore,
      spawnProcess: (command, args) => {
        spawned.push({ command, args: [...args] });
        return new FakeProcess();
      },
    });
    player.tick();
    await vi.waitFor(() => expect(spawned).toHaveLength(1));
    expect(spawned[0]?.command).toBe("ffplay");
    expect(spawned[0]?.args).toContain("-af");
    expect(spawned[0]?.args.some((arg) => arg.startsWith("afade=t=out:"))).toBe(true);
    expect(spawned.some((item) => item.command === "ffmpeg")).toBe(false);

    player.tick();
    expect(spawned).toHaveLength(1);
    player.dispose();
  });
});
