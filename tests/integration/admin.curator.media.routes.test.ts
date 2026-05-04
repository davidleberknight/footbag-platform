/**
 * Integration tests for the admin curator media list/edit/delete routes.
 *
 * Covers:
 *   GET    /admin/curator/media               (list, filter, pagination)
 *   GET    /admin/curator/media/:id/edit      (edit form)
 *   POST   /admin/curator/media/:id/edit      (apply caption + tags edit)
 *   POST   /admin/curator/media/:id/delete    (hard delete + S3 cleanup)
 *
 * Mirrors admin.curator.upload.routes.test.ts setup: env vars before module
 * imports; image-processing adapter injected with a fake fetch that runs Sharp
 * inline; video transcoder injected via setVideoTranscoderForTests.
 *
 * CSRF posture matches the upload route: SameSite=Lax cookie + POST-only
 * mutations. No token middleware on admin routes.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DB_PATH = path.join(os.tmpdir(), `footbag-test-admin-curator-media-${Date.now()}.db`);
const TEST_MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-media-admin-list-'));

process.env.FOOTBAG_DB_PATH   = TEST_DB_PATH;
process.env.FOOTBAG_MEDIA_DIR = TEST_MEDIA_DIR;
process.env.PORT              = '3098';
process.env.NODE_ENV          = 'test';
process.env.LOG_LEVEL         = 'error';
process.env.PUBLIC_BASE_URL   = 'http://localhost:3098';
process.env.SESSION_SECRET    = 'admin-curator-media-routes-test-secret';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import sharp from 'sharp';

import { insertMember, createTestSessionJwt, insertCuratorUrlReference } from '../fixtures/factories';

let resetImageProcessingAdapterForTests: () => void;

const ADMIN_ID    = 'admin-curator-media-001';
const ADMIN_SLUG  = 'curator_admin_media';
const MEMBER_ID   = 'member-curator-media-001';
const MEMBER_SLUG = 'regular_member_media';
const SYSTEM_ID   = 'member_footbag_hacky_media_test';

function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}

async function makeJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 80, g: 120, b: 160 } } }).jpeg().toBuffer();
}

beforeAll(async () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'database', 'schema.sql'), 'utf8');
  const db = new BetterSqlite3(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);

  insertMember(db, { id: ADMIN_ID,  slug: ADMIN_SLUG,  display_name: 'Curator Admin Media', login_email: 'admin-media@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'Regular Member Media', login_email: 'member-media@example.com' });
  insertMember(db, { id: SYSTEM_ID, slug: 'footbag_hacky_media', display_name: 'Footbag Hacky', real_name: 'Footbag Hacky', is_system: 1 });
  db.close();

  const mod = await import('../../src/app');
  createApp = mod.createApp;

  // Inject the image adapter to run Sharp inline (no real worker process).
  const adapterMod = await import('../../src/adapters/imageProcessingAdapter');
  const imgMod = await import('../../src/lib/imageProcessing');
  resetImageProcessingAdapterForTests = adapterMod.resetImageProcessingAdapterForTests;
  const fakeFetch: typeof fetch = async (input, init) => {
    const body = init?.body as Buffer | Uint8Array;
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const url = String(input);
    const processed = url.endsWith('/process/photo')
      ? await imgMod.processPhoto(buf)
      : await imgMod.processAvatar(buf);
    return new Response(
      JSON.stringify({
        thumb: processed.thumb.toString('base64'),
        display: processed.display.toString('base64'),
        widthPx: processed.widthPx,
        heightPx: processed.heightPx,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };
  adapterMod.setImageProcessingAdapterForTests(
    adapterMod.createHttpImageAdapter({ baseUrl: 'http://test-injected', fetchImpl: fakeFetch }),
  );
});

afterAll(() => {
  resetImageProcessingAdapterForTests();
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB_PATH + ext); } catch { /* ignore */ }
  }
  try { fs.rmSync(TEST_MEDIA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── Helper: upload one photo via the existing upload route ──────────────

let uploadCounter = 0;
async function uploadPhotoViaRoute(caption: string, tags: string[]): Promise<string> {
  const app = createApp();
  const jpeg = await makeJpeg();
  // Filename must be unique per upload to satisfy the partial UNIQUE INDEX
  // ux_media_items_source_filename_per_uploader (one active row per uploader+filename).
  const filename = `fixture-${++uploadCounter}-${Date.now()}.jpg`;
  const res = await request(app)
    .post('/admin/curator/upload')
    .set('Cookie', adminCookie())
    .field('mediaType', 'photo')
    .field('caption', caption)
    .field('tags', tags.join(' '))
    .attach('mediaFile', jpeg, filename);
  expect(res.status).toBeLessThan(400);
  // Look up the media row by unique caption to retrieve the new id.
  const db = new BetterSqlite3(TEST_DB_PATH);
  const row = db.prepare(`SELECT id FROM media_items WHERE caption = ? ORDER BY uploaded_at DESC LIMIT 1`).get(caption) as { id: string };
  db.close();
  return row.id;
}

// ── GET /admin/curator/media ─────────────────────────────────────────────

describe('GET /admin/curator/media', () => {
  it('unauthenticated -> 302 to /login with returnTo', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/curator/media');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?returnTo=%2Fadmin%2Fcurator%2Fmedia');
  });

  it('non-admin authenticated -> 403', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/curator/media').set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('admin authenticated -> 200 with list page shell', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/curator/media').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Curated Media');
    expect(res.text).toContain('/admin/curator/upload');
  });

  it('renders a row for an uploaded item', async () => {
    const caption = `LIST_HAPPY_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await uploadPhotoViaRoute(caption, []);
    const app = createApp();
    const res = await request(app).get('/admin/curator/media').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain(caption);
  });

  it('filters by tag query param', async () => {
    const tag = `#filter_route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const captionMatched = `LIST_FILTER_MATCH_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const captionUnrelated = `LIST_FILTER_OTHER_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await uploadPhotoViaRoute(captionMatched, [tag]);
    await uploadPhotoViaRoute(captionUnrelated, ['#unrelated_tag']);

    const app = createApp();
    const res = await request(app).get(`/admin/curator/media?tag=${encodeURIComponent(tag)}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain(captionMatched);
    expect(res.text).not.toContain(captionUnrelated);
  });
});

// ── GET /admin/curator/media/:id/edit ────────────────────────────────────

describe('GET /admin/curator/media/:id/edit', () => {
  it('unauthenticated -> 302 to /login with returnTo', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/curator/media/anything/edit');
    expect(res.status).toBe(302);
  });

  it('non-admin -> 403', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/curator/media/anything/edit').set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('admin + unknown id -> 404 with not-found message', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/curator/media/media_does_not_exist_xyz/edit').set('Cookie', adminCookie());
    expect(res.status).toBe(404);
    expect(res.text).toMatch(/no curator media item with id.*exists/i);
  });

  it('admin + valid id -> 200 with form prefilled (caption + tags, sans #curated)', async () => {
    const caption = `EDIT_GET_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tag = `#edit_get_tag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const mediaId = await uploadPhotoViaRoute(caption, [tag]);

    const app = createApp();
    const res = await request(app).get(`/admin/curator/media/${mediaId}/edit`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain(caption);
    expect(res.text).toContain(tag);
    // The auto-applied #curated tag must not appear in the editable input.
    expect(res.text).not.toMatch(/value="[^"]*#curated/);
  });
});

// ── POST /admin/curator/media/:id/edit ───────────────────────────────────

describe('POST /admin/curator/media/:id/edit', () => {
  it('unauthenticated -> 302', async () => {
    const app = createApp();
    const res = await request(app).post('/admin/curator/media/anything/edit').type('form').send({});
    expect(res.status).toBe(302);
  });

  it('non-admin -> 403', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/media/anything/edit')
      .set('Cookie', memberCookie())
      .type('form')
      .send({});
    expect(res.status).toBe(403);
  });

  it('admin happy path: caption + tags update redirects to list', async () => {
    const initialCaption = `EDIT_POST_INITIAL_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const updatedCaption = `EDIT_POST_UPDATED_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newTag = `#edit_post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const mediaId = await uploadPhotoViaRoute(initialCaption, ['#initial_tag']);

    const app = createApp();
    const res = await request(app)
      .post(`/admin/curator/media/${mediaId}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ caption: updatedCaption, tags: newTag });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/curator/media?saved=edit');

    const db = new BetterSqlite3(TEST_DB_PATH);
    const row = db.prepare(`SELECT caption FROM media_items WHERE id = ?`).get(mediaId) as { caption: string };
    expect(row.caption).toBe(updatedCaption);
    db.close();
  });

  it('admin + unknown id -> 404', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/media/media_unknown_xyz/edit')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ caption: 'whatever', tags: '' });
    expect(res.status).toBe(404);
  });

  it('admin + #curated in tags -> 422 with error message', async () => {
    const caption = `EDIT_REJECT_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const mediaId = await uploadPhotoViaRoute(caption, []);

    const app = createApp();
    const res = await request(app)
      .post(`/admin/curator/media/${mediaId}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ caption: 'fine', tags: '#curated #ok' });

    expect(res.status).toBe(422);
    expect(res.text).toContain('#curated');
  });

  it('admin + oversized caption -> 422', async () => {
    const caption = `EDIT_OVERSIZE_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const mediaId = await uploadPhotoViaRoute(caption, []);

    const app = createApp();
    const res = await request(app)
      .post(`/admin/curator/media/${mediaId}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ caption: 'x'.repeat(501), tags: '' });

    expect(res.status).toBe(422);
  });
});

// ── POST /admin/curator/media/:id/delete ─────────────────────────────────

describe('POST /admin/curator/media/:id/delete', () => {
  it('unauthenticated -> 302', async () => {
    const app = createApp();
    const res = await request(app).post('/admin/curator/media/anything/delete').type('form').send({});
    expect(res.status).toBe(302);
  });

  it('non-admin -> 403', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/media/anything/delete')
      .set('Cookie', memberCookie())
      .type('form')
      .send({});
    expect(res.status).toBe(403);
  });

  it('admin happy path: deletes row, removes tag links, redirects to list', async () => {
    const caption = `DELETE_HAPPY_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const mediaId = await uploadPhotoViaRoute(caption, ['#delete_test']);

    const app = createApp();
    const res = await request(app)
      .post(`/admin/curator/media/${mediaId}/delete`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({});

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/curator/media?saved=delete');

    const db = new BetterSqlite3(TEST_DB_PATH);
    const row = db.prepare(`SELECT id FROM media_items WHERE id = ?`).get(mediaId);
    expect(row).toBeUndefined();
    const tagRows = db.prepare(`SELECT id FROM media_tags WHERE media_id = ?`).all(mediaId);
    expect(tagRows).toEqual([]);
    db.close();
  });

  it('admin + unknown id -> 404', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/media/media_unknown_xyz/delete')
      .set('Cookie', adminCookie())
      .type('form')
      .send({});
    expect(res.status).toBe(404);
  });
});

// ── Sidecar-backed URL-reference routes ──────────────────────────────────
//
// Exercises the runtime sidecar-resolution branch for getEdit / postEdit /
// postDelete. The service factory's curatedRootDir is overridden to a temp
// dir per-suite so the repo's real /curated/ stays untouched.

describe('admin curator media routes — sidecar-backed (URL reference)', () => {
  let curatedRoot: string;
  let resetCuratedRootDirForTests: () => void;

  beforeAll(async () => {
    curatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-curator-routes-curated-'));
    const svcMod = await import('../../src/services/curatorMediaService');
    svcMod.setCuratedRootDirForTests(curatedRoot);
    resetCuratedRootDirForTests = svcMod.resetCuratedRootDirForTests;
  });

  afterAll(() => {
    resetCuratedRootDirForTests?.();
    try { fs.rmSync(curatedRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  function seedSidecarRow(slug: string): { mediaId: string; sidecarPath: string; sidecarFilename: string; videoUrl: string } {
    const db = new BetterSqlite3(TEST_DB_PATH);
    const videoUrl = `https://www.youtube.com/watch?v=ROUTE_${slug}`;
    const result = insertCuratorUrlReference(db, {
      uploaderMemberId: SYSTEM_ID,
      curatedRoot,
      category: 'freestyle_tricks',
      primarySlug: slug,
      videoUrl,
      videoPlatform: 'youtube',
      videoId: `ROUTE_${slug}`,
      caption: `Title for ${slug}`,
      creator: 'Original Creator',
      sourceId: 'src_route',
      tier: 'CANONICAL_TUTORIAL',
      tags: ['#freestyle', '#trick', `#${slug}`],
    });
    db.close();
    return { ...result, videoUrl };
  }

  it('GET edit form for a sidecar-backed item shows URL-reference fields prefilled', async () => {
    const slug = `gete_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const { mediaId, videoUrl } = seedSidecarRow(slug);

    const app = createApp();
    const res = await request(app)
      .get(`/admin/curator/media/${mediaId}/edit`)
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('URL reference fields');
    expect(res.text).toContain(`value="Title for ${slug}"`);
    expect(res.text).toContain('value="Original Creator"');
    expect(res.text).toContain('value="src_route"');
    expect(res.text).toContain('value="CANONICAL_TUTORIAL"');
    // The URL is rendered inside <code>; Handlebars HTML-escapes `=` to
    // `&#x3D;`. Match on the unique YouTube id portion instead.
    expect(res.text).toContain(`ROUTE_${slug}`);
    // YouTube: thumbnailUrl input is not rendered (Vimeo-only).
    expect(res.text).not.toContain('name="thumbnailUrl"');
  });

  it('GET edit form for a DB-direct photo does NOT show URL-reference fields', async () => {
    const caption = `GETED_DBDIRECT_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const mediaId = await uploadPhotoViaRoute(caption, []);
    const app = createApp();
    const res = await request(app)
      .get(`/admin/curator/media/${mediaId}/edit`)
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('URL reference fields');
    expect(res.text).not.toContain('name="creator"');
  });

  it('POST edit on sidecar-backed item rewrites sidecar (caption + creator) and redirects to ?saved=edit', async () => {
    const slug = `poste_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const { mediaId, sidecarPath } = seedSidecarRow(slug);

    const newCaption = `Edited title ${slug}`;
    const newCreator = 'Edited Creator';
    const app = createApp();
    const res = await request(app)
      .post(`/admin/curator/media/${mediaId}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({
        caption: newCaption,
        tags: `#freestyle #trick #${slug}`,
        creator: newCreator,
        sourceId: 'src_route_edited',
        tier: 'HIGH_QUALITY_DEMO',
      });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/curator/media?saved=edit');

    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
    expect(sidecar.title).toBe(newCaption);
    expect(sidecar.creator).toBe(newCreator);
    expect(sidecar.sourceId).toBe('src_route_edited');
    expect(sidecar.tier).toBe('HIGH_QUALITY_DEMO');
  });

  it('POST delete on sidecar-backed item unlinks sidecar and redirects to ?saved=delete', async () => {
    const slug = `postd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const { mediaId, sidecarPath } = seedSidecarRow(slug);

    const app = createApp();
    const res = await request(app)
      .post(`/admin/curator/media/${mediaId}/delete`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({});
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin/curator/media?saved=delete');
    expect(fs.existsSync(sidecarPath)).toBe(false);

    const db = new BetterSqlite3(TEST_DB_PATH);
    const row = db.prepare(`SELECT id FROM media_items WHERE id = ?`).get(mediaId);
    expect(row).toBeUndefined();
    db.close();
  });

  it('GET list with ?saved=edit renders the success banner', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/curator/media?saved=edit')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Saved.');
    expect(res.text).toContain('seed_curator_media.py');
  });

  it('GET list with ?saved=delete renders the success banner', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/curator/media?saved=delete')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Deleted.');
  });

  it('GET list without saved query param does NOT render banner', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/curator/media')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('seed_curator_media.py');
  });
});
