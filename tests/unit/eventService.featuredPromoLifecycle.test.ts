/**
 * The featured event card retires itself when its event has finished.
 *
 * The card is hand-authored ahead of an event and reads in the future tense,
 * which is true until the day the event ends and false every day after. Nothing
 * in the copy can know that, so the dates the card already carries decide, and
 * the comparison is by calendar day: an event still features on its final day
 * and stops the next morning. Without this, a finished event keeps announcing
 * itself as upcoming until somebody edits the source.
 */
import { describe, it, expect } from 'vitest';
import { isFeaturedPromoCurrent } from '../../src/services/eventService';

// A five-day event, the shape the card is written for.
const END = '2026-08-15';

describe('isFeaturedPromoCurrent', () => {
  it('features an event that has not started', () => {
    expect(isFeaturedPromoCurrent(END, '2026-07-01T09:00:00.000Z')).toBe(true);
  });

  it('features an event that is running', () => {
    expect(isFeaturedPromoCurrent(END, '2026-08-12T09:00:00.000Z')).toBe(true);
  });

  it('still features on the final day, which is part of the event', () => {
    expect(isFeaturedPromoCurrent(END, '2026-08-15T23:59:59.000Z')).toBe(true);
  });

  it('stops featuring the morning after the event ends', () => {
    expect(isFeaturedPromoCurrent(END, '2026-08-16T00:00:01.000Z')).toBe(false);
  });

  it('stops featuring well after the event', () => {
    expect(isFeaturedPromoCurrent(END, '2026-12-31T12:00:00.000Z')).toBe(false);
  });

  it('does not read a later year as still upcoming', () => {
    expect(isFeaturedPromoCurrent(END, '2027-01-01T00:00:00.000Z')).toBe(false);
  });
});
