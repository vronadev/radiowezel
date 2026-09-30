import type { BreakWindow, ScheduleContext, ScheduleSlot } from "../@types/models.js";
import { DEFAULT_ACTIVE_PLAYBACK_DAYS } from "../config/activePlaybackDays.js";
import type { IClock } from "../interfaces/IClock.js";
import { SystemClock } from "./systemClock.js";

export class SlotSchedule {
  private activeDays: Set<number>;

  constructor(
    private readonly slots: ScheduleSlot[],
    private readonly clock: IClock = new SystemClock(),
    private readonly bellEndOffsetSeconds = 0,
    private readonly bellStartOffsetSeconds = 0,
    activeDays: number[] = DEFAULT_ACTIVE_PLAYBACK_DAYS,
  ) {
    this.activeDays = new Set(activeDays);
  }

  setActiveDays(days: number[]): void {
    this.activeDays = new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6));
  }

  getActiveDays(): number[] {
    return [...this.activeDays].sort((left, right) => left - right);
  }

  isPlaybackDay(at: Date = this.clock.now()): boolean {
    return this.activeDays.has(at.getDay());
  }

  getSlots(): ScheduleSlot[] {
    return this.slots;
  }

  parseTimeToSeconds(timeStr: string): number {
    const [hours, minutes] = timeStr.split(":").map(Number);
    return (hours || 0) * 3600 + (minutes || 0) * 60;
  }

  /** Seconds since local midnight. Uses the process timezone (`TZ`, e.g. Europe/Warsaw). */
  nowSeconds(at: Date = this.clock.now()): number {
    return at.getHours() * 3600 + at.getMinutes() * 60 + at.getSeconds();
  }

  getNextBreakStart(fromSeconds = this.nowSeconds()): BreakWindow | null {
    const sorted = [...this.slots].sort(
      (left, right) => this.parseTimeToSeconds(left.start) - this.parseTimeToSeconds(right.start),
    );
    for (const slot of sorted) {
      const start = this.parseTimeToSeconds(slot.start);
      if (start > fromSeconds) {
        return { start, end: this.parseTimeToSeconds(slot.end), slot };
      }
    }
    const first = sorted[0];
    if (!first) {
      return null;
    }
    const start = this.parseTimeToSeconds(first.start);
    return { start: start + 24 * 3600, end: this.parseTimeToSeconds(first.end) + 24 * 3600, slot: first };
  }

  getCurrentOrNextBreakStart(fromSeconds = this.nowSeconds()): BreakWindow | null {
    for (const slot of this.slots) {
      const start = this.parseTimeToSeconds(slot.start);
      const end = this.parseTimeToSeconds(slot.end);
      if (fromSeconds >= start && fromSeconds < end) {
        return { start, end, slot };
      }
    }
    return this.getNextBreakStart(fromSeconds);
  }

  isInBreak(atSeconds = this.nowSeconds()): boolean {
    return this.findSlot(atSeconds) != null;
  }

  isMusicWindow(atSeconds = this.nowSeconds()): boolean {
    const slot = this.findSlot(atSeconds);
    if (!slot) {
      return false;
    }
    return atSeconds >= this.musicStartSeconds(slot) && atSeconds < this.musicEndSeconds(slot);
  }

  getSlotEndSeconds(atSeconds = this.nowSeconds()): number | null {
    const slot = this.findSlot(atSeconds);
    return slot ? this.musicEndSeconds(slot) : null;
  }

  secondsToISODate(secondsFromMidnight: number, base = this.clock.now()): string {
    return this.dateFromSeconds(secondsFromMidnight, base).toISOString();
  }

  dateFromSeconds(secondsFromMidnight: number, base = this.clock.now()): Date {
    const date = new Date(base.getTime());
    const daySeconds = 24 * 3600;
    const extraDays = Math.floor(secondsFromMidnight / daySeconds);
    let seconds = secondsFromMidnight - extraDays * daySeconds;
    if (seconds < 0) {
      seconds += daySeconds;
    }
    date.setDate(date.getDate() + extraDays);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = Math.floor(seconds % 60);
    date.setHours(hours, minutes, remainder, 0);
    return date;
  }

  nextPlayableInstant(from: Date): Date {
    let cursor = new Date(from.getTime());
    if (!this.slots.length) {
      return this.isPlaybackDay(cursor) ? cursor : (this.firstInstantOnNextOpenDay(cursor) ?? cursor);
    }
    for (let attempt = 0; attempt < 21; attempt += 1) {
      if (!this.isPlaybackDay(cursor)) {
        const opened = this.firstInstantOnNextOpenDay(cursor);
        if (!opened || opened.getTime() <= cursor.getTime()) {
          return cursor;
        }
        cursor = opened;
        continue;
      }
      const atSeconds = this.nowSeconds(cursor);
      if (this.isMusicWindow(atSeconds)) {
        return cursor;
      }
      const current = this.findSlot(atSeconds);
      if (current) {
        const musicStart = this.musicStartSeconds(current);
        if (atSeconds < musicStart && musicStart < this.musicEndSeconds(current)) {
          return this.dateFromSeconds(musicStart, cursor);
        }
      }
      const nextBreak = this.getNextBreakStart(atSeconds);
      if (!nextBreak) {
        return cursor;
      }
      const jumped = this.dateFromSeconds(this.musicStartForBreak(nextBreak), cursor);
      if (jumped.getTime() <= cursor.getTime()) {
        const tomorrow = new Date(cursor.getTime());
        tomorrow.setDate(tomorrow.getDate() + 1);
        const slotTimes = {
          start: this.parseTimeToSeconds(nextBreak.slot.start),
          end: this.parseTimeToSeconds(nextBreak.slot.end),
        };
        cursor = this.dateFromSeconds(this.musicStartSeconds(slotTimes), tomorrow);
        continue;
      }
      cursor = jumped;
    }
    return cursor;
  }

  /** Music end of the latest slot on the calendar day of `day`. */
  lastMusicEndOn(day: Date): Date | null {
    if (!this.slots.length) {
      return null;
    }
    let latest = -1;
    for (const slot of this.slots) {
      const start = this.parseTimeToSeconds(slot.start);
      const end = this.parseTimeToSeconds(slot.end);
      const musicEnd = this.musicEndSeconds({ start, end });
      if (musicEnd > latest) {
        latest = musicEnd;
      }
    }
    if (latest < 0) {
      return null;
    }
    return this.dateFromSeconds(latest, day);
  }

  getScheduleContext(): ScheduleContext {
    if (!this.slots.length || !this.isPlaybackDay()) {
      return { currentSlot: null, nextSlot: null, inBreak: false };
    }
    const inBreak = this.isInBreak();
    const current = this.getCurrentOrNextBreakStart();
    const next = inBreak && current ? this.getNextBreakStart(current.end) : current;
    return {
      currentSlot: inBreak && current?.slot ? { start: current.slot.start, end: current.slot.end } : null,
      nextSlot: next?.slot ? { start: next.slot.start, end: next.slot.end } : null,
      inBreak,
    };
  }

  private firstInstantOnNextOpenDay(from: Date): Date | null {
    const day = new Date(from.getTime());
    for (let step = 0; step < 7; step += 1) {
      day.setDate(day.getDate() + 1);
      if (this.isPlaybackDay(day)) {
        return this.firstMusicInstant(day);
      }
    }
    return null;
  }

  private firstMusicInstant(day: Date): Date {
    if (!this.slots.length) {
      const midnight = new Date(day.getTime());
      midnight.setHours(0, 0, 0, 0);
      return midnight;
    }
    let earliest = Number.POSITIVE_INFINITY;
    let chosen: { start: number; end: number } | null = null;
    for (const slot of this.slots) {
      const start = this.parseTimeToSeconds(slot.start);
      const end = this.parseTimeToSeconds(slot.end);
      if (start < earliest) {
        earliest = start;
        chosen = { start, end };
      }
    }
    return this.dateFromSeconds(this.musicStartSeconds(chosen ?? { start: 0, end: 0 }), day);
  }

  private findSlot(atSeconds: number): { start: number; end: number } | null {
    for (const slot of this.slots) {
      const start = this.parseTimeToSeconds(slot.start);
      const end = this.parseTimeToSeconds(slot.end);
      if (atSeconds >= start && atSeconds < end) {
        return { start, end };
      }
    }
    return null;
  }

  private musicStartForBreak(breakWindow: BreakWindow): number {
    const slotTimes = {
      start: this.parseTimeToSeconds(breakWindow.slot.start),
      end: this.parseTimeToSeconds(breakWindow.slot.end),
    };
    const dayShift = breakWindow.start - slotTimes.start;
    return this.musicStartSeconds(slotTimes) + dayShift;
  }

  private musicStartSeconds(slot: { start: number; end: number }): number {
    const musicEnd = this.musicEndSeconds(slot);
    return Math.min(musicEnd, slot.start + Math.max(0, this.bellStartOffsetSeconds));
  }

  private musicEndSeconds(slot: { start: number; end: number }): number {
    return Math.max(slot.start, slot.end - Math.max(0, this.bellEndOffsetSeconds));
  }
}
