/**
 * Settled butterfly-dex coordinates in the three set-on-butterfly compounds.
 *
 * The curator ruled the first butterfly dex in fairy butterfly, whirling
 * butterfly, and swirling butterfly as OP OUT, replacing the provisional
 * either-side placeholder. These tests pin the settled coordinate at every
 * authoritative source so the placeholder cannot return after a rebuild, and
 * keep the dex relation distinct from the separately-authored terminal
 * clipper relation. No set teaching page claims the base runs unchanged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..', '..');
const CORRECTIONS = readFileSync(
  path.join(REPO, 'freestyle', 'inputs', 'curated', 'tricks', 'red_corrections_2026_04_20.csv'),
  'utf-8',
);
const EDUCATION = readFileSync(
  path.join(REPO, 'src', 'services', 'symbolicSetEducation.ts'),
  'utf-8',
);

// Both historical slug spellings appear in the corrections file.
const SLUG_FORMS = [
  ['fairy-butterfly', 'fairy_butterfly'],
  ['whirling-butterfly', 'whirling_butterfly'],
  ['swirling-butterfly', 'swirling_butterfly'],
] as const;

function notationRows(forms: readonly string[]): string[] {
  return CORRECTIONS.split('\n').filter(line =>
    forms.some(f => line.startsWith(`${f},operational_notation,`)),
  );
}

describe('curated corrections carry the settled OP OUT butterfly dex', () => {
  for (const forms of SLUG_FORMS) {
    it(`${forms[1]}: every notation row has OP OUT and no either-side placeholder`, () => {
      const rows = notationRows(forms);
      expect(rows.length, `no operational_notation correction found for ${forms[1]}`).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row).not.toContain('SAME/OP');
        expect(row).toContain('OP OUT [DEX]');
        // Terminal clipper relation is separately authored and retained.
        expect(row).toContain('OP CLIP [XBD] [DEL]');
      }
    });
  }
});

describe('set teaching copy states the authored-in-compound coordinate doctrine', () => {
  it('no set page claims the base dexterity runs unchanged', () => {
    expect(EDUCATION).not.toMatch(/runs unchanged|then unchanged|base is unchanged/);
  });
});
