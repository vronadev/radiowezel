import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/useRealtime";
import { Music, ThumbsUp, Loader2, SkipForward, Trash2, Clock } from "lucide-react";
import type { QueueItem, NowPlaying, ScheduleContext } from "@/types/api";
import LogoSet from "@/components/LogoSet";

function formatTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function QueueRow({
  item,
  isNowPlaying,
  progressSeconds,
  durationSeconds,
  onVote,
  votingSongId,
  isAdmin,
  onSkip,
  skipping = false,
  onRemoveFromQueue,
  removingSongId,
}: {
  item: QueueItem | NowPlaying;
  isNowPlaying?: boolean;
  progressSeconds?: number;
  durationSeconds?: number;
  onVote?: (songId: string) => void;
  votingSongId?: string | null;
  isAdmin?: boolean;
  onSkip?: () => void;
  skipping?: boolean;
  onRemoveFromQueue?: (songId: string) => void;
  removingSongId?: string | null;
}) {
  const isVoting = votingSongId === item.songId;
  const isRemoving = removingSongId === item.songId;
  const duration = durationSeconds ?? item.durationSeconds ?? 0;
  const progress = progressSeconds ?? 0;
  const progressPct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
  return (
    <div
      className={`flex min-w-0 w-full flex-wrap items-start gap-3 sm:gap-4 rounded-lg border p-3 sm:p-4 ${isNowPlaying ? "border-primary bg-primary/5" : "bg-card"}`}
    >
      <div className="flex min-w-0 flex-[1_1_100%] sm:flex-[1_1_14rem] gap-3">
        <span className="w-6 sm:w-8 shrink-0 text-center text-base sm:text-lg font-bold text-muted-foreground">
          {isNowPlaying ? "▶" : item.position}
        </span>
        <Avatar className="h-12 w-12 sm:h-14 sm:w-14 rounded-md shrink-0">
          <AvatarImage src={item.coverUrl ?? undefined} alt={item.title} />
          <AvatarFallback>
            <Music className="h-6 w-6" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words">{item.title}</p>
          <p className="text-sm text-muted-foreground break-words">{item.author}</p>
          {isNowPlaying && duration > 0 && (
            <div className="mt-2 space-y-1">
              <div className="h-1.5 w-full max-w-[160px] rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-1000"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDuration(progress)} / {formatDuration(duration)}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="flex min-w-0 w-full sm:w-auto sm:flex-[1_1_12rem] flex-wrap items-center gap-2">
        <Badge variant="secondary" className="shrink-0">
          {item.votes} głosów
        </Badge>
        {!isNowPlaying && (
          <span className="text-xs sm:text-sm text-muted-foreground">
            ok. {formatTime(item.estimatedPlayAt)}
          </span>
        )}
        {!isNowPlaying && onVote && (
          <Button
            size="sm"
            variant="secondary"
            className="min-h-9"
            onClick={() => onVote(item.songId)}
            disabled={isVoting}
            title="Głosuj (bump w kolejce)"
          >
            {isVoting ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
            <span className="ml-1">Głosuj</span>
          </Button>
        )}
        {isNowPlaying && isAdmin && onSkip && (
          <Button size="sm" variant="outline" className="min-h-9" onClick={onSkip} disabled={skipping} title="Pomiń (następny utwór)">
            {skipping ? <Loader2 className="h-3 w-3 animate-spin" /> : <SkipForward className="h-3 w-3" />}
            <span className="ml-1">Pomiń</span>
          </Button>
        )}
        {!isNowPlaying && isAdmin && onRemoveFromQueue && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive min-h-9 min-w-9"
            onClick={() => onRemoveFromQueue(item.songId)}
            disabled={isRemoving}
            title="Usuń z kolejki"
          >
            {isRemoving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          </Button>
        )}
      </div>
    </div>
  );
}

export function QueueView() {
  const { user } = useAuth();
  const [data, setData] = useState<{
    nowPlaying: NowPlaying | null;
    queue: QueueItem[];
    schedule?: ScheduleContext | null;
  } | null>(null);
  const [votingSongId, setVotingSongId] = useState<string | null>(null);
  const [removingSongId, setRemovingSongId] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const [progressSeconds, setProgressSeconds] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const { toast } = useToast();
  const isAdmin = !!user?.isAdmin;

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchQueue = useCallback(() => {
    api.getQueue().then((d) => setData(d as { nowPlaying: NowPlaying | null; queue: QueueItem[]; schedule?: ScheduleContext }));
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  useRealtime(["queue:updated", "votes:changed", "song:playing", "player:updated"], fetchQueue);

  useEffect(() => {
    if (!data?.nowPlaying?.startedAt || data.nowPlaying.durationSeconds == null) {
      setProgressSeconds(0);
      return;
    }
    const update = () => {
      const started = new Date(data.nowPlaying!.startedAt).getTime();
      const elapsed = (Date.now() - started) / 1000;
      const duration = data.nowPlaying!.durationSeconds ?? 0;
      setProgressSeconds(Math.min(Math.max(0, elapsed), duration));
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [data?.nowPlaying?.startedAt, data?.nowPlaying?.durationSeconds, data?.nowPlaying?.songId]);

  const voteForSong = async (songId: string) => {
    setVotingSongId(songId);
    try {
      await api.vote({ songId });
      const voted = data?.queue.find((item) => item.songId === songId) || data?.nowPlaying;
      toast({ title: "Oddano głos", description: voted?.title ? `Na „${voted.title}”` : undefined });
      fetchQueue();
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setVotingSongId(null);
    }
  };

  const skipCurrentSong = async () => {
    setSkipping(true);
    try {
      await api.skipCurrentSong();
      toast({ title: "Pomijam - następny utwór" });
      fetchQueue();
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSkipping(false);
    }
  };

  const removeFromQueue = async (songId: string) => {
    setRemovingSongId(songId);
    try {
      await api.removeSongFromQueue(songId);
      toast({ title: "Usunięto z kolejki" });
      fetchQueue();
    } catch (e) {
      toast({ title: "Błąd", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRemovingSongId(null);
    }
  };

  if (data === null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Ładowanie kolejki…</p>
      </div>
    );
  }

  const { nowPlaying, queue, schedule } = data;

  const clockStr = clock.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  return (
    <div className="w-full min-w-0 space-y-6 p-4 overflow-x-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold">Kolejka piosenek</h1>
        <div className="flex min-w-0 flex-wrap items-center gap-3 sm:gap-5">
          <LogoSet variant="header" />
          <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 sm:px-4 py-2">
            <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
            <span className="tabular-nums text-lg sm:text-xl font-semibold tracking-tight" aria-live="polite">
              {clockStr}
            </span>
          </div>
        </div>
      </div>

      {schedule && (schedule.currentSlot || schedule.nextSlot) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Przerwy
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6">
            {schedule.currentSlot && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Obecna przerwa</p>
                <p className="text-lg font-semibold">
                  {schedule.currentSlot.start} – {schedule.currentSlot.end}
                  {schedule.inBreak && (
                  <span className="ml-2 text-sm font-normal text-primary">(trwa)</span>
                  )}
                </p>
              </div>
            )}
            {schedule.nextSlot && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Następna przerwa</p>
                <p className="text-lg font-semibold">
                  {schedule.nextSlot.start} – {schedule.nextSlot.end}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {nowPlaying && (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="text-primary">Teraz gra</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            <QueueRow
              item={nowPlaying}
              isNowPlaying
              progressSeconds={progressSeconds}
              durationSeconds={nowPlaying.durationSeconds}
              isAdmin={isAdmin}
              onSkip={isAdmin ? skipCurrentSong : undefined}
              skipping={skipping}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Kolejka - następne w kolejce</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          {queue.length === 0 && !nowPlaying ? (
            <p className="py-8 text-center text-muted-foreground">Brak piosenek w kolejce.</p>
          ) : (
            <div className="max-h-[min(400px,60vh)] overflow-y-auto min-w-0 space-y-2">
                {queue.map((item, index) => (
                  <QueueRow
                    key={item.id}
                    item={{ ...item, position: index + 1 }}
                    onVote={voteForSong}
                    votingSongId={votingSongId}
                    isAdmin={isAdmin}
                    onRemoveFromQueue={isAdmin ? removeFromQueue : undefined}
                    removingSongId={removingSongId}
                  />
                ))}
              </div>
          )}
        </CardContent>
      </Card>
      <LogoSet variant="footer" />
    </div>
  );
}
