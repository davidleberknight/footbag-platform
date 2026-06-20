import { describe, it, expect } from 'vitest';
import { padPopularTagsWithSeeds, type SeededTagChip, type TeachingTagSeed } from '../../src/content/teachingTagSeeds';

const href = (n: string): string => `/media/browse?tag=${n.slice(1)}`;
const chip = (display: string): SeededTagChip => ({ display, normalized: display, href: href(display) });
const SEEDS: ReadonlyArray<TeachingTagSeed> = [
  { display: '#alpha', normalized: '#alpha' },
  { display: '#bravo', normalized: '#bravo' },
  { display: '#charlie', normalized: '#charlie' },
];

describe('padPopularTagsWithSeeds', () => {
  it('returns all seeds in order when there are no real tags and limit is generous', () => {
    const out = padPopularTagsWithSeeds([], SEEDS, 10, href);
    expect(out.map((c) => c.normalized)).toEqual(['#alpha', '#bravo', '#charlie']);
    expect(out[0].href).toBe('/media/browse?tag=alpha');
  });

  it('puts real tags first, then pads with seeds', () => {
    const out = padPopularTagsWithSeeds([chip('#real')], SEEDS, 10, href);
    expect(out.map((c) => c.normalized)).toEqual(['#real', '#alpha', '#bravo', '#charlie']);
  });

  it('drops a seed that duplicates a real tag (case-insensitive)', () => {
    const out = padPopularTagsWithSeeds([chip('#ALPHA')], SEEDS, 10, href);
    expect(out.map((c) => c.normalized)).toEqual(['#ALPHA', '#bravo', '#charlie']);
  });

  it('drops duplicate seeds against earlier seeds (case-insensitive)', () => {
    const dupSeeds: TeachingTagSeed[] = [
      { display: '#alpha', normalized: '#alpha' },
      { display: '#Alpha', normalized: '#Alpha' },
    ];
    const out = padPopularTagsWithSeeds([], dupSeeds, 10, href);
    expect(out.map((c) => c.normalized)).toEqual(['#alpha']);
  });

  it('respects the limit: real tags fill all slots and no seeds appear', () => {
    const out = padPopularTagsWithSeeds([chip('#r1'), chip('#r2')], SEEDS, 2, href);
    expect(out.map((c) => c.normalized)).toEqual(['#r1', '#r2']);
  });

  it('respects the limit: one slot left admits exactly one seed', () => {
    const out = padPopularTagsWithSeeds([chip('#r1')], SEEDS, 2, href);
    expect(out.map((c) => c.normalized)).toEqual(['#r1', '#alpha']);
  });

  it('empty real and empty seeds yields empty', () => {
    expect(padPopularTagsWithSeeds([], [], 10, href)).toEqual([]);
  });
});
