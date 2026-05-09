/**
 * Integration tests for the owner-only member upload routes:
 *   GET  /members/:memberKey/media/upload
 *   POST /members/:memberKey/media/upload
 *
 * Auth: requireAuth + same-slug ownership check. Mismatched slug
 * returns 404 (anti-enumeration), matching the existing
 * member-route convention.
 *
 * Service-layer expectations exercised through these routes:
 *   - #by_<slug> auto-applied as the system uploader-attribution marker on every upload
 *   - Personal Gallery materialized on first upload (idempotent), keyed on #by_<slug>
 *   - #curated and any #by_* tag rejected from user input
 *   - Freeform #<slug> stays an ordinary tag any user may apply (mentions, pre-tagging)
 *   - Rate limit 10/hr photos, 5/hr video submissions
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DB_PATH = path.join(os.tmpdir(), `footbag-test-mu-${Date.now()}-${process.pid}.db`);
const TEST_MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-mu-media-'));

process.env.FOOTBAG_DB_PATH   = TEST_DB_PATH;
process.env.FOOTBAG_MEDIA_DIR = TEST_MEDIA_DIR;
process.env.PORT              = '3096';
process.env.NODE_ENV          = 'test';
process.env.LOG_LEVEL         = 'error';
process.env.PUBLIC_BASE_URL   = 'http://localhost:3096';
process.env.SESSION_SECRET    = 'member-upload-routes-test-secret';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import sharp from 'sharp';

import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const OWNER_ID    = 'member-mu-owner-001';
const OWNER_SLUG  = 'mu_owner';
const OTHER_ID    = 'member-mu-other-001';
const OTHER_SLUG  = 'mu_other';

let resetImageProcessingAdapterForTests: () => void;
let resetVideoUrlVerifierForTests: () => void;
let resetRateLimitForTests: () => void;

function ownerCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: OWNER_ID, role: 'member' })}`;
}
function otherCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: OTHER_ID, role: 'member' })}`;
}

async function makeJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 200, g: 80, b: 80 } },
  }).jpeg().toBuffer();
}

beforeAll(async () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'database', 'schema.sql'), 'utf8');
  const db = new BetterSqlite3(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);

  insertMember(db, { id: OWNER_ID, slug: OWNER_SLUG, display_name: 'Upload Owner' });
  insertMember(db, { id: OTHER_ID, slug: OTHER_SLUG, display_name: 'Other Member' });
  // System member row required by createGallery (it computes isFhOwned by
  // comparing ownerMemberId to the system member id). Member-owned galleries
  // never match this id but the lookup must succeed.
  insertMember(db, {
    id: 'member_footbag_hacky_mu_test',
    slug: 'fh_mu',
    display_name: 'Footbag Hacky',
    real_name: 'Footbag Hacky',
    is_system: 1,
  });

  db.close();

  const mod = await import('../../src/app');
  createApp = mod.createApp;

  // In-process Sharp pipeline injected at the HTTP-adapter boundary so the
  // suite runs without a real image worker. Mirrors the avatar suite.
  const adapterMod = await import('../../src/adapters/imageProcessingAdapter');
  const imgMod = await import('../../src/lib/imageProcessing');
  resetImageProcessingAdapterForTests = adapterMod.resetImageProcessingAdapterForTests;
  const fakeFetch: typeof fetch = async (_input, init) => {
    const body = init?.body as Buffer | Uint8Array;
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const processed = await imgMod.processPhoto(buf);
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

  // Video URL verifier stub: never hits youtube.com / vimeo.com. Returns
  // a fake oEmbed body for known-good URLs and an error for the bad ones.
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.setVideoUrlVerifierForTests(async (url, platform) => {
    if (url.includes('private') || url.includes('removed')) {
      return { ok: false, status: 404 };
    }
    if (platform === 'vimeo') {
      return {
        ok: true,
        status: 200,
        body: { thumbnail_url: 'https://i.vimeocdn.com/video/fake.jpg' },
      };
    }
    return { ok: true, status: 200, body: {} };
  });
  resetVideoUrlVerifierForTests = svcMod.resetVideoUrlVerifierForTests;

  const rlMod = await import('../../src/services/rateLimitService');
  resetRateLimitForTests = rlMod.resetRateLimitForTests;
});

afterAll(() => {
  resetImageProcessingAdapterForTests?.();
  resetVideoUrlVerifierForTests?.();
  resetRateLimitForTests?.();
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB_PATH + ext); } catch { /* ignore */ }
  }
  try { fs.rmSync(TEST_MEDIA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

beforeEach(() => {
  // Each test starts with empty galleries / media for the owner so
  // assertions about "first upload creates Personal Gallery" stay
  // deterministic.
  const db = new BetterSqlite3(TEST_DB_PATH);
  try {
    db.pragma('foreign_keys = ON');
    db.exec(`DELETE FROM media_tags`);
    db.exec(`DELETE FROM media_items WHERE uploader_member_id = '${OWNER_ID}'`);
    db.exec(`DELETE FROM member_galleries WHERE owner_member_id = '${OWNER_ID}'`);
  } finally {
    db.close();
  }
  resetRateLimitForTests();
});

// ── GET /members/:memberKey/media/upload ────────────────────────────────────

describe('GET /members/:memberKey/media/upload', () => {
  it('unauthenticated -> 302 to /login', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${OWNER_SLUG}/media/upload`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('owner -> 200 with the form', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Upload Media');
    expect(res.text).toContain('photoFile');
    expect(res.text).toContain('videoUrl');
  });

  it("non-owner viewing another's upload page -> 404", async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', otherCookie());
    expect(res.status).toBe(404);
  });
});

// ── POST /members/:memberKey/media/upload — photo ──────────────────────────

describe('POST /members/:memberKey/media/upload (photo)', () => {
  it('unauthenticated -> 302 to /login', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .field('mediaType', 'photo')
      .attach('photoFile', jpeg, 'test.jpg');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('owner valid JPEG -> 302 to /galleries?saved=upload', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('caption', 'My first upload')
      .field('tags', '#freestyle')
      .attach('photoFile', jpeg, 'first.jpg');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/members/${OWNER_SLUG}/galleries?saved=upload`);
  });

  it('owner valid JPEG -> #by_<slug> auto-applied + Personal Gallery created', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('caption', 'tag check')
      .field('tags', '#freestyle')
      .attach('photoFile', jpeg, 't.jpg');

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const tagRows = db.prepare(`
        SELECT mt.tag_display
        FROM media_items mi
        JOIN media_tags mt ON mt.media_id = mi.id
        WHERE mi.uploader_member_id = ?
        ORDER BY mt.tag_display
      `).all(OWNER_ID) as Array<{ tag_display: string }>;
      const tags = tagRows.map((r) => r.tag_display);
      expect(tags).toContain(`#by_${OWNER_SLUG}`);
      expect(tags).not.toContain(`#${OWNER_SLUG}`);
      expect(tags).toContain('#freestyle');

      const gallery = db.prepare(`
        SELECT name, is_default
        FROM member_galleries
        WHERE owner_member_id = ?
      `).get(OWNER_ID) as { name: string; is_default: number } | undefined;
      expect(gallery?.name).toBe('Personal Gallery');
      expect(gallery?.is_default).toBe(1);
    } finally {
      db.close();
    }
  });

  it('second upload does not duplicate Personal Gallery', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'photo')
        .field('caption', `n${i}`)
        .field('tags', '')
        .attach('photoFile', jpeg, `${i}.jpg`);
      expect(res.status).toBe(302);
    }
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const count = db.prepare(`
        SELECT COUNT(*) AS n FROM member_galleries WHERE owner_member_id = ?
      `).get(OWNER_ID) as { n: number };
      expect(count.n).toBe(1);
    } finally {
      db.close();
    }
  });

  it('user-supplied #<own_slug> is accepted as a freeform mention tag', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', `#${OWNER_SLUG} #beach`)
      .attach('photoFile', jpeg, 't.jpg');
    expect(res.status).toBe(302);
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const tagRows = db.prepare(`
        SELECT mt.tag_display
        FROM media_items mi
        JOIN media_tags mt ON mt.media_id = mi.id
        WHERE mi.uploader_member_id = ?
        ORDER BY mt.tag_display
      `).all(OWNER_ID) as Array<{ tag_display: string }>;
      const tags = tagRows.map((r) => r.tag_display);
      expect(tags).toContain(`#by_${OWNER_SLUG}`);
      expect(tags).toContain(`#${OWNER_SLUG}`);
      expect(tags).toContain('#beach');
    } finally {
      db.close();
    }
  });

  it('user supplies #curated -> 422 with rejection message', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', '#curated')
      .attach('photoFile', jpeg, 't.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('#curated');
  });

  it('user supplies #by_<own_slug> -> 422; no media row written', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', `#by_${OWNER_SLUG}`)
      .attach('photoFile', jpeg, 't.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('#by_');
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const row = db.prepare(
        `SELECT COUNT(*) AS n FROM media_items WHERE uploader_member_id = ?`,
      ).get(OWNER_ID) as { n: number };
      expect(row.n).toBe(0);
    } finally {
      db.close();
    }
  });

  it('user supplies #by_<other_slug> -> 422 (forging foreign attribution rejected)', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', `#by_${OTHER_SLUG}`)
      .attach('photoFile', jpeg, 't.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('#by_');
  });

  it("user supplies #<other_slug> as freeform mention -> 302; does NOT pollute the other member's #by_ namespace", async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', `#${OTHER_SLUG}`)
      .attach('photoFile', jpeg, 't.jpg');
    expect(res.status).toBe(302);
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const tagRows = db.prepare(
        `SELECT mt.tag_display
           FROM media_items mi
           JOIN media_tags mt ON mt.media_id = mi.id
          WHERE mi.uploader_member_id = ?`,
      ).all(OWNER_ID) as Array<{ tag_display: string }>;
      const tags = tagRows.map((r) => r.tag_display);
      expect(tags).toContain(`#by_${OWNER_SLUG}`);
      expect(tags).toContain(`#${OTHER_SLUG}`);
      expect(tags).not.toContain(`#by_${OTHER_SLUG}`);
    } finally {
      db.close();
    }
  });

  it('user supplies #<unknown_slug> for an unsigned/historical person -> 302; tag stored as freeform', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', '#stebag_legacy')
      .attach('photoFile', jpeg, 't.jpg');
    expect(res.status).toBe(302);
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const tagRows = db.prepare(
        `SELECT mt.tag_display
           FROM media_items mi
           JOIN media_tags mt ON mt.media_id = mi.id
          WHERE mi.uploader_member_id = ?`,
      ).all(OWNER_ID) as Array<{ tag_display: string }>;
      const tags = tagRows.map((r) => r.tag_display);
      expect(tags).toContain('#stebag_legacy');
      expect(tags).toContain(`#by_${OWNER_SLUG}`);
    } finally {
      db.close();
    }
  });

  it('non-image bytes -> 422', async () => {
    const app = createApp();
    const notAnImage = Buffer.from('definitely not jpeg or png');
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .attach('photoFile', notAnImage, 'fake.txt');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Only JPEG and PNG');
  });

  it('no file submitted -> 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('caption', 'no file');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Choose a photo file');
  });

  it("posting to another member's upload route -> 404", async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', otherCookie())
      .field('mediaType', 'photo')
      .attach('photoFile', jpeg, 't.jpg');
    expect(res.status).toBe(404);
  });

  it('re-uploading a file with the same name -> 422 with clean message', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const first = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .attach('photoFile', jpeg, 'duplicate.jpg');
    expect(first.status).toBe(302);

    const second = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .attach('photoFile', jpeg, 'duplicate.jpg');
    expect(second.status).toBe(422);
    expect(second.text).toContain('already uploaded');
    expect(second.text).toContain('duplicate.jpg');
  });

  it('11th photo upload in the hour -> 429 with Retry-After', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    for (let i = 0; i < 10; i++) {
      const ok = await request(app)
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'photo')
        .attach('photoFile', jpeg, `r${i}.jpg`);
      expect(ok.status).toBe(302);
    }
    const blocked = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .attach('photoFile', jpeg, 'r11.jpg');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});

// ── POST /members/:memberKey/media/upload — video URL ──────────────────────

describe('POST /members/:memberKey/media/upload (video)', () => {
  it('valid YouTube URL -> 302 + media row + #<slug> tag', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'video')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      .field('caption', 'classic')
      .field('tags', '#tutorial');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/members/${OWNER_SLUG}/galleries?saved=upload`);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const row = db.prepare(`
        SELECT video_platform, video_id, video_url
        FROM media_items
        WHERE uploader_member_id = ? AND media_type = 'video'
      `).get(OWNER_ID) as
        | { video_platform: string; video_id: string; video_url: string }
        | undefined;
      expect(row?.video_platform).toBe('youtube');
      expect(row?.video_id).toBe('dQw4w9WgXcQ');
    } finally {
      db.close();
    }
  });

  it('Vimeo URL with thumbnail body -> 302 + thumbnail_url stored', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'video')
      .field('videoPlatform', 'vimeo')
      .field('videoUrl', 'https://vimeo.com/123456789')
      .field('tags', '');
    expect(res.status).toBe(302);
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const row = db.prepare(`
        SELECT thumbnail_url
        FROM media_items
        WHERE uploader_member_id = ? AND media_type = 'video'
      `).get(OWNER_ID) as { thumbnail_url: string | null } | undefined;
      expect(row?.thumbnail_url).toBe('https://i.vimeocdn.com/video/fake.jpg');
    } finally {
      db.close();
    }
  });

  it('removed/private video URL -> 422 (oEmbed says unavailable)', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'video')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=removed12345');
    expect(res.status).toBe(422);
    expect(res.text).toContain('not available');
  });

  it('missing platform -> 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'video')
      .field('videoUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(res.status).toBe(422);
    expect(res.text).toContain('YouTube or Vimeo');
  });
});

// ── POST /members/:memberKey/galleries — combined create + upload ──────────

describe('POST /members/:memberKey/galleries (multipart, combined)', () => {
  it('gallery + 2 files -> gallery row exists, 2 media rows tagged with criteria', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();

    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .field('name', 'Beach 2025')
      .field('description', 'sand and bag')
      .field('sortOrder', 'upload_desc')
      .field('criteriaTags', '#event_2025_beach')
      .field('excludeTags', '')
      .attach('photoFiles', jpeg, 'a.jpg')
      .attach('photoFiles', jpeg, 'b.jpg');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/members\/mu_owner\/galleries\?saved=create/);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const galleries = db.prepare(`
        SELECT id, name FROM member_galleries WHERE owner_member_id = ?
      `).all(OWNER_ID) as Array<{ id: string; name: string }>;
      const beach = galleries.find((g) => g.name === 'Beach 2025');
      expect(beach).toBeDefined();

      const media = db.prepare(`
        SELECT id FROM media_items WHERE uploader_member_id = ?
      `).all(OWNER_ID) as Array<{ id: string }>;
      expect(media.length).toBe(2);

      const tagDisplays = db.prepare(`
        SELECT mt.tag_display
        FROM media_items mi
        JOIN media_tags mt ON mt.media_id = mi.id
        WHERE mi.uploader_member_id = ?
      `).all(OWNER_ID) as Array<{ tag_display: string }>;
      const everyMediaHasBeachTag = media.every((m) =>
        tagDisplays.some((t) => t.tag_display === '#event_2025_beach' && tagDisplays.find(() => true)),
      );
      expect(everyMediaHasBeachTag).toBe(true);
      expect(tagDisplays.some((t) => t.tag_display === `#by_${OWNER_SLUG}`)).toBe(true);
    } finally {
      db.close();
    }
  });

  it("gallery's criteria auto-includes #by_<slug> so the filter scopes to the owner", async () => {
    const app = createApp();
    const jpeg = await makeJpeg();

    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .field('name', 'Funky Footbags')
      .field('description', '')
      .field('sortOrder', 'upload_desc')
      .field('criteriaTags', '#footbag')
      .field('excludeTags', '')
      .attach('photoFiles', jpeg, 'f.jpg');
    expect(res.status).toBe(302);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const gallery = db.prepare(`
        SELECT id FROM member_galleries WHERE owner_member_id = ? AND name = ?
      `).get(OWNER_ID, 'Funky Footbags') as { id: string } | undefined;
      expect(gallery).toBeDefined();

      const criteriaTags = db.prepare(`
        SELECT t.tag_display
        FROM member_gallery_tags mgt
        JOIN tags t ON t.id = mgt.tag_id
        WHERE mgt.gallery_id = ?
        ORDER BY t.tag_display
      `).all(gallery!.id) as Array<{ tag_display: string }>;
      const tags = criteriaTags.map((r) => r.tag_display);
      expect(tags).toContain(`#by_${OWNER_SLUG}`);
      expect(tags).toContain('#footbag');
    } finally {
      db.close();
    }
  });

  it('user supplies #by_* in gallery criteria -> 422; no gallery created', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .field('name', 'Forged Attribution')
      .field('description', '')
      .field('sortOrder', 'upload_desc')
      .field('criteriaTags', `#by_${OTHER_SLUG} #footbag`)
      .field('excludeTags', '');
    expect(res.status).toBe(422);
    expect(res.text).toContain('#by_');
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const gallery = db.prepare(
        `SELECT id FROM member_galleries WHERE owner_member_id = ? AND name = ?`,
      ).get(OWNER_ID, 'Forged Attribution') as { id: string } | undefined;
      expect(gallery).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it('no files -> behaves equivalent to form-encoded path (gallery created, no media)', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .field('name', 'Empty Gallery')
      .field('description', '')
      .field('sortOrder', 'upload_desc')
      .field('criteriaTags', '#empty')
      .field('excludeTags', '');
    expect(res.status).toBe(302);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const gallery = db.prepare(`
        SELECT id FROM member_galleries WHERE owner_member_id = ? AND name = ?
      `).get(OWNER_ID, 'Empty Gallery') as { id: string } | undefined;
      expect(gallery).toBeDefined();
      const media = db.prepare(`
        SELECT COUNT(*) AS n FROM media_items WHERE uploader_member_id = ?
      `).get(OWNER_ID) as { n: number };
      expect(media.n).toBe(0);
    } finally {
      db.close();
    }
  });

  it('bad file -> 422, no gallery created', async () => {
    const app = createApp();
    const notAnImage = Buffer.from('definitely not jpeg');
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .field('name', 'Should Not Exist')
      .field('description', '')
      .field('sortOrder', 'upload_desc')
      .field('criteriaTags', '#bogus')
      .field('excludeTags', '')
      .attach('photoFiles', notAnImage, 'fake.txt');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Only JPEG and PNG');

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const gallery = db.prepare(`
        SELECT id FROM member_galleries WHERE owner_member_id = ? AND name = ?
      `).get(OWNER_ID, 'Should Not Exist') as { id: string } | undefined;
      expect(gallery).toBeUndefined();
    } finally {
      db.close();
    }
  });

  it('duplicate gallery name -> 422, no media written', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    // Pre-create the gallery so the second submit collides.
    await request(app)
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .field('name', 'Duplicate')
      .field('description', '')
      .field('sortOrder', 'upload_desc')
      .field('criteriaTags', '#first')
      .field('excludeTags', '');

    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .field('name', 'Duplicate')
      .field('description', '')
      .field('sortOrder', 'upload_desc')
      .field('criteriaTags', '#second')
      .field('excludeTags', '')
      .attach('photoFiles', jpeg, 'x.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('already exists');

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const media = db.prepare(`
        SELECT COUNT(*) AS n FROM media_items WHERE uploader_member_id = ?
      `).get(OWNER_ID) as { n: number };
      expect(media.n).toBe(0);
    } finally {
      db.close();
    }
  });

  it("posting to another member's create route -> 404", async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', otherCookie())
      .field('name', 'Forged')
      .field('description', '')
      .field('sortOrder', 'upload_desc')
      .field('criteriaTags', '#x')
      .field('excludeTags', '')
      .attach('photoFiles', jpeg, 'x.jpg');
    expect(res.status).toBe(404);
  });
});
