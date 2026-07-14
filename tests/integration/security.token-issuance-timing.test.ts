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
 * therefore that the two branches do not diverge by a large absolute amount,
 * which would mean one branch performs heavy work the other skips. A ratio bound
 * is applied only when both medians rise above the noise floor, since a ratio of
 * millisecond timings is jitter, not signal.
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
  return `footbag_session=${createTestSessionJwt({ memberId: CLAIM_MEMBER })}`;
}

async function timePasswordForgot(email: string): Promise<number> {
  const start = Date.now();
  await request(createApp()).post('/password/forgot').type('form').send({ email });
  return Date.now() - start;
}

async function timeClaimFind(identifier: string): Promise<number> {
  const start = Date.now();
  await request(createApp())
    .post('/register/wizard/legacy_claim/find')
    .set('Cookie', claimCookie())
    .type('form')
    .send({ identifier, 'cf-turnstile-response': 'stub-ok' });
  return Date.now() - start;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const N = 7;

// Assert the two branches complete in the same order of magnitude: a small
// absolute gap always, and a ratio bound only once both rise above the
// millisecond noise floor.
function expectEquivalent(presentSamples: number[], absentSamples: number[]): void {
  const presentMedian = median(presentSamples);
  const absentMedian = median(absentSamples);
  expect(Math.abs(presentMedian - absentMedian)).toBeLessThan(50);
  if (presentMedian > 15 && absentMedian > 15) {
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
  }, 30000);

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
  }, 30000);
});
