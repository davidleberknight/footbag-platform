/**
 * freestyleOperatorRegistry: the freestyle operators, read from the
 * freestyle_operators table, and the browse-by-modifier grouping, read from the
 * modifier registry.
 *
 * Owns: every operator with its name, kind, definition, decomposition and its
 * note, worked examples, source note, whether it awaits a curator's confirmation,
 * and its place on the operators page; and, for the trick dictionary's
 * browse-by-modifier view, each registry modifier's group, position and whether
 * it has a full section.
 *
 * Does not own: the operator editor's and the modifier editor's writes
 * (freestyleCurationService), a modifier's ADD (the modifier registry, read by
 * freestyleService), or the operators-page groups and the browse groups with
 * their headings (src/content/freestyleOperatorIndex.ts and
 * src/content/freestyleModifierClusters.ts, page prose rather than data).
 *
 * The operators are a couple of dozen rows several pages consult, so they are read
 * whole and cached; the cache is re-read whenever the table's fingerprint changes,
 * so an edit shows on the next read in every process. The browse grouping is read
 * once per page build by the caller, through modifierBrowse().
 * Read-only: nothing here writes.
 */
import {
  freestyleOperators,
  freestyleTrickModifiers,
  type FreestyleOperatorRow,
  type FreestyleTrickModifierRow,
} from '../db/db';
import type { OperatorKind } from './freestyleOperatorRules';

/** One operator with every curator-authored field, parsed. */
export interface OperatorRecord {
  slug:                string;
  name:                string;
  kind:                OperatorKind;
  definition:          string;
  decomposition:       string | null;
  decompositionNote:   string | null;
  workedExamples:      readonly string[];
  sourceNote:          string | null;
  confirmationPending: boolean;
  pageGroup:           string | null;
  pageOrder:           number | null;
}

interface Snapshot {
  fingerprint: string;
  records:     readonly OperatorRecord[];
  bySlug:      ReadonlyMap<string, OperatorRecord>;
}

let cached: Snapshot | null = null;

function parseExamples(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function build(fingerprint: string): Snapshot {
  const rows = freestyleOperators.listAll.all() as FreestyleOperatorRow[];
  const records: OperatorRecord[] = rows.map((r) => ({
    slug:                r.slug,
    name:                r.name,
    kind:                r.kind as OperatorKind,
    definition:          r.definition,
    decomposition:       r.decomposition,
    decompositionNote:   r.decomposition_note,
    workedExamples:      parseExamples(r.worked_examples_json),
    sourceNote:          r.source_note,
    confirmationPending: r.confirmation_pending === 1,
    pageGroup:           r.page_group,
    pageOrder:           r.page_order,
  }));
  return { fingerprint, records, bySlug: new Map(records.map((r) => [r.slug, r] as const)) };
}

function snapshot(): Snapshot {
  const fp = (freestyleOperators.fingerprint.get() as { fp: string }).fp;
  if (cached === null || cached.fingerprint !== fp) cached = build(fp);
  return cached;
}

/** Every operator, in slug order. */
export function operatorRecords(): readonly OperatorRecord[] {
  return snapshot().records;
}

/** One operator, or null when no operator has that slug. */
export function findOperator(slug: string): OperatorRecord | null {
  return snapshot().bySlug.get(slug.trim().toLowerCase()) ?? null;
}

/** A core operator's definition, or null when the slug is not a core operator. */
export function coreOperatorDefinition(slug: string): string | null {
  const op = findOperator(slug);
  return op && op.kind === 'core' ? op.definition : null;
}

// Set treatments first, body operators next, quantifiers last.
const REFERENCE_TIER: Readonly<Record<OperatorKind, number>> = {
  'set': 0, 'historical-nickname': 0, 'compound-set': 0,
  'body': 1, 'compound-body': 1, 'quantifier': 2, 'core': 3,
};

/**
 * The full reference entries: every non-core operator with a recorded source. An
 * operator known only by its operators-page row has none, so it is not one. In
 * tier order (set treatments, then body operators, then quantifiers), by name
 * within a tier.
 */
export function referenceOperators(): OperatorRecord[] {
  return snapshot().records
    .filter((r) => r.kind !== 'core' && r.sourceNote !== null)
    .sort((a, b) => REFERENCE_TIER[a.kind] - REFERENCE_TIER[b.kind] || a.name.localeCompare(b.name, 'en'));
}

/** The slugs the operators page lists under one group, in their page order. */
export function operatorPageGroupSlugs(groupKey: string): string[] {
  return snapshot().records
    .filter((r) => r.pageGroup === groupKey)
    .sort((a, b) => (a.pageOrder ?? 0) - (b.pageOrder ?? 0) || a.slug.localeCompare(b.slug))
    .map((r) => r.slug);
}

/** The operators-page group a slug is listed under, or null when it is not listed. */
export function operatorPageGroupOf(slug: string): string | null {
  return findOperator(slug)?.pageGroup ?? null;
}

/** Where the browse-by-modifier view lists each registry modifier. */
export interface ModifierBrowse {
  /** The modifier's browse group; 'other' (the catch-all) when it has none. */
  groupOf(slug: string): string;
  /** Whether the modifier has a full section of its own. */
  hasFullSection(slug: string): boolean;
  /** The modifiers placed in one group, in their browse order. */
  membersOf(groupKey: string): string[];
  /** A modifier's position in its group, or null when it has none. */
  orderOf(slug: string): number | null;
}

/** The browse grouping, read once; a page build reads it once and passes it on. */
export function modifierBrowse(): ModifierBrowse {
  const rows = freestyleTrickModifiers.listAll.all() as FreestyleTrickModifierRow[];
  const bySlug = new Map(rows.map((r) => [r.slug, r] as const));
  return {
    groupOf:        (slug) => bySlug.get((slug || '').trim())?.browse_group ?? 'other',
    hasFullSection: (slug) => bySlug.get(slug)?.browse_full_section === 1,
    orderOf:        (slug) => bySlug.get(slug)?.browse_order ?? null,
    membersOf:      (groupKey) => rows
      .filter((r) => r.browse_group === groupKey)
      .sort((a, b) => (a.browse_order ?? Number.MAX_SAFE_INTEGER) - (b.browse_order ?? Number.MAX_SAFE_INTEGER)
        || a.slug.localeCompare(b.slug))
      .map((r) => r.slug),
  };
}
