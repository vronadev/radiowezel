import type { Playlist, PlaylistSongWithMeta } from "../@types/models.js";
import type { PlaylistRepository } from "../repositories/playlistRepository.js";
import type { ScheduleService } from "./scheduleService.js";
import type { SettingsService } from "./settingsService.js";

export class PlaylistService {
  constructor(
    private readonly playlistRepository: PlaylistRepository,
    private readonly scheduleService: ScheduleService,
    private readonly settingsService: SettingsService,
  ) {}

  getEffectivePlaylistId(at: Date = new Date()): string | null {
    return this.scheduleService.resolveScheduledPlaylistId(at) ?? this.settingsService.getActivePlaylistId();
  }

  getSongIdsInPlaylist(playlistId: string | null): string[] | null {
    if (!playlistId) {
      return null;
    }
    return this.playlistRepository.getSongIdsInPlaylist(playlistId);
  }

  getAllowedSongIds(): string[] | null {
    return this.getSongIdsInPlaylist(this.getEffectivePlaylistId());
  }

  getSongIdsExcludedFromVoting(): Set<string> {
    return this.playlistRepository.getSongIdsExcludedFromVoting();
  }

  getSongIdsExcludedFromRandom(effectivePlaylistId: string | null): Set<string> {
    return this.playlistRepository.getSongIdsExcludedFromRandom(effectivePlaylistId ?? "");
  }

  getVotableSongIds(verifiedSongIds: string[]): string[] {
    const effectivePlaylistId = this.getEffectivePlaylistId();
    if (effectivePlaylistId) {
      return this.getSongIdsInPlaylist(effectivePlaylistId) ?? [];
    }
    const excluded = this.getSongIdsExcludedFromVoting();
    return verifiedSongIds.filter((id) => !excluded.has(id));
  }

  list(): Playlist[] {
    return this.playlistRepository.findAll();
  }

  getById(id: string): Playlist | undefined {
    return this.playlistRepository.findById(id);
  }

  getSongs(playlistId: string): PlaylistSongWithMeta[] {
    return this.playlistRepository.getSongsInPlaylist(playlistId);
  }

  create(name: string, youtubePlaylistUrl: string | null): string {
    const playlistId = crypto.randomUUID();
    this.playlistRepository.insert(playlistId, name, youtubePlaylistUrl);
    return playlistId;
  }

  update(
    id: string,
    patch: { name?: string; excludeFromRandom?: boolean; excludeFromVoting?: boolean },
  ): boolean {
    const existing = this.playlistRepository.findById(id);
    if (!existing) {
      return false;
    }
    if (patch.name != null && patch.name.trim()) {
      this.playlistRepository.updateName(id, patch.name.trim());
    }
    if (patch.excludeFromRandom !== undefined) {
      this.playlistRepository.updateExcludeFromRandom(id, patch.excludeFromRandom);
    }
    if (patch.excludeFromVoting !== undefined) {
      this.playlistRepository.updateExcludeFromVoting(id, patch.excludeFromVoting);
    }
    return true;
  }

  addSong(playlistId: string, songId: string, source: string): void {
    if (source === "manual") {
      this.playlistRepository.replaceSong(playlistId, songId, source);
      return;
    }
    this.playlistRepository.addSong(playlistId, songId, source);
  }

  addSongIfMissing(playlistId: string, songId: string, source: string): void {
    this.playlistRepository.addSong(playlistId, songId, source);
  }

  removeSong(playlistId: string, songId: string): void {
    this.playlistRepository.removeSong(playlistId, songId);
  }

  delete(id: string): void {
    this.scheduleService.deleteByPlaylistId(id);
    this.playlistRepository.deleteAllSongs(id);
    this.playlistRepository.deleteById(id);
    if (this.settingsService.getActivePlaylistId() === id) {
      this.settingsService.setActivePlaylistId(null);
    }
  }

  getYoutubeSongIds(playlistId: string): string[] {
    return this.playlistRepository.getYoutubeSongIds(playlistId);
  }

  removeYoutubeSong(playlistId: string, songId: string): void {
    this.playlistRepository.removeYoutubeSong(playlistId, songId);
  }

  getPendingSongIds(playlistId: string): string[] {
    return this.playlistRepository.getPendingSongIds(playlistId);
  }
}
