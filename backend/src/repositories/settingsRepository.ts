import type { IDatabase } from "../interfaces/IDatabase.js";

export class SettingsRepository {
  constructor(private readonly database: IDatabase) {}

  get(key: string): string | undefined {
    const row = this.database.prepare<{ value: string }>("SELECT value FROM settings WHERE key = ?").get(key);
    return row?.value;
  }

  set(key: string, value: string): void {
    this.database.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
  }
}
