import { FreestyleTrickRow } from '../db/db';
import { slugToHashtag } from './freestyleRecordShaping';

export interface FreestyleRelatedTrick {
  slug:          string;
  canonicalName: string;
  hashtag:       string;
  adds:          string | null;
  detailHref:    string;
  rule:          'neighborhood' | 'family' | 'modifier-prefix' | 'parent' | 'grandparent';
  // Plain-words reason this trick is related, surfaced per row so the reader
  // can tell WHY each neighbour is listed instead of seeing a flat list.
  ruleLabel:     string;
}

// Reader-facing label per relating rule. The service shapes this so the
// template branches on nothing.
const RULE_LABELS: Record<FreestyleRelatedTrick['rule'], string> = {
  'neighborhood':    'Movement neighbour',
  'family':          'Same family',
  'modifier-prefix': 'Shares a modifier',
  'parent':          'Built on',
  'grandparent':     'Structural ancestor',
};

const MAX_RESULTS  = 8;
const R3_GATE_SIZE = 6;

function modifierPrefix(slug: string): string | null {
  const i = slug.indexOf('_');
  return i > 0 ? slug.slice(0, i) : null;
}

// Modifier / set-operator prefixes that legitimately form `{modifier}_{base}`
// trick names. R2 ("same modifier-prefix, different family") fires only when a
// slug's first segment is one of these. Multipliers (double, triple), catch
// surfaces (sole, knee, cloud, heel), base atoms (butterfly, around), and
// directions (down) are excluded: first segments that collide by spelling
// without sharing a movement, which otherwise manufacture false neighborhoods
// (e.g. double-knee pulling in every unrelated double-* trick).
const MODIFIER_PREFIXES: ReadonlySet<string> = new Set([
  'spinning', 'inspinning', 'fairy', 'pixie', 'gyro', 'ducking', 'diving',
  'weaving', 'stepping', 'paradox', 'symposium', 'atomic', 'quantum', 'tapping',
  'blazing', 'barraging', 'terraging', 'illusioning', 'miraging', 'swirling',
  'whirling', 'surging', 'furious', 'nuclear', 'blurry', 'flying',
]);

// Curated movement-neighborhood overlay for sui-generis primitives that sit in
// their own trick_family with a self-referential base, so no family or base
// rule connects them to their true neighbors. Double Knee is an airborne
// both-knee contact: its neighbors are the other airborne contact-surface
// variants, not the unrelated `double-*` multiplier tricks. Extend as airborne
// contact variants are added (e.g. double-inside, double-toe).
const EXPLICIT_NEIGHBORS: Readonly<Record<string, readonly string[]>> = {
  // Both-feet / both-knees airborne primitives share the flying-contact set.
  'double_knee': ['flying_inside', 'flying_outside', 'flying_clipper'],
  'double_kick': ['flying_inside', 'flying_outside', 'flying_clipper'],
};

// Mutual movement neighborhoods: every member relates to the others. Surface
// stalls each sit in their own trick_family, so no family or base rule connects
// the foot-stall set or the body-stall set; this overlay groups them by where
// the bag is caught (a movement neighborhood, not a taxonomy change).
const NEIGHBORHOOD_GROUPS: readonly (readonly string[])[] = [
  ['toe_stall', 'inside_stall', 'outside_stall', 'clipper_stall', 'heel_stall', 'sole_stall', 'cross_body_sole_stall'],
  ['head_stall', 'forehead_stall', 'neck_stall', 'shoulder_stall', 'knee_stall', 'cloud_stall'],
  // The three flying clipper moves: a jump-kick contacting the bag cross-body
  // with the kicking leg tucked behind the jumping leg, varying by contact
  // surface (inside = flying-clipper, toe = toe-clipper, knee = knee-clipper).
  // Each sits in its own family, so only this overlay connects them.
  ['flying_clipper', 'toe_clipper', 'knee_clipper'],
  // Swing elements: completed by the swing action itself, with an open terminal
  // (stall / kick / catch / follow-on). A movement neighbourhood, not a family.
  ['pendulum', 'rake'],
  // Sibling body primitives: contact the bag with both limbs in the air.
  ['double_kick', 'double_knee'],
  // 1-ADD dex-kicks: a dexterity finished with a kick instead of a terminal
  // stall. Each sits in its own family/base, so only this overlay connects them
  // to one another.
  ['around_the_world_kick', 'pixie_kick', 'fairy_kick', 'orbit_kick', 'legover_kick', 'miraging_kick', 'atomic_kick'],
  // Trick and its kick/stall counterpart: the stalled trick and its drop-the-
  // stall kick (or a surface and its stall) sit in different families, so
  // neither surfaces the other without this overlay. Legover and its kick
  // already share a family; Toe has no kick row, so neither is listed here.
  ['clipper', 'clipper_stall'],
  ['around_the_world', 'around_the_world_kick'],
  ['mirage', 'miraging_kick'],
  ['butterfly', 'butterfly_kick'],
  // Continuous-control held-delay leg-over lineage: an inside delay held while
  // the body crosses over it. Each sits in its own singleton family, so only
  // this overlay connects them. Walk-over steps over the held delay, hop-over
  // jumps over it, and eclipse lifts the whole structure airborne.
  ['wrap', 'walk_over', 'hop_over', 'eclipse'],
  // Directional ATW variants: each circles the leg fully around the bag,
  // differing by entry / delay surface. Each is an independent 2-ADD atom in its
  // own family (around-the-world is not the parent or compositional base of the
  // inside / outside variants), so only this overlay connects the three as
  // related directional peers.
  ['around_the_world', 'inside_around_the_world', 'outside_around_the_world'],
];

// Base-atom -> same-named operator cross-link. A base atom (spin, whirl) and the
// operator built from it (spinning, whirling) sit in separate rows with no
// family / base / neighbour rule connecting them, so the atom's detail page never
// points at the operator's tricks and the reader has to infer the relationship.
// This curated map adds an explicit "See also: <Operator> tricks" link from the
// atom to the operator's collection. Curator-extensible; each value must be a
// real operator/modifier so the link resolves.
export const ATOM_OPERATOR_CROSSLINKS: Readonly<Record<string, string>> = {
  spin:     'spinning',
  whirl:    'whirling',
  swirl:    'swirling',
  mirage:   'miraging',
  illusion: 'illusioning',
  barrage:  'barraging',
};

/** The operator slug a base atom cross-links to, or null when it has none. */
export function operatorCrossLinkFor(slug: string): string | null {
  return ATOM_OPERATOR_CROSSLINKS[slug] ?? null;
}

// Inverse of ATOM_OPERATOR_CROSSLINKS, so the operator's page links back to its
// base atom (spinning -> spin), making the relationship discoverable from either
// direction.
const OPERATOR_BASE_ATOMS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(ATOM_OPERATOR_CROSSLINKS).map(([atom, op]) => [op, atom]),
);

/** The base-atom slug an operator cross-links back to, or null when it has none. */
export function baseAtomCrossLinkFor(operatorSlug: string): string | null {
  return OPERATOR_BASE_ATOMS[operatorSlug] ?? null;
}

// Curated neighbors for a slug: its one-directional overlay entry plus the
// other members of any mutual group it belongs to.
function explicitNeighborsFor(slug: string): readonly string[] {
  const out = [...(EXPLICIT_NEIGHBORS[slug] ?? [])];
  for (const group of NEIGHBORHOOD_GROUPS) {
    if (group.includes(slug)) out.push(...group.filter(s => s !== slug));
  }
  return out;
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
    ruleLabel:     RULE_LABELS[rule],
  };
}

/**
 * Build the Related Tricks list for a given trick row.
 *
 * Rules in priority order (this is also the display order):
 *   R0 — Curated movement-neighborhood overlay: hand-listed neighbors for
 *        sui-generis primitives whose self-family and self-base leave them
 *        with no rule-derived neighbors. Shaped as `neighborhood`.
 *   R1 — Same family (trick_family match, exclude self). Shaped as `family`.
 *   R2 — Same modifier-prefix (slug starts with same `{first-segment}-`,
 *        different family). Only applies when the slug's first segment is a
 *        real modifier prefix. Shaped as `modifier-prefix`.
 *   R3 — Grandparent base trick (current.base_trick → that row's base_trick;
 *        include if active, non-modifier, and trick_family differs from
 *        current's). Gated: only fires when R0+R1+R2 < 6 AND not duplicate.
 *        Shaped as `grandparent`.
 *   R4 — Parent base trick (current.base_trick itself; one compositional hop
 *        up). Surfaces the direct parent for sparse-family compounds where
 *        R1/R2 yield little and R3 jumps two hops up (e.g. avalanche's parent
 *        is paradox-illusion). Gated: only fires when R0+R1+R2 < 6 AND parent
 *        not already in R1/R2/R3. Shaped as `parent`.
 *
 * Within each rule's candidate set, results are sorted via round-robin
 * across ADD buckets (low/mid/high mixed). Final display order is the
 * concatenation of R0 → R1 → R2 → R3 → R4 picks, capped at 8.
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

  // R0 — curated movement-neighborhood overlay (sui-generis primitives whose
  // self-family and self-base leave them with no rule-derived neighbors).
  const r0 = explicitNeighborsFor(current.slug)
    .map(s => eligible.find(r => r.slug === s))
    .filter((r): r is FreestyleTrickRow => r != null);

  const r1 = eligible.filter(r => r.trick_family === current.trick_family);

  // R2 fires only when the slug's first segment is a real modifier; a bare
  // spelling collision (double-knee, around-the-world) is not a shared modifier.
  const prefix = modifierPrefix(current.slug);
  const r2 = prefix && MODIFIER_PREFIXES.has(prefix)
    ? eligible.filter(
        r => r.trick_family !== current.trick_family && r.slug.startsWith(`${prefix}_`),
      )
    : [];

  const r1AndR2Count = r0.length + r1.length + r2.length;
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

  for (const row of r0) {
    if (out.length >= MAX_RESULTS) break;
    if (seen.has(row.slug)) continue;
    seen.add(row.slug);
    out.push(shape(row, 'neighborhood'));
  }
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
// Relative-side variants — same base trick, different relative-side qualifier
// ---------------------------------------------------------------------------
//
// A relative-side variant set is the same underlying trick performed with a
// different side relationship between a dex and its reference: the unqualified
// base, its same-side (near) form, and its far (opposite) form. The glossary
// explains the relationship (SAME / OP); this surfaces the actual sibling rows
// so a reader on one variant can see and reach the others.
//
// Membership is derived by stripping a recognized side qualifier from the slug
// to a stem, then grouping active rows that share that stem. This is a display
// projection only: it reads slugs as-is and does not change slug normalization
// or identity. The callout renders only when the group has at least two members
// spanning at least two distinct sides, so a lone qualified slug never produces
// a one-item callout and an accidental token match (no sibling) is suppressed.

export type RelativeSide = 'base' | 'same-side' | 'far';

export interface FreestyleRelativeSideVariant {
  slug:          string;
  canonicalName: string;
  hashtag:       string;
  adds:          string | null;
  detailHref:    string;
  side:          RelativeSide;
  sideLabel:     string;
  isCurrent:     boolean;
}

export interface FreestyleRelativeSideVariants {
  // Deep-link to the relative-side glossary explainer (SAME / OP / not X-Dex).
  glossaryHref: string;
  variants:     FreestyleRelativeSideVariant[];
}

const RELATIVE_SIDE_LABELS: Record<RelativeSide, string> = {
  'base':      'Base',
  'same-side': 'Same-side (near)',
  'far':       'Far (opposite)',
};

const RELATIVE_SIDE_RANK: Record<RelativeSide, number> = {
  'base': 0, 'same-side': 1, 'far': 2,
};

const RELATIVE_SIDE_GLOSSARY_HREF = '/freestyle/glossary#term-same-side';

// Strip whole-segment side qualifiers (prefix, suffix, or infix) from a slug,
// returning the stem and the side the qualifier denoted. `same` / `near` / `ss`
// read as same-side; `far` / `op` / `opp` / `opposite` read as far. The
// two-segment `same-side` / `opposite-side` forms are consumed as a unit.
function stripRelativeSide(slug: string): { stem: string; side: RelativeSide } {
  const segs = slug.split('_');
  const out: string[] = [];
  let side: RelativeSide = 'base';
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s === 'same') { side = 'same-side'; if (segs[i + 1] === 'side') i++; continue; }
    if (s === 'opposite') { side = 'far'; if (segs[i + 1] === 'side') i++; continue; }
    if (s === 'ss' || s === 'near') { side = 'same-side'; continue; }
    if (s === 'op' || s === 'opp') { side = 'far'; continue; }
    if (s === 'far') { side = 'far'; continue; }
    out.push(s!);
  }
  return { stem: out.join('_'), side };
}

/**
 * Build the relative-side variant callout for a given trick row, or null when
 * the trick is not part of a multi-side group. Members are the active,
 * non-modifier rows whose side-stripped stem matches the current trick's stem;
 * the callout renders only when at least two members span at least two distinct
 * sides (base / same-side / far). Display order is base → same-side → far, then
 * slug.
 */
export function buildRelativeSideVariants(
  current: FreestyleTrickRow,
  allRows: readonly FreestyleTrickRow[],
): FreestyleRelativeSideVariants | null {
  const { stem } = stripRelativeSide(current.slug);
  if (!stem) return null;

  const members = allRows
    .filter(r => r.category !== 'modifier')
    .map(r => ({ row: r, ...stripRelativeSide(r.slug) }))
    .filter(m => m.stem === stem);

  if (members.length < 2) return null;
  const distinctSides = new Set(members.map(m => m.side));
  if (distinctSides.size < 2) return null;

  const variants = members
    .sort((a, b) =>
      RELATIVE_SIDE_RANK[a.side] - RELATIVE_SIDE_RANK[b.side] ||
      a.row.slug.localeCompare(b.row.slug),
    )
    .map(m => ({
      slug:          m.row.slug,
      canonicalName: m.row.canonical_name,
      hashtag:       slugToHashtag(m.row.slug),
      adds:          m.row.adds,
      detailHref:    `/freestyle/tricks/${m.row.slug}`,
      side:          m.side,
      sideLabel:     RELATIVE_SIDE_LABELS[m.side],
      isCurrent:     m.row.slug === current.slug,
    }));

  return { glossaryHref: RELATIVE_SIDE_GLOSSARY_HREF, variants };
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
