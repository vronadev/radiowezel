const API = "/api";

function getHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json"
  };
}

function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { cache: "no-store", ...init });
}

async function handleRes<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  async getQueue(): Promise<{ nowPlaying: unknown | null; queue: unknown[]; schedule?: { currentSlot: { start: string; end: string } | null; nextSlot: { start: string; end: string } | null; inBreak: boolean } }> {
    const res = await apiFetch(`${API}/queue`, { credentials: "include" });
    return handleRes(res);
  },

  async getPublicQueue(): Promise<{ nowPlaying: unknown | null; queue: unknown[]; schedule?: { currentSlot: { start: string; end: string } | null; nextSlot: { start: string; end: string } | null; inBreak: boolean } }> {
    const res = await apiFetch(`${API}/public/queue`);
    return handleRes(res);
  },

  async getLibrary(query?: string, sort?: string, limit?: number, offset?: number): Promise<{ songs: unknown[] }> {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (sort) params.set("sort", sort);
    if (limit != null) params.set("limit", String(limit));
    if (offset != null) params.set("offset", String(offset));
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await apiFetch(`${API}/songs/library${qs}`, { credentials: "include" });
    return handleRes(res);
  },

  async vote(body: { songId?: string; youtubeUrl?: string }): Promise<{ success: boolean; message?: string }> {
    const res = await apiFetch(`${API}/vote`, {
      method: "POST",
      headers: getHeaders(),
      credentials: "include",
      body: JSON.stringify(body),
    });
    return handleRes(res);
  },

  async getPendingSongs(): Promise<{ songs: unknown[] }> {
    const res = await apiFetch(`${API}/admin/songs/pending`, { credentials: "include" });
    return handleRes(res);
  },

  async getDownloadQueue(): Promise<{
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
    const res = await apiFetch(`${API}/admin/songs/download-queue`, { credentials: "include" });
    return handleRes(res);
  },

  async getPlayerState(): Promise<{ paused: boolean }> {
    const res = await apiFetch(`${API}/admin/player`, { credentials: "include" });
    return handleRes(res);
  },

  async setPlayerPaused(paused: boolean): Promise<{ paused: boolean }> {
    const res = await apiFetch(`${API}/admin/player`, {
      method: "PATCH",
      headers: getHeaders(), credentials: "include",
      body: JSON.stringify({ paused }),
    });
    return handleRes(res);
  },

  async skipCurrentSong(): Promise<{ success: boolean }> {
    const res = await apiFetch(`${API}/admin/player/skip`, { method: "POST", headers: getHeaders(), credentials: "include" });
    return handleRes(res);
  },

  async getSongFileBlobUrl(songId: string): Promise<string> {
    const res = await apiFetch(`${API}/songs/${songId}/file`, { credentials: "include" });
    if (!res.ok) throw new Error("Plik nie znaleziony");
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  async getSettings(): Promise<{ voteQuotaPerUser: number; voteQuotaPeriodHours: number }> {
    const res = await apiFetch(`${API}/admin/settings`, { credentials: "include" });
    return handleRes(res);
  },

  async patchSettings(body: { voteQuotaPerUser?: number; voteQuotaPeriodHours?: number }): Promise<{ voteQuotaPerUser: number; voteQuotaPeriodHours: number }> {
    const res = await apiFetch(`${API}/admin/settings`, {
      method: "PATCH",
      headers: getHeaders(),
      credentials: "include",
      body: JSON.stringify(body),
    });
    return handleRes(res);
  },

  async verifySong(songId: string, addToPlaylistId?: string): Promise<{ success: boolean }> {
    const res = await apiFetch(`${API}/admin/songs/${songId}/verify`, {
      method: "POST",
      headers: getHeaders(), credentials: "include",
      body: JSON.stringify(addToPlaylistId ? { addToPlaylistId } : {}),
    });
    return handleRes(res);
  },

  async getPlaylists(): Promise<{ playlists: { id: string; name: string; youtubePlaylistUrl?: string; createdAt: string; songCount: number }[] }> {
    const res = await apiFetch(`${API}/admin/playlists`, { credentials: "include" });
    return handleRes(res);
  },

  /** Create playlist. If youtubePlaylistUrl is provided, imports from YT; otherwise creates empty playlist. */
  async createPlaylist(name: string, youtubePlaylistUrl?: string): Promise<{ success: boolean; playlistId: string; name: string; added: number }> {
    const res = await apiFetch(`${API}/admin/playlists`, {
      method: "POST",
      headers: getHeaders(),
      credentials: "include",
      body: JSON.stringify({ name, youtubePlaylistUrl: youtubePlaylistUrl || undefined }),
    });
    return handleRes(res);
  },

  async syncPlaylist(playlistId: string): Promise<{ success: boolean; added: number; removed: number; verifying?: number }> {
    const res = await apiFetch(`${API}/admin/playlists/${playlistId}/sync`, { method: "POST", headers: getHeaders(), credentials: "include" });
    return handleRes(res);
  },

  async addSongToPlaylist(playlistId: string, songId: string): Promise<{ success: boolean }> {
    const res = await apiFetch(`${API}/admin/playlists/${playlistId}/songs`, {
      method: "POST",
      headers: getHeaders(),
      credentials: "include",
      body: JSON.stringify({ songId }),
    });
    return handleRes(res);
  },

  async removeSongFromPlaylist(playlistId: string, songId: string): Promise<{ success: boolean }> {
    const res = await apiFetch(`${API}/admin/playlists/${playlistId}/songs/${songId}`, { method: "DELETE", headers: getHeaders(), credentials: "include" });
    return handleRes(res);
  },

  async deletePlaylist(playlistId: string): Promise<{ success: boolean }> {
    const res = await apiFetch(`${API}/admin/playlists/${playlistId}`, { method: "DELETE", headers: getHeaders(), credentials: "include" });
    return handleRes(res);
  },

  async patchPlaylist(playlistId: string, body: { name?: string; excludeFromRandom?: boolean; excludeFromVoting?: boolean }): Promise<{ success: boolean }> {
    const res = await apiFetch(`${API}/admin/playlists/${playlistId}`, {
      method: "PATCH",
      headers: getHeaders(), credentials: "include",
      body: JSON.stringify(body),
    });
    return handleRes(res);
  },

  async getAdminPlaylist(playlistId: string): Promise<{
    id: string;
    name: string;
    excludeFromRandom: boolean;
    excludeFromVoting: boolean;
    songs: { id: string; title: string; author: string; coverUrl: string | null; status: string; source: string }[];
  }> {
    const res = await apiFetch(`${API}/admin/playlists/${playlistId}`, { credentials: "include" });
    return handleRes(res);
  },

  async deletePendingSong(songId: string): Promise<{ success: boolean }> {
    const res = await apiFetch(`${API}/admin/songs/${songId}`, { method: "DELETE", headers: getHeaders(), credentials: "include" });
    return handleRes(res);
  },

  async deleteSongPermanently(songId: string): Promise<{ success: boolean }> {
    const res = await apiFetch(`${API}/admin/songs/${songId}/permanent`, { method: "DELETE", headers: getHeaders(), credentials: "include" });
    return handleRes(res);
  },

  async removeSongFromQueue(songId: string): Promise<{ success: boolean }> {
    const res = await apiFetch(`${API}/admin/queue/songs/${songId}`, { method: "DELETE", headers: getHeaders(), credentials: "include" });
    return handleRes(res);
  },

  async setSongQueueVotes(songId: string, count: number): Promise<{ success: boolean; count: number }> {
    const res = await apiFetch(`${API}/admin/songs/${songId}/queue-votes`, {
      method: "PATCH",
      headers: getHeaders(), credentials: "include",
      body: JSON.stringify({ count }),
    });
    return handleRes(res);
  },

  async getEffectivePlaylist(): Promise<{ playlistId: string | null; playlistName: string | null }> {
    const res = await apiFetch(`${API}/effective-playlist`, { credentials: "include" });
    return handleRes(res);
  },

  async getPlaylist(playlistId: string): Promise<{ id: string; name: string; songs: { id: string; title: string; author: string; coverUrl: string | null }[] }> {
    const res = await apiFetch(`${API}/playlists/${playlistId}`, { credentials: "include" });
    return handleRes(res);
  },

  async getRanking(limit?: number): Promise<{ songs: { id: string; title: string; author: string; coverUrl: string | null; totalVotes: number }[] }> {
    const qs = limit != null ? `?limit=${limit}` : "";
    const res = await apiFetch(`${API}/songs/ranking${qs}`, { credentials: "include" });
    return handleRes(res);
  },

  async getSongRequests(): Promise<{
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
    const res = await apiFetch(`${API}/song-requests`, { credentials: "include" });
    return handleRes(res);
  },

  async bumpSongRequest(songId: string): Promise<{ success: boolean; added: boolean }> {
    const res = await apiFetch(`${API}/song-requests/${songId}/bump`, {
      method: "POST",
      headers: getHeaders(),
      credentials: "include",
    });
    return handleRes(res);
  },

  async getPlaylistSchedule(): Promise<{
    activePlaylistId: string | null;
    cyclic: { id: string; playlistId: string; dayOfWeek: number }[];
    oneOff: { id: string; playlistId: string; date: string }[];
  }> {
    const res = await apiFetch(`${API}/admin/playlist-schedule`, { credentials: "include" });
    return handleRes(res);
  },

  async patchPlaylistSchedule(body: {
    activePlaylistId?: string | null;
    cyclic?: { playlistId: string; dayOfWeek: number }[];
    oneOff?: { playlistId: string; date: string }[];
  }): Promise<{ activePlaylistId: string | null; cyclic: unknown[]; oneOff: unknown[] }> {
    const res = await apiFetch(`${API}/admin/playlist-schedule`, {
      method: "PATCH",
      headers: getHeaders(),
      credentials: "include",
      body: JSON.stringify(body),
    });
    return handleRes(res);
  },

  async getSchedule(): Promise<{ slots: { start: string; end: string }[]; bellOffsetSeconds: number; fadeOutSecondsBeforeEnd: number }> {
    const res = await apiFetch(`${API}/schedule`, { credentials: "include" });
    return handleRes(res);
  },

  async login(email: string, password: string): Promise<{ token: string; user: { id: string; email: string; isAdmin: boolean } }> {
    const res = await apiFetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    return handleRes(res);
  },

  async me(): Promise<{ user: { id: string; email: string; isAdmin: boolean } }> {
    const res = await apiFetch(`${API}/auth/me`, { credentials: "include" });
    return handleRes(res);
  },

  async sendMagicLink(email: string): Promise<{ success: boolean; message?: string }> {
    const res = await apiFetch(`${API}/auth/send-magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return handleRes(res);
  },

  async verifyToken(token: string): Promise<{ token: string; user: { id: string; email: string; isAdmin: boolean } }> {
    const res = await apiFetch(`${API}/auth/verify?token=${encodeURIComponent(token)}`, { credentials: "include" });
    return handleRes(res);
  },

  async getVoteQuota(): Promise<{ used: number; remaining: number; perUser: number; periodHours: number }> {
    const res = await apiFetch(`${API}/vote/quota`, { credentials: "include" });
    return handleRes(res);
  },

  async getPlayHistory(): Promise<{
    plays: { songId: string; title: string; author: string; startedAt: string; durationSeconds: number | null }[];
  }> {
    const res = await apiFetch(`${API}/plays`, { credentials: "include" });
    return handleRes(res);
  },

  async logout() {
    await apiFetch(`${API}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  }
};
