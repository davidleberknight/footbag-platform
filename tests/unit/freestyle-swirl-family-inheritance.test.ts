import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Loader 19 computes trick_family from base_trick, and reverse swirl is itself a
// swirl-family compound, so a compound built on it would read trick_family
// 'rev_swirl' from that step alone. The pipeline resolves this transitively --
// atomic reverse swirl carries no override and still lands on swirl -- so the
// overrides on the promoted rows are belt-and-braces rather than load-bearing.
// This pins them anyway: the promoted rows should state their intended family
// explicitly, so a change to the normalisation cannot silently move them out of
// the Swirl family without a test failing.

const REV_SWIRL_BASED = [
  'butterfly_reverse_swirl',
  'barfly_reverse_swirl',
  'paradon_reverse_swirl',
  'stepping_butterfly_reverse_swirl',
] as const;

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').split(/\r?\n/);
const corrections = read('freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv');
const additions = read('freestyle/inputs/curated/tricks/red_additions_2026_04_20.csv');

describe('reverse-swirl compounds stay in the Swirl family', () => {
  for (const slug of REV_SWIRL_BASED) {
    it(`${slug} ships a paired trick_family override to swirl`, () => {
      const row = corrections.find(l => l.startsWith(`${slug},trick_family,`));
      expect(row, `red_corrections trick_family row for ${slug}`).toBeDefined();
      // slug,field,old_value,new_value -> new_value is the fourth column
      expect(row!.split(',')[3]).toBe('swirl');
    });

    it(`${slug} keeps base_trick rev-swirl, so the override stays necessary`, () => {
      const name = slug.replace(/_/g, ' ');
      const row = additions.find(l => l.startsWith(`${name},`));
      expect(row, `red_additions row for ${name}`).toBeDefined();
      expect(row!.split(',')[2]).toBe('rev-swirl');
    });
  }

  it('the promoted rows are the ones carrying an explicit override', () => {
    const overridden = corrections
      .filter(l => /,trick_family,rev_swirl,swirl,/.test(l))
      .map(l => l.split(',')[0])
      .sort();
    expect(overridden).toEqual([...REV_SWIRL_BASED].sort());
  });
});
