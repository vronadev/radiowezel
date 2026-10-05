const MAX_SECONDS = 12 * 60 * 60;

export interface ClipRange {
  startTimeSec: number;
  endTimeSec: number;
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampSeconds(value: unknown, fallback: number): number {
  const parsed = finiteNumber(value);
  if (parsed == null) {
    return fallback;
  }
  return Math.min(MAX_SECONDS, Math.max(0, Math.floor(parsed)));
}

/** YouTube preview window. Missing values fall back to a 30 second clip from the start. */
export function clipRange(start: unknown, end: unknown): ClipRange {
  const startTimeSec = clampSeconds(start, 0);
  const fallbackEnd = Math.min(MAX_SECONDS, startTimeSec + 30);
  let endTimeSec = clampSeconds(end, fallbackEnd);
  if (endTimeSec <= startTimeSec) {
    endTimeSec = fallbackEnd === startTimeSec ? Math.min(MAX_SECONDS, startTimeSec + 1) : fallbackEnd;
  }
  return { startTimeSec, endTimeSec };
}
