/**
 * The daily deletion of unfinished accounts.
 *
 * The contract: a prospective member's account (registered, onboarding not
 * finished) idle longer than the configured period is deleted outright, with
 * every row it owns; idleness counts the latest of its creation, any change to
 * its row, its last sign-in, its last onboarding answer and its last declared
 * anchor; a member, the system account and a soft-deleted account are never
 * touched; an account holding a protected row is kept whole and counted; and
 * the job writes no audit row, because the audit log holds none about a
 * prospective member.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertAccountToken,
  insertAuditEntry,
  insertMailingListSubscription,
  insertMember,
  insertMemberDeclaredAnchor,
  insertOnboardingTask,
  insertOutboxEmail,
} from '../fixtures/factories';
import { isoDaysAgo } from '../fixtures/clock';

const { dbPath } = setTestEnv('4734');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let ops: typeof import('../../src/services/operationsPlatformService').operationsPlatformService;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** Every row the job may remove, counted for one account. */
function ownedRowCounts(memberId: string): Record<string, number> {
  return withDb((db) => {
    const count = (sql: string) => (db.prepare(sql).get(memberId) as { n: number }).n;
    return {
      members: count('SELECT COUNT(*) AS n FROM members WHERE id = ?'),
      tokens: count('SELECT COUNT(*) AS n FROM account_tokens WHERE member_id = ?'),
      tasks: count('SELECT COUNT(*) AS n FROM member_onboarding_tasks WHERE member_id = ?'),
      anchors: count('SELECT COUNT(*) AS n FROM member_declared_anchors WHERE member_id = ?'),
      subscriptions: count('SELECT COUNT(*) AS n FROM mailing_list_subscriptions WHERE member_id = ?'),
      outbox: count('SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_member_id = ?'),
    };
  });
}

function auditRowCount(): number {
  return withDb((db) => (db.prepare('SELECT COUNT(*) AS n FROM audit_entries').get() as { n: number }).n);
}

/**
 * A prospective member holding one of every row an unfinished account can
 * own, with every activity stamp set to `activityAt`.
 */
function seedUnfinishedAccount(slug: string, activityAt: string): string {
  return withDb((db) => {
    const id = insertMember(db, {
      slug, login_email: `${slug}@example.com`, onboarding: 'none', created_at: activityAt,
    });
    insertOnboardingTask(db, id, 'personal_details', 'completed');
    insertOnboardingTask(db, id, 'legacy_claim', 'pending');
    insertOnboardingTask(db, id, 'club_affiliations', 'pending');
    insertAccountToken(db, id, { token_type: 'email_verify' });
    insertMemberDeclaredAnchor(db, { member_id: id, created_at: activityAt });
    insertMailingListSubscription(db, { member_id: id });
    insertOutboxEmail(db, { recipient_member_id: id, recipient_email: `${slug}@example.com` });
    db.prepare('UPDATE members SET updated_at = ? WHERE id = ?').run(activityAt, id);
    db.prepare('UPDATE member_onboarding_tasks SET updated_at = ? WHERE member_id = ?').run(activityAt, id);
    return id;
  });
}

const EVERY_ROW = { members: 1, tokens: 1, tasks: 3, anchors: 1, subscriptions: 1, outbox: 1 };
const NO_ROW = { members: 0, tokens: 0, tasks: 0, anchors: 0, subscriptions: 0, outbox: 0 };

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  ({ operationsPlatformService: ops } = await import('../../src/services/operationsPlatformService'));
});

afterAll(() => cleanupTestDb(dbPath));

let seq = 0;
const slug = (name: string) => `unfinished_${name}_${++seq}`;

beforeEach(() => {
  // Each case seeds its own accounts; earlier cases' survivors would be listed
  // again by a later run, so the job only ever sees this case's rows.
  withDb((db) => {
    db.prepare("UPDATE members SET deleted_at = '2000-01-01T00:00:00.000Z' WHERE is_system = 0 AND deleted_at IS NULL").run();
  });
});

describe('what the job deletes', () => {
  it('deletes an idle unfinished account with every row it owns, and writes no audit row', async () => {
    const idle = seedUnfinishedAccount(slug('idle'), isoDaysAgo(120));
    expect(ownedRowCounts(idle)).toEqual(EVERY_ROW);
    const auditBefore = auditRowCount();

    const result = await ops.runUnfinishedAccountCleanup();

    expect(result).toMatchObject({ eligible: 1, deleted: 1, blocked: 0, failed: 0 });
    expect(ownedRowCounts(idle)).toEqual(NO_ROW);
    expect(auditRowCount()).toBe(auditBefore);
  });
});

describe('what the job keeps', () => {
  it('keeps an old account whose last onboarding answer is recent, while deleting an idle one', async () => {
    // Measuring from creation alone would delete a person partway through
    // onboarding right now, because they first registered months ago.
    const active = seedUnfinishedAccount(slug('active'), isoDaysAgo(200));
    withDb((db) => db.prepare(
      "UPDATE member_onboarding_tasks SET updated_at = ? WHERE member_id = ? AND task_type = 'personal_details'",
    ).run(isoDaysAgo(2), active));
    const idle = seedUnfinishedAccount(slug('idle'), isoDaysAgo(120));

    const result = await ops.runUnfinishedAccountCleanup();

    expect(result).toMatchObject({ eligible: 1, deleted: 1 });
    expect(ownedRowCounts(active)).toEqual(EVERY_ROW);
    expect(ownedRowCounts(idle)).toEqual(NO_ROW);
  });

  it('keeps an account whose last activity is exactly the full period ago, and deletes it once past', async () => {
    // The period is "idle longer than", so the day it is reached the person
    // still has their account.
    const runAt = new Date('2026-07-21T03:00:00.000Z');
    const cutoff = new Date(runAt.getTime() - 90 * 86_400_000).toISOString();
    const atCutoff = seedUnfinishedAccount(slug('at_cutoff'), cutoff);

    const onTheDay = await ops.runUnfinishedAccountCleanup(runAt);
    expect(onTheDay.eligible).toBe(0);
    expect(ownedRowCounts(atCutoff)).toEqual(EVERY_ROW);

    const aMomentLater = await ops.runUnfinishedAccountCleanup(new Date(runAt.getTime() + 1));
    expect(aMomentLater).toMatchObject({ eligible: 1, deleted: 1 });
    expect(ownedRowCounts(atCutoff)).toEqual(NO_ROW);
  });

  it('keeps an account that signed in recently', async () => {
    const signedIn = seedUnfinishedAccount(slug('signed_in'), isoDaysAgo(200));
    withDb((db) => db.prepare('UPDATE members SET last_login_at = ? WHERE id = ?').run(isoDaysAgo(1), signedIn));

    const result = await ops.runUnfinishedAccountCleanup();

    expect(result.eligible).toBe(0);
    expect(ownedRowCounts(signedIn).members).toBe(1);
  });

  it('never deletes a member, however long idle, nor a soft-deleted account', async () => {
    // Deleting a member would erase someone who finished joining; a
    // soft-deleted account belongs to the grace-period purge.
    const member = withDb((db) => {
      const id = insertMember(db, { slug: slug('member'), created_at: isoDaysAgo(900) });
      db.prepare('UPDATE members SET updated_at = ? WHERE id = ?').run(isoDaysAgo(900), id);
      db.prepare('UPDATE member_onboarding_tasks SET updated_at = ? WHERE member_id = ?').run(isoDaysAgo(900), id);
      return id;
    });
    const softDeleted = seedUnfinishedAccount(slug('soft_deleted'), isoDaysAgo(120));
    withDb((db) => db.prepare('UPDATE members SET deleted_at = ? WHERE id = ?').run(isoDaysAgo(100), softDeleted));
    const idle = seedUnfinishedAccount(slug('idle'), isoDaysAgo(120));

    const result = await ops.runUnfinishedAccountCleanup();

    expect(result).toMatchObject({ eligible: 1, deleted: 1 });
    expect(ownedRowCounts(member).members).toBe(1);
    expect(ownedRowCounts(softDeleted)).toEqual(EVERY_ROW);
    expect(ownedRowCounts(idle)).toEqual(NO_ROW);
  });

  it('keeps whole an account holding a protected row, counts it, and still deletes the rest', async () => {
    // A partial delete would leave an account with no onboarding rows and no
    // way back into the wizard; the protected row is the defect to find.
    const protectedAccount = seedUnfinishedAccount(slug('protected'), isoDaysAgo(120));
    withDb((db) => insertAuditEntry(db, {
      actor_type: 'member', actor_member_id: protectedAccount,
      action_type: 'email.address_recovered', entity_type: 'member', entity_id: protectedAccount,
    }));
    const idle = seedUnfinishedAccount(slug('idle'), isoDaysAgo(120));

    const result = await ops.runUnfinishedAccountCleanup();

    expect(result).toMatchObject({ eligible: 2, deleted: 1, blocked: 1, failed: 0 });
    // The operator is told which account to look at, not only how many.
    expect(result.blockedMemberIds).toEqual([protectedAccount]);
    expect(ownedRowCounts(protectedAccount)).toEqual(EVERY_ROW);
    expect(ownedRowCounts(idle)).toEqual(NO_ROW);
  });
});
