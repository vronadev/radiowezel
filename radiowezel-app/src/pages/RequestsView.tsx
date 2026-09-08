import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Sparkles } from "lucide-react";
import type { SongRequestAggregate } from "@/types/api";
import { RequestedSongsGrid } from "@/components/RequestedSongsGrid";
import { useSongPreview } from "@/hooks/useSongPreview";
import { useRealtime } from "@/hooks/useRealtime";

type SortKey = "requestCount" | "lastRequestedAt" | "title";

export function RequestsView() {
  const [requests, setRequests] = useState<SongRequestAggregate[]>([]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("requestCount");
  const [loading, setLoading] = useState(true);
  const [bumpingId, setBumpingId] = useState<string | null>(null);
  const { toast } = useToast();
  const { previewSongId, youtubeEmbedUrl, playYoutubePreview } = useSongPreview();

  const load = useCallback(() => {
    api
      .getSongRequests()
      .then((r) => setRequests(r.requests || []))
      .catch((e) => toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(["requests:updated", "library:updated"], () => load());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? requests.filter(
          (item) => item.title.toLowerCase().includes(q) || item.author.toLowerCase().includes(q),
        )
      : requests;
    return [...filtered].sort((left, right) => {
      if (sortKey === "title") {
        return left.title.localeCompare(right.title, "pl");
      }
      if (sortKey === "lastRequestedAt") {
        return (right.lastRequestedAt || "").localeCompare(left.lastRequestedAt || "");
      }
      return right.requestCount - left.requestCount;
    });
  }, [query, requests, sortKey]);

  const bump = async (songId: string) => {
    setBumpingId(songId);
    try {
      const result = await api.bumpSongRequest(songId);
      toast({
        title: result.added ? "Podbito zgłoszenie" : "Już podbiłeś ten utwór",
      });
      load();
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBumpingId(null);
    }
  };

  return (
    <div className="w-full space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-6 w-6" />
            Najczęściej zgłaszane
          </CardTitle>
          <CardDescription>
            Przeglądaj oczekujące zgłoszenia, odsłuchaj zajawkę z okładki i podbij utwór.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Filtruj tytuł lub autora…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 min-w-[180px]"
            />
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="requestCount">Sortuj: liczba zgłoszeń</option>
              <option value="lastRequestedAt">Sortuj: ostatnie zgłoszenie</option>
              <option value="title">Sortuj: tytuł</option>
            </select>
          </div>
          {loading ? (
            <p className="text-muted-foreground">Ładowanie…</p>
          ) : visible.length === 0 ? (
            <p className="text-muted-foreground">Brak zgłoszeń.</p>
          ) : (
            <RequestedSongsGrid
              requests={visible}
              previewSongId={previewSongId}
              youtubeEmbedUrl={youtubeEmbedUrl}
              bumpingId={bumpingId}
              onPreview={(item) => playYoutubePreview(item.songId, item.youtubeUrl)}
              onBump={bump}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
