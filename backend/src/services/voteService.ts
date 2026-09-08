import type { VoteCount, VoteQuota } from "../@types/models.js";
import type { IDatabase } from "../interfaces/IDatabase.js";
import type { VoteRepository } from "../repositories/voteRepository.js";
import type { SongRepository } from "../repositories/songRepository.js";
import type { SettingsService } from "./settingsService.js";

export class VoteQuotaExceededError extends Error {
  constructor() {
    super("VOTE_QUOTA_EXCEEDED");
    this.name = "VoteQuotaExceededError";
  }
}

export class VoteService {
  constructor(
    private readonly voteRepository: VoteRepository,
    private readonly songRepository: SongRepository,
    private readonly settingsService: SettingsService,
    private readonly database: IDatabase,
  ) {}

  getVotesBySong(): Record<string, VoteCount> {
    return this.voteRepository.getVotesBySong();
  }

  getVoteQuota(): VoteQuota {
    return this.settingsService.getVoteQuota();
  }

  checkVoteQuota(userId: string): boolean {
    return this.getQuotaStatus(userId).remaining > 0;
  }

  getQuotaStatus(userId: string): {
    used: number;
    remaining: number;
    perUser: number;
    periodHours: number;
  } {
    const { perUser, periodHours } = this.getVoteQuota();
    const since = new Date(Date.now() - periodHours * 60 * 60 * 1000).toISOString();
    const used = this.voteRepository.countSince(userId, since);
    return {
      used,
      remaining: Math.max(0, perUser - used),
      perUser,
      periodHours,
    };
  }

  addVote(userId: string, songId: string, options?: { enforceQuota?: boolean }): void {
    this.database.transaction(() => {
      if (options?.enforceQuota && !this.checkVoteQuota(userId)) {
        throw new VoteQuotaExceededError();
      }
      this.voteRepository.insert(crypto.randomUUID(), userId, songId);
      this.songRepository.incrementTotalVotes(songId);
    });
  }

  resetQueueVotesForSong(songId: string): void {
    this.voteRepository.deleteBySongId(songId);
  }

  setQueueOverride(songId: string, votes: number): void {
    this.voteRepository.setOverride(songId, votes);
  }

  deleteOverride(songId: string): void {
    this.voteRepository.deleteOverride(songId);
  }
}
