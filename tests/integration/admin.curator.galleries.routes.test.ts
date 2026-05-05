/**
 * Integration tests for the admin curator named-gallery list/edit routes.
 *
 * Covers:
 *   GET    /admin/curator/galleries              (list FH-owned galleries)
 *   GET    /admin/curator/galleries/:id/edit     (render edit form)
 *   POST   /admin/curator/galleries/:id/edit     (apply name/description/
 *                                                  sort_order/criteria/exclude)
 *
 * Auth: admin only. Member or unauthenticated requests redirect to /login or
 * receive 403 (matches the existing /admin/curator/media gates).
 *
 * Validation lives in the service (curatorMediaService.updateGallery). The
 * controller is HTTP glue: it parses the body, calls the service, and
 * translates ValidationError to 422 / NotFoundError to 404.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DB_PATH = path.join(os.tmpdir(), `footbag-test-admin-gal-${Date.now()}.db`);
process.env.FOOTBAG_DB_PATH = TEST_DB_PATH;
process.env.PORT            = '3099';
process.env.NODE_ENV        = 'test';
process.env.LOG_LEVEL       = 'error';
process.env.PUBLIC_BASE_URL = 'http://localhost:3099';
process.env.SESSION_SECRET  = 'admin-curator-galleries-routes-test-secret';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';

import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const ADMIN_ID    = 'admin-galleries-001';
const ADMIN_SLUG  = 'galleries_admin';
const MEMBER_ID   = 'member-galleries-001';
const MEMBER_SLUG = 'galleries_regular_member';
const SYSTEM_ID   = 'member_footbag_hacky_galleries_test';

const GALLERY_A = 'gallery_test_alpha';
const GALLERY_B = 'gallery_test_beta';

function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}

function seedGalleryRow(
  db: BetterSqlite3.Database,
  galleryId: string,
  name: string,
  description: string,
  sortOrder: 'upload_desc' | 'upload_asc' | 'caption_asc',
): void {
  const ts = '2026-01-01T00:00:00Z';
  db.prepare(
    `INSERT INTO member_galleries (
       id, owner_member_id, name, description, is_default, sort_order,
       created_at, created_by, updated_at, updated_by, version
     ) VALUES (?, ?, ?, ?, 0, ?, ?, 'seed', ?, 'seed', 1)`,
  ).run(galleryId, SYSTEM_ID, name, description, sortOrder, ts, ts);
}

function seedTagAndLink(
  db: BetterSqlite3.Database,
  galleryId: string,
  tagDisplay: string,
  table: 'member_gallery_tags' | 'member_gallery_exclude_tags',
): void {
  const norm = tagDisplay.toLowerCase();
  const ts = '2026-01-01T00:00:00Z';
  let tagId = (db.prepare('SELECT id FROM tags WHERE tag_normalized = ?').get(norm) as { id: string } | undefined)?.id;
  if (!tagId) {
    tagId = `tag_${Buffer.from(norm).toString('hex').slice(0, 24)}`;
    db.prepare(
      `INSERT INTO tags (
         id, created_at, created_by, updated_at, updated_by, version,
         tag_normalized, tag_display, is_standard, standard_type
       ) VALUES (?, ?, 'seed', ?, 'seed', 1, ?, ?, 0, NULL)`,
    ).run(tagId, ts, ts, norm, tagDisplay);
  }
  db.prepare(`INSERT INTO ${table} (gallery_id, tag_id, created_at, created_by) VALUES (?, ?, ?, 'seed')`)
    .run(galleryId, tagId, ts);
}

beforeAll(async () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'database', 'schema.sql'), 'utf8');
  const db = new BetterSqlite3(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);

  insertMember(db, { id: ADMIN_ID,  slug: ADMIN_SLUG,  display_name: 'Galleries Admin', login_email: 'admin-galleries@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'Galleries Member', login_email: 'member-galleries@example.com' });
  insertMember(db, { id: SYSTEM_ID, slug: 'footbag_hacky_galleries', display_name: 'Footbag Hacky', real_name: 'Footbag Hacky', is_system: 1 });

  // Two FH-owned galleries to exercise list and edit operations.
  seedGalleryRow(db, GALLERY_A, 'Alpha Gallery', 'Original alpha description', 'upload_desc');
  seedTagAndLink(db, GALLERY_A, '#freestyle', 'member_gallery_tags');
  seedTagAndLink(db, GALLERY_A, '#trick',     'member_gallery_tags');

  seedGalleryRow(db, GALLERY_B, 'Beta Gallery',  'Beta has an exclude tag',    'caption_asc');
  seedTagAndLink(db, GALLERY_B, '#curated',     'member_gallery_tags');
  seedTagAndLink(db, GALLERY_B, '#tutorial',    'member_gallery_tags');
  seedTagAndLink(db, GALLERY_B, '#deprecated',  'member_gallery_exclude_tags');

  db.close();

  const mod = await import('../../src/app');
  createApp = mod.createApp;
});

afterAll(() => {
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB_PATH + ext); } catch { /* ignore */ }
  }
});

describe('GET /admin/curator/galleries', () => {
  it('lists FH-owned galleries with criteria + exclude tags', async () => {
    const res = await request(createApp())
      .get('/admin/curator/galleries')
      .set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    expect(res.text).toContain(GALLERY_A);
    expect(res.text).toContain('Alpha Gallery');
    expect(res.text).toContain('#freestyle');
    expect(res.text).toContain('#trick');
    expect(res.text).toContain(GALLERY_B);
    expect(res.text).toContain('Beta Gallery');
    expect(res.text).toContain('#deprecated');
  });

  it('redirects unauthenticated requests to login', async () => {
    const res = await request(createApp()).get('/admin/curator/galleries');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });

  it('rejects authed-but-not-admin requests with 403', async () => {
    const res = await request(createApp())
      .get('/admin/curator/galleries')
      .set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/curator/galleries/:id/edit', () => {
  it('renders edit form with current values', async () => {
    const res = await request(createApp())
      .get(`/admin/curator/galleries/${GALLERY_A}/edit`)
      .set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    expect(res.text).toContain('Alpha Gallery');
    expect(res.text).toContain('Original alpha description');
    expect(res.text).toMatch(/value="upload_desc"\s+selected/);
    expect(res.text).toContain('#freestyle');
    expect(res.text).toContain('#trick');
  });

  it('returns 404 for an unknown gallery id', async () => {
    const res = await request(createApp())
      .get('/admin/curator/galleries/gallery_does_not_exist/edit')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(404);
  });

  it('redirects unauthenticated requests to login', async () => {
    const res = await request(createApp()).get(`/admin/curator/galleries/${GALLERY_A}/edit`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });
});

describe('POST /admin/curator/galleries/:id/edit (happy path)', () => {
  it('updates name, description, sort_order, criteria + exclude tags atomically', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/admin/curator/galleries/${GALLERY_A}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({
        name: 'Alpha Gallery (renamed)',
        description: 'Updated description',
        sortOrder: 'caption_asc',
        criteriaTags: '#freestyle #trick #curated',
        excludeTags: '#tricks_of_the_trade',
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/curator/galleries?saved=edit');

    // Confirm the persisted state via the list view.
    const list = await request(app)
      .get('/admin/curator/galleries')
      .set('Cookie', adminCookie());
    expect(list.text).toContain('Alpha Gallery (renamed)');
    expect(list.text).toContain('Updated description');
    expect(list.text).toContain('#tricks_of_the_trade');
  });

  it('is idempotent on a no-op re-save', async () => {
    const app = createApp();
    const body = {
      name: 'Alpha Gallery (renamed)',
      description: 'Updated description',
      sortOrder: 'caption_asc',
      criteriaTags: '#freestyle #trick #curated',
      excludeTags: '#tricks_of_the_trade',
    };
    const first = await request(app).post(`/admin/curator/galleries/${GALLERY_A}/edit`)
      .set('Cookie', adminCookie()).type('form').send(body);
    const second = await request(app).post(`/admin/curator/galleries/${GALLERY_A}/edit`)
      .set('Cookie', adminCookie()).type('form').send(body);
    expect(first.status).toBe(302);
    expect(second.status).toBe(302);
  });
});

describe('POST /admin/curator/galleries/:id/edit (validation)', () => {
  it('rejects empty name with 422', async () => {
    const res = await request(createApp())
      .post(`/admin/curator/galleries/${GALLERY_B}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({
        name: '   ',
        description: '',
        sortOrder: 'upload_desc',
        criteriaTags: '#curated',
        excludeTags: '',
      });
    expect(res.status).toBe(422);
    expect(res.text).toMatch(/name is required/i);
  });

  it('rejects invalid sortOrder with 422', async () => {
    const res = await request(createApp())
      .post(`/admin/curator/galleries/${GALLERY_B}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({
        name: 'Beta Gallery',
        description: '',
        sortOrder: 'random_garbage',
        criteriaTags: '#curated',
        excludeTags: '',
      });
    expect(res.status).toBe(422);
    expect(res.text).toMatch(/sort order/i);
  });

  it('rejects empty criteria-tag set with 422', async () => {
    const res = await request(createApp())
      .post(`/admin/curator/galleries/${GALLERY_B}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({
        name: 'Beta Gallery',
        description: '',
        sortOrder: 'upload_desc',
        criteriaTags: '   ',
        excludeTags: '',
      });
    expect(res.status).toBe(422);
    expect(res.text).toMatch(/at least one criteria tag/i);
  });

  it('rejects invalid tag pattern with 422', async () => {
    const res = await request(createApp())
      .post(`/admin/curator/galleries/${GALLERY_B}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({
        name: 'Beta Gallery',
        description: '',
        sortOrder: 'upload_desc',
        criteriaTags: '#bad-tag-with-hyphens',
        excludeTags: '',
      });
    expect(res.status).toBe(422);
    expect(res.text).toMatch(/criteria tag/i);
  });

  it('rejects criteria/exclude overlap with 422', async () => {
    const res = await request(createApp())
      .post(`/admin/curator/galleries/${GALLERY_B}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({
        name: 'Beta Gallery',
        description: '',
        sortOrder: 'upload_desc',
        criteriaTags: '#curated #shared',
        excludeTags: '#shared',
      });
    expect(res.status).toBe(422);
    expect(res.text).toMatch(/cannot be both/i);
  });

  it('returns 404 for an unknown gallery id', async () => {
    const res = await request(createApp())
      .post('/admin/curator/galleries/gallery_does_not_exist/edit')
      .set('Cookie', adminCookie())
      .type('form')
      .send({
        name: 'whatever',
        description: '',
        sortOrder: 'upload_desc',
        criteriaTags: '#curated',
        excludeTags: '',
      });
    expect(res.status).toBe(404);
  });

  it('rejects authed-but-not-admin POSTs with 403', async () => {
    const res = await request(createApp())
      .post(`/admin/curator/galleries/${GALLERY_B}/edit`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({
        name: 'spam',
        description: '',
        sortOrder: 'upload_desc',
        criteriaTags: '#curated',
        excludeTags: '',
      });
    expect(res.status).toBe(403);
  });
});
