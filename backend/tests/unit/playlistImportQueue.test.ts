import { afterEach, describe, expect, it, vi } from "vitest";
import { DataLayerFactory } from "../../src/factories/dataLayerFactory.js";
import type { IDownloader } from "../../src/interfaces/IDownloader.js";
import type { IDatabase } from "../../src/interfaces/IDatabase.js";
import { openDatabase } from "../../src/repositories/sqliteDatabase.js";
import { PlaylistImportService } from "../../src/services/playlistImportService.js";
import { SongVerificationService } from "../../src/services/songVerificationService.js";

describe("YouTube playlist import download queue", () => {
  let database: IDatabase | undefined;

  afterEach(() => {
    database?.close();
  });

  it("bulk-enqueues imported tracks as scheduled_for_download and marks them verified after download", async () => {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    const releases: Array<() => void> = [];
    const downloader: IDownloader = {
      getPlaylistEntries: vi.fn().mockResolvedValue([
        { id: "aaaaaaaaaaa", url: "https://youtu.be/aaaaaaaaaaa", title: "One" },
        { id: "bbbbbbbbbbb", url: "https://youtu.be/bbbbbbbbbbb", title: "Two" },
        { id: "ccccccccccc", url: "https://youtu.be/ccccccccccc", title: "Three" },
      ]),
      downloadAsMp3: vi.fn().mockImplementation(async () => {
        await new Promise<void>((resolve) => {
          releases.push(resolve);
        });
        return {
          filePath: "/tmp/pl.mp3",
          title: "Downloaded",
          author: "Artist",
          coverUrl: null,
          durationSeconds: 30,
        };
      }),
    };
    const verification = new SongVerificationService(
      layer.songService,
      layer.playlistService,
      { refreshQueueFile: vi.fn() } as never,
      downloader,
      "/tmp/pl-songs",
      undefined,
      { maxConcurrency: 1, maxAttempts: 2, retryDelayMs: 0 },
    );
    const importer = new PlaylistImportService(
      layer.playlistService,
      layer.songService,
      { refreshQueueFile: vi.fn() } as never,
      downloader,
      { fetchYouTubeMetadata: vi.fn().mockResolvedValue(null) },
      verification,
    );

    const result = await importer.importFromYoutube("Poranna", "https://www.youtube.com/playlist?list=PLtest");
    expect(result.added).toBe(3);

    await vi.waitFor(() => expect(releases.length).toBe(1));
    const snapshot = verification.getQueue();
    expect(snapshot.items).toHaveLength(3);
    expect(snapshot.activeCount).toBe(1);
    expect(snapshot.queuedCount).toBe(2);
    expect(snapshot.items.filter((item) => item.status === "downloading")).toHaveLength(1);
    expect(snapshot.items.filter((item) => item.status === "scheduled_for_download")).toHaveLength(2);
    expect(
      Object.values(layer.songService.getSongsById()).some((song) => song.status === "scheduled_for_download"),
    ).toBe(true);

    for (let index = 0; index < 3; index += 1) {
      await vi.waitFor(() => expect(releases.length).toBeGreaterThan(0));
      releases.shift()?.();
    }
    await verification.waitForIdle();

    const verified = Object.values(layer.songService.getSongsById());
    expect(verified).toHaveLength(3);
    expect(verified.every((song) => song.status === "verified")).toBe(true);
    expect(verified.every((song) => song.title === "Downloaded")).toBe(true);
    expect(verification.getQueue().items).toHaveLength(0);
    expect(layer.songRequestService.listAggregates()).toEqual([]);
  });
});
