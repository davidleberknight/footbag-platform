import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Side-flip ruling derivations written into red_corrections: a leading spin or
// stepping entry flips the first following core dex OP->SAME. Toe/stall catches
// follow the flipped dex (SAME TOE); clipper-family catches keep their cross-body
// clipper terminal. Each must parse, close on its asserted family terminal, have
// ADD equal to its token count, and survive verbatim in the source.
const APPROVED = [
  { slug: 'stepping-diving-mirage',    adds: 4, terminal: 'SAME TOE [DEL]',        notation: 'CLIP > OP IN [DEX] > DIVE [BOD] > SAME IN [DEX] > SAME TOE [DEL]' },
  { slug: 'stepping-diving-butterfly', adds: 5, terminal: 'OP CLIP [XBD] [DEL]',   notation: 'CLIP > OP IN [DEX] > DIVE [BOD] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'stepping-ducking-drifter',  adds: 5, terminal: 'SAME CLIP [XBD] [DEL]', notation: 'CLIP > OP IN [DEX] > DUCK [BOD] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'stepping-paradox-torque',   adds: 6, terminal: 'OP CLIP [XBD] [DEL]',   notation: 'CLIP > OP IN [DEX] >> SAME IN [PDX] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]' },
  { slug: 'spinning-symposium-flux',   adds: 6, terminal: 'OP CLIP [XBD] [DEL]',   notation: 'TOE > (back) SPIN [BOD] > (no plant while) SAME OUT [BOD] [DEX] > (front) SPIN [BOD] > OP CLIP [XBD] [DEL]' },
  { slug: 'bigwalk',                   adds: 5, terminal: 'OP CLIP [XBD] [DEL]',   notation: 'CLIP > (back) SPIN [BOD] > SAME IN [DEX] >> SAME OUT [DEX] > OP CLIP [XBD] [DEL]' },
] as const;

const ADD_TOKEN   = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;
const ANY_BRACKET = /\[[^\]]+\]/g;
const SET_SURFACE = /^(SET|CLIP|TOE|KNEE|INSIDE|OUTSIDE|SOLE)\b/;

const csvLines = readFileSync(
  join(process.cwd(), 'legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv'),
  'utf8',
).split(/\r?\n/);

describe('side-flip ruling derived operational notation', () => {
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
