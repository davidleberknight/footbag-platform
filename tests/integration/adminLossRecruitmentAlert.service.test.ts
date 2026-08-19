/**
 * The administrator-loss recruitment alert: the revoke-time raise and the daily
 * sweep that finds administrators who can no longer serve.
 *
 * Losing an administrator raises one open work-queue item naming that member
 * and the reason, and emails the admin mailing list asking the remaining
 * administrators to recruit a replacement. A revoke raises it in the same
 * transaction as the role change; an account that is soft-deleted, a member
 * marked deceased, and a sign-in that has lapsed past the configured window are
 * all found by the daily sweep instead, because they have no in-app action to
 * hang the raise on. The sweep reads and alerts: it changes no admin role, and
 * an administrator who already has an alert on record is skipped, so re-running
 * it raises nothing new. That guard outlives the alert being closed, because the
 * states the sweep reads persist after a dismissal: dismissing settles the loss
 * and keeps it settled until that administrator signs in again and lapses afresh.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertMailingListSubscription, insertSystemConfig } from '../fixtures/factories';

const { dbPath } = setTestEnv('4067');

const TASK_TYPE = 'admin_loss_recruitment';
const INACTIVITY_DAYS = 90;
const DAY_MS = 86_400_000;

const ACTOR       = 'al_actor';
const REVOKED     = 'al_revoked';
const LAPSED      = 'al_lapsed';
const DECEASED    = 'al_deceased';
const DELETED     = 'al_deleted';
const FRESH       = 'al_fresh';
const NEVER_OLD   = 'al_never_old';
const PLAIN       = 'al_plain_member';

const ADMINS = [ACTOR, REVOKED, LAPSED, DECEASED, DELETED, FRESH, NEVER_OLD];

/** Comfortably outside the configured window, so a rounding difference between
 *  the seed and the sweep's own cutoff cannot flip the outcome. */
const LONG_AGO = new Date(Date.now() - (INACTIVITY_DAYS + 30) * DAY_MS).toISOString();
/** Comfortably inside it, for the administrators who must be left alone. */
const RECENTLY = new Date(Date.now() - 2 * DAY_MS).toISOString();

/** An administrator who was written off, came back, and lapsed a second time:
 *  the dismissal predates the sign-in, and the sign-in still predates the
 *  window's cutoff, so the loss is genuinely new rather than the settled one. */
const DISMISSED_BEFORE_RETURN = new Date(Date.now() - (INACTIVITY_DAYS + 110) * DAY_MS).toISOString();
const RETURNED_THEN_LAPSED    = new Date(Date.now() - (INACTIVITY_DAYS + 60) * DAY_MS).toISOString();

let testDb: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let tiering: typeof import('../../src/services/membershipTieringService');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let adminQueue: typeof import('../../src/services/adminWorkQueueService');

interface QueueRow {
  entity_id: string;
  queue_category: string;
  status: string;
  reason_text: string | null;
}

function openAlerts(): QueueRow[] {
  return testDb.prepare(`
    SELECT entity_id, queue_category, status, reason_text
    FROM work_queue_items
    WHERE task_type = ? AND status = 'open'
    ORDER BY entity_id
  `).all(TASK_TYPE) as QueueRow[];
}

function alertedMemberIds(): string[] {
  return openAlerts().map((r) => r.entity_id);
}

/** Every alert ever raised about one administrator, open or closed, which is
 *  what tells a suppressed re-raise apart from a card that was merely closed. */
function alertCountFor(memberId: string): number {
  const row = testDb.prepare(
    `SELECT COUNT(*) AS c FROM work_queue_items WHERE task_type = ? AND entity_id = ?`,
  ).get(TASK_TYPE, memberId) as { c: number };
  return row.c;
}

function openAlertIdFor(memberId: string): string {
  const row = testDb.prepare(
    `SELECT id FROM work_queue_items WHERE task_type = ? AND entity_id = ? AND status = 'open'`,
  ).get(TASK_TYPE, memberId) as { id: string } | undefined;
  if (row === undefined) throw new Error(`no open alert for ${memberId}`);
  return row.id;
}

function recruitmentEmailCount(): number {
  const row = testDb.prepare(
    `SELECT COUNT(*) AS c FROM outbox_emails WHERE template_key = ?`,
  ).get(TASK_TYPE) as { c: number };
  return row.c;
}

function isAdmin(memberId: string): number {
  const row = testDb.prepare('SELECT is_admin FROM members WHERE id = ?').get(memberId) as { is_admin: number };
  return row.is_admin;
}

beforeAll(async () => {
  testDb = createTestDb(dbPath);
  insertSystemConfig(testDb, {
    config_key: 'admin_inactivity_alert_days',
    value_json: String(INACTIVITY_DAYS),
  });

  // Two administrators who are serving normally: the actor who performs the
  // revoke, and one whose sign-in is recent enough that the sweep leaves them be.
  insertMember(testDb, { id: ACTOR,   slug: 'al_actor',   login_email: 'al-actor@example.com',   is_admin: 1, last_login_at: RECENTLY });
  insertMember(testDb, { id: REVOKED, slug: 'al_revoked', login_email: 'al-revoked@example.com', is_admin: 1, last_login_at: RECENTLY });

  insertMember(testDb, { id: LAPSED,    slug: 'al_lapsed',    login_email: 'al-lapsed@example.com',   is_admin: 1, last_login_at: LONG_AGO });
  insertMember(testDb, { id: DECEASED,  slug: 'al_deceased',  login_email: 'al-deceased@example.com', is_admin: 1, last_login_at: RECENTLY, is_deceased: 1, deceased_at: RECENTLY });
  insertMember(testDb, { id: DELETED,   slug: 'al_deleted',   login_email: 'al-deleted@example.com',  is_admin: 1, last_login_at: RECENTLY, deleted_at: RECENTLY });
  // Granted the role and not yet signed in, but the account is new: measuring
  // from account creation is what keeps a fresh grant off the queue.
  insertMember(testDb, { id: FRESH,     slug: 'al_fresh',     login_email: 'al-fresh@example.com',    is_admin: 1, created_at: RECENTLY });
  insertMember(testDb, { id: NEVER_OLD, slug: 'al_never_old', login_email: 'al-never@example.com',    is_admin: 1, created_at: LONG_AGO });
  // A member who never held the role: age alone must not put anyone on the queue.
  insertMember(testDb, { id: PLAIN,     slug: 'al_plain',     login_email: 'al-plain@example.com',    is_admin: 0, last_login_at: LONG_AGO });

  for (const memberId of ADMINS) {
    insertMailingListSubscription(testDb, { member_id: memberId, list_slug: 'admin-alerts', list_name: 'Admin alerts' });
  }

  await importApp();
  tiering    = await import('../../src/services/membershipTieringService');
  adminQueue = await import('../../src/services/adminWorkQueueService');
});

afterAll(() => {
  testDb.close();
  cleanupTestDb(dbPath);
});

// Each test seeds its own queue and outbox, and a revoke permanently clears the
// target's role and admin-list subscription, so the admin roster is restored to
// the seeded shape between tests rather than leaking into the next one.
beforeEach(() => {
  testDb.prepare('DELETE FROM outbox_emails').run();
  testDb.prepare('DELETE FROM work_queue_items').run();
  for (const memberId of ADMINS) {
    testDb.prepare('UPDATE members SET is_admin = 1 WHERE id = ?').run(memberId);
    testDb.prepare(
      `UPDATE mailing_list_subscriptions SET status = 'subscribed'
       WHERE mailing_list_id = 'admin-alerts' AND member_id = ?`,
    ).run(memberId);
  }
  testDb.prepare('UPDATE members SET last_login_at = ? WHERE id IN (?, ?, ?, ?)')
    .run(RECENTLY, ACTOR, REVOKED, DECEASED, DELETED);
  testDb.prepare('UPDATE members SET last_login_at = ? WHERE id = ?').run(LONG_AGO, LAPSED);
});

describe('revoking the admin role raises the recruitment alert', () => {
  it('raises one open item naming the revoked administrator, and emails the admin list', () => {
    tiering.revokeAdminRole(ACTOR, REVOKED, 'Stepping down from the admin team.');

    const alerts = openAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.entity_id).toBe(REVOKED);
    expect(alerts[0]!.queue_category).toBe('system');
    expect(alerts[0]!.reason_text).toContain('revoked');
    expect(recruitmentEmailCount()).toBeGreaterThan(0);
  });

  it('records the raise in the audit ledger against the revoked administrator', () => {
    tiering.revokeAdminRole(ACTOR, REVOKED, 'Stepping down from the admin team.');

    const row = testDb.prepare(`
      SELECT actor_member_id, entity_id, metadata_json
      FROM audit_entries
      WHERE action_type = 'admin.loss_alert_raised' AND entity_id = ?
    `).get(REVOKED) as { actor_member_id: string | null; entity_id: string; metadata_json: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.actor_member_id).toBe(ACTOR);
    expect(JSON.parse(row!.metadata_json).loss_reason).toBe('revoked');
  });

  it('sends the recruitment email with the member id and no display name', () => {
    tiering.revokeAdminRole(ACTOR, REVOKED, 'Stepping down from the admin team.');

    const body = testDb.prepare(
      `SELECT body_text FROM outbox_emails WHERE template_key = ? LIMIT 1`,
    ).get(TASK_TYPE) as { body_text: string } | undefined;

    expect(body).toBeDefined();
    expect(body!.body_text).toContain(REVOKED);
    expect(body!.body_text).not.toContain('Test User');
  });

  it('rolls the alert back with the role change when the revoke is rejected', () => {
    expect(() => tiering.revokeAdminRole(ACTOR, ACTOR, 'Trying to revoke myself.')).toThrow();

    expect(openAlerts()).toHaveLength(0);
    expect(isAdmin(ACTOR)).toBe(1);
  });
});

describe('the daily sweep finds administrators who can no longer serve', () => {
  it('raises for the lapsed, deceased, soft-deleted, and never-signed-in-since-creation administrators', () => {
    const result = tiering.runAdminLossSweep();

    expect(alertedMemberIds()).toEqual([DECEASED, DELETED, LAPSED, NEVER_OLD].sort());
    expect(result.raised).toBe(4);
    expect(result.failed).toBe(0);
  });

  it('leaves serving administrators and non-administrators alone', () => {
    tiering.runAdminLossSweep();

    const alerted = alertedMemberIds();
    expect(alerted).not.toContain(ACTOR);
    expect(alerted).not.toContain(REVOKED);
    expect(alerted).not.toContain(FRESH);
    expect(alerted).not.toContain(PLAIN);
  });

  it('names the reason that explains each loss', () => {
    tiering.runAdminLossSweep();

    const byMember = new Map(openAlerts().map((r) => [r.entity_id, r.reason_text ?? '']));
    expect(byMember.get(DECEASED)).toContain('deceased');
    expect(byMember.get(DELETED)).toContain('deleted their account');
    expect(byMember.get(LAPSED)).toContain('not signed in');
    expect(byMember.get(NEVER_OLD)).toContain('not signed in');
  });

  it('changes no admin role: the sweep prompts, it does not remove', () => {
    tiering.runAdminLossSweep();

    for (const memberId of ADMINS) {
      expect(isAdmin(memberId), memberId).toBe(1);
    }
  });

  it('raises nothing further while the alerts are open, and sends no second email', () => {
    tiering.runAdminLossSweep();
    const emailsAfterFirst = recruitmentEmailCount();

    const second = tiering.runAdminLossSweep();

    expect(second.raised).toBe(0);
    expect(second.examined).toBe(4);
    expect(openAlerts()).toHaveLength(4);
    expect(recruitmentEmailCount()).toBe(emailsAfterFirst);
  });

  // The two paths can reach the same administrator: the sweep finds a deceased
  // administrator who still holds the role, and an admin then revokes it. The
  // second path must not open a second card about the same person.
  it('adds no second alert when a revoke follows a sweep that already raised one', () => {
    tiering.runAdminLossSweep();
    expect(alertedMemberIds().filter((id) => id === DECEASED)).toHaveLength(1);

    tiering.revokeAdminRole(ACTOR, DECEASED, 'Removing the role from a deceased member.');

    expect(alertedMemberIds().filter((id) => id === DECEASED)).toHaveLength(1);
  });

  // Once the role is gone the administrator is no longer part of the admin team
  // the sweep watches, so the revoke-time card stays the single record of that
  // loss instead of being re-raised every day by the inactivity rule.
  it('stops examining an administrator once their role is revoked', () => {
    tiering.revokeAdminRole(ACTOR, REVOKED, 'Stepping down from the admin team.');
    testDb.prepare('UPDATE members SET last_login_at = ? WHERE id = ?').run(LONG_AGO, REVOKED);

    const result = tiering.runAdminLossSweep();

    expect(result.examined).toBe(4);
    expect(alertedMemberIds().filter((id) => id === REVOKED)).toHaveLength(1);
  });
});

// Dismissing is the administrator's ruling that the loss is settled. The states
// the sweep reads outlive that ruling -- a lapsed administrator is still lapsed
// tomorrow -- so a guard that only skipped open items would reopen the same card
// every day and make dismissing pointless.
describe('dismissing an alert settles the loss for good', () => {
  it('raises nothing further for an administrator whose alert has been dismissed', () => {
    tiering.runAdminLossSweep();
    adminQueue.adminWorkQueueService.dismiss({
      queueItemId:   openAlertIdFor(LAPSED),
      adminMemberId: ACTOR,
      note:          'Replacement recruited.',
    });
    const emailsBefore = recruitmentEmailCount();

    tiering.runAdminLossSweep();

    expect(alertCountFor(LAPSED)).toBe(1);
    expect(alertedMemberIds()).not.toContain(LAPSED);
    expect(recruitmentEmailCount()).toBe(emailsBefore);
  });

  it('raises afresh for an administrator who signed in after the dismissal and then lapsed again', () => {
    tiering.runAdminLossSweep();
    adminQueue.adminWorkQueueService.dismiss({
      queueItemId:   openAlertIdFor(LAPSED),
      adminMemberId: ACTOR,
      note:          'Replacement recruited.',
    });
    // The dismissal is stamped at this instant, so it is aged backwards to sit
    // before the sign-in it must be compared against. Only the order of the two
    // timestamps decides the outcome, and the sign-in stays outside the window
    // so the administrator is genuinely lapsed a second time.
    testDb.prepare(
      `UPDATE work_queue_items SET resolved_at = ? WHERE task_type = ? AND entity_id = ?`,
    ).run(DISMISSED_BEFORE_RETURN, TASK_TYPE, LAPSED);
    testDb.prepare('UPDATE members SET last_login_at = ? WHERE id = ?').run(RETURNED_THEN_LAPSED, LAPSED);

    tiering.runAdminLossSweep();

    expect(alertCountFor(LAPSED)).toBe(2);
    expect(alertedMemberIds()).toContain(LAPSED);
  });
});

describe('the inactivity window is administrator-configurable', () => {
  it('reads the configured value rather than a hard-coded one', () => {
    expect(tiering.adminInactivityAlertDays()).toBe(INACTIVITY_DAYS);
  });
});
