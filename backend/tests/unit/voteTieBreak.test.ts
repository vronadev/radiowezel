import { describe, expect, it } from "vitest";
import { compareTiedVoteSongs, resolveVoteTieBreakMode } from "../../src/config/voteTieBreak.js";
import { applyLibraryOrder } from "../../src/http/libraryOrder.js";

function song(id: "A" | "B", firstVoteAt: string, lastVoteAt: string) {
  return { songId: id, firstVoteAt, lastVoteAt };
}

describe("vote count tie-break", () => {
  const catchUpOnA = {
    A: song("A", "2026-09-08 10:00:00", "2026-09-08 10:03:00"),
    B: song("B", "2026-09-08 10:01:00", "2026-09-08 10:02:00"),
  };
  const catchUpOnB = {
    A: song("A", "2026-09-08 10:01:00", "2026-09-08 10:02:00"),
    B: song("B", "2026-09-08 10:00:00", "2026-09-08 10:03:00"),
  };

  it("oldest_vote prefers the earlier first current vote", () => {
    expect(compareTiedVoteSongs(catchUpOnA.A, catchUpOnA.B, "oldest_vote")).toBeLessThan(0);
    expect(compareTiedVoteSongs(catchUpOnB.A, catchUpOnB.B, "oldest_vote")).toBeGreaterThan(0);
  });

  it("older_latest_vote prefers the earlier most recent current vote", () => {
    expect(compareTiedVoteSongs(catchUpOnA.A, catchUpOnA.B, "older_latest_vote")).toBeGreaterThan(0);
    expect(compareTiedVoteSongs(catchUpOnB.A, catchUpOnB.B, "older_latest_vote")).toBeLessThan(0);
  });

  it("newest_vote prefers the later most recent current vote", () => {
    expect(compareTiedVoteSongs(catchUpOnA.A, catchUpOnA.B, "newest_vote")).toBeLessThan(0);
    expect(compareTiedVoteSongs(catchUpOnB.A, catchUpOnB.B, "newest_vote")).toBeGreaterThan(0);
  });

  it("applies oldest_vote in the voted library group", () => {
    const rows = [{ id: "B" }, { id: "A" }];
    const voteCounts = {
      A: { count: 2, firstVoteAt: "2026-09-08 10:00:00", lastVoteAt: "2026-09-08 10:03:00" },
      B: { count: 2, firstVoteAt: "2026-09-08 10:01:00", lastVoteAt: "2026-09-08 10:02:00" },
    };
    expect(applyLibraryOrder(rows, ["A", "B"], voteCounts, "votes", "oldest_vote").map((row) => row.id)).toEqual([
      "A",
      "B",
    ]);
    expect(applyLibraryOrder(rows, ["A", "B"], voteCounts, "votes", "older_latest_vote").map((row) => row.id)).toEqual([
      "B",
      "A",
    ]);
    expect(applyLibraryOrder(rows, ["A", "B"], voteCounts, "votes", "newest_vote").map((row) => row.id)).toEqual([
      "A",
      "B",
    ]);
  });

  it("defaults to oldest_vote when the value is missing or unknown", () => {
    expect(resolveVoteTieBreakMode()).toBe("oldest_vote");
    expect(resolveVoteTieBreakMode("", "nope", undefined)).toBe("oldest_vote");
    expect(resolveVoteTieBreakMode("newest_vote", "oldest_vote")).toBe("newest_vote");
  });
});
