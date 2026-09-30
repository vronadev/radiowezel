import type { CyclicScheduleItem, OneOffScheduleItem } from "../@types/models.js";
import type { IDatabase } from "../interfaces/IDatabase.js";

export class PlaylistScheduleRepository {
  constructor(private readonly database: IDatabase) {}

  findOneOffPlaylistIds(dateStr: string): string[] {
    return this.database
      .prepare<{ playlist_id: string }>(
        "SELECT playlist_id FROM playlist_schedule WHERE type = 'one_off' AND schedule_date = ? ORDER BY playlist_id",
      )
      .all(dateStr)
      .map((row) => row.playlist_id);
  }

  findCyclicPlaylistIds(dayOfWeek: number): string[] {
    return this.database
      .prepare<{ playlist_id: string }>(
        "SELECT playlist_id FROM playlist_schedule WHERE type = 'cyclic' AND day_of_week = ? ORDER BY playlist_id",
      )
      .all(dayOfWeek)
      .map((row) => row.playlist_id);
  }

  listCyclic(): CyclicScheduleItem[] {
    return this.database
      .prepare<{ id: string; playlist_id: string; day_of_week: number }>(
        "SELECT id, playlist_id, day_of_week FROM playlist_schedule WHERE type = 'cyclic' ORDER BY day_of_week",
      )
      .all()
      .map((row) => ({ id: row.id, playlistId: row.playlist_id, dayOfWeek: row.day_of_week }));
  }

  listOneOff(): OneOffScheduleItem[] {
    return this.database
      .prepare<{ id: string; playlist_id: string; schedule_date: string }>(
        "SELECT id, playlist_id, schedule_date FROM playlist_schedule WHERE type = 'one_off' ORDER BY schedule_date",
      )
      .all()
      .map((row) => ({ id: row.id, playlistId: row.playlist_id, date: row.schedule_date }));
  }

  replaceCyclic(items: Array<{ playlistId: string; dayOfWeek: number }>): void {
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM playlist_schedule WHERE type = 'cyclic'").run();
      const insert = this.database.prepare(
        "INSERT INTO playlist_schedule (id, playlist_id, type, day_of_week, schedule_date) VALUES (?, ?, 'cyclic', ?, NULL)",
      );
      for (const item of items) {
        insert.run(crypto.randomUUID(), item.playlistId, item.dayOfWeek);
      }
    });
  }

  replaceOneOff(items: Array<{ playlistId: string; date: string }>): void {
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM playlist_schedule WHERE type = 'one_off'").run();
      const insert = this.database.prepare(
        "INSERT INTO playlist_schedule (id, playlist_id, type, day_of_week, schedule_date) VALUES (?, ?, 'one_off', NULL, ?)",
      );
      for (const item of items) {
        insert.run(crypto.randomUUID(), item.playlistId, item.date);
      }
    });
  }

  deleteByPlaylistId(playlistId: string): void {
    this.database.prepare("DELETE FROM playlist_schedule WHERE playlist_id = ?").run(playlistId);
  }
}
