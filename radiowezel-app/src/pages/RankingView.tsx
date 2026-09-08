import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Music, ThumbsUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/useRealtime";

interface RankingSong {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
  totalVotes: number;
}

export function RankingView() {
  const [songs, setSongs] = useState<RankingSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [votingId, setVotingId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    api
      .getRanking(100)
      .then((r) => setSongs(r.songs as RankingSong[]))
      .catch(() => setSongs([]))
      .finally(() => setLoading(false));
  }, []);

  useRealtime(["votes:changed", "library:updated"], () => {
    api
      .getRanking(100)
      .then((r) => setSongs(r.songs as RankingSong[]))
      .catch(() => {});
  });

  const voteForSong = async (songId: string) => {
    setVotingId(songId);
    try {
      await api.vote({ songId });
      toast({ title: "Oddano głos", description: `Na „${songs.find((s) => s.id === songId)?.title ?? "utwór"}”` });
      const r = await api.getRanking(100);
      setSongs(r.songs as RankingSong[]);
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setVotingId(null);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ThumbsUp className="h-6 w-6" />
            Najbardziej lubiane
          </CardTitle>
          <CardDescription>
            Ranking zweryfikowanych piosenek według łącznej liczby oddanych głosów (wszystkie czasy).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Ładowanie…</p>
          ) : songs.length === 0 ? (
            <p className="text-muted-foreground">Brak danych.</p>
          ) : (
            <ol className="space-y-2">
              {songs.map((song, index) => (
                <li key={song.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <span className="text-muted-foreground font-mono w-6">{index + 1}.</span>
                  <Avatar className="h-10 w-10 rounded">
                    <AvatarImage src={song.coverUrl ?? undefined} />
                    <AvatarFallback><Music className="h-4 w-4" /></AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{song.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{song.author}</p>
                  </div>
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <ThumbsUp className="h-4 w-4" />
                    {song.totalVotes}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => voteForSong(song.id)}
                    disabled={votingId === song.id}
                  >
                    Głosuj
                  </Button>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
