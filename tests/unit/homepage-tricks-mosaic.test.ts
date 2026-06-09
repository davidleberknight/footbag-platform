import { describe, it, expect } from 'vitest';
import { CORE_TRICKS } from '../../src/services/coreTrickRegistry';
import {
  TRICKS_MOSAIC,
  mosaicMatchesCoreAtoms,
  mosaicClipFilename,
} from '../../src/content/homepageTricksMosaic';

// The homepage hero mosaic must always present exactly the 12 canonical core
// atoms, each with a human label, and load its loop by the agreed filename. These
// guards stop the hero from silently drifting out of sync with the ontology when
// the atom registry changes.
describe('homepage foundational-tricks mosaic', () => {
  it('has exactly 12 cells', () => {
    expect(TRICKS_MOSAIC).toHaveLength(12);
  });

  it('covers exactly the canonical core atoms, no more and no fewer', () => {
    expect(mosaicMatchesCoreAtoms()).toBe(true);
    const slugs = TRICKS_MOSAIC.map(a => a.slug).sort();
    expect(slugs).toEqual([...CORE_TRICKS].sort());
  });

  it('every cell carries a non-empty label', () => {
    for (const atom of TRICKS_MOSAIC) {
      expect(atom.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('uses the mosaic-<slug>.mp4 clip filename convention', () => {
    expect(mosaicClipFilename('toe-stall')).toBe('mosaic-toe-stall.mp4');
    expect(mosaicClipFilename('swirl')).toBe('mosaic-swirl.mp4');
  });
});
