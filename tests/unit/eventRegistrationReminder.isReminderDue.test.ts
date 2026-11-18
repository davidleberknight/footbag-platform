/**
 * When the pre-event reminder is due: from the configured number of whole UTC
 * days before the start date until the day before it, never on or after the
 * start date, and never for a window of zero or fewer days.
 */
import { describe, it, expect } from 'vitest';
import { isReminderDue } from '../../src/services/eventRegistrationReminderService';

const START = '2031-05-10';

describe('isReminderDue', () => {
  it('opens on the first day of the window, counted in UTC days', () => {
    // A registrant seven days out would get no reminder if the window opened a day late.
    expect(isReminderDue(START, '2031-05-03T00:00:00.000Z', 7)).toBe(true);
    expect(isReminderDue(START, '2031-05-03T23:59:59.999Z', 7)).toBe(true);
    // A reminder sent eight days out would arrive earlier than the setting says.
    expect(isReminderDue(START, '2031-05-02T23:59:59.999Z', 7)).toBe(false);
  });

  it('stays due through the day before the start, so a missed day still sends', () => {
    // A pass that skipped the first day would otherwise never remind anyone.
    expect(isReminderDue(START, '2031-05-06T12:00:00.000Z', 7)).toBe(true);
    expect(isReminderDue(START, '2031-05-09T23:00:00.000Z', 7)).toBe(true);
  });

  it('is never due on or after the start date', () => {
    // A reminder arriving on the day, or after the event, tells the member nothing useful.
    expect(isReminderDue(START, '2031-05-10T00:00:00.000Z', 7)).toBe(false);
    expect(isReminderDue(START, '2031-05-11T12:00:00.000Z', 7)).toBe(false);
  });

  it('opens nothing for a window of zero or fewer days', () => {
    // A zero setting would otherwise remind on every pass up to the start.
    expect(isReminderDue(START, '2031-05-09T12:00:00.000Z', 0)).toBe(false);
    expect(isReminderDue(START, '2031-05-09T12:00:00.000Z', -3)).toBe(false);
  });
});
