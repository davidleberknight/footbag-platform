import { describe, it, expect } from 'vitest';
import { padPopularTagsWithSeeds, composeSuggestedTags, type SeededTagChip, type TeachingTagSeed } from '../../src/content/teachingTagSeeds';

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

describe('composeSuggestedTags — pinned seeds phased out by community uploads', () => {
  const curator = (display: string): SeededTagChip => chip(display);

  it('pins the seeds at the top before any community usage, curator backfills the rest', () => {
    const out = composeSuggestedTags([], SEEDS, [curator('#cur1'), curator('#cur2')], 8, href);
    expect(out.map((c) => c.normalized)).toEqual(['#alpha', '#bravo', '#charlie', '#cur1', '#cur2']);
  });

  it('ranks real community tags above the seeds', () => {
    const out = composeSuggestedTags([chip('#real')], SEEDS, [curator('#cur1')], 8, href);
    expect(out.map((c) => c.normalized)).toEqual(['#real', '#alpha', '#bravo', '#charlie', '#cur1']);
  });

  it('squeezes the seeds out as community tags fill the capped list', () => {
    const community = [chip('#r1'), chip('#r2'), chip('#r3'), chip('#r4'), chip('#r5'), chip('#r6'), chip('#r7'), chip('#r8')];
    const out = composeSuggestedTags(community, SEEDS, [curator('#cur1')], 8, href);
    expect(out.map((c) => c.normalized)).toEqual(['#r1', '#r2', '#r3', '#r4', '#r5', '#r6', '#r7', '#r8']);
  });

  it('partially squeezes the seeds when community fills some but not all slots', () => {
    const out = composeSuggestedTags([chip('#r1'), chip('#r2'), chip('#r3'), chip('#r4'), chip('#r5'), chip('#r6')], SEEDS, [curator('#cur1')], 8, href);
    expect(out.map((c) => c.normalized)).toEqual(['#r1', '#r2', '#r3', '#r4', '#r5', '#r6', '#alpha', '#bravo']);
  });

  it('de-duplicates a curator tag that already appears as a seed', () => {
    const out = composeSuggestedTags([], SEEDS, [curator('#ALPHA'), curator('#cur1')], 8, href);
    expect(out.map((c) => c.normalized)).toEqual(['#alpha', '#bravo', '#charlie', '#cur1']);
  });

  it('de-duplicates a curator tag that already appears as a community tag', () => {
    const out = composeSuggestedTags([chip('#shared')], SEEDS, [curator('#SHARED')], 8, href);
    expect(out.map((c) => c.normalized)).toEqual(['#shared', '#alpha', '#bravo', '#charlie']);
  });
});
