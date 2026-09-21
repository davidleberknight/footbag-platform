/**
 * Anti-enumeration wall-clock equivalence for the two token-issuance endpoints
 * that must not leak account existence: the password-reset request and the
 * legacy-claim lookup. Both run the same work whether or not a record matches
 * (the password-reset absent branch burns an equivalent token-issuance cost;
 * the claim lookup returns the same neutral outcome), so the exists and
 * not-exists branches must complete in the same order of magnitude.
 *
 * Unlike the login endpoint, neither path runs argon2, so there is no ~30 ms
 * floor to assert; these paths are millisecond-scale. The load-bearing check is
 * therefore that the two branches do not diverge by more than identical work
 * diverges from itself, which would mean one branch performs heavy work the
 * other skips. That noise floor is measured in the same sampling window rather
 * than written down as a millisecond figure, because on paths this fast a fixed
 * figure describes the machine rather than the contract.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  insertOnboardingTask,
  insertSystemConfig,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3095');

const RESET_KNOWN_EMAIL = 'timing-reset-known@example.com';
const RESET_ABSENT_EMAIL = 'timing-reset-absent@example.com';
const CLAIM_MEMBER = 'timing-claim-member';
const CLAIM_LEGACY_ID = 'LM-timing';
const CLAIM_LEGACY_EMAIL = 'timing-legacy@legacy.example.com';
const CLAIM_ABSENT_IDENTIFIER = 'timing-claim-absent@example.com';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Raise every relevant cap far above the sample count so no branch is silently
  // rate-limited mid-run, which would poison the medians.
  insertSystemConfig(db, { config_key: 'password_reset_rate_limit_max_attempts', value_json: '100000' });
  insertSystemConfig(db, { config_key: 'legacy_claim_init_rate_limit_max_per_member', value_json: '100000' });
  insertSystemConfig(db, { config_key: 'legacy_claim_init_rate_limit_max_per_ip', value_json: '100000' });
  insertSystemConfig(db, { config_key: 'legacy_claim_init_rate_limit_max_per_target', value_json: '100000' });

  insertMember(db, {
    id: 'timing-reset-known', slug: 'timing_reset_known',
    login_email: RESET_KNOWN_EMAIL, display_name: 'Reset Known',
  });
  // Claim lookup: a legacy record whose address does NOT match the member's
  // login email, so the present branch takes the token-issuance path rather than
  // the email-equality fast path; personal_details is completed so the lookup
  // prerequisite is met.
  insertLegacyMember(db, {
    legacy_member_id: CLAIM_LEGACY_ID, legacy_email: CLAIM_LEGACY_EMAIL,
    real_name: 'Timing Legacy', display_name: 'Timing Legacy',
  });
  insertMember(db, {
    id: CLAIM_MEMBER, slug: 'timing_claim_member',
    login_email: 'timing-claim-member@example.com', display_name: 'Timing Claim',
  });
  insertOnboardingTask(db, CLAIM_MEMBER, 'personal_details', 'completed');
  db.close();
  createApp = await importApp();
}, 30000);

afterAll(() => cleanupTestDb(dbPath));

function claimCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: CLAIM_MEMBER })}`;
}

// Monotonic, and sub-millisecond. Date.now() was both wrong here: it is a wall
// clock, so a host that steps its time mid-interval hands back a short or
// negative duration that reads as one branch skipping work, and it quantises to
// the millisecond, which on paths that are themselves millisecond-scale throws
// away most of the signal these cases are built on.
function elapsedMsSince(start: number): number {
  return performance.now() - start;
}

async function timePasswordForgot(email: string): Promise<number> {
  const start = performance.now();
  await request(createApp()).post('/password/forgot').type('form').send({ email });
  return elapsedMsSince(start);
}

async function timeClaimFind(identifier: string): Promise<number> {
  const start = performance.now();
  await request(createApp())
    .post('/register/wizard/legacy_claim/find')
    .set('Cookie', claimCookie())
    .type('form')
    .send({ identifier, 'cf-turnstile-response': 'stub-ok' });
  return elapsedMsSince(start);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const N = 7;

// Assert the two branches complete in the same order of magnitude, against a
// scale this run measured rather than one the author chose.
//
// The previous version required the medians to sit within 50 ms of each other
// and applied a ratio bound only above 15 ms. Both numbers described the
// machine they were written on. These endpoints run no argon2 and are
// millisecond-scale, which is precisely where a fixed millisecond figure is
// least defensible: it is most of the signal on a fast box and none of it on a
// loaded one.
//
// The scale used instead is the spread of the present branch's own samples,
// which is what identical work costs twice, here, now. A gap that fits inside
// that spread is jitter. So is a gap smaller than one whole request. A branch
// that skips work the other does produces a gap that is a large multiple of its
// own cost and clears both bounds by a wide margin, which is the regression
// these cases exist to catch.
//
// The resolution that buys, measured rather than claimed: with a deliberate
// asymmetry injected into one branch, these cases pass it at 25 ms and fail it
// at 40 ms here, where the fixed 50 ms figure they used to carry waved 40 ms
// through. So they see a branch that skips something costing about one request
// or more. They do NOT see the token-generation burn itself, which is 32 random
// bytes and one hash and sits below HTTP noise by orders of magnitude; removing
// it entirely leaves these cases green, and no wall-clock test at this layer
// would notice. That burn is held by reading the code, not by this file.
function expectEquivalent(presentSamples: number[], absentSamples: number[]): void {
  const presentMedian = median(presentSamples);
  const absentMedian = median(absentSamples);
  const jitter = Math.max(...presentSamples) - Math.min(...presentSamples);
  const gap = Math.abs(presentMedian - absentMedian);

  expect(
    gap,
    `branch medians ${presentMedian.toFixed(1)} / ${absentMedian.toFixed(1)} ms differ by ` +
      `${gap.toFixed(1)} ms, against a same-branch spread of ${jitter.toFixed(1)} ms`,
  ).toBeLessThan(Math.max(2 * jitter, presentMedian));

  // Above the measured noise, the branches must also stay within an order of
  // magnitude of each other. Gated on the jitter rather than on a fixed
  // millisecond figure, for the same reason.
  if (presentMedian > jitter && absentMedian > jitter) {
    const ratio = Math.max(presentMedian / absentMedian, absentMedian / presentMedian);
    expect(ratio).toBeLessThan(4);
  }
}

describe('token-issuance wall-clock equivalence (anti-enumeration)', () => {
  it('password-reset request is equivalent for a registered vs unregistered email', async () => {
    await timePasswordForgot(RESET_KNOWN_EMAIL);
    await timePasswordForgot(RESET_ABSENT_EMAIL);

    const present: number[] = [];
    const absent: number[] = [];
    for (let i = 0; i < N; i += 1) {
      present.push(await timePasswordForgot(RESET_KNOWN_EMAIL));
      absent.push(await timePasswordForgot(RESET_ABSENT_EMAIL));
    }
    expectEquivalent(present, absent);
  });

  it('legacy-claim lookup is equivalent for a matching vs non-matching identifier', async () => {
    await timeClaimFind(CLAIM_LEGACY_EMAIL);
    await timeClaimFind(CLAIM_ABSENT_IDENTIFIER);

    const present: number[] = [];
    const absent: number[] = [];
    for (let i = 0; i < N; i += 1) {
      present.push(await timeClaimFind(CLAIM_LEGACY_EMAIL));
      absent.push(await timeClaimFind(CLAIM_ABSENT_IDENTIFIER));
    }
    expectEquivalent(present, absent);
  });
});
