/**
 * Administrator clearing of a member media item's caption, through the admin
 * media edit address that also curates the platform's own items, and the link
 * to it from the takedown queue.
 *
 * A member's caption is their own words, so an administrator clears it rather
 * than rewriting it. The act takes a mandatory reason, appends an audit row
 * naming the administrator, the item and the caption before and after, and
 * emails the member, together. A caption already empty writes nothing; an
 * administrator's own upload is refused here, since they edit it as its owner;
 * and the platform's own item still opens the curator's edit form.
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
import { expectCsrfReject } from '../fixtures/expectCsrfReject';

const { dbPath } = setTestEnv('4177');

let createApp: Awaited<ReturnType<typeof importApp>>;

const ADMIN_ID = 'cc_admin';
const UPLOADER_ID = 'cc_uploader';
const SYSTEM_ID = 'cc_system';

const ITEM = 'media_cc_member';
const ITEM_EMPTY = 'media_cc_empty';
const ITEM_ADMIN_OWN = 'media_cc_admin_own';
const ITEM_SYSTEM = 'media_cc_system';
const ITEM_FLAGGED_BARE = 'media_cc_flagged_bare';

const CAPTION = 'Zqx a caption naming another member in abuse';
const REASON = 'The caption harasses another member.';

const cookie = (memberId: string, role: 'admin' | 'member') =>
  `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
const admin = () => cookie(ADMIN_ID, 'admin');
const editPath = (id: string) => `/admin/curator/media/${id}/edit`;

function db<T>(fn: (conn: BetterSqlite3.Database) => T): T {
  const conn = new BetterSqlite3(dbPath);
  try {
    return fn(conn);
  } finally {
    conn.close();
  }
}

function captionOf(mediaId: string): string | null {
  return (db((conn) => conn.prepare('SELECT caption FROM media_items WHERE id = ?').get(mediaId)) as
    { caption: string | null }).caption;
}

function moderations(mediaId: string): Array<{
  id: string; actor_member_id: string; reason_text: string; metadata_json: string;
}> {
  return db((conn) => conn.prepare(
    "SELECT id, actor_member_id, reason_text, metadata_json FROM audit_entries"
    + " WHERE action_type = 'media.member_item_moderated' AND entity_type = 'media_item' AND entity_id = ?",
  ).all(mediaId)) as Array<{ id: string; actor_member_id: string; reason_text: string; metadata_json: string }>;
}

function noticesTo(memberId: string): Array<{ idempotency_key: string; body_text: string }> {
  return db((conn) => conn.prepare(
    "SELECT idempotency_key, body_text FROM outbox_emails"
    + " WHERE recipient_member_id = ? AND template_key = 'member_record_corrected'",
  ).all(memberId)) as Array<{ idempotency_key: string; body_text: string }>;
}

function clear(mediaId: string, body: Record<string, string>, as = admin()) {
  return request(createApp()).post(editPath(mediaId)).set('Cookie', as).type('form').send(body);
}

beforeAll(async () => {
  const conn = createTestDb(dbPath);
  seedEmailTemplates(conn);
  insertMember(conn, { id: ADMIN_ID, slug: 'cc_admin', display_name: 'CC Admin', login_email: 'cc-admin@example.com', is_admin: 1 });
  insertMember(conn, { id: UPLOADER_ID, slug: 'cc_uploader', display_name: 'CC Uploader', login_email: 'cc-uploader@example.com' });
  insertMember(conn, { id: SYSTEM_ID, slug: 'cc_footbag_hacky', display_name: 'Footbag Hacky', real_name: 'Footbag Hacky', is_system: 1 });
  for (const id of [ADMIN_ID, UPLOADER_ID]) completeOnboarding(conn, id);

  insertMediaItem(conn, { id: ITEM, uploader_member_id: UPLOADER_ID, caption: CAPTION, tags: ['#by_cc_uploader'] });
  insertMediaItem(conn, { id: ITEM_EMPTY, uploader_member_id: UPLOADER_ID, caption: null, tags: ['#by_cc_uploader'] });
  insertMediaItem(conn, { id: ITEM_ADMIN_OWN, uploader_member_id: ADMIN_ID, caption: 'The admin\'s own words', tags: ['#by_cc_admin'] });
  insertMediaItem(conn, { id: ITEM_SYSTEM, uploader_member_id: SYSTEM_ID, caption: 'A curated clip', tags: ['#cc_curated'] });
  insertMediaItem(conn, { id: ITEM_FLAGGED_BARE, uploader_member_id: UPLOADER_ID, caption: null, tags: ['#by_cc_uploader'] });
  // Both reported, so both appear on the takedown queue.
  insertMediaFlag(conn, { media_id: ITEM, reporter_member_id: ADMIN_ID, reason_code: 'illegal_or_harassing' });
  insertMediaFlag(conn, { media_id: ITEM_FLAGGED_BARE, reporter_member_id: ADMIN_ID, reason_code: 'spam' });
  conn.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the takedown queue links a reported caption to where it is cleared', () => {
  it('links an item with a caption, and not one without', async () => {
    const res = await request(createApp()).get('/admin/media-flags').set('Cookie', admin());
    expect(res.status).toBe(200);
    // Both items are listed, so the absence below is not an empty queue.
    expect(res.text).toContain(`/admin/media-flags/${ITEM}/delete`);
    expect(res.text).toContain(`/admin/media-flags/${ITEM_FLAGGED_BARE}/delete`);
    // An administrator facing a report about words alone, with no way to clear
    // them, can only take the whole item down.
    expect(res.text).toContain(`href="${editPath(ITEM)}"`);
    // A link to clear a caption that is not there leads to a page with nothing to do.
    expect(res.text).not.toContain(`href="${editPath(ITEM_FLAGGED_BARE)}"`);
  });
});

describe('the edit address serves a member item as moderation, and a platform item as curation', () => {
  it('offers a member item a reason to clear its caption, and no caption field to rewrite', async () => {
    const res = await request(createApp()).get(editPath(ITEM)).set('Cookie', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain(CAPTION);
    const at = res.text.indexOf(`action="${editPath(ITEM)}"`);
    expect(at).toBeGreaterThan(-1);
    const form = res.text.slice(at, res.text.indexOf('</form>', at));
    expect(form).toContain('name="reason"');
    // A caption field here would let an administrator put words under the member's name.
    expect(form).not.toContain('name="caption"');
    expect(res.text).not.toContain('name="caption"');
  });

  it('still opens the curator edit form for the platform\'s own item', async () => {
    const res = await request(createApp()).get(editPath(ITEM_SYSTEM)).set('Cookie', admin());
    expect(res.status).toBe(200);
    // The curator's own item lost to the moderation page could not be edited at all.
    expect(res.text).toContain('name="caption"');
    expect(res.text).toContain('A curated clip');
  });
});

describe('a clear without a reason, or of the administrator\'s own upload, is refused', () => {
  it('refuses a missing reason at 422 with the form still offered, and writes nothing', async () => {
    const res = await clear(ITEM, { reason: '  ' });
    expect(res.status).toBe(422);
    expect(res.text).toContain(`action="${editPath(ITEM)}"`);
    expect(res.text).toContain('name="reason"');
    expect(captionOf(ITEM)).toBe(CAPTION);
    expect(moderations(ITEM)).toHaveLength(0);
    expect(noticesTo(UPLOADER_ID)).toHaveLength(0);
  });

  it('refuses the administrator\'s own upload at 422, writing nothing', async () => {
    const res = await clear(ITEM_ADMIN_OWN, { reason: REASON });
    expect(res.status).toBe(422);
    expect(captionOf(ITEM_ADMIN_OWN)).toBe('The admin\'s own words');
    expect(moderations(ITEM_ADMIN_OWN)).toHaveLength(0);
  });

  it('reports an already empty caption without writing anything', async () => {
    const res = await clear(ITEM_EMPTY, { reason: REASON });
    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(editPath(ITEM_EMPTY));
    expect(moderations(ITEM_EMPTY)).toHaveLength(0);
    expect(noticesTo(UPLOADER_ID)).toHaveLength(0);
  });
});

describe('the clear empties the caption, records it, and tells the member', () => {
  it('empties it even when a caption is posted, and returns to the edit address', async () => {
    const res = await clear(ITEM, { reason: REASON, caption: 'Words an administrator wrote.' });
    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(editPath(ITEM));
    // Cleared, never rewritten.
    expect(captionOf(ITEM)).toBeNull();
  });

  it('audits the caption before and after with the reason, the item and the administrator', () => {
    const rows = moderations(ITEM);
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_member_id).toBe(ADMIN_ID);
    expect(rows[0].reason_text).toBe(REASON);
    // Without the text before, a clear made in error cannot be reviewed or undone.
    expect(JSON.parse(rows[0].metadata_json)).toEqual({
      uploaderMemberId: UPLOADER_ID, before: { caption: CAPTION }, after: { caption: '' },
    });
  });

  it('emails the uploader the reason, keyed on the act', () => {
    const [audit] = moderations(ITEM);
    const mail = noticesTo(UPLOADER_ID);
    expect(mail).toHaveLength(1);
    expect(mail[0].idempotency_key).toBe(`member_record_corrected:${audit.id}:${UPLOADER_ID}`);
    expect(mail[0].body_text).toContain(REASON);
  });

  it('writes nothing more when the clear is submitted again', async () => {
    const res = await clear(ITEM, { reason: REASON });
    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(editPath(ITEM));
    expect(moderations(ITEM)).toHaveLength(1);
    expect(noticesTo(UPLOADER_ID)).toHaveLength(1);
  });
});

describe('the clear is administrator-only and same-origin', () => {
  it('refuses a member, redirects a visitor, and refuses a cross-origin post', async () => {
    const member = await clear(ITEM_EMPTY, { reason: REASON }, cookie(UPLOADER_ID, 'member'));
    expect(member.status).toBe(403);
    const visitor = await request(createApp()).post(editPath(ITEM_EMPTY)).type('form').send({ reason: REASON });
    expect(visitor.status).toBe(302);
    expect(visitor.headers['location']).toContain('/login');
    await expectCsrfReject(createApp(), 'post', editPath(ITEM_EMPTY), { body: { reason: REASON }, cookie: admin() });
  });
});
