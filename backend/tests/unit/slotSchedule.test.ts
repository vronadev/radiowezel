import { describe, expect, it } from "vitest";
import { parseVolumePercentage } from "../../src/config/slotVolume.js";
import { SlotSchedule } from "../../src/services/slotSchedule.js";
import { FixedClock, atLocalTime } from "../helpers/testDoubles.js";

describe("SlotSchedule", () => {
  const slots = [
    { start: "08:45", end: "08:50" },
    { start: "11:15", end: "11:30" },
  ];

  it("detects the current break and reports the next slot", () => {
    const schedule = new SlotSchedule(slots, new FixedClock(atLocalTime(8, 47)));
    expect(schedule.isInBreak()).toBe(true);
    expect(schedule.getSlotEndSeconds()).toBe(8 * 3600 + 50 * 60);
    expect(schedule.getScheduleContext()).toEqual({
      currentSlot: { start: "08:45", end: "08:50" },
      nextSlot: { start: "11:15", end: "11:30" },
      inBreak: true,
    });
  });

  it("jumps a cursor past a slot end to the next break without snapping later songs together", () => {
    const at = atLocalTime(8, 50, 0);
    const schedule = new SlotSchedule(slots, new FixedClock(at));
    const next = schedule.nextPlayableInstant(at);
    expect(next.getHours()).toBe(11);
    expect(next.getMinutes()).toBe(15);
    expect(next.getSeconds()).toBe(0);
  });

  it("converts multi-day second offsets without collapsing to the same calendar day", () => {
    const base = atLocalTime(18, 0);
    const schedule = new SlotSchedule(slots, new FixedClock(base));
    const twoDaysLater = schedule.dateFromSeconds(2 * 24 * 3600 + 8 * 3600 + 45 * 60, base);
    expect(twoDaysLater.getDate()).toBe(base.getDate() + 2);
    expect(twoDaysLater.getHours()).toBe(8);
    expect(twoDaysLater.getMinutes()).toBe(45);
  });

  it("wraps to the first slot of the next day after the last break", () => {
    const schedule = new SlotSchedule(slots, new FixedClock(atLocalTime(18, 0)));
    const next = schedule.getNextBreakStart();
    expect(next?.slot).toEqual({ start: "08:45", end: "08:50" });
    expect(next?.start).toBeGreaterThanOrEqual(24 * 3600);
  });

  it("counts seconds from local midnight for slot checks", () => {
    const at = atLocalTime(8, 45, 10);
    const schedule = new SlotSchedule(slots, new FixedClock(at));
    expect(schedule.nowSeconds()).toBe(8 * 3600 + 45 * 60 + 10);
    expect(schedule.isInBreak()).toBe(true);
  });

  it("ends music bellEndOffsetSeconds before the calendar slot end", () => {
    const afterMusic = new SlotSchedule(slots, new FixedClock(atLocalTime(8, 49, 40)), 30);
    expect(afterMusic.isInBreak()).toBe(true);
    expect(afterMusic.isMusicWindow()).toBe(false);
    expect(afterMusic.getSlotEndSeconds()).toBe(8 * 3600 + 49 * 60 + 30);
    const stillPlaying = new SlotSchedule(slots, new FixedClock(atLocalTime(8, 49, 0)), 30);
    expect(stillPlaying.isMusicWindow()).toBe(true);
  });

  it("keeps only integer volumes from 0 through 100", () => {
    expect(parseVolumePercentage(0)).toBe(0);
    expect(parseVolumePercentage(100)).toBe(100);
    expect(parseVolumePercentage("40")).toBe(40);
    expect(parseVolumePercentage(40.5)).toBeUndefined();
    expect(parseVolumePercentage(101)).toBeUndefined();
    expect(parseVolumePercentage(-1)).toBeUndefined();
    expect(parseVolumePercentage(undefined)).toBeUndefined();
  });

  it("uses the active slot volume and falls back to 100% when it is missing or invalid", () => {
    const quiet = new SlotSchedule(
      [
        { start: "08:45", end: "08:50", volumePercentage: 35 },
        { start: "11:15", end: "11:30" },
      ],
      new FixedClock(atLocalTime(8, 47)),
    );
    expect(quiet.playbackVolumePercentage()).toBe(35);
    const full = new SlotSchedule(
      [
        { start: "08:45", end: "08:50", volumePercentage: 35 },
        { start: "11:15", end: "11:30" },
      ],
      new FixedClock(atLocalTime(11, 20)),
    );
    expect(full.playbackVolumePercentage()).toBe(100);
    const outside = new SlotSchedule([{ start: "08:45", end: "08:50", volumePercentage: 35 }], new FixedClock(atLocalTime(7, 0)));
    expect(outside.playbackVolumePercentage()).toBe(100);
  });

  it("starts music bellStartOffsetSeconds after the calendar slot start", () => {
    const duringBell = new SlotSchedule(slots, new FixedClock(atLocalTime(8, 45, 10)), 30, 30);
    expect(duringBell.isInBreak()).toBe(true);
    expect(duringBell.isMusicWindow()).toBe(false);
    const musicStarted = new SlotSchedule(slots, new FixedClock(atLocalTime(8, 45, 30)), 30, 30);
    expect(musicStarted.isMusicWindow()).toBe(true);
  });

  it("queues the next playable instant at slot start plus the opening bell offset", () => {
    const at = atLocalTime(8, 50, 0);
    const schedule = new SlotSchedule(slots, new FixedClock(at), 30, 30);
    const next = schedule.nextPlayableInstant(at);
    expect(next.getHours()).toBe(11);
    expect(next.getMinutes()).toBe(15);
    expect(next.getSeconds()).toBe(30);
    const duringOpeningBell = atLocalTime(8, 45, 5);
    const waited = new SlotSchedule(slots, new FixedClock(duringOpeningBell), 30, 30).nextPlayableInstant(
      duringOpeningBell,
    );
    expect(waited.getHours()).toBe(8);
    expect(waited.getMinutes()).toBe(45);
    expect(waited.getSeconds()).toBe(30);
  });

  it("skips closed weekend days and reports the station as not in a break", () => {
    const saturday = atLocalTime(8, 47);
    saturday.setDate(saturday.getDate() + 5);
    const schedule = new SlotSchedule(slots, new FixedClock(saturday));
    expect(saturday.getDay()).toBe(6);
    expect(schedule.isPlaybackDay()).toBe(false);
    expect(schedule.isMusicWindow()).toBe(true);
    expect(schedule.getScheduleContext()).toEqual({ currentSlot: null, nextSlot: null, inBreak: false });
    const next = schedule.nextPlayableInstant(saturday);
    expect(next.getDay()).toBe(1);
    expect(next.getHours()).toBe(8);
    expect(next.getMinutes()).toBe(45);
    expect(next.getDate()).toBe(saturday.getDate() + 2);
  });
});
