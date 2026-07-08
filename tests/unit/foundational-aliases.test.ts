import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Foundational/core tricks carry aliases three ways, all merged by the trick
// dictionary loaders: the inline `aliases` column in tricks.csv, the dedicated
// trick_aliases.csv (`alias,trick_canon`), and the inline `aliases` column in
// red_additions. This guards the abbreviation/folk aliases the PassBack
// reconciliation depends on, including the DLO/DSO distinction: DLO is Double
// Leg Over, DSO is Double Switch-Over, and the two must resolve to different
// tricks.
const NOISE = 'freestyle/inputs/noise';
const RED_ADD = 'freestyle/inputs/curated/tricks/red_additions_2026_04_20.csv';

const tricks = readFileSync(join(process.cwd(), `${NOISE}/tricks.csv`), 'utf8').split(/\r?\n/);
const aliasCsv = readFileSync(join(process.cwd(), `${NOISE}/trick_aliases.csv`), 'utf8').split(/\r?\n/);
const redAdd = readFileSync(join(process.cwd(), RED_ADD), 'utf8').split(/\r?\n/);

// canonical names present in tricks.csv (trick_canon column)
const trickCanons = new Set(
  tricks.slice(1).map(l => l.split(',')[0]).filter(Boolean),
);
// canonical names present in red_additions (canonical_name column)
const redAddCanons = new Set(
  redAdd.slice(1).map(l => l.split(',')[0]).filter(Boolean),
);
// inline aliases (column 5) keyed by canonical name, for either source CSV
const inlineAliasesFrom = (rows: string[]) => (canon: string): string[] => {
  const row = rows.find(l => l.startsWith(`${canon},`));
  return row ? (row.split(',')[4] ?? '').split('|').map(a => a.trim()).filter(Boolean) : [];
};
const inlineAliases = inlineAliasesFrom(tricks);
const redInlineAliases = inlineAliasesFrom(redAdd);
// dedicated alias -> trick_canon
const dedicated = new Map(
  aliasCsv.slice(1).map(l => l.split(',')).filter(p => p.length >= 2).map(p => [p[0].trim(), p[1].trim()]),
);

describe('foundational trick aliases', () => {
  it('DLO and DATW are inline aliases in tricks.csv (existing wiring)', () => {
    expect(inlineAliases('double leg over')).toContain('dlo');
    expect(inlineAliases('double around the world')).toContain('datw');
  });

  it('clipper-kick is wired via trick_aliases.csv to a valid canonical', () => {
    expect(dedicated.get('clipper kick')).toBe('clipper');
    expect(trickCanons.has('clipper')).toBe(true);
  });

  it('DSO resolves to Double Switch-Over, distinct from DLO (Double Leg Over)', () => {
    // dso is an inline alias on the red_additions double-switch-over row; dlo
    // stays on double-leg-over. The two abbreviations must not collide.
    expect(redInlineAliases('double switch over')).toContain('dso');
    expect(redAddCanons.has('double switch over')).toBe(true);
    expect(inlineAliases('double leg over')).toContain('dlo');
    expect(inlineAliases('double leg over')).not.toContain('dso');
  });
});
