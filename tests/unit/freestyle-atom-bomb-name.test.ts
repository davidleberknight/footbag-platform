/**
 * Flailing Symposium Mirage is Atom Bomb's name, not a second trick.
 *
 * FootbagMoves gives Flailing Symposium Mirage as Atom Bomb's technical name and
 * Shred Global prints the two as one entry. Its count is still open: 6 if the
 * written symposium is a second no-plant action, 4 if it only restates the
 * flailing set. So the name resolves to Atom Bomb and stays hidden while that
 * question is open, and no separate candidate proposes it at 4.
 *
 * These read the committed curator inputs, so a regression fails without a
 * built database.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(REPO_ROOT, ...parts), 'utf8').split('\n');

const ledger = read('freestyle', 'inputs', 'observational', 'EV_FORMULA_IDENTITY_ROWS.csv');
const additions = read('freestyle', 'inputs', 'curated', 'tricks', 'red_additions_2026_04_20.csv');
const overrides = read('freestyle', 'inputs', 'base_dictionary', 'alias_overrides.csv');

describe('Flailing Symposium Mirage resolves to Atom Bomb', () => {
  // Defect caught: the name kept as its own candidate and authored as a 4-ADD
  // trick beside Atom Bomb, so one movement gets two dictionary entries.
  // The proposed formula and note are the ruling's history and stay as recorded;
  // what decides the outcome is the state, disposition and matched trick.
  it('is ruled an alias of Atom Bomb, not a trick to author', () => {
    const row = ledger.find(l => l.startsWith('Flailing Symposium Mirage,'))?.split(',');
    expect(row, 'the ruling is missing').toBeDefined();
    expect(row![3]).toBe('atom_bomb');
    expect(row![4]).toBe('name-or-alias-resolution');
    expect(row![5], 'the name is still queued for authoring').toBe('alias');
    expect(row![8]).toBe('A');
  });

  // Defect caught: a search for the name finding nothing, or the name shown on
  // Atom Bomb's page as if its count were settled.
  it('is carried on Atom Bomb and held hidden pending the count', () => {
    const atomBomb = additions.find(l => l.startsWith('atom bomb,'))?.split(',');
    expect(atomBomb?.[4].split('|')).toContain('flailing symposium mirage');
    const ov = overrides.find(l => l.startsWith('flailing_symposium_mirage,'));
    expect(ov?.split(',').slice(1, 4)).toEqual(['retype', 'structural', '0']);
    expect(ov).toContain('Pending ruling:');
  });
});
