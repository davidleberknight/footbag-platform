/**
 * Adversarial tests: transaction atomicity for multi-row writes.
 *
 * Multi-row writes either all land or none. This suite pins the atomicity
 * contract for flows that write to more than one row or table in a single
 * service call. If any step fails, no partial state should persist.
 *
 * Limitation: strict mid-transaction fault injection would require either DB
 * mocking (forbidden) or a stub adapter. These tests instead
 * exercise the paths where the service itself throws mid-transaction and
 * verify DB state is consistent after the throw.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import argon2 from 'argon2';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, createTestSessionJwt } from '../fixtures/factories';
import { resetRateLimitForTests } from '../../src/services/rateLimitService';

const { dbPath } = setTestEnv('3083');

let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID       = 'atomic-member-001';
const MEMBER_SLUG     = 'atomic_member';
const MEMBER_EMAIL    = 'atomic@example.com';
const MEMBER_PASSWORD = 'OrigPass!1';
const LEGACY_ID       = 'atomic-legacy-001';

function ownCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}

function readMember(): Record<string, unknown> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM members WHERE id = ?').get(MEMBER_ID) as Record<string, unknown>;
  db.close();
  return row;
}

function readLegacy(): Record<string, unknown> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM legacy_members WHERE legacy_member_id = ?').get(LEGACY_ID) as Record<string, unknown>;
  db.close();
  return row;
}

async function issueClaimToken(memberId: string, identifier: string): Promise<string> {
  // Reads the claim-confirm URL from the rendered POST response (which now
  // includes the simulated-email card on dev). The post-render drain in
  // simulatedEmailService.getEmailPreview() marks the outbox row sent and
  // NULLs body_text per scrub-safety, so the DB-row read path is not
  // reliable. The HTML response is the authoritative source for the URL.
  const cookie = `footbag_session=${createTestSessionJwt({ memberId })}`;
  const app = createApp();
  const res = await request(app).post('/history/claim').set('Cookie', cookie).type('form').send({ identifier });
  expect(res.status).toBe(200);
  const m = res.text.match(/\/history\/claim\/confirm\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error(`No claim URL in response HTML for member ${memberId}`);
  return m[1];
}

// Clear outbox between tests so token-extraction picks this iteration's row.
function clearOutboxFor(memberId: string): void {
  const db = new BetterSqlite3(dbPath);
  db.prepare('DELETE FROM outbox_emails WHERE recipient_member_id = ?').run(memberId);
  db.close();
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: MEMBER_ID,
    slug: MEMBER_SLUG,
    login_email: MEMBER_EMAIL,
    display_name: 'Atomic Member',
    password_hash: await argon2.hash(MEMBER_PASSWORD),
  });
  insertLegacyMember(db, {
    legacy_member_id: LEGACY_ID,
    legacy_email: 'legacy@example.com',
    display_name: 'Legacy Ghost',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Reset legacy-claim state between tests.
beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare('UPDATE legacy_members SET claimed_by_member_id = NULL, claimed_at = NULL WHERE legacy_member_id = ?').run(LEGACY_ID);
  db.prepare('UPDATE members SET legacy_member_id = NULL, historical_person_id = NULL WHERE id = ?').run(MEMBER_ID);
  db.close();
});

// ── claimLegacyAccount atomicity ──────────────────────────────────────────────

describe('claimLegacyAccount — atomicity invariants', () => {
  it('throws on bad token → no member or legacy-member state changed', async () => {
    const res = await request(createApp())
      .post('/history/claim/confirm')
      .set('Cookie', ownCookie())
      .type('form')
      .send({ token: 'not-a-real-token' });
    // Service throws ValidationError, controller renders error view.
    expect(res.status).toBeLessThan(500);

    const member = readMember();
    const legacy = readLegacy();
    expect(member.legacy_member_id).toBeNull();
    expect(member.historical_person_id).toBeNull();
    expect(legacy.claimed_by_member_id).toBeNull();
    expect(legacy.claimed_at).toBeNull();
  });

  it('successful claim writes all three state changes together', async () => {
    clearOutboxFor(MEMBER_ID);
    const token = await issueClaimToken(MEMBER_ID, LEGACY_ID);
    const res = await request(createApp())
      .post('/history/claim/confirm')
      .set('Cookie', ownCookie())
      .type('form')
      .send({ token });
    expect(res.status).toBeLessThan(500);

    const member = readMember();
    const legacy = readLegacy();
    expect(member.legacy_member_id).toBe(LEGACY_ID);
    expect(legacy.claimed_by_member_id).toBe(MEMBER_ID);
    expect(legacy.claimed_at).toBeTruthy();
  });
});

// ── claimLegacyAccount two-actor concurrency ─────────────────────────────────
//
// Two simultaneous claims of the same legacy account. Fires both POSTs via
// Promise.all and asserts the markClaimed `WHERE claimed_by_member_id IS
// NULL` guard lets exactly one actor win (legacy_members.claimed_by_member_id
// is populated by exactly that member, and no stray member row ends up with
// a cross-claim).

describe('claimLegacyAccount — two-actor race', () => {
  const MEMBER_B_ID   = 'atomic-member-002';
  const MEMBER_B_SLUG = 'atomic_member_b';

  function cookieB(): string {
    return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_B_ID })}`;
  }

  function readMemberB(): Record<string, unknown> {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare('SELECT * FROM members WHERE id = ?').get(MEMBER_B_ID) as Record<string, unknown>;
    db.close();
    return row;
  }

  beforeAll(() => {
    const db = new BetterSqlite3(dbPath);
    insertMember(db, {
      id: MEMBER_B_ID,
      slug: MEMBER_B_SLUG,
      login_email: 'atomic-b@example.com',
      display_name: 'Atomic Member B',
    });
    db.close();
  });

  // Clear B's claim alongside A's (the outer beforeEach only touches A).
  beforeEach(() => {
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET legacy_member_id = NULL, historical_person_id = NULL WHERE id = ?').run(MEMBER_B_ID);
    db.close();
  });

  it('deterministic: B\'s confirm POST after A wins leaves B unchanged + still-claimed legacy row intact', async () => {
    // Sequential variant of the race below. Pins the deterministic invariant
    // that even when actor A has already won, actor B's confirm POST is a
    // no-op on B's member row and the legacy row's claimed_by_member_id
    // stays at A. The earlier `it('throws when legacy already claimed → ...')`
    // covered this for the old direct-lookup API; this is its replacement
    // for the new two-step token API.
    clearOutboxFor(MEMBER_ID);
    clearOutboxFor(MEMBER_B_ID);
    resetRateLimitForTests();
    const tokenA = await issueClaimToken(MEMBER_ID,   LEGACY_ID);
    const tokenB = await issueClaimToken(MEMBER_B_ID, LEGACY_ID);
    const app = createApp();

    // A goes first and commits cleanly.
    const resA = await request(app)
      .post('/history/claim/confirm')
      .set('Cookie', ownCookie())
      .type('form')
      .send({ token: tokenA });
    expect(resA.status).toBeLessThan(500);
    expect(readMember().legacy_member_id).toBe(LEGACY_ID);
    expect(readLegacy().claimed_by_member_id).toBe(MEMBER_ID);

    // B's POST arrives after the legacy row is already claimed. The merge
    // throws ValidationError ('this legacy record has already been claimed
    // by another account'), the controller renders 422, and the rollback
    // un-consumes B's token leaving B's member row untouched.
    const resB = await request(app)
      .post('/history/claim/confirm')
      .set('Cookie', cookieB())
      .type('form')
      .send({ token: tokenB });
    expect(resB.status).toBeLessThan(500);
    expect(readMemberB().legacy_member_id).toBeNull();
    // Legacy row's winner is unchanged (still A, not overwritten).
    expect(readLegacy().claimed_by_member_id).toBe(MEMBER_ID);
  });

  it('two actors targeting the same legacy_member_id → exactly one wins', async () => {
    clearOutboxFor(MEMBER_ID);
    clearOutboxFor(MEMBER_B_ID);
    const tokenA = await issueClaimToken(MEMBER_ID,   LEGACY_ID);
    const tokenB = await issueClaimToken(MEMBER_B_ID, LEGACY_ID);
    const app = createApp();
    const reqA = request(app)
      .post('/history/claim/confirm')
      .set('Cookie', ownCookie())
      .type('form')
      .send({ token: tokenA });
    const reqB = request(app)
      .post('/history/claim/confirm')
      .set('Cookie', cookieB())
      .type('form')
      .send({ token: tokenB });

    const [resA, resB] = await Promise.all([reqA, reqB]);
    expect(resA.status).toBeLessThan(500);
    expect(resB.status).toBeLessThan(500);

    const memberA = readMember();
    const memberB = readMemberB();
    const legacy = readLegacy();

    const aClaimed = memberA.legacy_member_id === LEGACY_ID;
    const bClaimed = memberB.legacy_member_id === LEGACY_ID;
    // Exactly one member ends up linked to the legacy account.
    expect(aClaimed).not.toBe(bClaimed);
    // legacy_members row reflects the same winner and nothing else.
    expect(legacy.claimed_by_member_id).toBe(aClaimed ? MEMBER_ID : MEMBER_B_ID);
    expect(legacy.claimed_at).toBeTruthy();
    // Loser's member row is untouched.
    expect(aClaimed ? memberB.legacy_member_id : memberA.legacy_member_id).toBeNull();
  });

  it('repeated two-actor races always settle with exactly one winner', async () => {
    // Run the race five times in a loop; each iteration must land in a
    // clean one-winner state. Pins that the race-condition guard never
    // lets both succeed nor corrupts state on the losing path.
    const app = createApp();
    for (let i = 0; i < 5; i++) {
      // Reset state before each iteration (beforeEach only fires once).
      // The rate-limit reset is required because initiateLegacyClaim now
      // caps per-target attempts at CLAIM_INIT_TARGET_MAX_PER_HOUR; without
      // a reset, iteration 2+ silently drop the outbox email and the
      // issueClaimToken helper throws "no outbox row".
      resetRateLimitForTests();
      const resetDb = new BetterSqlite3(dbPath);
      resetDb.prepare('UPDATE legacy_members SET claimed_by_member_id = NULL, claimed_at = NULL WHERE legacy_member_id = ?').run(LEGACY_ID);
      resetDb.prepare('UPDATE members SET legacy_member_id = NULL, historical_person_id = NULL WHERE id IN (?, ?)').run(MEMBER_ID, MEMBER_B_ID);
      resetDb.prepare('DELETE FROM outbox_emails WHERE recipient_member_id IN (?, ?)').run(MEMBER_ID, MEMBER_B_ID);
      resetDb.close();

      const tokenA = await issueClaimToken(MEMBER_ID,   LEGACY_ID);
      const tokenB = await issueClaimToken(MEMBER_B_ID, LEGACY_ID);
      const [resA, resB] = await Promise.all([
        request(app).post('/history/claim/confirm').set('Cookie', ownCookie())
          .type('form').send({ token: tokenA }),
        request(app).post('/history/claim/confirm').set('Cookie', cookieB())
          .type('form').send({ token: tokenB }),
      ]);
      expect(resA.status).toBeLessThan(500);
      expect(resB.status).toBeLessThan(500);

      const memberA = readMember();
      const memberB = readMemberB();
      const aClaimed = memberA.legacy_member_id === LEGACY_ID;
      const bClaimed = memberB.legacy_member_id === LEGACY_ID;
      expect(aClaimed).not.toBe(bClaimed);
    }
  });
});

// ── completePasswordReset atomicity ───────────────────────────────────────────
//
// completePasswordReset updates the password, bumps password_version, and
// marks the token as used. All three must land together. If any step fails,
// none should.

describe('completePasswordReset — atomicity', () => {
  it('invalid token throws → password_hash and password_version unchanged', async () => {
    const before = readMember();

    const res = await request(createApp())
      .post('/password/reset/not-a-valid-token')
      .type('form')
      .send({ newPassword: 'NewPass1!', confirmPassword: 'NewPass1!' });
    expect(res.status).toBeLessThan(500);

    const after = readMember();
    expect(after.password_hash).toBe(before.password_hash);
    expect(after.password_version).toBe(before.password_version);
  });

  it('valid token → password_hash changed, version bumped, token consumed, all in one transaction', async () => {
    const app = createApp();
    // Request a reset token via the public forgot endpoint.
    const forgot = await request(app)
      .post('/password/forgot')
      .type('form')
      .send({ email: MEMBER_EMAIL });
    expect(forgot.status).toBe(200);

    // Extract the token from the rendered HTML (which now includes the
    // simulated-email card on dev). The DB-row body_text is NULLed by the
    // post-render outbox drain in simulatedEmailService.getEmailPreview().
    const match = forgot.text.match(/\/password\/reset\/([A-Za-z0-9_-]+)/);
    if (!match) throw new Error('no reset link in response HTML');
    const token = match[1];

    const before = readMember();
    const completeRes = await request(app)
      .post(`/password/reset/${token}`)
      .type('form')
      .send({ newPassword: 'BrandNew!2', confirmPassword: 'BrandNew!2' });
    expect(completeRes.status).toBe(302);

    const after = readMember();
    expect(after.password_hash).not.toBe(before.password_hash);
    expect(after.password_version).toBe(Number(before.password_version) + 1);

    // Token marked consumed. A second attempt with the same token must fail.
    const replay = await request(app)
      .post(`/password/reset/${token}`)
      .type('form')
      .send({ newPassword: 'Another!3', confirmPassword: 'Another!3' });
    expect(replay.status).not.toBe(302);
  });
});
