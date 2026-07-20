/**
 * Settled butterfly-dex coordinates in the three set-on-butterfly compounds.
 *
 * The curator ruled the first butterfly dex in fairy butterfly, whirling
 * butterfly, and swirling butterfly as OP OUT, replacing the provisional
 * either-side placeholder. These tests pin the settled coordinate at every
 * authoritative source so the placeholder cannot return after a rebuild, and
 * keep the dex relation distinct from the separately-authored terminal
 * clipper relation. The set teaching pages state the authored-in-compound
 * coordinate doctrine rather than claiming the base runs unchanged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

import { RESOLVED_ADD_FORMULAS } from '../../src/content/freestyleResolvedFormulas';

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

describe('the resolved-formula content module carries the settled coordinate', () => {
  it('whirling_butterfly notation has OP OUT for the butterfly dex, no placeholder', () => {
    const entry = RESOLVED_ADD_FORMULAS.find(f => f.slug === 'whirling_butterfly');
    expect(entry, 'whirling_butterfly missing from resolved formulas').toBeDefined();
    expect(entry!.operationalNotation).not.toContain('SAME/OP');
    expect(entry!.operationalNotation).toContain('OP OUT [DEX]');
    expect(entry!.operationalNotation).toContain('OP CLIP [XBD] [DEL]');
  });

  it('no resolved-formula entry for the three compounds carries the placeholder', () => {
    for (const slug of ['fairy_butterfly', 'whirling_butterfly', 'swirling_butterfly']) {
      for (const f of RESOLVED_ADD_FORMULAS.filter(x => x.slug === slug)) {
        expect(f.operationalNotation, slug).not.toContain('SAME/OP');
      }
    }
  });
});

describe('set teaching copy states the authored-in-compound coordinate doctrine', () => {
  it('no set page claims the base dexterity runs unchanged', () => {
    expect(EDUCATION).not.toMatch(/runs unchanged|then unchanged|base is unchanged/);
  });

  it('every launch-notes doctrine statement uses the authored-in-compound wording', () => {
    const doctrine =
      'authored within the complete compound relative to the most recent preceding side-bearing component';
    const count = EDUCATION.split(doctrine).length - 1;
    expect(count).toBeGreaterThanOrEqual(11);
  });

  it('the three settled butterfly examples appear on their set pages', () => {
    expect(EDUCATION).toContain("Fairy Butterfly retains Butterfly\\'s OP OUT");
    expect(EDUCATION).toContain("Whirling Butterfly retains Butterfly\\'s OP OUT");
    expect(EDUCATION).toContain("Swirling Butterfly retains Butterfly\\'s OP OUT");
  });

  it('retained and re-authored examples both appear, so no universal claim is implied', () => {
    expect(EDUCATION).toContain("Stepping Whirl retains Whirl\\'s OP IN");
    expect(EDUCATION).toContain("Magellan authors Legover\\'s outward dex as SAME OUT");
    expect(EDUCATION).toContain("Floatation authors Butterfly\\'s dex as SAME OUT");
    expect(EDUCATION).toContain("Big Papa Smurf retains Blender\\'s OP IN");
    expect(EDUCATION).toContain('Tapdown remains the established Tapping re-authoring precedent');
  });
});
