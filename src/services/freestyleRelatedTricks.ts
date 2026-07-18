import { FreestyleTrickRow } from '../db/db';
import { slugToHashtag } from './freestyleRecordShaping';
import { resolveTrickKind } from '../content/freestyleTrickKindOverrides';

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
  ['around_the_world_kick', 'pixie_kick', 'fairy_kick', 'orbit_kick', 'legover_kick', 'miraging_kick', 'illusioning_kick'],
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

// ---------------------------------------------------------------------------
// Structural relatives — ranked "similar tricks" by structural relationship
// ---------------------------------------------------------------------------
//
// A structural relative is another canonical trick that shares real structure
// with the current one: the same base, the same family / terminal, a meaningful
// overlap in established operators, or a difference of exactly one operator. Each
// relative carries a plain-words reason so the reader can tell WHY it is listed.
//
// A minimum-relationship threshold applies: a candidate that shares none of those
// signals is not a relative, so an unrelated trick is never listed to pad the
// section to a fixed count. The section may show as few as zero relatives.
//
// Exclusions: the trick itself, inactive rows (callers pass the already-active
// dictionary), operators / modifiers / pending-review rows (resolveTrickKind must
// be 'trick'), and alias objects (aliases are not rows in the trick table, so a
// row-based ranker never surfaces one). Links are canonical detail URLs only.
//
// Curated overrides: a structurally exceptional page (a frontier compound whose
// best relatives are editorial knowledge, not a formula score) may pin its own
// ordered relatives, which then replace the ranked output for that page.

export interface FreestyleStructuralRelative {
  slug:          string;
  canonicalName: string;
  hashtag:       string;
  adds:          string | null;
  detailHref:    string;
  // Plain-words reason this trick is a structural relative of the current one.
  reason:        string;
}

// An outside-source name the platform does NOT adopt as a canonical trick, shown
// on a page as clearly labelled context and never as a canonical link. Keyed by
// the trick whose page carries the note.
export interface FreestyleObservationalNote {
  // The outside name, display text only (never a link to a canonical trick).
  name: string;
  // What the platform records instead, and why the outside name is not adopted.
  note: string;
}

const STRUCTURAL_RELATIVE_MAX = 6;

// Curated structural relatives for structurally exceptional pages: frontier
// compounds whose most useful neighbours are editorial (a shared entry, a
// cross-terminal comparison) rather than what a formula overlap surfaces. Each
// target slug must be an active canonical trick row or it is dropped gracefully.
const CURATED_STRUCTURAL_RELATIVES: Readonly<Record<string, readonly { slug: string; reason: string }[]>> = {
  // Carousel — a Rake-terminal frontier compound.
  surging_ducking_paradox_symposium_whirling_rake: [
    { slug: 'paradox_symposium_whirling_rake', reason: 'Same Whirling Rake terminal, fewer operators' },
    { slug: 'surging_ducking_paradox_torque',  reason: 'Shares the Surging Ducking Paradox entry on a Torque terminal' },
  ],
  // Big Apple Sauce — a Torque-family frontier compound. Reasons verified against
  // the modifier-link sets: it shares paradox and spinning with the first
  // neighbour; the second neighbour carries fewer scored operators overall, so it
  // is described by its shared terminal and lower ADD rather than a one-operator
  // delta that the link sets do not support.
  big_apple_sauce: [
    { slug: 'surging_ducking_paradox_torque',     reason: 'Torque-family neighbour sharing the paradox spin entry' },
    { slug: 'spinning_miraging_symposium_torque', reason: 'Same Torque terminal at a lower ADD' },
  ],
};

// Clearly-labelled, non-linked outside-source notes for a page. Used where an
// outside name is sometimes cited as a relative but the platform records a
// different canonical reading, so the name must not become a canonical link.
const CURATED_OBSERVATIONAL_NOTES: Readonly<Record<string, readonly FreestyleObservationalNote[]>> = {
  surging_ducking_paradox_symposium_whirling_rake: [
    {
      name: 'Surging Ducking Paradox Blender',
      note: 'An outside-source name recorded here as the 7-ADD Cheese Processor, following the paradox-free reading; it is not adopted as an 8-ADD canonical trick.',
    },
  ],
};

/** Clearly-labelled outside-source notes for a page, or an empty list. */
export function observationalNotesFor(slug: string): readonly FreestyleObservationalNote[] {
  return CURATED_OBSERVATIONAL_NOTES[slug] ?? [];
}

// Multiset comparison of two operator lists: how many operators they share, and
// which are unique to each side (with multiplicity).
function operatorSetDiff(
  currentMods: readonly string[],
  candidateMods: readonly string[],
): { shared: number; currentOnly: string[]; candidateOnly: string[] } {
  const pool = [...candidateMods];
  const currentOnly: string[] = [];
  let shared = 0;
  for (const m of currentMods) {
    const i = pool.indexOf(m);
    if (i >= 0) { pool.splice(i, 1); shared++; }
    else currentOnly.push(m);
  }
  return { shared, currentOnly, candidateOnly: pool };
}

function humanizeSlug(slug: string): string {
  return slug.replace(/[-_]/g, ' ');
}

/**
 * Build the ranked "similar tricks" list for a trick.
 *
 * Ranking (highest first), each with a plain-words reason:
 *   1. same base trick;
 *   2. one established operator added or removed (with family or shared-operator
 *      context, so a one-operator delta between unrelated tricks does not count);
 *   3. same family or terminal;
 *   4. meaningful established-operator overlap (two or more shared operators).
 * A candidate matching none of these is below threshold and is omitted. A
 * curated override, when present, replaces the ranked output for that page.
 *
 * `modifierLinks` are the (trick_slug, modifier_slug) rows for the whole
 * dictionary; the operator multiset per trick is derived from them.
 */
export function buildStructuralRelatives(
  current: FreestyleTrickRow,
  allRows: readonly FreestyleTrickRow[],
  modifierLinks: readonly { trick_slug: string; modifier_slug: string }[],
): FreestyleStructuralRelative[] {
  const rowBySlug = new Map(allRows.map(r => [r.slug, r] as const));
  const nameOf = (slug: string | null): string =>
    slug ? (rowBySlug.get(slug)?.canonical_name ?? humanizeSlug(slug)) : '';

  const shapeRelative = (row: FreestyleTrickRow, reason: string): FreestyleStructuralRelative => ({
    slug:          row.slug,
    canonicalName: row.canonical_name,
    hashtag:       slugToHashtag(row.slug),
    adds:          row.adds,
    detailHref:    `/freestyle/tricks/${row.slug}`,
    reason,
  });

  // Curated override wins: pin the editorial relatives, dropping any whose target
  // is not an active canonical row.
  const curated = CURATED_STRUCTURAL_RELATIVES[current.slug];
  if (curated) {
    const out: FreestyleStructuralRelative[] = [];
    for (const { slug, reason } of curated) {
      const row = rowBySlug.get(slug);
      if (row && row.slug !== current.slug && resolveTrickKind(row.slug) === 'trick') {
        out.push(shapeRelative(row, reason));
      }
      if (out.length >= STRUCTURAL_RELATIVE_MAX) break;
    }
    return out;
  }

  const modsBySlug = new Map<string, string[]>();
  for (const l of modifierLinks) {
    const arr = modsBySlug.get(l.trick_slug) ?? [];
    arr.push(l.modifier_slug);
    modsBySlug.set(l.trick_slug, arr);
  }
  const currentMods = modsBySlug.get(current.slug) ?? [];

  const eligible = allRows.filter(
    r => r.slug !== current.slug && r.category !== 'modifier' && resolveTrickKind(r.slug) === 'trick',
  );

  const curAdd = current.adds == null ? 0 : Number.parseInt(current.adds, 10);
  interface Scored { row: FreestyleTrickRow; score: number; reason: string; closeness: number }
  const scored: Scored[] = [];
  for (const cand of eligible) {
    const candMods = modsBySlug.get(cand.slug) ?? [];
    // Two operator-less tricks are not structural relatives even when they share
    // a base or family label: there is no operator structure in common, only the
    // empty-operator-set noise the adjacency layer also suppresses. A base atom's
    // real relatives are the compounds that carry operators on top of it.
    if (currentMods.length === 0 && candMods.length === 0) continue;
    const candAdd = cand.adds == null ? 0 : Number.parseInt(cand.adds, 10);
    const addDistance = Math.abs(candAdd - curAdd);
    const sameBase = !!current.base_trick && cand.base_trick === current.base_trick;
    const sameFamily = cand.trick_family === current.trick_family;
    const { shared, currentOnly, candidateOnly } = operatorSetDiff(currentMods, candMods);
    const symDiff = currentOnly.length + candidateOnly.length;

    let score = 0;
    let reason = '';
    if (sameBase) {
      score = 100;
      const opsNote =
        candMods.length < currentMods.length ? ', fewer operators'
        : candMods.length > currentMods.length ? ', more operators'
        : '';
      reason = `Same ${nameOf(current.base_trick!)} base${opsNote}`;
    } else if (symDiff === 1 && (sameFamily || shared >= 1) && addDistance <= 2) {
      // A single operator changes ADD by at most its weight (0-2). A larger ADD
      // gap alongside a one-operator link difference means the link data is
      // incomplete, so the "one operator" claim would be misleading; skip it.
      score = 90;
      reason = candidateOnly.length === 1
        ? `One operator more: ${candidateOnly[0]}`
        : `One operator fewer: ${currentOnly[0]}`;
    } else if (sameFamily) {
      score = 80;
      reason = `Same ${nameOf(current.trick_family)} family`;
    } else if (shared >= 2) {
      score = 40 + shared;
      // List the shared operators so the reason names the actual overlap.
      const sharedOps = currentMods.filter(m => candMods.includes(m));
      reason = `Shares ${[...new Set(sharedOps)].join(' + ')}`;
    } else {
      continue; // below the minimum-relationship threshold
    }
    // Closeness: prefer the nearest structural neighbour within a score tier, by
    // operator-set difference first, then ADD distance. This keeps a generic
    // same-family match in a very large family from crowding out a closer one.
    const closeness = symDiff * 100 + addDistance;
    scored.push({ row: cand, score, reason, closeness });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.closeness !== b.closeness) return a.closeness - b.closeness;
    return a.row.slug.localeCompare(b.row.slug);
  });

  return scored.slice(0, STRUCTURAL_RELATIVE_MAX).map(s => shapeRelative(s.row, s.reason));
}

/**
 * High-confidence structural About fallback: a one-line reading for a compound
 * whose database description is empty or a suppressed placeholder, naming the
 * base, the terminal, and the single added operator.
 *
 * Returns null (an absent About, i.e. accurate silence) unless every required
 * fact is confidently known:
 *   - the base is a real canonical row distinct from this trick, with a build
 *     chain (a known base and terminal identity);
 *   - the trick's family is present (a recognized terminal);
 *   - the trick adds EXACTLY ONE operator over its parent, and that operator is
 *     established and resolved (`isEstablishedOperator`), so the single defining
 *     layer is unambiguous and not a misleading claim for a multi-phase stack;
 *   - the sentence would not repeat the trick name ("X builds on X").
 * The established-operator test is injected so the caller supplies the doctrine
 * source (an operator with a Tier-1 definition) without this module importing it.
 */
export function buildStructuralAbout(
  current: FreestyleTrickRow,
  allRows: readonly FreestyleTrickRow[],
  modifierLinks: readonly { trick_slug: string; modifier_slug: string }[],
  isEstablishedOperator: (slug: string) => boolean,
): string | null {
  if (!current.base_trick || current.base_trick === current.slug) return null;
  const rowBySlug = new Map(allRows.map(r => [r.slug, r] as const));
  const baseRow = rowBySlug.get(current.base_trick);
  if (!baseRow || !baseRow.canonical_name) return null;
  if (!current.trick_family) return null;

  // Base chain must reach at least one ancestor (a real build path).
  let cur: string | null = current.base_trick;
  const seen = new Set<string>([current.slug]);
  let ancestors = 0;
  while (cur && !seen.has(cur) && rowBySlug.has(cur)) {
    seen.add(cur);
    ancestors++;
    const next: string | null = rowBySlug.get(cur)!.base_trick;
    cur = next && next !== cur ? next : null;
  }
  if (ancestors === 0) return null;

  const mods = new Map<string, string[]>();
  for (const l of modifierLinks) {
    const a = mods.get(l.trick_slug) ?? [];
    a.push(l.modifier_slug);
    mods.set(l.trick_slug, a);
  }
  const thisMods = [...(mods.get(current.slug) ?? [])];
  const parentMods = [...(mods.get(current.base_trick) ?? [])];
  const added: string[] = [];
  for (const m of thisMods) {
    const i = parentMods.indexOf(m);
    if (i >= 0) parentMods.splice(i, 1);
    else added.push(m);
  }
  if (added.length !== 1) return null;
  if (!isEstablishedOperator(added[0]!)) return null;

  const baseName = baseRow.canonical_name;
  const thisName = current.canonical_name;
  if (baseName.toLowerCase() === thisName.toLowerCase()) return null;

  const cap = (n: string): string => n.replace(/\b\w/g, c => c.toUpperCase());
  const familyRow = rowBySlug.get(current.trick_family);
  const familyName = familyRow ? familyRow.canonical_name : '';
  const op = added[0]!.replace(/[-_]/g, ' ');
  return familyName && familyName.toLowerCase() !== baseName.toLowerCase()
    ? `${cap(thisName)} builds on ${cap(baseName)}, adding the ${op} operator on a ${familyName} terminal.`
    : `${cap(thisName)} builds on ${cap(baseName)}, adding the ${op} operator.`;
}
