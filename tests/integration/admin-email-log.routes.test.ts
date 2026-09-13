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
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
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

  // A fan-out writes one row per recipient inside the same millisecond, so a
  // block of rows sharing a timestamp is the normal case rather than a rarity.
  // The listing must still have one defined order, because an order the
  // database is free to choose can repeat a row on one page and drop another
  // from every page. Identifiers descend alongside the timestamp, so the three
  // rows below come back in the reverse of the order they were written.
  it('orders a block of emails sharing one timestamp by identifier, newest first', async () => {
    withDb((db) => {
      insertOutboxEmail(db, { id: 'el_tie_a', created_at: '2026-04-01T00:00:00.000Z', subject: 'Fanout alpha', status: 'sent' });
      insertOutboxEmail(db, { id: 'el_tie_b', created_at: '2026-04-01T00:00:00.000Z', subject: 'Fanout bravo', status: 'sent' });
      insertOutboxEmail(db, { id: 'el_tie_c', created_at: '2026-04-01T00:00:00.000Z', subject: 'Fanout charlie', status: 'sent' });
    });
    const app = createApp();
    const res = await request(app).get('/admin/email-log').set('Cookie', adminCookie());
    expect(res.status).toBe(200);

    const charlie = res.text.indexOf('Fanout charlie');
    const bravo   = res.text.indexOf('Fanout bravo');
    const alpha   = res.text.indexOf('Fanout alpha');
    expect(charlie).toBeGreaterThan(-1);
    expect(charlie).toBeLessThan(bravo);
    expect(bravo).toBeLessThan(alpha);
  });
});

// A message the sender has given up on is the one thing on this surface an
// administrator can act on, and until now nothing could: the row held the
// dashboard's urgent signal until retention deleted it three months later.
// Reviewing settles it without claiming the message was delivered.
describe('POST /admin/email-log/:id/review', () => {
  function outboxRow(id: string): {
    status: string; reviewed_at: string | null; reviewed_by_member_id: string | null;
    review_note: string | null; version: number;
  } {
    return withDb((db) => db
      .prepare('SELECT status, reviewed_at, reviewed_by_member_id, review_note, version FROM outbox_emails WHERE id = ?')
      .get(id)) as {
        status: string; reviewed_at: string | null; reviewed_by_member_id: string | null;
        review_note: string | null; version: number;
      };
  }

  function auditRows(entityId: string): { action_type: string; actor_member_id: string | null; reason_text: string | null; metadata_json: string }[] {
    return withDb((db) => db
      .prepare("SELECT action_type, actor_member_id, reason_text, metadata_json FROM audit_entries WHERE entity_type = 'outbox_email' AND entity_id = ? ORDER BY id")
      .all(entityId)) as { action_type: string; actor_member_id: string | null; reason_text: string | null; metadata_json: string }[];
  }

  it('redirects an unauthenticated visitor and reviews nothing', async () => {
    withDb((db) => insertOutboxEmail(db, { id: 'el_rev_anon', status: 'dead_letter' }));
    const res = await request(createApp())
      .post('/admin/email-log/el_rev_anon/review')
      .type('form').send({ note: 'Letting myself in.' });
    expect(res.status).toBe(302);
    expect(res.headers['location']).toContain('/login');
    expect(outboxRow('el_rev_anon').reviewed_at).toBeNull();
  });

  it('403s a signed-in non-admin and reviews nothing', async () => {
    withDb((db) => insertOutboxEmail(db, { id: 'el_rev_member', status: 'dead_letter' }));
    const res = await request(createApp())
      .post('/admin/email-log/el_rev_member/review')
      .set('Cookie', memberCookie())
      .type('form').send({ note: 'Not mine to settle.' });
    expect(res.status).toBe(403);
    expect(outboxRow('el_rev_member').reviewed_at).toBeNull();
  });

  it('records the review with its note and audits it, leaving the delivery status alone', async () => {
    withDb((db) => insertOutboxEmail(db, {
      id: 'el_rev_ok', status: 'dead_letter', template_key: 'account_verify',
      recipient_member_id: MEMBER_ID, recipient_email: null,
    }));

    const res = await request(createApp())
      .post('/admin/email-log/el_rev_ok/review')
      .set('Cookie', adminCookie())
      .type('form').send({ note: 'Address does not exist yet; nothing to resend.' });

    expect(res.status).toBe(303);
    const row = outboxRow('el_rev_ok');
    expect(row.reviewed_at).not.toBeNull();
    expect(row.reviewed_by_member_id).toBe(ADMIN_ID);
    expect(row.review_note).toBe('Address does not exist yet; nothing to resend.');
    // The review is a judgement, not a delivery claim.
    expect(row.status).toBe('dead_letter');
    expect(row.version).toBe(2);

    const audit = auditRows('el_rev_ok');
    expect(audit).toHaveLength(1);
    expect(audit[0].action_type).toBe('email.dead_letter_reviewed');
    expect(audit[0].actor_member_id).toBe(ADMIN_ID);
    expect(JSON.parse(audit[0].metadata_json).recipientMemberId).toBe(MEMBER_ID);
    // The permanent ledger names the recipient by id, never by address.
    expect(audit[0].metadata_json).not.toContain('@example.com');
  });

  it('shows the review on the row afterwards and offers no second form', async () => {
    withDb((db) => insertOutboxEmail(db, { id: 'el_rev_shown', status: 'dead_letter', subject: 'Already settled' }));
    await request(createApp())
      .post('/admin/email-log/el_rev_shown/review')
      .set('Cookie', adminCookie())
      .type('form').send({ note: 'Seen and settled.' });

    const page = await request(createApp()).get('/admin/email-log').set('Cookie', adminCookie());
    expect(page.text).toContain('Seen and settled.');
    expect(page.text).toContain('Reviewed ');
    expect(page.text).not.toContain('/admin/email-log/el_rev_shown/review');
  });

  it('tells a second administrator that nothing changed, and keeps the first note', async () => {
    withDb((db) => insertOutboxEmail(db, { id: 'el_rev_twice', status: 'dead_letter' }));
    await request(createApp())
      .post('/admin/email-log/el_rev_twice/review')
      .set('Cookie', adminCookie())
      .type('form').send({ note: 'First look.' });

    const second = await request(createApp())
      .post('/admin/email-log/el_rev_twice/review')
      .set('Cookie', adminCookie())
      .type('form').send({ note: 'Second look.' });

    expect(second.status).toBe(303);
    expect(outboxRow('el_rev_twice').review_note).toBe('First look.');
    expect(auditRows('el_rev_twice')).toHaveLength(1);
  });

  it('refuses a review with no note', async () => {
    withDb((db) => insertOutboxEmail(db, { id: 'el_rev_nonote', status: 'dead_letter' }));
    const res = await request(createApp())
      .post('/admin/email-log/el_rev_nonote/review')
      .set('Cookie', adminCookie())
      .type('form').send({ note: '   ' });
    expect(res.status).toBe(422);
    expect(outboxRow('el_rev_nonote').reviewed_at).toBeNull();
  });

  // The banner the administrator reads has to tell the two refusals apart: a
  // message already settled by a colleague is not the same as one the sender
  // may still deliver, and reporting either as the other misleads them about
  // what happened to the message.
  async function bannerAfterPost(id: string, note: string): Promise<string> {
    const app = createApp();
    const post = await request(app)
      .post(`/admin/email-log/${id}/review`)
      .set('Cookie', adminCookie())
      .type('form').send({ note });
    expect(post.status).toBe(303);
    const flash = (post.headers['set-cookie'] as unknown as string[]) ?? [];
    const page = await request(app)
      .get('/admin/email-log')
      .set('Cookie', [adminCookie(), ...flash.map((c) => c.split(';')[0])]);
    return page.text;
  }

  it('reviews nothing on a message the sender may still deliver, and says which refusal it was', async () => {
    withDb((db) => {
      insertOutboxEmail(db, { id: 'el_rev_pending', status: 'pending' });
      insertOutboxEmail(db, { id: 'el_rev_failed',  status: 'failed' });
    });

    for (const id of ['el_rev_pending', 'el_rev_failed']) {
      const banner = await bannerAfterPost(id, 'Too early.');
      expect(banner, `${id} must report nothing to review`).toContain('not in a failed state');
      expect(outboxRow(id).reviewed_at, `${id} must not be reviewable`).toBeNull();
      expect(auditRows(id)).toHaveLength(0);
    }
  });

  it('tells an administrator reviewing a settled message that it was already reviewed', async () => {
    withDb((db) => insertOutboxEmail(db, { id: 'el_rev_settled', status: 'dead_letter' }));
    await request(createApp())
      .post('/admin/email-log/el_rev_settled/review')
      .set('Cookie', adminCookie())
      .type('form').send({ note: 'First look.' });

    const banner = await bannerAfterPost('el_rev_settled', 'Second look.');
    expect(banner).toContain('already reviewed');
  });

  it('offers the control on a message held for manual review as well', async () => {
    withDb((db) => insertOutboxEmail(db, { id: 'el_rev_manual', status: 'manual_review' }));
    const page = await request(createApp()).get('/admin/email-log').set('Cookie', adminCookie());
    expect(page.text).toContain('/admin/email-log/el_rev_manual/review');
  });

  it('persists only the review fields when the body carries extras', async () => {
    withDb((db) => insertOutboxEmail(db, {
      id: 'el_rev_extras', status: 'dead_letter', recipient_email: 'victim@example.com',
    }));

    const res = await request(createApp())
      .post('/admin/email-log/el_rev_extras/review')
      .set('Cookie', adminCookie())
      .type('form')
      .send({
        note: 'Settled.',
        status: 'sent',
        recipient_email: 'attacker@example.com',
        sent_at: '2026-01-01T00:00:00.000Z',
        reviewed_by_member_id: MEMBER_ID,
      });

    expect(res.status).toBe(303);
    const row = withDb((db) => db
      .prepare('SELECT status, recipient_email, sent_at, reviewed_by_member_id FROM outbox_emails WHERE id = ?')
      .get('el_rev_extras')) as { status: string; recipient_email: string; sent_at: string | null; reviewed_by_member_id: string };
    expect(row.status).toBe('dead_letter');
    expect(row.recipient_email).toBe('victim@example.com');
    expect(row.sent_at).toBeNull();
    expect(row.reviewed_by_member_id).toBe(ADMIN_ID);
  });
});
