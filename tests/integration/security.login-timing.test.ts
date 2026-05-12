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
 * This test asserts a behavioural floor: both branches take meaningful
 * wall-clock time (>= 30 ms, well below argon2's normal 100-300 ms range)
 * AND the absent-email branch is in the same order of magnitude as the
 * present-email branch (ratio within 4x). A regression that re-introduces
 * the immediate return on the absent-email branch would drop absent-email
 * timing to <5 ms (no argon2 work), failing both assertions.
 *
 * Anti-enumeration contract per DD §3.3.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import argon2 from 'argon2';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3094');

const KNOWN_EMAIL = 'timing-test-known@example.com';
const ABSENT_EMAIL = 'timing-test-absent@example.com';
const WRONG_PASSWORD = 'definitely-not-the-real-password';
const KNOWN_PASSWORD = 'CorrectPassword123!';

let createApp: Awaited<ReturnType<typeof importApp>>;

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
}, 30000);

afterAll(() => cleanupTestDb(dbPath));

async function timeLogin(email: string, password: string): Promise<number> {
  const app = createApp();
  const start = Date.now();
  await request(app)
    .post('/login')
    .type('form')
    .send({ email, password });
  return Date.now() - start;
}

describe('login wall-clock equalisation (anti-enumeration)', () => {
  it('absent-email login does argon2 work (not an immediate return)', async () => {
    // Warm-up call to amortise module load / lazy adapter init.
    await timeLogin(ABSENT_EMAIL, WRONG_PASSWORD);

    const absentTime = await timeLogin(ABSENT_EMAIL, WRONG_PASSWORD);
    // Floor: any login that bypasses argon2 returns in <5 ms. argon2 hash
    // verification is at least ~30 ms even on fast machines.
    expect(absentTime).toBeGreaterThan(30);
  }, 15000);

  it('absent-email and present-email-wrong-password login wall-clock are in the same order of magnitude', async () => {
    // Warm-up.
    await timeLogin(KNOWN_EMAIL, WRONG_PASSWORD);
    await timeLogin(ABSENT_EMAIL, WRONG_PASSWORD);

    // Sample N times for each path, take median to dampen jitter.
    const N = 3;
    const presentSamples: number[] = [];
    const absentSamples: number[] = [];
    for (let i = 0; i < N; i += 1) {
      presentSamples.push(await timeLogin(KNOWN_EMAIL, WRONG_PASSWORD));
      absentSamples.push(await timeLogin(ABSENT_EMAIL, WRONG_PASSWORD));
    }
    presentSamples.sort((a, b) => a - b);
    absentSamples.sort((a, b) => a - b);
    const presentMedian = presentSamples[Math.floor(N / 2)];
    const absentMedian  = absentSamples[Math.floor(N / 2)];

    // Both medians should be well above the no-argon2 floor.
    expect(presentMedian).toBeGreaterThan(30);
    expect(absentMedian).toBeGreaterThan(30);

    // Ratio bound: neither path should be >4x the other. Generous tolerance
    // accommodates CI jitter; tightening risks flake. The bug would push
    // the ratio toward >20x (immediate return vs full argon2).
    const ratio = Math.max(presentMedian / absentMedian, absentMedian / presentMedian);
    expect(ratio).toBeLessThan(4);
  }, 30000);
});
