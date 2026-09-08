import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { DataLayerFactory } from "../../src/factories/dataLayerFactory.js";
import { openDatabase } from "../../src/repositories/sqliteDatabase.js";
import type { IDatabase } from "../../src/interfaces/IDatabase.js";
import { QueueController } from "../../src/controllers/queueController.js";
import { QueueManager } from "../../src/services/queueManager.js";
import { PlayerFFMPEG } from "../../src/services/playerFfmpeg.js";
import { SlotSchedule } from "../../src/services/slotSchedule.js";
import { CountingFileStore, FixedClock, atLocalTime } from "../helpers/testDoubles.js";

class HangingProcess extends EventEmitter {
  stdout = new PassThrough();
  killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

describe("QueueController polling", () => {
  let database: IDatabase | undefined;
  let player: PlayerFFMPEG | undefined;

  afterEach(() => {
    player?.dispose();
    database?.close();
  });

  it("sequential GET /queue requests do not write queue.json while the player ticker is running", async () => {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    const fileStore = new CountingFileStore();
    const clock = new FixedClock(atLocalTime(8, 47));
    for (let index = 0; index < 12; index += 1) {
      const filePath = `/tmp/poll-real-${index}.mp3`;
      fileStore.addSongFile(filePath);
      const id = layer.songService.createPending({
        title: `P${index}`,
        author: "A",
        coverUrl: null,
        youtubeUrl: `https://www.youtube.com/watch?v=${index.toString().padStart(11, "p")}`,
      });
      layer.songService.markVerified(id, filePath, `P${index}`, "A", null, 90);
    }

    const queueManager = new QueueManager({
      songService: layer.songService,
      voteService: layer.voteService,
      playlistService: layer.playlistService,
      slotSchedule: new SlotSchedule([{ start: "08:45", end: "08:50" }], clock),
      queueFilePath: "/tmp/queue.json",
      fileStore,
      clock,
      random: () => 0.35,
      randomMinRemaining: 10,
      randomFillSize: 10,
    });
    const refreshSpy = vi.spyOn(queueManager, "refreshQueueFile");
    queueManager.refreshQueueFile();
    refreshSpy.mockClear();

    player = new PlayerFFMPEG({
      queueManager,
      songService: layer.songService,
      slotSchedule: new SlotSchedule([{ start: "08:45", end: "08:50" }], clock),
      fadeOutSecondsBeforeEnd: 5,
      ffplayPath: "ffplay",
      ffmpegPath: "ffmpeg",
      clock,
      fileStore,
      intervalMs: 10,
      spawnProcess: () => new HangingProcess() as never,
    });
    player.play();
    player.tick();
    await vi.waitFor(() => expect(player?.getStatus().nowPlaying?.songId).toBeTruthy());

    const writesAfterPlaybackStart = fileStore.writes;
    const snapshot = fileStore.readFile("/tmp/queue.json");
    const controller = new QueueController(queueManager, player);
    const bodies: Array<{ queue: Array<{ songId: string }> }> = [];
    const response = {
      json(payload: { queue: Array<{ songId: string }> }) {
        bodies.push(payload);
        return this;
      },
    } as unknown as Response;

    controller.getQueue({} as Request, response);
    player.tick();
    controller.getPublicQueue({} as Request, response);
    player.tick();
    controller.getQueue({} as Request, response);

    expect(refreshSpy).not.toHaveBeenCalled();
    expect(fileStore.writes).toBe(writesAfterPlaybackStart);
    expect(fileStore.readFile("/tmp/queue.json")).toBe(snapshot);
    const songIds = (body: { queue: Array<{ songId: string }> }) => body.queue.map((item) => item.songId);
    expect(songIds(bodies[1]!)).toEqual(songIds(bodies[0]!));
    expect(songIds(bodies[2]!)).toEqual(songIds(bodies[0]!));
    expect(new Set(songIds(bodies[0]!)).size).toBe(songIds(bodies[0]!).length);
  });
});
