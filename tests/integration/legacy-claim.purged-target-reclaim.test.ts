/**
 * A legacy record freed by a PII purge is fully re-claimable by a different
 * member end to end through the claim route. After the first claimant purges
 * their account, the legacy_members snapshot returns to the claimable pool; a
 * second member whose verified login email matches the legacy address then
 * drives the claim through POST /register/wizard/legacy_claim/find and lands
 * the claim: the record points at the second member, the tier grant applies,
 * the claim is audited, and no residue points back at the purged first member.
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

let createApp: Awaited<ReturnType<typeof importApp>>;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let memberService: typeof import('../../src/services/memberService').memberService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let identityAccessService: typeof import('../../src/services/identityAccessService').identityAccessService;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // A HoF legacy record so the claim grant is a deterministic Tier 2.
  insertLegacyMember(db, {
    legacy_member_id: LEGACY_ID, legacy_email: LEGACY_EMAIL,
    real_name: 'Reclaim Tester', display_name: 'Reclaim Tester', is_hof: 1,
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
  db.close();

  createApp = await importApp();
  memberService = (await import('../../src/services/memberService')).memberService;
  identityAccessService = (await import('../../src/services/identityAccessService')).identityAccessService;

  identityAccessService.claimLegacyAccount(MEMBER_A, LEGACY_ID);
  expect(memberService.purgeAccountPII(MEMBER_A).status).toBe('purged');
});

afterAll(() => cleanupTestDb(dbPath));

function cookie(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
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

      // The HoF record grants Tier 2 to the new claimant.
      const tier = d.prepare(
        `SELECT tier_status FROM member_tier_current WHERE member_id = ?`,
      ).get(MEMBER_B) as { tier_status: string } | undefined;
      expect(tier?.tier_status).toBe('tier2');

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
});
