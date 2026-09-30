/** Sunday = 0 … Saturday = 6, matching `Date#getDay()`. Monday–Friday. */
export const DEFAULT_ACTIVE_PLAYBACK_DAYS = [1, 2, 3, 4, 5];

const WEEKDAY_BY_NAME: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Accepts weekday names (`"monday"`) or `Date#getDay()` numbers.
 * `undefined` means the value was missing or not a day list. An empty array means every day is closed.
 */
export function parseActivePlaybackDays(value: unknown): number[] | undefined {
  if (Array.isArray(value)) {
    return uniqueWeekdays(value);
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return uniqueWeekdays(trimmed.split(","));
}

function uniqueWeekdays(values: unknown[]): number[] {
  const days = new Set<number>();
  for (const value of values) {
    const day = weekdayNumber(value);
    if (day != null) {
      days.add(day);
    }
  }
  return [...days].sort((left, right) => left - right);
}

function weekdayNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6) {
    return value;
  }
  const text = String(value).trim().toLowerCase();
  if (!text) {
    return undefined;
  }
  const numeric = Number(text);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric <= 6) {
    return numeric;
  }
  return WEEKDAY_BY_NAME[text];
}
