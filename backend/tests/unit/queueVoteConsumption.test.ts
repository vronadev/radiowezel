import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataLayerFactory } from "../../src/factories/dataLayerFactory.js";
import { openDatabase } from "../../src/repositories/sqliteDatabase.js";
import type { IDatabase } from "../../src/interfaces/IDatabase.js";
import { QueueManager } from "../../src/services/queueManager.js";
import { PlayerFFMPEG } from "../../src/services/playerFfmpeg.js";
import { SlotSchedule } from "../../src/services/slotSchedule.js";
import { CountingFileStore, FixedClock, atLocalTime } from "../helpers/testDoubles.js";

class ControllableProcess extends EventEmitter {
  stdout = new PassThrough();
  killed = false;

  kill(): boolean {
    this.killed = true;
    this.emit("close", 1);
    return true;
  }
}

describe("queue vote consumption", () => {
  let database: IDatabase | undefined;
  let player: PlayerFFMPEG | undefined;

  afterEach(() => {
    player?.dispose();
    database?.close();
  });

  function setup() {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    const fileStore = new CountingFileStore();
    const clock = new FixedClock(atLocalTime(8, 47));
    const userId = layer.userService.create("user@zsi.kielce.pl", "hash", false);
    const songA = createSong(layer, fileStore, "A", "aaaaaaaaaaa", 90);
    const songB = createSong(layer, fileStore, "B", "bbbbbbbbbbb", 90);
    layer.voteService.addVote(userId, songA);
    layer.voteService.addVote(userId, songA);
    layer.voteService.addVote(userId, songB);

    const queueManager = new QueueManager({
      songService: layer.songService,
      voteService: layer.voteService,
      playlistService: layer.playlistService,
      slotSchedule: new SlotSchedule([{ start: "08:45", end: "08:50" }], clock),
      queueFilePath: "/tmp/queue.json",
      fileStore,
      clock,
      random: () => 0,
    });
    queueManager.refreshQueueFile();
    expect(queueManager.readQueueFile().queue[0]?.songId).toBe(songA);

    return { layer, fileStore, clock, queueManager, songA, songB };
  }

  it("clears current votes after a song completes so it does not immediately replay", async () => {
    const { layer, fileStore, clock, queueManager, songA, songB } = setup();
    const processes: ControllableProcess[] = [];
    player = new PlayerFFMPEG({
      queueManager,
      songService: layer.songService,
      slotSchedule: new SlotSchedule([{ start: "08:45", end: "08:50" }], clock),
      fadeOutSecondsBeforeEnd: 5,
      ffplayPath: "ffplay",
      ffmpegPath: "ffmpeg",
      clock,
      fileStore,
      spawnProcess: () => {
        const proc = new ControllableProcess();
        processes.push(proc);
        return proc as never;
      },
    });

    player.tick();
    await vi.waitFor(() => expect(player?.getStatus().nowPlaying?.songId).toBe(songA));
    processes[0]?.emit("close", 0);
    await vi.waitFor(() => expect(player?.getStatus().nowPlaying).toBeNull());

    expect(layer.voteService.getVotesBySong()[songA]).toBeUndefined();
    expect(layer.songService.getById(songA)?.totalVotes).toBe(2);
    expect(layer.voteService.getVotesBySong()[songB]?.count).toBe(1);
    expect(queueManager.readQueueFile().queue[0]?.songId).toBe(songB);
  });

  it("clears current votes when the playing song is skipped", async () => {
    const { layer, fileStore, clock, queueManager, songA, songB } = setup();
    player = new PlayerFFMPEG({
      queueManager,
      songService: layer.songService,
      slotSchedule: new SlotSchedule([{ start: "08:45", end: "08:50" }], clock),
      fadeOutSecondsBeforeEnd: 5,
      ffplayPath: "ffplay",
      ffmpegPath: "ffmpeg",
      clock,
      fileStore,
      spawnProcess: () => new ControllableProcess() as never,
    });

    player.tick();
    await vi.waitFor(() => expect(player?.getStatus().nowPlaying?.songId).toBe(songA));
    player.skip();

    expect(player.getStatus().nowPlaying).toBeNull();
    expect(layer.voteService.getVotesBySong()[songA]).toBeUndefined();
    expect(layer.songService.getById(songA)?.totalVotes).toBe(2);
    expect(queueManager.readQueueFile().queue[0]?.songId).toBe(songB);
  });
});

function createSong(
  layer: ReturnType<typeof DataLayerFactory.create>,
  fileStore: CountingFileStore,
  label: string,
  videoId: string,
  durationSeconds: number,
): string {
  const filePath = `/tmp/vote-${label}.mp3`;
  fileStore.addSongFile(filePath);
  const id = layer.songService.createPending({
    title: label,
    author: "A",
    coverUrl: null,
    youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
  });
  layer.songService.markVerified(id, filePath, label, "A", null, durationSeconds);
  return id;
}
