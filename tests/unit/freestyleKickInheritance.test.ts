/**
 * Terminal-foot inheritance for named kick variants.
 *
 * A kick trick with a named non-kick associate preserves the associate's
 * complete movement structure and terminal-foot relation; only the terminal
 * stall/delay is replaced by a non-scoring kick event. The kick foot is
 * therefore inherited from the base trick, never derived from the dex
 * direction alone: around-the-world-kick and pixie-kick share a dex but end
 * on different feet, which is what keeps them distinct tricks.
 *
 * Asserted against the dictionary snapshot fixture, which mirrors the built
 * canonical database: every non-terminal component identical, the terminal
 * relation carried over, exactly one scoring bracket, and 1 ADD.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface SnapshotTrick {
  slug: string;
  adds: string | null;
  operational_notation: string | null;
}

const snapshot = JSON.parse(readFileSync(
  join(process.cwd(), 'tests/fixtures/freestyleDictionarySnapshot.json'), 'utf8',
)) as { tricks: SnapshotTrick[] };

const bySlug = new Map(snapshot.tricks.map(t => [t.slug, t]));

function row(slug: string): SnapshotTrick {
  const r = bySlug.get(slug);
  expect(r, `snapshot row for ${slug}`).toBeDefined();
  return r!;
}

// kick variant -> its named non-kick associate
const INHERITANCE: Array<[string, string]> = [
  ['around_the_world_kick', 'around_the_world'],
  ['orbit_kick', 'orbit'],
  ['pixie_kick', 'pixie'],
  ['fairy_kick', 'fairy'],
  ['legover_kick', 'legover'],
  ['illusioning_kick', 'illusion'],
  ['miraging_kick', 'mirage'],
];

const SCORING = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;

describe('named kick variants inherit their base structure and terminal-foot relation', () => {
  for (const [kick, base] of INHERITANCE) {
    it(`${kick} = ${base} with only the terminal event replaced by a kick`, () => {
      const kickSegs = row(kick).operational_notation!.split(' > ');
      const baseSegs = row(base).operational_notation!.split(' > ');

      // every non-terminal component is identical
      expect(kickSegs.slice(0, -1)).toEqual(baseSegs.slice(0, -1));

      // the base ends in a relation-bearing stall/delay; the kick keeps the
      // relation and swaps the contact type
      const term = baseSegs[baseSegs.length - 1].match(/^(SAME|OP) (\S+) \[DEL\]$/);
      expect(term, `terminal delay segment on ${base}`).toBeTruthy();
      expect(kickSegs[kickSegs.length - 1]).toBe(`${term![1]} [KICK]`);
    });

    it(`${kick} scores exactly one bracket and 1 ADD; the kick event is non-scoring`, () => {
      const r = row(kick);
      expect((r.operational_notation!.match(SCORING) || []).length).toBe(1);
      expect(r.adds).toBe('1');
    });
  }

  it('the three formerly-colliding kick pairs are distinguished by their terminal relations', () => {
    const pairs: Array<[string, string]> = [
      ['around_the_world_kick', 'pixie_kick'],
      ['orbit_kick', 'fairy_kick'],
      ['legover_kick', 'illusioning_kick'],
    ];
    for (const [a, b] of pairs) {
      expect(row(a).operational_notation).not.toBe(row(b).operational_notation);
    }
  });
});
