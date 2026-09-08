import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataLayerFactory } from "../../src/factories/dataLayerFactory.js";
import type { IDownloader } from "../../src/interfaces/IDownloader.js";
import { openDatabase } from "../../src/repositories/sqliteDatabase.js";
import {
  DownloadService,
  extractVideoId,
  type YtDlpClient,
} from "../../src/services/downloadService.js";
import { SongVerificationService } from "../../src/services/songVerificationService.js";

describe("DownloadService", () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    for (const dir of createdDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("extracts YouTube video ids from watch and short URLs", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9wgGcQ")).toBe("dQw4w9wgGcQ");
    expect(extractVideoId("https://youtu.be/dQw4w9wgGcQ")).toBe("dQw4w9wgGcQ");
    expect(extractVideoId("https://example.com")).toBeNull();
  });

  it("completes an MP3 download lifecycle from mocked yt-dlp output", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "dl-"));
    createdDirs.push(outDir);
    const videoId = "dQw4w9wgGcQ";
    const client: YtDlpClient = {
      exec() {
        const emitter = new EventEmitter() as EventEmitter & {
          ytDlpProcess?: { stdout?: NodeJS.ReadableStream };
        };
        const stdout = new PassThrough();
        emitter.ytDlpProcess = { stdout };
        queueMicrotask(() => {
          stdout.write(
            `${JSON.stringify({
              title: "Never Gonna Give You Up",
              uploader: "Rick",
              duration: 213.4,
              thumbnail: "https://img.example/cover.jpg",
            })}\n`,
          );
          fs.writeFileSync(path.join(outDir, `${videoId}.mp3`), "audio");
          emitter.emit("close", 0);
        });
        return emitter;
      },
      execPromise: async () => "",
    };

    const service = new DownloadService("/tmp/backend", "/usr/bin/ffmpeg", {
      createClient: () => client,
      resolveBinary: async () => "/usr/bin/yt-dlp",
    });

    const result = await service.downloadAsMp3(`https://www.youtube.com/watch?v=${videoId}`, outDir);
    expect(result).toEqual({
      filePath: path.join(outDir, `${videoId}.mp3`),
      title: "Never Gonna Give You Up",
      author: "Rick",
      coverUrl: "https://img.example/cover.jpg",
      durationSeconds: 213,
    });
  });

  it("rewrites ffmpeg failures and parses playlist entries", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "dl-"));
    createdDirs.push(outDir);
    const failing: YtDlpClient = {
      exec() {
        const emitter = new EventEmitter() as EventEmitter & {
          ytDlpProcess?: { stdout?: NodeJS.ReadableStream };
        };
        queueMicrotask(() => emitter.emit("error", new Error("ffmpeg is missing")));
        return emitter;
      },
      execPromise: async () =>
        [
          JSON.stringify({ id: "aaaaaaaaaaa", title: "One", url: "https://youtu.be/aaaaaaaaaaa" }),
          JSON.stringify({ id: "list", _type: "playlist", title: "ignore" }),
          "not-json",
        ].join("\n"),
    };

    const service = new DownloadService("/tmp/backend", undefined, {
      createClient: () => failing,
      resolveBinary: async () => "/usr/bin/yt-dlp",
    });

    await expect(service.downloadAsMp3("https://www.youtube.com/watch?v=dQw4w9wgGcQ", outDir)).rejects.toThrow(
      /ffmpeg nie znaleziony/,
    );

    const entries = await service.getPlaylistEntries("https://www.youtube.com/playlist?list=PLtest");
    expect(entries).toEqual([
      { id: "aaaaaaaaaaa", url: "https://youtu.be/aaaaaaaaaaa", title: "One" },
    ]);
  });

  it("includes yt-dlp stderr when a private video download fails", async () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "dl-"));
    createdDirs.push(outDir);
    const client: YtDlpClient = {
      exec() {
        const emitter = new EventEmitter() as EventEmitter & {
          ytDlpProcess?: { stdout?: NodeJS.ReadableStream; stderr?: NodeJS.ReadableStream };
        };
        const stderr = new PassThrough();
        emitter.ytDlpProcess = { stderr };
        queueMicrotask(() => {
          stderr.write("ERROR: [youtube] -bwLRCs5q1g: Private video\n");
          emitter.emit("close", 1);
        });
        return emitter;
      },
      execPromise: async () => "",
    };
    const service = new DownloadService("/tmp/backend", undefined, {
      createClient: () => client,
      resolveBinary: async () => "/usr/bin/yt-dlp",
    });
    await expect(
      service.downloadAsMp3("https://www.youtube.com/watch?v=-bwLRCs5q1g", outDir),
    ).rejects.toThrow(/Private video/);
  });

  it("marks songs verified or failed through the download queue", async () => {
    const database = openDatabase(":memory:");
    try {
      const layer = DataLayerFactory.create(database);
      const songId = layer.songService.createPending({
        title: "Pending",
        author: "-",
        coverUrl: null,
        youtubeUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
      });
      const downloader: IDownloader = {
        downloadAsMp3: vi.fn().mockResolvedValue({
          filePath: "/tmp/a.mp3",
          title: "Done",
          author: "Artist",
          coverUrl: null,
          durationSeconds: 90,
        }),
        getPlaylistEntries: vi.fn(),
      };
      const verification = new SongVerificationService(
        layer.songService,
        layer.playlistService,
        { refreshQueueFile: vi.fn() } as never,
        downloader,
        "/tmp/songs",
      );
      await verification.verify(songId);
      const verified = layer.songService.getById(songId);
      expect(verified?.status).toBe("verified");
      expect(verified?.title).toBe("Done");

      const failId = layer.songService.createPending({
        title: "Fail",
        author: "-",
        coverUrl: null,
        youtubeUrl: "https://www.youtube.com/watch?v=bbbbbbbbbbb",
      });
      downloader.downloadAsMp3 = vi.fn().mockRejectedValue(new Error("boom"));
      await verification.verify(failId);
      expect(layer.songService.getById(failId)?.status).toBe("failed");
    } finally {
      database.close();
    }
  });
});
