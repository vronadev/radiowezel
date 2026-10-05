import type { Poll, PollType } from "../@types/models.js";
import type { IDatabase } from "../interfaces/IDatabase.js";

interface PollRow {
  id: string;
  title: string;
  type: PollType;
  start_date: string;
  end_date: string;
  is_active: number;
}

function mapPoll(row: PollRow): Poll {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    startDate: row.start_date,
    endDate: row.end_date,
    isActive: row.is_active === 1,
  };
}

export class PollRepository {
  constructor(private readonly database: IDatabase) {}

  insert(poll: {
    id: string;
    title: string;
    type: PollType;
    startDate: string;
    endDate: string;
    isActive: boolean;
  }): void {
    this.database
      .prepare("INSERT INTO polls (id, title, type, start_date, end_date, is_active) VALUES (?, ?, ?, ?, ?, ?)")
      .run(poll.id, poll.title, poll.type, poll.startDate, poll.endDate, poll.isActive ? 1 : 0);
  }

  findById(id: string): Poll | undefined {
    const row = this.database.prepare<PollRow>("SELECT * FROM polls WHERE id = ?").get(id);
    return row ? mapPoll(row) : undefined;
  }

  findWeeklyByStartDate(startDate: string): Poll | undefined {
    const row = this.database
      .prepare<PollRow>("SELECT * FROM polls WHERE type = 'WEEKLY_BELL' AND start_date = ?")
      .get(startDate);
    return row ? mapPoll(row) : undefined;
  }

  listAll(): Poll[] {
    return this.database.prepare<PollRow>("SELECT * FROM polls ORDER BY start_date DESC, title").all().map(mapPoll);
  }

  listByType(type: PollType): Poll[] {
    return this.database.prepare<PollRow>("SELECT * FROM polls WHERE type = ? ORDER BY start_date").all(type).map(mapPoll);
  }

  save(poll: Poll): void {
    this.database
      .prepare("UPDATE polls SET title = ?, start_date = ?, end_date = ?, is_active = ? WHERE id = ?")
      .run(poll.title, poll.startDate, poll.endDate, poll.isActive ? 1 : 0, poll.id);
  }

  syncWeeklyActive(localDate: string): void {
    this.database
      .prepare(
        `UPDATE polls
         SET is_active = CASE WHEN start_date <= ? AND end_date >= ? THEN 1 ELSE 0 END
         WHERE type = 'WEEKLY_BELL'`,
      )
      .run(localDate, localDate);
  }
}
