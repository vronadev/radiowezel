import type { CyclicScheduleItem, OneOffScheduleItem } from "../@types/models.js";
import type { PlaylistScheduleRepository } from "../repositories/playlistScheduleRepository.js";
import { formatLocalDate, localWeekday } from "../utils/localCalendar.js";

export class ScheduleService {
  constructor(private readonly playlistScheduleRepository: PlaylistScheduleRepository) {}

  resolveScheduledPlaylistIds(at: Date = new Date()): string[] | null {
    const dateStr = formatLocalDate(at);
    const dayOfWeek = localWeekday(at);
    const oneOff = this.playlistScheduleRepository.findOneOffPlaylistIds(dateStr);
    if (oneOff.length > 0) {
      return oneOff;
    }
    const cyclic = this.playlistScheduleRepository.findCyclicPlaylistIds(dayOfWeek);
    return cyclic.length > 0 ? cyclic : null;
  }

  /**
   * @deprecated Returns only the first scheduled playlist for the day.
   * Use resolveScheduledPlaylistIds.
   */
  resolveScheduledPlaylistId(at: Date = new Date()): string | null {
    return this.resolveScheduledPlaylistIds(at)?.[0] ?? null;
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
