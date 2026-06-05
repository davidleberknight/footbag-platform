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
