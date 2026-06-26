import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { CORE_TRICKS } from '../../src/services/coreTrickRegistry';
import {
  TRICKS_MOSAIC,
  mosaicMatchesCoreAtoms,
  mosaicClipFilename,
} from '../../src/content/freestyleTricksMosaic';

// Resolve a mosaic clip's curator sidecar from its atom slug. The on-disk
// curated assets are hyphen-joined (mosaic-toe-stall.meta.json) while the atom
// slug is underscore-joined (toe_stall).
function mosaicSidecarCaption(slug: string): string {
  const path = fileURLToPath(
    new URL(`../../curated/site/mosaic-${slug.replace(/_/g, '-')}.meta.json`, import.meta.url),
  );
  return (JSON.parse(readFileSync(path, 'utf8')) as { caption: string }).caption;
}

// The freestyle landing mosaic must always present exactly the 12 canonical core
// atoms, each with a human label, and load its loop by the agreed filename. These
// guards stop the section from silently drifting out of sync with the ontology when
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

  // The named-gallery tile overlays this caption to mask the clip's burnt-in
  // lower-left poster text, so the caption must be the plain trick name alone:
  // any descriptive suffix renders as clutter on top of the clip. The label
  // shown on the landing mosaic cell is the canonical source of that name.
  it('each clip caption is exactly its plain trick-name label', () => {
    for (const atom of TRICKS_MOSAIC) {
      expect(mosaicSidecarCaption(atom.slug)).toBe(atom.label);
    }
  });
});
