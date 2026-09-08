export interface PlayHistoryEntry {
  songId: string;
  title: string;
  author: string;
  startedAt: string;
  durationSeconds: number | null;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function parsePlayHistoryLog(
  contents: string,
  now: Date,
  windowMs = SEVEN_DAYS_MS,
): PlayHistoryEntry[] {
  const cutoff = now.getTime() - windowMs;
  const entries: PlayHistoryEntry[] = [];
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (parsed.event !== "song_started") {
      continue;
    }
    const startedAt = typeof parsed.startedAt === "string" ? parsed.startedAt : typeof parsed.ts === "string" ? parsed.ts : "";
    const at = Date.parse(startedAt);
    if (!Number.isFinite(at) || at < cutoff) {
      continue;
    }
    entries.push({
      songId: String(parsed.songId || ""),
      title: String(parsed.title || "Nieznany utwór"),
      author: String(parsed.author || ""),
      startedAt,
      durationSeconds: typeof parsed.durationSeconds === "number" ? parsed.durationSeconds : null,
    });
  }
  entries.sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
  return entries;
}
