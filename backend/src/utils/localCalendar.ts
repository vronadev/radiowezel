/** Local calendar helpers. `Date#toISOString()` is always UTC and must not be used for day/slot lookups. */

export function formatLocalDate(at: Date): string {
  const year = at.getFullYear();
  const month = String(at.getMonth() + 1).padStart(2, "0");
  const day = String(at.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localWeekday(at: Date): number {
  return at.getDay();
}
