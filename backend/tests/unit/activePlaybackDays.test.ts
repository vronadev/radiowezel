import { afterEach, describe, expect, it } from "vitest";
import { parseActivePlaybackDays } from "../../src/config/activePlaybackDays.js";
import type { Request, Response } from "express";
import { DataLayerFactory } from "../../src/factories/dataLayerFactory.js";
import type { IDatabase } from "../../src/interfaces/IDatabase.js";
import { PlaylistScheduleController } from "../../src/controllers/scheduleController.js";
import { openDatabase } from "../../src/repositories/sqliteDatabase.js";
import { QueueManager } from "../../src/services/queueManager.js";
import { SlotSchedule } from "../../src/services/slotSchedule.js";
import { FixedClock, MemoryFileStore, atLocalTime } from "../helpers/testDoubles.js";

function mockResponse() {
  const response = {
    body: undefined as unknown,
    status(code: number) {
      return code;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return response;
}

describe("active playback days", () => {
  it("reads weekday names from config and env-style lists", () => {
    expect(
      parseActivePlaybackDays(["monday", "tuesday", "wednesday", "thursday", "friday"]),
    ).toEqual([1, 2, 3, 4, 5]);
    expect(parseActivePlaybackDays("Saturday, sunday")).toEqual([0, 6]);
    expect(parseActivePlaybackDays([1, "friday"])).toEqual([1, 5]);
  });

  let database: IDatabase | undefined;

  afterEach(() => {
    database?.close();
  });

  it("stores admin day toggles on the live schedule and closes the other weekdays", () => {
    database = openDatabase(":memory:");
    const layer = DataLayerFactory.create(database);
    const clock = new FixedClock(atLocalTime(12, 0));
    const slotSchedule = new SlotSchedule([{ start: "07:30", end: "08:00" }], clock);
    const queueManager = new QueueManager({
      songService: layer.songService,
      voteService: layer.voteService,
      playlistService: layer.playlistService,
      slotSchedule,
      queueFilePath: "/tmp/queue.json",
      fileStore: new MemoryFileStore(),
      clock,
    });
    const controller = new PlaylistScheduleController(
      layer.settingsService,
      layer.scheduleService,
      queueManager,
      slotSchedule,
      [1, 2, 3, 4, 5],
    );
    const response = mockResponse();
    controller.patch({ body: { activeDays: [1, 5, 1] } } as unknown as Request, response as unknown as Response);

    expect(slotSchedule.getActiveDays()).toEqual([1, 5]);
    expect(layer.settingsService.getActivePlaybackDays([1, 2, 3, 4, 5])).toEqual([1, 5]);
    expect((response.body as { activeDays: number[] }).activeDays).toEqual([1, 5]);
    const tuesday = atLocalTime(12, 0);
    tuesday.setDate(tuesday.getDate() + 1);
    expect(slotSchedule.isPlaybackDay(tuesday)).toBe(false);
    expect(slotSchedule.nextPlayableInstant(tuesday).getDay()).toBe(5);
  });
});
