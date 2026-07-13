/**
 * Unit tests for buildStructuralNeighbors.
 *
 * Verifies the ±1-operator relation derived from base_trick + modifier_links:
 *   - base_of (−1), including the multiset −1 case (double-spinning → spinning)
 *   - siblings (swap one operator), defined only for a non-empty operator set
 *   - the empty-operator-set sibling rule is suppressed (no false 0-op siblings)
 *   - extensions (+1), same base and named children carrying an operator
 *   - operator_kin (same operators, other base, same lineage root)
 *   - twins (same base + same non-empty multiset) merge by ≡
 *   - a repeated operator is repeated structure, never collapsed to a twin
 *   - folk names carry a structural gloss; compositional names do not
 *   - the block is null when no bucket has members
 *   - per-bucket group cap with a moreCount remainder
 */
import { describe, it, expect } from 'vitest';
import { FreestyleTrickRow, FreestyleModifierLinkPairRow } from '../../src/db/db';
import {
  buildStructuralNeighbors,
  StructuralNeighbors,
  StructuralNeighborBucketKey,
} from '../../src/services/freestyleAdjacency';

function row(slug: string, adds: string, base_trick: string, trick_family: string): FreestyleTrickRow {
  return {
    slug,
    canonical_name:       slug.replace(/-/g, ' '),
    adds,
    base_trick,
    trick_family,
    category:             'compound',
    description:          null,
    aliases_json:         null,
    notation:             null,
    operational_notation: null,
    sort_order:           0,
  };
}

// One modifier-link instance; repeated calls with distinct order encode a
// repeated operator (the multiset case).
function link(trick_slug: string, modifier_slug: string, apply_order = 1): FreestyleModifierLinkPairRow {
  return { trick_slug, modifier_slug, apply_order };
}

// A whirl / osis / pixie subset chosen to exercise every relation:
//   whirl (0-op root) -> spinning-whirl -> double-spinning-whirl
//   diving-whirl ≡ hatchet (twin)
//   osis -> torque -> mobius{gyro}; gyro-osis{gyro} (operator-kin of mobius)
//   pixie -> pixie-kick (+ trixie, a 0-op folk member that must NOT be a sibling)
//   illusioning-kick (self-based, childless 0-op -> null block)
const ROWS: FreestyleTrickRow[] = [
  row('whirl',                 '3', 'whirl',  'whirl'),
  row('rev-whirl',             '3', 'whirl',  'whirl'),
  row('spinning-whirl',        '4', 'whirl',  'whirl'),
  row('double-spinning-whirl', '5', 'whirl',  'whirl'),
  row('paradox-whirl',         '4', 'whirl',  'whirl'),
  row('diving-whirl',          '4', 'whirl',  'whirl'),
  row('hatchet',               '4', 'whirl',  'whirl'),
  row('osis',                  '3', 'osis',   'osis'),
  row('torque',                '4', 'osis',   'osis'),
  row('mobius',                '5', 'torque', 'osis'),
  row('atomic-torque',         '5', 'torque', 'osis'),
  row('gyro-osis',             '4', 'osis',   'osis'),
  row('pixie',                 '2', 'pixie',  'pixie'),
  row('pixie-kick',            '1', 'pixie',  'pixie'),
  row('trixie',                '5', 'pixie',  'pixie'),
  row('illusioning-kick',      '1', 'illusioning-kick', 'illusioning-kick'),
];

const LINKS: FreestyleModifierLinkPairRow[] = [
  link('spinning-whirl', 'spinning'),
  link('double-spinning-whirl', 'spinning', 1),
  link('double-spinning-whirl', 'spinning', 2),
  link('paradox-whirl', 'paradox'),
  link('diving-whirl', 'diving'),
  link('hatchet', 'diving'),
  link('mobius', 'gyro'),
  link('atomic-torque', 'atomic'),
  link('gyro-osis', 'gyro'),
];

function neighborsOf(slug: string): StructuralNeighbors | null {
  const current = ROWS.find(r => r.slug === slug)!;
  return buildStructuralNeighbors(current, ROWS, LINKS);
}

function bucket(nb: StructuralNeighbors | null, key: StructuralNeighborBucketKey) {
  return nb?.buckets.find(b => b.key === key);
}

// All lead slugs in a bucket (the first entry of each group).
function leadSlugs(nb: StructuralNeighbors | null, key: StructuralNeighborBucketKey): string[] {
  return (bucket(nb, key)?.groups ?? []).map(g => g.entries[0]!.slug);
}

describe('buildStructuralNeighbors', () => {
  it('mobius: built on torque, swaps to atomic-torque, gyro kin on osis', () => {
    const nb = neighborsOf('mobius');
    expect(leadSlugs(nb, 'base_of')).toEqual(['torque']);
    expect(leadSlugs(nb, 'siblings')).toEqual(['atomic-torque']);
    expect(leadSlugs(nb, 'operator_kin')).toEqual(['gyro-osis']);
  });

  it('folk name carries a structural gloss; compositional names do not', () => {
    const mobius = neighborsOf('mobius');
    // mobius is folk; its base_of points at torque (compositional, no gloss),
    // but the gloss is on the folk trick itself when it appears as a neighbor.
    const fromTorque = neighborsOf('torque');
    const mobiusAsExtension = bucket(fromTorque, 'extensions')!
      .groups.flatMap(g => g.entries).find(e => e.slug === 'mobius')!;
    expect(mobiusAsExtension.gloss).toBe('torque + gyro');
    const spinningWhirl = bucket(neighborsOf('whirl'), 'extensions')!
      .groups.flatMap(g => g.entries).find(e => e.slug === 'spinning-whirl')!;
    expect(spinningWhirl.gloss).toBeNull();
    expect(mobius).not.toBeNull();
  });

  it('double-spinning is the +1 extension of spinning-whirl, not its twin', () => {
    const fromSpinning = neighborsOf('spinning-whirl');
    expect(leadSlugs(fromSpinning, 'extensions')).toContain('double-spinning-whirl');
    expect(bucket(fromSpinning, 'twins')).toBeUndefined();
  });

  it('double-spinning-whirl is built on spinning-whirl via the multiset −1 rule', () => {
    const nb = neighborsOf('double-spinning-whirl');
    expect(leadSlugs(nb, 'base_of')).toEqual(['spinning-whirl']);
  });

  it('hatchet and diving-whirl are structural twins, merged by ≡', () => {
    const nb = neighborsOf('hatchet');
    expect(leadSlugs(nb, 'base_of')).toEqual(['whirl']);
    const twins = bucket(nb, 'twins')!;
    expect(twins.groups).toHaveLength(1);
    expect(twins.groups[0]!.entries.map(e => e.slug)).toEqual(['diving-whirl']);
  });

  it('whirl extensions merge twin children into one ≡ group', () => {
    const ext = bucket(neighborsOf('whirl'), 'extensions')!;
    const divingGroup = ext.groups.find(g => g.entries.some(e => e.slug === 'diving-whirl'))!;
    expect(divingGroup.entries.map(e => e.slug).sort()).toEqual(['diving-whirl', 'hatchet']);
  });

  it('empty-operator-set siblings are suppressed (trixie is not a pixie-kick sibling)', () => {
    const nb = neighborsOf('pixie-kick');
    expect(leadSlugs(nb, 'base_of')).toEqual(['pixie']);
    expect(bucket(nb, 'siblings')).toBeUndefined();
    const allSlugs = nb!.buckets.flatMap(b => b.groups).flatMap(g => g.entries).map(e => e.slug);
    expect(allSlugs).not.toContain('trixie');
  });

  it('a self-based, childless 0-operator trick yields a null block', () => {
    expect(neighborsOf('illusioning-kick')).toBeNull();
  });

  it('caps each bucket at six groups and reports the remainder as moreCount', () => {
    const base = row('bigbase', '3', 'bigbase', 'bigbase');
    const children = Array.from({ length: 8 }, (_, i) => row(`op${i}-bigbase`, '4', 'bigbase', 'bigbase'));
    const childLinks = children.map((c, i) => link(c.slug, `mod${i}`));
    const nb = buildStructuralNeighbors(base, [base, ...children], childLinks);
    const ext = bucket(nb, 'extensions')!;
    expect(ext.groups).toHaveLength(6);
    expect(ext.moreCount).toBe(2);
  });
});
