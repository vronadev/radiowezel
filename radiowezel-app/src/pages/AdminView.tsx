import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/useRealtime";
import { Music, Loader2, ExternalLink, Settings, Pause, Play, ListMusic, Calendar, RefreshCw, Trash2, Library, Settings2, Download } from "lucide-react";
import { Link } from "react-router-dom";
import type { Song } from "@/types/api";

const DAY_NAMES = ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"];

type DownloadQueueItem = {
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
};

function downloadStatusLabel(status: DownloadQueueItem["status"] | Song["status"]): string {
  if (status === "scheduled_for_download") return "w kolejce";
  if (status === "downloading") return "pobieranie…";
  if (status === "failed") return "błąd";
  if (status === "pending") return "oczekuje";
  if (status === "verified") return "zweryfikowana";
  return status;
}

interface PlaylistItem {
  id: string;
  name: string;
  songCount: number;
  createdAt: string;
  excludeFromRandom?: boolean;
  excludeFromVoting?: boolean;
  youtubePlaylistUrl?: string | null;
}

export function AdminView() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyAddToPlaylistId, setVerifyAddToPlaylistId] = useState<string>("");
  const [playlists, setPlaylists] = useState<PlaylistItem[]>([]);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [importingPlaylist, setImportingPlaylist] = useState(false);
  const [activePlaylistId, setActivePlaylistId] = useState<string>("");
  const [cyclicSchedule, setCyclicSchedule] = useState<Record<number, string>>({});
  const [oneOffList, setOneOffList] = useState<{ id: string; date: string; playlistId: string }[]>([]);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [quotaPerUser, setQuotaPerUser] = useState(5);
  const [quotaPeriodHours, setQuotaPeriodHours] = useState(24);
  const [savingQuota, setSavingQuota] = useState(false);
  const [playerPaused, setPlayerPaused] = useState(false);
  const [syncingPlaylistId, setSyncingPlaylistId] = useState<string | null>(null);
  const [addingToPlaylist, setAddingToPlaylist] = useState<string | null>(null);
  const [deletingSongId, setDeletingSongId] = useState<string | null>(null);
  const [patchingPlaylistId, setPatchingPlaylistId] = useState<string | null>(null);
  const [deletingLibrarySongId, setDeletingLibrarySongId] = useState<string | null>(null);
  const [queueData, setQueueData] = useState<{ nowPlaying: unknown; queue: { id: string; songId: string; title: string; author: string; votes: number }[] } | null>(null);
  const [librarySongs, setLibrarySongs] = useState<Song[]>([]);
  const [requestCounts, setRequestCounts] = useState<Record<string, number>>({});
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [downloadQueue, setDownloadQueue] = useState<{
    maxConcurrency: number;
    activeCount: number;
    queuedCount: number;
    items: DownloadQueueItem[];
  } | null>(null);
  const { toast } = useToast();

  const reviewSongs = songs.filter((song) => song.status === "pending" || song.status === "failed");

  const filteredLibrarySongs = librarySearchQuery.trim()
    ? librarySongs.filter(
        (s) =>
          s.title.toLowerCase().includes(librarySearchQuery.toLowerCase()) ||
          s.author.toLowerCase().includes(librarySearchQuery.toLowerCase())
      )
    : librarySongs;

  const fetchPending = () => {
    api
      .getPendingSongs()
      .then((r) => setSongs((r.songs as Song[])))
      .catch((e) => toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" }))
      .finally(() => setLoading(false));
    api
      .getSongRequests()
      .then((r) => {
        const counts: Record<string, number> = {};
        for (const item of r.requests || []) {
          counts[item.songId] = item.requestCount;
        }
        setRequestCounts(counts);
      })
      .catch(() => {});
  };

  const fetchDownloadQueue = () => {
    api.getDownloadQueue().then(setDownloadQueue).catch(() => {});
  };

  useEffect(() => {
    fetchPending();
  }, []);
  useEffect(() => {
    fetchDownloadQueue();
  }, []);

  useEffect(() => {
    api.getSettings().then((s) => {
      setQuotaPerUser(s.voteQuotaPerUser);
      setQuotaPeriodHours(s.voteQuotaPeriodHours);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.getPlayerState().then((s) => setPlayerPaused(s.paused)).catch(() => {});
  }, []);

  const fetchPlaylists = () => {
    api.getPlaylists().then((r) => setPlaylists(r.playlists)).catch(() => {});
  };
  useEffect(() => {
    fetchPlaylists();
  }, []);

  useEffect(() => {
    api.getQueue().then((d) => setQueueData(d as typeof queueData)).catch(() => {});
  }, []);

  useEffect(() => {
    api.getLibrary(undefined, undefined, 200).then((r) => setLibrarySongs((r.songs as Song[]) || [])).catch(() => {});
  }, []);

  useRealtime(
    ["queue:updated", "votes:changed", "requests:updated", "downloads:updated", "library:updated", "player:updated", "song:playing"],
    () => {
      fetchPending();
      fetchDownloadQueue();
      api.getLibrary(undefined, undefined, 200).then((r) => setLibrarySongs((r.songs as Song[]) || [])).catch(() => {});
      api.getQueue().then((d) => setQueueData(d as typeof queueData)).catch(() => {});
      api.getPlayerState().then((s) => setPlayerPaused(s.paused)).catch(() => {});
    },
  );

  useEffect(() => {
    api.getPlaylistSchedule().then((s) => {
      setActivePlaylistId(s.activePlaylistId || "");
      const cyclic: Record<number, string> = {};
      s.cyclic.forEach((c) => { cyclic[c.dayOfWeek] = c.playlistId; });
      setCyclicSchedule(cyclic);
      setOneOffList(s.oneOff.map((o) => ({ id: o.id, date: o.date, playlistId: o.playlistId })));
    }).catch(() => {});
  }, []);

  const togglePlayerPause = async () => {
    try {
      const s = await api.setPlayerPaused(!playerPaused);
      setPlayerPaused(s.paused);
      toast({ title: s.paused ? "Odtwarzanie wstrzymane" : "Odtwarzanie wznawiane" });
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    }
  };

  const saveQuota = async () => {
    setSavingQuota(true);
    try {
      await api.patchSettings({ voteQuotaPerUser: quotaPerUser, voteQuotaPeriodHours: quotaPeriodHours });
      toast({ title: "Zapisano ustawienia" });
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingQuota(false);
    }
  };

  const verify = async (songId: string) => {
    setVerifyingId(songId);
    try {
      await api.verifySong(songId, verifyAddToPlaylistId || undefined);
      toast({ title: "Dodano do kolejki pobierania", description: "Status zobaczysz w kolejce pobierania. Po sukcesie utwór trafi do biblioteki." });
      fetchPending();
      fetchDownloadQueue();
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setVerifyingId(null);
    }
  };

  const importPlaylist = async () => {
    const name = playlistName.trim();
    const url = playlistUrl.trim();
    if (!name) {
      toast({ title: "Podaj nazwę playlisty", variant: "destructive" });
      return;
    }
    setImportingPlaylist(true);
    try {
      const r = await api.createPlaylist(name, url || undefined);
      if (r.added > 0) {
        toast({ title: "Playlista dodana", description: `Zaimportowano ${r.added} utworów do kolejki pobierania.` });
        fetchDownloadQueue();
      } else {
        toast({ title: "Playlista utworzona", description: "Pusta playlista. Dodaj piosenki w ustawieniach playlisty." });
      }
      setPlaylistName("");
      setPlaylistUrl("");
      fetchPlaylists();
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setImportingPlaylist(false);
    }
  };

  const syncPlaylist = async (playlistId: string) => {
    setSyncingPlaylistId(playlistId);
    try {
      const r = await api.syncPlaylist(playlistId);
      let desc = `Dodano: ${r.added}, usunięto z playlisty: ${r.removed}`;
      if ((r as { verifying?: number }).verifying) desc += `. Pobieranie ${(r as { verifying: number }).verifying} utworów w tle.`;
      toast({ title: "Synchronizacja zakończona", description: desc });
      fetchDownloadQueue();
      fetchPlaylists();
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSyncingPlaylistId(null);
    }
  };

  const deletePlaylist = async (playlistId: string) => {
    if (!confirm("Usunąć tę playlistę? Harmonogram i powiązania zostaną usunięte.")) return;
    try {
      await api.deletePlaylist(playlistId);
      toast({ title: "Playlista usunięta" });
      fetchPlaylists();
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    }
  };

  const toggleExcludeFromRandom = async (pl: PlaylistItem) => {
    const next = !(pl.excludeFromRandom ?? false);
    setPatchingPlaylistId(pl.id);
    try {
      await api.patchPlaylist(pl.id, { excludeFromRandom: next });
      toast({ title: next ? "Wykluczono z losowania" : "Uwzględniono w losowaniu" });
      setPlaylists((prev) => prev.map((p) => (p.id === pl.id ? { ...p, excludeFromRandom: next } : p)));
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPatchingPlaylistId(null);
    }
  };

  const toggleExcludeFromVoting = async (pl: PlaylistItem) => {
    const next = !(pl.excludeFromVoting ?? false);
    setPatchingPlaylistId(pl.id);
    try {
      await api.patchPlaylist(pl.id, { excludeFromVoting: next });
      toast({ title: next ? "Wykluczono z głosowania (gdy nie obowiązuje)" : "Uwzględniono w głosowaniu" });
      setPlaylists((prev) => prev.map((p) => (p.id === pl.id ? { ...p, excludeFromVoting: next } : p)));
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPatchingPlaylistId(null);
    }
  };

  const deletePendingSong = async (songId: string) => {
    if (!confirm("Usunąć to zgłoszenie?")) return;
    setDeletingSongId(songId);
    try {
      await api.deletePendingSong(songId);
      toast({ title: "Zgłoszenie usunięte" });
      fetchPending();
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDeletingSongId(null);
    }
  };

  const removeFromQueue = async (songId: string) => {
    try {
      await api.removeSongFromQueue(songId);
      toast({ title: "Usunięto z kolejki" });
      api.getQueue().then((d) => setQueueData(d as typeof queueData)).catch(() => {});
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    }
  };

  const deleteSongPermanently = async (songId: string) => {
    if (!confirm("Usunąć piosenkę z dysku i z bazy? Zostanie usunięta ze wszystkich playlist. Tej operacji nie można cofnąć.")) return;
    setDeletingLibrarySongId(songId);
    try {
      await api.deleteSongPermanently(songId);
      toast({ title: "Piosenka usunięta z dysku i bazy" });
      setLibrarySongs((prev) => prev.filter((s) => s.id !== songId));
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDeletingLibrarySongId(null);
    }
  };

  const addSongToPlaylist = async (songId: string, playlistId: string) => {
    setAddingToPlaylist(songId);
    try {
      await api.addSongToPlaylist(playlistId, songId);
      toast({ title: "Piosenka dodana do playlisty" });
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setAddingToPlaylist(null);
    }
  };

  const savePlaylistSchedule = async () => {
    setScheduleSaving(true);
    try {
      await api.patchPlaylistSchedule({
        activePlaylistId: activePlaylistId || null,
        cyclic: Object.entries(cyclicSchedule)
          .filter(([, pid]) => pid)
          .map(([day, playlistId]) => ({ playlistId, dayOfWeek: parseInt(day, 10) })),
        oneOff: oneOffList.filter((o) => o.date && o.playlistId).map((o) => ({ date: o.date, playlistId: o.playlistId })),
      });
      toast({ title: "Zapisano harmonogram playlist" });
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setScheduleSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Ładowanie…</p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-6 p-4 overflow-x-hidden">
      <h1 className="text-2xl font-bold">Panel administracji</h1>

      <Tabs defaultValue="requests" className="w-full">
        <TabsList className="mb-4 flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="requests">Nowe zgłoszenia</TabsTrigger>
          <TabsTrigger value="downloads">Kolejka pobierania</TabsTrigger>
          {/* <TabsTrigger value="queue">Kolejka</TabsTrigger> */}
          <TabsTrigger value="library">Biblioteka</TabsTrigger>
          <TabsTrigger value="playlists">Playlisty</TabsTrigger>
          <TabsTrigger value="schedule">Harmonogram</TabsTrigger>
          <TabsTrigger value="player">Odtwarzacz</TabsTrigger>
          <TabsTrigger value="quota">Limit głosów</TabsTrigger>
        </TabsList>

      <TabsContent value="player">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Odtwarzacz
          </CardTitle>
          <CardDescription>
            Wstrzymaj lub wznów odtwarzanie kolejki w czasie przerw.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant={playerPaused ? "default" : "secondary" } onClick={togglePlayerPause}>
            {playerPaused ? <Play className="h-4 w-4 mr-2" /> : <Pause className="h-4 w-4 mr-2" />}
            {playerPaused ? "Wznów odtwarzanie" : "Wstrzymaj odtwarzanie"}
          </Button>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="quota">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Limit głosów (quota)
          </CardTitle>
          <CardDescription>
            Maksymalna liczba głosów na użytkownika w zadanym okresie (np. 5 głosów na 24h).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="quota-per-user">Głosów na użytkownika</Label>
            <Input
              id="quota-per-user"
              type="number"
              min={1}
              max={100}
              value={quotaPerUser}
              onChange={(e) => setQuotaPerUser(parseInt(e.target.value, 10) || 5)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quota-period">Okres (godziny)</Label>
            <Input
              id="quota-period"
              type="number"
              min={1}
              max={168}
              value={quotaPeriodHours}
              onChange={(e) => setQuotaPeriodHours(parseInt(e.target.value, 10) || 24)}
            />
          </div>
          <Button onClick={saveQuota} disabled={savingQuota}>
            {savingQuota ? "Zapisywanie…" : "Zapisz"}
          </Button>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="requests">
      <Card>
        <CardHeader>
          <CardTitle>Nowe zgłoszenia</CardTitle>
          <CardDescription>
            Piosenki czekające na weryfikację. Po zatwierdzeniu zostaną pobrane jako MP3 i trafią do biblioteki. Opcjonalnie dodaj zatwierdzoną piosenkę do playlisty.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-muted-foreground">Przy zatwierdzaniu dodaj do playlisty:</Label>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={verifyAddToPlaylistId}
              onChange={(e) => setVerifyAddToPlaylistId(e.target.value)}
            >
              <option value="">Brak</option>
              {playlists.map((pl) => (
                <option key={pl.id} value={pl.id}>{pl.name} ({pl.songCount})</option>
              ))}
            </select>
          </div>
          {reviewSongs.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Brak nowych zgłoszeń.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Okładka</TableHead>
                  <TableHead>Tytuł</TableHead>
                  <TableHead>Autor</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Zgłoszenia</TableHead>
                  <TableHead>Dodaj do playlisty</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviewSongs.map((song) => (
                  <TableRow key={song.id}>
                    <TableCell>
                      <Avatar className="h-10 w-10 rounded">
                        <AvatarImage src={song.coverUrl ?? undefined} />
                        <AvatarFallback><Music className="h-4 w-4" /></AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">{song.title}</TableCell>
                    <TableCell>{song.author}</TableCell>
                    <TableCell>
                      <a
                        href={song.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        YouTube <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          song.status === "pending" ? "secondary" : song.status === "failed" ? "destructive" : "outline"
                        }
                      >
                        {downloadStatusLabel(song.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>{requestCounts[song.id] ?? 0}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        <select
                          className="rounded border border-input bg-background px-2 py-1 text-xs max-w-[140px]"
                          id={`add-pl-${song.id}`}
                        >
                          <option value="">- wybierz -</option>
                          {playlists.map((pl) => (
                            <option key={pl.id} value={pl.id}>{pl.name}</option>
                          ))}
                        </select>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => {
                            const sel = document.getElementById(`add-pl-${song.id}`) as HTMLSelectElement;
                            const plId = sel?.value;
                            if (plId) addSongToPlaylist(song.id, plId);
                          }}
                          disabled={addingToPlaylist !== null}
                        >
                          {addingToPlaylist === song.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Dodaj"}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right flex gap-1 justify-end flex-wrap">
                      <Button
                        size="sm"
                        onClick={() => verify(song.id)}
                        disabled={verifyingId !== null || song.status === "downloading"}
                      >
                        {verifyingId === song.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : song.status === "failed" ? (
                          "Ponów pobieranie"
                        ) : (
                          "Zatwierdź i pobierz"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deletePendingSong(song.id)}
                        disabled={deletingSongId !== null}
                      >
                        {deletingSongId === song.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="downloads">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Kolejka pobierania
          </CardTitle>
          <CardDescription>
            Utwory zaplanowane i aktualnie pobierane (w tym import z YouTube). Po udanym pobraniu status zmienia się na zweryfikowany i utwór trafia do biblioteki.
            {downloadQueue
              ? ` Aktywne: ${downloadQueue.activeCount}/${downloadQueue.maxConcurrency}, w kolejce: ${downloadQueue.queuedCount}.`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!downloadQueue?.items.length ? (
            <p className="text-sm text-muted-foreground">Kolejka pobierania jest pusta.</p>
          ) : (
            <div className="space-y-2 max-h-[360px] overflow-auto">
              {downloadQueue.items.map((item) => (
                <div key={item.songId} className="flex items-center gap-2 rounded border p-2 flex-wrap">
                  <Avatar className="h-8 w-8 rounded">
                    <AvatarImage src={item.coverUrl ?? undefined} />
                    <AvatarFallback><Music className="h-3 w-3" /></AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {item.author}
                      {item.queuePosition != null ? ` · pozycja ${item.queuePosition}` : ""}
                      {item.attempts > 0 ? ` · próba ${item.attempts}/${item.maxAttempts}` : ""}
                    </p>
                    {item.lastError ? (
                      <p className="text-xs text-destructive truncate" title={item.lastError}>{item.lastError}</p>
                    ) : null}
                  </div>
                  <Badge variant={item.status === "failed" ? "destructive" : item.status === "downloading" ? "outline" : "secondary"}>
                    {downloadStatusLabel(item.status)}
                  </Badge>
                  {item.status === "failed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => verify(item.songId)}
                      disabled={verifyingId !== null}
                    >
                      {verifyingId === item.songId ? <Loader2 className="h-3 w-3 animate-spin" /> : "Ponów"}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </TabsContent>

      {/* <TabsContent value="queue">
      <Card>
        <CardHeader>
          <CardTitle>Kolejka - zarządzanie</CardTitle>
          <CardDescription>
            Usuń utwór z kolejki. Ręczne ustawianie liczby głosów jest wyłączone, bo fałszowało historię głosów.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {queueData?.queue?.length === 0 && !queueData?.nowPlaying ? (
            <p className="text-muted-foreground text-sm">Kolejka jest pusta.</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-auto">
              {(queueData?.queue || []).map((item: { id: string; songId: string; title: string; author: string; votes: number }, idx: number) => (
                <div key={item.id+" | "+idx} className="flex items-center gap-2 rounded border p-2 flex-wrap">
                  <span className="font-medium truncate flex-1 min-w-0">{item.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{item.votes} głosów</span>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeFromQueue(item.songId)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </TabsContent> */}

      <TabsContent value="library">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" />
            Biblioteka - dodaj do playlisty
          </CardTitle>
          <CardDescription>
            Zweryfikowane piosenki. Możesz dodać dowolną do istniejącej playlisty.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Szukaj po tytule lub autorze..."
              className="max-w-[280px]"
              value={librarySearchQuery}
              onChange={(e) => setLibrarySearchQuery(e.target.value)}
            />
          </div>
          {librarySongs.length === 0 ? (
            <p className="text-muted-foreground text-sm">Brak piosenek w bibliotece.</p>
          ) : filteredLibrarySongs.length === 0 ? (
            <p className="text-muted-foreground text-sm">Brak wyników wyszukiwania.</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-auto">
              {filteredLibrarySongs.slice(0, 50).map((song) => (
                <div key={song.id} className="flex items-center gap-2 rounded border p-2 flex-wrap">
                  <Avatar className="h-8 w-8 rounded">
                    <AvatarImage src={song.coverUrl ?? undefined} />
                    <AvatarFallback><Music className="h-3 w-3" /></AvatarFallback>
                  </Avatar>
                  <span className="font-medium truncate flex-1 min-w-0">{song.title}</span>
                  <select
                    className="rounded border border-input bg-background px-2 py-1 text-xs max-w-[140px]"
                    id={`lib-pl-${song.id}`}
                  >
                    <option value="">- playlisty -</option>
                    {playlists.map((pl) => (
                      <option key={pl.id} value={pl.id}>{pl.name}</option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      const sel = document.getElementById(`lib-pl-${song.id}`) as HTMLSelectElement;
                      const plId = sel?.value;
                      if (plId) addSongToPlaylist(song.id, plId);
                    }}
                    disabled={addingToPlaylist !== null}
                  >
                    {addingToPlaylist === song.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Dodaj"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => deleteSongPermanently(song.id)}
                    disabled={deletingLibrarySongId !== null}
                    title="Usuń z dysku i z bazy (ze wszystkich playlist)"
                  >
                    {deletingLibrarySongId === song.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  </Button>
                </div>
              ))}
              {filteredLibrarySongs.length > 50 && <p className="text-muted-foreground text-xs">Pokazano 50 z {filteredLibrarySongs.length}</p>}
            </div>
          )}
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="playlists">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListMusic className="h-5 w-5" />
            Playlisty
          </CardTitle>
          <CardDescription>
            Playlista ogranicza odtwarzanie do wybranych piosenek. Możesz utworzyć pustą playlistę (tylko nazwa) lub dodać z linku YouTube — utwory trafią do kolejki pobierania i po sukcesie do biblioteki.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Nazwa playlisty"
              className="max-w-[200px]"
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
            />
            <Input
              placeholder="Link do playlisty YouTube (opcjonalnie)"
              className="flex-1 min-w-[200px]"
              value={playlistUrl}
              onChange={(e) => setPlaylistUrl(e.target.value)}
            />
            <Button onClick={importPlaylist} disabled={importingPlaylist}>
              {importingPlaylist ? <Loader2 className="h-4 w-4 animate-spin" /> : "Dodaj playlistę"}
            </Button>
          </div>
          {playlists.length > 0 && (
            <ul className="text-sm space-y-2">
              {playlists.map((pl) => (
                <li key={pl.id} className="flex items-center gap-2 flex-wrap items-center">
                  <Link to={`/playlist/${pl.id}`} className="font-medium text-primary hover:underline">
                    {pl.name}
                  </Link>
                  {pl.youtubePlaylistUrl && (
                    <a
                      href={pl.youtubePlaylistUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary text-xs underline"
                      title="Playlista na YouTube"
                    >
                      YT
                    </a>
                  )}
                  <span className="text-muted-foreground">- {pl.songCount} utworów</span>
                  <label className="flex items-center gap-1 cursor-pointer" title={activePlaylistId === pl.id ? "Gdy playlista obowiązuje, wykluczenie nie ma skutku" : ""}>
                    <input
                      type="checkbox"
                      checked={!!pl.excludeFromRandom}
                      onChange={() => toggleExcludeFromRandom(pl)}
                      disabled={patchingPlaylistId !== null || activePlaylistId === pl.id}
                      className="rounded border-input"
                    />
                    <span className="text-xs text-muted-foreground">Wyklucz z losowania</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer" title={activePlaylistId === pl.id ? "Gdy playlista obowiązuje, nie dotyczy" : "Gdy ta playlista nie obowiązuje, nie można głosować na piosenki z niej"}>
                    <input
                      type="checkbox"
                      checked={!!pl.excludeFromVoting}
                      onChange={() => toggleExcludeFromVoting(pl)}
                      disabled={patchingPlaylistId !== null || activePlaylistId === pl.id}
                      className="rounded border-input"
                    />
                    <span className="text-xs text-muted-foreground">Nie można głosować (gdy nie obowiązuje)</span>
                  </label>
                  <Link to={`/admin/playlist/${pl.id}`}>
                    <Button size="sm" variant="ghost" className="h-7">
                      <Settings2 className="h-3 w-3" />
                      <span className="ml-1">Ustawienia</span>
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => syncPlaylist(pl.id)}
                    disabled={syncingPlaylistId !== null || !pl.youtubePlaylistUrl}
                    title={!pl.youtubePlaylistUrl ? "Synchronizacja tylko dla playlist z linkiem YouTube" : "Synchronizuj z YouTube"}
                  >
                    {syncingPlaylistId === pl.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    <span className="ml-1">Synchronizuj</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deletePlaylist(pl.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="schedule">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Harmonogram playlist
          </CardTitle>
          <CardDescription>
            Domyślna playlista ogranicza, co może być odtwarzane. Harmonogram cykliczny (np. piątek) i jednorazowe daty nadpisują domyślną.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Domyślna playlista (ograniczenie odtwarzania)</Label>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm w-full max-w-xs"
              value={activePlaylistId}
              onChange={(e) => setActivePlaylistId(e.target.value)}
            >
              <option value="">Brak (wszystkie zweryfikowane)</option>
              {playlists.map((pl) => (
                <option key={pl.id} value={pl.id}>{pl.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Cyklicznie (dzień tygodnia → playlista)</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DAY_NAMES.map((name, dayOfWeek) => (
                <div key={dayOfWeek} className="flex items-center gap-2">
                  <span className="w-28 text-sm">{name}</span>
                  <select
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm flex-1"
                    value={cyclicSchedule[dayOfWeek] || ""}
                    onChange={(e) => setCyclicSchedule((prev) => ({ ...prev, [dayOfWeek]: e.target.value }))}
                  >
                    <option value="">-</option>
                    {playlists.map((pl) => (
                      <option key={pl.id} value={pl.id}>{pl.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Jednorazowo (data → playlista)</Label>
            {oneOffList.map((o) => (
              <div key={o.id} className="flex items-center gap-2 flex-wrap">
                <Input
                  type="date"
                  className="w-40"
                  value={o.date}
                  onChange={(e) => setOneOffList((prev) => prev.map((x) => x.id === o.id ? { ...x, date: e.target.value } : x))}
                />
                <select
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm flex-1 min-w-[120px]"
                  value={o.playlistId}
                  onChange={(e) => setOneOffList((prev) => prev.map((x) => x.id === o.id ? { ...x, playlistId: e.target.value } : x))}
                >
                  <option value="">-</option>
                  {playlists.map((pl) => (
                    <option key={pl.id} value={pl.id}>{pl.name}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setOneOffList((prev) => prev.filter((x) => x.id !== o.id))}
                >
                  Usuń
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOneOffList((prev) => [...prev, { id: crypto.randomUUID(), date: "", playlistId: "" }])}
            >
              + Dodaj datę
            </Button>
          </div>
          <Button onClick={savePlaylistSchedule} disabled={scheduleSaving}>
            {scheduleSaving ? "Zapisywanie…" : "Zapisz harmonogram"}
          </Button>
        </CardContent>
      </Card>
      </TabsContent>
      </Tabs>
    </div>
  );
}
