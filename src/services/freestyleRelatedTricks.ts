import { FreestyleTrickRow } from '../db/db';
import { slugToHashtag } from './freestyleRecordShaping';

export interface FreestyleRelatedTrick {
  slug:          string;
  canonicalName: string;
  hashtag:       string;
  adds:          string | null;
  detailHref:    string;
  rule:          'family' | 'modifier-prefix' | 'grandparent';
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
 *
 * Within each rule's candidate set, results are sorted via round-robin
 * across ADD buckets (low/mid/high mixed). Final display order is the
 * concatenation of R1 picks → R2 picks → R3 picks, capped at 8.
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
  return out;
}
