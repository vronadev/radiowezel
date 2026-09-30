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

  it("orders songs without current votes by total votes, then title, artist, and id", () => {
    const rows = [
      { id: "c", title: "Bravo", author: "Ann", totalVotes: 1 },
      { id: "b", title: "Alpha", author: "Zoe", totalVotes: 4 },
      { id: "d", title: "Alpha", author: "Ann", totalVotes: 4 },
      { id: "a", title: "Alpha", author: "Ann", totalVotes: 4 },
      { id: "voted", title: "Zed", author: "Zed", totalVotes: 100 },
      { id: "blocked-high", title: "Aaa", author: "Aaa", totalVotes: 80 },
    ];
    const ordered = applyLibraryOrder(
      rows,
      ["c", "b", "d", "a", "voted"],
      { voted: { count: 1, firstVoteAt: "2026-09-08 10:00:00", lastVoteAt: "2026-09-08 10:00:00" } },
      "votes",
      "oldest_vote",
    );
    expect(ordered.map((row) => row.id)).toEqual(["voted", "a", "d", "b", "c", "blocked-high"]);

    const reversed = applyLibraryOrder([...rows].reverse(), ["c", "b", "d", "a", "voted"], {
      voted: { count: 1, firstVoteAt: "2026-09-08 10:00:00", lastVoteAt: "2026-09-08 10:00:00" },
    }, "votes");
    expect(reversed.map((row) => row.id)).toEqual(ordered.map((row) => row.id));
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
