import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Curator-accepted illusion-family notation derivations written into
// red_corrections. Each must parse, close on the illusion terminal
// (OP TOE [DEL]) so the family resolves to illusion, have ADD equal to its
// add-bearing token count, and survive verbatim in the source.
const APPROVED = [
  { slug: 'diving-illusion',    adds: 3, notation: 'SET > DIVE [BOD] > OP OUT [DEX] > OP TOE [DEL]' },
  { slug: 'barraging-illusion', adds: 4, notation: 'SET > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > OP TOE [DEL]' },
  { slug: 'symposium-bubba',    adds: 3, notation: 'CLIP > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]' },
] as const;

const ADD_TOKEN   = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;
const ANY_BRACKET = /\[[^\]]+\]/g;
const SET_SURFACE = /^(SET|CLIP|TOE|KNEE|INSIDE|OUTSIDE|SOLE)\b/;

const csvLines = readFileSync(
  join(process.cwd(), 'freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv'),
  'utf8',
).split(/\r?\n/);

describe('illusion-family derived operational notation', () => {
  for (const a of APPROVED) {
    it(`${a.slug}: exact notation preserved in red_corrections`, () => {
      const line = csvLines.find(l => l.startsWith(`${a.slug},operational_notation,,`));
      expect(line, `red_corrections row for ${a.slug}`).toBeDefined();
      expect(line!.split(',')[3]).toBe(a.notation);
    });

    it(`${a.slug}: parses, resolves to illusion, ADD equals ${a.adds}`, () => {
      expect(a.notation).toMatch(SET_SURFACE);
      expect(a.notation.trimEnd().endsWith('OP TOE [DEL]')).toBe(true);
      const brackets = a.notation.match(ANY_BRACKET) ?? [];
      expect(brackets.every(b => /^\[(DEX|BOD|DEL|XBD|PDX|XDEX|UNS)\]$/.test(b))).toBe(true);
      expect((a.notation.match(ADD_TOKEN) ?? []).length).toBe(a.adds);
    });
  }
});
