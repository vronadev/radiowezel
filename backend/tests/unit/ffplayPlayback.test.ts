import { describe, expect, it } from "vitest";
import { buildFfplayArgs, planFfplayPlayback } from "../../src/services/ffplayPlayback.js";

describe("ffplay live fade-out plan", () => {
  it("does not attach afade when the song ends before the break", () => {
    const plan = planFfplayPlayback({
      filePath: "/tmp/song.mp3",
      startSeconds: 0,
      songDurationSeconds: 120,
      remainingSlotSeconds: 180,
      fadeOutSecondsBeforeEnd: 5,
    });
    expect(plan.fadeOut).toBeNull();
    expect(plan.limitSeconds).toBeNull();
    expect(buildFfplayArgs(plan)).toEqual([
      "-nodisp",
      "-autoexit",
      "-loglevel",
      "quiet",
      "-hide_banner",
      "/tmp/song.mp3",
    ]);
  });

  it("applies afade on the same stream as the slot end approaches", () => {
    const plan = planFfplayPlayback({
      filePath: "/tmp/song.mp3",
      startSeconds: 10,
      songDurationSeconds: 120,
      remainingSlotSeconds: 60,
      fadeOutSecondsBeforeEnd: 5,
    });
    expect(plan).toEqual({
      filePath: "/tmp/song.mp3",
      startSeconds: 10,
      limitSeconds: 60,
      fadeOut: { startSeconds: 55, durationSeconds: 5 },
    });
    expect(buildFfplayArgs(plan)).toEqual([
      "-nodisp",
      "-autoexit",
      "-loglevel",
      "quiet",
      "-hide_banner",
      "-ss",
      "10",
      "-t",
      "60",
      "-af",
      "afade=t=out:st=55:d=5",
      "/tmp/song.mp3",
    ]);
  });

  it("fades for the remaining slot when the fade window is already active", () => {
    const plan = planFfplayPlayback({
      filePath: "/tmp/song.mp3",
      songDurationSeconds: 120,
      remainingSlotSeconds: 3,
      fadeOutSecondsBeforeEnd: 5,
    });
    expect(plan.limitSeconds).toBe(3);
    expect(plan.fadeOut).toEqual({ startSeconds: 0, durationSeconds: 3 });
    expect(buildFfplayArgs(plan)).toContain("afade=t=out:st=0:d=3");
  });
});
