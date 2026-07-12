/**
 * One Movement Change Away: the movement-neighbor relation.
 *
 * A first-class dictionary relationship, deliberately distinct from the operator
 * relation in freestyleAdjacency.ts (which owns the reader-facing name
 * "Structural Neighbors"). Two of the eight foundational one-dex toe tricks are
 * movement neighbors when they differ by exactly one movement aspect: the
 * direction the leg circles, the side it circles on, or the side the bag comes
 * down on. Each of the eight has exactly three neighbors, one per aspect.
 *
 * The edges are a frozen, verified curated snapshot, harvested once from the
 * movement-atlas research catalog. They are never regenerated in production
 * (which would require the research model) and never hand-guessed: the verified
 * table is what prevents false neighbors. Mirage and Fairy feel adjacent but are
 * two changes apart, so an intuition-authored list would teach a relationship
 * that is not there.
 *
 * Owns: the movement-neighbor edges and the accessor. Owns no schema; reads no
 * database; never reads notation or parser output. The change vocabulary is a
 * closed set of plain-language phrases; no coordinate, bit, or count appears in
 * the data or the output.
 *
 * First consumer is the glossary; the same relation later serves trick pages,
 * compare-two-tricks, search, and curation QC, all reading this one source.
 */

/** The single movement aspect that differs between two neighbors. */
export type MovementChange = 'circle-direction' | 'circling-side' | 'landing-side';

export interface MovementNeighbor {
  /** The neighbor trick's slug (an active freestyle_tricks row). */
  slug: string;
  /** Which single movement aspect differs. */
  change: MovementChange;
  /** Plain-language description of the one change, ready to render. */
  changeLabel: string;
}

/**
 * The twelve verified undirected edges of the one-dex-toe neighborhood, grouped
 * by the single aspect that differs. Iteration order (direction, then circling
 * side, then landing side) is the stable render order for the accessor.
 *
 * Golden set: editing this list without updating the pinned test is a mistake;
 * the test exists to stop a silent adjacency corruption.
 */
const MOVEMENT_NEIGHBOR_EDGES: readonly (readonly [string, string, MovementChange])[] = [
  // Circle-direction changes (the four reverse pairs).
  ['mirage',           'illusion', 'circle-direction'],
  ['pixie',            'fairy',    'circle-direction'],
  ['around_the_world', 'orbit',    'circle-direction'],
  ['pickup',           'legover',  'circle-direction'],
  // Which-side-the-leg-circles changes.
  ['mirage',           'pixie',    'circling-side'],
  ['illusion',         'fairy',    'circling-side'],
  ['around_the_world', 'pickup',   'circling-side'],
  ['orbit',            'legover',  'circling-side'],
  // Which-side-the-bag-lands changes.
  ['mirage',           'pickup',   'landing-side'],
  ['illusion',         'legover',  'landing-side'],
  ['pixie',            'around_the_world', 'landing-side'],
  ['fairy',            'orbit',    'landing-side'],
];

const CHANGE_LABELS: Readonly<Record<MovementChange, string>> = {
  'circle-direction': 'Reverse the direction the leg circles',
  'circling-side':    'Switch the side the leg circles on',
  'landing-side':     'Switch the side the bag comes down on',
};

/**
 * The three neighbors of a one-dex toe trick, each labeled with the single
 * movement change, in stable render order. Returns null for any trick outside
 * the neighborhood, so absence is graceful.
 */
export function movementNeighborsFor(slug: string): MovementNeighbor[] | null {
  const neighbors: MovementNeighbor[] = [];
  for (const [a, b, change] of MOVEMENT_NEIGHBOR_EDGES) {
    if (a === slug) neighbors.push({ slug: b, change, changeLabel: CHANGE_LABELS[change] });
    else if (b === slug) neighbors.push({ slug: a, change, changeLabel: CHANGE_LABELS[change] });
  }
  return neighbors.length > 0 ? neighbors : null;
}

/**
 * The single movement change between two tricks when they are neighbors, or null
 * when they are not one change apart. Powers a later compare-two-tricks surface.
 */
export function movementChangeBetween(a: string, b: string): MovementNeighbor | null {
  return movementNeighborsFor(a)?.find(n => n.slug === b) ?? null;
}

/** The eight tricks that form the one-dex-toe neighborhood, sorted. */
export function movementNeighborhoodSlugs(): string[] {
  const slugs = new Set<string>();
  for (const [a, b] of MOVEMENT_NEIGHBOR_EDGES) { slugs.add(a); slugs.add(b); }
  return [...slugs].sort();
}
