import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Reverse Swirl is its own family, not a member of the Swirl family: the swirl
// and reverse-swirl movements are distinct terminal identities, the same ruling
// the dictionary already carries for whirl and reverse whirl. A compound built
// on reverse swirl therefore belongs to the reverse-swirl lineage.
//
// The dictionary loader defaults a compound's family to its base's own slug and
// never to the family that base sits in, so these rows reach the right family
// from the default alone. Each still ships an explicit correction: an earlier
// override forced them into Swirl, and a later row is what supersedes it. The
// corrections are applied in file order, so the last value written wins.
//
// This pins the corrected state on both sides. The compounds must state the
// reverse-swirl family, and the reverse-swirl root must state its own, because
// its recorded base is swirl and the default alone would put the root back where
// the ruling took it out of.

const REV_SWIRL_BASED = [
  'butterfly_reverse_swirl',
  'barfly_reverse_swirl',
  'paradon_reverse_swirl',
  'stepping_butterfly_reverse_swirl',
] as const;

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').split(/\r?\n/);
const corrections = read('freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv');
const additions = read('freestyle/inputs/curated/tricks/red_additions_2026_04_20.csv');

/** The last correction wins, so a row's effective value is its final one. */
function finalFamilyCorrection(slug: string): string | undefined {
  const rows = corrections.filter(l => l.startsWith(`${slug},trick_family,`));
  return rows.length ? rows[rows.length - 1]!.split(',')[3] : undefined;
}

describe('the reverse-swirl root anchors its own lineage', () => {
  it('reverse swirl states the reverse-swirl family, against its swirl base', () => {
    expect(finalFamilyCorrection('rev_swirl')).toBe('rev_swirl');
  });

  it('its recorded base is still swirl, which is what makes the correction load-bearing', () => {
    const row = additions.find(l => l.startsWith('rev swirl,'));
    expect(row, 'red_additions row for rev swirl').toBeDefined();
    expect(row!.split(',')[2]).toBe('swirl');
  });
});

describe('compounds built on reverse swirl descend from it', () => {
  for (const slug of REV_SWIRL_BASED) {
    it(`${slug} states the reverse-swirl family`, () => {
      expect(finalFamilyCorrection(slug)).toBe('rev_swirl');
    });

    it(`${slug} keeps base_trick rev-swirl, which the family follows`, () => {
      const name = slug.replace(/_/g, ' ');
      const row = additions.find(l => l.startsWith(`${name},`));
      expect(row, `red_additions row for ${name}`).toBeDefined();
      expect(row!.split(',')[2]).toBe('rev-swirl');
    });
  }

  it('no reverse-swirl row is left pointing at the swirl family', () => {
    const stillSwirl = corrections
      .filter(l => /^[a-z_-]*rev(erse)?[_-]swirl,trick_family,/.test(l))
      .filter(l => l.split(',')[3] === 'swirl')
      .map(l => l.split(',')[0]);
    expect(stillSwirl).toEqual([]);
  });

  it('atomic reverse swirl carries its own correction, and is not one of the four', () => {
    // It was promoted separately from the four, seven weeks earlier, and its
    // override was never implied by theirs.
    expect(finalFamilyCorrection('atomic-reverse-swirl')).toBe('rev_swirl');
    expect(REV_SWIRL_BASED).not.toContain('atomic_reverse_swirl' as never);
  });
});
