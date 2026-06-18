import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Curator-accepted swirl-family notation derivations written into
// red_corrections. Each must parse, close on the swirl terminal
// (SAME CLIP [XBD] [DEL]) so the family resolves to swirl, have ADD equal to its
// add-bearing token count, and survive verbatim in the source.
const APPROVED = [
  { slug: 'diving-swirl',            adds: 4, notation: 'CLIP > DIVE [BOD] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'swirling-swirl',          adds: 4, notation: 'CLIP > SAME BACK SWIRL [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'symposium-swirl',         adds: 4, notation: 'CLIP > (no plant while) SAME BACK SWIRL [BOD] [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'spinning-whirling-swirl', adds: 5, notation: 'CLIP > (back) SPIN [BOD] > OP IN [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'swirling-whirling-swirl', adds: 5, notation: 'CLIP > SAME BACK SWIRL [DEX] > OP IN [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'barraging-barfly-swirl',  adds: 7, notation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > SAME OUT [DEX] > SAME OUT [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]' },
] as const;

const ADD_TOKEN   = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;
const ANY_BRACKET = /\[[^\]]+\]/g;
const SET_SURFACE = /^(SET|CLIP|TOE|KNEE|INSIDE|OUTSIDE|SOLE)\b/;

const csvLines = readFileSync(
  join(process.cwd(), 'freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv'),
  'utf8',
).split(/\r?\n/);

describe('swirl-family derived operational notation', () => {
  for (const a of APPROVED) {
    it(`${a.slug}: exact notation preserved in red_corrections`, () => {
      const line = csvLines.find(l => l.startsWith(`${a.slug},operational_notation,,`));
      expect(line, `red_corrections row for ${a.slug}`).toBeDefined();
      expect(line!.split(',')[3]).toBe(a.notation);
    });

    it(`${a.slug}: parses, resolves to swirl, ADD equals ${a.adds}`, () => {
      expect(a.notation).toMatch(SET_SURFACE);
      expect(a.notation.trimEnd().endsWith('SAME CLIP [XBD] [DEL]')).toBe(true);
      const brackets = a.notation.match(ANY_BRACKET) ?? [];
      expect(brackets.every(b => /^\[(DEX|BOD|DEL|XBD|PDX|XDEX|UNS)\]$/.test(b))).toBe(true);
      expect((a.notation.match(ADD_TOKEN) ?? []).length).toBe(a.adds);
    });
  }
});
