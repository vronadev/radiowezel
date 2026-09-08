import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { DataLayerFactory } from "../../src/factories/dataLayerFactory.js";
import type { IDownloader } from "../../src/interfaces/IDownloader.js";
import type { IDatabase } from "../../src/interfaces/IDatabase.js";
import { openDatabase } from "../../src/repositories/sqliteDatabase.js";
import { SongController } from "../../src/controllers/songController.js";
import { QueueManager } from "../../src/services/queueManager.js";
import { SlotSchedule } from "../../src/services/slotSchedule.js";
import { SongVerificationService } from "../../src/services/songVerificationService.js";
import { FixedClock, MemoryFileStore, atLocalTime } from "../helpers/testDoubles.js";

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
  return response as typeof response & Response;
}

function mockRequest(id: string): Request {
  return { params: { id }, body: {}, query: {} } as unknown as Request;
}

describe("Cascading song deletion", () => {
  let database: IDatabase | undefined;

  afterEach(() => {
    database?.close();
  });

  it("removes votes, playlist links, queue overrides, and media files including sibling formats", () => {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    const songsDir = path.join("/tmp", "cascade-songs");
    const fileStore = new MemoryFileStore();
    const videoId = "dQw4w9wgGcQ";
    const mp3Path = path.join(songsDir, `${videoId}.mp3`);
    const webpPath = path.join(songsDir, `${videoId}.webp`);
    const jpgPath = path.join(songsDir, `${videoId}.jpg`);
    fileStore.addSongFile(mp3Path);
    fileStore.addSongFile(webpPath);
    fileStore.addSongFile(jpgPath);

    const songId = layer.songService.createPending({
      title: "Rick",
      author: "Astley",
      coverUrl: null,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
    });
    layer.songService.markVerified(songId, mp3Path, "Rick", "Astley", null, 213);

    const playlistId = layer.playlistService.create("Hits", null);
    layer.playlistService.addSong(playlistId, songId, "manual");
    const userId = layer.userService.create("user@zsi.kielce.pl", "hash", false);
    layer.voteService.addVote(userId, songId);
    layer.voteService.setQueueOverride(songId, 7);
    layer.songRequestService.add(userId, songId, `https://www.youtube.com/watch?v=${videoId}`);

    const queueManager = new QueueManager({
      songService: layer.songService,
      voteService: layer.voteService,
      playlistService: layer.playlistService,
      slotSchedule: new SlotSchedule([{ start: "12:00", end: "12:10" }], new FixedClock(atLocalTime(12, 1))),
      queueFilePath: "/tmp/cascade-queue.json",
      fileStore,
      clock: new FixedClock(atLocalTime(12, 1)),
      random: () => 0,
      randomMinRemaining: 1,
      randomFillSize: 1,
    });
    queueManager.refreshQueueFile();
    expect(queueManager.readQueueFile().queue.some((item) => item.songId === songId)).toBe(true);

    const verification = new SongVerificationService(
      layer.songService,
      layer.playlistService,
      queueManager,
      { downloadAsMp3: vi.fn(), getPlaylistEntries: vi.fn() } as IDownloader,
      songsDir,
      undefined,
      { fileStore, retryDelayMs: 0 },
    );
    const controller = new SongController(
      layer.songService,
      layer.voteService,
      layer.playlistService,
      queueManager,
      verification,
      songsDir,
      fileStore,
    );

    const response = mockResponse();
    controller.deletePermanent(mockRequest(songId), response);
    expect(response.body).toEqual({ success: true });
    expect(layer.songService.getById(songId)).toBeUndefined();
    expect(layer.playlistService.getSongs(playlistId)).toEqual([]);
    expect(layer.voteService.getVotesBySong()[songId]).toBeUndefined();
    expect(fileStore.exists(mp3Path)).toBe(false);
    expect(fileStore.exists(webpPath)).toBe(false);
    expect(fileStore.exists(jpgPath)).toBe(false);
    expect(queueManager.readQueueFile().queue.some((item) => item.songId === songId)).toBe(false);
    expect(
      database
        ?.prepare<{ c: number }>("SELECT COUNT(*) as c FROM playlist_songs WHERE song_id = ?")
        .get(songId)?.c,
    ).toBe(0);
    expect(database?.prepare<{ c: number }>("SELECT COUNT(*) as c FROM votes WHERE song_id = ?").get(songId)?.c).toBe(
      0,
    );
    expect(
      database
        ?.prepare<{ c: number }>("SELECT COUNT(*) as c FROM song_queue_override WHERE song_id = ?")
        .get(songId)?.c,
    ).toBe(0);
    expect(
      database
        ?.prepare<{ c: number }>("SELECT COUNT(*) as c FROM song_requests WHERE song_id = ?")
        .get(songId)?.c,
    ).toBe(0);
  });

  it("cancels an in-flight download and does not leave files after pending delete", async () => {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    const songsDir = path.join("/tmp", "cascade-pending");
    const fileStore = new MemoryFileStore();
    const videoId = "aaaaaaaaaaa";
    const mp3Path = path.join(songsDir, `${videoId}.mp3`);
    let finishDownload: ((result: {
      filePath: string;
      title: string;
      author: string;
      coverUrl: null;
      durationSeconds: number;
    }) => void) | undefined;
    const downloader: IDownloader = {
      downloadAsMp3: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            finishDownload = resolve;
          }),
      ),
      getPlaylistEntries: vi.fn(),
    };
    const queueManager = { refreshQueueFile: vi.fn() };
    const verification = new SongVerificationService(
      layer.songService,
      layer.playlistService,
      queueManager as never,
      downloader,
      songsDir,
      undefined,
      { fileStore, retryDelayMs: 0, maxConcurrency: 1 },
    );
    const songId = layer.songService.createPending({
      title: "Pending",
      author: "-",
      coverUrl: null,
      youtubeUrl: `https://youtu.be/${videoId}`,
    });
    const controller = new SongController(
      layer.songService,
      layer.voteService,
      layer.playlistService,
      queueManager as never,
      verification,
      songsDir,
      fileStore,
    );

    verification.start(songId);
    await vi.waitFor(() => expect(downloader.downloadAsMp3).toHaveBeenCalledTimes(1));
    const deleteRes = mockResponse();
    controller.deletePending(mockRequest(songId), deleteRes);
    expect(deleteRes.body).toEqual({ success: true });
    expect(layer.songService.getById(songId)).toBeUndefined();

    fileStore.addSongFile(mp3Path);
    finishDownload?.({
      filePath: mp3Path,
      title: "Late",
      author: "A",
      coverUrl: null,
      durationSeconds: 12,
    });
    await verification.waitForIdle();
    expect(layer.songService.getById(songId)).toBeUndefined();
    expect(fileStore.exists(mp3Path)).toBe(false);
  });
});
