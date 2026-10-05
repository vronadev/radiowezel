import type { PollOption } from "../@types/models.js";
import type { IDatabase } from "../interfaces/IDatabase.js";

interface PollOptionRow {
  id: string;
  poll_id: string;
  bell_id: string | null;
  title: string;
  youtube_url: string | null;
  start_time_sec: number;
  end_time_sec: number;
}

interface JoinedRow extends PollOptionRow {
  artist: string;
  bell_is_approved: number | null;
}

export interface PollOptionJoined {
  id: string;
  pollId: string;
  bellId: string | null;
  title: string;
  artist: string;
  youtubeUrl: string;
  startTimeSec: number;
  endTimeSec: number;
  bellApproved: boolean | null;
}

function mapOption(row: PollOptionRow): PollOption {
  return {
    id: row.id,
    pollId: row.poll_id,
    bellId: row.bell_id,
    title: row.title,
    youtubeUrl: row.youtube_url,
    startTimeSec: row.start_time_sec,
    endTimeSec: row.end_time_sec,
  };
}

export class PollOptionRepository {
  constructor(private readonly database: IDatabase) {}

  insert(option: {
    id: string;
    pollId: string;
    bellId: string | null;
    title: string;
    youtubeUrl: string | null;
    startTimeSec: number;
    endTimeSec: number;
  }): void {
    this.database
      .prepare(
        `INSERT INTO poll_options (id, poll_id, bell_id, title, youtube_url, start_time_sec, end_time_sec)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(option.id, option.pollId, option.bellId, option.title, option.youtubeUrl, option.startTimeSec, option.endTimeSec);
  }

  findById(id: string): PollOption | undefined {
    const row = this.database.prepare<PollOptionRow>("SELECT * FROM poll_options WHERE id = ?").get(id);
    return row ? mapOption(row) : undefined;
  }

  findByPollAndBell(pollId: string, bellId: string): PollOption | undefined {
    const row = this.database
      .prepare<PollOptionRow>("SELECT * FROM poll_options WHERE poll_id = ? AND bell_id = ?")
      .get(pollId, bellId);
    return row ? mapOption(row) : undefined;
  }

  listJoined(pollId: string): PollOptionJoined[] {
    return this.database
      .prepare<JoinedRow>(
        `SELECT o.id, o.poll_id, o.bell_id,
                COALESCE(b.title, o.title) AS title,
                COALESCE(b.artist, '') AS artist,
                COALESCE(b.youtube_url, o.youtube_url, '') AS youtube_url,
                COALESCE(b.start_time_sec, o.start_time_sec) AS start_time_sec,
                COALESCE(b.end_time_sec, o.end_time_sec) AS end_time_sec,
                b.is_approved AS bell_is_approved
         FROM poll_options o
         LEFT JOIN bells b ON b.id = o.bell_id
         WHERE o.poll_id = ?
         ORDER BY o.rowid`,
      )
      .all(pollId)
      .map((row) => ({
        id: row.id,
        pollId: row.poll_id,
        bellId: row.bell_id,
        title: row.title,
        artist: row.artist,
        youtubeUrl: row.youtube_url ?? "",
        startTimeSec: row.start_time_sec,
        endTimeSec: row.end_time_sec,
        bellApproved: row.bell_id ? row.bell_is_approved === 1 : null,
      }));
  }

  syncFromBell(bell: {
    id: string;
    title: string;
    youtubeUrl: string;
    startTimeSec: number;
    endTimeSec: number;
  }): void {
    this.database
      .prepare(
        `UPDATE poll_options
         SET title = ?, youtube_url = ?, start_time_sec = ?, end_time_sec = ?
         WHERE bell_id = ?`,
      )
      .run(bell.title, bell.youtubeUrl, bell.startTimeSec, bell.endTimeSec, bell.id);
  }

  delete(pollId: string, optionId: string): number {
    this.database.prepare("DELETE FROM poll_votes WHERE poll_option_id = ?").run(optionId);
    return this.database.prepare("DELETE FROM poll_options WHERE id = ? AND poll_id = ?").run(optionId, pollId).changes;
  }
}
