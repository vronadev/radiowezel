import { Play } from "lucide-react";
import { extractYoutubeVideoId, youtubeClipEmbedUrl } from "@/lib/youtube";

export function YoutubeClipPreview({
  youtubeUrl,
  startTimeSec,
  endTimeSec,
  title,
  active,
  onPlay,
}: {
  youtubeUrl: string;
  startTimeSec: number;
  endTimeSec: number;
  title: string;
  active: boolean;
  onPlay: () => void;
}) {
  const videoId = extractYoutubeVideoId(youtubeUrl);
  if (!videoId) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-md bg-muted px-3 text-center text-sm text-muted-foreground">
        Brak podglądu YouTube
      </div>
    );
  }
  if (!active) {
    return (
      <button
        type="button"
        onClick={onPlay}
        className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-md bg-muted text-sm hover:bg-muted/80"
      >
        <Play className="h-8 w-8" />
        <span>
          Odtwórz {startTimeSec}s–{endTimeSec}s
        </span>
      </button>
    );
  }
  return (
    <iframe
      className="aspect-video w-full rounded-md"
      src={youtubeClipEmbedUrl(videoId, startTimeSec, endTimeSec)}
      title={title}
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
    />
  );
}
