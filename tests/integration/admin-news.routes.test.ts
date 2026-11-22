/**
 * The administrators' news desk: GET /admin/news, the write form at
 * /admin/news/new, one item's page at /admin/news/:newsId with its edit,
 * hide and restore controls, and the permanent delete behind its confirm page.
 *
 * An administrator lists every item whatever its state, writes a News item
 * after previewing it, edits a News item (an automatic one keeps the event it
 * was created for), never edits a Community post, hides an item with a reason
 * and restores it, and deletes one permanently with a reason. A Community
 * post's member is emailed on a hide or a delete. Every act writes one audit
 * row; an edit records each changed value before and after.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  createTestSessionJwt,
  insertClub,
  insertEvent,
  insertMember,
  insertMemberAnnouncement,
  insertNewsItem,
  insertTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('7404');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-00000000nw01';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-00000000nw02';
const AUTHOR_ID = 'bbbbbbbb-0000-0000-0000-00000000nw03';

const CLUB_TAG = '#club_news_desk_portland';
const EVENT_TAG = '#event_2027_news_desk_jam';
let clubId: string;
let eventId: string;

const admin = () => `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
const member = () => `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;

async function get(path: string, cookie?: string) {
  const req = request(await createApp()).get(path);
  if (cookie) req.set('Cookie', cookie);
  return req;
}
async function post(path: string, cookie: string | undefined, body: Record<string, string>) {
  const req = request(await createApp()).post(path).type('form').send(body);
  if (cookie) req.set('Cookie', cookie);
  return req;
}

interface NewsRow {
  news_type: string; title: string; body: string; published_at: string; is_public: number;
  entity_type: string | null; entity_id: string | null; author_member_id: string | null; version: number;
}
function newsRow(id: string): NewsRow | undefined {
  return db.prepare(
    `SELECT news_type, title, body, published_at, is_public, entity_type, entity_id, author_member_id, version
     FROM news_items WHERE id = ?`,
  ).get(id) as NewsRow | undefined;
}
function audits(id: string, actionType: string) {
  return db.prepare(
    'SELECT actor_member_id, reason_text, metadata_json FROM audit_entries WHERE entity_type = ? AND entity_id = ? AND action_type = ?',
  ).all('news_item', id, actionType) as { actor_member_id: string; reason_text: string | null; metadata_json: string }[];
}
function noticesTo(memberId: string, templateKey: string): number {
  return (db.prepare(
    'SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_member_id = ? AND template_key = ?',
  ).get(memberId, templateKey) as { n: number }).n;
}
function newsIdFrom(location: string): string {
  const m = /^\/admin\/news\/(news_[0-9a-f]+)$/.exec(location);
  if (!m) throw new Error(`not an item page: ${location}`);
  return m[1];
}

const validBody = (overrides: Record<string, string> = {}) => ({
  title: 'Board meeting minutes are out',
  body: 'The board met on **Sunday**.',
  hashtag: '',
  publishedAt: '',
  step: 'save',
  ...overrides,
});

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'nw_admin', display_name: 'News Admin', login_email: 'nw-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'nw_member', display_name: 'News Member', login_email: 'nw-member@example.com' });
  insertMember(db, { id: AUTHOR_ID, slug: 'nw_author', display_name: 'Post Author', login_email: 'nw-author@example.com' });

  const clubTagId = insertTag(db, { standard_type: 'club', tag_normalized: CLUB_TAG, tag_display: CLUB_TAG });
  clubId = insertClub(db, { hashtag_tag_id: clubTagId, name: 'Portland Kickers' });
  const eventTagId = insertTag(db, { tag_normalized: EVENT_TAG, tag_display: EVENT_TAG });
  eventId = insertEvent(db, { hashtag_tag_id: eventTagId, title: 'News Desk Jam', start_date: '2027-02-05', end_date: '2027-02-06' });

  // Old filler, so the list runs to a second page.
  for (let i = 0; i < 52; i += 1) {
    insertNewsItem(db, { id: `news_filler_${String(i).padStart(2, '0')}`, title: `Filler ${i}`, published_at: '2001-01-01T00:00:00.000Z' });
  }

  createApp = await importApp();
});

afterAll(() => { db.close(); cleanupTestDb(dbPath); });

describe('GET /admin/news', () => {
  it('refuses a member who is not an administrator', async () => {
    const res = await get('/admin/news', member());
    expect(res.status).toBe(403);
  });

  it('lists every item newest first with its state and where it came from', async () => {
    insertNewsItem(db, { id: 'news_list_auto', news_type: 'event_published', title: 'List Automatic', entity_type: 'event', entity_id: eventId, published_at: '2026-03-01T00:00:00.000Z' });
    insertNewsItem(db, { id: 'news_list_hidden', title: 'List Hidden', is_public: 0, published_at: '2026-02-01T00:00:00.000Z', author_member_id: ADMIN_ID });
    insertNewsItem(db, { id: 'news_list_future', news_type: 'community_post', title: 'List Scheduled', author_member_id: AUTHOR_ID, published_at: '2099-01-01T00:00:00.000Z' });

    const res = await get('/admin/news', admin());
    expect(res.status).toBe(200);
    const rowOf = (href: string) => {
      const m = new RegExp(`<tr>(?:(?!</tr>).)*href="${href}"(?:(?!</tr>).)*</tr>`, 's').exec(res.text);
      if (!m) throw new Error(`no row for ${href}`);
      return m[0];
    };
    // A hidden or future item missing from the list would leave it unreachable to moderate.
    expect(rowOf('/admin/news/news_list_auto')).toMatch(/<td>Public<\/td>\s*<td>Automatic<\/td>/);
    expect(rowOf('/admin/news/news_list_hidden')).toMatch(/<td>Hidden<\/td>\s*<td>Administrator<\/td>/);
    expect(rowOf('/admin/news/news_list_future')).toMatch(/<td>Community<\/td>\s*<td>Scheduled<\/td>\s*<td>Member<\/td>/);
    // ordering-is-the-contract: the newest publication comes first.
    expect(res.text.indexOf('news_list_future')).toBeLessThan(res.text.indexOf('news_list_auto'));
    expect(res.text.indexOf('news_list_auto')).toBeLessThan(res.text.indexOf('news_list_hidden'));
    expect(res.text).toContain('Page 1 of 2');
  });

  it('pages the older items and answers not found past the last page', async () => {
    const second = await get('/admin/news?page=2', admin());
    expect(second.status).toBe(200);
    expect(second.text).toContain('Page 2 of 2');
    expect(second.text).toContain('/admin/news/news_filler_00');
    const past = await get('/admin/news?page=9', admin());
    expect(past.status).toBe(404);
  });
});

describe('writing a News item', () => {
  it('previews the rendered item and saves nothing', async () => {
    const before = (db.prepare('SELECT COUNT(*) AS n FROM news_items').get() as { n: number }).n;
    const res = await post('/admin/news', admin(), validBody({ step: 'preview', title: 'Preview Only Title' }));
    expect(res.status).toBe(200);
    // The preview is the Markdown rendered, so the admin sees what visitors will.
    expect(res.text).toMatch(/id="admin-news-preview"[\s\S]*<strong>Sunday<\/strong>/);
    expect(res.text).toContain('value="Preview Only Title"');
    expect((db.prepare('SELECT COUNT(*) AS n FROM news_items').get() as { n: number }).n).toBe(before);
  });

  it('saves a News item linked to a club by its hashtag, with its administrator as author', async () => {
    const res = await post('/admin/news', admin(), validBody({ title: 'Kickers open a new park session', hashtag: 'club_news_desk_portland' }));
    expect(res.status).toBe(303);
    const id = newsIdFrom(res.headers.location);
    expect(newsRow(id)).toMatchObject({
      news_type: 'announcement', title: 'Kickers open a new park session', is_public: 1,
      entity_type: 'club', entity_id: clubId, author_member_id: ADMIN_ID,
    });
    const created = audits(id, 'news.item.created');
    expect(created).toHaveLength(1);
    expect(created[0].actor_member_id).toBe(ADMIN_ID);

    // The public page links to the club it is about.
    const page = await get(`/news/${id}`);
    expect(page.status).toBe(200);
    expect(page.text).toMatch(/id="news-club-link" href="\/clubs\/club_news_desk_portland"/);
  });

  it('refuses a missing title and an unknown hashtag, keeps the typing, and saves once corrected', async () => {
    const res = await post('/admin/news', admin(), validBody({ title: '', hashtag: '#no_such_thing', body: 'Kept as typed.' }));
    expect(res.status).toBe(422);
    expect(res.text).toMatch(/<textarea id="news-body" name="body"[^>]*>Kept as typed\.<\/textarea>/);
    expect(res.text.match(/class="form-field-error"/g)).toHaveLength(2);
    expect(res.text).toContain('value="#no_such_thing"');

    const fixed = await post('/admin/news', admin(), validBody({ title: 'Corrected', hashtag: EVENT_TAG, body: 'Kept as typed.' }));
    expect(fixed.status).toBe(303);
    expect(newsRow(newsIdFrom(fixed.headers.location))).toMatchObject({ entity_type: 'event', entity_id: eventId });
  });

  it('reads a publish time with no zone as UTC and keeps a future item off the public pages', async () => {
    const res = await post('/admin/news', admin(), validBody({ title: 'Scheduled post', publishedAt: '2099-01-02 03:04' }));
    expect(res.status).toBe(303);
    const id = newsIdFrom(res.headers.location);
    // A zone shift here would publish the item hours early or late.
    expect(newsRow(id)!.published_at).toBe('2099-01-02T03:04:00.000Z');
    expect((await get(`/news/${id}`)).status).toBe(404);
  });
});

describe('editing an item', () => {
  it('saves a changed News item and records each changed value before and after', async () => {
    const id = insertNewsItem(db, { title: 'Old headline', body: 'Same body.', author_member_id: ADMIN_ID, published_at: '2026-05-01T10:00:00.000Z' });
    const res = await post(`/admin/news/${id}`, admin(), validBody({ title: 'New headline', body: 'Same body.', publishedAt: '2026-05-01 10:00' }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/admin/news/${id}`);
    expect(newsRow(id)).toMatchObject({ title: 'New headline', version: 2 });
    const updated = audits(id, 'news.item.updated');
    expect(updated).toHaveLength(1);
    expect(JSON.parse(updated[0].metadata_json).changes).toEqual({ title: { before: 'Old headline', after: 'New headline' } });

    // Saving the same values again changes nothing and records nothing.
    await post(`/admin/news/${id}`, admin(), validBody({ title: 'New headline', body: 'Same body.', publishedAt: '2026-05-01 10:00' }));
    expect(audits(id, 'news.item.updated')).toHaveLength(1);
    expect(newsRow(id)!.version).toBe(2);
  });

  it('keeps an automatic item linked to its event whatever the form posts', async () => {
    const tagId = insertTag(db, { tag_normalized: '#event_2027_news_desk_open', tag_display: '#event_2027_news_desk_open' });
    const ownEvent = insertEvent(db, { hashtag_tag_id: tagId, title: 'News Desk Open', start_date: '2027-03-05', end_date: '2027-03-06' });
    const id = insertNewsItem(db, { news_type: 'event_published', title: 'New event: News Desk Open', entity_type: 'event', entity_id: ownEvent });
    const page = await get(`/admin/news/${id}`, admin());
    expect(page.text).toMatch(/id="news-hashtag" value="#event_2027_news_desk_open" readonly/);

    const res = await post(`/admin/news/${id}`, admin(), validBody({ title: 'Corrected wording', hashtag: CLUB_TAG }));
    expect(res.status).toBe(303);
    expect(newsRow(id)).toMatchObject({ title: 'Corrected wording', entity_type: 'event', entity_id: ownEvent });
  });

  it('never edits a Community post', async () => {
    const id = insertNewsItem(db, { news_type: 'community_post', title: 'A member wrote this', author_member_id: AUTHOR_ID });
    const page = await get(`/admin/news/${id}`, admin());
    expect(page.status).toBe(200);
    expect(page.text).toContain('id="admin-news-community-post"');
    expect(page.text).not.toContain('name="title"');

    const res = await post(`/admin/news/${id}`, admin(), validBody({ title: 'Rewritten by an admin' }));
    expect(res.status).toBe(404);
    expect(newsRow(id)!.title).toBe('A member wrote this');
  });

  it('answers not found for an unknown item', async () => {
    expect((await get('/admin/news/news_nope', admin())).status).toBe(404);
    expect((await get('/admin/news/news_nope/delete', admin())).status).toBe(404);
    expect((await post('/admin/news/news_nope/reject', admin(), { reason: 'x' })).status).toBe(404);
  });
});

describe('hiding and restoring', () => {
  it('hides a Community post with a reason, emails its member once, and restores it', async () => {
    const id = insertNewsItem(db, { news_type: 'community_post', title: 'Park jam Saturday', author_member_id: AUTHOR_ID, published_at: '2026-04-01T00:00:00.000Z' });

    const refused = await post(`/admin/news/${id}/reject`, admin(), { reason: '' });
    expect(refused.status).toBe(422);
    expect(refused.text).toMatch(/id="news-hide-reason"[\s\S]*?class="form-field-error"/);
    expect(newsRow(id)!.is_public).toBe(1);

    const res = await post(`/admin/news/${id}/reject`, admin(), { reason: 'Opinion, not news.' });
    expect(res.status).toBe(303);
    expect(newsRow(id)!.is_public).toBe(0);
    expect(audits(id, 'news.item.rejected')).toEqual([expect.objectContaining({ reason_text: 'Opinion, not news.' })]);
    expect(noticesTo(AUTHOR_ID, 'news_post_hidden')).toBe(1);
    expect((await get(`/news/${id}`)).status).toBe(404);

    // A second hide changes nothing: no second audit row, no second email.
    await post(`/admin/news/${id}/reject`, admin(), { reason: 'Opinion, not news.' });
    expect(audits(id, 'news.item.rejected')).toHaveLength(1);
    expect(noticesTo(AUTHOR_ID, 'news_post_hidden')).toBe(1);

    const restored = await post(`/admin/news/${id}/restore`, admin(), {});
    expect(restored.status).toBe(303);
    expect(newsRow(id)!.is_public).toBe(1);
    expect(audits(id, 'news.item.restored')).toHaveLength(1);
    expect((await get(`/news/${id}`)).status).toBe(200);
  });

  it('hides a News item without emailing anyone', async () => {
    const id = insertNewsItem(db, { title: 'Admin item to hide', author_member_id: ADMIN_ID });
    const outboxBefore = (db.prepare('SELECT COUNT(*) AS n FROM outbox_emails').get() as { n: number }).n;
    const res = await post(`/admin/news/${id}/reject`, admin(), { reason: 'Posted twice.' });
    expect(res.status).toBe(303);
    expect(newsRow(id)!.is_public).toBe(0);
    expect((db.prepare('SELECT COUNT(*) AS n FROM outbox_emails').get() as { n: number }).n).toBe(outboxBefore);
  });
});

describe('deleting an item', () => {
  it('confirms first, requires a reason, then deletes and emails the member', async () => {
    const id = insertNewsItem(db, { news_type: 'community_post', title: 'Delete me', author_member_id: AUTHOR_ID });
    const announcementId = insertMemberAnnouncement(db, { member_id: AUTHOR_ID, status: 'approved', publish_to: 'feed', news_item_id: id });

    const confirm = await get(`/admin/news/${id}/delete`, admin());
    expect(confirm.status).toBe(200);
    expect(confirm.text).toMatch(new RegExp(`<form method="POST" action="/admin/news/${id}/delete"`));
    expect(confirm.text).toContain('notice notice-warn');

    const refused = await post(`/admin/news/${id}/delete`, admin(), { reason: '' });
    expect(refused.status).toBe(422);
    expect(newsRow(id)).toBeDefined();

    const res = await post(`/admin/news/${id}/delete`, admin(), { reason: 'Spam.' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/news');
    expect(newsRow(id)).toBeUndefined();
    const deleted = audits(id, 'news.item.deleted');
    expect(deleted).toEqual([expect.objectContaining({ reason_text: 'Spam.' })]);
    // The ledger outlives erasure, so the member's words never enter it.
    expect(deleted[0].metadata_json).not.toContain('Delete me');
    expect(noticesTo(AUTHOR_ID, 'news_post_deleted')).toBe(1);
    // The announcement it came from stays, no longer pointing at a post.
    expect(db.prepare('SELECT news_item_id FROM member_announcements WHERE id = ?').get(announcementId))
      .toEqual({ news_item_id: null });
  });

  it('refuses a reason over 500 characters and accepts exactly 500', async () => {
    const id = insertNewsItem(db, { title: 'Reason bounds', author_member_id: ADMIN_ID });
    const tooLong = await post(`/admin/news/${id}/delete`, admin(), { reason: 'x'.repeat(501) });
    expect(tooLong.status).toBe(422);
    expect(newsRow(id)).toBeDefined();
    const atLimit = await post(`/admin/news/${id}/delete`, admin(), { reason: 'x'.repeat(500) });
    expect(atLimit.status).toBe(303);
    expect(newsRow(id)).toBeUndefined();
  });
});

describe('a club item on the public page', () => {
  it('drops the club link once the club is archived, keeping the item', async () => {
    const tagId = insertTag(db, { standard_type: 'club', tag_normalized: '#club_news_desk_gone', tag_display: '#club_news_desk_gone' });
    const goneClub = insertClub(db, { hashtag_tag_id: tagId, status: 'archived' });
    const id = insertNewsItem(db, { title: 'About a closed club', entity_type: 'club', entity_id: goneClub });
    const page = await get(`/news/${id}`);
    expect(page.status).toBe(200);
    expect(page.text).not.toContain('id="news-club-link"');
  });
});
