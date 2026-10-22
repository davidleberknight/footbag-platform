/**
 * When a scheduled job is due and when it is overdue.
 *
 * Due decides whether a tick runs the job: a daily job once per UTC day at
 * whatever hour the first tick falls, an interval job once its interval has
 * passed since its last success, a job that has never succeeded at once, and a
 * failed job no sooner than its retry spacing. Overdue decides the missed-run
 * alarm: longer than cadence plus grace without a success.
 */
import { describe, it, expect } from 'vitest';
import {
  isJobDue,
  isJobOverdue,
  JOB_TICK_MS,
  type JobTiming,
} from '../../src/lib/jobSchedule';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const daily: JobTiming = { name: 'SYS_Daily', cadence: { kind: 'daily' } };
const everySevenDays: JobTiming = {
  name: 'SYS_Weekly', cadence: { kind: 'interval', everyMs: () => 7 * DAY },
};
const everyFiveMinutes: JobTiming = {
  name: 'SYS_Frequent', cadence: { kind: 'interval', everyMs: () => 5 * MIN },
};

const at = (iso: string) => new Date(iso);
const success = (iso: string) => ({ lastSuccessAt: iso, lastStartedAt: iso });

describe('a daily job', () => {
  it('is due at once when it has never run, so a new job does not wait a day', () => {
    expect(isJobDue(daily, undefined, at('2026-07-21T00:03:00.000Z'))).toBe(true);
  });

  it('runs once per UTC day: not again the same day, and on the next day at any hour', () => {
    // A same-day rerun would repeat every mail and provider call the job makes;
    // a next-day tick refused because of the hour would skip a whole day.
    const last = success('2026-07-21T00:05:00.000Z');
    expect(isJobDue(daily, last, at('2026-07-21T23:59:00.000Z'))).toBe(false);
    expect(isJobDue(daily, last, at('2026-07-22T00:00:30.000Z'))).toBe(true);
    expect(isJobDue(daily, last, at('2026-07-22T17:00:00.000Z'))).toBe(true);
  });

  it('catches up after an outage on the first tick back', () => {
    const last = success('2026-07-18T00:05:00.000Z');
    expect(isJobDue(daily, last, at('2026-07-21T09:00:00.000Z'))).toBe(true);
  });

  it('waits an hour after a failed attempt before retrying, then retries the same day', () => {
    // Retrying on every five-minute tick would repeat the failing provider call
    // and its error alarm all day.
    const last = {
      lastSuccessAt: '2026-07-20T00:05:00.000Z',
      lastStartedAt: '2026-07-21T00:05:00.000Z',
    };
    expect(isJobDue(daily, last, at('2026-07-21T00:50:00.000Z'))).toBe(false);
    expect(isJobDue(daily, last, at('2026-07-21T01:05:00.000Z'))).toBe(true);
  });

  it('treats a never-succeeded job that failed recently as waiting, not due', () => {
    const last = { lastSuccessAt: null, lastStartedAt: '2026-07-21T00:05:00.000Z' };
    expect(isJobDue(daily, last, at('2026-07-21T00:10:00.000Z'))).toBe(false);
  });
});

describe('an interval job', () => {
  it('runs only once its interval has passed since its last success', () => {
    const last = success('2026-07-21T03:00:00.000Z');
    expect(isJobDue(everySevenDays, last, at('2026-07-28T02:59:59.999Z'))).toBe(false);
    // Exactly one interval on: due, so a five-minute job runs on every tick
    // rather than every other one.
    expect(isJobDue(everySevenDays, last, at('2026-07-28T03:00:00.000Z'))).toBe(true);
  });

  it('retries a failure on its own cadence when that is shorter than an hour', () => {
    const last = {
      lastSuccessAt: '2026-07-21T03:00:00.000Z',
      lastStartedAt: '2026-07-21T03:05:00.000Z',
    };
    expect(isJobDue(everyFiveMinutes, last, at('2026-07-21T03:09:00.000Z'))).toBe(false);
    expect(isJobDue(everyFiveMinutes, last, at('2026-07-21T03:10:00.000Z'))).toBe(true);
  });
});

describe('overdue', () => {
  it('flags a daily job only after a day plus two hours without a success', () => {
    const last = success('2026-07-21T00:05:00.000Z');
    expect(isJobOverdue(daily, last, at('2026-07-22T02:04:00.000Z'), null)).toBe(false);
    // Exactly at the limit is still on time; only past it is overdue.
    expect(isJobOverdue(daily, last, at('2026-07-22T02:05:00.000Z'), null)).toBe(false);
    expect(isJobOverdue(daily, last, at('2026-07-22T02:06:00.000Z'), null)).toBe(true);
  });

  it('allows an interval job three missed ticks before it is overdue', () => {
    const last = success('2026-07-21T03:00:00.000Z');
    const limit = 5 * MIN + 3 * JOB_TICK_MS;
    const base = Date.parse('2026-07-21T03:00:00.000Z');
    expect(isJobOverdue(everyFiveMinutes, last, new Date(base + limit - MIN), null)).toBe(false);
    expect(isJobOverdue(everyFiveMinutes, last, new Date(base + limit + MIN), null)).toBe(true);
  });

  it('judges a never-succeeded job from when the worker started', () => {
    // A job that never once succeeds would otherwise never trip the alarm.
    const started = at('2026-07-21T00:00:00.000Z');
    expect(isJobOverdue(daily, undefined, at('2026-07-22T01:00:00.000Z'), started)).toBe(false);
    expect(isJobOverdue(daily, undefined, at('2026-07-22T03:00:00.000Z'), started)).toBe(true);
  });

  it('leaves a never-succeeded job out when the caller cannot know the worker start', () => {
    expect(isJobOverdue(daily, undefined, at('2030-01-01T00:00:00.000Z'), null)).toBe(false);
  });
});
