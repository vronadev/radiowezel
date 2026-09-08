import type { IDatabase } from "../interfaces/IDatabase.js";

export interface SongRequestAggregate {
  songId: string;
  title: string;
  author: string;
  coverUrl: string | null;
  youtubeUrl: string;
  status: string;
  requestCount: number;
  lastRequestedAt: string;
  createdAt: string;
}

interface AggregateTableRow {
  song_id: string;
  title: string;
  author: string;
  cover_url: string | null;
  youtube_url: string;
  status: string;
  request_count: number;
  last_requested_at: string;
  created_at: string;
}

export class SongRequestRepository {
  constructor(private readonly database: IDatabase) {}

  insert(request: { id: string; songId: string; userId: string; youtubeUrl: string }): boolean {
    const result = this.database
      .prepare(
        "INSERT OR IGNORE INTO song_requests (id, song_id, user_id, youtube_url) VALUES (?, ?, ?, ?)",
      )
      .run(request.id, request.songId, request.userId, request.youtubeUrl);
    return result.changes > 0;
  }

  deleteBySongId(songId: string): void {
    this.database.prepare("DELETE FROM song_requests WHERE song_id = ?").run(songId);
  }

  listUserIdsBySongId(songId: string): string[] {
    return this.database
      .prepare<{ user_id: string }>("SELECT DISTINCT user_id FROM song_requests WHERE song_id = ?")
      .all(songId)
      .map((row) => row.user_id);
  }

  countBySongId(songId: string): number {
    const row = this.database
      .prepare<{ c: number }>("SELECT COUNT(*) as c FROM song_requests WHERE song_id = ?")
      .get(songId);
    return row?.c ?? 0;
  }

  listAggregates(): SongRequestAggregate[] {
    return this.database
      .prepare<AggregateTableRow>(
        `SELECT s.id as song_id, s.title, s.author, s.cover_url, s.youtube_url, s.status,
                COUNT(r.id) as request_count, MAX(r.created_at) as last_requested_at, MIN(s.created_at) as created_at
         FROM song_requests r
         JOIN songs s ON s.id = r.song_id
         WHERE s.status != 'verified'
         GROUP BY s.id
         ORDER BY request_count DESC, last_requested_at DESC`,
      )
      .all()
      .map((row) => ({
        songId: row.song_id,
        title: row.title,
        author: row.author,
        coverUrl: row.cover_url,
        youtubeUrl: row.youtube_url,
        status: row.status,
        requestCount: row.request_count,
        lastRequestedAt: row.last_requested_at,
        createdAt: row.created_at,
      }));
  }
}
