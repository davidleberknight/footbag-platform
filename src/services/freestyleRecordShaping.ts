/**
 * Freestyle record shaping, shared by every surface that shows a record: the
 * records page, a trick's records, a person's history page and the admin record
 * lists.
 *
 * Owns the one record view model (shapeFreestyleRecord), the plain name of each
 * record type, and the name-to-slug and slug-to-hashtag rules the record pages
 * and the dictionary share. A record's trick links only when its name resolves
 * to an active trick and the record is not under curator review; a "Unique ..."
 * record names a competition entry, not a trick, so it never links. A record's
 * ADD is the dictionary's value for the trick it resolves to; a record under
 * review, a "Unique ..." record, or one whose trick does not resolve keeps the
 * count stored on the record.
 *
 * Pure functions over rows the caller has read; no database access here.
 */
import { FreestyleRecordRow } from '../db/db';
import { personHref } from './personLink';
import { parseVideoLink } from '../lib/videoPlatforms';

/** The one plain name for each freestyle record type, public and admin alike. */
const RECORD_TYPE_LABELS: Record<string, string> = {
  trick_consecutive:        'Consecutive Completions',
  trick_consecutive_dex:   'Consecutive Completions (Dex)',
  trick_consecutive_juggle: 'Consecutive Juggle',
};

/** A record type's plain name, or the stored code when no name is set. */
export function recordTypeLabel(recordType: string): string {
  return RECORD_TYPE_LABELS[recordType] ?? recordType;
}

export function trickNameToSlug(name: string): string {
  // The slug is the lexical form of the name only: lowercase, non-alphanumeric
  // runs to underscores. A positional qualifier (ss / op / near / far / same side) is
  // structural, not lexical, so it is preserved here, never stripped — identity is
  // decided by configuration, not by deleting the qualifier. Preserving it keeps
  // app-side resolution in agreement with the loader, which slugifies the same way.
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// Record-resolution normalization, used only in the record-to-trick resolution path,
// never in the dictionary identity layer above (which preserves qualifiers). In the
// world-record vocabulary a terminal "(ss)" on a trick name is redundant label
// notation: same-side is implicit in the canonical trick, so the "(ss)" names no
// configuration the dictionary distinguishes. Strip only a terminal "(ss)" here, then
// resolve the remaining name with the ordinary trickNameToSlug. This deliberately does
// not touch (op) / (near) / (far), which name distinct configurations.
export function recordTrickNameToSlug(name: string): string {
  return trickNameToSlug(name.replace(/\s*\(\s*ss\s*\)\s*$/i, ''));
}

// The hashtag body is the slug lowercased with hyphens as underscores. On an
// already-underscore slug this is a no-op.
function hashtagBody(slug: string): string {
  return slug.toLowerCase().replace(/-/g, '_');
}

// A trick's hashtag is its bare slug: the one tag form a trick has. Sets,
// families and modifiers carry no hashtag of their own.
export function slugToHashtag(slug: string): string {
  return '#' + hashtagBody(slug);
}

// Display-only: strip a trailing positional side qualifier from a trick name so
// a heading or breadcrumb reads as the plain trick name ("Mirage (op)" becomes
// "Mirage"). Identity is unaffected: the slug and every record lookup keep the
// qualifier (positional identity is by configuration), so this is never used to
// derive a slug or a lookup key, only a display string.
export function stripDisplaySideQualifier(name: string): string {
  return name
    .replace(/\s*\((?:ss|op|opp|opposite|near|far|same[\s-]?side)\)\s*$/i, '')
    .trim();
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
  // Curator-review status: a concise note when the record's canonical identity
  // is under review, else null. A reviewed record never carries a trick link.
  reviewNote: string | null;
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
 * The achieved date cut to the precision it is known to. A month-precision date is
 * stored as the first of its month and a year-precision one as the first of
 * January, so showing the stored day would claim a day nobody recorded; the date
 * formatter renders `YYYY-MM` as "June 2010" and `YYYY` as "2010". Day and
 * approximate dates keep the full day.
 */
function achievedDateForPrecision(iso: string, precision: string): string {
  if (precision === 'month') return iso.slice(0, 7);
  if (precision === 'year') return iso.slice(0, 4);
  return iso;
}

/**
 * Drop any video URL that is not a video link on one of the four platforms the
 * site allows (YouTube, Vimeo, TikTok, Instagram) before it reaches an href.
 * The source is migrated CSV / curator-writable, so a `javascript:` (or other
 * scheme) value would otherwise survive HTML-escaping inside the attribute, and
 * a link to any other host breaks the site's video-platform rule. Returns null
 * on rejection so the templates' existing `{{#if videoUrl}}` guard hides the
 * link.
 */
function safeVideoUrl(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return parseVideoLink(trimmed) ? trimmed : null;
}

/**
 * The trick link for a record name. Null for record-only names. When a `resolve`
 * function is supplied it decides both whether the name has a live trick page and
 * which slug that page lives at: a name that resolves nowhere active yields null,
 * so a record whose trick isn't in the dictionary doesn't badge to a 404 page, and
 * a name that reaches its trick through an alias yields the canonical slug, so the
 * rendered link lands on the live page instead of taking a redirect hop. With no
 * resolver, links unconditionally (used where the trick is known to resolve).
 */
function trickHrefFor(name: string | null, resolve?: (slug: string) => string | null): string | null {
  if (!name || isRecordOnlyTrickName(name)) return null;
  const slug = recordTrickNameToSlug(name);
  if (!resolve) return `/freestyle/tricks/${slug}`;
  const canonical = resolve(slug);
  return canonical ? `/freestyle/tricks/${canonical}` : null;
}

/**
 * The ADD a record table shows: its trick's ADD from the dictionary when the
 * record's trick resolves and a lookup is supplied, else the figure the record's
 * source reported. The dictionary is the authority on a trick's ADD; a source
 * such as PassBack can score the same trick differently, and the record keeps
 * that figure stored as reported. A record under curator review keeps its own
 * figure, since which trick it is has not been settled.
 */
function recordAddsFor(
  row: FreestyleRecordRow,
  underReview: boolean,
  resolveActiveSlug: ((slug: string) => string | null) | undefined,
  trickAdds: ((slug: string) => number | null) | undefined,
): number | null {
  if (!trickAdds || underReview || !row.trick_name || isRecordOnlyTrickName(row.trick_name)) {
    return row.adds_count;
  }
  const slug = recordTrickNameToSlug(row.trick_name);
  const canonical = resolveActiveSlug ? resolveActiveSlug(slug) : slug;
  return (canonical ? trickAdds(canonical) : null) ?? row.adds_count;
}

export function shapeFreestyleRecord(
  row: FreestyleRecordRow,
  resolveActiveSlug?: (slug: string) => string | null,
  trickAdds?: (slug: string) => number | null,
): FreestyleRecordViewModel {
  const placeholderDate = dateIsPlaceholder(row.achieved_date);
  // A record under curator review must not link to a speculative canonical
  // trick, even if its name happens to slugify onto one.
  const reviewNote = row.curator_review_note?.trim() || null;
  return {
    id:              row.id,
    holderName:      row.holder_name,
    holderHref:      personHref(row.holder_member_slug, row.person_id),
    trickName:       row.trick_name,
    trickHref:       reviewNote ? null : trickHrefFor(row.trick_name, resolveActiveSlug),
    sortName:        row.sort_name,
    addsCount:       recordAddsFor(row, !!reviewNote, resolveActiveSlug, trickAdds),
    valueNumeric:    row.value_numeric,
    achievedDate:    placeholderDate || !row.achieved_date
      ? null
      : achievedDateForPrecision(row.achieved_date, row.date_precision),
    // A month or year date already says how much is known by what it shows, so
    // only a date that is itself an estimate carries the approximate marker.
    dateApproximate: !placeholderDate && row.date_precision === 'approximate',
    videoUrl:        safeVideoUrl(row.video_url),
    videoTimecode:   row.video_timecode,
    reviewNote,
  };
}
