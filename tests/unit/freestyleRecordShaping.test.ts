import { describe, it, expect } from 'vitest';
import { slugToHashtag } from '../../src/services/freestyleRecordShaping';

describe('slugToHashtag', () => {
  it('returns "#mirage" for "mirage"', () => {
    expect(slugToHashtag('mirage')).toBe('#mirage');
  });

  it('strips hyphens for compound slugs', () => {
    expect(slugToHashtag('double-legover')).toBe('#doublelegover');
    expect(slugToHashtag('atom-smasher')).toBe('#atomsmasher');
  });

  it('lowercases mixed-case input', () => {
    expect(slugToHashtag('Atom-Smasher')).toBe('#atomsmasher');
  });

  it('handles multi-hyphen slugs', () => {
    expect(slugToHashtag('reverse-around-the-world')).toBe('#reversearoundtheworld');
  });
});
