import type { Request, Response } from "express";
import { ErrorMessages } from "../constants/errorMessages.js";
import { routeParam } from "../middlewares/routeParam.js";
import type { QueueManager } from "../services/queueManager.js";
import { isYoutubePlaylistUrl, type PlaylistImportService } from "../services/playlistImportService.js";
import type { PlaylistService } from "../services/playlistService.js";
import type { SongService } from "../services/songService.js";

export class PlaylistController {
  constructor(
    private readonly playlistService: PlaylistService,
    private readonly songService: SongService,
    private readonly queueManager: QueueManager,
    private readonly playlistImport: PlaylistImportService,
  ) {}

  getEffective = (_request: Request, response: Response): void => {
    const playlistId = this.playlistService.getEffectivePlaylistId();
    if (!playlistId) {
      response.json({ playlistId: null, playlistName: null });
      return;
    }
    const playlist = this.playlistService.getById(playlistId);
    response.json({
      playlistId: playlist?.id || null,
      playlistName: playlist?.name || null,
    });
  };

  getPublicById = (request: Request, response: Response): void => {
    const id = routeParam(request, "id");
    const playlist = this.playlistService.getById(id);
    if (!playlist) {
      response.status(404).json({ message: ErrorMessages.notFound });
      return;
    }
    const songs = this.playlistService.getSongs(id);
    response.json({
      id: playlist.id,
      name: playlist.name,
      songs: songs.map((song) => ({
        id: song.id,
        title: song.title,
        author: song.author,
        coverUrl: song.coverUrl,
      })),
    });
  };

  listAdmin = (_request: Request, response: Response): void => {
    response.json({
      playlists: this.playlistService.list().map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        youtubePlaylistUrl: playlist.youtubePlaylistUrl,
        createdAt: playlist.createdAt,
        songCount: playlist.songCount || 0,
        excludeFromRandom: playlist.excludeFromRandom,
        excludeFromVoting: playlist.excludeFromVoting,
      })),
    });
  };

  create = async (request: Request, response: Response): Promise<void> => {
    const { name, youtubePlaylistUrl } = request.body || {};
    const trimmedName = name != null ? String(name).trim() : "";
    if (!trimmedName) {
      response.status(400).json({ message: ErrorMessages.playlistNameRequired });
      return;
    }
    const url = String(youtubePlaylistUrl || "").trim();
    if (!url) {
      const playlistId = this.playlistService.create(trimmedName, null);
      response.json({ success: true, playlistId, name: trimmedName, added: 0 });
      return;
    }
    if (!isYoutubePlaylistUrl(url)) {
      response.status(400).json({ message: ErrorMessages.invalidYoutubePlaylistUrl });
      return;
    }
    try {
      const result = await this.playlistImport.importFromYoutube(trimmedName, url);
      response.json({ success: true, playlistId: result.playlistId, name: String(name).trim(), added: result.added });
    } catch (err) {
      console.error("Playlist import error:", err);
      const message = err instanceof Error ? err.message : "Błąd importu playlisty";
      response.status(500).json({ message });
    }
  };

  getAdminById = (request: Request, response: Response): void => {
    const id = routeParam(request, "id");
    const playlist = this.playlistService.getById(id);
    if (!playlist) {
      response.status(404).json({ message: ErrorMessages.notFound });
      return;
    }
    const songs = this.playlistService.getSongs(id);
    response.json({
      id: playlist.id,
      name: playlist.name,
      excludeFromRandom: playlist.excludeFromRandom,
      excludeFromVoting: playlist.excludeFromVoting,
      youtubePlaylistUrl: playlist.youtubePlaylistUrl,
      createdAt: playlist.createdAt,
      songs: songs.map((song) => ({
        id: song.id,
        title: song.title,
        author: song.author,
        coverUrl: song.coverUrl,
        status: song.status,
        source: song.source,
      })),
    });
  };

  update = (request: Request, response: Response): void => {
    const id = routeParam(request, "id");
    const { name, excludeFromRandom, excludeFromVoting } = request.body || {};
    const updated = this.playlistService.update(id, { name, excludeFromRandom, excludeFromVoting });
    if (!updated) {
      response.status(404).json({ message: ErrorMessages.notFound });
      return;
    }
    response.json({ success: true });
  };

  sync = async (request: Request, response: Response): Promise<void> => {
    const playlist = this.playlistService.getById(routeParam(request, "id"));
    if (!playlist) {
      response.status(404).json({ message: ErrorMessages.notFound });
      return;
    }
    const url = (playlist.youtubePlaylistUrl || "").trim();
    if (!url || (!url.includes("list=") && !url.includes("/playlist"))) {
      response.status(400).json({ message: ErrorMessages.playlistMissingYoutubeUrl });
      return;
    }
    try {
      const result = await this.playlistImport.syncFromYoutube(playlist.id, url);
      response.json({ success: true, added: result.added, removed: result.removed, verifying: result.verifying });
    } catch (err) {
      console.error("Playlist sync error:", err);
      const message = err instanceof Error ? err.message : "Błąd synchronizacji";
      response.status(500).json({ message });
    }
  };

  addSong = (request: Request, response: Response): void => {
    const id = routeParam(request, "id");
    const { songId } = request.body || {};
    if (!this.playlistService.getById(id)) {
      response.status(404).json({ message: ErrorMessages.playlistNotFound });
      return;
    }
    if (!this.songService.getById(songId)) {
      response.status(404).json({ message: ErrorMessages.songMissing });
      return;
    }
    this.playlistService.addSong(id, songId, "manual");
    this.queueManager.refreshQueueFile();
    response.json({ success: true });
  };

  removeSong = (request: Request, response: Response): void => {
    const playlistId = routeParam(request, "playlistId");
    const songId = routeParam(request, "songId");
    if (!this.playlistService.getById(playlistId)) {
      response.status(404).json({ message: ErrorMessages.playlistNotFound });
      return;
    }
    this.playlistService.removeSong(playlistId, songId);
    this.queueManager.refreshQueueFile();
    response.json({ success: true });
  };

  delete = (request: Request, response: Response): void => {
    this.playlistService.delete(routeParam(request, "id"));
    this.queueManager.refreshQueueFile();
    response.json({ success: true });
  };
}
