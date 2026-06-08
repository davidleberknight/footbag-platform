import { describe, it, expect } from 'vitest';
import { trickNameToSlug } from '../../src/services/freestyleRecordShaping';

// Records link to tricks by name through this slugifier. A trailing side
// qualifier must not change the slug, or a record named "Clipper Stall (ss)"
// points at a non-existent clipper-stall-ss page in both directions.
describe('trickNameToSlug', () => {
  it('strips a trailing side qualifier so a record resolves to its base trick', () => {
    expect(trickNameToSlug('Clipper Stall (ss)')).toBe('clipper-stall');
    expect(trickNameToSlug('Dyno (op)')).toBe('dyno');
    expect(trickNameToSlug('Double Leg Over (ss)')).toBe('double-leg-over');
    expect(trickNameToSlug('Rev Whirl (op)')).toBe('rev-whirl');
    expect(trickNameToSlug('Symposium Swirl (op)')).toBe('symposium-swirl');
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
