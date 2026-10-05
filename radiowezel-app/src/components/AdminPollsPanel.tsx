import { useCallback, useEffect, useState } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";
import { api, isApiTimeoutError } from "@/lib/api";
import type { Bell as BellItem, PollView } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { YoutubeClipPreview } from "@/components/YoutubeClipPreview";
import { useToast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/useRealtime";

type DraftOption = { title: string; youtubeUrl: string; startTimeSec: string; endTimeSec: string };

function emptyOption(): DraftOption {
  return { title: "", youtubeUrl: "", startTimeSec: "0", endTimeSec: "30" };
}

function formatDay(value: string): string {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) {
    return value;
  }
  return new Date(year, month - 1, day).toLocaleDateString("pl-PL");
}

export function AdminPollsPanel() {
  const { toast } = useToast();
  const [bells, setBells] = useState<BellItem[]>([]);
  const [polls, setPolls] = useState<PollView[]>([]);
  const [edits, setEdits] = useState<Record<string, { startTimeSec: string; endTimeSec: string }>>({});
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [options, setOptions] = useState<DraftOption[]>([emptyOption(), emptyOption(), emptyOption(), emptyOption()]);
  const [saving, setSaving] = useState(false);
  const [playingBellId, setPlayingBellId] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([api.getPendingBells(), api.getAdminPolls()])
      .then(([pending, adminPolls]) => {
        setBells(pending.bells || []);
        setPolls(adminPolls.polls || []);
        setEdits((current) => {
          const next = { ...current };
          for (const bell of pending.bells || []) {
            if (!next[bell.id]) {
              next[bell.id] = { startTimeSec: String(bell.startTimeSec), endTimeSec: String(bell.endTimeSec) };
            }
          }
          return next;
        });
      })
      .catch((error) => {
        if (!isApiTimeoutError(error)) {
          toast({ title: "Błąd", description: (error as Error).message, variant: "destructive" });
        }
      });
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtime(["polls:updated"], () => load());

  const approve = async (bell: BellItem) => {
    const edit = edits[bell.id] ?? { startTimeSec: String(bell.startTimeSec), endTimeSec: String(bell.endTimeSec) };
    setApprovingId(bell.id);
    try {
      await api.approveBell(bell.id, {
        startTimeSec: Number(edit.startTimeSec),
        endTimeSec: Number(edit.endTimeSec),
      });
      toast({ title: "Dzwonek zatwierdzony" });
      load();
    } catch (error) {
      if (!isApiTimeoutError(error)) {
        toast({ title: "Błąd", description: (error as Error).message, variant: "destructive" });
      }
    } finally {
      setApprovingId(null);
    }
  };

  const toggleActive = async (poll: PollView) => {
    try {
      await api.updatePoll(poll.id, { isActive: !poll.isActive });
      load();
    } catch (error) {
      if (!isApiTimeoutError(error)) {
        toast({ title: "Błąd", description: (error as Error).message, variant: "destructive" });
      }
    }
  };

  const removeOption = async (pollId: string, optionId: string) => {
    try {
      await api.removePollOption(pollId, optionId);
      load();
    } catch (error) {
      if (!isApiTimeoutError(error)) {
        toast({ title: "Błąd", description: (error as Error).message, variant: "destructive" });
      }
    }
  };

  const createPoll = async () => {
    setSaving(true);
    try {
      await api.createPoll({
        title: title.trim(),
        type: "ONE_OFF",
        startDate,
        endDate,
        isActive: true,
        options: options
          .filter((option) => option.title.trim() && option.youtubeUrl.trim())
          .map((option) => ({
            title: option.title.trim(),
            youtubeUrl: option.youtubeUrl.trim(),
            startTimeSec: Number(option.startTimeSec),
            endTimeSec: Number(option.endTimeSec),
          })),
      });
      setCreatorOpen(false);
      setTitle("");
      setStartDate("");
      setEndDate("");
      setOptions([emptyOption(), emptyOption(), emptyOption(), emptyOption()]);
      toast({ title: "Ankieta utworzona" });
      load();
    } catch (error) {
      if (!isApiTimeoutError(error)) {
        toast({ title: "Błąd", description: (error as Error).message, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Dzwonki do akceptacji
          </CardTitle>
          <CardDescription>Po akceptacji głosy na ten dzwonek zaczynają się liczyć do wyniku.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {bells.length === 0 && <p className="text-sm text-muted-foreground">Brak oczekujących dzwonków.</p>}
          {bells.map((bell) => {
            const edit = edits[bell.id] ?? { startTimeSec: String(bell.startTimeSec), endTimeSec: String(bell.endTimeSec) };
            return (
              <div key={bell.id} className="flex flex-wrap items-end gap-3 rounded-md border p-3">
                <div className="w-full max-w-xs">
                  <YoutubeClipPreview
                    youtubeUrl={bell.youtubeUrl}
                    startTimeSec={Number(edit.startTimeSec) || 0}
                    endTimeSec={Number(edit.endTimeSec) || 30}
                    title={bell.title}
                    active={playingBellId === bell.id}
                    onPlay={() => setPlayingBellId(bell.id)}
                  />
                </div>
                <div className="min-w-[12rem] flex-1">
                  <div className="font-medium">{bell.title}</div>
                  <div className="text-sm text-muted-foreground">{bell.artist}</div>
                  <a className="text-xs text-primary hover:underline" href={bell.youtubeUrl} target="_blank" rel="noreferrer">
                    YouTube
                  </a>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`start-${bell.id}`}>Od (s)</Label>
                  <Input
                    id={`start-${bell.id}`}
                    className="w-24"
                    type="number"
                    min={0}
                    value={edit.startTimeSec}
                    onChange={(event) =>
                      setEdits((current) => ({ ...current, [bell.id]: { ...edit, startTimeSec: event.target.value } }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`end-${bell.id}`}>Do (s)</Label>
                  <Input
                    id={`end-${bell.id}`}
                    className="w-24"
                    type="number"
                    min={1}
                    value={edit.endTimeSec}
                    onChange={(event) =>
                      setEdits((current) => ({ ...current, [bell.id]: { ...edit, endTimeSec: event.target.value } }))
                    }
                  />
                </div>
                <Button disabled={approvingId === bell.id} onClick={() => approve(bell)}>
                  Zatwierdź
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => setCreatorOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nowa ankieta
        </Button>
      </div>

      {polls.map((poll) => (
        <Card key={poll.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
              {poll.title}
              <Badge variant="secondary">{poll.type === "WEEKLY_BELL" ? "Tydzień" : "Jednorazowa"}</Badge>
              {poll.isActive ? <Badge>Aktywna</Badge> : <Badge variant="outline">Nieaktywna</Badge>}
            </CardTitle>
            <CardDescription>
              {formatDay(poll.startDate)} – {formatDay(poll.endDate)}
              {poll.winnerOptionId ? " · jest prowadzący kandydat" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" size="sm" onClick={() => toggleActive(poll)}>
              {poll.isActive ? "Wyłącz" : "Włącz"}
            </Button>
            {poll.options.map((option) => (
              <div key={option.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                <div className="min-w-[10rem] flex-1">
                  <div className="font-medium">
                    {option.title}
                    {poll.winnerOptionId === option.id ? " · prowadzi" : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {option.voteCount} głosów
                    {option.eligible ? "" : " · pominięty do czasu akceptacji"}
                    {option.firstVoteAt ? ` · pierwszy głos ${option.firstVoteAt}` : ""}
                  </div>
                </div>
                <Button variant="ghost" size="icon" title="Usuń opcję" onClick={() => removeOption(poll.id, option.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {poll.options.length === 0 && <p className="text-sm text-muted-foreground">Brak opcji.</p>}
          </CardContent>
        </Card>
      ))}

      <Dialog open={creatorOpen} onOpenChange={setCreatorOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nowa ankieta</DialogTitle>
            <DialogDescription>Jednorazowa ankieta. Każda opcja odtwarza fragment YouTube. Puste wiersze są pomijane.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="poll-title">Tytuł</Label>
              <Input id="poll-title" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="poll-start">Od</Label>
                <Input id="poll-start" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="poll-end">Do</Label>
                <Input id="poll-end" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
            </div>
            {options.map((option, index) => (
              <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1.4fr_5rem_5rem_auto]">
                <Input
                  placeholder="Tytuł"
                  value={option.title}
                  onChange={(event) =>
                    setOptions((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, title: event.target.value } : item)))
                  }
                />
                <Input
                  placeholder="Link YouTube"
                  value={option.youtubeUrl}
                  onChange={(event) =>
                    setOptions((current) =>
                      current.map((item, itemIndex) => (itemIndex === index ? { ...item, youtubeUrl: event.target.value } : item)),
                    )
                  }
                />
                <Input
                  type="number"
                  min={0}
                  aria-label={`Początek opcji ${index + 1}`}
                  value={option.startTimeSec}
                  onChange={(event) =>
                    setOptions((current) =>
                      current.map((item, itemIndex) => (itemIndex === index ? { ...item, startTimeSec: event.target.value } : item)),
                    )
                  }
                />
                <Input
                  type="number"
                  min={1}
                  aria-label={`Koniec opcji ${index + 1}`}
                  value={option.endTimeSec}
                  onChange={(event) =>
                    setOptions((current) =>
                      current.map((item, itemIndex) => (itemIndex === index ? { ...item, endTimeSec: event.target.value } : item)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Usuń wiersz"
                  onClick={() => setOptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={() => setOptions((current) => [...current, emptyOption()])}>
              Dodaj opcję
            </Button>
          </div>
          <DialogFooter>
            <Button disabled={saving || !title.trim() || !startDate || !endDate} onClick={createPoll}>
              Utwórz
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
