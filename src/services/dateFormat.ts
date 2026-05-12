/**
 * Display-only date formatting helpers shared across view-model builders.
 *
 * Returns the raw ISO string when the input cannot be parsed, so callers
 * surfacing user-facing copy never render an empty placeholder for a date
 * that exists in the database. Default locale is `en-US`; callers needing
 * a different locale pass it explicitly. Time zone is fixed to UTC for
 * date-only output so all viewers see the same calendar day regardless of
 * client locale.
 */

type DateStyle = 'short' | 'long';

const SHORT_OPTS: Intl.DateTimeFormatOptions = {
  year:     'numeric',
  month:    'short',
  day:      'numeric',
  timeZone: 'UTC',
};

const LONG_OPTS: Intl.DateTimeFormatOptions = {
  year:     'numeric',
  month:    'long',
  day:      'numeric',
  timeZone: 'UTC',
};

export function formatDateDisplay(
  iso: string,
  opts: { locale?: string; style?: DateStyle } = {},
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const fmt = opts.style === 'long' ? LONG_OPTS : SHORT_OPTS;
  return d.toLocaleDateString(opts.locale ?? 'en-US', fmt);
}
