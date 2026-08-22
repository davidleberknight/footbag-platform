import { describe, it, expect } from 'vitest';
import { OBSERVATIONAL_UNIVERSE } from '../../src/content/freestyleObservationalUniverse';

// A curator-ready row is one a curator can finish into a dictionary entry without
// reconstructing the movement from sources or footage. Identity and arithmetic do
// not reach that bar on their own: operator composition reliably gives the ADD but
// generally not the notation, because no operator has a single insertion chassis --
// entry surface and dex sides vary with the base. Readiness is therefore derived
// from the evidence basis, never set by hand, so arithmetic certainty cannot
// masquerade as structural certainty.

const NOTATION_BACKED = new Set([
  'exact-notation', 'verified-footage', 'authoritative-prose', 'derivable-notation',
]);

const decide = OBSERVATIONAL_UNIVERSE.filter(
  r => r.publicSection === 'decide' && r.groupPrimary,
);

describe('Decide-now readiness', () => {
  it('every decide row carries exactly one readiness state', () => {
    for (const r of decide) {
      expect(['curator-ready', 'notation-authoring-required', 'unresolved'], r.name)
        .toContain(r.readiness);
    }
  });

  it('readiness is set only inside the decide section', () => {
    const stray = OBSERVATIONAL_UNIVERSE.filter(
      r => r.publicSection !== 'decide' && r.readiness !== '',
    );
    expect(stray.map(r => r.name)).toEqual([]);
  });

  it('a row is never curator-ready without notation-backed evidence', () => {
    for (const r of decide.filter(x => x.readiness === 'curator-ready')) {
      expect(NOTATION_BACKED.has(r.evidenceState), `${r.name} (${r.evidenceState})`).toBe(true);
    }
  });

  it('a notation-authoring row never claims notation-backed evidence', () => {
    for (const r of decide.filter(x => x.readiness === 'notation-authoring-required')) {
      expect(NOTATION_BACKED.has(r.evidenceState), `${r.name} (${r.evidenceState})`).toBe(false);
    }
  });

  it('an empty curator-ready set is a consumed batch, not a regression', () => {
    // The first ready batch -- the swirl-chain eight plus the two flapper rows --
    // was promoted, so this set is legitimately empty. It refills only when a row
    // gains notation-backed evidence, never from arithmetic alone, which is what
    // the two invariants above enforce. A count is therefore not asserted here.
    const ready = decide.filter(r => r.readiness === 'curator-ready');
    for (const r of ready) expect(NOTATION_BACKED.has(r.evidenceState), r.name).toBe(true);
  });

  it('the promoted batch has left the decide section', () => {
    const promoted = [
      'Barfly Reverse Swirl', 'Butterfly Flapper', 'Butterfly Reverse Swirl',
      'Drifter Swirl', 'Nemesis Swirl', 'Paradon Reverse Swirl', 'Ripwalk Swirl',
      'Sidewalk Swirl', 'Stepping Butterfly Reverse Swirl', 'Symposium Whirling Flapper',
    ];
    const names = new Set(decide.map(r => r.name));
    expect(promoted.filter(n => names.has(n))).toEqual([]);
  });

  it('Pixie near Double Down stays isolated as unresolved', () => {
    const unresolved = decide.filter(r => r.readiness === 'unresolved').map(r => r.name);
    expect(unresolved).toEqual(['Pixie near Double Down']);
  });
});
