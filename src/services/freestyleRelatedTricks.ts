import { FreestyleTrickRow } from '../db/db';
import { slugToHashtag } from './freestyleRecordShaping';

export interface FreestyleRelatedTrick {
  slug:          string;
  canonicalName: string;
  hashtag:       string;
  adds:          string | null;
  detailHref:    string;
  rule:          'family' | 'modifier-prefix' | 'parent' | 'grandparent';
}

const MAX_RESULTS  = 8;
const R3_GATE_SIZE = 6;

function modifierPrefix(slug: string): string | null {
  const i = slug.indexOf('-');
  return i > 0 ? slug.slice(0, i) : null;
}

function bucketByAdds<T extends { adds: string | null; slug: string }>(rows: T[]): T[][] {
  const buckets = new Map<number, T[]>();
  for (const r of rows) {
    const n = r.adds == null ? -1 : Number.parseInt(r.adds, 10);
    const k = Number.isFinite(n) ? n : -1;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(r);
  }
  const keys = Array.from(buckets.keys()).sort((a, b) => a - b);
  return keys.map(k => buckets.get(k)!.sort((a, b) => a.slug.localeCompare(b.slug)));
}

function roundRobinSample<T>(buckets: T[][], cap: number): T[] {
  const out: T[] = [];
  const cursors = buckets.map(() => 0);
  let progress = true;
  while (out.length < cap && progress) {
    progress = false;
    for (let i = 0; i < buckets.length && out.length < cap; i++) {
      if (cursors[i]! < buckets[i]!.length) {
        out.push(buckets[i]![cursors[i]!]!);
        cursors[i]!++;
        progress = true;
      }
    }
  }
  return out;
}

function shape(row: FreestyleTrickRow, rule: FreestyleRelatedTrick['rule']): FreestyleRelatedTrick {
  return {
    slug:          row.slug,
    canonicalName: row.canonical_name,
    hashtag:       slugToHashtag(row.slug),
    adds:          row.adds,
    detailHref:    `/freestyle/tricks/${row.slug}`,
    rule,
  };
}

/**
 * Build the Related Tricks list for a given trick row.
 *
 * Rules in priority order:
 *   R1 — Same family (trick_family match, exclude self).
 *   R2 — Same modifier-prefix (slug starts with same `{first-segment}-`,
 *        different family). Only applies when current slug has a hyphen.
 *   R3 — Grandparent base trick (current.base_trick → that row's base_trick;
 *        include if active, non-modifier, and trick_family differs from
 *        current's). Gated: only fires when R1+R2 < 6 AND not duplicate.
 *   R4 — Parent base trick (current.base_trick itself; the compound one
 *        compositional hop up). 2026-05-26 polish: surfaces the direct
 *        parent for sparse-family compounds where R1/R2 yield little
 *        and R3 jumps two hops up (e.g. avalanche's parent is
 *        paradox-illusion; R3 was finding only the grandparent illusion).
 *        Gated: only fires when R1+R2 < 6 AND parent not already in
 *        R1/R2/R3 (typically true for compounds whose base_trick is in
 *        a different trick_family).
 *
 * Within each rule's candidate set, results are sorted via round-robin
 * across ADD buckets (low/mid/high mixed). Final display order is the
 * concatenation of R1 picks → R2 picks → R3 picks → R4 picks, capped at 8.
 *
 * All inputs filtered to `is_active = 1` AND `category != 'modifier'` per
 * the public-surface invariant + modifier-layer separation.
 */
export function buildRelatedTricks(
  current: FreestyleTrickRow,
  allRows: readonly FreestyleTrickRow[],
): FreestyleRelatedTrick[] {
  // Caller passes rows from freestyleTricks.listAll which already filters
  // is_active=1; here we only strip modifier-category rows and self.
  const eligible = allRows.filter(
    r => r.category !== 'modifier' && r.slug !== current.slug,
  );

  const r1 = eligible.filter(r => r.trick_family === current.trick_family);

  const prefix = modifierPrefix(current.slug);
  const r2 = prefix
    ? eligible.filter(
        r => r.trick_family !== current.trick_family && r.slug.startsWith(`${prefix}-`),
      )
    : [];

  const r1AndR2Count = r1.length + r2.length;
  let r3: FreestyleTrickRow[] = [];
  if (r1AndR2Count < R3_GATE_SIZE && current.base_trick) {
    const baseRow = eligible.find(r => r.slug === current.base_trick);
    if (baseRow && baseRow.base_trick && baseRow.base_trick !== current.base_trick) {
      const grandSlug = baseRow.base_trick;
      const grand = eligible.find(
        r => r.slug === grandSlug && r.trick_family !== current.trick_family,
      );
      if (grand) {
        const alreadyIncluded =
          r1.some(x => x.slug === grand.slug) || r2.some(x => x.slug === grand.slug);
        if (!alreadyIncluded) r3 = [grand];
      }
    }
  }

  // R4 — Parent base trick (one compositional hop up). Surfaces sparse-
  // family compounds' direct parent that R1 misses (when current's
  // trick_family is the compound's own slug, not the parent's family).
  // Skip if parent would duplicate R1/R2/R3.
  let r4: FreestyleTrickRow[] = [];
  if (r1AndR2Count < R3_GATE_SIZE && current.base_trick && current.base_trick !== current.slug) {
    const parent = eligible.find(r => r.slug === current.base_trick);
    if (parent) {
      const alreadyIncluded =
        r1.some(x => x.slug === parent.slug) ||
        r2.some(x => x.slug === parent.slug) ||
        r3.some(x => x.slug === parent.slug);
      if (!alreadyIncluded) r4 = [parent];
    }
  }

  const r1Sampled = roundRobinSample(bucketByAdds(r1), MAX_RESULTS);
  const r2Sampled = roundRobinSample(bucketByAdds(r2), MAX_RESULTS);

  const out: FreestyleRelatedTrick[] = [];
  const seen = new Set<string>();

  for (const row of r1Sampled) {
    if (out.length >= MAX_RESULTS) break;
    if (seen.has(row.slug)) continue;
    seen.add(row.slug);
    out.push(shape(row, 'family'));
  }
  for (const row of r2Sampled) {
    if (out.length >= MAX_RESULTS) break;
    if (seen.has(row.slug)) continue;
    seen.add(row.slug);
    out.push(shape(row, 'modifier-prefix'));
  }
  for (const row of r3) {
    if (out.length >= MAX_RESULTS) break;
    if (seen.has(row.slug)) continue;
    seen.add(row.slug);
    out.push(shape(row, 'grandparent'));
  }
  for (const row of r4) {
    if (out.length >= MAX_RESULTS) break;
    if (seen.has(row.slug)) continue;
    seen.add(row.slug);
    out.push(shape(row, 'parent'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Next Tricks — family-scoped progression by ADD
// ---------------------------------------------------------------------------
//
// Strict same-family progression: tricks in the same `trick_family` whose
// numeric ADD value is strictly greater than the current trick's ADD.
//
// Cross-family progression is intentionally OUT OF SCOPE for this section —
// ADD comparisons across families would imply real-world difficulty
// equivalence we cannot guarantee. Cross-family exploration is the job of
// `buildRelatedTricks` (R1+R2+R3), not Next Tricks.
//
// Sampling (Option b): bucket candidates by ADD, sort each bucket by slug
// ASC, take up to 2 per bucket, flatten in ascending ADD order, cap total
// at 5. Guarantees that higher ADD tiers stay visible in dense families.

export interface FreestyleNextTrick {
  slug:          string;
  canonicalName: string;
  hashtag:       string;
  adds:          string | null;
  detailHref:    string;
}

const NEXT_MAX_RESULTS  = 5;
const NEXT_PER_BUCKET   = 2;

export function buildNextTricks(
  current: FreestyleTrickRow,
  allRows: readonly FreestyleTrickRow[],
): FreestyleNextTrick[] {
  const currentAdds = current.adds == null ? Number.NaN : Number.parseInt(current.adds, 10);
  if (!Number.isFinite(currentAdds)) return [];

  const eligible = allRows.filter(r => {
    if (r.slug === current.slug) return false;
    if (r.category === 'modifier') return false;
    if (r.trick_family !== current.trick_family) return false;
    const n = r.adds == null ? Number.NaN : Number.parseInt(r.adds, 10);
    return Number.isFinite(n) && n > currentAdds;
  });

  const buckets = new Map<number, FreestyleTrickRow[]>();
  for (const r of eligible) {
    const n = Number.parseInt(r.adds!, 10);
    if (!buckets.has(n)) buckets.set(n, []);
    buckets.get(n)!.push(r);
  }

  const ordered = Array.from(buckets.keys()).sort((a, b) => a - b);
  const out: FreestyleNextTrick[] = [];
  for (const k of ordered) {
    if (out.length >= NEXT_MAX_RESULTS) break;
    const sorted = buckets.get(k)!.sort((a, b) => a.slug.localeCompare(b.slug));
    const take = Math.min(NEXT_PER_BUCKET, sorted.length, NEXT_MAX_RESULTS - out.length);
    for (let i = 0; i < take; i++) {
      const row = sorted[i]!;
      out.push({
        slug:          row.slug,
        canonicalName: row.canonical_name,
        hashtag:       slugToHashtag(row.slug),
        adds:          row.adds,
        detailHref:    `/freestyle/tricks/${row.slug}`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Previous Tricks — family-scoped regression by ADD
// ---------------------------------------------------------------------------
//
// Mirror of buildNextTricks: same trick_family + lower numeric ADD. Same
// per-bucket cap of 2, total cap of 5, but flattened in DESCENDING ADD
// order (closest easier first). Cross-family progression is intentionally
// out of scope; structural ancestors (e.g. atomic-torque → osis) are
// surfaced by buildRelatedTricks' R3 rule, not here.
//
// Per-bucket sort tiebreaker: tricks whose `slug` matches the family base
// (`slug == trick_family`) are placed first within their bucket, then the
// remainder by slug ASC. This guarantees foundational base tricks like
// `whirl` are never crowded out of the easier-tier bucket by direction-
// reversed siblings (`rev-whirl`, `rev-up`) or other compounds that happen
// to sort earlier alphabetically.

export type FreestylePreviousTrick = FreestyleNextTrick;

const PREV_MAX_RESULTS = 5;
const PREV_PER_BUCKET  = 2;

export function buildPreviousTricks(
  current: FreestyleTrickRow,
  allRows: readonly FreestyleTrickRow[],
): FreestylePreviousTrick[] {
  const currentAdds = current.adds == null ? Number.NaN : Number.parseInt(current.adds, 10);
  if (!Number.isFinite(currentAdds)) return [];

  const eligible = allRows.filter(r => {
    if (r.slug === current.slug) return false;
    if (r.category === 'modifier') return false;
    if (r.trick_family !== current.trick_family) return false;
    const n = r.adds == null ? Number.NaN : Number.parseInt(r.adds, 10);
    return Number.isFinite(n) && n < currentAdds;
  });

  const buckets = new Map<number, FreestyleTrickRow[]>();
  for (const r of eligible) {
    const n = Number.parseInt(r.adds!, 10);
    if (!buckets.has(n)) buckets.set(n, []);
    buckets.get(n)!.push(r);
  }

  // Flatten in DESCENDING ADD order — closest easier first.
  const ordered = Array.from(buckets.keys()).sort((a, b) => b - a);
  const out: FreestylePreviousTrick[] = [];
  for (const k of ordered) {
    if (out.length >= PREV_MAX_RESULTS) break;
    const sorted = buckets.get(k)!.sort((a, b) => {
      const aIsBase = a.slug === current.trick_family ? 0 : 1;
      const bIsBase = b.slug === current.trick_family ? 0 : 1;
      if (aIsBase !== bIsBase) return aIsBase - bIsBase;
      return a.slug.localeCompare(b.slug);
    });
    const take = Math.min(PREV_PER_BUCKET, sorted.length, PREV_MAX_RESULTS - out.length);
    for (let i = 0; i < take; i++) {
      const row = sorted[i]!;
      out.push({
        slug:          row.slug,
        canonicalName: row.canonical_name,
        hashtag:       slugToHashtag(row.slug),
        adds:          row.adds,
        detailHref:    `/freestyle/tricks/${row.slug}`,
      });
    }
  }
  return out;
}
