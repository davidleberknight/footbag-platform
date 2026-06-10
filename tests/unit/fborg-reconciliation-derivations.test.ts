import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Curator fborg-reconciliation pass: explicit James rulings + low-ADD fborg
// promotions. Each approved entry must survive verbatim in red_corrections and
// have ADD equal to its bracket-flag count. Two entries are deliberate
// exceptions to bracket-count (a swing-element trick and a sui-generis
// self-token primitive); for those we only pin the exact notation.
const TRICKS_DIR = 'legacy_data/inputs/curated/tricks';
const ADD_TOKEN = /\[(DEX|BOD|DEL|XBD|PDX|UNS|XDEX)\]/g;

const APPROVED = [
  { slug: 'triple-spin',    adds: 3, notation: 'SPIN [BOD] > SPIN [BOD] > SPIN [BOD]' },
  { slug: 'triple-orbit',   adds: 4, notation: 'TOE > SAME OUT [DEX] > SAME OUT [DEX] > SAME OUT [DEX] > SAME TOE [DEL]' },
  { slug: 'double-pixie',   adds: 3, notation: 'TOE > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]' },
  { slug: 'double-fairy',   adds: 3, notation: 'TOE > SAME OUT [DEX] > SAME OUT [DEX] > OP TOE [DEL]' },
  { slug: 'orbit-kick',     adds: 1, notation: 'TOE > SAME OUT [DEX]' },
  { slug: 'legover-kick',   adds: 1, notation: 'SET > OP OUT [DEX]' },
  // clipper-stall correction: terminal clipper is [XBD] [DEL] = 2, not 1.
  { slug: 'diving-clipper', adds: 3, notation: 'SET > DIVE [BOD] > SAME CLIP [XBD] [DEL]' },
  { slug: 'gyro-clipper',   adds: 3, notation: 'SET > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]' },
] as const;

// bracket-count deliberately differs from ADD: swing-element (pendulum) and
// sui-generis self-token (double-kick, foot analogue of double-knee).
const EXCEPTIONS = [
  { slug: 'pendulum',    notation: 'TOE SWING (SET) > SAME TOE [DEL]' },
  { slug: 'double-kick', notation: 'double kick' },
] as const;

const correctionsLines = readFileSync(
  join(process.cwd(), `${TRICKS_DIR}/red_corrections_2026_04_20.csv`),
  'utf8',
).split(/\r?\n/);
const additionsLines = readFileSync(
  join(process.cwd(), `${TRICKS_DIR}/red_additions_2026_04_20.csv`),
  'utf8',
).split(/\r?\n/);

const opNotation = (slug: string): string | undefined =>
  correctionsLines.find(l => l.startsWith(`${slug},operational_notation,`))?.split(',')[3];

describe('fborg-reconciliation derived operational notation', () => {
  for (const a of APPROVED) {
    it(`${a.slug}: exact notation preserved + bracket-count equals ADD`, () => {
      const n = opNotation(a.slug);
      expect(n, `red_corrections op_notation for ${a.slug}`).toBe(a.notation);
      expect((a.notation.match(ADD_TOKEN) ?? []).length).toBe(a.adds);
    });
  }

  for (const e of EXCEPTIONS) {
    it(`${e.slug}: exact notation preserved (bracket-count exception)`, () => {
      expect(opNotation(e.slug)).toBe(e.notation);
    });
  }

  it('clipper-stall corrections set diving-clipper and gyro-clipper to 3 ADD', () => {
    for (const slug of ['diving-clipper', 'gyro-clipper']) {
      const line = additionsLines.find(l => l.startsWith(`${slug},`));
      expect(line, `red_additions row for ${slug}`).toBeDefined();
      expect(line!.split(',')[1]).toBe('3');
    }
  });
});
