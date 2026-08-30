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

  it('leaves every measured count exactly as the last audit left it', () => {
    // Admitting a family to the browse measures nothing. These are the audit's
    // numbers, and this slice does not touch one of them.
    const measured = Object.fromEntries(
      FAMILY_HISTOGRAM.filter(r => r.tier === 'family').map(r => [r.label, r.count]));
    expect(measured).toMatchObject({
      Osis: 84, Whirl: 74, Legover: 71, Mirage: 69, Butterfly: 48,
      'Reverse Whirl': 10, Eclipse: 9, Flail: 9, Dyno: 5, 'Dada-Curve': 4,
    });
    // One row short of the browse registry, and the shortfall is Reverse Swirl.
    expect(FAMILY_HISTOGRAM.filter(r => r.tier === 'family')).toHaveLength(27);
    expect(PUBLIC_DISPLAY_FAMILIES).toHaveLength(28);
    expect([...AWAITING_TOPOLOGY_AUDIT]).toEqual(['rev_swirl']);
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

  it('Swirl uses recursive descendants (29), keeping it above Pickup (27)', () => {
    const swirl  = FAMILY_HISTOGRAM.find(r => r.label === 'Swirl')!.count;
    const pickup = FAMILY_HISTOGRAM.find(r => r.label === 'Pickup')!.count;
    expect(swirl).toBe(29);
    expect(swirl).toBeGreaterThan(pickup);
  });
});
