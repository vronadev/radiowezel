import type { Bell } from "../@types/models.js";
import type { IDatabase } from "../interfaces/IDatabase.js";

interface BellRow {
  id: string;
  title: string;
  artist: string;
  youtube_url: string;
  start_time_sec: number;
  end_time_sec: number;
  is_approved: number;
  requested_by_id: string | null;
  created_at: string;
}

function mapBell(row: BellRow): Bell {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    youtubeUrl: row.youtube_url,
    startTimeSec: row.start_time_sec,
    endTimeSec: row.end_time_sec,
    isApproved: row.is_approved === 1,
    requestedById: row.requested_by_id,
    createdAt: row.created_at,
  };
}

export class BellRepository {
  constructor(private readonly database: IDatabase) {}

  insert(bell: {
    id: string;
    title: string;
    artist: string;
    youtubeUrl: string;
    startTimeSec: number;
    endTimeSec: number;
    isApproved: boolean;
    requestedById: string | null;
  }): void {
    this.database
      .prepare(
        `INSERT INTO bells (id, title, artist, youtube_url, start_time_sec, end_time_sec, is_approved, requested_by_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        bell.id,
        bell.title,
        bell.artist,
        bell.youtubeUrl,
        bell.startTimeSec,
        bell.endTimeSec,
        bell.isApproved ? 1 : 0,
        bell.requestedById,
      );
  }

  findById(id: string): Bell | undefined {
    const row = this.database.prepare<BellRow>("SELECT * FROM bells WHERE id = ?").get(id);
    return row ? mapBell(row) : undefined;
  }

  findByYoutubeVideoId(videoId: string): Bell | undefined {
    const row = this.database.prepare<BellRow>("SELECT * FROM bells WHERE youtube_url LIKE ?").get(`%${videoId}%`);
    return row ? mapBell(row) : undefined;
  }

  listApproved(): Bell[] {
    return this.database
      .prepare<BellRow>("SELECT * FROM bells WHERE is_approved = 1 ORDER BY title COLLATE NOCASE")
      .all()
      .map(mapBell);
  }

  listPending(): Bell[] {
    return this.database
      .prepare<BellRow>("SELECT * FROM bells WHERE is_approved = 0 ORDER BY created_at DESC")
      .all()
      .map(mapBell);
  }

  updateApproved(bell: {
    id: string;
    title: string;
    artist: string;
    youtubeUrl: string;
    startTimeSec: number;
    endTimeSec: number;
  }): void {
    this.database
      .prepare(
        `UPDATE bells
         SET title = ?, artist = ?, youtube_url = ?, start_time_sec = ?, end_time_sec = ?, is_approved = 1
         WHERE id = ?`,
      )
      .run(bell.title, bell.artist, bell.youtubeUrl, bell.startTimeSec, bell.endTimeSec, bell.id);
  }
}
