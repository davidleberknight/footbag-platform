/**
 * freestyleFamilyRegistry: the freestyle family roster, read from the
 * freestyle_families and freestyle_family_sublabels tables.
 *
 * Owns: the family roster every freestyle surface groups tricks under, each
 * family's tier (whether it has its own page), its parent, its display order,
 * the teaching text its page reads, its shared-structure line and trick-page
 * note, and the trick family labels that fold into it. It also owns the one
 * decision of whether a family has a page, and so the only href any page uses
 * for /freestyle/families/<slug>.
 *
 * Does not own: which tricks belong to a family (each trick's trick_family or
 * family_override, read by the freestyle service), the family editor's writes
 * (freestyleCurationService), or the catch-surface rule and tier labels
 * (src/content/freestyleFamilyTiers.ts, rules rather than data).
 *
 * The roster is a few dozen rows that nearly every freestyle page consults many
 * times, so it is read whole and cached. The cache is re-read whenever the
 * tables' fingerprint changes, so an edit shows on the next read in every process.
 * Read-only: nothing here writes.
 */
import {
  freestyleFamilies,
  type FreestyleFamilyRow,
  type FreestyleFamilySublabelRow,
} from '../db/db';
import {
  FOUNDATIONAL_TERMINAL_SURFACES,
  type FamilyTier,
} from '../content/freestyleFamilyTiers';

export interface PublicDisplayFamily {
  /** Matches a freestyle_tricks.trick_family value; drives ?family={slug}. */
  slug:    string;
  /** Display label shown on chips, headings and links. */
  label:   string;
  /** Parent family slug for a branch; absent for a root. */
  parent?: string;
}

/** One family with every curator-authored field, parsed. */
export interface FamilyRecord {
  slug:                 string;
  displayName:          string;
  parentSlug:           string | null;
  tier:                 'family_parent' | 'minor_lineage';
  sortOrder:            number;
  hook:                 string | null;
  description:          string | null;
  plainLanguageReading: string | null;
  importance:           string | null;
  howToRecognize:       readonly string[];
  relatedFamilySlugs:   readonly string[];
  sharedStructure:      string | null;
  trickPageNote:        string | null;
  /** The trick family labels that fold into this family, sorted. */
  foldedLabels:         readonly string[];
}

interface Snapshot {
  fingerprint: string;
  records:     readonly FamilyRecord[];
  bySlug:      ReadonlyMap<string, FamilyRecord>;
  display:     readonly PublicDisplayFamily[];
  order:       readonly string[];
  label:       ReadonlyMap<string, string>;
  parentOf:    ReadonlyMap<string, string>;
  parentLabel: ReadonlyMap<string, string>;
  sublabelOf:  ReadonlyMap<string, string>;
}

let cached: Snapshot | null = null;

function parseList(json: string): readonly string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function build(fingerprint: string): Snapshot {
  const rows = freestyleFamilies.listAll.all() as FreestyleFamilyRow[];
  const subs = freestyleFamilies.listSublabels.all() as FreestyleFamilySublabelRow[];
  const foldedBy = new Map<string, string[]>();
  for (const s of subs) {
    const list = foldedBy.get(s.family_slug) ?? [];
    list.push(s.label);
    foldedBy.set(s.family_slug, list);
  }
  const records: FamilyRecord[] = rows.map(r => ({
    slug:                 r.slug,
    displayName:          r.display_name,
    parentSlug:           r.parent_slug,
    tier:                 r.tier,
    sortOrder:            r.sort_order,
    hook:                 r.hook,
    description:          r.description,
    plainLanguageReading: r.plain_language_reading,
    importance:           r.importance,
    howToRecognize:       parseList(r.how_to_recognize_json),
    relatedFamilySlugs:   parseList(r.related_family_slugs_json),
    sharedStructure:      r.shared_structure,
    trickPageNote:        r.trick_page_note,
    foldedLabels:         (foldedBy.get(r.slug) ?? []).sort(),
  }));
  const bySlug = new Map(records.map(r => [r.slug, r] as const));
  const label = new Map(records.map(r => [r.slug, r.displayName] as const));
  const parentOf = new Map(
    records.filter(r => r.parentSlug !== null).map(r => [r.slug, r.parentSlug as string] as const),
  );
  const parentLabel = new Map(
    [...parentOf].flatMap(([slug, parent]) => {
      const l = label.get(parent);
      return l === undefined ? [] : [[slug, l] as const];
    }),
  );
  return {
    fingerprint,
    records,
    bySlug,
    display: records.map(r => (r.parentSlug === null
      ? { slug: r.slug, label: r.displayName }
      : { slug: r.slug, label: r.displayName, parent: r.parentSlug })),
    order: records.map(r => r.slug),
    label,
    parentOf,
    parentLabel,
    sublabelOf: new Map(subs.map(s => [s.label, s.family_slug] as const)),
  };
}

function snapshot(): Snapshot {
  const fp = (freestyleFamilies.fingerprint.get() as { fp: string }).fp;
  if (cached === null || cached.fingerprint !== fp) cached = build(fp);
  return cached;
}

/** Every family, in display order, with every curator-authored field. */
export function familyRecords(): readonly FamilyRecord[] {
  return snapshot().records;
}

/** One family's record, or null when no family has that slug. */
export function familyRecord(slug: string): FamilyRecord | null {
  return snapshot().bySlug.get(slug) ?? null;
}

/** The roster as slug, label and parent, in display order. */
export function publicDisplayFamilies(): readonly PublicDisplayFamily[] {
  return snapshot().display;
}

/** Family slugs in display order. */
export function publicFamilyOrder(): readonly string[] {
  return snapshot().order;
}

/** slug to display label, for every family. */
export function familyLabels(): ReadonlyMap<string, string> {
  return snapshot().label;
}

/** slug to parent slug, for branches only. */
export function familyParentOf(): ReadonlyMap<string, string> {
  return snapshot().parentOf;
}

/** slug to parent label, for branches only. */
export function familyParentLabels(): ReadonlyMap<string, string> {
  return snapshot().parentLabel;
}

/**
 * The family a raw trick_family label shows under: the label itself when it is a
 * family, the family it folds into when it is a folded label, otherwise null.
 */
export function resolveDisplayFamily(label: string): string | null {
  const s = snapshot();
  if (s.bySlug.has(label)) return label;
  return s.sublabelOf.get(label) ?? null;
}

/** The family and, for a branch, its parent: a branch member also counts in its root. */
export function familyWithAncestors(slug: string): string[] {
  const parent = snapshot().parentOf.get(slug);
  return parent ? [slug, parent] : [slug];
}

/**
 * Every raw trick_family label that shows under a family: the family, its
 * branches, and every label that folds into either.
 */
export function rawFamilyLabelsUnder(familySlug: string): string[] {
  const s = snapshot();
  const display = new Set<string>([familySlug]);
  for (const [slug, parent] of s.parentOf) if (parent === familySlug) display.add(slug);
  const raw = new Set<string>(display);
  for (const [label, family] of s.sublabelOf) if (display.has(family)) raw.add(label);
  return [...raw];
}

/** A slug's tier. A universal catch surface is never a family parent. */
export function familyTier(slug: string): FamilyTier {
  if (FOUNDATIONAL_TERMINAL_SURFACES.has(slug)) return 'foundational-terminal-surface';
  return snapshot().bySlug.get(slug)?.tier === 'family_parent' ? 'family-parent' : 'minor-lineage';
}

/** Whether a family has its own page: a family parent that is not a catch surface. */
export function isOfficialFamilyParent(slug: string): boolean {
  return !FOUNDATIONAL_TERMINAL_SURFACES.has(slug)
    && snapshot().bySlug.get(slug)?.tier === 'family_parent';
}

/**
 * The one href any page uses for a family's page, or null when the family has no
 * page. Every link to /freestyle/families/<slug> comes from here, so a family
 * moved out of family-parent tier loses every link with its page.
 */
export function familyPageHref(slug: string): string | null {
  return isOfficialFamilyParent(slug) ? `/freestyle/families/${slug}` : null;
}

/** The structure every member of a family keeps, or null. */
export function getFamilyInvariant(familySlug: string): string | null {
  return snapshot().bySlug.get(familySlug)?.sharedStructure ?? null;
}

/** The family note shown on the family's anchor trick's page, or null. */
export function familyTrickPageNote(familySlug: string): string | null {
  return snapshot().bySlug.get(familySlug)?.trickPageNote ?? null;
}
