import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Foundational/core tricks carry aliases two ways, both merged by the trick
// dictionary loader: the inline `aliases` column in tricks.csv, and the
// dedicated trick_aliases.csv (`alias,trick_canon`). This guards the four
// abbreviation/folk aliases that the PassBack reconciliation depends on.
const NOISE = 'legacy_data/inputs/noise';

const tricks = readFileSync(join(process.cwd(), `${NOISE}/tricks.csv`), 'utf8').split(/\r?\n/);
const aliasCsv = readFileSync(join(process.cwd(), `${NOISE}/trick_aliases.csv`), 'utf8').split(/\r?\n/);

// canonical names present in tricks.csv (trick_canon column)
const trickCanons = new Set(
  tricks.slice(1).map(l => l.split(',')[0]).filter(Boolean),
);
// inline aliases keyed by trick_canon
const inlineAliases = (canon: string): string[] => {
  const row = tricks.find(l => l.startsWith(`${canon},`));
  return row ? (row.split(',')[4] ?? '').split('|').map(a => a.trim()).filter(Boolean) : [];
};
// dedicated alias -> trick_canon
const dedicated = new Map(
  aliasCsv.slice(1).map(l => l.split(',')).filter(p => p.length >= 2).map(p => [p[0].trim(), p[1].trim()]),
);

describe('foundational trick aliases', () => {
  it('DLO and DATW are inline aliases in tricks.csv (existing wiring)', () => {
    expect(inlineAliases('double leg over')).toContain('dlo');
    expect(inlineAliases('double around the world')).toContain('datw');
  });

  it('DSO and clipper-kick are wired via trick_aliases.csv to valid canonicals', () => {
    expect(dedicated.get('dso')).toBe('double leg over');
    expect(dedicated.get('clipper kick')).toBe('clipper');
    // targets must be real canonical names so the loader resolves, not logs unresolved
    expect(trickCanons.has('double leg over')).toBe(true);
    expect(trickCanons.has('clipper')).toBe(true);
  });
});
