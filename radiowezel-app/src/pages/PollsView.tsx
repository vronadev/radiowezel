import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api, isApiTimeoutError } from "@/lib/api";
import type { Bell as BellItem, PollView } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { YoutubeClipPreview } from "@/components/YoutubeClipPreview";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/useRealtime";

function pollTypeLabel(type: PollView["type"]): string {
  return type === "WEEKLY_BELL" ? "Dzwonek tygodnia" : "Jednorazowa";
}

function formatDay(value: string): string {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return value;
  }
  return new Date(year, month - 1, day).toLocaleDateString("pl-PL");
}

export function PollsView() {
  const { toast } = useToast();
  const [polls, setPolls] = useState<PollView[]>([]);
  const [bells, setBells] = useState<BellItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingOptionId, setPlayingOptionId] = useState<string | null>(null);
  const [busyOptionId, setBusyOptionId] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [startTimeSec, setStartTimeSec] = useState("0");
  const [endTimeSec, setEndTimeSec] = useState("30");
  const [libraryBellId, setLibraryBellId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.getActivePolls(), api.getBells()])
      .then(([pollResult, bellResult]) => {
        setPolls(pollResult.polls || []);
        setBells(bellResult.bells || []);
      })
      .catch((error) => {
        if (!isApiTimeoutError(error)) {
          toast({ title: "Błąd", description: (error as Error).message, variant: "destructive" });
        }
      })
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(["polls:updated"], () => load());

  const weekly = polls.find((poll) => poll.type === "WEEKLY_BELL") ?? null;

  const toggleVote = async (poll: PollView, optionId: string) => {
    setBusyOptionId(optionId);
    try {
      if (poll.myOptionId === optionId) {
        await api.clearPollVote(poll.id);
      } else {
        await api.castPollVote(poll.id, optionId);
      }
      load();
    } catch (error) {
      if (!isApiTimeoutError(error)) {
        toast({ title: "Błąd", description: (error as Error).message, variant: "destructive" });
      }
    } finally {
      setBusyOptionId(null);
    }
  };

  const propose = async () => {
    if (!weekly) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.addPollOption(weekly.id, {
        youtubeUrl: youtubeUrl.trim(),
        startTimeSec: Number(startTimeSec),
        endTimeSec: Number(endTimeSec),
      });
      setYoutubeUrl("");
      setStartTimeSec("0");
      setEndTimeSec("30");
      toast({ title: result.added ? "Dzwonek dodany do ankiety" : "Ten dzwonek jest już w ankiecie" });
      load();
    } catch (error) {
      if (!isApiTimeoutError(error)) {
        toast({ title: "Błąd", description: (error as Error).message, variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const addFromLibrary = async () => {
    if (!weekly || !libraryBellId) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.addPollOption(weekly.id, { bellId: libraryBellId });
      setLibraryBellId("");
      toast({ title: result.added ? "Dodano dzwonek z biblioteki" : "Ten dzwonek jest już w ankiecie" });
      load();
    } catch (error) {
      if (!isApiTimeoutError(error)) {
        toast({ title: "Błąd", description: (error as Error).message, variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">Ładowanie…</div>;
  }

  return (
    <div className="w-full space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Dzwonki
          </CardTitle>
          <CardDescription>
            Zagłosuj na jeden dzwonek. Podgląd odtwarza wybrany fragment YouTube. Niezatwierdzone propozycje zbierają głosy, ale nie wygrywają, dopóki administrator ich nie zaakceptuje.
          </CardDescription>
        </CardHeader>
      </Card>

      {polls.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">Brak aktywnych ankiet.</CardContent>
        </Card>
      )}

      {polls.map((poll) => (
        <Card key={poll.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
              {poll.title}
              <Badge variant="secondary">{pollTypeLabel(poll.type)}</Badge>
            </CardTitle>
            <CardDescription>
              {formatDay(poll.startDate)} – {formatDay(poll.endDate)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {poll.options.map((option) => {
                const selected = poll.myOptionId === option.id;
                const leading = poll.winnerOptionId === option.id;
                return (
                  <div key={option.id} className="space-y-3 rounded-lg border p-3">
                    <YoutubeClipPreview
                      youtubeUrl={option.youtubeUrl}
                      startTimeSec={option.startTimeSec}
                      endTimeSec={option.endTimeSec}
                      title={option.title}
                      active={playingOptionId === option.id}
                      onPlay={() => setPlayingOptionId(option.id)}
                    />
                    <div className="space-y-1">
                      <div className="font-medium">{option.title}</div>
                      {option.artist ? <div className="text-sm text-muted-foreground">{option.artist}</div> : null}
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{option.voteCount} głosów</Badge>
                        {leading ? <Badge>Prowadzi</Badge> : null}
                        {!option.isApproved ? <Badge variant="secondary">Oczekuje na akceptację</Badge> : null}
                      </div>
                    </div>
                    <Button
                      variant={selected ? "default" : "outline"}
                      className="w-full"
                      disabled={busyOptionId === option.id}
                      onClick={() => toggleVote(poll, option.id)}
                    >
                      {selected ? "Cofnij głos" : "Głosuj"}
                    </Button>
                  </div>
                );
              })}
            </div>
            {poll.options.length === 0 && (
              <p className="text-sm text-muted-foreground">W tej ankiecie nie ma jeszcze kandydatów.</p>
            )}
          </CardContent>
        </Card>
      ))}

      {weekly && (
        <Card>
          <CardHeader>
            <CardTitle>Zaproponuj dzwonek</CardTitle>
            <CardDescription>Wklej link YouTube albo wybierz zatwierdzony dzwonek z biblioteki.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_6rem_6rem_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="bell-youtube">Link YouTube</Label>
                <Input
                  id="bell-youtube"
                  value={youtubeUrl}
                  placeholder="https://www.youtube.com/watch?v=…"
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bell-start">Od (s)</Label>
                <Input id="bell-start" type="number" min={0} value={startTimeSec} onChange={(event) => setStartTimeSec(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bell-end">Do (s)</Label>
                <Input id="bell-end" type="number" min={1} value={endTimeSec} onChange={(event) => setEndTimeSec(event.target.value)} />
              </div>
              <Button disabled={submitting || !youtubeUrl.trim()} onClick={propose}>
                Dodaj
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="bell-library">Biblioteka dzwonków</Label>
                <select
                  id="bell-library"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={libraryBellId}
                  onChange={(event) => setLibraryBellId(event.target.value)}
                >
                  <option value="">Wybierz zatwierdzony dzwonek</option>
                  {bells.map((bell) => (
                    <option key={bell.id} value={bell.id}>
                      {bell.title} — {bell.artist}
                    </option>
                  ))}
                </select>
              </div>
              <Button variant="outline" disabled={submitting || !libraryBellId} onClick={addFromLibrary}>
                Dodaj z biblioteki
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
