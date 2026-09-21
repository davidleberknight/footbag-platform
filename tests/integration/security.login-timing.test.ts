/**
 * Regression: login response time must not leak email existence.
 *
 * Before the fix, verifyMemberCredentials returned null immediately on
 * absent-email lookup, skipping argon2.verify (300-600 ms typical). The
 * present-email branch always paid argon2 cost. A timing observer could
 * reliably distinguish registered emails from unregistered.
 *
 * After the fix, the absent-email branch performs a phantom argon2.verify
 * against a constant dummy hash. Both branches now incur argon2 cost.
 *
 * This test asserts a behavioural floor with no fixed millisecond constant:
 * one argon2 verify is measured in this process as a baseline, interleaved
 * with the logins it gates so both are timed under the same load, and both
 * branches must cost at least three quarters of it, so the floor scales with
 * the machine and with whatever else the suite is running beside it. The
 * absent-email branch must also stay in the same order of magnitude as the
 * present-email branch (ratio within 4x). A regression that re-introduces
 * the immediate return on the absent-email branch does no argon2 work at
 * all, so it fails both assertions on any machine at any load.
 *
 * Anti-enumeration contract: existing and non-existing accounts must be
 * indistinguishable from the outside.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import argon2 from 'argon2';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3094');

// This file must run at production argon2 cost. The absent-email branch
// verifies against a dummy hash built through the app's own hashing helper,
// which reads the cheap-cost switch frozen into config at import, while the
// present-email branch verifies a hash this file builds with argon2 directly
// and therefore always pays full cost. Configured cheap, the absent branch
// returns in no time and the floor fails for a reason that looks like
// flakiness. So force strong before the app graph is imported, and assert it
// in beforeAll rather than trusting it: the runner uses a worker-thread pool,
// and a precondition that is checked names itself when it breaks.
process.env.FOOTBAG_CHEAP_PASSWORD_HASH = '0';

const KNOWN_EMAIL = 'timing-test-known@example.com';
const ABSENT_EMAIL = 'timing-test-absent@example.com';
const WRONG_PASSWORD = 'definitely-not-the-real-password';
const KNOWN_PASSWORD = 'CorrectPassword123!';

let createApp: Awaited<ReturnType<typeof importApp>>;
// Hashed once in the setup hook and verified against inside each test's own
// sampling loop. Building it is not the measurement; only the verify is.
let argonProbe: string;

// Every duration here comes from the monotonic clock rather than the wall
// clock. Both the baseline and the login timings are elapsed intervals, and a
// wall clock is free to jump: a host that steps its time while an interval is
// open hands back a duration short by that step, or a negative one, which
// arrives as a floor failure reading like a login that skipped argon2 entirely.
// The monotonic clock cannot be stepped, so a failure here is about the code.
function elapsedMsSince(start: number): number {
  return performance.now() - start;
}

// The floor, measured rather than hardcoded: one argon2 verify at the cost the
// login path pays. A constant would be a statement about the author's machine.
//
// Measured beside the samples it gates, never once up front. A baseline taken
// in the setup hook is a reading of the most contended moment of the run, when
// every other file in the tier is importing, while the logins it is compared
// against are timed later under whatever load remains. Nothing in the code has
// to be wrong for the two to disagree: this file failed at an absent-email
// median of 131.9 ms against a 203 ms baseline while both branches were doing
// identical work. Interleaving the two puts them under the same load, so the
// comparison is about the code again.
async function timeOneArgonVerify(probe: string): Promise<number> {
  const start = performance.now();
  await argon2.verify(probe, 'wrong-password');
  return elapsedMsSince(start);
}

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const hash = await argon2.hash(KNOWN_PASSWORD);
  insertMember(db, {
    id: 'member-timing-test',
    slug: 'timing_test',
    login_email: KNOWN_EMAIL,
    display_name: 'Timing Test',
    password_hash: hash,
    email_verified_at: '2026-01-01T00:00:00.000Z',
  });
  db.close();
  createApp = await importApp();
  const { config } = await import('../../src/config/env');
  expect(
    config.useCheapPasswordHash,
    'precondition: this file must run at production argon2 cost, or the absent-email floor means nothing',
  ).toBe(false);
  argonProbe = await argon2.hash('baseline-probe');
}, 30000);

afterAll(() => cleanupTestDb(dbPath));

async function timeLogin(email: string, password: string): Promise<number> {
  const app = createApp();
  const start = performance.now();
  await request(app)
    .post('/login')
    .type('form')
    .send({ email, password });
  return elapsedMsSince(start);
}

describe('login wall-clock equalisation (anti-enumeration)', () => {
  it('absent-email login does argon2 work (not an immediate return)', async () => {
    // Warm-up call to amortise module load / lazy adapter init.
    await timeLogin(ABSENT_EMAIL, WRONG_PASSWORD);

    // One bare verify per absent-email login, alternated, so both medians come
    // out of the same stretch of wall clock and the same machine load.
    const baselineSamples: number[] = [];
    const absentSamples: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      baselineSamples.push(await timeOneArgonVerify(argonProbe));
      absentSamples.push(await timeLogin(ABSENT_EMAIL, WRONG_PASSWORD));
    }
    const baseline = median(baselineSamples);

    // Floor: a login that bypasses argon2 pays only the HTTP round trip, while
    // one that does the work pays that plus a full verify, so three quarters of
    // the measured baseline sits between the two outcomes at any load.
    expect(
      median(absentSamples),
      `absent-email login must pay argon2 cost (baseline ${baseline.toFixed(0)} ms)`,
    ).toBeGreaterThan((baseline * 3) / 4);
  });

  it('absent-email and present-email-wrong-password login wall-clock are in the same order of magnitude', async () => {
    // Warm-up.
    await timeLogin(KNOWN_EMAIL, WRONG_PASSWORD);
    await timeLogin(ABSENT_EMAIL, WRONG_PASSWORD);

    // Sample N times for each path, take median to dampen jitter. The bare
    // verify is sampled in the same rotation for the reason given on
    // timeOneArgonVerify: a floor measured in a different stretch of time from
    // the thing it gates is a reading of the load, not of the code.
    const N = 3;
    const baselineSamples: number[] = [];
    const presentSamples: number[] = [];
    const absentSamples: number[] = [];
    for (let i = 0; i < N; i += 1) {
      baselineSamples.push(await timeOneArgonVerify(argonProbe));
      presentSamples.push(await timeLogin(KNOWN_EMAIL, WRONG_PASSWORD));
      absentSamples.push(await timeLogin(ABSENT_EMAIL, WRONG_PASSWORD));
    }
    const baseline      = median(baselineSamples);
    const presentMedian = median(presentSamples);
    const absentMedian  = median(absentSamples);

    // Both medians sit above the same measured floor as the case above.
    expect(
      presentMedian,
      `present-email login must pay argon2 cost (baseline ${baseline.toFixed(0)} ms)`,
    ).toBeGreaterThan((baseline * 3) / 4);
    expect(
      absentMedian,
      `absent-email login must pay argon2 cost (baseline ${baseline.toFixed(0)} ms)`,
    ).toBeGreaterThan((baseline * 3) / 4);

    // Ratio bound: neither path should be >4x the other. Generous tolerance
    // accommodates CI jitter; tightening risks flake. The bug would push
    // the ratio toward >20x (immediate return vs full argon2).
    const ratio = Math.max(presentMedian / absentMedian, absentMedian / presentMedian);
    expect(ratio).toBeLessThan(4);
  });
});
