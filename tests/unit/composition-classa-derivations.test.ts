import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Class-A multi-modifier composition derivations written into red_corrections
// under the confirmed composition-order and target-selection rulings. Only the
// cases with no side-flip dependency: an additive entry (pixie) that leaves the
// core side intact, and a leading-spin composition whose core is already SAME.
// Each must parse, close on its family clipper, have ADD equal to its token
// count, and survive verbatim in the source.
const APPROVED = [
  { slug: 'pixie-symposium-rev-whirl', adds: 5, notation: 'TOE > SAME IN [DEX] >> (no plant while) OP OUT [BOD] [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'spinning-ducking-superfly', adds: 7, notation: 'CLIP > (back) SPIN [BOD] > DUCK [BOD] > (no plant while) SAME OUT [DEX] [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]' },
] as const;

const ADD_TOKEN   = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;
const ANY_BRACKET = /\[[^\]]+\]/g;
const SET_SURFACE = /^(SET|CLIP|TOE|KNEE|INSIDE|OUTSIDE|SOLE)\b/;

const csvLines = readFileSync(
  join(process.cwd(), 'legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv'),
  'utf8',
).split(/\r?\n/);

describe('class-A multi-modifier composition derived operational notation', () => {
  for (const a of APPROVED) {
    it(`${a.slug}: exact notation preserved in red_corrections`, () => {
      const line = csvLines.find(l => l.startsWith(`${a.slug},operational_notation,,`));
      expect(line, `red_corrections row for ${a.slug}`).toBeDefined();
      expect(line!.split(',')[3]).toBe(a.notation);
    });

    it(`${a.slug}: parses, closes on a cross-body clipper, ADD equals ${a.adds}`, () => {
      expect(a.notation).toMatch(SET_SURFACE);
      expect(a.notation.trimEnd().endsWith('OP CLIP [XBD] [DEL]')).toBe(true);
      const brackets = a.notation.match(ANY_BRACKET) ?? [];
      expect(brackets.every(b => /^\[(DEX|BOD|DEL|XBD|PDX|XDEX|UNS)\]$/.test(b))).toBe(true);
      expect((a.notation.match(ADD_TOKEN) ?? []).length).toBe(a.adds);
    });
  }
});
