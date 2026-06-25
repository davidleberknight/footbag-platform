import { FreestyleRecordRow } from '../db/db';
import { personHref } from './personLink';
import {
  declaresTrickRole,
  modifierHashtagRole,
  type HashtagRole,
} from '../content/freestyleHashtagRoles';

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

// The hashtag body is the slug lowercased with hyphens as underscores. On an
// already-underscore slug this is a no-op.
function hashtagBody(slug: string): string {
  return slug.toLowerCase().replace(/-/g, '_');
}

export function slugToHashtag(slug: string): string {
  return '#' + hashtagBody(slug);
}

// Render a hashtag from a role, not from the slug alone: a trick is a bare tag,
// and the set / operator / family roles take their prefix. This is the single
// place hashtag form is decided, so a modifier never renders a bare trick tag.
export function hashtagForRole(slug: string, role: HashtagRole): string {
  const body = hashtagBody(slug);
  switch (role) {
    case 'set':      return '#set_' + body;
    case 'operator': return '#operator_' + body;
    case 'family':   return '#family_' + body;
    case 'trick':
    default:         return '#' + body;
  }
}

// The structural role implied by a freestyle_tricks.category value: a modifier /
// operator row is an operator, a set row is a set, everything else is a trick.
export function structuralRoleForCategory(category: string | null | undefined): HashtagRole {
  if (category === 'modifier' || category === 'operator') return 'operator';
  if (category === 'set') return 'set';
  return 'trick';
}

// The hashtag for a concept rendered on a trick surface (browse row, trick
// detail). A real trick, or a dual-role concept the registry also marks a trick
// (pixie / fairy), shows the bare trick tag; any other concept that reaches a
// trick surface (e.g. a set primitive) shows its structural-role tag, so a set
// like atomic reads #set_atomic, never a bare #atomic.
export function trickSurfaceHashtag(slug: string, category: string | null | undefined): string {
  const structural = structuralRoleForCategory(category);
  if (structural === 'trick' || declaresTrickRole(slug)) return slugToHashtag(slug);
  return hashtagForRole(slug, structural);
}

// The hashtag for a concept rendered on a modifier / operator surface (the
// operators index, a modifier detail). The curator role override wins over the
// stored modifier_type, so whirling reads #set_whirling and spinning reads
// #operator_spinning.
export function modifierSurfaceHashtag(slug: string, modifierType: string | null | undefined): string {
  return hashtagForRole(slug, modifierHashtagRole(slug, modifierType));
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
