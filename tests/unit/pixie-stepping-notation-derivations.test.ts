import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Pixie/stepping entry-grammar derivations written into red_corrections, under
// the confirmed grammar (pixie = TOE > SAME IN [DEX] >>, stepping =
// CLIP > OP IN [DEX] >>). Each replaces its base's set with the entry and
// inherits the base core verbatim, so the terminal (and family) is preserved.
// Tested: exact string, parse, recognized tokens, ADD = token count.
const APPROVED = [
  { slug: 'pixie-mirage',                  adds: 3, notation: 'TOE > SAME IN [DEX] >> OP IN [DEX] > OP TOE [DEL]' },
  { slug: 'pixie-rev-whirl',               adds: 4, notation: 'TOE > SAME IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'pixie-ducking-mirage',          adds: 4, notation: 'TOE > SAME IN [DEX] >> DUCK [BOD] > OP IN [DEX] > OP TOE [DEL]' },
  { slug: 'pixie-diving-butterfly',        adds: 5, notation: 'TOE > SAME IN [DEX] >> DIVE [BOD] > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'pixie-ducking-butterfly',       adds: 5, notation: 'TOE > SAME IN [DEX] >> DUCK [BOD] > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'pixie-guay',                    adds: 3, notation: 'TOE > SAME IN [DEX] >> OP IN [DEX] > SAME INSIDE [DEL]' },
  { slug: 'pixie-double-pickup',           adds: 4, notation: 'TOE > SAME IN [DEX] >> OP IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]' },
  { slug: 'pixie-dolomite',                adds: 6, notation: 'TOE > SAME IN [DEX] >> (no plant while) OP OUT [DEX] [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'pixie-symposium-rev-whirl',     adds: 5, notation: 'TOE > SAME IN [DEX] >> (no plant while) OP OUT [BOD] [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'stepping-mirage',               adds: 3, notation: 'CLIP > OP IN [DEX] >> OP IN [DEX] > OP TOE [DEL]' },
  { slug: 'stepping-rev-whirl',            adds: 4, notation: 'CLIP > OP IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'stepping-illusion',             adds: 3, notation: 'CLIP > OP IN [DEX] >> OP OUT [DEX] > OP TOE [DEL]' },
  { slug: 'stepping-legover',              adds: 3, notation: 'CLIP > OP IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]' },
  { slug: 'stepping-blender',              adds: 5, notation: 'CLIP > OP IN [DEX] >> OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]' },
  { slug: 'stepping-barrage',              adds: 4, notation: 'CLIP > OP IN [DEX] >> SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]' },
  { slug: 'stepping-guay',                 adds: 3, notation: 'CLIP > OP IN [DEX] >> OP IN [DEX] > SAME INSIDE [DEL]' },
  { slug: 'stepping-reaper',               adds: 4, notation: 'CLIP > OP IN [DEX] >> SAME OUT [DEX] > SAME OUT [DEX] > SAME TOE [DEL]' },
  { slug: 'stepping-butterfly',            adds: 4, notation: 'CLIP > OP IN [DEX] >> SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
] as const;

const ADD_TOKEN   = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;
const ANY_BRACKET = /\[[^\]]+\]/g;
const SET_SURFACE = /^(SET|CLIP|TOE|KNEE|INSIDE|OUTSIDE|SOLE)\b/;

const csvLines = readFileSync(
  join(process.cwd(), 'freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv'),
  'utf8',
).split(/\r?\n/);

describe('pixie/stepping entry-grammar derived operational notation', () => {
  for (const a of APPROVED) {
    it(`${a.slug}: exact notation preserved in red_corrections`, () => {
      const line = csvLines.find(l => l.startsWith(`${a.slug},operational_notation,,`));
      expect(line, `red_corrections row for ${a.slug}`).toBeDefined();
      expect(line!.split(',')[3]).toBe(a.notation);
    });

    it(`${a.slug}: parses, opens on a set surface, closes on a catch, ADD equals ${a.adds}`, () => {
      expect(a.notation).toMatch(SET_SURFACE);
      expect(a.notation.trimEnd().endsWith('[DEL]')).toBe(true);
      const brackets = a.notation.match(ANY_BRACKET) ?? [];
      expect(brackets.every(b => /^\[(DEX|BOD|DEL|XBD|PDX|XDEX|UNS)\]$/.test(b))).toBe(true);
      expect((a.notation.match(ADD_TOKEN) ?? []).length).toBe(a.adds);
    });
  }
});
