export type RealtimeEventName =
  | "queue:updated"
  | "votes:changed"
  | "song:playing"
  | "requests:updated"
  | "downloads:updated"
  | "player:updated"
  | "library:updated";

export interface RealtimeMessage {
  event: RealtimeEventName;
  ts: string;
  songId?: string;
  title?: string;
  author?: string;
  startedAt?: string;
  durationSeconds?: number;
  paused?: boolean;
}

export function nextReconnectDelayMs(attempt: number, baseMs = 500, maxMs = 10_000): number {
  const exp = Math.max(0, attempt);
  return Math.min(maxMs, baseMs * 2 ** exp);
}
