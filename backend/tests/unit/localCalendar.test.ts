import { describe, expect, it } from "vitest";
import { formatLocalDate, localWeekday } from "../../src/utils/localCalendar.js";

describe("localCalendar", () => {
  it("formats the local calendar date instead of the UTC ISO date", () => {
    const earlyLocal = new Date(2026, 8, 7, 0, 30, 0);
    expect(formatLocalDate(earlyLocal)).toBe("2026-09-07");
    expect(localWeekday(earlyLocal)).toBe(earlyLocal.getDay());

    const lateLocal = new Date(2026, 8, 7, 23, 30, 0);
    expect(formatLocalDate(lateLocal)).toBe("2026-09-07");
    expect(localWeekday(lateLocal)).toBe(lateLocal.getDay());
  });
});
