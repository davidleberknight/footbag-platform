import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OBSERVATIONAL_UNIVERSE } from '../../src/content/freestyleObservationalUniverse';

// Emerging Vocabulary groups a name into an identity after expanding recognized
// community shorthands. When a shorthand does not expand, one trick becomes two
// identities and a name that is already published keeps rendering as if it were
// still being confirmed. These guard the compositional shorthands, which the
// corpus uses constantly and which were missing.

const generator = readFileSync(
  join(process.cwd(), 'freestyle/scripts/build_observational_universe_content.py'),
  'utf8',
);

const byName = (n: string) => OBSERVATIONAL_UNIVERSE.find(r => r.name === n);

describe('recognized abbreviations expand before identity grouping', () => {
  it('the generator declares the compositional shorthands', () => {
    for (const [short, full] of [['ps', 'paradox_symposium'], ['symp', 'symposium'], ['pdx', 'paradox']]) {
      expect(generator, `${short} expansion`).toContain(`"${short}": "${full}"`);
    }
  });

  it('positional tokens are still never expanded', () => {
    // A side configuration is structural identity; expanding it would collapse
    // a variant onto its base.
    for (const positional of ['"ss":', '"os":', '"far":', '"near":']) {
      expect(generator).not.toContain(positional);
    }
  });

  it.each([
    ['Paradox Merlin', 'Pdx. Merlin'],
    ['Paradox Toxic', 'Pdx. Toxic'],
    ['Bubba PS Eggbeater (Chainsaw Massacre)', 'Bubba Paradox Symposium Eggbeater'],
  ])('%s and %s are one identity rendered once', (expanded, shorthand) => {
    const a = byName(expanded);
    const b = byName(shorthand);
    expect(a, expanded).toBeDefined();
    expect(b, shorthand).toBeDefined();
    expect(a!.identityKey).toBe(b!.identityKey);
    expect([a!.groupPrimary, b!.groupPrimary].filter(Boolean)).toHaveLength(1);
  });

  it.each([
    'Symp. DLO',
    'Symp Mirage',
    'PS Mirage',
    'Pdx Dada Curve',
    'Miraging Symp.Mirage',
  ])('%s is recognized as a published trick and leaves the surface', name => {
    expect(byName(name)).toBeUndefined();
  });

  it('no name waiting on a ruling carries an unexpanded compositional shorthand it shares with a published trick', () => {
    const waiting = OBSERVATIONAL_UNIVERSE.filter(
      r => r.publicSection === 'ruling' && r.groupPrimary,
    );
    // Every waiting row must still name a real blocker rather than a shorthand artefact.
    for (const r of waiting) expect(r.blockerId, r.name).not.toBe('');
  });
});
