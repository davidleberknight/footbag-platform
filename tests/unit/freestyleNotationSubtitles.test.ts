import { describe, it, expect } from 'vitest';
import { getNotationSubtitle, NOTATION_SUBTITLES } from '../../src/content/freestyleNotationSubtitles';

// The Movement-notation section subtitle is a trick-specific curator gloss, not
// generic boilerplate. Tricks with no entry render no subtitle at all (the
// template guards on a non-null value).
describe('notation subtitles — trick-specific Movement-notation gloss', () => {
  it('returns the curator gloss for seeded tricks', () => {
    expect(getNotationSubtitle('bubba')).toBe('Clipper-set illusion.');
    expect(getNotationSubtitle('miraging-kick')).toBe('Mirage-style dex ending in a kick.');
  });

  it('returns null for tricks with no entry (no generic filler)', () => {
    expect(getNotationSubtitle('mirage')).toBeNull();
    expect(getNotationSubtitle('nonexistent-slug')).toBeNull();
  });

  it('every gloss is a non-empty, trick-specific string (never the old boilerplate)', () => {
    for (const [slug, text] of Object.entries(NOTATION_SUBTITLES)) {
      expect(text.length, slug).toBeGreaterThan(0);
      expect(text, slug).not.toMatch(/Notation and equivalent readings/i);
    }
  });
});
