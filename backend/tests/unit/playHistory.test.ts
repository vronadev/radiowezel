import { describe, expect, it } from "vitest";
import { parsePlayHistoryLog } from "../../src/services/playHistoryService.js";

describe("play history log", () => {
  it("keeps song_started rows from the last 7 days newest first", () => {
    const now = new Date("2026-09-08T12:00:00.000Z");
    const contents = [
      JSON.stringify({
        ts: "2026-08-01T10:00:00.000Z",
        event: "song_started",
        songId: "old",
        title: "Ancient",
        author: "A",
        startedAt: "2026-08-01T10:00:00.000Z",
      }),
      JSON.stringify({
        ts: "2026-09-08T08:00:00.000Z",
        event: "song_started",
        songId: "new-1",
        title: "Morning",
        author: "B",
        startedAt: "2026-09-08T08:00:00.000Z",
        durationSeconds: 180,
      }),
      JSON.stringify({
        ts: "2026-09-07T18:00:00.000Z",
        event: "download",
        songId: "skip",
      }),
      JSON.stringify({
        ts: "2026-09-08T09:00:00.000Z",
        event: "song_started",
        songId: "new-2",
        title: "Later",
        author: "C",
        startedAt: "2026-09-08T09:00:00.000Z",
      }),
      "{not-json}",
    ].join("\n");

    const plays = parsePlayHistoryLog(contents, now);
    expect(plays.map((item) => item.songId)).toEqual(["new-2", "new-1"]);
    expect(plays[0]?.title).toBe("Later");
  });
});
