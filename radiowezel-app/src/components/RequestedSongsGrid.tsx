import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Music, Play } from "lucide-react";
import type { SongRequestAggregate } from "@/types/api";

interface RequestedSongsGridProps {
  requests: SongRequestAggregate[];
  previewSongId: string | null;
  youtubeEmbedUrl: string | null;
  bumpingId: string | null;
  onPreview: (item: SongRequestAggregate) => void;
  onBump: (songId: string) => void;
}

export function RequestedSongsGrid({
  requests,
  previewSongId,
  youtubeEmbedUrl,
  bumpingId,
  onPreview,
  onBump,
}: RequestedSongsGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {requests.map((item) => {
        const title = item.title ?? "";
        const author = item.author ?? "";
        const isPreviewing = previewSongId === item.songId && Boolean(youtubeEmbedUrl);
        return (
          <Card key={item.songId} className="overflow-hidden">
            <button
              type="button"
              className="relative w-full aspect-square rounded-none bg-muted block overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring"
              onClick={() => onPreview(item)}
              aria-label={`Odtwórz zajawkę: ${title}`}
            >
              {isPreviewing && youtubeEmbedUrl ? (
                <iframe
                  title={`Zajawka: ${title}`}
                  src={youtubeEmbedUrl}
                  className="h-full w-full border-0"
                  allow="autoplay; encrypted-media"
                />
              ) : item.coverUrl ? (
                <img src={item.coverUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
              {!isPreviewing && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                  <Play className="h-12 w-12 text-white fill-white" />
                </div>
              )}
            </button>
            <CardContent className="p-3">
              <p className="font-medium text-sm truncate" title={title}>
                {title}
              </p>
              <p className="text-xs text-muted-foreground truncate" title={author}>
                {author}
              </p>
              <div className="flex items-center justify-between mt-2 gap-1">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{item.requestCount} zgł.</span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-9 text-xs min-h-9"
                  onClick={() => onBump(item.songId)}
                  disabled={bumpingId === item.songId}
                >
                  Podbij
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
