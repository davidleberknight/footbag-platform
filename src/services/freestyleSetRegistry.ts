/**
 * freestyleSetRegistry: the freestyle sets, read from the freestyle_sets table.
 *
 * Owns: every set the Set Encyclopedia lists and gives a page, with its name,
 * group, display order, formula, plain explanation, related sets and whether it
 * is held off the encyclopedia list; the set hashtag, always `#set_<slug>`; and
 * the decisions that depend on which sets exist (whether a slug folds to another
 * set, and whether an old set route redirects).
 *
 * Does not own: the set editor's writes (freestyleCurationService), the set
 * groups and their text and the redirect maps (src/content/freestyleCanonicalSets.ts,
 * page prose and routing rather than data), or a set's teaching guide
 * (symbolicSetEducation.ts).
 *
 * The sets are a few dozen rows that several pages consult, so they are read
 * whole and cached. The cache is re-read whenever the table's fingerprint
 * changes, so an edit shows on the next read in every process.
 * Read-only: nothing here writes.
 */
import { freestyleSets, type FreestyleSetRow } from '../db/db';
import {
  SET_ROUTE_RETIRED_REDIRECTS,
  SET_SLUG_ALIASES,
  type SetSubtype,
} from '../content/freestyleCanonicalSets';

/** One related set as a page links it: the label is the stored label, or the
 *  related set's own name when none is stored. */
export interface RelatedSetLink {
  slug:  string;
  label: string;
}

/** One related set as stored: an empty label shows the related set's name. */
export interface StoredRelatedSet {
  slug:  string;
  label: string;
}

/** One set with every curator-authored field, parsed. */
export interface SetRecord {
  slug:                     string;
  /** Always `#set_<slug>`. */
  hashtag:                  string;
  displayName:              string;
  subtype:                  SetSubtype;
  sortOrder:                number;
  /** Empty when the set's notation is pending. */
  formula:                  string;
  movementExplanation:      string;
  /** The related sets as stored, in order. */
  storedRelatedSets:        readonly StoredRelatedSet[];
  /** The related sets as a page links them, in order. */
  relatedSystems:           readonly RelatedSetLink[];
  heldFromEncyclopediaList: boolean;
}

interface Snapshot {
  fingerprint: string;
  records:     readonly SetRecord[];
  bySlug:      ReadonlyMap<string, SetRecord>;
}

let cached: Snapshot | null = null;

function parseRelated(json: string): StoredRelatedSet[] {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.flatMap((v): StoredRelatedSet[] => {
      if (v === null || typeof v !== 'object') return [];
      const { slug, label } = v as { slug?: unknown; label?: unknown };
      return typeof slug === 'string' ? [{ slug, label: typeof label === 'string' ? label : '' }] : [];
    });
  } catch {
    return [];
  }
}

function build(fingerprint: string): Snapshot {
  const rows = freestyleSets.listAll.all() as FreestyleSetRow[];
  const nameOf = new Map(rows.map((r) => [r.slug, r.display_name] as const));
  const records: SetRecord[] = rows.map((r) => {
    const stored = parseRelated(r.related_sets_json);
    return {
      slug:                     r.slug,
      hashtag:                  `#set_${r.slug}`,
      displayName:              r.display_name,
      subtype:                  r.set_group as SetSubtype,
      sortOrder:                r.sort_order,
      formula:                  r.formula,
      movementExplanation:      r.explanation,
      storedRelatedSets:        stored,
      relatedSystems:           stored.map((s) => ({ slug: s.slug, label: s.label || (nameOf.get(s.slug) ?? s.slug) })),
      heldFromEncyclopediaList: r.held_from_list === 1,
    };
  });
  return { fingerprint, records, bySlug: new Map(records.map((r) => [r.slug, r] as const)) };
}

function snapshot(): Snapshot {
  const fp = (freestyleSets.fingerprint.get() as { fp: string }).fp;
  if (cached === null || cached.fingerprint !== fp) cached = build(fp);
  return cached;
}

/** Every set, in display order. */
export function canonicalSets(): readonly SetRecord[] {
  return snapshot().records;
}

/** One set, or null when no set has that slug. */
export function findCanonicalSetBySlug(slug: string): SetRecord | null {
  return snapshot().bySlug.get(slug) ?? null;
}

/**
 * The set slug a retired alias slug folds to, or null when the slug is not a
 * fold. A real set is never folded.
 */
export function resolveCanonicalSetAlias(slug: string): string | null {
  if (snapshot().bySlug.has(slug)) return null;
  return SET_SLUG_ALIASES.get(slug) ?? null;
}

/** Where an old /freestyle/sets/:slug route for a retired concept lands, or null.
 *  Never fires for a slug that is a set. */
export function resolveSetRouteRedirect(slug: string): string | null {
  if (snapshot().bySlug.has(slug)) return null;
  return SET_ROUTE_RETIRED_REDIRECTS.get(slug) ?? null;
}
