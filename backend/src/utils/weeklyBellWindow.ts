import { formatLocalDate } from "./localCalendar.js";

export interface WeeklyBellWindow {
  startDate: string;
  endDate: string;
}

function addDays(at: Date, days: number): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate() + days);
}

function mondayOfSchoolWeek(at: Date): Date {
  const daysSinceMonday = (at.getDay() + 6) % 7;
  return addDays(at, -daysSinceMonday);
}

/** Monday–Friday local dates for the school week that contains `at`. */
export function weeklyBellWindow(at: Date): WeeklyBellWindow {
  const monday = mondayOfSchoolWeek(at);
  const friday = addDays(monday, 4);
  return {
    startDate: formatLocalDate(monday),
    endDate: formatLocalDate(friday),
  };
}

/**
 * Polls that should exist for the recurring Monday–Friday bell vote.
 * Friday, Saturday, and Sunday also include the following school week.
 */
export function recurringWeeklyBellWindows(at: Date): WeeklyBellWindow[] {
  const current = weeklyBellWindow(at);
  const weekday = at.getDay();
  if (weekday !== 5 && weekday !== 6 && weekday !== 0) {
    return [current];
  }
  const nextMonday = addDays(mondayOfSchoolWeek(at), 7);
  return [current, weeklyBellWindow(nextMonday)];
}

export function weeklyBellPollTitle(window: WeeklyBellWindow): string {
  return `Dzwonek tygodnia ${window.startDate}`;
}
