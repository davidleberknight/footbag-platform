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
import { hashTestPassword } from '../fixtures/hashTestPassword';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson, insertOnboardingTask } from '../fixtures/factories';
import { resetRateLimitForTests } from '../../src/services/rateLimitService';

const { dbPath } = setTestEnv('3083');

let createApp: Awaited<ReturnType<typeof importApp>>;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/identityAccessService').identityAccessService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let dbMod: typeof import('../../src/db/db');

const MEMBER_ID       = 'atomic-member-001';
const MEMBER_SLUG     = 'atomic_member';
const MEMBER_EMAIL    = 'atomic@example.com';
const MEMBER_PASSWORD = 'OrigPass!1';
const LEGACY_ID       = 'atomic-legacy-001';

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

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: MEMBER_ID,
    slug: MEMBER_SLUG,
    login_email: MEMBER_EMAIL,
    display_name: 'Atomic Member',
    password_hash: await hashTestPassword(MEMBER_PASSWORD),
    birth_date: '1980-01-01',
    // The claim surface belongs to signing up, so its subjects are registrants
    // still in the wizard with personal details already on file.
    onboarding: 'none',
  });
  insertLegacyMember(db, {
    legacy_member_id: LEGACY_ID,
    legacy_email: 'legacy@example.com',
    display_name: 'Legacy Ghost',
    // Shares the member's surname (the factory default 'Test User'), so the
    // claim passes the surname rule and the case tests only atomicity.
    real_name: 'Legacy User',
  });
  insertOnboardingTask(db, MEMBER_ID, 'personal_details', 'completed');
  db.close();
  createApp = await importApp();
  svc = (await import('../../src/services/identityAccessService')).identityAccessService;
  dbMod = await import('../../src/db/db');
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare('UPDATE legacy_members SET claimed_by_member_id = NULL, claimed_at = NULL WHERE legacy_member_id = ?').run(LEGACY_ID);
  db.prepare('UPDATE members SET legacy_member_id = NULL, historical_person_id = NULL WHERE id = ?').run(MEMBER_ID);
  db.prepare(`UPDATE member_onboarding_tasks SET state = 'pending', completed_at = NULL WHERE member_id = ? AND task_type = 'legacy_claim'`).run(MEMBER_ID);
  db.close();
});

// ── claimLegacyAccount atomicity ──────────────────────────────────────────────

describe('claimLegacyAccount — atomicity invariants', () => {
  it('successful claim writes the member link and the account claim together', () => {
    svc.claimLegacyAccount(MEMBER_ID, LEGACY_ID);

    const member = readMember();
    const legacy = readLegacy();
    expect(member.legacy_member_id).toBe(LEGACY_ID);
    expect(legacy.claimed_by_member_id).toBe(MEMBER_ID);
    expect(legacy.claimed_at).toBeTruthy();
  });
});

// ── claimLegacyAccount: a second claimant ────────────────────────────────────
//
// The claim is one synchronous transaction, so two claims of one account cannot
// interleave in-process; the evidence that only one wins is the sequential case:
// once A holds the account, B's claim is refused with nothing of B's changed and
// the account still A's (the markClaimed `WHERE claimed_by_member_id IS NULL`
// guard and the holder check).

describe('claimLegacyAccount — second claimant', () => {
  const MEMBER_B_ID = 'atomic-member-002';

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
      slug: 'atomic_member_b',
      login_email: 'atomic-b@example.com',
      display_name: 'Atomic Member B',
      birth_date: '1980-01-01',
      onboarding: 'none',
    });
    insertOnboardingTask(db, MEMBER_B_ID, 'personal_details', 'completed');
    db.close();
  });

  beforeEach(() => {
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET legacy_member_id = NULL, historical_person_id = NULL WHERE id = ?').run(MEMBER_B_ID);
    db.close();
  });

  it('B\'s claim after A wins is refused, leaves B unchanged and the account still A\'s', () => {
    svc.claimLegacyAccount(MEMBER_ID, LEGACY_ID);
    expect(readLegacy().claimed_by_member_id).toBe(MEMBER_ID);

    expect(() => svc.claimLegacyAccount(MEMBER_B_ID, LEGACY_ID)).toThrow();
    expect(readMemberB().legacy_member_id).toBeNull();
    expect(readLegacy().claimed_by_member_id).toBe(MEMBER_ID);
    expect(readMember().legacy_member_id).toBe(LEGACY_ID);
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

    // On a dev or staging host the forgot-sent page renders the reset link in
    // the simulated-email card, so read the token from the response HTML. The
    // enqueued outbox body is scrubbed once the card's drain sends it.
    const match = forgot.text.match(/\/password\/reset\/([A-Za-z0-9_-]+)/);
    if (!match) throw new Error('no reset link rendered in the simulated-email card');
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

// ── Claim + task atomic across an outer transaction ──────────────────────────
//
// The underlying claim merge AND the wizard task transition must land in
// the SAME transaction so a partial-failure window
// cannot leave the member claimed but the task still pending. A throw from
// the outer transaction (simulating a completeTask failure) rolls back the
// merge writes too.

describe('claim inside an outer transaction — outer-rollback atomicity', () => {
  const HP_ID = 'atomic-hp-001';
  const FRESH_MEMBER_ID = 'atomic-fresh-001';

  beforeAll(() => {
    const db = new BetterSqlite3(dbPath);
    insertMember(db, {
      id: FRESH_MEMBER_ID,
      slug: 'atomic_fresh',
      real_name: 'Atomic Fresh',
      display_name: 'Atomic Fresh',
      login_email: 'atomic-fresh@example.com',
      birth_date: '1980-01-01',
      onboarding: 'none',
    });
    insertOnboardingTask(db, FRESH_MEMBER_ID, 'personal_details', 'completed');
    insertHistoricalPerson(db, {
      person_id: HP_ID,
      person_name: 'Atomic Fresh',
      country: 'US',
      hof_member: 0,
      bap_member: 0,
    });
    db.close();
  });

  beforeEach(() => {
    resetRateLimitForTests();
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET historical_person_id = NULL, legacy_member_id = NULL WHERE id = ?').run(FRESH_MEMBER_ID);
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
});
