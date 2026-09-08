import type { SongRequestAggregate } from "../repositories/songRequestRepository.js";
import type { SongRequestRepository } from "../repositories/songRequestRepository.js";
import { logEvent } from "./logger.js";

export class SongRequestService {
  constructor(private readonly songRequestRepository: SongRequestRepository) {}

  add(userId: string, songId: string, youtubeUrl: string): boolean {
    const added = this.songRequestRepository.insert({
      id: crypto.randomUUID(),
      songId,
      userId,
      youtubeUrl,
    });
    logEvent("song-requests", added ? "created" : "duplicate", { songId, userId });
    return added;
  }

  listAggregates(): SongRequestAggregate[] {
    return this.songRequestRepository.listAggregates();
  }

  countBySongId(songId: string): number {
    return this.songRequestRepository.countBySongId(songId);
  }

  listRequesterUserIds(songId: string): string[] {
    return this.songRequestRepository.listUserIdsBySongId(songId);
  }

  deleteBySongId(songId: string): void {
    this.songRequestRepository.deleteBySongId(songId);
    logEvent("song-requests", "purged", { songId });
  }
}
