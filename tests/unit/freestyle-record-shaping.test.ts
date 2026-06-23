import { describe, it, expect } from 'vitest';
import { trickNameToSlug } from '../../src/services/freestyleRecordShaping';

// Records link to tricks by name through this slugifier. A positional qualifier
// is structural, not lexical, so the slugifier preserves it (it is NOT stripped),
// matching the loader's slug derivation. Whether a positional name resolves to the
// base, to another canonical, or to a new trick is decided by configuration, not
// by this lexical step.
describe('trickNameToSlug', () => {
  it('preserves a positional qualifier so app resolution agrees with the loader', () => {
    expect(trickNameToSlug('Clipper Stall (ss)')).toBe('clipper-stall-ss');
    expect(trickNameToSlug('Dyno (op)')).toBe('dyno-op');
    expect(trickNameToSlug('Double Leg Over (ss)')).toBe('double-leg-over-ss');
    expect(trickNameToSlug('Rev Whirl (op)')).toBe('rev-whirl-op');
    expect(trickNameToSlug('Symposium Swirl (op)')).toBe('symposium-swirl-op');
  });

  it('leaves a bare trick name unchanged', () => {
    expect(trickNameToSlug('Whirl')).toBe('whirl');
    // The juggle is a lexical variant, not a side qualifier: still unresolved
    // by the slugifier alone (it needs an alias wire).
    expect(trickNameToSlug('2-Bag Juggle')).toBe('2-bag-juggle');
  });

  it('does not strip a non-qualifier parenthetical', () => {
    expect(trickNameToSlug('Foo (bar)')).toBe('foo-bar');
  });
});
