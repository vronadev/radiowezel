import { useState, useCallback, useEffect } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Music, Search, Play, ThumbsUp } from "lucide-react";
import { Link } from "react-router-dom";
import type { Song, SongRequestAggregate } from "@/types/api";
import { RequestedSongsGrid } from "@/components/RequestedSongsGrid";
import { useSongPreview } from "@/hooks/useSongPreview";
import { useRealtime } from "@/hooks/useRealtime";

const LIBRARY_PAGE = 25;

export function VoteView() {
  const [ytUrl, setYtUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [library, setLibrary] = useState<Song[]>([]);
  const [featuredSongs, setFeaturedSongs] = useState<Song[]>([]);
  const [mostRequested, setMostRequested] = useState<SongRequestAggregate[]>([]);
  const [featuredHasMore, setFeaturedHasMore] = useState(true);
  const [libraryHasMore, setLibraryHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bumpingId, setBumpingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { previewSongId, youtubeEmbedUrl, playFilePreview, playYoutubePreview } = useSongPreview();

  const loadRequests = useCallback(() => {
    return api
      .getSongRequests()
      .then((r) => setMostRequested(Array.isArray(r.requests) ? r.requests : []))
      .catch(() => setMostRequested([]));
  }, []);

  const loadFeatured = useCallback((offset = 0, append = false) => {
    return api
      .getLibrary(undefined, "votes", LIBRARY_PAGE, offset)
      .then((r) => {
        const songs = Array.isArray(r?.songs) ? (r.songs as Song[]) : [];
        setFeaturedHasMore(songs.length === LIBRARY_PAGE);
        setFeaturedSongs((prev) => (append ? [...prev, ...songs.filter((song) => !prev.some((p) => p.id === song.id))] : songs));
      })
      .catch(() => {
        if (!append) {
          setFeaturedSongs([]);
        }
        setFeaturedHasMore(false);
      });
  }, []);

  const executeSearch = useCallback(async (query: string, offset = 0, append = false) => {
    const q = query.trim();
    if (!q) {
      setLibrary([]);
      setLibraryHasMore(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const r = await api.getLibrary(q, undefined, LIBRARY_PAGE, offset);
      const songs = Array.isArray(r.songs) ? (r.songs as Song[]) : [];
      setLibraryHasMore(songs.length === LIBRARY_PAGE);
      setLibrary((prev) => (append ? [...prev, ...songs.filter((song) => !prev.some((p) => p.id === song.id))] : songs));
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
      if (!append) {
        setLibrary([]);
      }
      setLibraryHasMore(false);
    } finally {
      setSearching(false);
    }
  }, [toast]);

  const refreshVoteLists = useCallback(() => {
    void loadFeatured();
    void loadRequests();
    const q = searchQuery.trim();
    if (q) {
      void executeSearch(q);
    } else {
      setLibrary([]);
    }
  }, [executeSearch, loadFeatured, loadRequests, searchQuery]);

  useEffect(() => {
    void loadFeatured();
    void loadRequests();
  }, [loadFeatured, loadRequests]);

  useRealtime(["votes:changed", "requests:updated", "library:updated"], refreshVoteLists);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setLibrary([]);
      setSearching(false);
      return;
    }

    const timer = setTimeout(() => {
      executeSearch(q);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, executeSearch]);

  const searchLibrary = () => {
    executeSearch(searchQuery);
  };

  const rawDisplaySongs = searchQuery.trim() ? library : featuredSongs;
  const displaySongs = Array.isArray(rawDisplaySongs) ? rawDisplaySongs.filter((s): s is Song => Boolean(s?.id)) : [];
  const hasSearchResults = searchQuery.trim().length > 0;

  const voteByUrl = async () => {
    const url = ytUrl.trim();
    if (!url) {
      toast({ title: "Wklej link YouTube", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.vote({ youtubeUrl: url });
      toast({
        title: result.message || "Zgłoszenie przyjęte",
        description: result.message === "Oddano głos" ? "Głos został zapisany." : "Czeka na weryfikację lub oddano głos.",
      });
      setYtUrl("");
      loadRequests();
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const voteBySong = async (songId: string) => {
    setSubmitting(true);
    try {
      await api.vote({ songId });
      const voted = displaySongs.find((song) => song.id === songId);
      toast({ title: "Oddano głos", description: voted?.title ? `Na „${voted.title}”` : undefined });
      api
        .getLibrary(undefined, "votes", LIBRARY_PAGE, 0)
        .then((r) => {
          const songs = Array.isArray(r.songs) ? (r.songs as Song[]) : [];
          setFeaturedHasMore(songs.length === LIBRARY_PAGE);
          setFeaturedSongs(songs);
        })
        .catch(() => setFeaturedSongs([]));
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const bumpRequest = async (songId: string) => {
    setBumpingId(songId);
    try {
      const result = await api.bumpSongRequest(songId);
      toast({
        title: result.added ? "Podbito zgłoszenie" : "Już podbiłeś ten utwór",
      });
      loadRequests();
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBumpingId(null);
    }
  };

  const loadMoreLibrary = async () => {
    setLoadingMore(true);
    try {
      if (hasSearchResults) {
        await executeSearch(searchQuery, library.length, true);
      } else {
        await loadFeatured(featuredSongs.length, true);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-6 p-4 overflow-x-hidden">
      <h1 className="text-2xl font-bold">Głosowanie</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nowa piosenka (link YouTube)</CardTitle>
          <CardDescription>
            Wklej link do piosenki z YouTube. Jeśli piosenka jest już w bibliotece, zostanie oddany głos.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 min-w-0 space-y-2">
            <Label htmlFor="yt-url">Link YouTube</Label>
            <Input
              id="yt-url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={voteByUrl} disabled={submitting}>
              Wyślij / Zagłosuj
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Najczęściej zgłaszane</CardTitle>
            <CardDescription>
              Top 5 utworów czekających na weryfikację. Kliknij okładkę, by odsłuchać zajawkę z YouTube.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/requests">Pokaż wszystkie</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {mostRequested.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak oczekujących zgłoszeń.</p>
          ) : (
            <RequestedSongsGrid
              requests={mostRequested.slice(0, 5)}
              previewSongId={previewSongId}
              youtubeEmbedUrl={youtubeEmbedUrl}
              bumpingId={bumpingId}
              onPreview={(item) => playYoutubePreview(item.songId, item.youtubeUrl)}
              onBump={bumpRequest}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Biblioteka</CardTitle>
          <CardDescription>
            Wyszukaj piosenkę lub przeglądaj karty. Najpierw utwory z głosami, potem reszta z obowiązującej playlisty, na końcu te, na które teraz nie można głosować. Kliknij okładkę, by odtworzyć 30-sekundową zajawkę.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              className="min-w-0"
              placeholder="Tytuł lub autor..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value) }}
              onKeyDown={(e) => e.key === "Enter" && searchLibrary()}
            />
            <Button variant="secondary" onClick={searchLibrary} disabled={searching}>
              <Search className="h-4 w-4" />
              Szukaj
            </Button>
          </div>
          {displaySongs.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">
              {hasSearchResults && !searching
                ? "Brak wyników. Zmień zapytanie."
                : !hasSearchResults
                  ? "Brak piosenek w bibliotece."
                  : "Ładowanie…"}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 min-w-0">
              {displaySongs.map((song) => {
                const title = song.title ?? "";
                const author = song.author ?? "";
                return (
                  <Card key={song.id} className="overflow-hidden">
                    <button
                      type="button"
                      className="relative w-full aspect-square rounded-none bg-muted block overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring"
                      onClick={() => playFilePreview(song.id)}
                      aria-label={`Odtwórz zajawkę: ${title}`}
                    >
                      {song.coverUrl ? (
                        <img
                          src={song.coverUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="h-12 w-12 text-muted-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                        <Play className="h-12 w-12 text-white fill-white" />
                      </div>
                      {previewSongId === song.id && !youtubeEmbedUrl && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <div className="h-8 w-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </button>
                    <CardContent className="p-3">
                      <p className="font-medium text-sm truncate" title={title}>{title}</p>
                      <p className="text-xs text-muted-foreground truncate" title={author}>{author}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <ThumbsUp className="h-3 w-3" />
                          {typeof song.voteCount === "number" ? song.voteCount : (song.voteCount != null && typeof song.voteCount === "object" && "count" in song.voteCount ? (song.voteCount as { count: number }).count : 0)}
                        </span>
                        {song.inEffectivePlaylist === false ? (
                          <span className="text-xs text-muted-foreground shrink">Poza playlistą</span>
                        ) : song.canVote === false ? (
                          <span className="text-xs text-muted-foreground">Zablokowana</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="h-9 text-xs min-h-9 shrink-0"
                            onClick={() => voteBySong(song.id)}
                            disabled={submitting}
                          >
                            Głosuj
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
          {(hasSearchResults ? libraryHasMore : featuredHasMore) && displaySongs.length > 0 && (
            <Button variant="outline" className="w-full" onClick={() => void loadMoreLibrary()} disabled={loadingMore || searching}>
              {loadingMore ? "Ładowanie…" : "Pokaż kolejne 25"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
