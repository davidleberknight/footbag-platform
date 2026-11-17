/**
 * The admin work-queue service: enqueue routing, claim, and the two scheduled
 * notification passes.
 *
 * Enqueue routes by urgency: a routine task type inserts the work_queue_items
 * row and sends NO per-event email; admins read it on the dashboard and the
 * digest. An urgent task type also emails the admin list on enqueue, and is left
 * out of both the digest and the stale escalation because it has already
 * broadcast. An administrator claims an item to signal
 * they are handling it, which drops the item from every other administrator's
 * digest. An item left open and unclaimed past the stale threshold escalates
 * once with a single email to all admins. Every notification carries task type
 * and entity id only.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMailingListSubscription,
  insertMember,
  insertMemberMessage,
  insertSystemConfig,
  insertWorkQueueItem,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4012');

const ADMIN_A = 'wq_admin_a';
const ADMIN_B = 'wq_admin_b';
const ENTITY_MEMBER_ID = 'wq_entity_member';

let testDb: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/workQueueService').workQueueService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let ops: typeof import('../../src/services/operationsPlatformService').operationsPlatformService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let runRegistryJobNow: typeof import('../../src/testkit/runRegistryJob').runRegistryJobNow;

function subscribeToAdminAlerts(subId: string, memberId: string): void {
  insertMailingListSubscription(testDb, {
    id: subId,
    list_slug: 'admin-alerts',
    member_id: memberId,
    status: 'subscribed',
  });
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
  runRegistryJobNow = (await import('../../src/testkit/runRegistryJob')).runRegistryJobNow;
});

afterAll(() => {
  testDb.close();
  cleanupTestDb(dbPath);
});

beforeEach(() => {
  // Each test seeds its own items and inspects its own outbox; clearing keeps
  // them isolated and resets the digest/escalation idempotency keys.
  testDb.prepare('DELETE FROM outbox_emails').run();
  // A question hangs off the item that raised it by a required foreign key, so
  // the messages go first or the items cannot be cleared at all.
  testDb.prepare('DELETE FROM member_messages').run();
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

  it('refuses a task type that has no declaration, and writes no row', () => {
    // A type nobody declared has no label, no evidence and no action, so its
    // card would reach an administrator with nothing on it to press. Refusing
    // the insert is what keeps that state from existing at all.
    expect(() => svc.enqueue({
      actorId: 'system', queueCategory: 'membership', taskType: 'undeclared_task_type',
      entityType: 'member', entityId: ENTITY_MEMBER_ID, priority: 0,
      reasonText: 'no descriptor', detailText: null,
    })).toThrow(/undeclared_task_type/);

    const count = testDb
      .prepare(`SELECT COUNT(*) AS n FROM work_queue_items WHERE task_type = 'undeclared_task_type'`)
      .get() as { n: number };
    expect(count.n).toBe(0);
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
    expect(result).toEqual({ admins: 0, sent: 0, openRoutineItems: 0, topicDigests: {} });
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

  it('does not escalate an item that is waiting on the member it asked', () => {
    // An item blocked on someone outside the administrator team is not being
    // neglected. Escalating it alerts the whole team about work none of them can
    // advance, while the card on screen says it is waiting on the member.
    const id = enqueueRoutine(ENTITY_MEMBER_ID);
    testDb.prepare(`UPDATE work_queue_items SET opened_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`).run(id);
    insertMemberMessage(testDb, {
      id: 'mmsg-stale-wait',
      recipient_member_id: ENTITY_MEMBER_ID,
      sender_admin_member_id: ADMIN_A,
      work_queue_item_id: id,
      subject: 'Waiting on you',
      body_text: 'Could you confirm something for us?',
      expected_answer_kind: 'acknowledge',
    });

    expect(svc.escalateStaleQueueItems().escalated).toBe(0);

    // Once the member answers, the matter is the team's again and escalates.
    testDb.prepare(`
      UPDATE member_messages
      SET status = 'answered', outcome = 'acknowledged', answered_at = '2020-01-03T00:00:00.000Z'
      WHERE id = 'mmsg-stale-wait'
    `).run();
    expect(svc.escalateStaleQueueItems().escalated).toBe(1);
  });
});

describe('operationsPlatformService.runAdminQueueDigest', () => {
  it('mails the open routine items to the administrators', async () => {
    enqueueRoutine(ENTITY_MEMBER_ID);
    const first = await ops.runAdminQueueDigest();
    expect(first.sent).toBeGreaterThan(0);
  });
});

describe('area digests in the digest pass', () => {
  const FINANCE_ADDRESS = 'queue-finance@footbag.org';
  const AREA_KEY = /^admin-queue-topic-digest:\d{4}-\d{2}-\d{2}:finance$/;

  // The configuration store is append-only, so each setting supersedes the last
  // by a strictly later start time; a tie would leave two current rows.
  let settingSeq = 0;
  function switchArea(topic: string, value: '0' | '1'): void {
    settingSeq += 1;
    const at = new Date(Date.UTC(2001, 0, 1) + settingSeq * 1000).toISOString();
    insertSystemConfig(testDb, {
      config_key: `work_queue_topic_route_${topic}`, value_json: value, created_at: at, effective_start_at: at,
    });
  }

  /** One item in each position the area digest must tell apart. */
  function seedAreaItems(): void {
    insertWorkQueueItem(testDb, {
      queue_category: 'payments', task_type: 'reconciliation_discrepancy', entity_id: 'fin-open',
    });
    const claimedByB = insertWorkQueueItem(testDb, {
      queue_category: 'payments', task_type: 'membership_overcharge_review', entity_id: 'fin-claimed',
    });
    svc.claim({ queueItemId: claimedByB, adminMemberId: ADMIN_B });
    const lapsed = insertWorkQueueItem(testDb, {
      queue_category: 'payments', task_type: 'payout_failed', entity_id: 'fin-lapsed-claim',
    });
    svc.claim({ queueItemId: lapsed, adminMemberId: ADMIN_B });
    // No action can produce a claim already in the past, so it is aged here.
    testDb.prepare(`UPDATE work_queue_items SET claimed_at = '2020-01-01T00:00:00.000Z' WHERE id = ?`).run(lapsed);
    insertWorkQueueItem(testDb, {
      queue_category: 'payments', task_type: 'partial_refund_review', entity_id: 'fin-parked',
      parked_at: '2026-01-01T00:00:00.000Z', parked_by_member_id: ADMIN_A, park_reason: 'Waiting on the bank.',
    });
    insertWorkQueueItem(testDb, {
      queue_category: 'membership', task_type: 'member_contact_request', entity_id: 'mem-open',
    });
    insertWorkQueueItem(testDb, {
      queue_category: 'media', task_type: 'media_flag_review', entity_type: 'media_item', entity_id: 'shared-open',
    });
  }

  function outboxRows(): Array<{ template_key: string; recipient_email: string; recipient_member_id: string | null; idempotency_key: string }> {
    return testDb.prepare(
      `SELECT template_key, recipient_email, recipient_member_id, idempotency_key FROM outbox_emails
        ORDER BY recipient_email`,
    ).all() as Array<{ template_key: string; recipient_email: string; recipient_member_id: string | null; idempotency_key: string }>;
  }

  function allAreasOff(): void {
    for (const topic of ['finance', 'membership', 'platform', 'sanctioning', 'freestyle', 'moderation']) switchArea(topic, '0');
  }

  // Defect caught: an area address is mailed although no administrator turned
  // its switch on, so on a fresh database a group that does not exist yet
  // bounces the first digest. Runs first in this block, before any switch row.
  it('with no switch ever set, sends exactly the per-administrator digests and nothing to an area address', () => {
    const switchRows = testDb.prepare(
      `SELECT COUNT(*) AS n FROM system_config WHERE config_key LIKE 'work_queue_topic_route_%'`,
    ).get() as { n: number };
    expect(switchRows.n, 'no area switch has been set yet').toBe(0);
    seedAreaItems();

    const result = svc.sendAdminQueueDigests();

    expect(result.topicDigests).toEqual({});
    const rows = outboxRows();
    // ordering-is-the-contract: rows are sorted by recipient address in the query.
    expect(rows.map((r) => [r.template_key, r.recipient_email, r.idempotency_key.replace(/:\d{4}-\d{2}-\d{2}:/, ':<date>:')])).toEqual([
      ['admin_queue_digest', 'wq-a@example.com', `admin-queue-digest:<date>:${ADMIN_A}`],
      ['admin_queue_digest', 'wq-b@example.com', `admin-queue-digest:<date>:${ADMIN_B}`],
    ]);
  });

  // Defect caught: the area digest lists another area's items, a shared item, a
  // parked item or one a colleague is actively handling, so the group chases
  // work that is not theirs or not waiting.
  it("sends one digest to each switched-on area's address listing only its unclaimed, unparked items", () => {
    allAreasOff();
    seedAreaItems();
    switchArea('finance', '1');
    switchArea('membership', '1');
    // An area that is on with nothing to list gets no digest.
    switchArea('platform', '1');

    const result = svc.sendAdminQueueDigests();

    expect(result.topicDigests).toEqual({ finance: 2, membership: 1 });
    const areaRows = testDb.prepare(
      `SELECT template_key, recipient_email, recipient_member_id, idempotency_key, body_text
         FROM outbox_emails WHERE recipient_email LIKE 'queue-%'`,
    ).all() as Array<{ template_key: string; recipient_email: string; recipient_member_id: string | null; idempotency_key: string; body_text: string }>;
    expect(areaRows.map((r) => r.recipient_email).sort()).toEqual([FINANCE_ADDRESS, 'queue-membership@footbag.org']);
    const membership = areaRows.find((r) => r.recipient_email === 'queue-membership@footbag.org')!;
    expect(membership.body_text).toContain('Entity ID: mem-open');
    expect(membership.body_text).not.toContain('Entity ID: fin-open');
    const row = areaRows.find((r) => r.recipient_email === FINANCE_ADDRESS)!;
    expect(row.template_key).toBe('admin_queue_topic_digest');
    expect(row.recipient_email).toBe(FINANCE_ADDRESS);
    expect(row.recipient_member_id).toBeNull();
    expect(row.idempotency_key).toMatch(AREA_KEY);
    expect(row.body_text).toContain('Entity ID: fin-open');
    // A claim that has lapsed is nobody's live claim, so the item is listed.
    expect(row.body_text).toContain('Entity ID: fin-lapsed-claim');
    for (const absent of ['fin-claimed', 'fin-parked', 'mem-open', 'shared-open']) {
      expect(row.body_text, `${absent} must not be in the finance digest`).not.toContain(`Entity ID: ${absent}`);
    }
    // The per-administrator digests still go out beside it.
    expect(outboxRows().filter((r) => r.template_key === 'admin_queue_digest')).toHaveLength(2);
  });

  // Defect caught: a second pass on the same day mails the group again.
  it('sends an area at most one digest a day', () => {
    allAreasOff();
    seedAreaItems();
    switchArea('finance', '1');

    svc.sendAdminQueueDigests();
    svc.sendAdminQueueDigests();

    const n = (testDb.prepare(
      `SELECT COUNT(*) AS n FROM outbox_emails WHERE template_key = 'admin_queue_topic_digest'`,
    ).get() as { n: number }).n;
    expect(n).toBe(1);
  });

  // Defect caught: the scheduled run sends the area digest but the job-run row
  // records nothing of it, so an operator cannot see that a group was mailed.
  it('records the area digests in the job-run row when run through the job registry', async () => {
    allAreasOff();
    insertWorkQueueItem(testDb, {
      queue_category: 'payments', task_type: 'reconciliation_discrepancy', entity_id: 'fin-scheduled',
    });
    switchArea('finance', '1');

    const outcome = await runRegistryJobNow('SYS_Admin_Queue_Digest');

    expect(outcome.status).toBe('ran');
    const run = testDb.prepare(
      `SELECT status, details_json FROM system_job_runs WHERE job_name = 'SYS_Admin_Queue_Digest'`,
    ).get() as { status: string; details_json: string };
    expect(run.status).toBe('succeeded');
    expect(JSON.parse(run.details_json).topicDigests).toEqual({ finance: 1 });
    const sent = testDb.prepare(
      `SELECT COUNT(*) AS n FROM outbox_emails WHERE template_key = 'admin_queue_topic_digest' AND recipient_email = ?`,
    ).get(FINANCE_ADDRESS) as { n: number };
    expect(sent.n).toBe(1);
  });
});
