import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { NowPlaying } from "../../src/@types/models.js";
import { DataLayerFactory } from "../../src/factories/dataLayerFactory.js";
import type { IDatabase } from "../../src/interfaces/IDatabase.js";
import { PlaylistController } from "../../src/controllers/playlistController.js";
import { QueueController } from "../../src/controllers/queueController.js";
import { openDatabase } from "../../src/repositories/sqliteDatabase.js";
import type { PlaylistImportService } from "../../src/services/playlistImportService.js";
import { PlayerFFMPEG } from "../../src/services/playerFfmpeg.js";
import { QueueManager } from "../../src/services/queueManager.js";
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

function mockResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return response;
}

describe("queue rebuild triggers", () => {
  let database: IDatabase | undefined;
  let player: PlayerFFMPEG | undefined;

  afterEach(() => {
    player?.dispose();
    database?.close();
  });

  it("rebuilds when playlist playback flags change and leaves the current track in place", () => {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    const fileStore = new CountingFileStore();
    const clock = new FixedClock(atLocalTime(12, 0));
    const filePath = "/tmp/flag-song.mp3";
    fileStore.addSongFile(filePath);
    const songId = layer.songService.createPending({
      title: "Flag",
      author: "A",
      coverUrl: null,
      youtubeUrl: "https://www.youtube.com/watch?v=flag0000001",
    });
    layer.songService.markVerified(songId, filePath, "Flag", "A", null, 90);
    const playlistId = layer.playlistService.create("Flags", null);

    const queueManager = new QueueManager({
      songService: layer.songService,
      voteService: layer.voteService,
      playlistService: layer.playlistService,
      slotSchedule: new SlotSchedule([], clock),
      queueFilePath: "/tmp/queue.json",
      fileStore,
      clock,
    });
    const nowPlaying: NowPlaying = {
      id: "now-flag",
      songId,
      title: "Flag",
      author: "A",
      coverUrl: null,
      votes: 1,
      position: 1,
      estimatedPlayAt: null,
      durationSeconds: 90,
      startedAt: clock.now().toISOString(),
    };
    queueManager.setNowPlaying(nowPlaying);
    const writesAfterNowPlaying = fileStore.writes;

    const controller = new PlaylistController(
      layer.playlistService,
      layer.songService,
      queueManager,
      {} as PlaylistImportService,
    );

    const rename = mockResponse();
    controller.update(
      { params: { id: playlistId }, body: { name: "Renamed" } } as unknown as Request,
      rename as unknown as Response,
    );
    expect(fileStore.writes).toBe(writesAfterNowPlaying);
    expect(queueManager.readQueueFile().nowPlaying?.songId).toBe(songId);

    const flags = mockResponse();
    controller.update(
      { params: { id: playlistId }, body: { excludeFromRandom: true } } as unknown as Request,
      flags as unknown as Response,
    );
    expect(fileStore.writes).toBeGreaterThan(writesAfterNowPlaying);
    expect(queueManager.readQueueFile().nowPlaying?.songId).toBe(songId);
    expect((flags.body as { success: boolean }).success).toBe(true);

    const voting = mockResponse();
    const writesBeforeVoting = fileStore.writes;
    controller.update(
      { params: { id: playlistId }, body: { excludeFromVoting: true } } as unknown as Request,
      voting as unknown as Response,
    );
    expect(fileStore.writes).toBeGreaterThan(writesBeforeVoting);
    expect(queueManager.readQueueFile().nowPlaying?.songId).toBe(songId);
  });

  it("POST rebuild recalculates the queue without stopping playback", async () => {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    const fileStore = new CountingFileStore();
    const clock = new FixedClock(atLocalTime(8, 47));
    const filePath = "/tmp/rebuild-song.mp3";
    fileStore.addSongFile(filePath);
    const songId = layer.songService.createPending({
      title: "Live",
      author: "A",
      coverUrl: null,
      youtubeUrl: "https://www.youtube.com/watch?v=rebuild0001",
    });
    layer.songService.markVerified(songId, filePath, "Live", "A", null, 120);

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

    const process = new HangingProcess();
    player = new PlayerFFMPEG({
      queueManager,
      songService: layer.songService,
      slotSchedule: new SlotSchedule([{ start: "08:45", end: "08:50" }], clock),
      fadeOutSecondsBeforeEnd: 5,
      ffplayPath: "ffplay",
      ffmpegPath: "ffmpeg",
      clock,
      fileStore,
      spawnProcess: () => process as never,
    });
    player.tick();
    await vi.waitFor(() => expect(player?.getStatus().nowPlaying?.songId).toBe(songId));

    const response = mockResponse();
    new QueueController(queueManager, player).rebuild({} as Request, response as unknown as Response);

    expect((response.body as { success: boolean }).success).toBe(true);
    expect(process.killed).toBe(false);
    expect(player.getStatus().nowPlaying?.songId).toBe(songId);
    expect(queueManager.readQueueFile().nowPlaying?.songId).toBe(songId);
  });
});
