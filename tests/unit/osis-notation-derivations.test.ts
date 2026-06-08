import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Curator-accepted osis-family notation derivations written into
// red_corrections. Each must parse, close on a cross-body clipper catch
// (CLIP [XBD] [DEL]) so the family resolves to osis/torque, have ADD equal to
// its add-bearing token count, and survive verbatim in the source.
const APPROVED = [
  { slug: 'diving-osis',               adds: 4, notation: 'SET > DIVE [BOD] > (back or front) SPIN [BOD] > SAME/OP CLIP [XBD] [DEL]' },
  { slug: 'spinning-symposium-torque', adds: 6, notation: 'SET > (back) SPIN [BOD] > (no plant while) OP IN [DEX] [BOD] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]' },
] as const;

const ADD_TOKEN   = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;
const ANY_BRACKET = /\[[^\]]+\]/g;
const SET_SURFACE = /^(SET|CLIP|TOE|KNEE|INSIDE|OUTSIDE|SOLE)\b/;

const csvLines = readFileSync(
  join(process.cwd(), 'legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv'),
  'utf8',
).split(/\r?\n/);

describe('osis-family derived operational notation', () => {
  for (const a of APPROVED) {
    it(`${a.slug}: exact notation preserved in red_corrections`, () => {
      const line = csvLines.find(l => l.startsWith(`${a.slug},operational_notation,,`));
      expect(line, `red_corrections row for ${a.slug}`).toBeDefined();
      expect(line!.split(',')[3]).toBe(a.notation);
    });

    it(`${a.slug}: parses, resolves to osis/torque, ADD equals ${a.adds}`, () => {
      expect(a.notation).toMatch(SET_SURFACE);
      expect(a.notation.trimEnd().endsWith('CLIP [XBD] [DEL]')).toBe(true);
      const brackets = a.notation.match(ANY_BRACKET) ?? [];
      expect(brackets.every(b => /^\[(DEX|BOD|DEL|XBD|PDX|XDEX|UNS)\]$/.test(b))).toBe(true);
      expect((a.notation.match(ADD_TOKEN) ?? []).length).toBe(a.adds);
    });
  }
});
