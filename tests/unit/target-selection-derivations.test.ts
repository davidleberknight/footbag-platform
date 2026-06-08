import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Target-selection ruling derivations written into red_corrections: symposium or
// paradox attaches to the last core dex before the catch, where that target is
// unambiguous. Each must parse, close on its asserted family terminal, have ADD
// equal to its token count, and survive verbatim in the source.
const APPROVED = [
  { slug: 'paradox-fusion',               adds: 6, terminal: 'OP CLIP [XBD] [DEL]',   notation: 'TOE > OP OUT [DEX] > OP OUT [DEX] > OP OUT [PDX] [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'pixie-symposium-whirling-swirl', adds: 6, terminal: 'SAME CLIP [XBD] [DEL]', notation: 'TOE > SAME IN [DEX] >> OP IN [DEX] > (no plant while) OP BACK SWIRL [BOD] [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'symposium-atomic-butterfly',   adds: 5, terminal: 'OP CLIP [XBD] [DEL]',   notation: 'TOE > OP OUT [DEX] > (no plant while) OP OUT [BOD] [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'symposium-whirling-mirage',    adds: 4, terminal: 'OP TOE [DEL]',          notation: 'SET > OP FRONT WHIRL [DEX] > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]' },
  { slug: 'symposium-whirling-swirl',     adds: 5, terminal: 'SAME CLIP [XBD] [DEL]', notation: 'CLIP > OP IN [DEX] > (no plant while) OP BACK SWIRL [BOD] [DEX] > SAME CLIP [XBD] [DEL]' },
] as const;

const ADD_TOKEN   = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;
const ANY_BRACKET = /\[[^\]]+\]/g;
const SET_SURFACE = /^(SET|CLIP|TOE|KNEE|INSIDE|OUTSIDE|SOLE)\b/;

const csvLines = readFileSync(
  join(process.cwd(), 'legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv'),
  'utf8',
).split(/\r?\n/);

describe('target-selection ruling derived operational notation', () => {
  for (const a of APPROVED) {
    it(`${a.slug}: exact notation preserved in red_corrections`, () => {
      const line = csvLines.find(l => l.startsWith(`${a.slug},operational_notation,,`));
      expect(line, `red_corrections row for ${a.slug}`).toBeDefined();
      expect(line!.split(',')[3]).toBe(a.notation);
    });

    it(`${a.slug}: parses, closes on ${a.terminal}, ADD equals ${a.adds}`, () => {
      expect(a.notation).toMatch(SET_SURFACE);
      expect(a.notation.trimEnd().endsWith(a.terminal)).toBe(true);
      const brackets = a.notation.match(ANY_BRACKET) ?? [];
      expect(brackets.every(b => /^\[(DEX|BOD|DEL|XBD|PDX|XDEX|UNS)\]$/.test(b))).toBe(true);
      expect((a.notation.match(ADD_TOKEN) ?? []).length).toBe(a.adds);
    });
  }
});
