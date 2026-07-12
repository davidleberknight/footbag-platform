import { describe, it, expect } from 'vitest';
import {
  movementNeighborsFor,
  movementChangeBetween,
  movementNeighborhoodSlugs,
  type MovementChange,
} from '../../src/services/freestyleMovementNeighbors';

// Contract: "One Movement Change Away" is the movement-neighbor relation over
// the eight foundational one-dex toe tricks. Two tricks are neighbors when they
// differ by exactly one of three movement aspects (circle direction, the side
// the leg circles on, the side the bag lands on). The relation is undirected,
// irreflexive, and three-regular: every trick has exactly three neighbors, one
// per aspect. These tests pin the verified adjacency so a silent edit to the
// edge table can never quietly corrupt the taught relationships.

const NEIGHBORHOOD = [
  'around_the_world', 'fairy', 'illusion', 'legover',
  'mirage', 'orbit', 'pickup', 'pixie',
];

// The twelve undirected edges, each as a sorted [a, b, change] triple. This is
// the golden set; it is the human-checked truth the accessor must reproduce.
const GOLDEN_EDGES: [string, string, MovementChange][] = [
  ['around_the_world', 'orbit',  'circle-direction'],
  ['around_the_world', 'pickup', 'circling-side'],
  ['around_the_world', 'pixie',  'landing-side'],
  ['fairy',            'illusion', 'circling-side'],
  ['fairy',            'orbit',  'landing-side'],
  ['fairy',            'pixie',  'circle-direction'],
  ['illusion',         'legover', 'landing-side'],
  ['illusion',         'mirage', 'circle-direction'],
  ['legover',          'orbit',  'circling-side'],
  ['legover',          'pickup', 'circle-direction'],
  ['mirage',           'pickup', 'landing-side'],
  ['mirage',           'pixie',  'circling-side'],
];

/** Every undirected edge the accessor produces, as sorted [a, b, change] triples. */
function derivedEdges(): [string, string, MovementChange][] {
  const seen = new Set<string>();
  const edges: [string, string, MovementChange][] = [];
  for (const slug of NEIGHBORHOOD) {
    for (const n of movementNeighborsFor(slug) ?? []) {
      const [a, b] = [slug, n.slug].sort();
      const key = `${a}|${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([a, b, n.change]);
    }
  }
  return edges.sort((x, y) => (x[0] + x[1]).localeCompare(y[0] + y[1]));
}

describe('movement-neighbor relation: One Movement Change Away', () => {
  it('exposes exactly the eight one-dex toe tricks as the neighborhood', () => {
    expect(movementNeighborhoodSlugs()).toEqual(NEIGHBORHOOD);
  });

  it('reproduces the twelve verified edges exactly (golden set)', () => {
    expect(derivedEdges()).toEqual(GOLDEN_EDGES);
  });

  it('is three-regular: every trick has exactly three neighbors', () => {
    for (const slug of NEIGHBORHOOD) {
      expect(movementNeighborsFor(slug), slug).toHaveLength(3);
    }
  });

  it('gives each trick exactly one neighbor per movement aspect', () => {
    for (const slug of NEIGHBORHOOD) {
      const changes = (movementNeighborsFor(slug) ?? []).map(n => n.change).sort();
      expect(changes, slug).toEqual(['circle-direction', 'circling-side', 'landing-side']);
    }
  });

  it('is symmetric: if A is a neighbor of B, B is a neighbor of A with the same change', () => {
    for (const slug of NEIGHBORHOOD) {
      for (const n of movementNeighborsFor(slug) ?? []) {
        const back = movementNeighborsFor(n.slug) ?? [];
        const mirror = back.find(m => m.slug === slug);
        expect(mirror, `${n.slug} -> ${slug}`).toBeDefined();
        expect(mirror?.change).toBe(n.change);
      }
    }
  });

  it('is irreflexive: no trick is its own neighbor', () => {
    for (const slug of NEIGHBORHOOD) {
      expect(movementNeighborsFor(slug)?.some(n => n.slug === slug)).toBe(false);
    }
  });

  it('draws every change label from the closed three-phrase vocabulary', () => {
    const expected: Record<MovementChange, string> = {
      'circle-direction': 'Reverse the direction the leg circles',
      'circling-side':    'Switch the side the leg circles on',
      'landing-side':     'Switch the side the bag comes down on',
    };
    for (const slug of NEIGHBORHOOD) {
      for (const n of movementNeighborsFor(slug) ?? []) {
        expect(n.changeLabel).toBe(expected[n.change]);
      }
    }
  });

  it('returns null for any trick outside the neighborhood', () => {
    for (const slug of ['butterfly', 'toe_stall', 'whirl', 'atom_smasher', 'not_a_trick', '']) {
      expect(movementNeighborsFor(slug), slug).toBeNull();
    }
  });

  it('reports the single change between two neighbors, and null otherwise', () => {
    const edge = movementChangeBetween('mirage', 'illusion');
    expect(edge?.change).toBe('circle-direction');
    expect(edge?.slug).toBe('illusion');
    // Mirage and Fairy feel adjacent but are two changes apart: not neighbors.
    expect(movementChangeBetween('mirage', 'fairy')).toBeNull();
    // A trick outside the neighborhood has no movement change to any other.
    expect(movementChangeBetween('butterfly', 'mirage')).toBeNull();
  });
});
