/**
 * Terminal-type consistency across the 1 ADD inventory.
 *
 * Every 1 ADD trick's operational notation ends in an explicit terminal-type
 * marker: [DEL] for a stall/delay ending, or the non-scoring [KICK] for a
 * kick ending. This covers the kick-only cross-body clipper and the airborne
 * flying kicks, which carry [KICK] like the rest of the kick cohort while
 * their ADD source (the scoring bracket) is unchanged.
 *
 * double_knee is the one deliberate exemption: it is a sui-generis
 * self-token primitive whose curator ruling carries no terminal-type marker,
 * and whether its rebound contact reads as a kick terminal is an open
 * curator adjudication, not a normalization to make by analogy.
 *
 * Asserted against the dictionary snapshot fixture, which mirrors the built
 * canonical database.
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

const oneAddRows = snapshot.tricks.filter(t => t.adds === '1');

const TERMINAL_EXEMPT = new Set(['double_knee']);

describe('1 ADD inventory carries an explicit terminal-type marker', () => {
  it('has the full 1 ADD population in the fixture', () => {
    expect(oneAddRows.length).toBeGreaterThanOrEqual(25);
  });

  for (const row of oneAddRows) {
    if (TERMINAL_EXEMPT.has(row.slug)) continue;
    it(`${row.slug} ends in [DEL] or [KICK]`, () => {
      expect(row.operational_notation, `${row.slug} operational notation`).toBeTruthy();
      expect(row.operational_notation!).toMatch(/\[(DEL|KICK)\]$/);
    });
  }

  it('the kick-only clipper and the airborne flying kicks carry the non-scoring [KICK] terminal', () => {
    const bySlug = new Map(snapshot.tricks.map(t => [t.slug, t]));
    expect(bySlug.get('clipper')?.operational_notation).toBe('CLIP [XBD] [KICK]');
    expect(bySlug.get('flying_inside')?.operational_notation).toBe('FLYING [BOD] > SAME INSIDE [KICK]');
    expect(bySlug.get('flying_outside')?.operational_notation).toBe('FLYING [BOD] > SAME OUTSIDE [KICK]');
  });

  it('the [KICK] marker never counts toward scoring brackets: every 1 ADD row has exactly one', () => {
    const SCORING = /\[(DEX|BOD|DEL|XBD|PDX|UNS|XDEX)\]/g;
    for (const row of oneAddRows) {
      const count = (row.operational_notation ?? '').match(SCORING)?.length ?? 0;
      expect(count, `${row.slug} scoring brackets`).toBe(1);
    }
  });
});
