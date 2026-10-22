import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt, insertMailingListSubscription } from '../fixtures/factories';
import { rowPin, snapshotIds } from '../fixtures/rowPinning';

const { dbPath } = setTestEnv('3128');

// Every audit row about one member or written by them. The work-queue row is the
// record of a contact request, so a submission adds none of these; several
// cases submit as the same member and the ledger is append-only, so each case
// compares against the ids present before its own POST.
const contactAudit = (memberId: string) =>
  rowPin(
    'audit_entries',
    'entity_id = ? OR actor_member_id = ?',
    [memberId, memberId],
  );

const OWNER_ID    = 'member_contact_owner';
const OWNER_SLUG  = 'contact_owner';
const STRANGER_ID    = 'member_contact_stranger';
const STRANGER_SLUG  = 'contact_stranger';
const ADMIN_SUBSCRIBER_ID = 'admin_alerts_subscriber_1';

// Typed text carrying every class the write-time cleaner removes or repairs: a
// tag, a C1 control character, a decomposed accent, and CRLF paragraph breaks
// with four blank lines between them.
const DIRTY_MULTI_LINE = 'First <i>para</i>\u009b Café\r\n\r\n\r\n\r\n\r\nSecond para';
const CLEAN_MULTI_LINE = 'First para Café\n\nSecond para';

let createApp: Awaited<ReturnType<typeof importApp>>;

function ownerCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: OWNER_ID })}`;
}

function strangerCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: STRANGER_ID })}`;
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
  insertMailingListSubscription(db, {
    id: `mls-${ADMIN_SUBSCRIBER_ID}`,
    list_slug: 'admin-alerts',
    member_id: ADMIN_SUBSCRIBER_ID,
  });
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
    expect(res.text).toContain('Contact IFPA Admin');
    expect(res.text).toContain('name="category"');
    expect(res.text).toContain('name="message"');
  });

  // The profile's identity control links here naming what it is for, so the
  // form opens with that topic chosen rather than asking a question the click
  // already answered.
  it('opens with the topic a link asked for already selected', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWNER_SLUG}/contact-admin?category=identity_link_issue`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/value="identity_link_issue"\s+selected/);
  });

  it('ignores a topic that is not one of its own, rather than refusing the form', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWNER_SLUG}/contact-admin?category=not_a_real_topic`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('not_a_real_topic');
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
    const flashSet = (post.get('Set-Cookie') ?? []).find((c: string) =>
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
  it('happy path → 303 + flash cookie + queue row inserted, and no audit row', async () => {
    const app = createApp();
    const snapDb = new BetterSqlite3(dbPath, { readonly: true });
    const beforeSubmit = snapshotIds(snapDb, contactAudit(OWNER_ID));
    snapDb.close();
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

    // The queue row above is the record; a second copy in the audit log would
    // be a duplicate the log's viewer and export have to read past.
    expect([...snapshotIds(db, contactAudit(OWNER_ID))].filter((id) => !beforeSubmit.has(id))).toHaveLength(0);
    db.close();
  });

  it('stores the full message body in the purgeable detail_text column, with reason_text as the truncated preview', async () => {
    const longMsg = 'B'.repeat(450);
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'other', message: longMsg });
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath);
    const row = db
      .prepare(`SELECT reason_text, detail_text FROM work_queue_items WHERE entity_id = ?`)
      .get(OWNER_ID) as { reason_text: string; detail_text: string };
    db.close();
    expect(row.detail_text).toBe(longMsg);
    expect(row.reason_text.length).toBeLessThan(longMsg.length);
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

  it('adversarial: the cleaned message persists only in the mutable queue row, never in the audit log', async () => {
    // The audit ledger is append-only and exempt from PII purge, so
    // member-authored free text (which can carry emails, phone numbers,
    // anything) must never land in it. The operational copy lives in the
    // resolvable work-queue row, with its markup stripped before it is stored.
    const app = createApp();
    const payload = '<script>alert(1)</script>Please help';
    const cleaned = 'alert(1)Please help';
    const dbSnap = new BetterSqlite3(dbPath, { readonly: true });
    const beforeIds = snapshotIds(dbSnap, contactAudit(OWNER_ID));
    dbSnap.close();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'other', message: payload });
    expect(res.status).toBe(303);
    const db = new BetterSqlite3(dbPath);
    const queueRow = db
      .prepare(`SELECT reason_text, detail_text FROM work_queue_items WHERE entity_id = ? AND status = 'open'`)
      .get(OWNER_ID) as { reason_text: string; detail_text: string } | undefined;
    expect(queueRow).toBeDefined();
    expect(queueRow!.detail_text).toBe(cleaned);
    expect(queueRow!.reason_text).toBe(`Other: ${cleaned}`);
    expect([...snapshotIds(db, contactAudit(OWNER_ID))].filter((id) => !beforeIds.has(id))).toHaveLength(0);
    const allAudit = db.prepare('SELECT reason_text, metadata_json FROM audit_entries').all();
    expect(JSON.stringify(allAudit)).not.toContain('alert(1)');
    db.close();

    const adminCookie = `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_SUBSCRIBER_ID, role: 'admin' })}`;
    const page = await request(app).get('/admin/work-queue').set('Cookie', adminCookie);
    expect(page.status).toBe(200);
    expect(page.text).toContain(cleaned);
    expect(page.text).not.toContain('<script>alert');
  });

  // Defect caught: control characters, stacked blank lines or a decomposed
  // accent reach the stored request, or the queue summary is cut from the raw
  // text and shows the administrator markup the stored message no longer has.
  it('stores the message cleaned, and derives the queue summary from the cleaned text', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'other', message: DIRTY_MULTI_LINE });
    expect(res.status).toBe(303);
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db
      .prepare(`SELECT reason_text, detail_text FROM work_queue_items WHERE entity_id = ?`)
      .get(OWNER_ID) as { reason_text: string; detail_text: string };
    db.close();
    expect(row.detail_text).toBe(CLEAN_MULTI_LINE);
    expect(row.reason_text).toBe(`Other: ${CLEAN_MULTI_LINE}`);
  });

  // Defect caught: a message of markup alone passes the required check on its
  // raw length and opens a request with nothing in it.
  it('refuses a message that is only markup, and opens nothing', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'other', message: '<p> </p>\r\n<br>' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Message is required');
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM work_queue_items`).get() as { n: number }).n;
    db.close();
    expect(n).toBe(0);
  });

  // Defect caught: the repeat lookup compares the raw resubmission with the
  // cleaned stored request, so a re-post differing only in what the cleaner
  // removes opens a second copy for an administrator to work.
  it('recognises a re-post that cleans to the same words as the same request', async () => {
    const app = createApp();
    const send = (message: string) => request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'other', message });
    expect((await send(DIRTY_MULTI_LINE)).status).toBe(303);
    expect((await send(DIRTY_MULTI_LINE.replace('\r\n\r\n\r\n\r\n\r\n', '\n\n\n'))).status).toBe(303);
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM work_queue_items WHERE entity_id = ?`).get(OWNER_ID) as { n: number }).n;
    db.close();
    expect(n).toBe(1);
  });

  // Defect caught: a double-click or back-button re-post opens a second copy of
  // the same request for an administrator to work, records it twice, or shows
  // the member an error for a request that went through.
  it('the same request submitted twice opens one queue item and no audit row, with the same redirect and flash', async () => {
    const app = createApp();
    const snap = new BetterSqlite3(dbPath, { readonly: true });
    const beforeAudit = snapshotIds(snap, contactAudit(OWNER_ID));
    snap.close();
    const send = () => request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'display_name_correction', message: 'Please fix my surname, it is Smyth.' });
    const flashOf = (res: { get(h: string): string[] | undefined }): string | undefined =>
      (res.get('Set-Cookie') ?? []).find((c) => c.startsWith('footbag_flash='))?.split(';')[0];

    const first = await send();
    const second = await send();
    expect(first.status).toBe(303);
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    expect(flashOf(first)).toBeDefined();
    expect(flashOf(second)).toBe(flashOf(first));

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const items = db.prepare(`SELECT id FROM work_queue_items WHERE entity_id = ?`).all(OWNER_ID);
    const added = snapshotIds(db, contactAudit(OWNER_ID));
    const outbox = db.prepare(`SELECT COUNT(*) AS n FROM outbox_emails`).get() as { n: number };
    db.close();
    expect(items).toHaveLength(1);
    expect([...added].filter((id) => !beforeAudit.has(id))).toHaveLength(0);
    expect(outbox.n).toBe(0);
  });

  // Defect caught: a repeated submit is counted against the three-open cap, so
  // a member who double-clicked is refused their next real request, or a
  // member at the cap who re-posts their last request is told they have too
  // many open.
  it('a repeat takes no slot under the open-request cap, while different words are a new request', async () => {
    const app = createApp();
    const send = (message: string) => request(app)
      .post(`/members/${OWNER_SLUG}/contact-admin`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ category: 'other', message });
    const openCount = (): number => {
      const db = new BetterSqlite3(dbPath, { readonly: true });
      const row = db.prepare(
        `SELECT COUNT(*) AS n FROM work_queue_items WHERE entity_id = ? AND status = 'open'`,
      ).get(OWNER_ID) as { n: number };
      db.close();
      return row.n;
    };

    expect((await send('first matter')).status).toBe(303);
    expect((await send('second matter')).status).toBe(303);
    expect((await send('second matter')).status).toBe(303);
    expect(openCount()).toBe(2);

    // Different words are a new request, and the repeat above left the third
    // slot free for it.
    expect((await send('third matter')).status).toBe(303);
    expect(openCount()).toBe(3);

    // At the cap, re-posting the last request still reports its first outcome.
    const repeatAtCap = await send('third matter');
    expect(repeatAtCap.status).toBe(303);
    expect(repeatAtCap.headers.location).toBe(`/members/${OWNER_SLUG}/contact-admin`);
    expect(openCount()).toBe(3);

    expect((await send('fourth matter')).status).toBe(429);
  });

  it('a routine contact request opens a queue row and sends no per-event admin email', async () => {
    // A member contact request is a routine task type: it is read on the
    // dashboard and rolled into the admin digest, never emailed per event to
    // every administrator.
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

    const outboxRows = db.prepare(`
      SELECT id FROM outbox_emails WHERE mailing_list_id = 'admin-alerts'
    `).all() as Array<Record<string, unknown>>;
    db.close();
    expect(outboxRows.length).toBe(0);
  });
});
