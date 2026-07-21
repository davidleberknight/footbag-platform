/**
 * Inspinning reverse guay carries its named operator.
 *
 * The trick's name, modifier link, and editorial notes all describe a real
 * front-rotation inspinning entry, and any spin contributes +1 ADD. A
 * promotion-time derivation once dropped the operator (deriving guay alone),
 * which produced a spin-less 2-ADD formula byte-identical to reverse guay.
 * These assertions pin the corrected shape: the formula is the inspinning-guay
 * chassis with the dex and catch sides reversed - which is exactly what
 * "reverse" names - so it can never again degenerate into its base's formula
 * or drift onto spinning guay's back-rotation form.
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
  base_trick: string | null;
  trick_family: string | null;
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

const SCORING = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;

function flip(rel: string): string {
  return rel === 'SAME' ? 'OP' : 'SAME';
}

describe('inspinning reverse guay carries its named operator', () => {
  it('contains the front inspinning body event', () => {
    expect(row('inspinning_reverse_guay').operational_notation)
      .toContain('(front) SPIN [BOD]');
  });

  it('scores three brackets and 3 ADD', () => {
    const r = row('inspinning_reverse_guay');
    expect((r.operational_notation!.match(SCORING) || []).length).toBe(3);
    expect(r.adds).toBe('3');
  });

  it('equals the inspinning-guay chassis with reverse-guay side relations', () => {
    const ig = row('inspinning_guay').operational_notation!.split(' > ');
    const dex = ig[2].split(' ');
    const term = ig[3].split(' ');
    const reversed = [
      ig[0],
      ig[1],
      [flip(dex[0]), ...dex.slice(1)].join(' '),
      [flip(term[0]), ...term.slice(1)].join(' '),
    ].join(' > ');
    expect(row('inspinning_reverse_guay').operational_notation).toBe(reversed);
  });

  it('no longer shares a formula with reverse guay and never matches spinning guay', () => {
    const irg = row('inspinning_reverse_guay').operational_notation;
    expect(irg).not.toBe(row('reverse_guay').operational_notation);
    expect(irg).not.toBe(row('spinning_guay').operational_notation);
  });

  it('keeps its identity fields: base, family, and the 2-ADD base trick unchanged', () => {
    const r = row('inspinning_reverse_guay');
    expect(r.base_trick).toBe('guay');
    expect(r.trick_family).toBe('inside_stall');
    expect(row('reverse_guay').adds).toBe('2');
    expect(row('reverse_guay').operational_notation).toBe('SET > SAME IN [DEX] > OP INSIDE [DEL]');
  });
});
