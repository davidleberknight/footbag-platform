/**
 * Pixie Over Down and the POD abbreviation.
 *
 * Pixie Over Down is the two-dexterity trick at 4 ADD: the pixie dexterity is
 * the first down and the leg returns for one downtime over. POD is
 * FootbagMoves' abbreviation for Pixie ss Double Over Down, whose three-dex
 * notation it prints exactly, so a search for POD lands on Pixie Double Over
 * Down.
 *
 * These read the committed curator inputs, so a regression fails without a
 * built database.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESOLVED_ADD_FORMULAS } from '../../freestyle/inputs/curator_content/freestyleResolvedFormulas';

const REPO_ROOT = join(__dirname, '..', '..');
const TRICKS = join(REPO_ROOT, 'freestyle', 'inputs', 'curated', 'tricks');
const additions = readFileSync(join(TRICKS, 'red_additions_2026_04_20.csv'), 'utf8').split('\n');
const corrections = readFileSync(join(TRICKS, 'red_corrections_2026_04_20.csv'), 'utf8').split('\n');

const aliasesOf = (name: string) =>
  (additions.find(l => l.startsWith(`${name},`))?.split(',')[4] ?? '').split('|');

describe('the POD abbreviation', () => {
  // Defect caught: a search for POD landing on the two-dex trick, when the one
  // source that prints the abbreviation gives it to the three-dex trick.
  it('belongs to Pixie Double Over Down, not Pixie Over Down', () => {
    expect(aliasesOf('pixie double over down')).toContain('pod');
    expect(aliasesOf('pixie over down')).not.toContain('pod');
  });
});

describe('Pixie Over Down', () => {
  // Defect caught: the trick's page showing no breakdown, or one that does not
  // add up to its 4 ADD.
  it('carries a breakdown that sums to its 4 ADD', () => {
    const f = RESOLVED_ADD_FORMULAS.find(r => r.slug === 'pixie_over_down');
    expect(f, 'no breakdown').toBeDefined();
    const terms = [...f!.derivation.split('=')[0].matchAll(/\(\+?(\d+)\)/g)].map(m => Number(m[1]));
    expect(terms.reduce((a, b) => a + b, 0)).toBe(4);
    expect(f!.derivation).toMatch(/= 4 ADD$/);
  });

  // Defect caught: the page still flagging the count as under review after the
  // footage ruling settled it.
  it('carries no definition-under-review notice', () => {
    expect(corrections.filter(l => /^pixie[-_]over[-_]down,review_aspect,/.test(l))).toEqual([]);
  });
});
