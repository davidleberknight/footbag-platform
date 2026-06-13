import { FreestyleRecordRow } from '../db/db';
import { personHref } from './personLink';

export function trickNameToSlug(name: string): string {
  // A trailing side qualifier (ss / op / near / far / same side) never changes
  // the canonical slug, so a record named "Clipper Stall (ss)" must resolve to
  // clipper-stall, not clipper-stall-ss. Strip it before slugifying.
  return name
    .replace(/\s*\((?:ss|op|opp|opposite|near|far|same[ -]side)\)\s*$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function slugToHashtag(slug: string): string {
  return '#' + slug.toLowerCase().replace(/-/g, '_');
}

/**
 * A "Unique <descriptor>" record name (Unique 3-Dex, Unique Beastly, Unique
 * Fearless) is a one-off competition entry — a "unique" trick performed in a
 * given event — not a dictionary trick. It has no canonical trick and must not
 * link to one (the slug would 404). Record-only: the name still displays, but
 * carries no trick href.
 */
function isRecordOnlyTrickName(name: string): boolean {
  return /^unique\b/i.test(name.trim());
}

export interface FreestyleRecordViewModel {
  id: string;
  holderName: string;
  holderHref: string | null;
  trickName: string | null;
  trickHref: string | null;
  sortName: string | null;
  addsCount: number | null;
  valueNumeric: number;
  achievedDate: string | null;
  dateApproximate: boolean;
  videoUrl: string | null;
  videoTimecode: string | null;
}

/**
 * Excel-epoch placeholder dates (1905-MM-DD) appear in upstream records_master.csv
 * when the source had a date cell formatted but unfilled. Footbag did not exist
 * before 1970, so any record with an earlier year is a placeholder, not a real
 * achievement date. Treat as unknown at the presentation layer; the underlying
 * row is preserved.
 */
function dateIsPlaceholder(iso: string | null): boolean {
  if (!iso) return false;
  const year = Number(iso.slice(0, 4));
  return Number.isFinite(year) && year < 1970;
}

/**
 * Drop any video URL that is not an http(s) absolute URL before it reaches an
 * href. The source is migrated CSV / curator-writable, so a `javascript:` (or
 * other scheme) value would otherwise survive HTML-escaping inside the
 * attribute. Mirrors the allowlist in src/web/helpers/externalLink.ts. Returns
 * null on rejection so the templates' existing `{{#if videoUrl}}` guard hides
 * the link.
 */
function safeVideoUrl(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

/**
 * The trick link for a record name. Null for record-only names. When a
 * `resolvable` set is supplied (active trick slugs + slugified aliases), the
 * link is also suppressed unless the slug actually resolves to a trick — so a
 * record whose trick isn't in the dictionary doesn't badge to a 404 page. With
 * no set, links unconditionally (used where the trick is known to resolve).
 */
function trickHrefFor(name: string | null, resolvable?: ReadonlySet<string>): string | null {
  if (!name || isRecordOnlyTrickName(name)) return null;
  const slug = trickNameToSlug(name);
  if (resolvable && !resolvable.has(slug)) return null;
  return `/freestyle/tricks/${slug}`;
}

export function shapeFreestyleRecord(row: FreestyleRecordRow, resolvableSlugs?: ReadonlySet<string>): FreestyleRecordViewModel {
  const placeholderDate = dateIsPlaceholder(row.achieved_date);
  return {
    id:              row.id,
    holderName:      row.holder_name,
    holderHref:      personHref(row.holder_member_slug, row.person_id),
    trickName:       row.trick_name,
    trickHref:       trickHrefFor(row.trick_name, resolvableSlugs),
    sortName:        row.sort_name,
    addsCount:       row.adds_count,
    valueNumeric:    row.value_numeric,
    achievedDate:    placeholderDate ? null : row.achieved_date,
    dateApproximate: !placeholderDate && row.date_precision !== 'day',
    videoUrl:        safeVideoUrl(row.video_url),
    videoTimecode:   row.video_timecode,
  };
}
