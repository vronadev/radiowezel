import type { CyclicScheduleItem, OneOffScheduleItem } from "../@types/models.js";
import type { PlaylistScheduleRepository } from "../repositories/playlistScheduleRepository.js";
import { formatLocalDate, localWeekday } from "../utils/localCalendar.js";

export class ScheduleService {
  constructor(private readonly playlistScheduleRepository: PlaylistScheduleRepository) {}

  resolveScheduledPlaylistId(at: Date = new Date()): string | null {
    const dateStr = formatLocalDate(at);
    const dayOfWeek = localWeekday(at);
    const oneOff = this.playlistScheduleRepository.findOneOffPlaylistId(dateStr);
    if (oneOff) {
      return oneOff;
    }
    const cyclic = this.playlistScheduleRepository.findCyclicPlaylistId(dayOfWeek);
    return cyclic ?? null;
  }

  listCyclic(): CyclicScheduleItem[] {
    return this.playlistScheduleRepository.listCyclic();
  }

  listOneOff(): OneOffScheduleItem[] {
    return this.playlistScheduleRepository.listOneOff();
  }

  replaceCyclic(items: Array<{ playlistId: string; dayOfWeek: number }>): void {
    const valid = items.filter((item) => item.playlistId && item.dayOfWeek >= 0 && item.dayOfWeek <= 6);
    this.playlistScheduleRepository.replaceCyclic(valid);
  }

  replaceOneOff(items: Array<{ playlistId: string; date: string }>): void {
    const valid = items.filter((item) => item.playlistId && /^\d{4}-\d{2}-\d{2}$/.test(item.date));
    this.playlistScheduleRepository.replaceOneOff(valid);
  }

  deleteByPlaylistId(playlistId: string): void {
    this.playlistScheduleRepository.deleteByPlaylistId(playlistId);
  }
}
