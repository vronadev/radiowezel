import { compareTiedVoteSongs, resolveVoteTieBreakMode, type VoteTieBreakMode } from "../config/voteTieBreak.js";

type LibraryVoteCount = {
  count?: number;
  firstVoteAt?: string;
  lastVoteAt?: string;
};

function currentVoteCount(voteCounts: Record<string, LibraryVoteCount>, id: string): number {
  return voteCounts[id]?.count ?? 0;
}

function libraryGroup(id: string, votableSet: Set<string>, voteCounts: Record<string, LibraryVoteCount>): number {
  if (votableSet.has(id) && currentVoteCount(voteCounts, id) > 0) {
    return 0;
  }
  if (votableSet.has(id)) {
    return 1;
  }
  return 2;
}

export function applyLibraryOrder<T extends { id: string; totalVotes?: number }>(
  rows: T[],
  votableIds: string[],
  voteCounts: Record<string, LibraryVoteCount>,
  sort: string,
  tieBreakMode?: VoteTieBreakMode,
): T[] {
  const votableSet = new Set(votableIds);
  const mode = resolveVoteTieBreakMode(tieBreakMode);
  const next = [...rows];
  next.sort((left, right) => {
    const leftGroup = libraryGroup(left.id, votableSet, voteCounts);
    const rightGroup = libraryGroup(right.id, votableSet, voteCounts);
    if (leftGroup !== rightGroup) {
      return leftGroup - rightGroup;
    }
    const byVotes = currentVoteCount(voteCounts, right.id) - currentVoteCount(voteCounts, left.id);
    if (leftGroup === 0) {
      if (byVotes !== 0) {
        return byVotes;
      }
      return compareTiedVoteSongs(
        { songId: left.id, ...voteCounts[left.id] },
        { songId: right.id, ...voteCounts[right.id] },
        mode,
      );
    }
    if (sort === "total_votes") {
      return (right.totalVotes || 0) - (left.totalVotes || 0);
    }
    if (sort === "votes") {
      return byVotes;
    }
    return 0;
  });
  return next;
}
