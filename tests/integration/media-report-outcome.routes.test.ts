/**
 * The outcome mail to each member who reported a media item, sent when an
 * administrator decides the item on the takedown queue.
 *
 * A reporter is told the outcome, removed or left up, and nothing else: the
 * administrator's reason is addressed to the uploader. Only the members whose
 * reports the decision closes are told, so a reporter whose report was already
 * cleared hears nothing more, and an administrator who reported the item and
 * then decided it is not mailed about their own decision. A decision repeated
 * on an item already settled tells nobody a second time.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp, seedEmailTemplates } from '../fixtures/testDb';
import {
  insertMember,
  completeOnboarding,
  insertMediaItem,
  insertMediaFlag,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4176');

let createApp: Awaited<ReturnType<typeof importApp>>;

const TEMPLATE = 'media_report_outcome_reporter';

const ADMIN_ID = 'ro_admin';
const UPLOADER_ID = 'ro_uploader';
const REPORTER_A = 'ro_reporter_a';
const REPORTER_B = 'ro_reporter_b';
// Reported the item earlier, and that report was already cleared.
const CLEARED_REPORTER = 'ro_reporter_cleared';

const ITEM_REMOVED = 'media_ro_removed';
const ITEM_KEPT = 'media_ro_kept';

const REMOVE_REASON = 'Zqx removal reason written to the uploader only';
const KEEP_REASON = 'Zqx keep reason written to the uploader only';

const admin = () =>
  `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;

function outcomeMail(mediaReporter: string): Array<{ body_text: string; idempotency_key: string }> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return db.prepare(
      'SELECT body_text, idempotency_key FROM outbox_emails'
      + ' WHERE template_key = ? AND recipient_member_id = ?',
    ).all(TEMPLATE, mediaReporter) as Array<{ body_text: string; idempotency_key: string }>;
  } finally {
    db.close();
  }
}

function decisionAuditId(mediaId: string, actionType: string): string[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return (db.prepare(
      "SELECT id FROM audit_entries WHERE entity_type = 'media_item' AND entity_id = ? AND action_type = ?",
    ).all(mediaId, actionType) as Array<{ id: string }>).map((r) => r.id);
  } finally {
    db.close();
  }
}

function decide(mediaId: string, decision: 'delete' | 'no-action', reason: string) {
  return request(createApp())
    .post(`/admin/media-flags/${mediaId}/${decision}`)
    .set('Cookie', admin())
    .type('form')
    .send({ reason });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedEmailTemplates(db);
  insertMember(db, { id: ADMIN_ID, slug: 'ro_admin', display_name: 'RO Admin', login_email: 'ro-admin@example.com', is_admin: 1 });
  insertMember(db, { id: UPLOADER_ID, slug: 'ro_uploader', display_name: 'RO Uploader', login_email: 'ro-uploader@example.com' });
  insertMember(db, { id: REPORTER_A, slug: 'ro_reporter_a', display_name: 'RO Reporter A', login_email: 'ro-a@example.com' });
  insertMember(db, { id: REPORTER_B, slug: 'ro_reporter_b', display_name: 'RO Reporter B', login_email: 'ro-b@example.com' });
  insertMember(db, { id: CLEARED_REPORTER, slug: 'ro_reporter_c', display_name: 'RO Reporter C', login_email: 'ro-c@example.com' });
  for (const id of [ADMIN_ID, UPLOADER_ID, REPORTER_A, REPORTER_B, CLEARED_REPORTER]) completeOnboarding(db, id);

  for (const id of [ITEM_REMOVED, ITEM_KEPT]) {
    insertMediaItem(db, { id, uploader_member_id: UPLOADER_ID, caption: `Caption ${id}`, tags: ['#by_ro_uploader'] });
    insertMediaFlag(db, { media_id: id, reporter_member_id: REPORTER_A, reason_code: 'spam' });
    insertMediaFlag(db, { media_id: id, reporter_member_id: REPORTER_B, reason_code: 'spam' });
    // The deciding administrator reported the item too.
    insertMediaFlag(db, { media_id: id, reporter_member_id: ADMIN_ID, reason_code: 'spam' });
    insertMediaFlag(db, {
      media_id: id, reporter_member_id: CLEARED_REPORTER, reason_code: 'spam',
      status: 'resolved', resolved_at: new Date().toISOString(),
      resolved_by_admin_member_id: ADMIN_ID, resolution_label: 'cleared',
      resolution_reason: 'Not a rule the item breaks.',
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('a Remove decision tells each reporter the item was removed', () => {
  it('mails each member whose report it closed once, keyed on the decision, without the reason', async () => {
    const res = await decide(ITEM_REMOVED, 'delete', REMOVE_REASON);
    expect(res.status).toBe(303);

    const [auditId] = decisionAuditId(ITEM_REMOVED, 'media.deleted');
    expect(auditId).toBeDefined();
    for (const reporter of [REPORTER_A, REPORTER_B]) {
      const mail = outcomeMail(reporter).filter((m) => m.idempotency_key.includes(auditId));
      // A reporter left untold reports the item again, or concludes nobody looked.
      expect(mail, reporter).toHaveLength(1);
      expect(mail[0].idempotency_key).toBe(`${TEMPLATE}:${auditId}:${reporter}`);
      // A reporter told the wrong outcome believes an item is gone that is up.
      expect(mail[0].body_text).toContain('removed it.');
      // The reason is addressed to the uploader; a reporter reading it learns
      // what was said about another member.
      expect(mail[0].body_text).not.toContain(REMOVE_REASON);
    }
  });

  it('does not mail the administrator who reported the item and then decided it', () => {
    expect(outcomeMail(ADMIN_ID)).toHaveLength(0);
  });

  it('does not mail a reporter whose report was already cleared', () => {
    expect(outcomeMail(CLEARED_REPORTER)).toHaveLength(0);
  });

  it('tells nobody a second time when the decision is repeated', async () => {
    const before = [REPORTER_A, REPORTER_B].map((r) => outcomeMail(r).length);
    const res = await decide(ITEM_REMOVED, 'delete', REMOVE_REASON);
    expect(res.status).toBe(303);
    expect([REPORTER_A, REPORTER_B].map((r) => outcomeMail(r).length)).toEqual(before);
  });
});

describe('a No Action decision tells each reporter the item stays up', () => {
  it('mails each member whose report it closed once, without the reason', async () => {
    const res = await decide(ITEM_KEPT, 'no-action', KEEP_REASON);
    expect(res.status).toBe(303);

    const [auditId] = decisionAuditId(ITEM_KEPT, 'media.flag_resolved');
    expect(auditId).toBeDefined();
    for (const reporter of [REPORTER_A, REPORTER_B]) {
      const mail = outcomeMail(reporter).filter((m) => m.idempotency_key.includes(auditId));
      expect(mail, reporter).toHaveLength(1);
      expect(mail[0].body_text).toContain('decided to leave it up.');
      expect(mail[0].body_text).not.toContain('removed it.');
      expect(mail[0].body_text).not.toContain(KEEP_REASON);
    }
    expect(outcomeMail(ADMIN_ID)).toHaveLength(0);
    expect(outcomeMail(CLEARED_REPORTER)).toHaveLength(0);
  });

  it('tells nobody a second time when the decision is repeated', async () => {
    const before = [REPORTER_A, REPORTER_B].map((r) => outcomeMail(r).length);
    await decide(ITEM_KEPT, 'no-action', KEEP_REASON);
    expect([REPORTER_A, REPORTER_B].map((r) => outcomeMail(r).length)).toEqual(before);
    expect(decisionAuditId(ITEM_KEPT, 'media.flag_resolved')).toHaveLength(1);
  });
});
