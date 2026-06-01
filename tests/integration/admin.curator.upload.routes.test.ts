/**
 * Integration tests for the admin curator upload route.
 *
 * Covers GET + POST /admin/curator/upload. Mirrors the avatar route
 * test pattern: env vars set before module imports; image-processing
 * adapter injected with a fake fetch that runs Sharp inline; video
 * transcoding adapter injected with a fake adapter so ffmpeg is never
 * invoked.
 *
 * CSRF posture (per tests/integration/csrf.test.ts): SameSite=Lax cookie
 * + POST-only mutations. The "POST without cookie" case below covers the
 * full CSRF surface for this route — there is no token middleware.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DB_PATH = path.join(os.tmpdir(), `footbag-test-admin-curator-${Date.now()}.db`);
const TEST_MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-media-admin-'));
// Curator photo + video uploads write to /curated/{category}/ in local-adapter
// mode. Redirect that write to a temp directory so tests don't pollute the
// repo's real /curated/. The url_reference describe block below further
// overrides this for its scoped tests.
const TEST_CURATED_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-curated-admin-'));

process.env.FOOTBAG_DB_PATH   = TEST_DB_PATH;
process.env.FOOTBAG_MEDIA_DIR = TEST_MEDIA_DIR;
process.env.FOOTBAG_CURATED_MEDIA_DIR = TEST_MEDIA_DIR;
process.env.PORT              = '3099';
process.env.NODE_ENV          = 'test';
process.env.LOG_LEVEL         = 'error';
process.env.PUBLIC_BASE_URL   = 'http://localhost:3099';
process.env.SESSION_SECRET    = 'admin-curator-routes-test-secret';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import sharp from 'sharp';

import { insertMember, createTestSessionJwt } from '../fixtures/factories';

let resetImageProcessingAdapterForTests: () => void;
let resetVideoTranscodingAdapterForTests: () => void;

const ADMIN_ID    = 'admin-curator-001';
const ADMIN_SLUG  = 'curator_admin';
const MEMBER_ID   = 'member-curator-001';
const MEMBER_SLUG = 'regular_member';
const SYSTEM_ID   = 'member_footbag_hacky_test';

function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}

async function makeJpeg(width = 50, height = 50): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 80, g: 120, b: 160 } },
  }).jpeg().toBuffer();
}

function makeFakeMp4(): Buffer {
  const buf = Buffer.alloc(32);
  buf.write('ftyp', 4, 'ascii');
  buf.write('isom', 8, 'ascii');
  return buf;
}

function openDb(): BetterSqlite3.Database {
  return new BetterSqlite3(TEST_DB_PATH);
}

beforeAll(async () => {
  const schema = fs.readFileSync(
    path.join(process.cwd(), 'database', 'schema.sql'),
    'utf8',
  );
  const db = new BetterSqlite3(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);

  insertMember(db, { id: ADMIN_ID,  slug: ADMIN_SLUG,  display_name: 'Curator Admin', login_email: 'admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'Regular Member', login_email: 'member@example.com' });
  insertMember(db, { id: SYSTEM_ID, slug: 'footbag_hacky', display_name: 'Footbag Hacky', real_name: 'Footbag Hacky', is_system: 1 });
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
    adapterMod.createHttpImageAdapter({ internalSecret: 'test-internal-event-secret', baseUrl: 'http://test-injected', fetchImpl: fakeFetch }),
  );

  // Inject a fake video transcoding adapter so ffmpeg is never invoked.
  const videoAdapterMod = await import('../../src/adapters/videoTranscodingAdapter');
  resetVideoTranscodingAdapterForTests = videoAdapterMod.resetVideoTranscodingAdapterForTests;
  videoAdapterMod.setVideoTranscodingAdapterForTests({
    transcode: async () => ({
      bytes: Buffer.from('fake-transcoded-mp4'),
      outputFormat: 'mp4',
    }),
  });

  // Redirect /curated/ writes to the temp dir so this suite never touches
  // the repo's real /curated/ tree. The url_reference describe block
  // overrides this further with its own dir to test pre-existing
  // category subdirectories.
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.setCuratedRootDirForTests(TEST_CURATED_DIR);
});

afterAll(async () => {
  resetImageProcessingAdapterForTests();
  resetVideoTranscodingAdapterForTests();
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.resetCuratedRootDirForTests();
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB_PATH + ext); } catch { /* ignore */ }
  }
  try { fs.rmSync(TEST_MEDIA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(TEST_CURATED_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── GET /admin/curator/upload ──────────────────────────────────────────────

describe('GET /admin/curator/upload', () => {
  it('unauthenticated -> 302 to /login with returnTo', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/curator/upload');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?returnTo=%2Fadmin%2Fcurator%2Fupload');
  });

  it('non-admin authenticated -> 403', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/curator/upload')
      .set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('admin authenticated -> 200 with form fields', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/curator/upload')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="mediaType"');
    expect(res.text).toContain('value="photo"');
    expect(res.text).toContain('value="video"');
    expect(res.text).toContain('name="mediaFile"');
    expect(res.text).toContain('name="poster"');
    expect(res.text).toContain('name="caption"');
    expect(res.text).toContain('name="tags"');
    expect(res.text).not.toContain('Sidecar saved under');
  });

  it('admin authenticated, after a POST upload -> 200 with sidecar-saved banner via flash cookie', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const agent = request.agent(app);
    const postRes = await agent
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('newCategory', 'photos')
      .field('caption', `banner-flash-${Date.now()}`)
      .attach('mediaFile', jpeg, `banner-flash-${Date.now()}.jpg`);
    expect(postRes.status).toBe(303);
    const res = await agent
      .get('/admin/curator/upload')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sidecar saved under');
    expect(res.text).toContain('seed_fh_curator.py');
  });
});

// ── POST /admin/curator/upload ─────────────────────────────────────────────

describe('POST /admin/curator/upload — gates', () => {
  it('unauthenticated (no cookie, covers CSRF surface) -> 302 to /login', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post('/admin/curator/upload')
      .field('mediaType', 'photo')
      .attach('mediaFile', jpeg, 'p.jpg');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('non-admin authenticated -> 403', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', memberCookie())
      .field('mediaType', 'photo')
      .attach('mediaFile', jpeg, 'p.jpg');
    expect(res.status).toBe(403);
  });
});

describe('POST /admin/curator/upload — photo', () => {
  it('happy path: redirects, inserts media_items + media_tags + audit_entries; writes /curated/{category}/ binary + sidecar', async () => {
    const app = createApp();
    const jpeg = await makeJpeg(120, 90);
    const uniqueCaption = `photo-happy-${Date.now()}`;
    const uniqueTag = `#happy_${Date.now()}`;
    const uniqueFilename = `photo-happy-${Date.now()}.jpg`;

    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('newCategory', 'photos')
      .field('caption', uniqueCaption)
      .field('tags', uniqueTag)
      .attach('mediaFile', jpeg, uniqueFilename);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/curator/upload');

    const db = openDb();
    const mediaRow = db.prepare(`SELECT * FROM media_items WHERE caption = ?`).get(uniqueCaption) as Record<string, unknown>;
    expect(mediaRow.media_type).toBe('photo');
    expect(mediaRow.uploader_member_id).toBe(SYSTEM_ID);
    expect(mediaRow.is_avatar).toBe(0);
    expect(mediaRow.s3_key_thumb).toMatch(/-thumb\.jpg$/);
    expect(mediaRow.s3_key_display).toMatch(/-display\.jpg$/);
    expect(mediaRow.created_by).toBe('admin-act-as');
    expect(mediaRow.updated_by).toBe('admin-act-as');
    // In local-adapter mode, source_filename is the slugged on-disk binary
    // name so the seeder can reconcile media_items rows back to /curated/.
    expect(mediaRow.source_filename).toMatch(/^photo-happy-\d+\.jpg$/);

    // Both the uploader-supplied tag and the auto-applied #curated marker
    // should be present; assert each independently rather than relying on
    // row ordering across the join.
    const tagRows = db.prepare(`SELECT mt.tag_display FROM media_tags mt WHERE mt.media_id = ? ORDER BY mt.tag_display`).all(mediaRow.id) as { tag_display: string }[];
    const tagDisplays = tagRows.map((r) => r.tag_display);
    expect(tagDisplays).toContain(uniqueTag);
    expect(tagDisplays).toContain('#curated');

    const auditRow = db.prepare(`SELECT actor_type, actor_member_id, action_type, entity_type FROM audit_entries WHERE entity_id = ?`).get(mediaRow.id) as Record<string, string>;
    expect(auditRow.actor_type).toBe('admin');
    expect(auditRow.actor_member_id).toBe(ADMIN_ID);
    expect(auditRow.action_type).toBe('upload_curated_media');
    expect(auditRow.entity_type).toBe('media_item');
    db.close();

    // /curated/photos/<slug>.jpg + <slug>.meta.json must exist with the
    // right shape (binary + JSON sidecar paired under the same slug).
    const slug = String(mediaRow.source_filename).replace(/\.jpg$/, '');
    const binaryPath = path.join(TEST_CURATED_DIR, 'photos', `${slug}.jpg`);
    const sidecarPath = path.join(TEST_CURATED_DIR, 'photos', `${slug}.meta.json`);
    expect(fs.existsSync(binaryPath)).toBe(true);
    expect(fs.existsSync(sidecarPath)).toBe(true);
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
    expect(sidecar.caption).toBe(uniqueCaption);
    expect(sidecar.tags).toEqual([uniqueTag]);
    expect(sidecar.poster).toBeUndefined();
  });

  it('missing category in local mode -> 422', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .attach('mediaFile', jpeg, 'photo-no-cat.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('category');
  });

  it('invalid category name (uppercase / hyphens) -> 422', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('newCategory', 'Bad-Category')
      .attach('mediaFile', jpeg, 'photo-bad-cat.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('lowercase letters, digits');
  });

  it('rejects a path-traversal category (.. and slashes) with 422 before any filesystem write', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('newCategory', '../../etc')
      .attach('mediaFile', jpeg, 'traversal.jpg');
    // isValidCategoryName (regex ^[a-z0-9_]+$) rejects the dot-dot/slash
    // traversal vector; the category dir is never joined or written.
    expect(res.status).toBe(422);
    expect(res.text).toContain('lowercase letters, digits');
  });

  it('photo larger than 25 MB -> 422 (size cap fires before image detection)', async () => {
    const app = createApp();
    // uploadPhoto checks photoBuffer.length before detecting the image type,
    // so a 25 MB + 1 buffer trips the guard without a real large image. The
    // busboy per-file limit (150 MB, video-sized) lets it through to the
    // service-layer photo cap.
    const tooBig = Buffer.alloc(25 * 1024 * 1024 + 1, 0);
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('newCategory', 'photos')
      .attach('mediaFile', tooBig, 'huge.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Maximum size is 25 MB');
  });

  it('non-image file -> 422 with error message', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('newCategory', 'photos')
      .attach('mediaFile', Buffer.from('not an image'), 'fake.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('JPEG and PNG');
  });

  it('missing file -> 422 with error message', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('newCategory', 'photos');
    expect(res.status).toBe(422);
    expect(res.text).toContain('select a photo');
  });

  it('caption > 500 chars -> 422', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('newCategory', 'photos')
      .field('caption', 'x'.repeat(501))
      .attach('mediaFile', jpeg, 'photo.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Caption must be 500');
  });

  it('tag without leading "#" -> 422', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('newCategory', 'photos')
      .field('tags', 'no-hash')
      .attach('mediaFile', jpeg, 'photo.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('must start with');
  });

  it('external URL persists on the row + sidecar', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const uniqueCaption = `photo-ext-url-${Date.now()}`;
    const uniqueFilename = `photo-ext-url-${Date.now()}.jpg`;
    const externalUrl = 'https://example.com/photographer';

    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('newCategory', 'photos')
      .field('caption', uniqueCaption)
      .field('externalUrl', externalUrl)
      .attach('mediaFile', jpeg, uniqueFilename);
    expect(res.status).toBe(303);

    const db = openDb();
    const row = db.prepare(`SELECT external_url, external_url_validated_at FROM media_items WHERE caption = ?`).get(uniqueCaption) as { external_url: string; external_url_validated_at: string };
    // URL.toString() preserves the input form; no trailing slash is added
    // when a path component is present.
    expect(row.external_url).toBe(externalUrl);
    expect(row.external_url_validated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    db.close();
  });

  it('disallowed-scheme external URL -> 422 with DD §3.17 message', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('newCategory', 'photos')
      .field('externalUrl', 'javascript:alert(1)')
      .attach('mediaFile', jpeg, 'photo-bad-url.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('disallowed protocol');
  });

  it('regression: tags-drop bug — full form post preserves tags (busboy fields cap)', async () => {
    // Pre-existing bug: busboy `fields: 10` cap silently dropped trailing
    // form fields. The video form posts up to 12 non-file fields; this test
    // posts every named field on the photo path to confirm the wider cap
    // delivers tags + externalUrl all the way to the row + sidecar.
    const app = createApp();
    const jpeg = await makeJpeg();
    const uniqueCaption = `photo-fullpost-${Date.now()}`;
    const uniqueTag = `#fullpost_${Date.now()}`;
    const uniqueFilename = `photo-fullpost-${Date.now()}.jpg`;

    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('newCategory', 'photos')
      .field('videoPlatform', '')
      .field('videoUrl', '')
      .field('primarySlug', '')
      .field('title', '')
      .field('creator', '')
      .field('sourceId', '')
      .field('tier', '')
      .field('caption', uniqueCaption)
      .field('tags', uniqueTag)
      .field('externalUrl', 'https://example.com/x')
      .attach('mediaFile', jpeg, uniqueFilename);
    expect(res.status).toBe(303);

    const db = openDb();
    const row = db.prepare(`SELECT id FROM media_items WHERE caption = ?`).get(uniqueCaption) as { id: string };
    expect(row).toBeDefined();
    const tagRows = db.prepare(`SELECT t.tag_normalized FROM media_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.media_id = ?`).all(row.id) as { tag_normalized: string }[];
    const tags = tagRows.map((r) => r.tag_normalized);
    expect(tags).toContain(uniqueTag.toLowerCase());
    expect(tags).toContain('#curated');
    db.close();
  });
});

describe('POST /admin/curator/upload — video (local-adapter sync path)', () => {
  // In local-adapter mode the dev curator authoring path accepts video via
  // standard multipart and writes the source bytes + poster + sidecar to
  // /curated/{category}/. The async presign + S3 PUT + finalize flow is for
  // S3-adapter mode and is exercised in admin.curator.upload.async.routes.test.ts.

  it('happy path: redirects, inserts media_items + tags + audit; writes /curated/{category}/ video + poster + sidecar', async () => {
    const app = createApp();
    const mp4 = makeFakeMp4();
    const poster = await makeJpeg(120, 90);
    const uniqueCaption = `video-happy-${Date.now()}`;
    const uniqueTag = `#video_happy_${Date.now()}`;
    const uniqueFilename = `clip-${Date.now()}.mp4`;

    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'video')
      .field('newCategory', 'videos')
      .field('caption', uniqueCaption)
      .field('tags', uniqueTag)
      .attach('mediaFile', mp4, uniqueFilename)
      .attach('poster', poster, 'poster.jpg');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/curator/upload');

    const db = openDb();
    const mediaRow = db.prepare(`SELECT * FROM media_items WHERE caption = ?`).get(uniqueCaption) as Record<string, unknown>;
    expect(mediaRow.media_type).toBe('video');
    expect(mediaRow.uploader_member_id).toBe(SYSTEM_ID);
    // The video bytes' storage key lands in video_id (video_url is NULL for
    // s3-platform curator videos per insertCuratorVideo in db.ts).
    expect(mediaRow.video_id).toMatch(/-video\.mp4$/);
    expect(mediaRow.video_platform).toBe('s3');
    expect(mediaRow.source_filename).toMatch(/^clip-\d+\.mp4$/);
    db.close();

    const slug = String(mediaRow.source_filename).replace(/\.mp4$/, '');
    const videoPath = path.join(TEST_CURATED_DIR, 'videos', `${slug}.mp4`);
    const posterPath = path.join(TEST_CURATED_DIR, 'videos', `${slug}.poster.jpg`);
    const sidecarPath = path.join(TEST_CURATED_DIR, 'videos', `${slug}.meta.json`);
    expect(fs.existsSync(videoPath)).toBe(true);
    expect(fs.existsSync(posterPath)).toBe(true);
    expect(fs.existsSync(sidecarPath)).toBe(true);
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf-8'));
    expect(sidecar.caption).toBe(uniqueCaption);
    expect(sidecar.tags).toEqual([uniqueTag]);
    expect(sidecar.poster).toBe(`${slug}.poster.jpg`);
  });

  it('missing category in local mode -> 422', async () => {
    const app = createApp();
    const mp4 = makeFakeMp4();
    const poster = await makeJpeg();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'video')
      .attach('mediaFile', mp4, 'clip-no-cat.mp4')
      .attach('poster', poster, 'poster.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('category');
  });

  it('missing poster -> 422', async () => {
    const app = createApp();
    const mp4 = makeFakeMp4();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'video')
      .field('newCategory', 'videos')
      .attach('mediaFile', mp4, 'clip-no-poster.mp4');
    expect(res.status).toBe(422);
    expect(res.text).toContain('poster');
  });

  it('missing video file -> 422', async () => {
    const app = createApp();
    const poster = await makeJpeg();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'video')
      .field('newCategory', 'videos')
      .attach('poster', poster, 'poster.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('video');
  });

  it('regression: poster survives when an empty mediaFile is also posted (mimics browser submitting both photo and video panel inputs)', async () => {
    // The tabbed upload form has `mediaFile` inputs in BOTH the photo and
    // video panels (same name, distinct DOM nodes). Browsers submit a
    // file part for every input, so a video upload arrives as 3 file
    // parts: empty mediaFile (from the hidden photo input) + real
    // mediaFile (the video) + poster. busboy `files: 2` silently dropped
    // the poster; raised to 4. This test simulates the browser by
    // attaching an empty mediaFile before the real one.
    const app = createApp();
    const mp4 = makeFakeMp4();
    const poster = await makeJpeg(120, 90);
    const uniqueCaption = `video-multifile-${Date.now()}`;
    const uniqueFilename = `clip-multifile-${Date.now()}.mp4`;

    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'video')
      .field('newCategory', 'videos')
      .field('caption', uniqueCaption)
      .attach('mediaFile', Buffer.alloc(0), '')
      .attach('mediaFile', mp4, uniqueFilename)
      .attach('poster', poster, 'poster.jpg');
    expect(res.status).toBe(303);

    const db = openDb();
    const row = db.prepare(`SELECT id FROM media_items WHERE caption = ?`).get(uniqueCaption);
    expect(row).toBeDefined();
    db.close();
  });
});

describe('Header nav — admin link visibility', () => {
  it('admin sees the Admin link on the home page', async () => {
    const app = createApp();
    const res = await request(app).get('/').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/admin"');
    expect(res.text).toContain('>Admin</a>');
  });

  it('non-admin member does not see the Admin link', async () => {
    const app = createApp();
    const res = await request(app).get('/').set('Cookie', memberCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('>Admin</a>');
  });

  it('unauthenticated visitor does not see the Admin link', async () => {
    const app = createApp();
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('>Admin</a>');
  });

  it('Admin link is rendered active when the current section is /admin/*', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/curator/upload')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/href="\/admin"\s+class="active"/);
  });
});

describe('POST /admin/curator/upload — mediaType', () => {
  it('missing mediaType -> 422', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .attach('mediaFile', jpeg, 'photo.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('media type');
  });

  it('mediaType not in [photo,video,url_reference] -> 422', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'sculpture')
      .attach('mediaFile', jpeg, 'thing.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('media type');
  });
});

// ── /admin/curator/upload — URL reference ─────────────────────────────────
//
// URL-reference uploads write a sidecar JSON file under
// /curated/{category}/. No DB row is written by the route — the seeder
// regenerates DB rows from sidecars on each run. Tests inject:
//   - a stub URL verifier (so we don't hit youtube.com / vimeo.com)
//   - a temp /curated/ root (so writes don't pollute the repo)
// via the module-level `setVideoUrlVerifierForTests` /
// `setCuratedRootDirForTests` seams on curatorMediaService.
//
// Test temp dir mirrors repo state: only `freestyle_tricks/` pre-exists.
// Auto-mkdir creates other category dirs on demand.

describe('/admin/curator/upload — URL reference', () => {
  let curatedRoot: string;

  beforeAll(async () => {
    const svcMod = await import('../../src/services/curatorMediaService');
    curatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-url-ref-curated-'));
    fs.mkdirSync(path.join(curatedRoot, 'freestyle_tricks'), { recursive: true });
    svcMod.setCuratedRootDirForTests(curatedRoot);
  });

  afterAll(async () => {
    const svcMod = await import('../../src/services/curatorMediaService');
    svcMod.resetCuratedRootDirForTests();
    svcMod.resetVideoUrlVerifierForTests();
    fs.rmSync(curatedRoot, { recursive: true, force: true });
  });

  async function setVerifierToOk(body: Record<string, unknown>): Promise<void> {
    const svcMod = await import('../../src/services/curatorMediaService');
    svcMod.setVideoUrlVerifierForTests(async () => ({ ok: true, status: 200, body }));
  }

  async function setVerifierToFail(status: number): Promise<void> {
    const svcMod = await import('../../src/services/curatorMediaService');
    svcMod.setVideoUrlVerifierForTests(async () => ({ ok: false, status }));
  }

  it('GET form shows existing curated categories as checkboxes', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/curator/upload')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="category"');
    expect(res.text).toContain('value="freestyle_tricks"');
    expect(res.text).toContain('name="newCategory"');
  });

  it('happy path YouTube (existing freestyle_tricks): 303 redirect, sidecar written, NO DB row created', async () => {
    await setVerifierToOk({ title: 'Clipper tutorial' });
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'url_reference')
      .field('category', 'freestyle_tricks')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=CLIPPER12345')
      .field('primarySlug', 'clipper')
      .field('title', 'Clipper tutorial')
      .field('tags', '#freestyle #trick #clipper');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/curator/upload');

    const dirContents = fs.readdirSync(path.join(curatedRoot, 'freestyle_tricks'));
    const matching = dirContents.find((f) => f.startsWith('clipper_'));
    expect(matching).toBeDefined();
    const sidecar = JSON.parse(
      fs.readFileSync(path.join(curatedRoot, 'freestyle_tricks', matching!), 'utf-8'),
    );
    expect(sidecar.videoPlatform).toBe('youtube');
    expect(sidecar.videoUrl).toBe('https://www.youtube.com/watch?v=CLIPPER12345');
    expect(sidecar.thumbnailUrl).toBeUndefined();

    const db = openDb();
    const mediaRow = db.prepare(
      `SELECT id FROM media_items WHERE video_url = ?`,
    ).get('https://www.youtube.com/watch?v=CLIPPER12345');
    expect(mediaRow).toBeUndefined();
    db.close();
  });

  it('happy path Vimeo (existing freestyle_tricks): sidecar carries thumbnailUrl from oEmbed body', async () => {
    await setVerifierToOk({
      title: 'Eggbeater demo',
      thumbnail_url: 'https://i.vimeocdn.com/video/zzz_640.jpg',
    });
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'url_reference')
      .field('category', 'freestyle_tricks')
      .field('videoPlatform', 'vimeo')
      .field('videoUrl', 'https://vimeo.com/55667788')
      .field('primarySlug', 'eggbeater')
      .field('title', 'Eggbeater demo')
      .field('tags', '#freestyle #trick #eggbeater');
    expect(res.status).toBe(303);
    const matching = fs.readdirSync(path.join(curatedRoot, 'freestyle_tricks'))
      .find((f) => f.startsWith('eggbeater_'));
    const sidecar = JSON.parse(
      fs.readFileSync(path.join(curatedRoot, 'freestyle_tricks', matching!), 'utf-8'),
    );
    expect(sidecar.thumbnailUrl).toBe('https://i.vimeocdn.com/video/zzz_640.jpg');
  });

  it('happy path: new category via newCategory text auto-mkdirs the dir and writes the sidecar', async () => {
    await setVerifierToOk({ title: 'Food processor demo' });
    const app = createApp();
    expect(fs.existsSync(path.join(curatedRoot, 'promos_test'))).toBe(false);
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'url_reference')
      .field('newCategory', 'promos_test')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=NEWCAT00001')
      .field('primarySlug', 'food-processor')
      .field('title', 'Food processor demo')
      .field('tags', '#freestyle #demo #food-processor');
    expect(res.status).toBe(303);
    expect(fs.existsSync(path.join(curatedRoot, 'promos_test'))).toBe(true);
    const matching = fs.readdirSync(path.join(curatedRoot, 'promos_test'))
      .find((f) => f.startsWith('food-processor_'));
    expect(matching).toBeDefined();
  });

  it('dead URL (oEmbed 404) -> 422 with status in error, NO sidecar file written', async () => {
    await setVerifierToFail(404);
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'url_reference')
      .field('category', 'freestyle_tricks')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=Dmr7zj_c7cY')
      .field('primarySlug', 'dimwalk')
      .field('title', 'Dead URL test')
      .field('tags', '#freestyle #trick #dimwalk');
    expect(res.status).toBe(422);
    expect(res.text).toContain('oEmbed status 404');
    const dirContents = fs.readdirSync(path.join(curatedRoot, 'freestyle_tricks'));
    expect(dirContents.some((f) => f.startsWith('dimwalk_'))).toBe(false);
  });

  it('missing platform -> 422', async () => {
    await setVerifierToOk({ title: 'X' });
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'url_reference')
      .field('category', 'freestyle_tricks')
      .field('videoUrl', 'https://www.youtube.com/watch?v=AAA12345678')
      .field('primarySlug', 'spin')
      .field('title', 'X')
      .field('tags', '#freestyle #trick #spin');
    expect(res.status).toBe(422);
    expect(res.text).toContain('YouTube or Vimeo');
  });

  it('missing URL -> 422', async () => {
    await setVerifierToOk({ title: 'X' });
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'url_reference')
      .field('category', 'freestyle_tricks')
      .field('videoPlatform', 'youtube')
      .field('primarySlug', 'swirl')
      .field('title', 'X')
      .field('tags', '#freestyle #trick #swirl');
    expect(res.status).toBe(422);
    expect(res.text).toContain('YouTube or Vimeo URL');
  });

  it('missing primarySlug -> 422', async () => {
    await setVerifierToOk({ title: 'X' });
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'url_reference')
      .field('category', 'freestyle_tricks')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=AAA12345678')
      .field('title', 'X')
      .field('tags', '#freestyle #trick #vortex');
    expect(res.status).toBe(422);
    expect(res.text).toContain('primary slug');
  });

  it('both checkbox AND newCategory set -> 422 (mutually exclusive)', async () => {
    await setVerifierToOk({ title: 'X' });
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'url_reference')
      .field('category', 'freestyle_tricks')
      .field('newCategory', 'duplicate_intent')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=BBB12345678')
      .field('primarySlug', 'whirl')
      .field('title', 'X')
      .field('tags', '#freestyle #trick #whirl');
    expect(res.status).toBe(422);
    expect(res.text).toContain('not both');
  });

  it('neither checkbox NOR newCategory -> 422', async () => {
    await setVerifierToOk({ title: 'X' });
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'url_reference')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=CCC12345678')
      .field('primarySlug', 'tomahawk')
      .field('title', 'X')
      .field('tags', '#freestyle #trick #tomahawk');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Tick a category or type a new');
  });

  it('bad newCategory name (uppercase, spaces, punctuation) -> 422', async () => {
    await setVerifierToOk({ title: 'X' });
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', adminCookie())
      .field('mediaType', 'url_reference')
      .field('newCategory', 'Bad Name!')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=DDD12345678')
      .field('primarySlug', 'vortex')
      .field('title', 'X')
      .field('tags', '#freestyle #trick #vortex');
    expect(res.status).toBe(422);
    expect(res.text).toContain('lowercase letters, digits, or underscores');
  });

  it('unauth (no cookie) -> 302 to /login (no sidecar leak)', async () => {
    await setVerifierToOk({ title: 'X' });
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload')
      .field('mediaType', 'url_reference')
      .field('category', 'freestyle_tricks')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=ZZZ12345678')
      .field('primarySlug', 'superfly')
      .field('title', 'superfly')
      .field('tags', '#freestyle #trick #superfly');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
    const dirContents = fs.readdirSync(path.join(curatedRoot, 'freestyle_tricks'));
    expect(dirContents.some((f) => f.startsWith('superfly_'))).toBe(false);
  });

  it('non-admin authenticated -> 403 (no sidecar leak)', async () => {
    await setVerifierToOk({ title: 'X' });
    const app = createApp();
    const res = await request(app)
      .post('/admin/curator/upload')
      .set('Cookie', memberCookie())
      .field('mediaType', 'url_reference')
      .field('category', 'freestyle_tricks')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=YYY12345678')
      .field('primarySlug', 'pendulum')
      .field('title', 'pendulum')
      .field('tags', '#freestyle #trick #pendulum');
    expect(res.status).toBe(403);
    const dirContents = fs.readdirSync(path.join(curatedRoot, 'freestyle_tricks'));
    expect(dirContents.some((f) => f.startsWith('pendulum_'))).toBe(false);
  });
});
