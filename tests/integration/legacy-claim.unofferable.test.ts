/**
 * The claim step never offers a card that could only be refused, and a
 * member's standing declines leave with their personal data.
 *
 * A record flagged deceased or held by another member, and an old account
 * whose linked record is, never reaches the member as a card, whichever key
 * found it. A claim by one member takes the candidate off every other member's
 * claim step at once. A personal-data purge deletes the member's declines; the
 * ledger rows recording them remain.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
  insertOnboardingTask,
  insertMemberDeclaredAnchor,
  insertLegacyClaimDecline,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4244');

let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/identityAccessService').identityAccessService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let memberSvc: typeof import('../../src/services/memberService');

beforeAll(async () => {
  db = createTestDb(dbPath);
  await importApp();
  svc = (await import('../../src/services/identityAccessService')).identityAccessService;
  memberSvc = await import('../../src/services/memberService');
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

let seq = 0;
function tag(prefix: string): string {
  seq += 1;
  return `lun_${prefix}_${String.fromCharCode(97 + seq)}`;
}

/** A registrant past personal details, still in the claim step. */
function registrant(t: string, name: string, email = `${t}@example.com`): string {
  const memberId = insertMember(db, {
    id: `${t}_member`, slug: `slug_${t}`, login_email: email,
    real_name: name, display_name: name, birth_date: '1980-02-03', onboarding: 'none',
  });
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
  return memberId;
}

/** A competition record back-linked to an old-site account carrying `email`. */
function linkedRecord(t: string, name: string, email: string | null): { legacyId: string; personId: string } {
  const legacyId = `${t}_leg`;
  const personId = `${t}_hp`;
  insertLegacyMember(db, { legacy_member_id: legacyId, legacy_email: email, real_name: name, display_name: name });
  insertHistoricalPerson(db, { person_id: personId, person_name: name, legacy_member_id: legacyId });
  return { legacyId, personId };
}

async function offered(memberId: string): Promise<{ accounts: Array<string | null>; records: Array<string | null> }> {
  const view = await svc.getLinkHistoryViewForWizard(memberId);
  return {
    accounts: view!.candidates.map((c) => c.accountId),
    records: view!.candidates.map((c) => c.recordId),
  };
}

describe('no card offers a control that can only be refused', () => {
  // Defect caught: an account whose record is deceased or held is offered by
  // its email, and the claim then fails or takes someone else's record.
  it('an old-site account whose record is deceased or held gets no card, by login or old email', async () => {
    const t = tag('backhp');
    const name = `Casey Lunback${t.slice(-1)}`;
    const email = `${t}@example.com`;
    const oldEmail = `${t}-old@example.com`;
    const memberId = registrant(t, name, email);
    const dead = linkedRecord(`${t}_d`, name, email);
    db.prepare('UPDATE historical_persons SET is_deceased = 1 WHERE person_id = ?').run(dead.personId);
    const held = linkedRecord(`${t}_h`, name, oldEmail);
    const holder = registrant(`${t}_holder`, `Holder ${t}`);
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(held.personId, holder);
    insertMemberDeclaredAnchor(db, { member_id: memberId, anchor_type: 'old_email', anchor_value: oldEmail });

    const { accounts } = await offered(memberId);
    expect(accounts).not.toContain(dead.legacyId);
    expect(accounts).not.toContain(held.legacyId);
  });

  // Defect caught: a held or deceased namesake record is offered by name.
  it('a record another member holds, or one flagged deceased, gets no card; an open one does', async () => {
    const t = tag('cards');
    const name = `Casey Luncards${t.slice(-1)}`;
    const memberId = registrant(t, name);
    const holder = registrant(`${t}_h`, `Holder ${t}`);
    insertHistoricalPerson(db, { person_id: `${t}_held`, person_name: name });
    insertHistoricalPerson(db, { person_id: `${t}_dead`, person_name: name, is_deceased: 1 });
    insertHistoricalPerson(db, { person_id: `${t}_open`, person_name: name });
    svc.claimHistoricalPerson(holder, `${t}_held`, 'admin_vetted_evidence');

    const { records } = await offered(memberId);
    expect(records).toContain(`${t}_open`);
    expect(records).not.toContain(`${t}_held`);
    expect(records).not.toContain(`${t}_dead`);
  });

  // Defect caught: once one member claims a record, a namesake still sees it
  // offered and is told only on submitting that it is gone.
  it("a claim takes the record off another member's claim step at once", async () => {
    const t = tag('race');
    const name = `Casey Lunrace${t.slice(-1)}`;
    const first = registrant(`${t}_a`, name);
    const second = registrant(`${t}_b`, name);
    insertHistoricalPerson(db, { person_id: `${t}_rec`, person_name: name });
    expect((await offered(second)).records).toContain(`${t}_rec`);
    svc.claimHistoricalPerson(first, `${t}_rec`);
    expect((await offered(second)).records).not.toContain(`${t}_rec`);
  });
});

describe('a member who leaves takes their declines with them', () => {
  // Defect caught: a purged member's standing answers survive the erasure of
  // everything else personal about them.
  it('a personal-data purge deletes the declines and keeps the ledger rows', () => {
    const t = tag('purge');
    const name = `Purged Lunpurge${t.slice(-1)}`;
    const { personId } = linkedRecord(t, name, `${t}@example.com`);
    const memberId = registrant(t, name);
    insertLegacyClaimDecline(db, { member_id: memberId, historical_person_id: personId });
    db.prepare('UPDATE members SET deleted_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', memberId);

    memberSvc.memberService.purgeAccountPII(memberId);

    const left = db.prepare('SELECT COUNT(*) AS c FROM legacy_claim_declines WHERE member_id = ?').get(memberId) as { c: number };
    expect(left.c).toBe(0);
  });
});
