import type { QueueOverride, VoteCount } from "../@types/models.js";
import type { IDatabase } from "../interfaces/IDatabase.js";

interface VoteAggregateRow {
  song_id: string;
  c: number;
  first_at: string | null;
  last_at: string | null;
}

interface OverrideRow {
  song_id: string;
  votes: number;
  updated_at: string | null;
}

export class VoteRepository {
  constructor(private readonly database: IDatabase) {}

  insert(id: string, userId: string, songId: string): void {
    this.database.prepare("INSERT INTO votes (id, user_id, song_id) VALUES (?, ?, ?)").run(id, userId, songId);
  }

  deleteBySongId(songId: string): void {
    this.database.prepare("DELETE FROM votes WHERE song_id = ?").run(songId);
  }

  countSince(userId: string, sinceIso: string): number {
    const row = this.database
      .prepare<{ c: number }>("SELECT COUNT(*) as c FROM votes WHERE user_id = ? AND created_at > ?")
      .get(userId, sinceIso);
    return row?.c ?? 0;
  }

  getAggregatesBySong(): VoteAggregateRow[] {
    return this.database
      .prepare<VoteAggregateRow>(
        "SELECT song_id, COUNT(*) as c, MIN(created_at) as first_at, MAX(created_at) as last_at FROM votes GROUP BY song_id",
      )
      .all();
  }

  getOverrides(): QueueOverride[] {
    return this.database.prepare<OverrideRow>("SELECT song_id, votes, updated_at FROM song_queue_override").all().map((row) => ({
      songId: row.song_id,
      votes: row.votes,
      updatedAt: row.updated_at ?? "",
    }));
  }

  setOverride(songId: string, votes: number): void {
    this.database
      .prepare("INSERT OR REPLACE INTO song_queue_override (song_id, votes, updated_at) VALUES (?, ?, datetime('now'))")
      .run(songId, votes);
  }

  deleteOverride(songId: string): void {
    this.database.prepare("DELETE FROM song_queue_override WHERE song_id = ?").run(songId);
  }

  getVotesBySong(): Record<string, VoteCount> {
    const aggregates = this.getAggregatesBySong();
    const overrideMap = new Map(this.getOverrides().map((item) => [item.songId, item]));
    const result: Record<string, VoteCount> = {};
    for (const row of aggregates) {
      const override = overrideMap.get(row.song_id);
      result[row.song_id] = {
        count: override != null ? override.votes : row.c,
        firstVoteAt: override != null ? override.updatedAt : (row.first_at ?? ""),
        lastVoteAt: override != null ? override.updatedAt : (row.last_at ?? ""),
      };
    }
    for (const [songId, override] of overrideMap) {
      if (!result[songId]) {
        result[songId] = {
          count: override.votes,
          firstVoteAt: override.updatedAt,
          lastVoteAt: override.updatedAt,
        };
      }
    }
    return result;
  }
}
