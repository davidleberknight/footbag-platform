/**
 * Clipper-stall base decomposition for compounds landing in the cross-body
 * delay.
 *
 * `base_trick` is the mechanical decomposition base whose ADD value combines
 * with the applied operators to produce the compound; it is distinct from
 * `trick_family` and is not decided by terminal contact alone. A compound
 * whose terminal is the 2-ADD cross-body delay ([XBD] [DEL]) decomposes on
 * clipper_stall, never on the 1-ADD clipper kick, and its ADD arithmetic
 * closes as operator weight plus the 2-ADD base.
 *
 * flying_clipper is the counter-case: a genuine airborne kick with no [DEL],
 * so it keeps the clipper kick as its base.
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
  operational_notation: string | null;
}

const snapshot = JSON.parse(readFileSync(
  join(process.cwd(), 'tests/fixtures/freestyleDictionarySnapshot.json'), 'utf8',
)) as { tricks: SnapshotTrick[] };

const bySlug = new Map(snapshot.tricks.map(t => [t.slug, t]));

// Compounds that land in the cross-body delay, with the operator weight that
// closes their ADD arithmetic against the 2-ADD clipper_stall base.
const STALL_TERMINAL_COMPOUNDS: ReadonlyArray<{ slug: string; operatorAdd: number }> = [
  { slug: 'diving_clipper',             operatorAdd: 1 },
  { slug: 'gyro_clipper',               operatorAdd: 1 },
  { slug: 'pixie_clipper',              operatorAdd: 1 },
  { slug: 'stepping_clipper',           operatorAdd: 1 },
  { slug: 'sailing_clipper',            operatorAdd: 2 },
  { slug: 'terraging_opposite_clipper', operatorAdd: 2 },
  { slug: 'terraging_same_clipper',     operatorAdd: 2 },
];

describe('clipper-stall base decomposition', () => {
  it('the clipper_stall base row exists and carries 2 ADD', () => {
    const base = bySlug.get('clipper_stall');
    expect(base).toBeDefined();
    expect(base!.adds).toBe('2');
  });

  for (const { slug, operatorAdd } of STALL_TERMINAL_COMPOUNDS) {
    it(`${slug} decomposes on clipper_stall and its ADD arithmetic closes`, () => {
      const row = bySlug.get(slug);
      expect(row, `${slug} missing from snapshot`).toBeDefined();
      expect(row!.base_trick).toBe('clipper_stall');
      expect(Number(row!.adds)).toBe(operatorAdd + 2);
    });

    it(`${slug} lands in the cross-body delay ([XBD] [DEL] terminal)`, () => {
      const row = bySlug.get(slug)!;
      expect(row.operational_notation).toBeTruthy();
      expect(row.operational_notation!).toMatch(/CLIP \[XBD\] \[DEL\]$/);
    });
  }

  it('flying_clipper is a kick, not a stall: base stays clipper and no [DEL]', () => {
    const row = bySlug.get('flying_clipper');
    expect(row).toBeDefined();
    expect(row!.base_trick).toBe('clipper');
    expect(row!.operational_notation).toBeTruthy();
    expect(row!.operational_notation!).not.toContain('[DEL]');
    expect(row!.operational_notation!).toContain('[BOD]');
  });
});
