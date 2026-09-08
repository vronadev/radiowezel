import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { DataLayerFactory } from "../../src/factories/dataLayerFactory.js";
import type { IDownloader } from "../../src/interfaces/IDownloader.js";
import type { IDatabase } from "../../src/interfaces/IDatabase.js";
import { openDatabase } from "../../src/repositories/sqliteDatabase.js";
import { SongController } from "../../src/controllers/songController.js";
import { SongVerificationService } from "../../src/services/songVerificationService.js";
import { MemoryFileStore } from "../helpers/testDoubles.js";

function youtubeUrl(index: number): string {
  return `https://www.youtube.com/watch?v=${index.toString().padStart(11, "d")}`;
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
  return response as typeof response & Response;
}

function mockRequest(id: string, body: Record<string, unknown> = {}): Request {
  return { params: { id }, body, query: {} } as unknown as Request;
}

describe("Song verification download queue", () => {
  let database: IDatabase | undefined;

  afterEach(() => {
    database?.close();
  });

  function setup(downloader: IDownloader, options: ConstructorParameters<typeof SongVerificationService>[6] = {}) {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    const songsDir = path.join("/tmp", "phase2-songs");
    const fileStore = new MemoryFileStore();
    const queueManager = { refreshQueueFile: vi.fn() };
    const verification = new SongVerificationService(
      layer.songService,
      layer.playlistService,
      queueManager as never,
      downloader,
      songsDir,
      undefined,
      { retryDelayMs: 0, maxConcurrency: 2, maxAttempts: 3, fileStore, ...options },
    );
    return { layer, verification, queueManager, songsDir, fileStore };
  }

  it("caps concurrent downloads at the configured bound", async () => {
    let current = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const downloader: IDownloader = {
      downloadAsMp3: vi.fn().mockImplementation(async () => {
        current += 1;
        peak = Math.max(peak, current);
        await new Promise<void>((resolve) => {
          releases.push(() => {
            current -= 1;
            resolve();
          });
        });
        return {
          filePath: "/tmp/ok.mp3",
          title: "T",
          author: "A",
          coverUrl: null,
          durationSeconds: 10,
        };
      }),
      getPlaylistEntries: vi.fn(),
    };
    const { layer, verification } = setup(downloader, { maxConcurrency: 2 });
    const ids = [0, 1, 2, 3].map((index) =>
      layer.songService.createPending({
        title: `S${index}`,
        author: "-",
        coverUrl: null,
        youtubeUrl: youtubeUrl(index),
      }),
    );
    for (const id of ids) {
      verification.start(id);
    }
    await vi.waitFor(() => expect(releases.length).toBe(2));
    expect(peak).toBe(2);
    expect(layer.songService.getById(ids[2]!)?.status).toBe("scheduled_for_download");
    expect(verification.getStatus(ids[2]!)?.status).toBe("scheduled_for_download");
    expect(verification.getStatus(ids[0]!)?.status).toBe("downloading");

    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(releases.length).toBe(2));
    expect(peak).toBe(2);
    releases.splice(0).forEach((release) => release());
    await verification.waitForIdle();
    expect(peak).toBe(2);
    expect(ids.every((id) => layer.songService.getById(id)?.status === "verified")).toBe(true);
  });

  it("retries failed downloads then marks failed after max attempts", async () => {
    const downloader: IDownloader = {
      downloadAsMp3: vi.fn().mockRejectedValue(new Error("network")),
      getPlaylistEntries: vi.fn(),
    };
    const { layer, verification } = setup(downloader, { maxAttempts: 3, retryDelayMs: 0 });
    const songId = layer.songService.createPending({
      title: "Fail",
      author: "-",
      coverUrl: null,
      youtubeUrl: youtubeUrl(9),
    });
    verification.start(songId);
    await verification.waitForIdle();
    expect(downloader.downloadAsMp3).toHaveBeenCalledTimes(3);
    expect(layer.songService.getById(songId)?.status).toBe("failed");
    const status = verification.getStatus(songId);
    expect(status).toMatchObject({
      songId,
      status: "failed",
      attempts: 3,
      maxAttempts: 3,
      lastError: "network",
    });
  });

  it("drops private and unavailable videos immediately without retrying", async () => {
    const downloader: IDownloader = {
      downloadAsMp3: vi.fn().mockImplementation(async (_url, _dir, _opts) => {
        throw new Error("Error code: 1\n\nStderr:\nERROR: [youtube] -bwLRCs5q1g: Private video");
      }),
      getPlaylistEntries: vi.fn(),
    };
    const { layer, verification, queueManager } = setup(downloader, { maxAttempts: 3, retryDelayMs: 0 });
    const playlistId = layer.playlistService.create("Import", null);
    const privateId = layer.songService.createScheduledForDownload({
      title: "Private",
      author: "-",
      coverUrl: null,
      youtubeUrl: "https://www.youtube.com/watch?v=-bwLRCs5q1g",
    });
    layer.playlistService.addSongIfMissing(playlistId, privateId, "youtube");
    verification.start(privateId, playlistId);
    await verification.waitForIdle();
    expect(downloader.downloadAsMp3).toHaveBeenCalledTimes(1);
    expect(layer.songService.getById(privateId)).toBeUndefined();
    expect(layer.playlistService.getSongs(playlistId)).toEqual([]);
    expect(verification.getQueue().items).toHaveLength(0);
    expect(verification.getStatus(privateId)).toBeNull();
    expect(queueManager.refreshQueueFile).toHaveBeenCalled();

    downloader.downloadAsMp3 = vi
      .fn()
      .mockRejectedValue(new Error("ERROR: [youtube] aaaaaaaaaaa: Video unavailable"));
    const missingId = layer.songService.createPending({
      title: "Gone",
      author: "-",
      coverUrl: null,
      youtubeUrl: youtubeUrl(4),
    });
    verification.start(missingId);
    await verification.waitForIdle();
    expect(downloader.downloadAsMp3).toHaveBeenCalledTimes(1);
    expect(layer.songService.getById(missingId)).toBeUndefined();
    expect(layer.songService.listPendingReview()).toEqual([]);
  });

  it("retries then succeeds before exhausting attempts", async () => {
    const downloader: IDownloader = {
      downloadAsMp3: vi
        .fn()
        .mockRejectedValueOnce(new Error("temp"))
        .mockRejectedValueOnce(new Error("temp"))
        .mockResolvedValue({
          filePath: "/tmp/ok.mp3",
          title: "Done",
          author: "Artist",
          coverUrl: null,
          durationSeconds: 40,
        }),
      getPlaylistEntries: vi.fn(),
    };
    const { layer, verification, queueManager } = setup(downloader, { maxAttempts: 3, retryDelayMs: 0 });
    const songId = layer.songService.createPending({
      title: "Retry",
      author: "-",
      coverUrl: null,
      youtubeUrl: youtubeUrl(8),
    });
    verification.start(songId);
    expect(["scheduled_for_download", "downloading"]).toContain(verification.getStatus(songId)?.status);
    await verification.waitForIdle();
    expect(downloader.downloadAsMp3).toHaveBeenCalledTimes(3);
    const song = layer.songService.getById(songId);
    expect(song?.status).toBe("verified");
    expect(song?.title).toBe("Done");
    expect(queueManager.refreshQueueFile).toHaveBeenCalled();
    expect(verification.getStatus(songId)?.status).toBe("verified");
  });

  it("does not start a second job for a song already queued", async () => {
    let resolveDownload: (() => void) | undefined;
    const downloader: IDownloader = {
      downloadAsMp3: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveDownload = () =>
              resolve({
                filePath: "/tmp/ok.mp3",
                title: "T",
                author: "A",
                coverUrl: null,
                durationSeconds: 10,
              });
          }),
      ),
      getPlaylistEntries: vi.fn(),
    };
    const { layer, verification } = setup(downloader);
    const songId = layer.songService.createPending({
      title: "Once",
      author: "-",
      coverUrl: null,
      youtubeUrl: youtubeUrl(1),
    });
    verification.start(songId);
    verification.start(songId);
    await vi.waitFor(() => expect(downloader.downloadAsMp3).toHaveBeenCalledTimes(1));
    resolveDownload?.();
    await verification.waitForIdle();
    expect(downloader.downloadAsMp3).toHaveBeenCalledTimes(1);
  });

  it("exposes download status on the new admin endpoint without changing pending payload shape", async () => {
    let resolveDownload: (() => void) | undefined;
    const downloader: IDownloader = {
      downloadAsMp3: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveDownload = () =>
              resolve({
                filePath: "/tmp/ok.mp3",
                title: "T",
                author: "A",
                coverUrl: null,
                durationSeconds: 10,
              });
          }),
      ),
      getPlaylistEntries: vi.fn(),
    };
    const { layer, verification, queueManager, songsDir, fileStore } = setup(downloader);
    const songId = layer.songService.createPending({
      title: "Pending",
      author: "-",
      coverUrl: null,
      youtubeUrl: youtubeUrl(2),
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

    const pendingRes = mockResponse();
    controller.listPending({} as Request, pendingRes);
    expect(pendingRes.body).toEqual({
      songs: [
        expect.objectContaining({
          id: songId,
          title: "Pending",
          author: "-",
          youtubeUrl: youtubeUrl(2),
          status: "pending",
        }),
      ],
    });

    const verifyRes = mockResponse();
    controller.verify(mockRequest(songId), verifyRes);
    expect(verifyRes.body).toEqual({ success: true });

    const busyRes = mockResponse();
    controller.verify(mockRequest(songId), busyRes);
    expect(busyRes.statusCode).toBe(400);

    await vi.waitFor(() =>
      expect(["scheduled_for_download", "downloading"]).toContain(verification.getStatus(songId)?.status),
    );
    const statusRes = mockResponse();
    controller.getDownloadStatus(mockRequest(songId), statusRes);
    expect(statusRes.body).toEqual(
      expect.objectContaining({
        songId,
        status: expect.stringMatching(/^(scheduled_for_download|downloading)$/),
        maxAttempts: 3,
      }),
    );

    const queueRes = mockResponse();
    controller.getDownloadQueue({} as Request, queueRes);
    const queueBody = queueRes.body as { items: { songId: string; status: string }[]; queuedCount: number; activeCount: number };
    expect(queueBody.items.some((item) => item.songId === songId)).toBe(true);
    expect(queueBody.activeCount + queueBody.queuedCount).toBeGreaterThan(0);

    resolveDownload?.();
    await verification.waitForIdle();
    const doneRes = mockResponse();
    controller.getDownloadStatus(mockRequest(songId), doneRes);
    expect(doneRes.body).toEqual(
      expect.objectContaining({
        songId,
        status: "verified",
      }),
    );
  });
});
