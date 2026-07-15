import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertOutboxEmail, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3242');

const ADMIN_ID    = 'el_admin_001';
const ADMIN_SLUG  = 'el_admin_one';
const MEMBER_ID   = 'el_member_001';
const MEMBER_SLUG = 'el_member_one';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID,  slug: ADMIN_SLUG,  display_name: 'EL Admin',  real_name: 'EL Admin',  login_email: 'el-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'EL Member', real_name: 'EL Member', login_email: 'el-member@example.com' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  withDb((db) => db.prepare(`DELETE FROM outbox_emails`).run());
});

describe('GET /admin/email-log', () => {
  it('unauthenticated → 302 to /login', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/email-log');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('non-admin → 403', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/email-log').set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('admin, no matching rows → 200 with empty summary', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/email-log').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Email Log');
    expect(res.text).toContain('No matching emails.');
  });

  it('admin, with rows → 200 listing subject, template, status, and recipient', async () => {
    withDb((db) => insertOutboxEmail(db, {
      recipient_email: 'el-member@example.com', recipient_member_id: MEMBER_ID,
      subject: 'Verify your email', template_key: 'account_verify', status: 'sent',
      sent_at: '2026-06-01T00:01:00.000Z',
    }));
    const app = createApp();
    const res = await request(app).get('/admin/email-log').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Verify your email');
    expect(res.text).toContain('account_verify');
    expect(res.text).toContain('el-member@example.com');
    // recipient_member_id resolves to a member profile link.
    expect(res.text).toContain(`href="/members/${MEMBER_SLUG}"`);
  });

  it('shows the unpopulated template body, never the recipient-rendered message body', async () => {
    withDb((db) => insertOutboxEmail(db, {
      recipient_email: 'el-member@example.com', subject: 'Vouch note',
      template_key: 'vouch_confirmation', status: 'pending',
      body_text: 'SECRET-BODY-CONTENT from Jane Voucher',
    }));
    const app = createApp();
    const res = await request(app).get('/admin/email-log').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Vouch note');
    // The template body appears with its merge fields left literal...
    expect(res.text).toContain('Template body (merge fields unpopulated)');
    expect(res.text).toContain('{voucherName}');
    expect(res.text).toContain('{expiryDate}');
    // ...and the stored rendered body (real personal data) never does.
    expect(res.text).not.toContain('SECRET-BODY-CONTENT');
    expect(res.text).not.toContain('Jane Voucher');
  });

  it('a row with an unregistered template key renders with no body disclosure', async () => {
    withDb((db) => insertOutboxEmail(db, {
      recipient_email: 'el-member@example.com', subject: 'Legacy-keyed row',
      template_key: 'some_retired_key', status: 'sent',
    }));
    const app = createApp();
    const res = await request(app).get('/admin/email-log').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Legacy-keyed row');
    expect(res.text).not.toContain('Template body (merge fields unpopulated)');
  });

  it('status filter narrows to matching rows', async () => {
    withDb((db) => {
      insertOutboxEmail(db, { recipient_email: 'a@example.com', subject: 'Sent one', template_key: 'payment_receipt_succeeded', status: 'sent' });
      insertOutboxEmail(db, { recipient_email: 'b@example.com', subject: 'Failed one', template_key: 'payment_receipt_failed', status: 'failed', last_error: 'SES rejected' });
    });
    const app = createApp();
    const res = await request(app).get('/admin/email-log?status=failed').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Failed one');
    expect(res.text).toContain('SES rejected');
    expect(res.text).not.toContain('Sent one');
  });

  it('template filter narrows to matching rows', async () => {
    withDb((db) => {
      insertOutboxEmail(db, { recipient_email: 'a@example.com', subject: 'Receipt mail', template_key: 'payment_receipt_succeeded', status: 'sent' });
      insertOutboxEmail(db, { recipient_email: 'b@example.com', subject: 'Role change mail', template_key: 'admin_role_granted', status: 'sent' });
    });
    const app = createApp();
    const res = await request(app).get('/admin/email-log?template=admin_role_granted').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Role change mail');
    expect(res.text).not.toContain('Receipt mail');
  });

  it('recipient filter matches a substring of recipient_email', async () => {
    withDb((db) => {
      insertOutboxEmail(db, { recipient_email: 'alice@footbag.org', subject: 'To Alice', template_key: 'honor_congratulation_hof', status: 'sent' });
      insertOutboxEmail(db, { recipient_email: 'bob@example.com', subject: 'To Bob', template_key: 'honor_congratulation_bap', status: 'sent' });
    });
    const app = createApp();
    const res = await request(app).get('/admin/email-log?recipient=footbag.org').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('To Alice');
    expect(res.text).not.toContain('To Bob');
  });

  it('escapes HTML in subject (no stored XSS)', async () => {
    withDb((db) => insertOutboxEmail(db, {
      recipient_email: 'el-member@example.com', subject: '<script>alert(1)</script>',
      template_key: 'password_changed', status: 'pending',
    }));
    const app = createApp();
    const res = await request(app).get('/admin/email-log').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;');
  });
});
