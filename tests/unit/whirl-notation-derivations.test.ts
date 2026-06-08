import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The six curator-approved whirl-family notation derivations written into
// red_corrections. Each must open on a set surface and close on a catch delay
// (parse), its ADD must equal its add-bearing token count, and the exact
// notation string must survive verbatim in the curated source.
const APPROVED = [
  { slug: 'diving-whirl',                    adds: 4, notation: 'SET > DIVE [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'fairy-whirl',                     adds: 4, notation: 'TOE > SAME OUT [DEX] >> OP IN [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'spinning-rev-whirl',              adds: 4, notation: 'CLIP > (back) SPIN [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'ducking-symposium-reverse-whirl', adds: 5, notation: 'SET > DUCK [BOD] > (no plant while) OP OUT [BOD] [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'spinning-diving-symposium-whirl', adds: 6, notation: 'SET > (back) SPIN [BOD] > DIVE [BOD] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'spinning-ducking-symposium-whirl', adds: 6, notation: 'SET > (back) SPIN [BOD] > DUCK [BOD] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'whirling-whirl',                   adds: 4, notation: 'SET > OP FRONT WHIRL [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'miraging-symposium-whirl',         adds: 5, notation: 'SET > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'barraging-whirl',                  adds: 5, notation: 'SET > OP IN [DEX] > SAME IN [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'swirling-whirl',                   adds: 4, notation: 'SET > SAME BACK SWIRL [DEX] > OP IN [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'swirling-symposium-whirl',         adds: 5, notation: 'SET > SAME BACK SWIRL [DEX] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]' },
] as const;

const ADD_TOKEN   = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;
const ANY_BRACKET = /\[[^\]]+\]/g;
const SET_SURFACE = /^(SET|CLIP|TOE|KNEE|INSIDE|OUTSIDE|SOLE)\b/;

const csvLines = readFileSync(
  join(process.cwd(), 'legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv'),
  'utf8',
).split(/\r?\n/);

describe('whirl-family derived operational notation', () => {
  for (const a of APPROVED) {
    it(`${a.slug}: exact notation preserved in red_corrections`, () => {
      const line = csvLines.find(l => l.startsWith(`${a.slug},operational_notation,,`));
      expect(line, `red_corrections row for ${a.slug}`).toBeDefined();
      // Our rows carry no embedded commas, so field 4 (new_value) is the notation.
      expect(line!.split(',')[3]).toBe(a.notation);
    });

    it(`${a.slug}: parses and computed ADD equals ${a.adds}`, () => {
      expect(a.notation).toMatch(SET_SURFACE);
      expect(a.notation.trimEnd().endsWith('[DEL]')).toBe(true);
      const brackets = a.notation.match(ANY_BRACKET) ?? [];
      expect(brackets.every(b => /^\[(DEX|BOD|DEL|XBD|PDX|XDEX|UNS)\]$/.test(b))).toBe(true);
      expect((a.notation.match(ADD_TOKEN) ?? []).length).toBe(a.adds);
    });
  }
});
