import { describe, it, expect } from 'vitest';
import { getSectionSubtitles, DETAIL_SECTION_KEYS } from '../../src/content/freestyleSectionSubtitles';

// Per-(section, trick) detail-page subtitles: a section renders its subtitle
// only when curator copy exists for that trick; otherwise null (no boilerplate).
describe('section subtitles — per-(section, trick) detail-page gloss', () => {
  it('returns the curator gloss for seeded (section, trick) pairs', () => {
    expect(getSectionSubtitles('bubba').movementNotation).toBe('Clipper-set illusion.');
    expect(getSectionSubtitles('spin').executionNotation).toBe('Standalone body turn ending in a kick action.');
    expect(getSectionSubtitles('miraging_kick').executionNotation).toBe('Mirage dex pattern that resolves to a kick instead of a delay.');
    expect(getSectionSubtitles('torque').equivalentReadings).toBe('Canonical and historical ways this move has been analyzed.');
    expect(getSectionSubtitles('mobius').equivalentReadings).toBe('Compressed gyro-torque reading, then expanded source-style readings.');
  });

  it('returns null for every section of a trick with no entries (no boilerplate)', () => {
    const subs = getSectionSubtitles('nonexistent-slug');
    for (const key of DETAIL_SECTION_KEYS) expect(subs[key], key).toBeNull();
  });

  it('a seeded trick still returns null for its un-authored sections', () => {
    const bubba = getSectionSubtitles('bubba');
    expect(bubba.movementNotation).toBe('Clipper-set illusion.');
    expect(bubba.executionNotation).toBeNull();
    expect(bubba.equivalentReadings).toBeNull();
  });

  it('every gloss is a non-empty trick-specific string', () => {
    for (const slug of ['bubba', 'spin', 'miraging_kick', 'torque', 'mobius']) {
      const vals = DETAIL_SECTION_KEYS
        .map(k => getSectionSubtitles(slug)[k])
        .filter((v): v is string => v !== null);
      expect(vals.length, slug).toBeGreaterThan(0);
      for (const v of vals) expect(v.length).toBeGreaterThan(0);
    }
  });
});
