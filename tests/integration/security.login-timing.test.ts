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
 * The contract is proved structurally, with no clock: both branches run exactly
 * one argon2 verify against hashes of the same cost. Equal work is what makes
 * the two indistinguishable, and a regression that re-introduces the immediate
 * return, a second verify, or a cheaper dummy hash fails it. No wall-clock
 * timing is asserted, because a timing comparison's verdict moves with machine
 * load and so cannot be a test here.
 *
 * Anti-enumeration contract: existing and non-existing accounts must be
 * indistinguishable from the outside.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import argon2 from 'argon2';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3094');

// This file must run at production argon2 cost. The absent-email branch
// verifies against a dummy hash built through the app's own hashing helper,
// which reads the cheap-cost switch frozen into config at import, while the
// present-email branch verifies a hash this file builds with argon2 directly
// and therefore always pays full cost. Configured cheap, the two branches
// verify at different costs and the cost comparison fails for a reason
// unrelated to the code. So force strong before the app graph is imported, and assert it
// in beforeAll rather than trusting it: the runner uses a worker-thread pool,
// and a precondition that is checked names itself when it breaks.
process.env.FOOTBAG_CHEAP_PASSWORD_HASH = '0';

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
  const { config } = await import('../../src/config/env');
  expect(
    config.useCheapPasswordHash,
    'precondition: this file must run at production argon2 cost, or the cost comparison means nothing',
  ).toBe(false);
}, 30000);

afterAll(() => cleanupTestDb(dbPath));

async function login(email: string, password: string): Promise<void> {
  await request(createApp())
    .post('/login')
    .type('form')
    .send({ email, password });
}

describe('login work equalisation (anti-enumeration)', () => {
  // The contract, with no clock in it: both branches run exactly one argon2
  // verify, against hashes of the same cost. Equal work is what makes the two
  // indistinguishable; a timing comparison could only sample it under whatever
  // load the machine carries, while this states it. Defect caught: the absent-email branch
  // skips the verify, runs it twice, or verifies against a cheaper hash, any
  // of which lets response time reveal whether an email is registered.
  it('absent-email and present-email logins each run one argon2 verify at the same cost', async () => {
    const costOf = (encoded: string): string => encoded.split('$')[3];
    const spy = vi.spyOn(argon2, 'verify');
    try {
      await login(KNOWN_EMAIL, WRONG_PASSWORD);
      const presentHashes = spy.mock.calls.map((c) => c[0]);
      spy.mockClear();
      await login(ABSENT_EMAIL, WRONG_PASSWORD);
      const absentHashes = spy.mock.calls.map((c) => c[0]);

      expect(presentHashes).toHaveLength(1);
      expect(absentHashes).toHaveLength(1);
      expect(costOf(absentHashes[0])).toBe(costOf(presentHashes[0]));
    } finally {
      spy.mockRestore();
    }
  });
});
