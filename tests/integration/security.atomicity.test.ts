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
import { insertMember, insertLegacyMember, insertHistoricalPerson, createTestSessionJwt } from '../fixtures/factories';
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
  // POST /find issues a 303 to /register/wizard/legacy_claim. The flash
  // cookie carries the simulated-email-card state; the follow-up GET
  // renders the email card with the claim URL. Use an agent to round-trip
  // the cookie between POST and GET.
  const cookie = `footbag_session=${createTestSessionJwt({ memberId })}`;
  const agent = request.agent(createApp());
  const postRes = await agent
    .post('/register/wizard/legacy_claim/find').set('Cookie', cookie).type('form')
    .send({ identifier });
  expect(postRes.status).toBe(303);
  const getRes = await agent
    .get('/register/wizard/legacy_claim').set('Cookie', cookie);
  const m = getRes.text.match(/\/register\/wizard\/legacy_claim\/claim\/confirm\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error(`No claim URL in GET response HTML for member ${memberId}`);
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
      .post('/register/wizard/legacy_claim/claim/confirm')
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
      .post('/register/wizard/legacy_claim/claim/confirm')
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
      .post('/register/wizard/legacy_claim/claim/confirm')
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
      .post('/register/wizard/legacy_claim/claim/confirm')
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
      .post('/register/wizard/legacy_claim/claim/confirm')
      .set('Cookie', ownCookie())
      .type('form')
      .send({ token: tokenA });
    const reqB = request(app)
      .post('/register/wizard/legacy_claim/claim/confirm')
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
        request(app).post('/register/wizard/legacy_claim/claim/confirm').set('Cookie', ownCookie())
          .type('form').send({ token: tokenA }),
        request(app).post('/register/wizard/legacy_claim/claim/confirm').set('Cookie', cookieB())
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
    expect(completeRes.status).toBe(303);

    const after = readMember();
    expect(after.password_hash).not.toBe(before.password_hash);
    expect(after.password_version).toBe(Number(before.password_version) + 1);

    // Token marked consumed. A second attempt with the same token must fail.
    const replay = await request(app)
      .post(`/password/reset/${token}`)
      .type('form')
      .send({ newPassword: 'Another!3', confirmPassword: 'Another!3' });
    expect(replay.status).not.toBe(303);
  });
});

// ── InTx contract: claim+task atomic across outer transaction ────────────────
//
// SC §LegacyClaim requires the underlying claim merge AND the wizard task
// transition to land in the SAME transaction so a partial-failure window
// cannot leave the member claimed but the task still pending. Verifies the
// new `*InTx` variants: a throw from the outer transaction (e.g. simulating
// a completeTask failure) rolls back the merge writes too.

describe('claimHistoricalPersonInTx / consumeAndClaimLegacyInTx — outer-rollback atomicity', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let svc: typeof import('../../src/services/identityAccessService').identityAccessService;
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let dbMod: typeof import('../../src/db/db');
  const HP_ID = 'atomic-hp-001';
  // Uses a fresh member (not MEMBER_ID) because the password-reset test
  // earlier in this file bumps MEMBER_ID's password_version, invalidating
  // any pre-issued JWT for that member.
  const FRESH_MEMBER_ID = 'atomic-fresh-001';
  const FRESH_LEGACY_ID = 'atomic-fresh-legacy-001';

  function freshCookie(): string {
    return `footbag_session=${createTestSessionJwt({ memberId: FRESH_MEMBER_ID })}`;
  }

  beforeAll(async () => {
    const mod = await import('../../src/services/identityAccessService');
    svc = mod.identityAccessService;
    dbMod = await import('../../src/db/db');

    const db = new BetterSqlite3(dbPath);
    insertMember(db, {
      id: FRESH_MEMBER_ID,
      slug: 'atomic_fresh',
      real_name: 'Atomic Fresh',
      display_name: 'Atomic Fresh',
      login_email: 'atomic-fresh@example.com',
    });
    insertHistoricalPerson(db, {
      person_id: HP_ID,
      person_name: 'Atomic Fresh',
      country: 'US',
      hof_member: 0,
      bap_member: 0,
    });
    insertLegacyMember(db, {
      legacy_member_id: FRESH_LEGACY_ID,
      legacy_email: 'fresh-legacy@example.com',
      display_name: 'Fresh Legacy',
    });
    db.close();
  });

  beforeEach(() => {
    resetRateLimitForTests();
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET historical_person_id = NULL, legacy_member_id = NULL WHERE id = ?').run(FRESH_MEMBER_ID);
    db.prepare('UPDATE legacy_members SET claimed_by_member_id = NULL, claimed_at = NULL WHERE legacy_member_id = ?').run(FRESH_LEGACY_ID);
    db.prepare('DELETE FROM outbox_emails WHERE recipient_member_id = ?').run(FRESH_MEMBER_ID);
    db.close();
  });

  it('claimHistoricalPersonInTx inside an outer transaction that throws → no merge persists', () => {
    expect(() => {
      dbMod.transaction(() => {
        svc.claimHistoricalPersonInTx(FRESH_MEMBER_ID, HP_ID);
        // Simulate a downstream failure (e.g. completeTask throwing). The
        // outer transaction must roll back the merge.
        throw new Error('simulated post-merge failure');
      });
    }).toThrow('simulated post-merge failure');

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare('SELECT historical_person_id FROM members WHERE id = ?').get(FRESH_MEMBER_ID) as { historical_person_id: string | null };
    db.close();
    expect(row.historical_person_id).toBeNull();
  });

  it('consumeAndClaimLegacyInTx inside an outer transaction that throws → token un-consumed AND no merge persists', async () => {
    // Issue a token via the wizard for the fresh member/legacy pair.
    const agentReq = request.agent(createApp());
    const postRes = await agentReq
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', freshCookie())
      .type('form')
      .send({ identifier: FRESH_LEGACY_ID });
    expect(postRes.status).toBe(303);
    const getRes = await agentReq
      .get('/register/wizard/legacy_claim')
      .set('Cookie', freshCookie());
    const m = getRes.text.match(/\/register\/wizard\/legacy_claim\/claim\/confirm\/([A-Za-z0-9_-]+)/);
    if (!m) throw new Error('No claim URL in GET response HTML');
    const token = m[1];

    expect(() => {
      dbMod.transaction(() => {
        svc.consumeAndClaimLegacyInTx(FRESH_MEMBER_ID, token);
        throw new Error('simulated post-merge failure');
      });
    }).toThrow('simulated post-merge failure');

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const member = db.prepare('SELECT legacy_member_id FROM members WHERE id = ?').get(FRESH_MEMBER_ID) as { legacy_member_id: string | null };
    const legacy = db.prepare('SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?').get(FRESH_LEGACY_ID) as { claimed_by_member_id: string | null };
    const { createHash } = await import('crypto');
    const tok = db.prepare('SELECT used_at FROM account_tokens WHERE token_hash = ?')
      .get(createHash('sha256').update(token).digest('hex')) as { used_at: string | null } | undefined;
    db.close();

    expect(member.legacy_member_id).toBeNull();
    expect(legacy.claimed_by_member_id).toBeNull();
    // Critical atomicity invariant: the token must remain consumable.
    expect(tok?.used_at).toBeNull();
  });
});

// ── Wrong-account token consumption (DD §3.3 / SC §LegacyClaim) ─────────────
//
// A claim token issued for member A must not be consumable by member B even
// if B intercepts the email link. The service guard checks
// `consumed.memberId !== requestingMemberId` and throws ValidationError.
// Anti-enumeration: no information about A's account leaks via the response;
// the message is generic and the rollback un-consumes the token.

describe('consumeAndClaimLegacy — wrong-account guard', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let svc: typeof import('../../src/services/identityAccessService').identityAccessService;
  const A_MEMBER = 'atomic-wa-a';
  const B_MEMBER = 'atomic-wa-b';
  const WA_LEGACY = 'atomic-wa-legacy';

  beforeAll(async () => {
    svc = (await import('../../src/services/identityAccessService')).identityAccessService;
    const db = new BetterSqlite3(dbPath);
    insertMember(db, { id: A_MEMBER, slug: 'wa_a', login_email: 'wa-a@example.com', display_name: 'WA Member A' });
    insertMember(db, { id: B_MEMBER, slug: 'wa_b', login_email: 'wa-b@example.com', display_name: 'WA Member B' });
    insertLegacyMember(db, {
      legacy_member_id: WA_LEGACY,
      legacy_email: 'wa-legacy@example.com',
      display_name: 'WA Legacy Target',
    });
    db.close();
  });

  beforeEach(() => {
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE legacy_members SET claimed_by_member_id = NULL, claimed_at = NULL WHERE legacy_member_id = ?').run(WA_LEGACY);
    db.prepare('UPDATE members SET legacy_member_id = NULL WHERE id IN (?, ?)').run(A_MEMBER, B_MEMBER);
    db.close();
  });

  it('member B submitting A\'s token is rejected; merge is not performed; token can still be consumed by A', async () => {
    const agentReq = request.agent(createApp());
    const aCookie = `footbag_session=${createTestSessionJwt({ memberId: A_MEMBER })}`;
    const postRes = await agentReq
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', aCookie)
      .type('form')
      .send({ identifier: WA_LEGACY });
    expect(postRes.status).toBe(303);
    const getRes = await agentReq
      .get('/register/wizard/legacy_claim')
      .set('Cookie', aCookie);
    const m = getRes.text.match(/\/register\/wizard\/legacy_claim\/claim\/confirm\/([A-Za-z0-9_-]+)/);
    if (!m) throw new Error('No claim URL in GET response HTML');
    const tokenForA = m[1];

    // B uses A's token. Service must reject without touching state.
    expect(() => svc.consumeAndClaimLegacy(B_MEMBER, tokenForA))
      .toThrow(/different account/);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const a = db.prepare('SELECT legacy_member_id FROM members WHERE id = ?').get(A_MEMBER) as { legacy_member_id: string | null };
    const b = db.prepare('SELECT legacy_member_id FROM members WHERE id = ?').get(B_MEMBER) as { legacy_member_id: string | null };
    const lm = db.prepare('SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?').get(WA_LEGACY) as { claimed_by_member_id: string | null };
    const { createHash } = await import('crypto');
    const tok = db.prepare('SELECT used_at FROM account_tokens WHERE token_hash = ?')
      .get(createHash('sha256').update(tokenForA).digest('hex')) as { used_at: string | null } | undefined;
    db.close();

    expect(a.legacy_member_id).toBeNull();
    expect(b.legacy_member_id).toBeNull();
    expect(lm.claimed_by_member_id).toBeNull();
    expect(tok?.used_at).toBeNull();

    // Token still consumable by the legitimate owner (A).
    svc.consumeAndClaimLegacy(A_MEMBER, tokenForA);
    const dbAfter = new BetterSqlite3(dbPath, { readonly: true });
    const aAfter = dbAfter.prepare('SELECT legacy_member_id FROM members WHERE id = ?').get(A_MEMBER) as { legacy_member_id: string | null };
    dbAfter.close();
    expect(aAfter.legacy_member_id).toBe(WA_LEGACY);
  });
});
