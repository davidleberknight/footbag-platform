/**
 * Integration tests for the owner-only member named-gallery routes:
 *   GET    /members/:memberKey/galleries
 *   GET    /members/:memberKey/galleries/new
 *   POST   /members/:memberKey/galleries
 *   GET    /members/:memberKey/galleries/:id/edit
 *   POST   /members/:memberKey/galleries/:id/edit
 *   POST   /members/:memberKey/galleries/:id/delete
 *
 * Auth: requireAuth + same-slug ownership check. Mismatched slug
 * returns 404 (anti-enumeration; matches the existing isOwnProfile
 * convention in memberController). Service layer re-asserts ownership
 * defensively so a forged ownerMemberId in the form body cannot
 * escape the controller's slug check.
 *
 * CSRF middleware is not yet wired in this codebase (only one
 * placeholder field exists in the admin gallery form, with
 * `csrfToken` undefined at render time). When CSRF lands, this file
 * will gain rejection tests; today there is nothing to enforce.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DB_PATH = path.join(os.tmpdir(), `footbag-test-member-gal-${Date.now()}.db`);
process.env.FOOTBAG_DB_PATH = TEST_DB_PATH;
process.env.PORT            = '3097';
process.env.NODE_ENV        = 'test';
process.env.LOG_LEVEL       = 'error';
process.env.PUBLIC_BASE_URL = 'http://localhost:3097';
process.env.SESSION_SECRET  = 'member-galleries-routes-test-secret';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';

import { insertMember, createTestSessionJwt, insertMediaItem } from '../fixtures/factories';

const OWNER_ID    = 'member-mg-owner-001';
const OWNER_SLUG  = 'mg_owner';
const OTHER_ID    = 'member-mg-other-001';
const OTHER_SLUG  = 'mg_other';
const ADMIN_ID    = 'admin-mg-001';
const ADMIN_SLUG  = 'mg_admin';
const SYSTEM_ID   = 'member_footbag_hacky_mg_test';

let CURATED_TMP_ROOT: string;

function ownerCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: OWNER_ID, role: 'member' })}`;
}
function otherCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: OTHER_ID, role: 'member' })}`;
}
function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

beforeAll(async () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'database', 'schema.sql'), 'utf8');
  const db = new BetterSqlite3(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);

  insertMember(db, { id: OWNER_ID,  slug: OWNER_SLUG,  display_name: 'Gallery Owner' });
  insertMember(db, { id: OTHER_ID,  slug: OTHER_SLUG,  display_name: 'Other Member' });
  insertMember(db, { id: ADMIN_ID,  slug: ADMIN_SLUG,  display_name: 'MG Admin', is_admin: 1 });
  insertMember(db, { id: SYSTEM_ID, slug: 'fh_mg', display_name: 'Footbag Hacky', real_name: 'Footbag Hacky', is_system: 1 });

  db.close();

  const mod = await import('../../src/app');
  createApp = mod.createApp;

  // FH-owned writes from this suite (admin moderation tests, etc.)
  // would touch /curated/galleries/ in the repo. Redirect to a temp
  // dir so the suite never mutates the real /curated/ tree.
  CURATED_TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-routes-curated-'));
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.setCuratedRootDirForTests(CURATED_TMP_ROOT);
});

afterAll(async () => {
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.resetCuratedRootDirForTests();
  if (CURATED_TMP_ROOT) {
    fs.rmSync(CURATED_TMP_ROOT, { recursive: true, force: true });
  }
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB_PATH + ext); } catch { /* ignore */ }
  }
});

beforeEach(() => {
  // Clear any galleries the previous test created so each case sees a
  // deterministic empty state. ON DELETE CASCADE removes tag rows.
  const db = new BetterSqlite3(TEST_DB_PATH);
  db.pragma('foreign_keys = ON');
  db.prepare('DELETE FROM member_galleries').run();
  db.close();
});

// ── Helpers ────────────────────────────────────────────────────────────────

function createGalleryViaApi(name: string, criteria = '#tag1'): Promise<request.Response> {
  return request(createApp())
    .post(`/members/${OWNER_SLUG}/galleries`)
    .set('Cookie', ownerCookie())
    .type('form')
    .send({
      name,
      description: 'desc',
      sortOrder: 'upload_desc',
      criteriaTags: criteria,
      excludeTags: '',
    });
}

function findGalleryIdByName(name: string): string | undefined {
  const db = new BetterSqlite3(TEST_DB_PATH);
  try {
    const row = db.prepare('SELECT id FROM member_galleries WHERE name = ?').get(name) as { id: string } | undefined;
    return row?.id;
  } finally {
    db.close();
  }
}

// ── GET /members/:memberKey/galleries ──────────────────────────────────────

describe('GET /members/:memberKey/galleries', () => {
  it('renders the owner\'s gallery list (empty state) when authed as the owner', async () => {
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('My Galleries');
    expect(res.text).toContain('Create new gallery');
    expect(res.text).toContain('You haven\'t created any galleries yet.');
    // Replaced the old developer-spec description with member-facing copy.
    expect(res.text).toContain('saved view of your photos and videos');
  });

  it('renders an Upload media button linked to /members/:slug/media/upload', async () => {
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Upload media');
    expect(res.text).toMatch(new RegExp(`href="/members/${OWNER_SLUG}/media/upload"`));
  });

  it('?saved=upload renders an "Uploaded." flash banner', async () => {
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries?saved=upload`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Uploaded.');
  });

  it('lists the owner\'s galleries with edit + delete actions', async () => {
    await createGalleryViaApi('Trip Photos');
    await createGalleryViaApi('Demo Reel', '#freestyle');
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Trip Photos');
    expect(res.text).toContain('Demo Reel');
    expect(res.text).toMatch(/href="\/members\/mg_owner\/galleries\/gallery_m_[a-f0-9]{12}\/edit"/);
    expect(res.text).toMatch(/action="\/members\/mg_owner\/galleries\/gallery_m_[a-f0-9]{12}\/delete"/);
  });

  it('redirects unauthenticated requests to /login', async () => {
    const res = await request(createApp()).get(`/members/${OWNER_SLUG}/galleries`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });

  it('returns 404 (anti-enumeration) when authed as a different member', async () => {
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', otherCookie());
    expect(res.status).toBe(404);
    expect(res.text).toContain('Page Not Found');
  });
});

// ── GET /members/:memberKey/galleries/new ──────────────────────────────────

describe('GET /members/:memberKey/galleries/new', () => {
  it('renders an empty new-gallery form for the owner', async () => {
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries/new`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Create Gallery');
    expect(res.text).toMatch(/<form[^>]*action="\/members\/mg_owner\/galleries"/);
    expect(res.text).toContain('Create gallery');
  });

  it('redirects unauthenticated', async () => {
    const res = await request(createApp()).get(`/members/${OWNER_SLUG}/galleries/new`);
    expect(res.status).toBe(302);
  });

  it('404s when authed as a different member', async () => {
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries/new`)
      .set('Cookie', otherCookie());
    expect(res.status).toBe(404);
  });
});

// ── POST /members/:memberKey/galleries ─────────────────────────────────────

describe('POST /members/:memberKey/galleries', () => {
  it('creates a member-owned gallery and redirects to the list with saved=create', async () => {
    const res = await createGalleryViaApi('Fresh Gallery', '#summer');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/members/${OWNER_SLUG}/galleries?saved=create`);
    const id = findGalleryIdByName('Fresh Gallery');
    expect(id).toMatch(/^gallery_m_[a-f0-9]{12}$/);
  });

  it('auto-applies #<slug> when criteriaTags is empty (My Photos default)', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: 'My Photos', description: '', sortOrder: 'upload_desc', criteriaTags: '', excludeTags: '' });
    expect(res.status).toBe(302);
    const id = findGalleryIdByName('My Photos')!;
    expect(id).toMatch(/^gallery_m_/);
    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      const tags = db.prepare(
        `SELECT t.tag_display FROM member_gallery_tags mgt JOIN tags t ON t.id = mgt.tag_id WHERE mgt.gallery_id = ?`,
      ).all(id) as { tag_display: string }[];
      expect(tags.map((t) => t.tag_display)).toEqual([`#${OWNER_SLUG}`]);
    } finally { db.close(); }
  });

  it('rejects oversize name with 422', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: 'x'.repeat(151), description: '', sortOrder: 'upload_desc', criteriaTags: '#a', excludeTags: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('150 characters');
  });

  it('maps duplicate-name (UNIQUE owner+name) to 422 with conflict message', async () => {
    await createGalleryViaApi('Same Name');
    const res = await createGalleryViaApi('Same Name');
    expect(res.status).toBe(422);
    expect(res.text).toContain('already exists for this owner');
  });

  it('ignores a forged ownerMemberId in the body — owner is taken from the session', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({
        name: 'Forge Attempt',
        description: '',
        sortOrder: 'upload_desc',
        criteriaTags: '#x',
        excludeTags: '',
        ownerMemberId: SYSTEM_ID,  // ignored by controller
      });
    expect(res.status).toBe(302);
    const id = findGalleryIdByName('Forge Attempt');
    expect(id).toMatch(/^gallery_m_/);
    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      const row = db.prepare('SELECT owner_member_id FROM member_galleries WHERE id = ?').get(id!) as { owner_member_id: string };
      expect(row.owner_member_id).toBe(OWNER_ID);
    } finally { db.close(); }
  });

  it('redirects unauthenticated', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries`)
      .type('form')
      .send({ name: 'X', description: '', sortOrder: 'upload_desc', criteriaTags: '#x', excludeTags: '' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });

  it('404s when authed as a different member (anti-enumeration on the owner-slug path)', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', otherCookie())
      .type('form')
      .send({ name: 'X', description: '', sortOrder: 'upload_desc', criteriaTags: '#x', excludeTags: '' });
    expect(res.status).toBe(404);
  });
});

// ── GET/POST /members/:memberKey/galleries/:id/edit ────────────────────────

describe('GET /members/:memberKey/galleries/:id/edit', () => {
  it('renders the edit form for the owner\'s own gallery', async () => {
    await createGalleryViaApi('Editable');
    const id = findGalleryIdByName('Editable')!;
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Edit Gallery');
    expect(res.text).toContain('Editable');
    expect(res.text).toMatch(new RegExp(`<form[^>]*action="/members/mg_owner/galleries/${id}/edit"`));
  });

  it('returns 404 for an unknown gallery id', async () => {
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries/gallery_does_not_exist_xx/edit`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(404);
  });

  it('returns 404 when the gallery exists but is owned by a different member (anti-enumeration)', async () => {
    // Create a gallery owned by the OWNER, then try to edit via OTHER's
    // own member route. Since the URL is /members/<other-slug>/galleries
    // and the gallery's owner is OWNER, the service-layer ownership
    // restriction throws NotFoundError.
    await createGalleryViaApi('Cross-Member Probe');
    const id = findGalleryIdByName('Cross-Member Probe')!;
    // OTHER tries to access via their OWN member URL — slug check passes
    // but ownership filter at the service rejects.
    const res = await request(createApp())
      .get(`/members/${OTHER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', otherCookie());
    expect(res.status).toBe(404);
  });

  it('404s when authed as a different member on the owner-slug path', async () => {
    await createGalleryViaApi('Slug-Mismatch');
    const id = findGalleryIdByName('Slug-Mismatch')!;
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', otherCookie());
    expect(res.status).toBe(404);
  });
});

describe('POST /members/:memberKey/galleries/:id/edit', () => {
  it('applies changes and redirects to the list with saved=edit', async () => {
    await createGalleryViaApi('Before');
    const id = findGalleryIdByName('Before')!;
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: 'After', description: 'updated', sortOrder: 'caption_asc', criteriaTags: '#new', excludeTags: '' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/members/${OWNER_SLUG}/galleries?saved=edit`);
    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      const row = db.prepare('SELECT name, description, sort_order FROM member_galleries WHERE id = ?').get(id) as Record<string, unknown>;
      expect(row.name).toBe('After');
      expect(row.description).toBe('updated');
      expect(row.sort_order).toBe('caption_asc');
    } finally { db.close(); }
  });

  it('rejects an invalid sortOrder with 422', async () => {
    await createGalleryViaApi('Bad Sort Source');
    const id = findGalleryIdByName('Bad Sort Source')!;
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: 'X', description: '', sortOrder: 'random', criteriaTags: '#x', excludeTags: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('sort order must be one of');
  });

  it('cannot edit another member\'s gallery (404)', async () => {
    await createGalleryViaApi('Locked');
    const id = findGalleryIdByName('Locked')!;
    // OTHER tries to update via their own slug path; service-layer
    // authz rejects because the gallery's owner is OWNER, not OTHER.
    const res = await request(createApp())
      .post(`/members/${OTHER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', otherCookie())
      .type('form')
      .send({ name: 'Hijack', description: '', sortOrder: 'upload_desc', criteriaTags: '#x', excludeTags: '' });
    expect(res.status).toBe(404);
    // Confirm the gallery was NOT modified.
    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      const row = db.prepare('SELECT name FROM member_galleries WHERE id = ?').get(id) as { name: string };
      expect(row.name).toBe('Locked');
    } finally { db.close(); }
  });

  it('admin can edit a member-owned gallery via the admin curator route (moderation path)', async () => {
    // The admin route at /admin/curator/galleries/:id/edit is wired
    // through the same service.updateGallery; an admin actor passes
    // service-layer authz on any owner. This test exercises that path
    // against a member-owned gallery to confirm slice 2a's moderation
    // behavior remains intact after slice 2b widening.
    await createGalleryViaApi('To Be Moderated');
    const id = findGalleryIdByName('To Be Moderated')!;
    const res = await request(createApp())
      .post(`/admin/curator/galleries/${id}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ name: 'Moderated', description: '', sortOrder: 'upload_desc', criteriaTags: '#m', excludeTags: '' });
    expect([302, 200]).toContain(res.status);
    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      const row = db.prepare('SELECT name FROM member_galleries WHERE id = ?').get(id) as { name: string };
      expect(row.name).toBe('Moderated');
    } finally { db.close(); }
  });
});

// ── POST /members/:memberKey/galleries/:id/delete ──────────────────────────

describe('POST /members/:memberKey/galleries/:id/delete', () => {
  it('deletes the gallery and redirects with saved=delete', async () => {
    await createGalleryViaApi('Doomed');
    const id = findGalleryIdByName('Doomed')!;
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/${id}/delete`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/members/${OWNER_SLUG}/galleries?saved=delete`);
    expect(findGalleryIdByName('Doomed')).toBeUndefined();
  });

  it('returns 404 for an unknown gallery id', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/gallery_does_not_exist_zz/delete`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(404);
  });

  it('cannot delete another member\'s gallery (404; row preserved)', async () => {
    await createGalleryViaApi('Survivor');
    const id = findGalleryIdByName('Survivor')!;
    const res = await request(createApp())
      .post(`/members/${OTHER_SLUG}/galleries/${id}/delete`)
      .set('Cookie', otherCookie());
    expect(res.status).toBe(404);
    expect(findGalleryIdByName('Survivor')).toBe(id);
  });

  it('redirects unauthenticated', async () => {
    const res = await request(createApp()).post(`/members/${OWNER_SLUG}/galleries/some_id/delete`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });
});

// ── Profile link ──────────────────────────────────────────────────────────

describe('Member profile "My Galleries" link', () => {
  it('appears on the owner\'s own profile page', async () => {
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('My Galleries');
    expect(res.text).toContain(`href="/members/${OWNER_SLUG}/galleries"`);
  });
});

// ── Picker (existing-uploads checkbox grid on new + edit forms) ────────────

describe('member-media picker', () => {
  beforeEach(() => {
    // Each picker test seeds its own media; clear leftovers + tag rows
    // so the prior test's media_tags don't leak into the next assertion.
    const db = new BetterSqlite3(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    db.prepare('DELETE FROM media_tags').run();
    db.prepare('DELETE FROM media_items').run();
    db.close();
  });

  function findMediaTags(mediaId: string): string[] {
    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      const rows = db.prepare(
        `SELECT t.tag_display FROM media_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.media_id = ? ORDER BY t.tag_display`,
      ).all(mediaId) as { tag_display: string }[];
      return rows.map((r) => r.tag_display);
    } finally { db.close(); }
  }

  function findGalleryCriteriaTags(galleryId: string): string[] {
    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      const rows = db.prepare(
        `SELECT t.tag_display FROM member_gallery_tags mgt JOIN tags t ON t.id = mgt.tag_id WHERE mgt.gallery_id = ? ORDER BY t.tag_display`,
      ).all(galleryId) as { tag_display: string }[];
      return rows.map((r) => r.tag_display);
    } finally { db.close(); }
  }

  it('GET /galleries/new includes the picker and the owner\'s own non-avatar uploads only', async () => {
    const db = new BetterSqlite3(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    const ownMedia = insertMediaItem(db, { uploader_member_id: OWNER_ID, source_filename: 'mine.jpg', caption: null });
    insertMediaItem(db, { uploader_member_id: OTHER_ID, source_filename: 'theirs.jpg', caption: null });
    insertMediaItem(db, { uploader_member_id: OWNER_ID, is_avatar: 1, source_filename: 'avatar.jpg', caption: null });
    db.close();

    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries/new`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('member-media-picker');
    expect(res.text).toContain('Add items from your existing uploads');
    expect(res.text).toContain(`value="${ownMedia}"`);
    expect(res.text).toContain('mine.jpg');
    expect(res.text).not.toContain('theirs.jpg');
    expect(res.text).not.toContain('avatar.jpg');
  });

  it('POST /galleries with mediaIds applies the gallery\'s criteria tags to each picked item', async () => {
    const db = new BetterSqlite3(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    const m1 = insertMediaItem(db, { uploader_member_id: OWNER_ID, source_filename: 'a.jpg', caption: null });
    const m2 = insertMediaItem(db, { uploader_member_id: OWNER_ID, source_filename: 'b.jpg', caption: null });
    const m3 = insertMediaItem(db, { uploader_member_id: OWNER_ID, source_filename: 'c.jpg', caption: null });
    db.close();

    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: 'Trips', sortOrder: 'upload_desc', criteriaTags: '#trip2024', excludeTags: '', mediaIds: [m1, m2] });
    expect(res.status).toBe(302);

    expect(findMediaTags(m1)).toEqual([`#${OWNER_SLUG}`, '#trip2024']);
    expect(findMediaTags(m2)).toEqual([`#${OWNER_SLUG}`, '#trip2024']);
    expect(findMediaTags(m3)).toEqual([]);
  });

  it('POST /galleries silently skips mediaIds owned by another member', async () => {
    const db = new BetterSqlite3(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    const ownerMedia = insertMediaItem(db, { uploader_member_id: OWNER_ID, source_filename: 'own.jpg', caption: null });
    const otherMedia = insertMediaItem(db, { uploader_member_id: OTHER_ID, source_filename: 'other.jpg', caption: null });
    db.close();

    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: 'Mix', sortOrder: 'upload_desc', criteriaTags: '#mix', excludeTags: '', mediaIds: [ownerMedia, otherMedia] });
    expect(res.status).toBe(302);

    expect(findMediaTags(ownerMedia)).toEqual([`#${OWNER_SLUG}`, '#mix']);
    expect(findMediaTags(otherMedia)).toEqual([]);
  });

  it('GET /galleries/:id/edit includes the picker', async () => {
    await createGalleryViaApi('To Edit', '#x');
    const id = findGalleryIdByName('To Edit')!;

    const db = new BetterSqlite3(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    insertMediaItem(db, { uploader_member_id: OWNER_ID, source_filename: 'editpick.jpg', caption: null });
    db.close();

    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('member-media-picker');
    expect(res.text).toContain('editpick.jpg');
  });

  it('POST /galleries/:id/edit with mediaIds applies the gallery\'s post-update criteria tags', async () => {
    // The create flow auto-prepends #<slug>; the edit flow does not
    // (the owner can curate the criteria-tag set intentionally), so the
    // edit POST body must include every tag the gallery should keep.
    await createGalleryViaApi('Add Later', '#later');
    const galleryId = findGalleryIdByName('Add Later')!;

    const db = new BetterSqlite3(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    const m = insertMediaItem(db, { uploader_member_id: OWNER_ID, source_filename: 'l.jpg', caption: null });
    db.close();

    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/${galleryId}/edit`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: 'Add Later', description: '', sortOrder: 'upload_desc', criteriaTags: `#${OWNER_SLUG} #later`, excludeTags: '', mediaIds: m });
    expect(res.status).toBe(302);

    // findMediaTags sorts by tag_display ASCII; '#later' < '#mg_owner'.
    expect(findMediaTags(m)).toEqual(['#later', `#${OWNER_SLUG}`]);
  });

  it('idempotence: re-posting the same mediaIds does not duplicate media_tags rows', async () => {
    const db1 = new BetterSqlite3(TEST_DB_PATH);
    db1.pragma('foreign_keys = ON');
    const m = insertMediaItem(db1, { uploader_member_id: OWNER_ID, source_filename: 'dup.jpg', caption: null });
    db1.close();

    const first = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: 'Once', sortOrder: 'upload_desc', criteriaTags: '#once', excludeTags: '', mediaIds: m });
    expect(first.status).toBe(302);

    const galleryId = findGalleryIdByName('Once')!;
    const second = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/${galleryId}/edit`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: 'Once', description: '', sortOrder: 'upload_desc', criteriaTags: '#once', excludeTags: '', mediaIds: m });
    expect(second.status).toBe(302);

    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      const rows = db.prepare(
        `SELECT t.tag_display, COUNT(*) AS n FROM media_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.media_id = ? GROUP BY t.tag_display ORDER BY t.tag_display`,
      ).all(m) as { tag_display: string; n: number }[];
      // Each tag appears exactly once on the item, even after two POSTs.
      expect(rows).toEqual([
        { tag_display: `#${OWNER_SLUG}`, n: 1 },
        { tag_display: '#once', n: 1 },
      ]);
    } finally { db.close(); }
  });

  it('Bug 2 regression: re-include a previously-uploaded file via the picker after gallery delete', async () => {
    // Step 1: pre-existing upload (the user's "I already uploaded fb_182c.jpg")
    const db = new BetterSqlite3(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    const sunset = insertMediaItem(db, { uploader_member_id: OWNER_ID, source_filename: 'sunset.jpg', caption: null });
    db.close();

    // Step 2: create gallery G1, picking the file
    const create1 = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: 'Trips', sortOrder: 'upload_desc', criteriaTags: '#trip2024', excludeTags: '', mediaIds: sunset });
    expect(create1.status).toBe(302);
    const g1 = findGalleryIdByName('Trips')!;

    // Step 3: delete G1
    const del = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/${g1}/delete`)
      .set('Cookie', ownerCookie());
    expect(del.status).toBe(302);

    // Step 4: media survived → picker still offers it
    const newPage = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries/new`)
      .set('Cookie', ownerCookie());
    expect(newPage.status).toBe(200);
    expect(newPage.text).toContain('sunset.jpg');
    expect(newPage.text).toContain(`value="${sunset}"`);

    // Step 5: re-create gallery using the picker (no re-upload, no error)
    const create2 = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: 'Trips Reborn', sortOrder: 'upload_desc', criteriaTags: '#trip2024_reborn', excludeTags: '', mediaIds: sunset });
    expect(create2.status).toBe(302);
    expect(create2.text).not.toContain('already uploaded');

    const g2 = findGalleryIdByName('Trips Reborn')!;
    expect(findGalleryCriteriaTags(g2)).toEqual([`#${OWNER_SLUG}`, '#trip2024_reborn']);
    // The picked item now carries the new gallery's criteria tag too.
    expect(findMediaTags(sunset).sort()).toEqual([`#${OWNER_SLUG}`, '#trip2024', '#trip2024_reborn'].sort());
  });
});
