/**
 * A legacy record freed by a PII purge is fully re-claimable by a different
 * member end to end through the claim route. After the first claimant purges
 * their account, the legacy_members snapshot returns to the claimable pool; a
 * second member whose verified login email matches the legacy address then
 * drives the claim through POST /register/wizard/legacy_claim/find and lands
 * the claim: the record points at the second member, the tier grant applies,
 * the claim is audited, and no residue points back at the purged first member.
 *
 * An honoree's record is the exception and is never freed: a Hall of Fame or Big
 * Add Posse honor is for life, so erasure keeps their claim and their archival
 * links rather than handing their old-site identity to the next person who
 * shares the name.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
  insertOnboardingTask,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3094');

const LEGACY_ID = 'LM-reclaim';
const LEGACY_EMAIL = 'reclaim@legacy.example.com';
const MEMBER_A = 'reclaim-a';
const MEMBER_B = 'reclaim-b';

const HONOREE_LEGACY_ID = 'LM-honoree';
const HONOREE_LEGACY_EMAIL = 'honoree@legacy.example.com';
const MEMBER_HONOREE = 'reclaim-honoree';
const MEMBER_C = 'reclaim-c';

let createApp: Awaited<ReturnType<typeof importApp>>;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let memberService: typeof import('../../src/services/memberService').memberService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let identityAccessService: typeof import('../../src/services/identityAccessService').identityAccessService;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // An ordinary legacy record. It carries no honor deliberately: an honoree's
  // record is never freed by a purge, which the honoree case below covers.
  insertLegacyMember(db, {
    legacy_member_id: LEGACY_ID, legacy_email: LEGACY_EMAIL,
    real_name: 'Reclaim Tester', display_name: 'Reclaim Tester',
  });
  insertHistoricalPerson(db, {
    person_id: 'HP-reclaim', person_name: 'Reclaim Tester', legacy_member_id: LEGACY_ID,
  });
  // Member A claims the record, then purges. Member B is verified with the
  // legacy address as its login email, so B qualifies for the email-equality
  // fast path; personal_details is completed so the legacy_claim prerequisite
  // is met.
  insertMember(db, {
    id: MEMBER_A, slug: 'reclaim_a', login_email: 'reclaim-a@example.com',
    real_name: 'Reclaim Tester', display_name: 'Reclaim Tester',
  });
  insertMember(db, {
    id: MEMBER_B, slug: 'reclaim_b', login_email: LEGACY_EMAIL,
    real_name: 'Reclaim Tester', display_name: 'Reclaim Tester',
  });
  insertOnboardingTask(db, MEMBER_B, 'personal_details', 'completed');

  // The honoree case: the same sequence against a Hall of Fame legacy record.
  // Member C is set up exactly as B is, so the only difference is the honor.
  insertLegacyMember(db, {
    legacy_member_id: HONOREE_LEGACY_ID, legacy_email: HONOREE_LEGACY_EMAIL,
    real_name: 'Honoree Tester', display_name: 'Honoree Tester', is_hof: 1,
  });
  insertHistoricalPerson(db, {
    person_id: 'HP-honoree', person_name: 'Honoree Tester', legacy_member_id: HONOREE_LEGACY_ID,
  });
  insertMember(db, {
    id: MEMBER_HONOREE, slug: 'reclaim_honoree', login_email: 'reclaim-honoree@example.com',
    real_name: 'Honoree Tester', display_name: 'Honoree Tester',
  });
  insertMember(db, {
    id: MEMBER_C, slug: 'reclaim_c', login_email: HONOREE_LEGACY_EMAIL,
    real_name: 'Honoree Tester', display_name: 'Honoree Tester',
  });
  insertOnboardingTask(db, MEMBER_C, 'personal_details', 'completed');
  db.close();

  createApp = await importApp();
  memberService = (await import('../../src/services/memberService')).memberService;
  identityAccessService = (await import('../../src/services/identityAccessService')).identityAccessService;

  identityAccessService.claimLegacyAccount(MEMBER_A, LEGACY_ID);
  expect(memberService.purgeAccountPII(MEMBER_A).status).toBe('purged');

  identityAccessService.claimLegacyAccount(MEMBER_HONOREE, HONOREE_LEGACY_ID);
  expect(memberService.purgeAccountPII(MEMBER_HONOREE).status).toBe('purged');
});

afterAll(() => cleanupTestDb(dbPath));

function cookie(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function readDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath, { readonly: true });
}

describe('re-claiming a purge-freed legacy record through the claim route', () => {
  it('a second member claims the freed record, gets the tier grant, and leaves no residue for the purged member', async () => {
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookie(MEMBER_B))
      .type('form')
      .send({ identifier: LEGACY_EMAIL, 'cf-turnstile-response': 'stub-ok' });
    // The email-equality fast path auto-links and advances the wizard.
    expect(res.status).toBe(303);

    const d = readDb();
    try {
      const legacy = d.prepare(
        'SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?',
      ).get(LEGACY_ID) as { claimed_by_member_id: string | null };
      expect(legacy.claimed_by_member_id).toBe(MEMBER_B);

      const b = d.prepare('SELECT legacy_member_id, historical_person_id FROM members WHERE id = ?')
        .get(MEMBER_B) as { legacy_member_id: string | null; historical_person_id: string | null };
      expect(b.legacy_member_id).toBe(LEGACY_ID);
      expect(b.historical_person_id).toBe('HP-reclaim');

      // A record with no paid history behind it lands the new claimant at the
      // floor tier, which is the grant the claim writes rather than none at all.
      const tier = d.prepare(
        `SELECT tier_status FROM member_tier_current WHERE member_id = ?`,
      ).get(MEMBER_B) as { tier_status: string } | undefined;
      expect(tier?.tier_status).toBe('tier0');

      const claimAudit = d.prepare(
        `SELECT COUNT(*) AS n FROM audit_entries
           WHERE entity_id = ? AND action_type = 'claim.legacy_account'`,
      ).get(MEMBER_B) as { n: number };
      expect(claimAudit.n).toBe(1);

      // The purged first member holds no link to the record.
      const a = d.prepare('SELECT legacy_member_id, historical_person_id FROM members WHERE id = ?')
        .get(MEMBER_A) as { legacy_member_id: string | null; historical_person_id: string | null };
      expect(a.legacy_member_id).toBeNull();
      expect(a.historical_person_id).toBeNull();
    } finally {
      d.close();
    }
  });

  // An honor is for life, so erasure never hands an honoree's old-site identity
  // back to the pool. Otherwise the next person with the same name inherits the
  // record, and with it the honor that made the record permanent.
  it('leaves an honoree record claimed, so nobody else can take their identity', async () => {
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookie(MEMBER_C))
      .type('form')
      .send({ identifier: HONOREE_LEGACY_EMAIL, 'cf-turnstile-response': 'stub-ok' });

    const d = readDb();
    try {
      const legacy = d.prepare(
        'SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?',
      ).get(HONOREE_LEGACY_ID) as { claimed_by_member_id: string | null };
      expect(legacy.claimed_by_member_id).toBe(MEMBER_HONOREE);

      const c = d.prepare('SELECT legacy_member_id, historical_person_id FROM members WHERE id = ?')
        .get(MEMBER_C) as { legacy_member_id: string | null; historical_person_id: string | null };
      expect(c.legacy_member_id).toBeNull();
      expect(c.historical_person_id).toBeNull();

      // The erased honoree keeps both links, which is what publishes their
      // competing name and their results.
      const honoree = d.prepare('SELECT legacy_member_id, historical_person_id FROM members WHERE id = ?')
        .get(MEMBER_HONOREE) as { legacy_member_id: string | null; historical_person_id: string | null };
      expect(honoree.legacy_member_id).toBe(HONOREE_LEGACY_ID);
      expect(honoree.historical_person_id).toBe('HP-honoree');
    } finally {
      d.close();
    }

    // The route answers uniformly whether or not a record matched, so a held
    // record is not distinguishable from an absent one by the response alone.
    expect(res.status).toBe(303);
  });
});
