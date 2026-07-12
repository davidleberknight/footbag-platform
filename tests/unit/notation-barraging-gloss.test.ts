/**
 * The BARRAGING notation-token gloss must not present Barraging as an
 * independently scored operator: it is a historical naming pattern for the
 * Furious set (+2), not a +1 body modifier. It also must not merge Barraging
 * into Furious globally; scoring resolves to Furious only where a trick's
 * structure is ruled Furious.
 */
import { describe, it, expect } from 'vitest';

import { buildNotationLookupContext, shapeNotationDisplay } from '../../src/services/notationRendering';

function barragingGloss(): string {
  const ctx = buildNotationLookupContext([], [], []);
  const display = shapeNotationDisplay('barraging', ctx);
  const token = display?.tokens.find(t => t.text.toLowerCase() === 'barraging');
  expect(token, 'the barraging token should carry a gloss label').toBeDefined();
  return token!.label;
}

describe('BARRAGING notation-token gloss', () => {
  it('does not score barraging as an independent +1 body modifier', () => {
    const label = barragingGloss();
    expect(label).not.toMatch(/body modifier/i);
    expect(label).not.toMatch(/\+\s*1\s*ADD/i);
  });

  it('names Furious as the scored set (+2) that decomposition resolves to', () => {
    const label = barragingGloss();
    expect(label).toMatch(/furious/i);
    expect(label).toMatch(/\+\s*2/);
  });
});
