import type { Playlist, PlaylistSongWithMeta } from "../@types/models.js";
import type { IDatabase } from "../interfaces/IDatabase.js";

interface PlaylistRow {
  id: string;
  name: string;
  youtube_playlist_url: string | null;
  created_at: string;
  exclude_from_random: number | null;
  exclude_from_voting: number | null;
}

interface PlaylistSongJoinRow {
  id: string;
  title: string;
  author: string;
  cover_url: string | null;
  status: PlaylistSongWithMeta["status"];
  source: string;
}

function mapPlaylist(row: PlaylistRow, songCount = 0): Playlist {
  return {
    id: row.id,
    name: row.name,
    youtubePlaylistUrl: row.youtube_playlist_url,
    createdAt: row.created_at,
    excludeFromRandom: !!(row.exclude_from_random ?? 0),
    excludeFromVoting: !!(row.exclude_from_voting ?? 0),
    songCount,
  };
}

export class PlaylistRepository {
  constructor(private readonly database: IDatabase) {}

  findById(id: string): Playlist | undefined {
    const row = this.database
      .prepare<PlaylistRow>(
        "SELECT id, name, youtube_playlist_url, created_at, exclude_from_random, exclude_from_voting FROM playlists WHERE id = ?",
      )
      .get(id);
    return row ? mapPlaylist(row) : undefined;
  }

  findAll(): Playlist[] {
    const rows = this.database
      .prepare<PlaylistRow>(
        "SELECT id, name, youtube_playlist_url, created_at, exclude_from_random, exclude_from_voting FROM playlists ORDER BY name",
      )
      .all();
    const counts = this.database
      .prepare<{ playlist_id: string; c: number }>("SELECT playlist_id, COUNT(*) as c FROM playlist_songs GROUP BY playlist_id")
      .all();
    const countMap = new Map(counts.map((item) => [item.playlist_id, item.c]));
    return rows.map((row) => mapPlaylist(row, countMap.get(row.id) ?? 0));
  }

  insert(id: string, name: string, youtubePlaylistUrl: string | null): void {
    this.database
      .prepare("INSERT INTO playlists (id, name, youtube_playlist_url) VALUES (?, ?, ?)")
      .run(id, name, youtubePlaylistUrl);
  }

  updateName(id: string, name: string): void {
    this.database.prepare("UPDATE playlists SET name = ? WHERE id = ?").run(name, id);
  }

  updateExcludeFromRandom(id: string, excludeFromRandom: boolean): void {
    this.database.prepare("UPDATE playlists SET exclude_from_random = ? WHERE id = ?").run(excludeFromRandom ? 1 : 0, id);
  }

  updateExcludeFromVoting(id: string, excludeFromVoting: boolean): void {
    this.database.prepare("UPDATE playlists SET exclude_from_voting = ? WHERE id = ?").run(excludeFromVoting ? 1 : 0, id);
  }

  deleteById(id: string): void {
    this.database.prepare("DELETE FROM playlists WHERE id = ?").run(id);
  }

  getSongIdsInPlaylist(playlistId: string): string[] {
    return this.database
      .prepare<{ song_id: string }>("SELECT song_id FROM playlist_songs WHERE playlist_id = ?")
      .all(playlistId)
      .map((row) => row.song_id);
  }

  getSongsInPlaylist(playlistId: string): PlaylistSongWithMeta[] {
    return this.database
      .prepare<PlaylistSongJoinRow>(
        "SELECT s.id, s.title, s.author, s.cover_url, s.status, ps.source FROM playlist_songs ps JOIN songs s ON s.id = ps.song_id WHERE ps.playlist_id = ? ORDER BY s.title",
      )
      .all(playlistId)
      .map((row) => ({
        id: row.id,
        title: row.title,
        author: row.author,
        coverUrl: row.cover_url,
        status: row.status,
        source: row.source,
      }));
  }

  addSong(playlistId: string, songId: string, source: string): void {
    this.database
      .prepare("INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, source) VALUES (?, ?, ?)")
      .run(playlistId, songId, source);
  }

  replaceSong(playlistId: string, songId: string, source: string): void {
    this.database
      .prepare("INSERT OR REPLACE INTO playlist_songs (playlist_id, song_id, source) VALUES (?, ?, ?)")
      .run(playlistId, songId, source);
  }

  removeSong(playlistId: string, songId: string): void {
    this.database.prepare("DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?").run(playlistId, songId);
  }

  removeSongFromAll(songId: string): void {
    this.database.prepare("DELETE FROM playlist_songs WHERE song_id = ?").run(songId);
  }

  deleteAllSongs(playlistId: string): void {
    this.database.prepare("DELETE FROM playlist_songs WHERE playlist_id = ?").run(playlistId);
  }

  getYoutubeSongIds(playlistId: string): string[] {
    return this.database
      .prepare<{ song_id: string }>("SELECT song_id FROM playlist_songs WHERE playlist_id = ? AND source = 'youtube'")
      .all(playlistId)
      .map((row) => row.song_id);
  }

  removeYoutubeSong(playlistId: string, songId: string): void {
    this.database
      .prepare("DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ? AND source = 'youtube'")
      .run(playlistId, songId);
  }

  getSongIdsExcludedFromVoting(): Set<string> {
    const rows = this.database
      .prepare<{ song_id: string }>(
        "SELECT DISTINCT ps.song_id FROM playlist_songs ps JOIN playlists p ON p.id = ps.playlist_id WHERE p.exclude_from_voting = 1",
      )
      .all();
    return new Set(rows.map((row) => row.song_id));
  }

  getSongIdsExcludedFromRandom(effectivePlaylistId: string): Set<string> {
    const rows = this.database
      .prepare<{ song_id: string }>(
        "SELECT DISTINCT ps.song_id FROM playlist_songs ps JOIN playlists p ON p.id = ps.playlist_id WHERE p.exclude_from_random = 1 AND (? = '' OR p.id != ?)",
      )
      .all(effectivePlaylistId, effectivePlaylistId);
    return new Set(rows.map((row) => row.song_id));
  }

  getPendingSongIds(playlistId: string): string[] {
    return this.database
      .prepare<{ id: string }>(
        "SELECT s.id FROM songs s JOIN playlist_songs ps ON ps.song_id = s.id WHERE ps.playlist_id = ? AND s.status IN ('pending', 'scheduled_for_download', 'downloading', 'failed')",
      )
      .all(playlistId)
      .map((row) => row.id);
  }
}
