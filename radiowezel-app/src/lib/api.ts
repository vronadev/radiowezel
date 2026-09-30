import type { ScheduleConfig } from "@/types/api";
import { toast } from "@/hooks/use-toast";
import {
  createHttpClient,
  request,
  isApiTimeoutError,
  REQUEST_TIMEOUT_MESSAGE,
  type ApiRequestConfig,
} from "./httpClient";

export { isApiTimeoutError, REQUEST_TIMEOUT_MESSAGE };
export type { ApiRequestConfig };

const http = createHttpClient(() => {
  toast({
    title: "Przekroczono czas oczekiwania",
    description: "Serwer nie odpowiedział. Spróbuj ponownie.",
    variant: "destructive",
  });
});

export const api = {
  async getQueue(config?: ApiRequestConfig): Promise<{ nowPlaying: unknown | null; queue: unknown[]; schedule?: { currentSlot: { start: string; end: string } | null; nextSlot: { start: string; end: string } | null; inBreak: boolean } }> {
    return request(http, { url: "/queue" }, config);
  },

  async getPublicQueue(config?: ApiRequestConfig): Promise<{ nowPlaying: unknown | null; queue: unknown[]; schedule?: { currentSlot: { start: string; end: string } | null; nextSlot: { start: string; end: string } | null; inBreak: boolean } }> {
    return request(http, { url: "/public/queue" }, config);
  },

  async getLibrary(query?: string, sort?: string, limit?: number, offset?: number, config?: ApiRequestConfig): Promise<{ songs: unknown[] }> {
    return request(http, {
      url: "/songs/library",
      params: {
        q: query || undefined,
        sort: sort || undefined,
        limit,
        offset,
      },
    }, config);
  },

  async vote(body: { songId?: string; youtubeUrl?: string }, config?: ApiRequestConfig): Promise<{ success: boolean; message?: string }> {
    return request(http, { url: "/vote", method: "POST", data: body }, config);
  },

  async getPendingSongs(config?: ApiRequestConfig): Promise<{ songs: unknown[] }> {
    return request(http, { url: "/admin/songs/pending" }, config);
  },

  async getDownloadQueue(config?: ApiRequestConfig): Promise<{
    maxConcurrency: number;
    activeCount: number;
    queuedCount: number;
    items: {
      songId: string;
      title: string;
      author: string;
      coverUrl: string | null;
      youtubeUrl: string;
      status: "scheduled_for_download" | "downloading" | "failed";
      queuePosition: number | null;
      attempts: number;
      maxAttempts: number;
      lastError: string | null;
    }[];
  }> {
    return request(http, { url: "/admin/songs/download-queue" }, config);
  },

  async getPlayerState(config?: ApiRequestConfig): Promise<{ paused: boolean }> {
    return request(http, { url: "/admin/player" }, config);
  },

  async setPlayerPaused(paused: boolean, config?: ApiRequestConfig): Promise<{ paused: boolean }> {
    return request(http, { url: "/admin/player", method: "PATCH", data: { paused } }, config);
  },

  async skipCurrentSong(config?: ApiRequestConfig): Promise<{ success: boolean }> {
    return request(http, { url: "/admin/player/skip", method: "POST" }, config);
  },

  async getSongFileBlobUrl(songId: string, config?: ApiRequestConfig): Promise<string> {
    try {
      const blob = await request<Blob>(http, { url: `/songs/${songId}/file`, responseType: "blob" }, config);
      return URL.createObjectURL(blob);
    } catch (error) {
      if (isApiTimeoutError(error)) {
        throw error;
      }
      throw new Error("Plik nie znaleziony");
    }
  },

  async getSettings(config?: ApiRequestConfig): Promise<{ voteQuotaPerUser: number; voteQuotaPeriodHours: number }> {
    return request(http, { url: "/admin/settings" }, config);
  },

  async patchSettings(body: { voteQuotaPerUser?: number; voteQuotaPeriodHours?: number }, config?: ApiRequestConfig): Promise<{ voteQuotaPerUser: number; voteQuotaPeriodHours: number }> {
    return request(http, { url: "/admin/settings", method: "PATCH", data: body }, config);
  },

  async verifySong(songId: string, addToPlaylistId?: string, config?: ApiRequestConfig): Promise<{ success: boolean }> {
    return request(http, {
      url: `/admin/songs/${songId}/verify`,
      method: "POST",
      data: addToPlaylistId ? { addToPlaylistId } : {},
    }, config);
  },

  async getPlaylists(config?: ApiRequestConfig): Promise<{ playlists: { id: string; name: string; youtubePlaylistUrl?: string; createdAt: string; songCount: number }[] }> {
    return request(http, { url: "/admin/playlists" }, config);
  },

  /** Create playlist. If youtubePlaylistUrl is provided, imports from YT; otherwise creates empty playlist. */
  async createPlaylist(name: string, youtubePlaylistUrl?: string, config?: ApiRequestConfig): Promise<{ success: boolean; playlistId: string; name: string; added: number }> {
    return request(http, {
      url: "/admin/playlists",
      method: "POST",
      data: { name, youtubePlaylistUrl: youtubePlaylistUrl || undefined },
    }, config);
  },

  async syncPlaylist(playlistId: string, config?: ApiRequestConfig): Promise<{ success: boolean; added: number; removed: number; verifying?: number }> {
    return request(http, { url: `/admin/playlists/${playlistId}/sync`, method: "POST" }, config);
  },

  async addSongToPlaylist(playlistId: string, songId: string, config?: ApiRequestConfig): Promise<{ success: boolean }> {
    return request(http, { url: `/admin/playlists/${playlistId}/songs`, method: "POST", data: { songId } }, config);
  },

  async removeSongFromPlaylist(playlistId: string, songId: string, config?: ApiRequestConfig): Promise<{ success: boolean }> {
    return request(http, { url: `/admin/playlists/${playlistId}/songs/${songId}`, method: "DELETE" }, config);
  },

  async deletePlaylist(playlistId: string, config?: ApiRequestConfig): Promise<{ success: boolean }> {
    return request(http, { url: `/admin/playlists/${playlistId}`, method: "DELETE" }, config);
  },

  async patchPlaylist(playlistId: string, body: { name?: string; excludeFromRandom?: boolean; excludeFromVoting?: boolean }, config?: ApiRequestConfig): Promise<{ success: boolean }> {
    return request(http, { url: `/admin/playlists/${playlistId}`, method: "PATCH", data: body }, config);
  },

  async getAdminPlaylist(playlistId: string, config?: ApiRequestConfig): Promise<{
    id: string;
    name: string;
    excludeFromRandom: boolean;
    excludeFromVoting: boolean;
    songs: { id: string; title: string; author: string; coverUrl: string | null; status: string; source: string }[];
  }> {
    return request(http, { url: `/admin/playlists/${playlistId}` }, config);
  },

  async deletePendingSong(songId: string, config?: ApiRequestConfig): Promise<{ success: boolean }> {
    return request(http, { url: `/admin/songs/${songId}`, method: "DELETE" }, config);
  },

  async deleteSongPermanently(songId: string, config?: ApiRequestConfig): Promise<{ success: boolean }> {
    return request(http, { url: `/admin/songs/${songId}/permanent`, method: "DELETE" }, config);
  },

  async rebuildQueue(config?: ApiRequestConfig): Promise<{ success: boolean }> {
    return request(http, { url: "/queue/rebuild", method: "POST" }, config);
  },

  async removeSongFromQueue(songId: string, config?: ApiRequestConfig): Promise<{ success: boolean }> {
    return request(http, { url: `/admin/queue/songs/${songId}`, method: "DELETE" }, config);
  },

  /**
   * @deprecated PATCH /api/admin/songs/:id/queue-votes writes a vote count without a vote record.
   * Use vote().
   */
  async setSongQueueVotes(songId: string, count: number, config?: ApiRequestConfig): Promise<{ success: boolean; count: number }> {
    return request(http, { url: `/admin/songs/${songId}/queue-votes`, method: "PATCH", data: { count } }, config);
  },

  async getEffectivePlaylist(config?: ApiRequestConfig): Promise<{
    /** @deprecated First playlist only. Read `playlists`. */
    playlistId: string | null;
    /** @deprecated Name of `playlistId` only. Read `playlists`. */
    playlistName: string | null;
    playlists?: { id: string; name: string }[];
  }> {
    return request(http, { url: "/effective-playlist" }, config);
  },

  async getPlaylist(playlistId: string, config?: ApiRequestConfig): Promise<{ id: string; name: string; songs: { id: string; title: string; author: string; coverUrl: string | null }[] }> {
    return request(http, { url: `/playlists/${playlistId}` }, config);
  },

  async getRanking(limit?: number, config?: ApiRequestConfig): Promise<{ songs: { id: string; title: string; author: string; coverUrl: string | null; totalVotes: number }[] }> {
    return request(http, { url: "/songs/ranking", params: { limit } }, config);
  },

  async getSongRequests(config?: ApiRequestConfig): Promise<{
    requests: {
      songId: string;
      title: string;
      author: string;
      coverUrl: string | null;
      youtubeUrl: string;
      status: string;
      requestCount: number;
      lastRequestedAt: string;
      createdAt: string;
    }[];
  }> {
    return request(http, { url: "/song-requests" }, config);
  },

  async bumpSongRequest(songId: string, config?: ApiRequestConfig): Promise<{ success: boolean; added: boolean }> {
    return request(http, { url: `/song-requests/${songId}/bump`, method: "POST" }, config);
  },

  async getPlaylistSchedule(config?: ApiRequestConfig): Promise<{
    activePlaylistId: string | null;
    cyclic: { id: string; playlistId: string; dayOfWeek: number }[];
    oneOff: { id: string; playlistId: string; date: string }[];
    activeDays?: number[];
  }> {
    return request(http, { url: "/admin/playlist-schedule" }, config);
  },

  async patchPlaylistSchedule(body: {
    activePlaylistId?: string | null;
    cyclic?: { playlistId: string; dayOfWeek: number }[];
    oneOff?: { playlistId: string; date: string }[];
    activeDays?: number[];
  }, config?: ApiRequestConfig): Promise<{ activePlaylistId: string | null; cyclic: unknown[]; oneOff: unknown[]; activeDays?: number[] }> {
    return request(http, { url: "/admin/playlist-schedule", method: "PATCH", data: body }, config);
  },

  async getSchedule(config?: ApiRequestConfig): Promise<ScheduleConfig> {
    return request(http, { url: "/schedule" }, config);
  },

  async login(email: string, password: string, config?: ApiRequestConfig): Promise<{ token: string; user: { id: string; email: string; isAdmin: boolean } }> {
    return request(http, { url: "/auth/login", method: "POST", data: { email, password } }, config);
  },

  async me(config?: ApiRequestConfig): Promise<{ user: { id: string; email: string; isAdmin: boolean } }> {
    return request(http, { url: "/auth/me" }, config);
  },

  async register(email: string, config?: ApiRequestConfig): Promise<{ success?: boolean; message?: string }> {
    return request(http, { url: "/auth/register", method: "POST", data: { email } }, config);
  },

  async sendMagicLink(email: string, config?: ApiRequestConfig): Promise<{ success: boolean; message?: string }> {
    return request(http, { url: "/auth/send-magic-link", method: "POST", data: { email } }, config);
  },

  async verifyToken(token: string, config?: ApiRequestConfig): Promise<{ token: string; user: { id: string; email: string; isAdmin: boolean } }> {
    return request(http, { url: "/auth/verify", params: { token } }, config);
  },

  async getVoteQuota(config?: ApiRequestConfig): Promise<{ used: number; remaining: number; perUser: number; periodHours: number }> {
    return request(http, { url: "/vote/quota" }, config);
  },

  async getPlayHistory(config?: ApiRequestConfig): Promise<{
    plays: { songId: string; title: string; author: string; startedAt: string; durationSeconds: number | null }[];
  }> {
    return request(http, { url: "/plays" }, config);
  },

  async logout(config?: ApiRequestConfig) {
    await request(http, { url: "/auth/logout", method: "POST" }, config);
  },
};
