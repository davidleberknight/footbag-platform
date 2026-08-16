/**
 * Pure-function tests for the SYS_Check_Active_Player_Expiry offset decision.
 * Covers UTC day-boundary math and the pre-expiry offset windows. The decision
 * looks strictly forward: the message for the expiry date itself is the day-of
 * ending notice, which the expiry pass sends, not a reminder this function
 * selects.
 */
import { describe, it, expect } from 'vitest';
import {
  daysUntilUtcDay,
  decideReminderDue,
  type OffsetSpec,
} from '../../src/services/activePlayerExpiryService';

const DEFAULT_OFFSETS: OffsetSpec[] = [
  { label: 'days_1', days: 30 },
  { label: 'days_2', days: 7  },
];

describe('daysUntilUtcDay', () => {
  it('same UTC day at different times returns 0', () => {
    expect(daysUntilUtcDay('2099-09-15T23:59:59.000Z', '2099-09-15T00:00:01.000Z')).toBe(0);
  });

  it('expires tomorrow returns 1', () => {
    expect(daysUntilUtcDay('2099-09-16T00:00:00.000Z', '2099-09-15T23:00:00.000Z')).toBe(1);
  });

  it('expires yesterday returns -1', () => {
    expect(daysUntilUtcDay('2099-09-14T00:00:00.000Z', '2099-09-15T01:00:00.000Z')).toBe(-1);
  });

  it('30 days forward returns 30', () => {
    expect(daysUntilUtcDay('2099-10-15T12:00:00.000Z', '2099-09-15T12:00:00.000Z')).toBe(30);
  });

  it('invalid ISO throws', () => {
    expect(() => daysUntilUtcDay('not-a-date', '2099-09-15T00:00:00.000Z')).toThrow();
  });
});

describe('decideReminderDue', () => {
  it('T+0 returns null: the expiry date carries the ending notice, not a reminder', () => {
    const r = decideReminderDue(
      '2099-09-15T08:00:00.000Z',
      '2099-09-15T18:00:00.000Z',
      DEFAULT_OFFSETS,
    );
    expect(r).toBeNull();
  });

  it('T+0 returns null even before the expiry timestamp that same day', () => {
    const r = decideReminderDue(
      '2099-09-15T18:00:00.000Z',
      '2099-09-15T08:00:00.000Z',
      DEFAULT_OFFSETS,
    );
    expect(r).toBeNull();
  });

  it('T-30 matches days_1', () => {
    const r = decideReminderDue(
      '2099-10-15T12:00:00.000Z',
      '2099-09-15T12:00:00.000Z',
      DEFAULT_OFFSETS,
    );
    expect(r).toEqual({ label: 'days_1', days: 30 });
  });

  it('T-7 matches days_2', () => {
    const r = decideReminderDue(
      '2099-09-22T12:00:00.000Z',
      '2099-09-15T12:00:00.000Z',
      DEFAULT_OFFSETS,
    );
    expect(r).toEqual({ label: 'days_2', days: 7 });
  });

  it('T-15 (between offsets) returns null', () => {
    const r = decideReminderDue(
      '2099-09-30T12:00:00.000Z',
      '2099-09-15T12:00:00.000Z',
      DEFAULT_OFFSETS,
    );
    expect(r).toBeNull();
  });

  it('T-1 (post-pre-expiry, pre-day-of) returns null', () => {
    const r = decideReminderDue(
      '2099-09-16T12:00:00.000Z',
      '2099-09-15T12:00:00.000Z',
      DEFAULT_OFFSETS,
    );
    expect(r).toBeNull();
  });

  it('T+1 (one day past expiry) returns null (no late-after-day-of reminder)', () => {
    const r = decideReminderDue(
      '2099-09-15T12:00:00.000Z',
      '2099-09-16T12:00:00.000Z',
      DEFAULT_OFFSETS,
    );
    expect(r).toBeNull();
  });

  it('admin-customized single offset is honored', () => {
    const r = decideReminderDue(
      '2099-09-29T12:00:00.000Z',
      '2099-09-15T12:00:00.000Z',
      [{ label: 'days_1', days: 14 }],
    );
    expect(r).toEqual({ label: 'days_1', days: 14 });
  });

  it('a configured offset of 0 is ignored, so no reminder fires on the expiry date', () => {
    const r = decideReminderDue(
      '2099-09-15T12:00:00.000Z',
      '2099-09-15T00:00:00.000Z',
      [{ label: 'days_1', days: 0 }],
    );
    expect(r).toBeNull();
  });

  it('a configured negative offset is ignored', () => {
    const r = decideReminderDue(
      '2099-09-14T12:00:00.000Z',
      '2099-09-15T12:00:00.000Z',
      [{ label: 'days_1', days: -1 }],
    );
    expect(r).toBeNull();
  });
});
