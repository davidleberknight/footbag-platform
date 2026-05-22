/**
 * Unit tests for getAdjacentArchiveYears (eventService internal helper).
 *
 * Regression for B24: the helper previously assumed its `archiveYears`
 * input was DESC-ordered. The current caller `listPublicArchiveYears()`
 * returns DESC, but a future change to ASC would have silently inverted
 * previousYear (older) and nextYear (newer) on every event-archive page.
 * The defensive sort inside the helper makes the result independent of
 * the caller's ordering.
 */
import { describe, it, expect } from 'vitest';
import { getAdjacentArchiveYears } from '../../src/services/eventService';

describe('getAdjacentArchiveYears', () => {
  it('returns previousYear (older) and nextYear (newer) for a year in the middle (DESC input)', () => {
    expect(getAdjacentArchiveYears([2024, 2023, 2022], 2023)).toEqual({
      previousYear: 2022,
      nextYear: 2024,
    });
  });

  it('returns the same result regardless of input ordering (ASC vs DESC)', () => {
    const desc = getAdjacentArchiveYears([2024, 2023, 2022], 2023);
    const asc = getAdjacentArchiveYears([2022, 2023, 2024], 2023);
    const scrambled = getAdjacentArchiveYears([2023, 2024, 2022], 2023);
    expect(asc).toEqual(desc);
    expect(scrambled).toEqual(desc);
  });

  it('returns nextYear=null at the newest year (top of the archive)', () => {
    expect(getAdjacentArchiveYears([2024, 2023, 2022], 2024)).toEqual({
      previousYear: 2023,
      nextYear: null,
    });
  });

  it('returns previousYear=null at the oldest year (bottom of the archive)', () => {
    expect(getAdjacentArchiveYears([2024, 2023, 2022], 2022)).toEqual({
      previousYear: null,
      nextYear: 2023,
    });
  });

  it('returns both null when the year is not in the archive', () => {
    expect(getAdjacentArchiveYears([2024, 2023, 2022], 2099)).toEqual({
      previousYear: null,
      nextYear: null,
    });
  });

  it('returns both null for a single-year archive', () => {
    expect(getAdjacentArchiveYears([2024], 2024)).toEqual({
      previousYear: null,
      nextYear: null,
    });
  });

  it('does not mutate the caller-supplied array', () => {
    const input = [2022, 2024, 2023];
    const before = [...input];
    getAdjacentArchiveYears(input, 2023);
    expect(input).toEqual(before);
  });
});
