import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3128');

const OWNER_ID   = 'member_contact_owner';
const OWNER_SLUG = 'contact_owner';
const STRANGER_ID   = 'member_contact_stranger';
const STRANGER_SLUG = 'contact_stranger';

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
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  // Wipe queue rows between tests so rate-limit counters reset cleanly.
  // audit_entries is immutable (append-only); tests scope their audit
  // assertions to the most recent entry for the relevant member.
  const db = new BetterSqlite3(dbPath);
  db.prepare(`DELETE FROM work_queue_items`).run();
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

  it('shows success banner when ?submitted=1', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWNER_SLUG}/contact-admin?submitted=1`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Your request has been sent to the IFPA administrator');
  });
});

describe('POST /members/:slug/contact-admin', () => {
  it('happy path → 303 to ?submitted=1 + queue row inserted + audit entry', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'display_name_correction', message: 'Please fix the spelling of my surname.' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${OWNER_SLUG}/contact-admin?submitted=1`);

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
    await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'other', message: payload });
    const db = new BetterSqlite3(dbPath);
    const meta = db
      .prepare(`SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'support.contact_request_submitted' ORDER BY created_at DESC LIMIT 1`)
      .get(OWNER_ID) as { metadata_json: string } | undefined;
    expect(meta).toBeDefined();
    const parsed = JSON.parse(meta!.metadata_json);
    expect(parsed.message).toBe(payload);
    db.close();
  });
});
