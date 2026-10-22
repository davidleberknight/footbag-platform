/**
 * Runtime-relative time helpers for deterministic temporal fixtures.
 *
 * Time-dependent fixtures anchor to "now" via these helpers instead of
 * hard-coded absolute years. An absolute future date (e.g. an Active-Player
 * expiry of 2027-12-31) silently flips meaning once the wall clock passes it,
 * because the live tier/Active-Player gates compare a stored timestamp to the
 * SQLite clock (`strftime('now')`), which test fake-timers cannot move. Seeding
 * an expiry as "now + N days" keeps the fixture's intent (active vs expired)
 * stable for all time, and assertions check behavior rather than the literal
 * date.
 */
export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** ISO timestamp offset from now by the given milliseconds (negative = past). */
export function isoFromNow(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

export function isoDaysFromNow(days: number): string {
  return isoFromNow(days * DAY_MS);
}

export function isoDaysAgo(days: number): string {
  return isoFromNow(-days * DAY_MS);
}

export function isoHoursAgo(hours: number): string {
  return isoFromNow(-hours * HOUR_MS);
}

/** The UTC calendar date (YYYY-MM-DD) of an epoch-milliseconds instant. */
export function dateOnly(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A UTC instant on `day` of the calendar month `back` months before this one,
 * with its YYYY-MM key and its "Month YYYY" label, for readers that group by
 * month.
 */
export function inMonthsAgo(back: number, day: number): { iso: string; month: string; label: string } {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day, 10));
  const month = d.toISOString().slice(0, 7);
  return { iso: d.toISOString(), month, label: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
}
