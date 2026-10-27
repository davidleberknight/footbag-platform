/**
 * An administrator's notice to the member their act changed is queued inside
 * the act's own transaction: the change and its notice commit or roll back
 * together, the notice is best-effort, and one act notifies each recipient
 * once while a later act notifies again.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3271');

const LIVE_ID = 'act-notice-live';
const DECEASED_ID = 'act-notice-deceased';

/* eslint-disable @typescript-eslint/consistent-type-imports */
let email: typeof import('../../src/services/emailService');
let transaction: typeof import('../../src/db/db').transaction;
/* eslint-enable @typescript-eslint/consistent-type-imports */

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: LIVE_ID, login_email: 'act-live@example.com' });
  insertMember(db, { id: DECEASED_ID, login_email: 'act-deceased@example.com', is_deceased: 1 });
  db.close();
  email = await import('../../src/services/emailService');
  transaction = (await import('../../src/db/db')).transaction;
});

afterAll(() => cleanupTestDb(dbPath));

function noticesFor(memberId: string): string[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return (db.prepare(
      "SELECT idempotency_key FROM outbox_emails WHERE recipient_member_id = ? AND template_key = 'admin_role_granted'",
    ).all(memberId) as Array<{ idempotency_key: string }>).map((r) => r.idempotency_key).sort();
  } finally {
    db.close();
  }
}

function notice(memberId: string, actId: string): boolean {
  return email.emailService.sendActNotice({
    template: 'admin_role_change', params: { action: 'granted' }, memberId, actId,
  });
}

describe('administrator act notice', () => {
  // Defect caught: a sender queues its notice after the act committed, where
  // a crash in between loses the notice of a change that stands.
  it('refuses to queue outside a transaction', () => {
    expect(() => notice(LIVE_ID, 'audit_outside')).toThrow(/inside its act's transaction/);
    expect(noticesFor(LIVE_ID)).not.toContain(email.actNoticeKey('admin_role_change', 'audit_outside', LIVE_ID));
  });

  // Defect caught: a notice survives the rollback of the act it announces, so
  // the member is told of a change that never happened.
  it('rolls back with its act, and commits with it', () => {
    expect(() => transaction(() => {
      notice(LIVE_ID, 'audit_rolled_back');
      throw new Error('the act fails after its notice was queued');
    })).toThrow('the act fails');
    expect(noticesFor(LIVE_ID)).not.toContain(email.actNoticeKey('admin_role_change', 'audit_rolled_back', LIVE_ID));

    expect(transaction(() => notice(LIVE_ID, 'audit_committed'))).toBe(true);
    expect(noticesFor(LIVE_ID)).toContain(email.actNoticeKey('admin_role_change', 'audit_committed', LIVE_ID));
  });

  // Defect caught: a repeat of one act mails the member twice, or a second act
  // collapses onto the first one's key and its notice is never sent.
  it('notifies once per act and again for a later act', () => {
    transaction(() => notice(LIVE_ID, 'audit_first'));
    expect(transaction(() => notice(LIVE_ID, 'audit_first')), 'the repeat still reports the notice queued').toBe(true);
    transaction(() => notice(LIVE_ID, 'audit_second'));
    const keys = noticesFor(LIVE_ID);
    expect(keys.filter((k) => k === email.actNoticeKey('admin_role_change', 'audit_first', LIVE_ID))).toHaveLength(1);
    expect(keys).toContain(email.actNoticeKey('admin_role_change', 'audit_second', LIVE_ID));
  });

  // Defect caught: a recipient who cannot be mailed either receives the
  // notice or makes the administrator's act fail with it.
  it('skips a deceased member and lets the act commit', () => {
    let committed = false;
    const queued = transaction(() => {
      const sent = notice(DECEASED_ID, 'audit_deceased');
      committed = true;
      return sent;
    });
    expect(committed).toBe(true);
    expect(queued).toBe(false);
    expect(noticesFor(DECEASED_ID)).toEqual([]);
  });
});
