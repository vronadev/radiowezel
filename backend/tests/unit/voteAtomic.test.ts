import { afterEach, describe, expect, it } from "vitest";
import type { Request, Response } from "express";
import { DataLayerFactory } from "../../src/factories/dataLayerFactory.js";
import { openDatabase } from "../../src/repositories/sqliteDatabase.js";
import type { IDatabase } from "../../src/interfaces/IDatabase.js";
import { VoteController } from "../../src/controllers/voteController.js";
import { VoteQuotaExceededError } from "../../src/services/voteService.js";
import type { QueueManager } from "../../src/services/queueManager.js";
import type { YoutubeMetadataService } from "../../src/services/youtubeMetadataService.js";

describe("atomic votes", () => {
  let database: IDatabase | undefined;

  afterEach(() => {
    database?.close();
  });

  function setup() {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    const userId = layer.userService.create("user@zsi.kielce.pl", "hash", false);
    const songId = layer.songService.createPending({
      title: "Song",
      author: "A",
      coverUrl: null,
      youtubeUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    });
    layer.songService.updateStatus(songId, "verified");
    return { layer, userId, songId };
  }

  it("serializes concurrent vote attempts in one SQLite transaction so extra votes return 429", async () => {
    const { layer, userId, songId } = setup();
    layer.settingsService.setVoteQuotaPerUser(3);
    layer.settingsService.setVoteQuotaPeriodHours(24);

    const statuses: number[] = [];
    const controller = new VoteController(
      layer.voteService,
      layer.songService,
      { refreshQueueFile: () => ({}) } as unknown as QueueManager,
      { fetchYouTubeMetadata: async () => null } as unknown as YoutubeMetadataService,
      layer.songRequestService,
    );

    await Promise.all(
      Array.from({ length: 8 }, () =>
        controller.vote(
          { user: { id: userId, isAdmin: false }, body: { songId } } as unknown as Request,
          createResponse(statuses),
        ),
      ),
    );

    expect(layer.voteService.getVotesBySong()[songId]?.count).toBe(3);
    expect(statuses.filter((status) => status === 200)).toHaveLength(3);
    expect(statuses.filter((status) => status === 429)).toHaveLength(5);
  });

  it("rolls back the tally when a transaction loses the quota race", () => {
    const { layer, userId, songId } = setup();
    layer.settingsService.setVoteQuotaPerUser(1);
    layer.voteService.addVote(userId, songId, { enforceQuota: true });
    expect(() => layer.voteService.addVote(userId, songId, { enforceQuota: true })).toThrow(VoteQuotaExceededError);
    expect(layer.voteService.getVotesBySong()[songId]?.count).toBe(1);
    expect(layer.songService.getById(songId)?.totalVotes).toBe(1);
  });
});

function createResponse(statuses: number[]): Response {
  let statusCode = 200;
  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json() {
      statuses.push(statusCode);
      return this;
    },
  } as unknown as Response;
}
