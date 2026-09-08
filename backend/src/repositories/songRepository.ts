import type { Song, SongStatus } from "../@types/models.js";
import type { IDatabase } from "../interfaces/IDatabase.js";

interface SongRow {
  id: string;
  title: string;
  author: string;
  cover_url: string | null;
  youtube_url: string;
  duration_seconds: number;
  status: SongStatus;
  local_path: string | null;
  total_votes: number;
  created_at: string;
}

function mapSong(row: SongRow): Song {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    coverUrl: row.cover_url,
    youtubeUrl: row.youtube_url,
    durationSeconds: row.duration_seconds,
    status: row.status,
    localPath: row.local_path,
    totalVotes: row.total_votes ?? 0,
    createdAt: row.created_at,
  };
}

export class SongRepository {
  constructor(private readonly database: IDatabase) {}

  findById(id: string): Song | undefined {
    const row = this.database.prepare<SongRow>("SELECT * FROM songs WHERE id = ?").get(id);
    return row ? mapSong(row) : undefined;
  }

  findAll(): Song[] {
    return this.database.prepare<SongRow>("SELECT * FROM songs").all().map(mapSong);
  }

  findByIds(ids: string[]): Song[] {
    if (ids.length === 0) {
      return [];
    }
    const placeholders = ids.map(() => "?").join(",");
    return this.database
      .prepare<SongRow>(`SELECT * FROM songs WHERE id IN (${placeholders})`)
      .all(...ids)
      .map(mapSong);
  }

  findVerified(): Song[] {
    return this.database.prepare<SongRow>("SELECT * FROM songs WHERE status = 'verified'").all().map(mapSong);
  }

  findVerifiedIds(): string[] {
    return this.findVerified().map((song) => song.id);
  }

  findByStatuses(statuses: SongStatus[]): Song[] {
    if (statuses.length === 0) {
      return [];
    }
    const placeholders = statuses.map(() => "?").join(",");
    return this.database
      .prepare<SongRow>(`SELECT * FROM songs WHERE status IN (${placeholders}) ORDER BY created_at DESC`)
      .all(...statuses)
      .map(mapSong);
  }

  findRanking(limit: number): Song[] {
    return this.database
      .prepare<SongRow>(
        "SELECT * FROM songs WHERE status = 'verified' ORDER BY COALESCE(total_votes, 0) DESC LIMIT ?",
      )
      .all(limit)
      .map(mapSong);
  }

  findByYoutubeVideoId(videoId: string): Song | undefined {
    const row = this.database
      .prepare<SongRow>("SELECT * FROM songs WHERE youtube_url LIKE ?")
      .get(`%${videoId}%`);
    return row ? mapSong(row) : undefined;
  }

  insertPending(song: {
    id: string;
    title: string;
    author: string;
    coverUrl: string | null;
    youtubeUrl: string;
    durationSeconds?: number;
    status?: SongStatus;
  }): void {
    this.database
      .prepare(
        "INSERT INTO songs (id, title, author, cover_url, youtube_url, duration_seconds, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        song.id,
        song.title,
        song.author,
        song.coverUrl,
        song.youtubeUrl,
        song.durationSeconds ?? 0,
        song.status ?? "pending",
      );
  }

  updateStatus(id: string, status: SongStatus): void {
    this.database.prepare("UPDATE songs SET status = ? WHERE id = ?").run(status, id);
  }

  markVerified(id: string, localPath: string, title: string, author: string, coverUrl: string | null, durationSeconds: number): void {
    this.database
      .prepare(
        "UPDATE songs SET status = 'verified', local_path = ?, title = ?, author = ?, cover_url = ?, duration_seconds = ? WHERE id = ?",
      )
      .run(localPath, title, author, coverUrl, durationSeconds, id);
  }

  incrementTotalVotes(songId: string): void {
    this.database.prepare("UPDATE songs SET total_votes = COALESCE(total_votes, 0) + 1 WHERE id = ?").run(songId);
  }

  deleteById(id: string): void {
    this.database.prepare("DELETE FROM songs WHERE id = ?").run(id);
  }
}
