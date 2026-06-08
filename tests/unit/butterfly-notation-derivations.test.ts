import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Curator-accepted butterfly-family notation derivations written into
// red_corrections. Each must parse, close on the butterfly terminal
// (OP CLIP [XBD] [DEL]) so the family still resolves to clipper/butterfly, have
// ADD equal to its add-bearing token count, and survive verbatim in the source.
const APPROVED = [
  { slug: 'diving-butterfly',             adds: 4, notation: 'SET > DIVE [BOD] > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'gyro-diving-butterfly',        adds: 5, notation: 'SET > (back) SPIN [BOD] > DIVE [BOD] > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'barraging-butterfly',          adds: 5, notation: 'SET > OP IN [DEX] > SAME IN [DEX] > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'swirling-butterfly',           adds: 4, notation: 'SET > SAME BACK SWIRL [DEX] > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'whirling-butterfly',           adds: 4, notation: 'SET > OP FRONT WHIRL [DEX] > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'miraging-symposium-butterfly', adds: 5, notation: 'SET > OP IN [DEX] > (no plant while) SAME/OP OUT [BOD] [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'fairy-butterfly',              adds: 4, notation: 'TOE > SAME OUT [DEX] >> SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
] as const;

const ADD_TOKEN   = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;
const ANY_BRACKET = /\[[^\]]+\]/g;
const SET_SURFACE = /^(SET|CLIP|TOE|KNEE|INSIDE|OUTSIDE|SOLE)\b/;

const csvLines = readFileSync(
  join(process.cwd(), 'legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv'),
  'utf8',
).split(/\r?\n/);

describe('butterfly-family derived operational notation', () => {
  for (const a of APPROVED) {
    it(`${a.slug}: exact notation preserved in red_corrections`, () => {
      const line = csvLines.find(l => l.startsWith(`${a.slug},operational_notation,,`));
      expect(line, `red_corrections row for ${a.slug}`).toBeDefined();
      expect(line!.split(',')[3]).toBe(a.notation);
    });

    it(`${a.slug}: parses, resolves to clipper/butterfly, ADD equals ${a.adds}`, () => {
      expect(a.notation).toMatch(SET_SURFACE);
      expect(a.notation.trimEnd().endsWith('OP CLIP [XBD] [DEL]')).toBe(true);
      const brackets = a.notation.match(ANY_BRACKET) ?? [];
      expect(brackets.every(b => /^\[(DEX|BOD|DEL|XBD|PDX|XDEX|UNS)\]$/.test(b))).toBe(true);
      expect((a.notation.match(ADD_TOKEN) ?? []).length).toBe(a.adds);
    });
  }
});
