import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRealtime } from "@/hooks/useRealtime";
import { GitCommitHorizontal } from "lucide-react";

type PlayRow = {
  songId: string;
  title: string;
  author: string;
  startedAt: string;
  durationSeconds: number | null;
};

function shortHash(songId: string): string {
  return (songId || "--------").replace(/[^a-zA-Z0-9]/g, "").slice(0, 7).padEnd(7, "0");
}

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("pl-PL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HistoryView() {
  const [plays, setPlays] = useState<PlayRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api
      .getPlayHistory()
      .then((result) => setPlays(Array.isArray(result.plays) ? result.plays : []))
      .catch(() => setPlays([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(["song:playing"], load);

  return (
    <div className="w-full min-w-0 space-y-6 p-4 overflow-x-hidden">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Historia odtwarzania</h1>
        <p className="text-sm text-muted-foreground">Ostatnie 7 dni, od najnowszych.</p>
      </div>
      {loading ? (
        <p className="text-muted-foreground">Ładowanie…</p>
      ) : plays.length === 0 ? (
        <p className="text-muted-foreground">Brak odtworzeń z ostatnich 7 dni.</p>
      ) : (
        <ol className="relative ml-3 border-l pl-6 space-y-5">
          {plays.map((play, index) => (
            <li key={`${play.songId}-${play.startedAt}-${index}`} className="min-w-0">
              <span className="absolute -left-[9px] mt-1.5 flex h-4 w-4 items-center justify-center rounded-full border bg-background">
                <GitCommitHorizontal className="h-3 w-3 text-muted-foreground" />
              </span>
              <p className="font-mono text-xs text-muted-foreground">
                {shortHash(play.songId)} · {formatStamp(play.startedAt)}
              </p>
              <p className="font-medium truncate" title={play.title}>
                {play.title}
              </p>
              <p className="text-sm text-muted-foreground truncate">{play.author}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
