/**
 * Administrator retirement of an abusive freeform hashtag.
 *
 * A freeform hashtag is public, any member can invent one, and it rides on
 * other members' uploads. Nothing else on the site can take one out of
 * circulation, and the tags table refuses a delete because six tables reference
 * it and none of them cascades. So the suite pins what retirement actually is:
 * the tag comes off everything that named it, its usage record goes, the row
 * itself survives stamped so the word stays reserved, the items and the words
 * their owners wrote are untouched, and nobody can apply the tag again.
 *
 * It also pins the three refusals that matter, because each of them protects
 * something this act must never reach: a club's or an event's address, the
 * platform's own attribution tags, and a tag somebody already retired.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertClub, insertTag, insertFreeformTag, insertMediaItem,
  attachMediaTag, insertMemberGallery, insertGalleryCriterionTag, insertGalleryExcludeTag,
  insertTagStat, insertMemberTierGrant, completeOnboarding, createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3441');

const ADMIN_ID  = 'at_admin';
const MEMBER_ID = 'at_member';
const MEMBER_SLUG = 'at_member';

// The abusive tag, and a neighbour that must come through untouched.
const ABUSE_TAG = 'tag-at-abuse';
const KEEP_TAG  = 'tag-at-keep';
const BY_TAG    = 'tag-at-by';
const CURATED   = 'tag-at-curated';

const GALLERY_ID = 'gallery_at_one';

let createApp: Awaited<ReturnType<typeof importApp>>;
let conn: BetterSqlite3.Database;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, slug: MEMBER_SLUG })}`;
}

function tagRow(id: string): {
  tag_normalized: string; retired_at: string | null;
  retired_by_member_id: string | null; version: number;
} {
  return conn.prepare(
    'SELECT tag_normalized, retired_at, retired_by_member_id, version FROM tags WHERE id = ?',
  ).get(id) as {
    tag_normalized: string; retired_at: string | null;
    retired_by_member_id: string | null; version: number;
  };
}

function countWhere(sql: string, ...params: unknown[]): number {
  return (conn.prepare(sql).get(...params) as { n: number }).n;
}

function mediaTagCount(tagId: string): number {
  return countWhere('SELECT COUNT(*) AS n FROM media_tags WHERE tag_id = ?', tagId);
}

function auditRows(tagId = ABUSE_TAG): Array<{
  actor_type: string; actor_member_id: string | null;
  entity_type: string; entity_id: string;
  reason_text: string | null; metadata_json: string;
}> {
  return conn.prepare(
    'SELECT actor_type, actor_member_id, entity_type, entity_id, reason_text, metadata_json'
    + " FROM audit_entries WHERE action_type = 'media.tag_retired' AND entity_id = ?",
  ).all(tagId) as Array<{
    actor_type: string; actor_member_id: string | null;
    entity_type: string; entity_id: string;
    reason_text: string | null; metadata_json: string;
  }>;
}

const REASON = 'Reported by three members as a slur aimed at one player.';

beforeAll(async () => {
  conn = createTestDb(dbPath);
  insertMember(conn, {
    id: ADMIN_ID, slug: 'at-admin', display_name: 'Ada Admin', real_name: 'Ada Admin',
    login_email: 'at-admin@example.com', is_admin: 1,
  });
  insertMember(conn, {
    id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'Mo Member', real_name: 'Mo Member',
    login_email: 'at-member@example.com',
  });
  completeOnboarding(conn, ADMIN_ID);
  completeOnboarding(conn, MEMBER_ID);
  // The gallery edit route is behind the Tier 1 benefits gate, and that route is
  // how this suite proves a retired tag cannot be applied again.
  insertMemberTierGrant(conn, { member_id: MEMBER_ID, new_tier_status: 'tier1' });

  insertFreeformTag(conn, {
    id: ABUSE_TAG, tag_normalized: '#abusive_word', tag_display: '#Abusive_Word',
  });
  insertFreeformTag(conn, {
    id: KEEP_TAG, tag_normalized: '#shred', tag_display: '#shred',
  });
  insertFreeformTag(conn, {
    id: BY_TAG, tag_normalized: `#by_${MEMBER_SLUG}`, tag_display: `#by_${MEMBER_SLUG}`,
  });
  insertFreeformTag(conn, {
    id: CURATED, tag_normalized: '#curated', tag_display: '#curated',
  });
  // A club hashtag: standard, and the club's address rather than a member's word.
  insertClub(conn, {
    id: 'club-test-at-one',
    hashtag_tag_id: insertTag(conn, {
      id: 'tag-at-club', tag_normalized: '#club_at_one', tag_display: '#club_at_one',
      standard_type: 'club',
    }),
    name: 'Auckland Footbag',
    city: 'Auckland',
    country: 'New Zealand',
  });

  // Two items carry the abusive tag, and each carries a caption of its owner's
  // own words, which retirement must leave exactly as written.
  const first = insertMediaItem(conn, {
    uploader_member_id: MEMBER_ID, caption: 'Sunset session at the park.',
  });
  const second = insertMediaItem(conn, {
    uploader_member_id: MEMBER_ID, caption: 'Second run, same evening.',
  });
  attachMediaTag(conn, first, ABUSE_TAG);
  attachMediaTag(conn, second, ABUSE_TAG);
  attachMediaTag(conn, first, KEEP_TAG);

  insertTagStat(conn, { tag_id: ABUSE_TAG, usage_count: 2, distinct_member_count: 2 });
  insertTagStat(conn, { tag_id: KEEP_TAG, usage_count: 1, distinct_member_count: 1 });

  // A member's gallery names the abusive tag once as a criterion and once as an
  // exclusion, because both link tables reference tags and both must be cleared.
  insertMemberGallery(conn, {
    id: GALLERY_ID, owner_member_id: MEMBER_ID, name: 'Park Sessions',
    created_by: MEMBER_ID,
  });
  insertGalleryCriterionTag(conn, GALLERY_ID, BY_TAG);
  insertGalleryCriterionTag(conn, GALLERY_ID, ABUSE_TAG);
  insertGalleryExcludeTag(conn, GALLERY_ID, ABUSE_TAG);

  createApp = await importApp();
});

afterAll(() => {
  conn.close();
  cleanupTestDb(dbPath);
});

describe('the hashtag lookup reaches one tag by its exact text', () => {
  it('orients before a search, and finds the tag however the # is written', async () => {
    const empty = await request(createApp()).get('/admin/tags').set('Cookie', adminCookie());
    expect(empty.status).toBe(200);
    expect(empty.text).toContain('imposes no vocabulary');

    const withHash = await request(createApp())
      .get('/admin/tags?q=%23abusive_word').set('Cookie', adminCookie());
    const bare = await request(createApp())
      .get('/admin/tags?q=abusive_word').set('Cookie', adminCookie());
    const shouted = await request(createApp())
      .get('/admin/tags?q=ABUSIVE_WORD').set('Cookie', adminCookie());

    for (const res of [withHash, bare, shouted]) {
      expect(res.status).toBe(200);
      expect(res.text).toContain('#Abusive_Word');
      expect(res.text).toContain('Retire This Hashtag');
    }
  });

  it('shows what would come off, counting items and galleries separately', async () => {
    const res = await request(createApp())
      .get('/admin/tags?q=abusive_word').set('Cookie', adminCookie());
    expect(res.text).toContain('Photos and videos carrying it');
    expect(res.text).toContain('Member galleries naming it');
    // Two items carry it; the gallery names it twice, as a criterion and as an
    // exclusion, and both are references the retirement has to clear.
    expect(res.text).toMatch(/Photos and videos carrying it<\/dt><dd>2<\/dd>/);
    expect(res.text).toMatch(/Member galleries naming it<\/dt><dd>2<\/dd>/);
  });

  it('matches a hashtag whole rather than by part of a word', async () => {
    const res = await request(createApp())
      .get('/admin/tags?q=abusive').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('No hashtag with that text');
    expect(res.text).not.toContain('Retire This Hashtag');
  });

  it('refuses a search too short to be a hashtag', async () => {
    const res = await request(createApp()).get('/admin/tags?q=a').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('at least 2 characters');
  });
});

describe('the tags this act must never reach', () => {
  it("refuses a club's hashtag, and says where that correction belongs", async () => {
    const res = await request(createApp())
      .get('/admin/tags?q=club_at_one').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    // Handlebars escapes the apostrophe, so the sentence is matched on the
    // half of it that survives escaping rather than on the whole phrase.
    expect(res.text).toContain('s address, not a member');
    expect(res.text).not.toContain('Retire This Hashtag');
  });

  it("refuses the platform's own uploader attribution tag", async () => {
    const res = await request(createApp())
      .get(`/admin/tags?q=by_${MEMBER_SLUG}`).set('Cookie', adminCookie());
    expect(res.text).toContain('The platform writes this hashtag itself');
    expect(res.text).not.toContain('Retire This Hashtag');
  });

  it("refuses the curated marker the platform writes on its own media", async () => {
    const res = await request(createApp())
      .get('/admin/tags?q=curated').set('Cookie', adminCookie());
    expect(res.text).toContain('The platform writes this hashtag itself');
    expect(res.text).not.toContain('Retire This Hashtag');
  });

  it('refuses a posted club hashtag too, not only the one it declines to offer', async () => {
    const res = await request(createApp())
      .post('/admin/tags/retire').set('Cookie', adminCookie())
      .type('form').send({ tag: '#club_at_one', reason: REASON });
    expect(res.status).toBe(422);
    expect(res.text).toContain('s address, not a member');
    expect(tagRow('tag-at-club').retired_at).toBeNull();
  });
});

describe('the preview shows the act before it happens and writes nothing', () => {
  it('cautions that nothing on the site can undo it', async () => {
    const res = await request(createApp())
      .post('/admin/tags/retire').set('Cookie', adminCookie())
      .type('form').send({ tag: '#abusive_word', reason: REASON });
    expect(res.status).toBe(200);
    expect(res.text).toContain('cannot be undone from the site');
    expect(res.text).toContain(REASON);
    expect(res.text).toContain('Yes, Retire This Hashtag');

    // Nothing moved: the preview is a read.
    expect(mediaTagCount(ABUSE_TAG)).toBe(2);
    expect(tagRow(ABUSE_TAG).retired_at).toBeNull();
  });

  it('refuses a retirement with no reason, back on the page it came from', async () => {
    const res = await request(createApp())
      .post('/admin/tags/retire').set('Cookie', adminCookie())
      .type('form').send({ tag: '#abusive_word', reason: '   ' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Enter the reason');
    expect(mediaTagCount(ABUSE_TAG)).toBe(2);
  });

  it('refuses a reason longer than the column holds', async () => {
    const res = await request(createApp())
      .post('/admin/tags/retire').set('Cookie', adminCookie())
      .type('form').send({ tag: '#abusive_word', reason: 'x'.repeat(501) });
    expect(res.status).toBe(422);
    expect(res.text).toContain('500 characters or fewer');
  });

  it('refuses a hashtag that does not exist', async () => {
    const res = await request(createApp())
      .post('/admin/tags/retire').set('Cookie', adminCookie())
      .type('form').send({ tag: '#nothing_here', reason: REASON });
    expect(res.status).toBe(422);
    expect(res.text).toContain('No hashtag with that text');
  });
});

describe('retirement takes the tag off everything and leaves the items alone', () => {
  it('detaches, stamps, records, and reports what it did', async () => {
    const res = await request(createApp())
      .post('/admin/tags/retire/confirm').set('Cookie', adminCookie())
      .type('form').send({ tag: '#abusive_word', reason: REASON });
    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe('/admin/tags');

    // Off every item and every gallery reference.
    expect(mediaTagCount(ABUSE_TAG)).toBe(0);
    expect(countWhere(
      'SELECT COUNT(*) AS n FROM member_gallery_tags WHERE tag_id = ?', ABUSE_TAG,
    )).toBe(0);
    expect(countWhere(
      'SELECT COUNT(*) AS n FROM member_gallery_exclude_tags WHERE tag_id = ?', ABUSE_TAG,
    )).toBe(0);
    // The usage record goes, which is what removes it from every discovery index.
    expect(countWhere(
      'SELECT COUNT(*) AS n FROM tag_stats WHERE tag_id = ?', ABUSE_TAG,
    )).toBe(0);

    // The row itself survives, stamped, so the word stays reserved.
    const row = tagRow(ABUSE_TAG);
    expect(row.retired_at).not.toBeNull();
    expect(row.retired_by_member_id).toBe(ADMIN_ID);
    expect(row.tag_normalized).toBe('#abusive_word');
  });

  it('leaves the items and their owners\' own words exactly as they were', async () => {
    const captions = conn.prepare(
      'SELECT caption FROM media_items WHERE uploader_member_id = ? ORDER BY caption, id',
    ).all(MEMBER_ID) as Array<{ caption: string | null }>;
    // ordering-is-the-contract: the assertion is the set of captions, sorted so
    // the comparison is stable; no row here is identified by its position.
    expect(captions.map((c) => c.caption)).toEqual([
      'Second run, same evening.', 'Sunset session at the park.',
    ]);
    expect(countWhere(
      'SELECT COUNT(*) AS n FROM media_items WHERE uploader_member_id = ?'
      + " AND moderation_status = 'active'", MEMBER_ID,
    )).toBe(2);
  });

  it('leaves every other tag, and the gallery\'s other criterion, untouched', async () => {
    expect(mediaTagCount(KEEP_TAG)).toBe(1);
    expect(countWhere(
      'SELECT COUNT(*) AS n FROM tag_stats WHERE tag_id = ?', KEEP_TAG,
    )).toBe(1);
    expect(tagRow(KEEP_TAG).retired_at).toBeNull();
    expect(countWhere(
      'SELECT COUNT(*) AS n FROM member_gallery_tags WHERE gallery_id = ? AND tag_id = ?',
      GALLERY_ID, BY_TAG,
    )).toBe(1);
  });

  it('writes one audit row naming the administrator, the reason and the counts', async () => {
    const rows = auditRows();
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.actor_type).toBe('admin');
    expect(row.actor_member_id).toBe(ADMIN_ID);
    expect(row.entity_type).toBe('tag');
    expect(row.entity_id).toBe(ABUSE_TAG);
    expect(row.reason_text).toBe(REASON);
    expect(JSON.parse(row.metadata_json)).toMatchObject({
      tagNormalized:          '#abusive_word',
      tagDisplay:             '#Abusive_Word',
      mediaDetached:          2,
      galleryCriteriaRemoved: 1,
      galleryExcludesRemoved: 1,
    });
  });

  it('tells the administrator what happened, on the page they land on', async () => {
    const res = await request(createApp())
      .post('/admin/tags/retire/confirm').set('Cookie', adminCookie())
      .type('form').send({ tag: '#shred', reason: 'Second act, to read the notice back.' });
    const flash = res.headers['set-cookie']!.toString().split(';')[0]!;
    const landing = await request(createApp())
      .get('/admin/tags').set('Cookie', `${adminCookie()}; ${flash}`);
    expect(landing.status).toBe(200);
    // Matched on the opening of the outcome sentence, which nothing else on
    // the page says: the page's own standing copy also ends by saying nobody
    // can apply a retired hashtag again, so asserting on that would pass with
    // no notice rendered at all.
    expect(landing.text).toContain('The hashtag is retired.');
  });
});

describe('a retired hashtag cannot come back', () => {
  it('refuses a second retirement rather than writing a second audit row', async () => {
    const res = await request(createApp())
      .post('/admin/tags/retire/confirm').set('Cookie', adminCookie())
      .type('form').send({ tag: '#abusive_word', reason: REASON });
    expect(res.status).toBe(422);
    expect(res.text).toContain('already retired');
    expect(auditRows()).toHaveLength(1);
  });

  it('no longer autocompletes for a member typing it', async () => {
    const res = await request(createApp())
      .get('/tags/suggest?q=abusive').set('Cookie', memberCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('abusive_word');
  });

  it('cannot be applied again through a member editing their own gallery', async () => {
    const res = await request(createApp())
      .post(`/members/${MEMBER_SLUG}/galleries/${GALLERY_ID}/edit`)
      .set('Cookie', memberCookie())
      .type('form').send({
        name: 'Park Sessions',
        description: '',
        sortOrder: 'upload_desc',
        criteriaTags: '#abusive_word',
        excludeTags: '',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('no longer available');
    expect(countWhere(
      'SELECT COUNT(*) AS n FROM member_gallery_tags WHERE tag_id = ?', ABUSE_TAG,
    )).toBe(0);
  });
});
