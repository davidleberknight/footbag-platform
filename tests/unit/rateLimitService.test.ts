import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  hit,
  resetRateLimitForTests,
  rateLimitBucketCountForTests,
} from '../../src/services/rateLimitService';

beforeEach(() => {
  resetRateLimitForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('rateLimitService.hit', () => {
  it('allows the first hit', () => {
    const r = hit('k1', 3, 5);
    expect(r.allowed).toBe(true);
    expect(r.retryAfterSeconds).toBeUndefined();
  });

  it('allows hits up to maxAttempts within the window', () => {
    expect(hit('k', 3, 5).allowed).toBe(true);
    expect(hit('k', 3, 5).allowed).toBe(true);
    expect(hit('k', 3, 5).allowed).toBe(true);
  });

  it('blocks the N+1 hit within the window and reports retryAfterSeconds', () => {
    for (let i = 0; i < 5; i++) hit('k', 5, 1);
    const blocked = hit('k', 5, 1);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('resets the window after windowMinutes elapses', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-17T12:00:00Z'));
    for (let i = 0; i < 3; i++) hit('k', 3, 5);
    expect(hit('k', 3, 5).allowed).toBe(false);

    vi.setSystemTime(new Date('2026-04-17T12:05:01Z'));
    const afterWindow = hit('k', 3, 5);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.retryAfterSeconds).toBeUndefined();
  });

  it('tracks keys independently', () => {
    for (let i = 0; i < 3; i++) hit('a', 3, 5);
    expect(hit('a', 3, 5).allowed).toBe(false);
    expect(hit('b', 3, 5).allowed).toBe(true);
  });

  it('resetRateLimitForTests clears all buckets', () => {
    for (let i = 0; i < 3; i++) hit('k', 3, 5);
    expect(hit('k', 3, 5).allowed).toBe(false);
    resetRateLimitForTests();
    expect(hit('k', 3, 5).allowed).toBe(true);
  });

  it('rejects invalid maxAttempts', () => {
    expect(() => hit('k', 0, 5)).toThrow();
    expect(() => hit('k', -1, 5)).toThrow();
  });

  it('rejects invalid windowMinutes', () => {
    expect(() => hit('k', 3, 0)).toThrow();
    expect(() => hit('k', 3, -5)).toThrow();
  });
});

// Keys are built partly from unauthenticated input, so anyone able to reach a
// login form can create entries at will. Without a bound the map grows for the
// life of the process.
describe('bucket store bounds', () => {
  it('drops buckets whose window has closed instead of holding them for ever', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 1500; i += 1) hit(`sweep-${i}`, 3, 5);
    expect(rateLimitBucketCountForTests()).toBeGreaterThan(1000);

    // Past the window, so every one of those buckets is now expired; the next
    // batch of writes sweeps them.
    vi.setSystemTime(new Date('2026-01-01T00:30:00Z'));
    for (let i = 0; i < 1000; i += 1) hit(`later-${i}`, 3, 5);
    expect(rateLimitBucketCountForTests()).toBeLessThanOrEqual(1100);
  });

  it('never grows past its ceiling, even while every window is still open', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    // A long window, so nothing expires and only the hard ceiling can bound it.
    for (let i = 0; i < 60_000; i += 1) hit(`flood-${i}`, 3, 600);
    expect(rateLimitBucketCountForTests()).toBeLessThanOrEqual(50_000);
  });

  it('discards idle keys ahead of a live block when it reaches the ceiling', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 3; i += 1) hit('blocked', 3, 600);
    expect(hit('blocked', 3, 600).allowed).toBe(false);

    // A blocked bucket never refreshes the moment its window opened, so it is
    // the oldest entry in the store. Flooding fresh keys past the ceiling must
    // not clear it: whoever can afford the flood would otherwise be buying
    // themselves a fresh window on the limit that is refusing them.
    for (let i = 0; i < 60_000; i += 1) hit(`flood-${i}`, 3, 600);

    expect(rateLimitBucketCountForTests()).toBeLessThanOrEqual(50_000);
    expect(hit('blocked', 3, 600).allowed).toBe(false);
  });
});

// One store holds every action's buckets, and the actions do not share a window:
// account-level login limits and password-reset limits run for an hour while
// member search runs for a minute. Whichever caller happens to trigger the
// amortised sweep must not impose its own window on anyone else's buckets.
describe('buckets with unequal windows in one store', () => {
  it('keeps an hour-long block through a sweep driven by minute-long traffic', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 3; i += 1) hit('account', 3, 60);
    expect(hit('account', 3, 60).allowed).toBe(false);

    // Twenty minutes on, ordinary minute-window traffic crosses the sweep
    // threshold. The hour-long bucket is far older than a minute and far short
    // of its own expiry, so it has to survive.
    vi.setSystemTime(new Date('2026-01-01T00:20:00Z'));
    for (let i = 0; i < 1200; i += 1) hit(`search-${i}`, 5, 1);

    expect(hit('account', 3, 60).allowed).toBe(false);
  });

  it('still expires a bucket once its own window closes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 3; i += 1) hit('account', 3, 60);
    expect(hit('account', 3, 60).allowed).toBe(false);

    vi.setSystemTime(new Date('2026-01-01T01:00:01Z'));
    expect(hit('account', 3, 60).allowed).toBe(true);
  });
});

// A cooldown is a lockout that outlives the window which counted up to it.
// Without one, the refusal lasts only the window's remainder, so exhausting the
// attempts late in a window costs an attacker seconds while doing it early costs
// them the whole window. Callers that pass no cooldown keep the older behaviour
// exactly, which is what lets one shared limiter serve both.
describe('cooldown after the ceiling', () => {
  it('keeps refusing past the end of the counting window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 3; i += 1) hit('login', 3, 15, 30);
    expect(hit('login', 3, 15, 30).allowed).toBe(false);

    // The 15-minute counting window has closed. Without the cooldown this is
    // where the bucket would reopen.
    vi.setSystemTime(new Date('2026-01-01T00:15:01Z'));
    expect(hit('login', 3, 15, 30).allowed).toBe(false);
  });

  it('releases once the cooldown itself has run', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 3; i += 1) hit('login', 3, 15, 30);
    expect(hit('login', 3, 15, 30).allowed).toBe(false);

    vi.setSystemTime(new Date('2026-01-01T00:30:01Z'));
    const released = hit('login', 3, 15, 30);
    expect(released.allowed).toBe(true);
    expect(released.retryAfterSeconds).toBeUndefined();
  });

  it('runs the cooldown from the attempt that crossed the ceiling, not the window start', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    hit('login', 3, 15, 30);

    // Two more attempts ten minutes into the window take it to the ceiling, so
    // the lockout should end at 00:40 rather than at 00:30.
    vi.setSystemTime(new Date('2026-01-01T00:10:00Z'));
    hit('login', 3, 15, 30);
    hit('login', 3, 15, 30);
    expect(hit('login', 3, 15, 30).allowed).toBe(false);

    vi.setSystemTime(new Date('2026-01-01T00:30:01Z'));
    expect(hit('login', 3, 15, 30).allowed).toBe(false);

    vi.setSystemTime(new Date('2026-01-01T00:40:01Z'));
    expect(hit('login', 3, 15, 30).allowed).toBe(true);
  });

  it('reports retryAfterSeconds against the cooldown rather than the window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 3; i += 1) hit('login', 3, 15, 30);
    const blocked = hit('login', 3, 15, 30);
    expect(blocked.allowed).toBe(false);
    // The window has 15 minutes left; the cooldown has 30.
    expect(blocked.retryAfterSeconds).toBe(30 * 60);
  });

  it('starts the cooldown on the opening attempt when the ceiling is one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    expect(hit('single', 1, 15, 30).allowed).toBe(true);

    vi.setSystemTime(new Date('2026-01-01T00:15:01Z'));
    expect(hit('single', 1, 15, 30).allowed).toBe(false);

    vi.setSystemTime(new Date('2026-01-01T00:30:01Z'));
    expect(hit('single', 1, 15, 30).allowed).toBe(true);
  });

  it('leaves a caller that passes no cooldown on the window alone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 3; i += 1) hit('plain', 3, 15);
    expect(hit('plain', 3, 15).allowed).toBe(false);

    vi.setSystemTime(new Date('2026-01-01T00:15:01Z'));
    expect(hit('plain', 3, 15).allowed).toBe(true);
  });

  it('rejects a non-positive cooldown rather than silently ignoring it', () => {
    expect(() => hit('k', 3, 5, 0)).toThrow();
    expect(() => hit('k', 3, 5, -1)).toThrow();
  });

  it('does not evict a bucket still serving its cooldown', () => {
    // The eviction path forgives idle buckets ahead of live blocks. A bucket
    // whose counting window has closed but whose cooldown has not is still a
    // live block, and dropping it would hand back the lockout early.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 3; i += 1) hit('locked', 3, 1, 600);
    expect(hit('locked', 3, 1, 600).allowed).toBe(false);

    // Well past the one-minute counting window, ordinary traffic floods the
    // store past its ceiling and drives both the sweep and the eviction.
    vi.setSystemTime(new Date('2026-01-01T00:05:00Z'));
    for (let i = 0; i < 60_000; i += 1) hit(`flood-${i}`, 3, 600);

    expect(hit('locked', 3, 1, 600).allowed).toBe(false);
  });
});
