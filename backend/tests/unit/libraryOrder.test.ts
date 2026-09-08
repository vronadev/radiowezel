import { describe, expect, it } from "vitest";
import { applyLibraryOrder } from "../../src/http/libraryOrder.js";

describe("library order", () => {
  const rows = [
    { id: "blocked-votes", totalVotes: 99 },
    { id: "blocked-plain", totalVotes: 3 },
    { id: "ok-none", totalVotes: 1 },
    { id: "ok-low", totalVotes: 4 },
    { id: "ok-high", totalVotes: 5 },
  ];
  const voteCounts = {
    "blocked-votes": { count: 50 },
    "ok-low": { count: 2 },
    "ok-high": { count: 8 },
  };

  it("keeps every song: current votes, then other votable, then not votable", () => {
    const ordered = applyLibraryOrder(rows, ["ok-none", "ok-low", "ok-high"], voteCounts, "votes");
    expect(ordered.map((row) => row.id)).toEqual([
      "ok-high",
      "ok-low",
      "ok-none",
      "blocked-votes",
      "blocked-plain",
    ]);
  });

  it("does not drop songs that cannot be voted for", () => {
    const ordered = applyLibraryOrder(rows, ["ok-high"], voteCounts, "");
    expect(ordered).toHaveLength(rows.length);
    expect(ordered.map((row) => row.id)).toEqual([
      "ok-high",
      "blocked-votes",
      "blocked-plain",
      "ok-none",
      "ok-low",
    ]);
  });
});
