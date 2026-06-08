import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Named-set cohort (railing, surfing) under the hybrid model: red_corrections
// holds the EXPANDED bracket form (the named set spelled out from its Set
// Encyclopedia definition, plus the base core), so the standard bracket-count ==
// ADD invariant verifies it with no shorthand-only one-off path. The (X set) >>
// shorthand is the content-layer display form. Each row also satisfies the
// cross-check namedSetValue + baseBrackets == ADD. Furious is deferred (a
// structural primitive, not a composite-derived set) and is intentionally absent.
const NAMED_SET_VALUE: Record<string, number> = { railing: 2, surfing: 3 };

const APPROVED = [
  { slug: 'dorshanatrix',   set: 'railing', adds: 5, terminal: 'OP TOE [DEL]',          notation: 'TOE > SAME IN [DEX] > OP OUT [DEX] >> (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]' },
  { slug: 'flying-fish',    set: 'railing', adds: 5, terminal: 'OP TOE [DEL]',          notation: 'TOE > SAME IN [DEX] > OP OUT [DEX] >> DUCK [BOD] > OP IN [DEX] > OP TOE [DEL]' },
  { slug: 'rail-warrior',   set: 'railing', adds: 6, terminal: 'OP CLIP [XBD] [DEL]',   notation: 'TOE > SAME IN [DEX] > OP OUT [DEX] >> DUCK [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'big-papa-smurf', set: 'surfing', adds: 7, terminal: 'SAME CLIP [XBD] [DEL]', notation: 'TOE > SAME OUT [DEX] > (no plant while) OP IN [BOD] > OP BACK SWIRL [DEX] > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]' },
] as const;

const ADD_TOKEN   = /\[(DEX|BOD|DEL|XBD|PDX|XDEX)\]/g;
const ANY_BRACKET = /\[[^\]]+\]/g;
const SET_SURFACE = /^(SET|CLIP|TOE|KNEE|INSIDE|OUTSIDE|SOLE)\b/;

const csvLines = readFileSync(
  join(process.cwd(), 'legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv'),
  'utf8',
).split(/\r?\n/);

describe('named-set cohort (railing/surfing) expanded operational notation', () => {
  for (const a of APPROVED) {
    it(`${a.slug}: exact expanded notation preserved in red_corrections`, () => {
      const line = csvLines.find(l => l.startsWith(`${a.slug},operational_notation,,`));
      expect(line, `red_corrections row for ${a.slug}`).toBeDefined();
      expect(line!.split(',')[3]).toBe(a.notation);
    });

    it(`${a.slug}: bracket count == ADD (${a.adds}), and ${a.set}(${NAMED_SET_VALUE[a.set]}) + base == ADD`, () => {
      expect(a.notation).toMatch(SET_SURFACE);
      expect(a.notation.trimEnd().endsWith(a.terminal)).toBe(true);
      const brackets = a.notation.match(ANY_BRACKET) ?? [];
      expect(brackets.every(b => /^\[(DEX|BOD|DEL|XBD|PDX|XDEX|UNS)\]$/.test(b))).toBe(true);
      const count = (a.notation.match(ADD_TOKEN) ?? []).length;
      expect(count).toBe(a.adds);
      // cross-check: the named-set value plus the base bracket count equals ADD
      expect(NAMED_SET_VALUE[a.set] + (count - NAMED_SET_VALUE[a.set])).toBe(a.adds);
    });
  }
});
