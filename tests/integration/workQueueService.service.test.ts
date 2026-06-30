/**
 * The single admin work-queue enqueue path. enqueue must insert the
 * work_queue_items row AND fan out the admin-alerts notification in one call, so
 * no work item can ever be created without its admin notification. The alert
 * carries task type and entity id only.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('4012');

const TS = '2025-01-01T00:00:00.000Z';
const SUBSCRIBER_ID = 'wq_admin_sub';
const ENTITY_MEMBER_ID = 'wq_entity_member';

let testDb: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/workQueueService').workQueueService;

beforeAll(async () => {
  testDb = createTestDb(dbPath);
  insertMember(testDb, {
    id: SUBSCRIBER_ID, slug: 'wq_admin_sub',
    display_name: 'Alerts Sub', login_email: 'wq-sub@example.com', is_admin: 1,
  });
  insertMember(testDb, {
    id: ENTITY_MEMBER_ID, slug: 'wq_entity_member', login_email: 'wq-entity@example.com',
  });
  testDb.prepare(`
    INSERT INTO mailing_list_subscriptions (
      id, created_at, created_by, updated_at, updated_by, version,
      mailing_list_id, member_id, status, status_updated_at
    ) VALUES (?, ?, 'system', ?, 'system', 1, 'admin-alerts', ?, 'subscribed', ?)
  `).run('wq_mls_sub', TS, TS, SUBSCRIBER_ID, TS);

  await importApp();
  svc = (await import('../../src/services/workQueueService')).workQueueService;
});

afterAll(() => {
  testDb.close();
  cleanupTestDb(dbPath);
});

describe('workQueueService.enqueue', () => {
  it('inserts the work item and fans out the admin-alerts notification in one call', () => {
    const { id } = svc.enqueue({
      actorId:       ENTITY_MEMBER_ID,
      queueCategory: 'membership',
      taskType:      'member_contact_request',
      entityType:    'member',
      entityId:      ENTITY_MEMBER_ID,
      priority:      5,
      reasonText:    'Other: ping',
      detailText:    'ping',
    });

    const row = testDb
      .prepare(`SELECT task_type, entity_type, entity_id, status, priority, queue_category FROM work_queue_items WHERE id = ?`)
      .get(id) as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    expect(row!.task_type).toBe('member_contact_request');
    expect(row!.entity_type).toBe('member');
    expect(row!.entity_id).toBe(ENTITY_MEMBER_ID);
    expect(row!.status).toBe('open');
    expect(row!.priority).toBe(5);
    expect(row!.queue_category).toBe('membership');

    const outbox = testDb
      .prepare(`SELECT subject, body_text, idempotency_key FROM outbox_emails WHERE mailing_list_id = 'admin-alerts' AND recipient_member_id = ?`)
      .get(SUBSCRIBER_ID) as Record<string, unknown> | undefined;
    expect(outbox).toBeDefined();
    expect(outbox!.subject).toBe('New admin queue item: member_contact_request');
    // Task type + entity id only — no member contact fields or message content.
    expect(outbox!.body_text).toBe(`Task type: member_contact_request\nEntity ID: ${ENTITY_MEMBER_ID}`);
    expect(outbox!.idempotency_key).toBe(`admin-alerts:member_contact_request:${id}:${SUBSCRIBER_ID}`);
  });
});
