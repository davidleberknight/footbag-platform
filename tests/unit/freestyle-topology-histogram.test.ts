import { describe, it, expect } from 'vitest';
import { FAMILY_HISTOGRAM, ENTRY_HISTOGRAM } from '../../src/content/freestyleTopologyHistograms';
import { PUBLIC_DISPLAY_FAMILIES } from '../../src/content/freestylePublicFamilies';

// The histograms are a measured snapshot. These guards fail loudly if the
// first-class roster changes without the family chart being updated, or if a
// row order / count invariant the explanatory copy relies on is broken.
describe('Topology histogram snapshots', () => {
  it('the family histogram covers exactly the first-class family roster', () => {
    const histFamilies = new Set(FAMILY_HISTOGRAM.filter(r => r.tier === 'family').map(r => r.label));
    const roster = new Set(PUBLIC_DISPLAY_FAMILIES.map(f => f.label));
    expect(histFamilies).toEqual(roster);
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
