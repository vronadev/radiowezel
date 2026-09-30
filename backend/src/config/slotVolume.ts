export const DEFAULT_SLOT_VOLUME_PERCENTAGE = 100;

/** Accepts an integer from 0 through 100. Anything else is left unset so playback uses 100%. */
export function parseVolumePercentage(value: unknown): number | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      return undefined;
    }
    return inRange(Number(trimmed));
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return inRange(value);
  }
  return undefined;
}

export function resolveVolumePercentage(value: unknown): number {
  return parseVolumePercentage(value) ?? DEFAULT_SLOT_VOLUME_PERCENTAGE;
}

function inRange(value: number): number | undefined {
  if (value < 0 || value > 100) {
    return undefined;
  }
  return value;
}
