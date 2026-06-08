import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Curator-accepted derivations from the grammar ruling pass: the tapping entry
// operator (TOE > OP OUT [DEX] >>) and the >>-base collapse (a modifier inserted
// at a >> set boundary collapses it to single >). Each must parse, carry a catch
// ([DEL]), have ADD equal to its token count, and survive verbatim in the source.
const APPROVED = [
  { slug: 'tapping-legover',          adds: 3, notation: 'TOE > OP OUT [DEX] >> OP OUT [DEX] > SAME TOE [DEL]' },
  { slug: 'tapping-guay',             adds: 3, notation: 'TOE > OP OUT [DEX] >> OP IN [DEX] > SAME INSIDE [DEL]' },
  { slug: 'tapping-double-over-down', adds: 5, notation: 'TOE > OP OUT [DEX] >> OP OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'spinning-eggbeater',       adds: 4, notation: 'TOE > (back) SPIN [BOD] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]' },
  { slug: 'barraging-eggbeater',      adds: 5, notation: 'TOE > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]' },
  { slug: 'barraging-barfly',         adds: 6, notation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]' },
] as const;

const ADD_TOKEN   = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;
const ANY_BRACKET = /\[[^\]]+\]/g;
const SET_SURFACE = /^(SET|CLIP|TOE|KNEE|INSIDE|OUTSIDE|SOLE)\b/;

const csvLines = readFileSync(
  join(process.cwd(), 'legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv'),
  'utf8',
).split(/\r?\n/);

describe('grammar-ruling-pass derived operational notation', () => {
  for (const a of APPROVED) {
    it(`${a.slug}: exact notation preserved in red_corrections`, () => {
      const line = csvLines.find(l => l.startsWith(`${a.slug},operational_notation,,`));
      expect(line, `red_corrections row for ${a.slug}`).toBeDefined();
      expect(line!.split(',')[3]).toBe(a.notation);
    });

    it(`${a.slug}: parses, carries a catch, ADD equals ${a.adds}`, () => {
      expect(a.notation).toMatch(SET_SURFACE);
      expect(a.notation).toContain('[DEL]');
      const brackets = a.notation.match(ANY_BRACKET) ?? [];
      expect(brackets.every(b => /^\[(DEX|BOD|DEL|XBD|PDX|XDEX|UNS)\]$/.test(b))).toBe(true);
      expect((a.notation.match(ADD_TOKEN) ?? []).length).toBe(a.adds);
    });
  }
});
