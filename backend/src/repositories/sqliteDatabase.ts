import Database from "better-sqlite3";
import type { Database as BetterSqliteDatabase, Statement } from "better-sqlite3";
import type { IDatabase, IStatement, StatementRunResult } from "../interfaces/IDatabase.js";
import { SCHEMA_SQL } from "../config/schema.js";

class SqliteStatement<TResult> implements IStatement<TResult> {
  constructor(private readonly statement: Statement) {}

  get(...params: unknown[]): TResult | undefined {
    return this.statement.get(...params) as TResult | undefined;
  }

  all(...params: unknown[]): TResult[] {
    return this.statement.all(...params) as TResult[];
  }

  run(...params: unknown[]): StatementRunResult {
    const result = this.statement.run(...params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }
}

export class SqliteDatabase implements IDatabase {
  private readonly db: BetterSqliteDatabase;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(SCHEMA_SQL);
    this.runMigrations();
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare<TResult = unknown>(sql: string): IStatement<TResult> {
    return new SqliteStatement<TResult>(this.db.prepare(sql));
  }

  transaction<T>(work: () => T): T {
    return this.db.transaction(work).immediate();
  }

  close(): void {
    this.db.close();
  }

  private runMigrations(): void {
    this.migrateTotalVotes();
    this.migrateVotesUniqueConstraint();
    this.migratePlaylistSongsColumns();
    this.migratePlaylistsColumns();
    this.migrateSongRequests();
  }

  private migrateTotalVotes(): void {
    try {
      const columns = this.prepare<{ name: string }>("PRAGMA table_info(songs)").all();
      const hasTotalVotes = columns.some((column) => column.name === "total_votes");
      if (!hasTotalVotes) {
        this.exec("ALTER TABLE songs ADD COLUMN total_votes INTEGER NOT NULL DEFAULT 0");
      }
    } catch {
      // Existing DBs without songs table are handled by SCHEMA_SQL.
    }
  }

  private migrateVotesUniqueConstraint(): void {
    try {
      const row = this.prepare<{ sql: string | null }>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='votes'",
      ).get();
      const sql = row?.sql ?? "";
      if (!sql.includes("UNIQUE(user_id, song_id)")) {
        return;
      }
      const votesRows = this.prepare<{
        id: string;
        user_id: string;
        song_id: string;
        created_at: string;
      }>("SELECT id, user_id, song_id, created_at FROM votes").all();
      this.exec(
        "CREATE TABLE votes_new (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, song_id TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (song_id) REFERENCES songs(id))",
      );
      const insert = this.prepare("INSERT INTO votes_new (id, user_id, song_id, created_at) VALUES (?, ?, ?, ?)");
      for (const vote of votesRows) {
        insert.run(vote.id, vote.user_id, vote.song_id, vote.created_at);
      }
      this.exec("DROP TABLE votes");
      this.exec("ALTER TABLE votes_new RENAME TO votes");
      this.exec("CREATE INDEX IF NOT EXISTS idx_votes_song ON votes(song_id)");
      this.exec("CREATE INDEX IF NOT EXISTS idx_votes_user_created ON votes(user_id, created_at)");
    } catch {
      // Ignore migration errors on fresh databases.
    }
  }

  private migratePlaylistSongsColumns(): void {
    try {
      const info = this.prepare<{ name: string }>("PRAGMA table_info(playlist_songs)").all();
      if (!info.some((column) => column.name === "source")) {
        this.exec("ALTER TABLE playlist_songs ADD COLUMN source TEXT NOT NULL DEFAULT 'youtube'");
      }
      if (!info.some((column) => column.name === "banned")) {
        this.exec("ALTER TABLE playlist_songs ADD COLUMN banned INTEGER NOT NULL DEFAULT 0");
      }
    } catch {
      // Ignore migration errors on fresh databases.
    }
  }

  private migratePlaylistsColumns(): void {
    try {
      const info = this.prepare<{ name: string }>("PRAGMA table_info(playlists)").all();
      if (!info.some((column) => column.name === "exclude_from_random")) {
        this.exec("ALTER TABLE playlists ADD COLUMN exclude_from_random INTEGER NOT NULL DEFAULT 0");
      }
      if (!info.some((column) => column.name === "exclude_from_voting")) {
        this.exec("ALTER TABLE playlists ADD COLUMN exclude_from_voting INTEGER NOT NULL DEFAULT 0");
      }
    } catch {
      // Ignore migration errors on fresh databases.
    }
  }

  private migrateSongRequests(): void {
    this.exec(`
      CREATE TABLE IF NOT EXISTS song_requests (
        id TEXT PRIMARY KEY,
        song_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        youtube_url TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, song_id),
        FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_song_requests_song ON song_requests(song_id);
    `);
  }
}

export function openDatabase(dbPath: string): IDatabase {
  return new SqliteDatabase(dbPath);
}
