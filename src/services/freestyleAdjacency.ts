import { FreestyleTrickRow, FreestyleModifierLinkPairRow } from '../db/db';
import { slugToHashtag } from './freestyleRecordShaping';

// Structural-neighbors layer: the ±1-operator relation over the freestyle
// dictionary, derived from two already-populated curator inputs only -- each
// trick's `base_trick` and its rows in `freestyle_trick_modifier_links`. It
// never reads parser output (structural_parse_json / computed_adds) and never
// derives canonical classification from notation; it surfaces how a trick sits
// among its operator-neighbors so the reader can navigate "remove one
// operator", "swap one operator", "add one operator", and "same operator(s),
// other base".
//
// Operator sets are MULTISETS. A repeated operator is repeated structure: a
// trick with two `spinning` links at distinct apply_order is `spinning` applied
// twice (double-spinning), rung 2, not a duplicate to collapse. Rung = total
// operator count WITH multiplicity; base_of / siblings / extensions / twins all
// compare multisets, so double-spinning-whirl is the +1 extension of
// spinning-whirl, never its twin.

export interface StructuralNeighborEntry {
  slug:          string;
  canonicalName: string;
  hashtag:       string;
  adds:          string | null;
  detailHref:    string;
  // Structural gloss for a folk name whose tokens its base + operators do not
  // explain (e.g. mobius -> "torque + gyro"). Null for compositional names,
  // where the gloss would only repeat the name.
  gloss:         string | null;
}

// One or more entries that share an exact structural identity (same base + same
// operator multiset, or the same named anchor). Rendered joined by the
// equivalence mark, so a folk name and its compositional twin read as one slot
// (clipper diving whirl ≡ diving-whirl ≡ hatchet).
export interface StructuralNeighborGroup {
  entries: StructuralNeighborEntry[];
}

export type StructuralNeighborBucketKey =
  | 'base_of' | 'siblings' | 'extensions' | 'operator_kin' | 'twins';

export interface StructuralNeighborBucket {
  key:       StructuralNeighborBucketKey;
  label:     string;
  groups:    StructuralNeighborGroup[];
  // Count of groups beyond the display cap, surfaced as "(+N more)".
  moreCount: number;
}

export interface StructuralNeighbors {
  slug:    string;
  buckets: StructuralNeighborBucket[];
}

// Reader-facing label per bucket. The service shapes this so the template
// branches on nothing.
const BUCKET_LABELS: Record<StructuralNeighborBucketKey, string> = {
  'base_of':      'Built on',
  'siblings':     'Swap the operator',
  'extensions':   'Extend (+1 operator)',
  'operator_kin': 'Same operator, other base',
  'twins':        'Same structure',
};

// Render order of the buckets, matching the structural-neighbors block spec.
const BUCKET_ORDER: readonly StructuralNeighborBucketKey[] = [
  'base_of', 'siblings', 'extensions', 'operator_kin', 'twins',
];

// At most this many groups per bucket; the remainder is reported as moreCount.
const GROUP_CAP = 6;

// Canonical operator display / sort priority, mirroring the component-view
// order so neighbor lists read in a familiar sequence. Operators not listed
// sort after these, alphabetically.
const OPERATOR_ORDER: readonly string[] = [
  'paradox', 'symposium', 'spinning', 'inspinning', 'ducking', 'diving',
  'weaving', 'gyro', 'swirling', 'whirling', 'stepping', 'tapping',
  'pixie', 'fairy', 'atomic', 'quantum', 'nuclear', 'barraging', 'furious',
  'blurry', 'blazing', 'miraging', 'illusioning', 'shooting',
];
const OP_RANK = new Map(OPERATOR_ORDER.map((op, i) => [op, i] as const));
function opRank(op: string): number {
  const r = OP_RANK.get(op);
  return r === undefined ? 99 : r;
}

// Name tokens that never count as "unexplained" when deciding folk-ness:
// directions, surfaces, and grammatical filler are not structure a gloss needs
// to reveal.
const GENERIC_TOKENS: ReadonlySet<string> = new Set([
  'reverse', 'rev', 'toe', 'clipper', 'same', 'side', 'the', 'of', 'and',
  'into', 'out', 'in', 'double', 'sole', 'heel', 'head', 'knee',
]);

function addsNum(adds: string | null): number {
  if (adds == null) return 99;
  const n = Number.parseInt(adds, 10);
  return Number.isFinite(n) ? n : 99;
}

function tokens(s: string | null): string[] {
  return (s ?? '').toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean);
}

// A trick reduced to the fields the relation needs: its base, its operator
// multiset (as a sorted list WITH repeats for display, plus per-operator
// counts), and its lineage root.
interface AdjTrick {
  row:    FreestyleTrickRow;
  base:   string;
  ops:    string[];                 // sorted with multiplicity, for display
  counts: Map<string, number>;      // multiset counts
  size:   number;                   // total operator count with multiplicity
}

function buildIndex(
  allRows: readonly FreestyleTrickRow[],
  allLinks: readonly FreestyleModifierLinkPairRow[],
): Map<string, AdjTrick> {
  const opsBySlug = new Map<string, string[]>();
  // allLinks arrive ordered by (trick_slug, apply_order); push preserves
  // multiplicity so repeated operators stay distinct instances.
  for (const link of allLinks) {
    let list = opsBySlug.get(link.trick_slug);
    if (!list) { list = []; opsBySlug.set(link.trick_slug, list); }
    list.push(link.modifier_slug);
  }

  const index = new Map<string, AdjTrick>();
  for (const row of allRows) {
    const rawOps = opsBySlug.get(row.slug) ?? [];
    const counts = new Map<string, number>();
    for (const op of rawOps) counts.set(op, (counts.get(op) ?? 0) + 1);
    const ops = [...rawOps].sort((a, b) => opRank(a) - opRank(b) || a.localeCompare(b));
    index.set(row.slug, {
      row,
      base:   row.base_trick ?? '',
      ops,
      counts,
      size:   rawOps.length,
    });
  }
  return index;
}

// True when multiset `a` is contained in multiset `b`.
function isSubmultiset(a: Map<string, number>, b: Map<string, number>): boolean {
  for (const [op, n] of a) {
    if ((b.get(op) ?? 0) < n) return false;
  }
  return true;
}

// Size of the multiset difference a − b (instances in a beyond b's count).
function multisetMinusSize(a: Map<string, number>, b: Map<string, number>): number {
  let total = 0;
  for (const [op, n] of a) {
    const extra = n - (b.get(op) ?? 0);
    if (extra > 0) total += extra;
  }
  return total;
}

function sameMultiset(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [op, n] of a) {
    if (b.get(op) !== n) return false;
  }
  return true;
}

function lineageRoot(index: Map<string, AdjTrick>, slug: string): string {
  const seen = new Set<string>();
  let cur = slug;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const base = index.get(cur)?.base ?? '';
    if (!base || base === cur || !index.has(base)) return cur;
    cur = base;
  }
  return cur;
}

// Stable structural identity. With operators present the (base, sorted
// multiset) fully specifies the structure on top of the base, so two names with
// the same key are the same move and merge. With NO operators the NAME is
// load-bearing (torque and blender both reduce to osis + {} yet differ), so an
// empty-opset key falls back to the slug and never merges distinct names.
function structKey(t: AdjTrick): string {
  if (t.counts.size === 0) return `name:${t.row.slug}`;
  const parts = [...t.counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return `ops:${t.base}|${parts.map(([op, n]) => `${op}*${n}`).join(',')}`;
}

// base + operators, e.g. "torque + gyro"; empty operators -> just the base.
function structuralLabel(t: AdjTrick): string {
  const base = t.base || t.row.slug;
  return t.ops.length ? `${base} + ${t.ops.join(' + ')}` : base;
}

// A name is folk when a name token is explained by neither its base, its
// operators, nor a generic token. "spinning whirl" is compositional; "mobius",
// "hatchet", "food processor" are folk. The trick's own slug is intentionally
// NOT in the explained set: a slug is just the name kebab-cased, so folding it
// in would make every name explain itself and no name would ever read as folk.
function isFolk(t: AdjTrick): boolean {
  const explained = new Set<string>(GENERIC_TOKENS);
  for (const op of t.ops) explained.add(op);
  for (const tk of tokens(t.base)) explained.add(tk);
  return tokens(t.row.canonical_name).some(tk => !explained.has(tk));
}

function shapeEntry(t: AdjTrick): StructuralNeighborEntry {
  // A gloss reveals the operators a folk name hides, so it is shown only for a
  // folk name that actually carries operators. For a 0-operator folk name the
  // gloss would collapse to just the base (e.g. "torque [= osis]"), which the
  // load-bearing-name rule forbids: a 0-op name is its own structural identity,
  // not an alias of its base.
  const gloss = isFolk(t) && t.ops.length > 0 ? structuralLabel(t) : null;
  return {
    slug:          t.row.slug,
    canonicalName: t.row.canonical_name,
    hashtag:       slugToHashtag(t.row.slug),
    adds:          t.row.adds,
    detailHref:    `/freestyle/tricks/${t.row.slug}`,
    gloss,
  };
}

// Collapse structurally identical slugs (same structKey) into groups joined by
// the equivalence mark, ordered by ADD then name within and across groups.
function groupByStructure(
  index: Map<string, AdjTrick>,
  slugs: readonly string[],
): StructuralNeighborGroup[] {
  const byKey = new Map<string, string[]>();
  for (const slug of new Set(slugs)) {
    const t = index.get(slug);
    if (!t) continue;
    const key = structKey(t);
    let members = byKey.get(key);
    if (!members) { members = []; byKey.set(key, members); }
    members.push(slug);
  }
  const groups: StructuralNeighborGroup[] = [];
  for (const members of byKey.values()) {
    members.sort((a, b) =>
      addsNum(index.get(a)!.row.adds) - addsNum(index.get(b)!.row.adds) ||
      index.get(a)!.row.canonical_name.localeCompare(index.get(b)!.row.canonical_name));
    groups.push({ entries: members.map(s => shapeEntry(index.get(s)!)) });
  }
  groups.sort((g1, g2) =>
    addsNum(g1.entries[0]!.adds) - addsNum(g2.entries[0]!.adds) ||
    g1.entries[0]!.canonicalName.localeCompare(g2.entries[0]!.canonicalName));
  return groups;
}

/**
 * Build the structural-neighbors view-model for a trick, or null when no bucket
 * has members (the block is hidden rather than rendered empty).
 *
 * The ±1-operator relation, all on a trick T with base `b` and operator
 * multiset `S`:
 *
 *   base_of (−1)    — same-base tricks whose multiset is a non-empty proper
 *                     subset of S one instance smaller; when removing the single
 *                     remaining instance would empty S, the parent is ONLY the
 *                     named anchor (the trick whose slug == base), never an
 *                     arbitrary 0-operator member.
 *   siblings (swap) — same base, same rung, multisets differing by exactly one
 *                     swapped instance. Defined only for S non-empty: the
 *                     0-operator "other named members of the base" rule is
 *                     intentionally suppressed, because with no operator links a
 *                     base's 0-op members span unrelated ADDs (a folk trick the
 *                     name hides operators for sits beside a bare kick) and read
 *                     as false siblings. The bucket lights up for a base as its
 *                     folk members gain their operator links.
 *   extensions (+1) — same-base tricks whose multiset is an exact +1 superset of
 *                     S, plus named children whose base == T and which carry at
 *                     least one operator.
 *   operator_kin    — same non-empty multiset S, different base, same lineage
 *                     root ("the same operators, applied to another base").
 *   twins           — same base AND same non-empty multiset S. With S empty the
 *                     name is load-bearing, so empty-opset matches are never
 *                     asserted equivalent. Cross-base equivalence stays in the
 *                     curated layer and is not derived here.
 */
export function buildStructuralNeighbors(
  current: FreestyleTrickRow,
  allRows: readonly FreestyleTrickRow[],
  allLinks: readonly FreestyleModifierLinkPairRow[],
): StructuralNeighbors | null {
  const index = buildIndex(allRows, allLinks);
  const self = index.get(current.slug);
  if (!self) return null;

  const b = self.base;
  const S = self.counts;
  const n = self.size;
  const root = lineageRoot(index, current.slug);
  const sameBase = [...index.values()].filter(t => t.base === b && t.row.slug !== current.slug);

  const baseOf: string[] = [];
  const siblings: string[] = [];
  const extensions: string[] = [];

  if (n > 0) {
    for (const u of sameBase) {
      const m = u.size;
      if (m === n && multisetMinusSize(S, u.counts) === 1 && multisetMinusSize(u.counts, S) === 1) {
        siblings.push(u.row.slug);                       // swap one instance
      } else if (n - m === 1 && u.size > 0 && isSubmultiset(u.counts, S)) {
        baseOf.push(u.row.slug);                         // −1 instance, still non-empty
      } else if (m - n === 1 && isSubmultiset(S, u.counts)) {
        extensions.push(u.row.slug);                     // +1 instance, same base
      }
    }
    // Removing the single remaining instance empties the multiset: the parent
    // is only the named anchor (slug == base).
    if (n === 1 && index.has(b) && b !== current.slug) baseOf.push(b);
  } else {
    // No operators: the parent is the named base trick. The 0-op sibling rule
    // is deliberately not applied (see the doc comment above).
    if (index.has(b) && b !== current.slug) baseOf.push(b);
  }

  // Named children: base == this trick and carrying at least one operator.
  for (const u of index.values()) {
    if (u.base === current.slug && u.size > 0) extensions.push(u.row.slug);
  }

  const operatorKin: string[] = [];
  const twins: string[] = [];
  if (n > 0) {
    for (const u of index.values()) {
      if (u.row.slug === current.slug) continue;
      if (!sameMultiset(u.counts, S)) continue;
      if (u.base === b) {
        twins.push(u.row.slug);
      } else if (lineageRoot(index, u.row.slug) === root) {
        operatorKin.push(u.row.slug);
      }
    }
  }

  const raw: Record<StructuralNeighborBucketKey, string[]> = {
    base_of:      baseOf,
    siblings,
    extensions,
    operator_kin: operatorKin,
    twins,
  };

  const buckets: StructuralNeighborBucket[] = [];
  for (const key of BUCKET_ORDER) {
    const groups = groupByStructure(index, raw[key]);
    if (groups.length === 0) continue;
    buckets.push({
      key,
      label:     BUCKET_LABELS[key],
      groups:    groups.slice(0, GROUP_CAP),
      moreCount: Math.max(0, groups.length - GROUP_CAP),
    });
  }

  return buckets.length ? { slug: current.slug, buckets } : null;
}
