import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Curator-accepted mirage-family notation derivations written into
// red_corrections. Each must parse, close on the mirage terminal (OP TOE [DEL])
// so the family still resolves to mirage, have ADD equal to its add-bearing
// token count, and survive verbatim in the curated source.
const APPROVED = [
  { slug: 'diving-mirage',             adds: 3, notation: 'SET > DIVE [BOD] > OP IN [DEX] > OP TOE [DEL]' },
  { slug: 'barraging-mirage',          adds: 4, notation: 'SET > OP IN [DEX] > SAME IN [DEX] > OP IN [DEX] > OP TOE [DEL]' },
  { slug: 'swirling-mirage',           adds: 3, notation: 'SET > SAME BACK SWIRL [DEX] > OP IN [DEX] > OP TOE [DEL]' },
  { slug: 'whirling-mirage',           adds: 3, notation: 'SET > OP FRONT WHIRL [DEX] > OP IN [DEX] > OP TOE [DEL]' },
  { slug: 'diving-symposium-mirage',   adds: 4, notation: 'SET > DIVE [BOD] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]' },
  { slug: 'swirling-paradox-mirage',   adds: 4, notation: 'CLIP > SAME BACK SWIRL [DEX] > OP IN [PDX] [DEX] > OP TOE [DEL]' },
  { slug: 'symposium-miraging-mirage', adds: 4, notation: 'SET > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]' },
  { slug: 'fairy-ducking-mirage',      adds: 4, notation: 'TOE > SAME OUT [DEX] >> DUCK [BOD] >> OP IN [DEX] > OP TOE [DEL]' },
] as const;

const ADD_TOKEN   = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;
const ANY_BRACKET = /\[[^\]]+\]/g;
const SET_SURFACE = /^(SET|CLIP|TOE|KNEE|INSIDE|OUTSIDE|SOLE)\b/;

const csvLines = readFileSync(
  join(process.cwd(), 'legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv'),
  'utf8',
).split(/\r?\n/);

describe('mirage-family derived operational notation', () => {
  for (const a of APPROVED) {
    it(`${a.slug}: exact notation preserved in red_corrections`, () => {
      const line = csvLines.find(l => l.startsWith(`${a.slug},operational_notation,,`));
      expect(line, `red_corrections row for ${a.slug}`).toBeDefined();
      expect(line!.split(',')[3]).toBe(a.notation);
    });

    it(`${a.slug}: parses, resolves to mirage, ADD equals ${a.adds}`, () => {
      expect(a.notation).toMatch(SET_SURFACE);
      // mirage family terminal: a toe catch
      expect(a.notation.trimEnd().endsWith('OP TOE [DEL]')).toBe(true);
      const brackets = a.notation.match(ANY_BRACKET) ?? [];
      expect(brackets.every(b => /^\[(DEX|BOD|DEL|XBD|PDX|XDEX|UNS)\]$/.test(b))).toBe(true);
      expect((a.notation.match(ADD_TOKEN) ?? []).length).toBe(a.adds);
    });
  }
});
