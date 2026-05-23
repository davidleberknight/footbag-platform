import { describe, it, expect } from 'vitest';
import { slugToHashtag } from '../../src/services/freestyleRecordShaping';

describe('slugToHashtag', () => {
  it('returns "#mirage" for "mirage"', () => {
    expect(slugToHashtag('mirage')).toBe('#mirage');
  });

  it('converts hyphens to underscores for compound slugs', () => {
    expect(slugToHashtag('double-legover')).toBe('#double_legover');
    expect(slugToHashtag('atom-smasher')).toBe('#atom_smasher');
  });

  it('lowercases mixed-case input', () => {
    expect(slugToHashtag('Atom-Smasher')).toBe('#atom_smasher');
  });

  it('handles multi-hyphen slugs', () => {
    expect(slugToHashtag('reverse-around-the-world')).toBe('#reverse_around_the_world');
  });
});
