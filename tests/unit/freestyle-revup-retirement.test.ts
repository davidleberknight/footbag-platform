/**
 * Revup is the same movement as the canonical reverse swirling pickup (an outside
 * source expands Revup as Reverse Swirling Pickup), so it is retired as a duplicate:
 * the reverse swirling pickup row survives, the separate whirl-family rev-up row is
 * removed from the base dictionary, and the Revup / Rev Up / Rev-Up names resolve to
 * the survivor as aliases. This pins that retirement in the committed inputs so a
 * second canonical row for the same movement cannot reappear.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

const TRICKS = read('freestyle/inputs/base_dictionary/tricks.csv');
const SOURCE_ALIASES = read('freestyle/inputs/base_dictionary/trick_aliases.csv');
const ALIAS_ADDITIONS = read('freestyle/inputs/base_dictionary/alias_additions.csv');
const OVERRIDES = read('freestyle/inputs/base_dictionary/alias_overrides.csv');

describe('Revup is retired as a duplicate of reverse swirling pickup', () => {
  it('the base dictionary no longer defines a separate rev-up canonical row', () => {
    expect(TRICKS).not.toMatch(/^rev up,/m);
  });

  it('drops the stale source-loader aliases that pointed rev-up at itself', () => {
    expect(SOURCE_ALIASES).not.toMatch(/^rev-up,rev up$/m);
    expect(SOURCE_ALIASES).not.toMatch(/^revup,rev up$/m);
    expect(OVERRIDES).not.toMatch(/^revup,/m);
  });

  it('routes the Revup and Rev Up names to the surviving reverse swirling pickup', () => {
    expect(ALIAS_ADDITIONS).toMatch(/^Revup,reverse_swirling_pickup,/m);
    expect(ALIAS_ADDITIONS).toMatch(/^Rev Up,reverse_swirling_pickup,/m);
  });
});
