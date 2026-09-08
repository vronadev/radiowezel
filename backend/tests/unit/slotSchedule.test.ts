import { describe, expect, it } from "vitest";
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

  it("ends music bellOffsetSeconds before the calendar slot end", () => {
    const afterMusic = new SlotSchedule(slots, new FixedClock(atLocalTime(8, 49, 40)), 30);
    expect(afterMusic.isInBreak()).toBe(true);
    expect(afterMusic.isMusicWindow()).toBe(false);
    expect(afterMusic.getSlotEndSeconds()).toBe(8 * 3600 + 49 * 60 + 30);
    const stillPlaying = new SlotSchedule(slots, new FixedClock(atLocalTime(8, 49, 0)), 30);
    expect(stillPlaying.isMusicWindow()).toBe(true);
  });
});
