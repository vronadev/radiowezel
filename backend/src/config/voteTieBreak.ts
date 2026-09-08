/**
 * Equal-vote ordering for the play queue and library.
 *
 * Set `voteTieBreakMode` in `backend/config.json` (next to `schedule`).
 * `VOTE_TIE_BREAK_MODE` in `.env` overrides the file when both are set.
 *
 * - oldest_vote: song whose earliest current vote is older wins (default)
 * - older_latest_vote: song whose most recent current vote is older wins
 * - newest_vote: song whose most recent current vote is newer wins
 */
export const VOTE_TIE_BREAK_MODES = ["oldest_vote", "older_latest_vote", "newest_vote"] as const;

export type VoteTieBreakMode = (typeof VOTE_TIE_BREAK_MODES)[number];

export const VOTE_TIE_BREAK_MODE: VoteTieBreakMode = "oldest_vote";

export interface VoteTieBreakTimes {
  songId?: string;
  firstVoteAt?: string;
  lastVoteAt?: string;
}

export function parseVoteTieBreakMode(value: unknown): VoteTieBreakMode | undefined {
  return VOTE_TIE_BREAK_MODES.includes(value as VoteTieBreakMode) ? (value as VoteTieBreakMode) : undefined;
}

export function resolveVoteTieBreakMode(...candidates: unknown[]): VoteTieBreakMode {
  for (const candidate of candidates) {
    const parsed = parseVoteTieBreakMode(candidate);
    if (parsed) {
      return parsed;
    }
  }
  return VOTE_TIE_BREAK_MODE;
}

export function compareTiedVoteSongs(
  left: VoteTieBreakTimes,
  right: VoteTieBreakTimes,
  mode: VoteTieBreakMode = resolveVoteTieBreakMode(),
): number {
  const useFirstVote = mode === "oldest_vote";
  const leftKey = (useFirstVote ? left.firstVoteAt : left.lastVoteAt) || "";
  const rightKey = (useFirstVote ? right.firstVoteAt : right.lastVoteAt) || "";
  const byTime = mode === "newest_vote" ? rightKey.localeCompare(leftKey) : leftKey.localeCompare(rightKey);
  if (byTime !== 0) {
    return byTime;
  }
  return (left.songId || "").localeCompare(right.songId || "");
}
