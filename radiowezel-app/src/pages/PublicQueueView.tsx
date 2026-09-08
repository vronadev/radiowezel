import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Music } from "lucide-react";
import type { QueueItem, NowPlaying } from "@/types/api";
import LogoSet from "@/components/LogoSet";
import { useRealtime } from "@/hooks/useRealtime";

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function QueueRow({ item, isNowPlaying }: { item: QueueItem | NowPlaying; isNowPlaying?: boolean }) {
  return (
    <div
      className={`flex min-w-0 w-full flex-wrap items-start gap-3 sm:gap-4 rounded-lg border p-3 sm:p-4 ${isNowPlaying ? "border-primary bg-primary/5" : "bg-card"}`}
    >
      <div className="flex min-w-0 flex-[1_1_100%] sm:flex-[1_1_14rem] gap-3">
        <span className="w-8 shrink-0 text-center text-lg font-bold text-muted-foreground">
          {isNowPlaying ? "▶" : item.position}
        </span>
        <Avatar className="h-14 w-14 rounded-md shrink-0">
          <AvatarImage src={item.coverUrl ?? undefined} alt={item.title} />
          <AvatarFallback>
            <Music className="h-6 w-6" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words">{item.title}</p>
          <p className="text-sm text-muted-foreground break-words">{item.author}</p>
        </div>
      </div>
      <div className="flex min-w-0 w-full sm:w-auto sm:flex-[1_1_12rem] flex-wrap items-center gap-2">
        <Badge variant="secondary" className="shrink-0">
          {item.votes} głosów
        </Badge>
        {!isNowPlaying && (
          <span className="text-sm text-muted-foreground">
            ok. {formatTime(item.estimatedPlayAt)}
          </span>
        )}
      </div>
    </div>
  );
}

export function PublicQueueView() {
  const [data, setData] = useState<{ nowPlaying: NowPlaying | null; queue: QueueItem[] } | null>(null);

  const fetchQueue = useCallback(() => {
    api.getPublicQueue().then((d) => setData(d as { nowPlaying: NowPlaying | null; queue: QueueItem[] })).catch(() => setData({ nowPlaying: null, queue: [] }));
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  useRealtime(["queue:updated", "votes:changed", "song:playing"], fetchQueue);

  if (data === null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Ładowanie kolejki…</p>
      </div>
    );
  }

  const { nowPlaying, queue } = data;

  return (
    <div className="w-full min-w-0 space-y-6 p-4 overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-2 min-w-0">
        <h1 className="text-2xl font-bold">Kolejka piosenek</h1>
        <LogoSet variant="header" />
      </div>

      {nowPlaying && (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-primary">Teraz gra</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <QueueRow item={nowPlaying} isNowPlaying />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Kolejka - następne w kolejce</CardTitle>
        </CardHeader>
        <CardContent>
          {(!queue || queue.length === 0) && !nowPlaying ? (
            <p className="py-8 text-center text-muted-foreground">Brak piosenek w kolejce.</p>
          ) : (
            <div className="max-h-[400px] overflow-y-auto min-w-0 space-y-2">
                {(queue || []).map((item, index) => (
                  <QueueRow key={item.id} item={{ ...item, position: index + 1 }} />
                ))}
            </div>
          )}
        </CardContent>
      </Card>
      <LogoSet variant="footer" />
    </div>
  );
}
