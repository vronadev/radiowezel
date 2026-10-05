export const BELLS_AND_POLLS_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS bells (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    youtube_url TEXT NOT NULL,
    start_time_sec INTEGER NOT NULL DEFAULT 0,
    end_time_sec INTEGER NOT NULL DEFAULT 30,
    is_approved INTEGER NOT NULL DEFAULT 0,
    requested_by_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (requested_by_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_bells_approved ON bells(is_approved);

  CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('WEEKLY_BELL', 'ONE_OFF')),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_polls_active ON polls(is_active);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_polls_weekly_start ON polls(start_date) WHERE type = 'WEEKLY_BELL';

  CREATE TABLE IF NOT EXISTS poll_options (
    id TEXT PRIMARY KEY,
    poll_id TEXT NOT NULL,
    bell_id TEXT,
    title TEXT NOT NULL,
    youtube_url TEXT,
    start_time_sec INTEGER NOT NULL DEFAULT 0,
    end_time_sec INTEGER NOT NULL DEFAULT 30,
    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
    FOREIGN KEY (bell_id) REFERENCES bells(id)
  );
  CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_options_poll_bell ON poll_options(poll_id, bell_id) WHERE bell_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS poll_votes (
    id TEXT PRIMARY KEY,
    poll_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    poll_option_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(poll_id, user_id),
    FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (poll_option_id) REFERENCES poll_options(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);
  CREATE INDEX IF NOT EXISTS idx_poll_votes_option ON poll_votes(poll_option_id);
`;

export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    cover_url TEXT,
    youtube_url TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    local_path TEXT,
    total_votes INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS votes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (song_id) REFERENCES songs(id)
  );
  CREATE INDEX IF NOT EXISTS idx_votes_user_created ON votes(user_id, created_at);

  CREATE TABLE IF NOT EXISTS email_tokens (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    type TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_songs_status ON songs(status);
  CREATE INDEX IF NOT EXISTS idx_votes_song ON votes(song_id);
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT OR IGNORE INTO settings (key, value) VALUES ('vote_quota_per_user', '5');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('vote_quota_period_hours', '24');

  CREATE INDEX IF NOT EXISTS idx_email_tokens_expires ON email_tokens(expires_at);

  CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    youtube_playlist_url TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS playlist_songs (
    playlist_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'youtube',
    PRIMARY KEY (playlist_id, song_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (song_id) REFERENCES songs(id)
  );

  CREATE TABLE IF NOT EXISTS playlist_schedule (
    id TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('cyclic', 'one_off')),
    day_of_week INTEGER,
    schedule_date TEXT,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id)
  );
  CREATE INDEX IF NOT EXISTS idx_playlist_schedule_date ON playlist_schedule(schedule_date);
  CREATE INDEX IF NOT EXISTS idx_playlist_schedule_dow ON playlist_schedule(day_of_week);
  INSERT OR IGNORE INTO settings (key, value) VALUES ('active_playlist_id', '');

  CREATE TABLE IF NOT EXISTS song_queue_override (
    song_id TEXT PRIMARY KEY,
    votes INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (song_id) REFERENCES songs(id)
  );

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
` + BELLS_AND_POLLS_SCHEMA_SQL;
