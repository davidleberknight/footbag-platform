import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3128');

const OWNER_ID    = 'member_contact_owner';
const OWNER_SLUG  = 'contact_owner';
const STRANGER_ID    = 'member_contact_stranger';
const STRANGER_SLUG  = 'contact_stranger';
const ADMIN_SUBSCRIBER_ID = 'admin_alerts_subscriber_1';

let createApp: Awaited<ReturnType<typeof importApp>>;

function ownerCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: OWNER_ID })}`;
}

function strangerCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: STRANGER_ID })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: OWNER_ID,    slug: OWNER_SLUG,    display_name: 'Contact Owner',    real_name: 'Contact Owner',    login_email: 'owner@example.com' });
  insertMember(db, { id: STRANGER_ID, slug: STRANGER_SLUG, display_name: 'Contact Stranger', real_name: 'Contact Stranger', login_email: 'stranger@example.com' });
  insertMember(db, {
    id:           ADMIN_SUBSCRIBER_ID,
    slug:         'admin_alerts_sub_one',
    display_name: 'Admin Alerts Subscriber',
    login_email:  'admin-alerts-sub@example.com',
    is_admin:     1,
  });
  // Subscribe the admin to admin-alerts so the M2 fan-out has a target.
  db.prepare(`
    INSERT INTO mailing_list_subscriptions (
      id, created_at, created_by, updated_at, updated_by, version,
      mailing_list_id, member_id, status, status_updated_at
    ) VALUES (?, ?, 'system', ?, 'system', 1, 'admin-alerts', ?, 'subscribed', ?)
  `).run(
    `mls-${ADMIN_SUBSCRIBER_ID}`,
    '2025-01-01T00:00:00.000Z',
    '2025-01-01T00:00:00.000Z',
    ADMIN_SUBSCRIBER_ID,
    '2025-01-01T00:00:00.000Z',
  );
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  // Wipe queue rows + outbox between tests so rate-limit counters reset
  // cleanly and admin-alerts fan-out assertions are deterministic.
  // audit_entries is immutable (append-only); tests scope their audit
  // assertions to the most recent entry for the relevant member.
  const db = new BetterSqlite3(dbPath);
  db.prepare(`DELETE FROM work_queue_items`).run();
  db.prepare(`DELETE FROM outbox_emails`).run();
  db.close();
});

describe('GET /members/:slug/contact-admin', () => {
  it('owner → 200 with form fields', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Contact IFPA admin');
    expect(res.text).toContain('name="category"');
    expect(res.text).toContain('name="message"');
    expect(res.text).toContain('Display name correction');
    expect(res.text).toContain('Profile URL correction');
    expect(res.text).toContain('Tier-status question');
    expect(res.text).toContain('Identity-link issue');
    expect(res.text).toContain('Other');
  });

  it('non-owner → 404 (anti-enumeration)', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', strangerCookie());
    expect(res.status).toBe(404);
  });

  it('unauthenticated → 302 redirect to login', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${OWNER_SLUG}/contact-admin`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('shows success banner after a POST→GET round-trip (flash cookie)', async () => {
    const app = createApp();
    const agent = request.agent(app);
    const post = await agent
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'other', message: 'banner round-trip' });
    expect(post.status).toBe(303);
    expect(post.headers.location).toBe(`/members/${OWNER_SLUG}/contact-admin`);
    const res = await agent
      .get(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Your request has been sent to the IFPA administrator');
  });

  it('tampered contact-submitted flash cookie yields no banner', async () => {
    const app = createApp();
    const post = await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'other', message: 'tamper probe' });
    expect(post.status).toBe(303);
    const flashSet = (post.headers['set-cookie'] ?? []).find((c: string) =>
      c.startsWith('footbag_flash='),
    );
    expect(flashSet).toBeTruthy();
    // Corrupt the trailing signature so cookie-parser's HMAC check fails; the
    // value drops from req.signedCookies and the banner must not render.
    const flashValue = flashSet!.split(';')[0];
    const tampered = `${flashValue.slice(0, -4)}AAAA`;
    const res = await request(app)
      .get(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', [ownerCookie(), tampered].join('; '));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Your request has been sent to the IFPA administrator');
  });
});

describe('POST /members/:slug/contact-admin', () => {
  it('happy path → 303 + flash cookie + queue row inserted + audit entry', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'display_name_correction', message: 'Please fix the spelling of my surname.' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${OWNER_SLUG}/contact-admin`);

    const db = new BetterSqlite3(dbPath);
    const queueRow = db
      .prepare(`SELECT id, queue_category, task_type, entity_type, entity_id, status, reason_text FROM work_queue_items WHERE entity_id = ?`)
      .get(OWNER_ID) as Record<string, unknown> | undefined;
    expect(queueRow).toBeDefined();
    expect(queueRow!.queue_category).toBe('membership');
    expect(queueRow!.task_type).toBe('member_contact_request');
    expect(queueRow!.entity_type).toBe('member');
    expect(queueRow!.status).toBe('open');
    expect(queueRow!.reason_text).toMatch(/Display name correction/);

    const auditRow = db
      .prepare(`SELECT action_type, category, actor_type FROM audit_entries WHERE entity_id = ? AND action_type = 'support.contact_request_submitted' ORDER BY created_at DESC LIMIT 1`)
      .get(OWNER_ID) as Record<string, unknown> | undefined;
    expect(auditRow).toBeDefined();
    expect(auditRow!.action_type).toBe('support.contact_request_submitted');
    expect(auditRow!.category).toBe('support');
    expect(auditRow!.actor_type).toBe('member');
    db.close();
  });

  it('invalid category → 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'bogus_category', message: 'hi' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Invalid category');
  });

  it('empty message → 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'other', message: '   ' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Message is required');
  });

  it('exactly 2000-char message → 303 (upper boundary accept)', async () => {
    const app = createApp();
    const exact = 'a'.repeat(2000);
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'other', message: exact });
    expect(res.status).toBe(303);
  });

  it('oversized message (>2000 chars) → 422', async () => {
    const app = createApp();
    const big = 'a'.repeat(2001);
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'other', message: big });
    expect(res.status).toBe(422);
    expect(res.text).toContain('2000 characters or fewer');
  });

  it('4th open request → 429', async () => {
    const app = createApp();
    for (let i = 0; i < 3; i++) {
      const r = await request(app)
        .post(`/members/${OWNER_SLUG}/contact-admin`)
        .set('Cookie', ownerCookie())
        .type('form')
        .send({ category: 'other', message: `request ${i + 1}` });
      expect(r.status).toBe(303);
    }
    const fourth = await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'other', message: 'fourth' });
    expect(fourth.status).toBe(429);
    expect(fourth.text).toContain('You already have 3 open requests');
  });

  it('non-owner POST → 404', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', strangerCookie())
      .type('form')
      .send({ category: 'other', message: 'sneaky' });
    expect(res.status).toBe(404);
  });

  it('unauthenticated POST → 302 to login', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .type('form')
      .send({ category: 'other', message: 'no auth' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('adversarial: HTML in message body persists in audit metadata; escaped when rendered back', async () => {
    const app = createApp();
    const payload = '<script>alert(1)</script>';
    // Snapshot existing audit-entry ids BEFORE the POST. Prior tests in this
    // file write `support.contact_request_submitted` rows for OWNER_ID with
    // millisecond-resolution created_at (per src/services/auditService.ts).
    // Under parallel-load timestamp ties, ORDER BY created_at DESC LIMIT 1
    // is non-deterministic; snapshot-diff picks the row this test inserted.
    const dbSnap = new BetterSqlite3(dbPath, { readonly: true });
    const beforeIds = new Set(
      (dbSnap
        .prepare(`SELECT id FROM audit_entries WHERE entity_id = ? AND action_type = 'support.contact_request_submitted'`)
        .all(OWNER_ID) as Array<{ id: string }>).map((r) => r.id),
    );
    dbSnap.close();
    await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'other', message: payload });
    const db = new BetterSqlite3(dbPath);
    const newRow = (db
      .prepare(`SELECT id, metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'support.contact_request_submitted'`)
      .all(OWNER_ID) as Array<{ id: string; metadata_json: string }>).find(
      (r) => !beforeIds.has(r.id),
    );
    expect(newRow).toBeDefined();
    const parsed = JSON.parse(newRow!.metadata_json);
    expect(parsed.message).toBe(payload);
    db.close();
  });

  it('enqueues admin-alerts fan-out: one outbox row per subscribed admin, body carries task type + entity id only', async () => {
    // M2: per US §198 Global Behaviors, every work_queue_items insert fires
    // an admin-alerts notification containing only task_type + entity_id.
    const app = createApp();
    await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'other', message: 'route the fan-out' });

    const db = new BetterSqlite3(dbPath);
    const queueRow = db
      .prepare(`SELECT id FROM work_queue_items WHERE entity_id = ? AND status = 'open' LIMIT 1`)
      .get(OWNER_ID) as { id: string } | undefined;
    expect(queueRow).toBeDefined();
    const queueItemId = queueRow!.id;

    const outboxRows = db.prepare(`
      SELECT recipient_email, recipient_member_id, mailing_list_id, subject, body_text, idempotency_key
      FROM outbox_emails
      WHERE mailing_list_id = 'admin-alerts'
    `).all() as Array<Record<string, unknown>>;
    db.close();
    expect(outboxRows.length).toBe(1);
    const row = outboxRows[0];
    expect(row.recipient_member_id).toBe(ADMIN_SUBSCRIBER_ID);
    expect(row.recipient_email).toBe('admin-alerts-sub@example.com');
    expect(row.subject).toBe('New admin queue item: member_contact_request');
    expect(row.body_text).toBe(`Task type: member_contact_request\nEntity ID: ${queueItemId}`);
    expect(row.idempotency_key).toBe(`admin-alerts:member_contact_request:${queueItemId}:${ADMIN_SUBSCRIBER_ID}`);
    // Body must not contain sensitive member data per US §198.
    expect(row.body_text).not.toContain('owner@example.com');
    expect(row.body_text).not.toContain('Contact Owner');
    expect(row.body_text).not.toContain('route the fan-out');
  });
});
