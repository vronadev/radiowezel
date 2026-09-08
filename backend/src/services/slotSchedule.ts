import type { BreakWindow, ScheduleContext, ScheduleSlot } from "../@types/models.js";
import type { IClock } from "../interfaces/IClock.js";
import { SystemClock } from "./systemClock.js";

export class SlotSchedule {
  constructor(
    private readonly slots: ScheduleSlot[],
    private readonly clock: IClock = new SystemClock(),
    private readonly bellOffsetSeconds = 0,
  ) {}

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
    return atSeconds < this.musicEndSeconds(slot);
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
    if (!this.slots.length) {
      return from;
    }
    let cursor = new Date(from.getTime());
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const atSeconds = this.nowSeconds(cursor);
      if (this.isMusicWindow(atSeconds)) {
        return cursor;
      }
      const nextBreak = this.getNextBreakStart(atSeconds);
      if (!nextBreak) {
        return cursor;
      }
      const jumped = this.dateFromSeconds(nextBreak.start, cursor);
      if (jumped.getTime() <= cursor.getTime()) {
        const tomorrow = new Date(cursor.getTime());
        tomorrow.setDate(tomorrow.getDate() + 1);
        cursor = this.dateFromSeconds(this.parseTimeToSeconds(nextBreak.slot.start), tomorrow);
        continue;
      }
      cursor = jumped;
    }
    return cursor;
  }

  getScheduleContext(): ScheduleContext {
    if (!this.slots.length) {
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

  private musicEndSeconds(slot: { start: number; end: number }): number {
    return Math.max(slot.start, slot.end - Math.max(0, this.bellOffsetSeconds));
  }
}
