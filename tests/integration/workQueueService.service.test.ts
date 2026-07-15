/**
 * The admin work-queue service: enqueue routing, claim, and the two scheduled
 * notification passes.
 *
 * Enqueue routes by urgency: a routine task type (every shipped type today)
 * inserts the work_queue_items row and sends NO per-event email; admins read it
 * on the dashboard and the digest. An administrator claims an item to signal
 * they are handling it, which drops the item from every other administrator's
 * digest. An item left open and unclaimed past the stale threshold escalates
 * once with a single email to all admins. Every notification carries task type
 * and entity id only.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('4012');

const TS = '2025-01-01T00:00:00.000Z';
const ADMIN_A = 'wq_admin_a';
const ADMIN_B = 'wq_admin_b';
const ENTITY_MEMBER_ID = 'wq_entity_member';

let testDb: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/workQueueService').workQueueService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let ops: typeof import('../../src/services/operationsPlatformService').operationsPlatformService;

function subscribeToAdminAlerts(subId: string, memberId: string): void {
  testDb.prepare(`
    INSERT INTO mailing_list_subscriptions (
      id, created_at, created_by, updated_at, updated_by, version,
      mailing_list_id, member_id, status, status_updated_at
    ) VALUES (?, ?, 'system', ?, 'system', 1, 'admin-alerts', ?, 'subscribed', ?)
  `).run(subId, TS, TS, memberId, TS);
}

function enqueueRoutine(entityId: string): string {
  return svc.enqueue({
    actorId: entityId, queueCategory: 'membership', taskType: 'member_contact_request',
    entityType: 'member', entityId, priority: 5, reasonText: 'Other: ping', detailText: 'ping',
  }).id;
}

function digestBodyFor(memberId: string): string | undefined {
  const row = testDb.prepare(
    `SELECT body_text FROM outbox_emails WHERE template_key = 'admin_queue_digest' AND recipient_member_id = ?`,
  ).get(memberId) as { body_text: string } | undefined;
  return row?.body_text;
}

beforeAll(async () => {
  testDb = createTestDb(dbPath);
  insertMember(testDb, { id: ADMIN_A, slug: 'wq_admin_a', display_name: 'Admin A', login_email: 'wq-a@example.com', is_admin: 1 });
  insertMember(testDb, { id: ADMIN_B, slug: 'wq_admin_b', display_name: 'Admin B', login_email: 'wq-b@example.com', is_admin: 1 });
  insertMember(testDb, { id: ENTITY_MEMBER_ID, slug: 'wq_entity_member', login_email: 'wq-entity@example.com' });
  subscribeToAdminAlerts('wq_mls_a', ADMIN_A);
  subscribeToAdminAlerts('wq_mls_b', ADMIN_B);

  await importApp();
  svc = (await import('../../src/services/workQueueService')).workQueueService;
  ops = (await import('../../src/services/operationsPlatformService')).operationsPlatformService;
});

afterAll(() => {
  testDb.close();
  cleanupTestDb(dbPath);
});

beforeEach(() => {
  // Each test seeds its own items and inspects its own outbox; clearing keeps
  // them isolated and resets the digest/escalation idempotency keys.
  testDb.prepare('DELETE FROM outbox_emails').run();
  testDb.prepare('DELETE FROM work_queue_items').run();
  testDb.prepare("DELETE FROM system_job_runs WHERE job_name = 'SYS_Admin_Queue_Digest'").run();
});

describe('workQueueService.enqueue', () => {
  it('inserts the work item and sends no per-event email for a routine task type', () => {
    const id = enqueueRoutine(ENTITY_MEMBER_ID);
    const row = testDb
      .prepare(`SELECT task_type, entity_type, entity_id, status, priority, queue_category, claimed_by_member_id FROM work_queue_items WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(row!.task_type).toBe('member_contact_request');
    expect(row!.status).toBe('open');
    expect(row!.claimed_by_member_id).toBeNull();
    // Routine items are read on the dashboard and the digest, not emailed per event.
    const alertCount = testDb
      .prepare(`SELECT COUNT(*) AS n FROM outbox_emails WHERE mailing_list_id = 'admin-alerts'`)
      .get() as { n: number };
    expect(alertCount.n).toBe(0);
  });
});

describe('workQueueService.claim', () => {
  it('claims an open unclaimed item and is a no-op on a second claim', () => {
    const id = enqueueRoutine(ENTITY_MEMBER_ID);

    const first = svc.claim({ queueItemId: id, adminMemberId: ADMIN_A });
    expect(first.status).toBe('claimed');
    const row = testDb.prepare(`SELECT claimed_by_member_id, claimed_at FROM work_queue_items WHERE id = ?`).get(id) as Record<string, unknown>;
    expect(row.claimed_by_member_id).toBe(ADMIN_A);
    expect(row.claimed_at).not.toBeNull();

    // A second admin cannot steal an already-claimed item.
    const second = svc.claim({ queueItemId: id, adminMemberId: ADMIN_B });
    expect(second.status).toBe('already_claimed_or_closed');
    const after = testDb.prepare(`SELECT claimed_by_member_id FROM work_queue_items WHERE id = ?`).get(id) as Record<string, unknown>;
    expect(after.claimed_by_member_id).toBe(ADMIN_A);
  });
});

describe('workQueueService.sendAdminQueueDigests', () => {
  it("emails each admin the open routine items, excluding items another admin has claimed", () => {
    const item1 = enqueueRoutine(ENTITY_MEMBER_ID);
    const item2 = enqueueRoutine(ADMIN_B); // any entity id; second open item
    svc.claim({ queueItemId: item1, adminMemberId: ADMIN_A });

    const result = svc.sendAdminQueueDigests();
    expect(result.openRoutineItems).toBe(2);
    expect(result.sent).toBe(2);

    // Admin A claimed item1, so A's digest carries both items.
    const aBody = digestBodyFor(ADMIN_A);
    expect(aBody).toContain(`Entity ID: ${ENTITY_MEMBER_ID}`);
    expect(aBody).toContain(`Entity ID: ${ADMIN_B}`);
    // Admin B's digest drops item1 (claimed by A) and keeps the unclaimed item2.
    const bBody = digestBodyFor(ADMIN_B);
    expect(bBody).not.toContain(`Entity ID: ${ENTITY_MEMBER_ID}`);
    expect(bBody).toContain(`Entity ID: ${ADMIN_B}`);
  });

  it('sends nothing when there are no open routine items', () => {
    const result = svc.sendAdminQueueDigests();
    expect(result).toEqual({ admins: 0, sent: 0, openRoutineItems: 0 });
    expect(digestBodyFor(ADMIN_A)).toBeUndefined();
  });
});

describe('workQueueService.escalateStaleQueueItems', () => {
  it('escalates an open unclaimed item once past the stale threshold, and never twice', () => {
    const id = enqueueRoutine(ENTITY_MEMBER_ID);
    // Age the item beyond the default three-day threshold.
    testDb.prepare(`UPDATE work_queue_items SET opened_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`).run(id);

    const first = svc.escalateStaleQueueItems();
    expect(first.escalated).toBe(1);
    const escBody = testDb.prepare(
      `SELECT body_text FROM outbox_emails WHERE template_key = 'admin_queue_stale_escalation' AND recipient_member_id = ?`,
    ).get(ADMIN_A) as { body_text: string } | undefined;
    expect(escBody?.body_text).toContain(`Entity ID: ${ENTITY_MEMBER_ID}`);

    // A second pass finds the same still-open item but the idempotency key
    // suppresses a repeat send, so nothing new is escalated.
    const second = svc.escalateStaleQueueItems();
    expect(second.escalated).toBe(0);
  });

  it('does not escalate a claimed item', () => {
    const id = enqueueRoutine(ENTITY_MEMBER_ID);
    testDb.prepare(`UPDATE work_queue_items SET opened_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`).run(id);
    svc.claim({ queueItemId: id, adminMemberId: ADMIN_A });

    const result = svc.escalateStaleQueueItems();
    expect(result.escalated).toBe(0);
  });
});

describe('operationsPlatformService.runAdminQueueDigest cadence gate', () => {
  it('runs on the first pass and skips a same-day second pass at the default daily cadence', async () => {
    enqueueRoutine(ENTITY_MEMBER_ID);

    const first = await ops.runAdminQueueDigest();
    expect(first.skipped).toBe(false);
    expect(first.sent).toBeGreaterThan(0);

    const second = await ops.runAdminQueueDigest();
    expect(second.skipped).toBe(true);
  });
});
