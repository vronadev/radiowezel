import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Music, Loader2, ArrowLeft, Plus, Trash2 } from "lucide-react";

interface PlaylistSong {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  status: string;
  source: string;
}

interface LibrarySong {
  id: string;
  title: string;
  author: string;
  coverUrl?: string | null;
}

export function AdminPlaylistView() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const [playlist, setPlaylist] = useState<{
    id: string;
    name: string;
    excludeFromRandom: boolean;
    excludeFromVoting: boolean;
    youtubePlaylistUrl?: string | null;
    songs: PlaylistSong[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [patchingExclude, setPatchingExclude] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [libraryResults, setLibraryResults] = useState<LibrarySong[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addingSongId, setAddingSongId] = useState<string | null>(null);
  const [removingSongId, setRemovingSongId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchPlaylist = () => {
    if (!playlistId) return;
    api
      .getAdminPlaylist(playlistId)
      .then(setPlaylist)
      .catch(() => setPlaylist(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPlaylist();
  }, [playlistId]);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setLibraryResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const r = await api.getLibrary(trimmed, undefined, 30);
      setLibraryResults((r.songs as LibrarySong[]) || []);
    } catch {
      setLibraryResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, runSearch]);

  const addSongToPlaylist = async (songId: string) => {
    if (!playlistId || !playlist) return;
    setAddingSongId(songId);
    try {
      await api.addSongToPlaylist(playlistId, songId);
      toast({ title: "Dodano do playlisty" });
      fetchPlaylist();
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setAddingSongId(null);
    }
  };

  const removeSongFromPlaylist = async (songId: string) => {
    if (!playlistId || !playlist) return;
    setRemovingSongId(songId);
    try {
      await api.removeSongFromPlaylist(playlistId, songId);
      toast({ title: "Usunięto z playlisty" });
      fetchPlaylist();
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRemovingSongId(null);
    }
  };

  const playlistSongIds = new Set(playlist?.songs.map((s) => s.id) ?? []);

  const toggleExcludeFromRandom = async () => {
    if (!playlist) return;
    setPatchingExclude("random");
    try {
      await api.patchPlaylist(playlist.id, { excludeFromRandom: !playlist.excludeFromRandom });
      toast({ title: playlist.excludeFromRandom ? "Uwzględniono w losowaniu" : "Wykluczono z losowania" });
      setPlaylist((p) => (p ? { ...p, excludeFromRandom: !p.excludeFromRandom } : p));
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPatchingExclude(null);
    }
  };

  const toggleExcludeFromVoting = async () => {
    if (!playlist) return;
    setPatchingExclude("voting");
    try {
      await api.patchPlaylist(playlist.id, { excludeFromVoting: !playlist.excludeFromVoting });
      toast({ title: playlist.excludeFromVoting ? "Uwzględniono w głosowaniu" : "Wykluczono z głosowania (gdy nie obowiązuje)" });
      setPlaylist((p) => (p ? { ...p, excludeFromVoting: !p.excludeFromVoting } : p));
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPatchingExclude(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="p-4">
        <p className="text-destructive">Nie znaleziono playlisty.</p>
        <Link to="/admin" className="text-primary underline mt-2 inline-block">Wróć do panelu</Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Link to="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold">Ustawienia playlisty</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {playlist.name}
            {playlist.youtubePlaylistUrl && (
              <a
                href={playlist.youtubePlaylistUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-normal text-muted-foreground hover:text-primary underline"
                title="Otwórz playlistę na YouTube"
              >
                YouTube
              </a>
            )}
          </CardTitle>
          <CardDescription>
            Gdy ta playlista jest ustawiona jako obowiązująca, wykluczenie z losowania i z głosowania nie mają skutku.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={playlist.excludeFromRandom}
              onChange={toggleExcludeFromRandom}
              disabled={patchingExclude !== null}
              className="rounded border-input"
            />
            <span>Wyklucz piosenki z tej playlisty z losowania (gdy playlista nie obowiązuje)</span>
            {patchingExclude === "random" && <Loader2 className="h-4 w-4 animate-spin" />}
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={playlist.excludeFromVoting}
              onChange={toggleExcludeFromVoting}
              disabled={patchingExclude !== null}
              className="rounded border-input"
            />
            <span>Nie można głosować na piosenki z tej playlisty (gdy playlista nie obowiązuje)</span>
            {patchingExclude === "voting" && <Loader2 className="h-4 w-4 animate-spin" />}
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Piosenki w playliście</CardTitle>
          <CardDescription>
            {playlist.songs.length} {playlist.songs.length === 1 ? "utwór" : "utworów"}. Wyszukaj w bibliotece i dodaj utwory do playlisty.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder="Szukaj w bibliotece (tytuł, autor)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />
            {searchLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Szukam…
              </div>
            )}
            {!searchLoading && searchQuery.trim() && libraryResults.length > 0 && (
              <ul className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                {libraryResults.map((song) => {
                  const inPlaylist = playlistSongIds.has(song.id);
                  return (
                    <li key={song.id} className="flex items-center gap-3 p-2">
                      <Avatar className="h-8 w-8 rounded flex-shrink-0">
                        <AvatarImage src={song.coverUrl ?? undefined} />
                        <AvatarFallback><Music className="h-3 w-3" /></AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{song.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{song.author}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={inPlaylist || addingSongId !== null}
                        onClick={() => addSongToPlaylist(song.id)}
                      >
                        {addingSongId === song.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-1" />
                            {inPlaylist ? "W playliście" : "Dodaj do playlisty"}
                          </>
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {!searchLoading && searchQuery.trim() && libraryResults.length === 0 && (
              <p className="text-sm text-muted-foreground">Brak wyników w bibliotece.</p>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Utwory w playliście</p>
            {playlist.songs.length === 0 ? (
              <p className="text-muted-foreground text-sm">Brak piosenek w playliście.</p>
            ) : (
              <ul className="space-y-2">
                {playlist.songs.map((song) => (
                  <li key={song.id} className="flex items-center gap-3 rounded-lg border p-2">
                    <Avatar className="h-10 w-10 rounded flex-shrink-0">
                      <AvatarImage src={song.coverUrl ?? undefined} />
                      <AvatarFallback><Music className="h-4 w-4" /></AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{song.title}</p>
                      <p className="text-sm text-muted-foreground truncate">{song.author}</p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {song.status === "scheduled_for_download"
                        ? "w kolejce"
                        : song.status === "downloading"
                          ? "pobieranie…"
                          : song.status === "verified"
                            ? "zweryfikowana"
                            : song.status === "failed"
                              ? "błąd"
                              : song.status}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={removingSongId !== null}
                      onClick={() => removeSongFromPlaylist(song.id)}
                      title="Usuń z playlisty (tylko w aplikacji)"
                    >
                      {removingSongId === song.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 mr-1" />
                          Usuń z playlisty
                        </>
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
