import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Fairy-family derivations written into red_corrections under the ratified fairy
// default separator (TOE > SAME OUT [DEX] > ...). Each set-swap case is an additive
// fairy entry composed with a base that folds its other modifiers; genuphobia is
// backfilled from the authoritative content layer (its spyro spin is absent from
// the modifier-link table). Must parse, open with the fairy entry on a single >,
// close on its asserted family terminal, have ADD equal to its token count, and
// survive verbatim in the source.
const APPROVED = [
  { slug: 'fairy-drifter',              adds: 4, terminal: 'SAME CLIP [XBD] [DEL]', notation: 'TOE > SAME OUT [DEX] > OP IN [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'fairy-guay',                 adds: 3, terminal: 'SAME INSIDE [DEL]',     notation: 'TOE > SAME OUT [DEX] > OP IN [DEX] > SAME INSIDE [DEL]' },
  { slug: 'fairy-gyro-drifter',         adds: 5, terminal: 'SAME CLIP [XBD] [DEL]', notation: 'TOE > SAME OUT [DEX] > (back) SPIN [BOD] > SAME IN [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'fairy-illusion',             adds: 3, terminal: 'OP TOE [DEL]',          notation: 'TOE > SAME OUT [DEX] > OP OUT [DEX] > OP TOE [DEL]' },
  { slug: 'fairy-rev-whirl',            adds: 4, terminal: 'OP CLIP [XBD] [DEL]',   notation: 'TOE > SAME OUT [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'fairy-torque',               adds: 5, terminal: 'OP CLIP [XBD] [DEL]',   notation: 'TOE > SAME OUT [DEX] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]' },
  { slug: 'fairy-spinning-ducking-osis', adds: 6, terminal: 'SAME CLIP [XBD] [DEL]', notation: 'TOE > SAME OUT [DEX] > (back) SPIN [BOD] > DUCK [BOD] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]' },
  { slug: 'fairy-swirling-swirl',       adds: 5, terminal: 'SAME CLIP [XBD] [DEL]', notation: 'TOE > SAME OUT [DEX] > SAME BACK SWIRL [DEX] > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'genuphobia',                 adds: 7, terminal: 'OP CLIP [XBD] [DEL]',   notation: 'TOE > SAME OUT [DEX] > (front) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]' },
] as const;

const ADD_TOKEN   = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;
const ANY_BRACKET = /\[[^\]]+\]/g;
const FAIRY_ENTRY = /^TOE > SAME OUT \[DEX\] > /; // single > default, never >>

const csvLines = readFileSync(
  join(process.cwd(), 'freestyle/inputs/curated/tricks/red_corrections_2026_04_20.csv'),
  'utf8',
).split(/\r?\n/);

describe('fairy-family derived operational notation', () => {
  for (const a of APPROVED) {
    it(`${a.slug}: exact notation preserved in red_corrections`, () => {
      const line = csvLines.find(l => l.startsWith(`${a.slug},operational_notation,,`));
      expect(line, `red_corrections row for ${a.slug}`).toBeDefined();
      expect(line!.split(',')[3]).toBe(a.notation);
    });

    it(`${a.slug}: opens with fairy '>' entry, closes on ${a.terminal}, ADD equals ${a.adds}`, () => {
      expect(a.notation).toMatch(FAIRY_ENTRY);
      expect(a.notation.trimEnd().endsWith(a.terminal)).toBe(true);
      const brackets = a.notation.match(ANY_BRACKET) ?? [];
      expect(brackets.every(b => /^\[(DEX|BOD|DEL|XBD|PDX|XDEX|UNS)\]$/.test(b))).toBe(true);
      expect((a.notation.match(ADD_TOKEN) ?? []).length).toBe(a.adds);
    });
  }
});
