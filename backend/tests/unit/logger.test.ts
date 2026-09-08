import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appendLogFile, logEvent, logEventToFile } from "../../src/services/logger.js";

describe("structured logger", () => {
  const files: string[] = [];

  afterEach(() => {
    for (const filePath of files) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore missing test files
      }
    }
    files.length = 0;
  });

  it("emits JSON with scope and event", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logEvent("download", "verified", { songId: "abc" });
    expect(spy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(spy.mock.calls[0]?.[0])) as {
      scope: string;
      event: string;
      songId: string;
      ts: string;
    };
    expect(payload.scope).toBe("download");
    expect(payload.event).toBe("verified");
    expect(payload.songId).toBe("abc");
    expect(payload.ts).toBeTruthy();
    spy.mockRestore();
  });

  it("appends JSON lines to a log file", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const filePath = path.join(os.tmpdir(), `played-songs-${Date.now()}.log`);
    files.push(filePath);
    logEventToFile(filePath, "player", "song_started", { songId: "song-1", title: "Track" });
    const contents = fs.readFileSync(filePath, "utf8").trim();
    const payload = JSON.parse(contents) as { scope: string; event: string; songId: string; title: string };
    expect(payload).toMatchObject({ scope: "player", event: "song_started", songId: "song-1", title: "Track" });
    appendLogFile(filePath, { scope: "player", event: "song_started", songId: "song-2" });
    const lines = fs.readFileSync(filePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    spy.mockRestore();
  });
});
