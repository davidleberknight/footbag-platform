import { describe, it, expect } from 'vitest';
import {
  FAMILY_HISTOGRAM,
  ENTRY_HISTOGRAM,
  AWAITING_TOPOLOGY_AUDIT,
} from '../../src/content/freestyleTopologyHistograms';
import { PUBLIC_DISPLAY_FAMILIES } from '../../src/content/freestylePublicFamilies';

// The histograms are a measured snapshot. These guards fail loudly if the
// first-class roster changes without the family chart being updated, or if a
// row order / count invariant the explanatory copy relies on is broken.
describe('Topology histogram snapshots', () => {
  it('every family the histogram charts is still a public browse family', () => {
    // Fail-closed in this direction: a row for a family the browse no longer
    // carries is a chart describing something a reader cannot reach.
    const roster = new Set(PUBLIC_DISPLAY_FAMILIES.map(f => f.label));
    const charted = FAMILY_HISTOGRAM.filter(r => r.tier === 'family').map(r => r.label);
    expect(charted.filter(label => !roster.has(label))).toEqual([]);
  });

  it('any browse family the histogram omits is declared as awaiting measurement', () => {
    // The counts come from a periodic audit, so a family admitted between audits
    // has no measured row. That is allowed only when it is named: an omission
    // somebody accounted for, never one that slipped through.
    const charted = new Set(FAMILY_HISTOGRAM.filter(r => r.tier === 'family').map(r => r.label));
    const unexplained = PUBLIC_DISPLAY_FAMILIES
      .filter(f => !charted.has(f.label) && !AWAITING_TOPOLOGY_AUDIT.has(f.slug))
      .map(f => f.slug);
    expect(unexplained).toEqual([]);
  });

  it('declares only families that are actually missing a measured row', () => {
    // An entry left here after its row lands would hide a real omission later.
    const charted = new Set(FAMILY_HISTOGRAM.filter(r => r.tier === 'family').map(r => r.label));
    const stale = [...AWAITING_TOPOLOGY_AUDIT].filter((slug) => {
      const entry = PUBLIC_DISPLAY_FAMILIES.find(f => f.slug === slug);
      return !entry || charted.has(entry.label);
    });
    expect(stale).toEqual([]);
  });

  it('charts no count for a family awaiting measurement', () => {
    // Not zero, not an estimate: no row at all, so nothing reads as measured.
    for (const slug of AWAITING_TOPOLOGY_AUDIT) {
      const entry = PUBLIC_DISPLAY_FAMILIES.find(f => f.slug === slug)!;
      expect(FAMILY_HISTOGRAM.find(r => r.label === entry.label)).toBeUndefined();
    }
  });

  it('charts the whole browse registry, with nothing left unmeasured', () => {
    // The values themselves are not pinned here. They are generated from the
    // browse's family membership and checked against a dictionary built from the
    // committed inputs, so a number asserted in this file would be a second,
    // weaker copy of that check and would need editing every time the dictionary
    // grew. What belongs here is the shape: every public family has a row.
    expect(FAMILY_HISTOGRAM.filter(r => r.tier === 'family'))
      .toHaveLength(PUBLIC_DISPLAY_FAMILIES.length);
    expect([...AWAITING_TOPOLOGY_AUDIT]).toEqual([]);
  });

  it('gives Reverse Swirl the row it was admitted to the browse without', () => {
    // It was charted nowhere while it waited for a measurement, which is the
    // omission this whole refresh existed to close.
    const revSwirl = FAMILY_HISTOGRAM.find(r => r.label === 'Reverse Swirl');
    expect(revSwirl).toBeDefined();
    expect(revSwirl!.tier).toBe('family');
    expect(revSwirl!.count).toBeGreaterThan(0);
  });

  it('leads with the two terminal surface roots', () => {
    expect(FAMILY_HISTOGRAM.slice(0, 2).map(r => r.label)).toEqual(['Clipper Stall', 'Toe Stall']);
    expect(FAMILY_HISTOGRAM.filter(r => r.tier === 'surface')).toHaveLength(2);
    expect(ENTRY_HISTOGRAM.slice(0, 2).map(r => r.label)).toEqual(['Toe set', 'Clip set']);
  });

  it('both histograms are sorted by descending count', () => {
    for (const h of [FAMILY_HISTOGRAM, ENTRY_HISTOGRAM]) {
      const counts = h.map(r => r.count);
      expect(counts).toEqual([...counts].sort((a, b) => b - a));
    }
  });

  it('counts a family by folded membership, keeping Swirl above Pickup', () => {
    // The relationship the chart's explanatory copy leans on, and the reason the
    // count is not a plain family-column tally: a family carries its branches'
    // tricks as well as its own.
    const swirl  = FAMILY_HISTOGRAM.find(r => r.label === 'Swirl')!.count;
    const pickup = FAMILY_HISTOGRAM.find(r => r.label === 'Pickup')!.count;
    expect(swirl).toBeGreaterThan(pickup);
  });
});
