import type { IDownloader } from "../interfaces/IDownloader.js";
import type { IYoutubeMetadataService } from "../interfaces/IYoutubeMetadata.js";
import type { PlaylistService } from "./playlistService.js";
import type { QueueManager } from "./queueManager.js";
import type { SongService } from "./songService.js";
import type { SongVerificationService } from "./songVerificationService.js";
import { logEvent } from "./logger.js";

export function isYoutubePlaylistUrl(url: string): boolean {
  return /youtube\.com|youtu\.be/.test(url) && (url.includes("list=") || url.includes("/playlist"));
}

export class PlaylistImportService {
  constructor(
    private readonly playlistService: PlaylistService,
    private readonly songService: SongService,
    private readonly queueManager: QueueManager,
    private readonly downloader: IDownloader,
    private readonly youtubeMetadata: IYoutubeMetadataService,
    private readonly verification: SongVerificationService,
    private readonly ffmpegLocation?: string,
  ) {}

  async importFromYoutube(name: string, url: string): Promise<{ playlistId: string; added: number }> {
    const entries = await this.downloader.getPlaylistEntries(url, { ffmpegLocation: this.ffmpegLocation });
    const playlistId = this.playlistService.create(name, url);
    for (const entry of entries) {
      const songId = await this.ensureSongFromPlaylistEntry(entry.id, entry.url, entry.title);
      this.playlistService.addSongIfMissing(playlistId, songId, "youtube");
    }
    this.enqueueUnverifiedPlaylistSongs(playlistId);
    logEvent("playlist-import", "imported", { playlistId, added: entries.length });
    return { playlistId, added: entries.length };
  }

  async syncFromYoutube(playlistId: string, youtubePlaylistUrl: string): Promise<{
    added: number;
    removed: number;
    verifying: number;
  }> {
    const entries = await this.downloader.getPlaylistEntries(youtubePlaylistUrl, {
      ffmpegLocation: this.ffmpegLocation,
    });
    const currentYtSongIds = new Set<string>();
    for (const entry of entries) {
      const songId = await this.ensureSongFromPlaylistEntry(entry.id, entry.url, entry.title);
      currentYtSongIds.add(songId);
      this.playlistService.addSongIfMissing(playlistId, songId, "youtube");
    }
    const youtubeRows = this.playlistService.getYoutubeSongIds(playlistId);
    let removed = 0;
    for (const songId of youtubeRows) {
      if (!currentYtSongIds.has(songId)) {
        this.playlistService.removeYoutubeSong(playlistId, songId);
        removed += 1;
      }
    }
    this.queueManager.refreshQueueFile();
    const verifying = this.enqueueUnverifiedPlaylistSongs(playlistId);
    logEvent("playlist-import", "synced", { playlistId, added: entries.length, removed, verifying });
    return { added: entries.length, removed, verifying };
  }

  private enqueueUnverifiedPlaylistSongs(playlistId: string): number {
    const pendingInPlaylist = this.playlistService.getPendingSongIds(playlistId);
    for (const pendingId of pendingInPlaylist) {
      this.verification.start(pendingId, playlistId);
    }
    return pendingInPlaylist.length;
  }

  private async ensureSongFromPlaylistEntry(videoId: string, url: string, title: string): Promise<string> {
    const existing = this.songService.findByYoutubeVideoId(videoId);
    if (existing) {
      return existing.id;
    }
    const meta = await this.youtubeMetadata.fetchYouTubeMetadata(url).catch(() => null);
    return this.songService.createScheduledForDownload({
      title: meta?.title || title || "-",
      author: meta?.author || "-",
      coverUrl: meta?.coverUrl || null,
      youtubeUrl: url,
    });
  }
}
