import type { PollType } from "../@types/models.js";
import { compareTiedVoteSongs, type VoteTieBreakMode } from "../config/voteTieBreak.js";

export interface PollTallyOption {
  optionId: string;
  voteCount: number;
  firstVoteAt: string;
  lastVoteAt: string;
  eligible: boolean;
}

/**
 * Weekly bell polls count only approved bells.
 * One-off options without a bell are eligible. A linked unapproved bell is not.
 */
export function optionEligible(pollType: PollType, bellApproved: boolean | null): boolean {
  if (pollType === "WEEKLY_BELL") {
    return bellApproved === true;
  }
  return bellApproved !== false;
}

export function selectPollWinner(options: PollTallyOption[], mode: VoteTieBreakMode): string | null {
  const eligible = options.filter((option) => option.eligible && option.voteCount > 0);
  eligible.sort((left, right) => {
    if (left.voteCount !== right.voteCount) {
      return right.voteCount - left.voteCount;
    }
    return compareTiedVoteSongs(
      { songId: left.optionId, firstVoteAt: left.firstVoteAt, lastVoteAt: left.lastVoteAt },
      { songId: right.optionId, firstVoteAt: right.firstVoteAt, lastVoteAt: right.lastVoteAt },
      mode,
    );
  });
  return eligible[0]?.optionId ?? null;
}
