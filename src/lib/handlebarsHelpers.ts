/**
 * Pure Handlebars helpers extracted from `src/app.ts` so they are directly
 * unit-testable. Each helper is a pure function over its inputs; no DB, no
 * adapters, no I/O.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Render an ISO-shaped date string ("YYYY", "YYYY-MM", "YYYY-MM-DD") for
 * display. Tolerant of partial inputs (legacy-imported event rows commonly
 * carry month or day as "00" when the actual value is unknown).
 *
 * Examples:
 *   '2024-09-15' → '15 September 2024'
 *   '2024-09'    → 'September 2024'
 *   '2024-00-15' → '2024'    (month sentinel "00" falls back to year)
 *   '2024-13-15' → '2024'    (out-of-range month falls back to year)
 *   '2024-09-00' → 'September 2024'  (day sentinel "00" falls back to month)
 *   '2024'       → '2024'
 */
export function formatDate(iso: string): string {
  const parts = String(iso).split('-');
  const year  = parts[0];
  const month = parseInt(parts[1], 10);
  const day   = parseInt(parts[2], 10);
  if (!parts[1] || isNaN(month) || month < 1 || month > 12) return year;
  // day '00' parses to 0, which is not NaN, so the sentinel needs an
  // explicit range check to fall back to month-and-year display.
  if (!parts[2] || isNaN(day) || day < 1 || day > 31) return `${MONTHS[month - 1]} ${year}`;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

const ISO_FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_ANY_PRECISION = /^\d{4}(-\d{2}){0,2}$/;

/**
 * Render a single date, or a '/'-delimited two-date range, for display. A lone
 * ISO date ("YYYY", "YYYY-MM", "YYYY-MM-DD") is formatted exactly as formatDate.
 * A range of two full ISO dates collapses to the shortest unambiguous form:
 * same day renders one date; a same-month range shares the month and year
 * ("21-22 March 1998"); a same-year range shares the year
 * ("21 March - 5 April 1998"); a cross-year range shows both full dates joined
 * by an en dash.
 *
 * Anything the formatter does not recognize as an ISO date or ISO range,
 * including legacy day/month/year strings such as "14/6/1997", is returned
 * unchanged so a presentation pass never mis-parses or degrades a stored value.
 * Source values are preserved upstream; this is presentation only.
 */
export function formatDateRange(value: string): string {
  const raw = String(value).trim();
  const slash = raw.indexOf('/');
  if (slash < 0) {
    return ISO_ANY_PRECISION.test(raw) ? formatDate(raw) : raw;
  }

  const a = raw.slice(0, slash).trim();
  const b = raw.slice(slash + 1).trim();
  // Treat the slash as a range separator only when both endpoints are full ISO
  // dates; otherwise it is part of a single legacy date and the value passes
  // through untouched.
  if (!ISO_FULL_DATE.test(a) || !ISO_FULL_DATE.test(b)) return raw;
  if (a === b) return formatDate(a);

  const pa = a.split('-');
  const pb = b.split('-');
  const EN = '–';
  if (pa[0] === pb[0]) {
    const monthA = parseInt(pa[1], 10);
    const monthB = parseInt(pb[1], 10);
    const dayA = parseInt(pa[2], 10);
    const dayB = parseInt(pb[2], 10);
    if (monthA === monthB) {
      return `${dayA}${EN}${dayB} ${MONTHS[monthA - 1]} ${pa[0]}`;
    }
    return `${dayA} ${MONTHS[monthA - 1]} ${EN} ${dayB} ${MONTHS[monthB - 1]} ${pa[0]}`;
  }
  return `${formatDate(a)} ${EN} ${formatDate(b)}`;
}
