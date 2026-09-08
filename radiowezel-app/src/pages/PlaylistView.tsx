import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Music } from "lucide-react";

interface PlaylistSong {
  id: string;
  title: string;
  author: string;
  coverUrl: string | null;
}

export function PlaylistView() {
  const { playlistId } = useParams<{ playlistId: string }>();
  const [playlist, setPlaylist] = useState<{ id: string; name: string; songs: PlaylistSong[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playlistId) return;
    api
      .getPlaylist(playlistId)
      .then(setPlaylist)
      .catch(() => setPlaylist(null))
      .finally(() => setLoading(false));
  }, [playlistId]);

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-4">
        <p className="text-muted-foreground">Ładowanie…</p>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="p-4">
        <p className="text-destructive">Nie znaleziono playlisty.</p>
        <Link to="/" className="text-primary hover:underline mt-2 inline-block">Wróć do kolejki</Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>{playlist.name}</CardTitle>
          <CardDescription>
            {playlist.songs.length} {playlist.songs.length === 1 ? "utwór" : "utworów"} w playliście
          </CardDescription>
        </CardHeader>
        <CardContent>
          {playlist.songs.length === 0 ? (
            <p className="text-muted-foreground text-sm">Brak piosenek w playliście.</p>
          ) : (
            <ul className="space-y-2">
              {playlist.songs.map((song) => (
                <li key={song.id} className="flex items-center gap-3 rounded-lg border p-2">
                  <Avatar className="h-10 w-10 rounded">
                    <AvatarImage src={song.coverUrl ?? undefined} />
                    <AvatarFallback><Music className="h-4 w-4" /></AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{song.title}</p>
                    <p className="text-sm text-muted-foreground truncate">{song.author}</p>
                  </div>
                  <Link to="/vote" className="text-sm text-primary hover:underline">Głosuj</Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
