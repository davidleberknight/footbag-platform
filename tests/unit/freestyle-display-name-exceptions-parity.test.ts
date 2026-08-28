/**
 * The naming exceptions the application compiles in, against the curated file
 * where the curator actually records them.
 *
 * The curated file carries each decision and its reason and is what the content
 * pipeline reads. The deployed image does not ship that subtree, so the running
 * application cannot read it and compiles a mirror instead. That mirror is data,
 * not a second rule, and it is only safe while the two agree: a curator adding
 * an exception in the curated file and not the mirror would produce a name the
 * pipeline accepts and the admin save refuses, which is the worst of both.
 *
 * Asserted in both directions, because either drift is a bug: an exception the
 * application does not know about, and one it grants that no curator recorded.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  DISPLAY_NAME_ROW_EXCEPTIONS,
  GENUINE_HYPHEN_TOKENS,
} from '../../src/content/freestyleDisplayNameExceptions';

const CURATED = join(
  __dirname, '..', '..',
  'freestyle', 'inputs', 'curated', 'tricks', 'display_name_exceptions.csv',
);

/**
 * The curated file, parsed far enough for this comparison.
 *
 * The reason column is quoted free text carrying commas, so the split respects
 * quoting: a naive comma split would truncate a value and make the comparison
 * fail on rows that actually agree.
 */
function curated(): { rows: Map<string, string>; tokens: string[] } {
  const rows = new Map<string, string>();
  const tokens: string[] = [];
  const lines = readFileSync(CURATED, 'utf8').split('\n').slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = '';
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') { quoted = !quoted; continue; }
      if (ch === ',' && !quoted) { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    const [kind, key, value] = cells;
    if (kind === 'row') rows.set(key, value);
    else if (kind === 'token') tokens.push(key);
  }
  return { rows, tokens };
}

describe('the compiled naming exceptions mirror the curated file', () => {
  it('grants exactly the row exceptions the curator recorded', () => {
    const { rows } = curated();
    expect([...DISPLAY_NAME_ROW_EXCEPTIONS.keys()].sort()).toEqual([...rows.keys()].sort());
  });

  it('grants each of them the same display name, character for character', () => {
    const { rows } = curated();
    for (const [slug, name] of rows) {
      expect(DISPLAY_NAME_ROW_EXCEPTIONS.get(slug), `${slug} differs from the curated file`)
        .toBe(name);
    }
  });

  it('knows exactly the genuine-hyphen tokens the curator approved', () => {
    expect([...GENUINE_HYPHEN_TOKENS].sort()).toEqual(curated().tokens.sort());
  });

  it('reads a non-trivial file, so an empty parse cannot pass every case above', () => {
    // Without this, a parser that returned nothing would satisfy all three by
    // agreeing with an equally empty mirror.
    const { rows, tokens } = curated();
    expect(rows.size).toBeGreaterThan(5);
    expect(tokens.length).toBeGreaterThan(0);
  });
});
