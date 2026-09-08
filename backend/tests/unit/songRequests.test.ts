import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { DataLayerFactory } from "../../src/factories/dataLayerFactory.js";
import { SongController } from "../../src/controllers/songController.js";
import { SongRequestController } from "../../src/controllers/songRequestController.js";
import { VoteController } from "../../src/controllers/voteController.js";
import type { IDatabase } from "../../src/interfaces/IDatabase.js";
import type { IDownloader } from "../../src/interfaces/IDownloader.js";
import { openDatabase } from "../../src/repositories/sqliteDatabase.js";
import { SongVerificationService } from "../../src/services/songVerificationService.js";
import { MemoryFileStore } from "../helpers/testDoubles.js";

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

describe("song requests", () => {
  let database: IDatabase | undefined;

  afterEach(() => {
    database?.close();
  });

  it("stores one request per user per song and aggregates counts without requester fields on songs", async () => {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    const userA = layer.userService.create("a@zsi.kielce.pl", "hash", false);
    const userB = layer.userService.create("b@zsi.kielce.pl", "hash", false);
    const controller = new VoteController(
      layer.voteService,
      layer.songService,
      { refreshQueueFile: vi.fn() } as never,
      { fetchYouTubeMetadata: async () => ({ title: "Hit", author: "Band", coverUrl: null }) } as never,
      layer.songRequestService,
    );

    const first = mockResponse();
    await controller.vote(
      { user: { id: userA, isAdmin: false }, body: { youtubeUrl: "https://youtu.be/abcdefghijk" } } as unknown as Request,
      first,
    );
    expect(first.body).toEqual({ success: true, message: "Dodano do zgłoszeń. Czeka na weryfikację." });

    const second = mockResponse();
    await controller.vote(
      { user: { id: userB, isAdmin: false }, body: { youtubeUrl: "https://youtu.be/abcdefghijk" } } as unknown as Request,
      second,
    );
    expect(second.body).toEqual({ success: true, message: "Piosenka czeka na weryfikację" });

    const duplicate = mockResponse();
    await controller.vote(
      { user: { id: userA, isAdmin: false }, body: { youtubeUrl: "https://youtu.be/abcdefghijk" } } as unknown as Request,
      duplicate,
    );
    expect(duplicate.body).toEqual({ success: true, message: "Piosenka czeka na weryfikację" });

    const aggregates = layer.songRequestService.listAggregates();
    expect(aggregates).toHaveLength(1);
    expect(aggregates[0]?.requestCount).toBe(2);
    const song = layer.songService.getById(aggregates[0]!.songId);
    expect(song).toBeDefined();
    expect(song).not.toHaveProperty("requesterId");
    expect(song).not.toHaveProperty("userId");

    const list = mockResponse();
    new SongRequestController(layer.songRequestService, layer.songService).list({} as Request, list);
    expect(list.body).toEqual({ requests: aggregates });
  });

  it("bumps a pending song once per user", () => {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    const userId = layer.userService.create("a@zsi.kielce.pl", "hash", false);
    const songId = layer.songService.createPending({
      title: "Pending",
      author: "-",
      coverUrl: null,
      youtubeUrl: "https://youtu.be/abcdefghijk",
    });
    const controller = new SongRequestController(layer.songRequestService, layer.songService);
    const first = mockResponse();
    controller.bump({ params: { songId }, user: { id: userId } } as unknown as Request, first);
    expect(first.body).toEqual({ success: true, added: true });
    const second = mockResponse();
    controller.bump({ params: { songId }, user: { id: userId } } as unknown as Request, second);
    expect(second.body).toEqual({ success: true, added: false });
    expect(layer.songRequestService.countBySongId(songId)).toBe(1);
  });

  it("purges requests and emails every requester after successful verification", async () => {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    const userA = layer.userService.create("a@zsi.kielce.pl", "hash", false);
    const userB = layer.userService.create("b@zsi.kielce.pl", "hash", false);
    const songId = layer.songService.createPending({
      title: "Hit",
      author: "Band",
      coverUrl: null,
      youtubeUrl: "https://youtu.be/abcdefghijk",
    });
    layer.songRequestService.add(userA, songId, "https://youtu.be/abcdefghijk");
    layer.songRequestService.add(userB, songId, "https://youtu.be/abcdefghijk");

    const sendSongApproved = vi.fn().mockResolvedValue(undefined);
    const downloader: IDownloader = {
      downloadAsMp3: vi.fn().mockResolvedValue({
        filePath: path.join("/tmp", "hit.mp3"),
        title: "Hit",
        author: "Band",
        coverUrl: null,
        durationSeconds: 12,
      }),
      getPlaylistEntries: vi.fn(),
    };
    const verification = new SongVerificationService(
      layer.songService,
      layer.playlistService,
      { refreshQueueFile: vi.fn() } as never,
      downloader,
      "/tmp/req-songs",
      undefined,
      {
        fileStore: new MemoryFileStore(),
        retryDelayMs: 0,
        email: {
          sendMail: vi.fn(),
          sendMagicLink: vi.fn(),
          sendSongApproved,
        },
        songRequestService: layer.songRequestService,
        userService: layer.userService,
        votePageUrl: "http://localhost/vote",
      },
    );

    verification.start(songId);
    await verification.waitForIdle();
    expect(layer.songService.getById(songId)?.status).toBe("verified");
    expect(layer.songRequestService.countBySongId(songId)).toBe(0);
    expect(sendSongApproved).toHaveBeenCalledTimes(2);
    expect(sendSongApproved.mock.calls.map((call) => call[0]).sort()).toEqual([
      "a@zsi.kielce.pl",
      "b@zsi.kielce.pl",
    ]);
    expect(sendSongApproved.mock.calls[0]?.[1]).toBe("Hit");
    expect(sendSongApproved.mock.calls[0]?.[2]).toBe("http://localhost/vote");
  });

  it("accepts a queue vote override of 0", () => {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    const songId = layer.songService.createPending({
      title: "Zero",
      author: "A",
      coverUrl: null,
      youtubeUrl: "https://youtu.be/zzzzzzzzzzz",
    });
    layer.songService.updateStatus(songId, "verified");
    const controller = new SongController(
      layer.songService,
      layer.voteService,
      layer.playlistService,
      { refreshQueueFile: vi.fn() } as never,
      { cancel: vi.fn(), start: vi.fn(), isBusy: () => false, getQueue: vi.fn(), getStatus: vi.fn() } as never,
      "/tmp",
    );
    const response = mockResponse();
    controller.setQueueVotes({ params: { id: songId }, body: { count: 0 } } as unknown as Request, response);
    expect(response.body).toEqual({ success: true, count: 0 });
    expect(layer.voteService.getVotesBySong()[songId]?.count).toBe(0);
  });
});
