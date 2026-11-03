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
 *   - Rate limit 30/hr photos by default, 5/hr video submissions
 *   - Size per photo set by an administrator, never above the code maximum
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath: TEST_DB_PATH } = setTestEnv('4205');
const TEST_MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-mu-media-'));
process.env.FOOTBAG_MEDIA_DIR = TEST_MEDIA_DIR;
process.env.FOOTBAG_CURATED_MEDIA_DIR = TEST_MEDIA_DIR;

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import sharp from 'sharp';
import { PHOTO_TOO_TALL_MESSAGE, PHOTO_TOO_WIDE_MESSAGE } from '../../src/lib/imageProcessing';

import {
  insertMember,
  completeOnboarding,
  insertMemberTierGrant,
  createTestSessionJwt,
  insertSystemConfig,
} from '../fixtures/factories';

const OWNER_ID    = 'member-mu-owner-001';
const OWNER_SLUG  = 'mu_owner';
const OTHER_ID    = 'member-mu-other-001';
const OTHER_SLUG  = 'mu_other';
const ADMIN_ID    = 'member-mu-admin-001';
const ADMIN_SLUG  = 'mu_admin';

let resetImageProcessingAdapterForTests: () => void;
let resetVideoUrlVerifierForTests: () => void;
let resetRateLimitForTests: () => void;

function ownerCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: OWNER_ID, role: 'member' })}`;
}
function otherCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: OTHER_ID, role: 'member' })}`;
}
function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

async function makeJpeg(background = { r: 200, g: 80, b: 80 }): Promise<Buffer> {
  return sharp({
    create: { width: 256, height: 256, channels: 3, background },
  }).jpeg().toBuffer();
}

// Calls the suite's video-URL verifier stub has answered, so a case can show
// the platform was or was not asked again.
let videoVerifierCalls = 0;

function ownerPhotoRows(sourceFilename: string): Array<{ id: string }> {
  const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
  try {
    return db.prepare(
      `SELECT id FROM media_items WHERE uploader_member_id = ? AND media_type = 'photo' AND source_filename = ?`,
    ).all(OWNER_ID, sourceFilename) as Array<{ id: string }>;
  } finally { db.close(); }
}

function mediaIdByFilename(sourceFilename: string): string {
  const rows = ownerPhotoRows(sourceFilename);
  expect(rows, `one photo stored as ${sourceFilename}`).toHaveLength(1);
  return rows[0].id;
}

function ownerVideoRows(videoId: string): Array<{ id: string }> {
  const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
  try {
    return db.prepare(
      `SELECT id FROM media_items WHERE uploader_member_id = ? AND media_type = 'video' AND video_id = ?`,
    ).all(OWNER_ID, videoId) as Array<{ id: string }>;
  } finally { db.close(); }
}

function auditCountFor(actionType: string, entityId: string): number {
  const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
  try {
    return (db.prepare(
      'SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = ? AND entity_id = ?',
    ).get(actionType, entityId) as { n: number }).n;
  } finally { db.close(); }
}

// Every object the local storage adapter holds, so a case can show nothing
// was stored again.
function storedFileCount(): number {
  return fs.readdirSync(TEST_MEDIA_DIR, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile()).length;
}

function flashOf(res: { headers: Record<string, unknown> }): string | undefined {
  return ([] as string[]).concat((res.headers['set-cookie'] as string[] | undefined) ?? [])
    .find((c) => c.startsWith('footbag_flash='))?.split(';')[0];
}

beforeAll(async () => {
  const db = createTestDb(TEST_DB_PATH);
  insertMember(db, { id: OWNER_ID, slug: OWNER_SLUG, display_name: 'Upload Owner' });
  completeOnboarding(db, OWNER_ID);
  insertMember(db, { id: OTHER_ID, slug: OTHER_SLUG, display_name: 'Other Member' });
  completeOnboarding(db, OTHER_ID);

  // Grant Tier 1 to OWNER and OTHER so the requireTier1Benefits gate on
  // POST /members/:slug/media/upload passes. Without this, every POST 403s
  // from the gate before reaching the controller's owner check, and the
  // cross-member 404 anti-enumeration test would no longer reach the
  // owner-check branch it exists to verify.
  insertMemberTierGrant(db, { member_id: OWNER_ID, new_tier_status: 'tier1' });
  insertMemberTierGrant(db, { member_id: OTHER_ID, new_tier_status: 'tier1' });
  insertMember(db, { id: ADMIN_ID, slug: ADMIN_SLUG, display_name: 'Admin Uploader', is_admin: 1 });
  completeOnboarding(db, ADMIN_ID);
  insertMemberTierGrant(db, { member_id: ADMIN_ID, new_tier_status: 'tier1' });
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

  createApp = await importApp();

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
    videoVerifierCalls += 1;
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
  cleanupTestDb(TEST_DB_PATH);
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
    // Defect caught: the picker takes one file, so a member cannot share
    // several photos at once.
    expect(res.text).toMatch(/<input type="file"[^>]*name="photoFiles"[^>]*multiple/);
    expect(res.text).toContain('name="videoUrl"');
    expect(res.text).toContain('name="galleryName"');
    // Defect caught: a gallery is still a destination picked from a list, or the
    // platform is a separate choice that can disagree with the link.
    expect(res.text).not.toContain('name="galleryId"');
    expect(res.text).not.toContain('name="videoPlatform"');
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
      .attach('photoFiles', jpeg, 'test.jpg');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('owner valid JPEG -> 303 to the item in the Personal Gallery, which reports it once', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const agent = request.agent(app);
    const res = await agent
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('caption', 'My first upload')
      .field('tags', '#freestyle')
      .attach('photoFiles', jpeg, 'first.jpg');
    expect(res.status).toBe(303);
    const mediaId = mediaIdByFilename('first.jpg');
    // Defect caught: a share lands anywhere but the photo just shared, so the
    // member cannot see it straight away.
    expect(res.headers.location).toBe(`/media/gallery_${OWNER_SLUG}_personal_gallery/${mediaId}`);
    const landed = await agent.get(res.headers.location).set('Cookie', ownerCookie());
    expect(landed.status).toBe(200);
    expect(landed.text).toContain('class="form-success-banner"');
    // The owner is offered the item's edit page from it.
    expect(landed.text).toContain(`href="/members/${OWNER_SLUG}/media/${mediaId}/edit"`);
    const again = await agent.get(res.headers.location).set('Cookie', ownerCookie());
    expect(again.text).not.toContain('class="form-success-banner"');
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
      .attach('photoFiles', jpeg, 't.jpg');

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
        .attach('photoFiles', jpeg, `${i}.jpg`);
      expect(res.status).toBe(303);
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
      .attach('photoFiles', jpeg, 't.jpg');
    expect(res.status).toBe(303);
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

  // The page as a browser without JavaScript sends it: the plain text field
  // named tags. Each # starts a hashtag; words typed without one stay together.
  // Defect caught: "footbag chin lone" is saved as three hashtags, or
  // "#chinlone #club_wellington" as one.
  it('stores one hashtag per # typed in the plain tags field, and words without one as one', async () => {
    const app = createApp();
    const page = await request(app).get(`/members/${OWNER_SLUG}/media/upload`).set('Cookie', ownerCookie());
    expect(page.text).toMatch(/<input[^>]*name="tags"/);
    for (const [typed, want, file, shade] of [
      ['#chinlone #club_wellington', ['#chinlone', '#club_wellington'], 'split.jpg', 10],
      ['#chinlone#club_wellington', ['#chinlone', '#club_wellington'], 'joined.jpg', 20],
      ['footbag chin lone', ['#footbag_chin_lone'], 'words.jpg', 30],
    ] as const) {
      const jpeg = await makeJpeg({ r: shade, g: 80, b: 80 });
      const res = await request(app)
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'photo')
        .field('tags', typed)
        .attach('photoFiles', jpeg, file);
      expect(res.status, typed).toBe(303);
      const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
      try {
        const tags = (db.prepare(
          `SELECT mt.tag_display FROM media_tags mt WHERE mt.media_id = ? ORDER BY mt.tag_display`,
        ).all(mediaIdByFilename(file)) as Array<{ tag_display: string }>)
          .map((r) => r.tag_display).filter((t) => t !== `#by_${OWNER_SLUG}`);
        expect(tags, typed).toEqual([...want].sort());
      } finally { db.close(); }
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
      .attach('photoFiles', jpeg, 't.jpg');
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
      .attach('photoFiles', jpeg, 't.jpg');
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
      .attach('photoFiles', jpeg, 't.jpg');
    expect(res.status).toBe(422);
    expect(res.text).toContain('#by_');
  });

  it("user supplies #<other_slug> as freeform mention -> 303; does NOT pollute the other member's #by_ namespace", async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', `#${OTHER_SLUG}`)
      .attach('photoFiles', jpeg, 't.jpg');
    expect(res.status).toBe(303);
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

  it('user supplies #<unknown_slug> for an unsigned/historical person -> 303; tag stored as freeform', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', '#stebag_legacy')
      .attach('photoFiles', jpeg, 't.jpg');
    expect(res.status).toBe(303);
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
      .attach('photoFiles', notAnImage, 'fake.txt');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Only JPEG and PNG');
  });

  // A photo outside 1.91:1 landscape to 3:4 portrait would store a display copy
  // taller than the gallery is laid out for, so it is refused before anything
  // is stored or recorded.
  it('a photo wider than 1.91:1 or taller than 3:4 -> 422 naming the side, nothing stored or recorded', async () => {
    const app = createApp();
    for (const [width, height, message, name] of [
      [800, 400, PHOTO_TOO_WIDE_MESSAGE, 'shape-wide.jpg'],
      [450, 800, PHOTO_TOO_TALL_MESSAGE, 'shape-tall.jpg'],
    ] as const) {
      const photo = await sharp({
        create: { width, height, channels: 3, background: { r: 20, g: 90, b: 40 } },
      }).jpeg().toBuffer();
      const filesBefore = storedFileCount();
      const res = await request(app)
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'photo')
        .attach('photoFiles', photo, name);
      expect(res.status, name).toBe(422);
      expect(res.text, name).toContain(message.replace(/'/g, '&#x27;'));
      expect(ownerPhotoRows(name), name).toHaveLength(0);
      expect(storedFileCount(), name).toBe(filesBefore);
    }
  });

  it('no file submitted -> 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('caption', 'no file');
    expect(res.status).toBe(422);
    // The refusal is shown against the file field, and nothing is stored.
    expect(res.text).toMatch(/name="photoFiles"[^]*class="form-field-error"/);
    expect(ownerPhotoRows('')).toHaveLength(0);
  });

  it("posting to another member's upload route -> 404", async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', otherCookie())
      .field('mediaType', 'photo')
      .attach('photoFiles', jpeg, 't.jpg');
    expect(res.status).toBe(404);
  });

  // A different photo under a name the member already uploaded would silently
  // shadow the first, so it is refused with the name; the same photo again is a
  // repeat and is covered with the submitted-twice cases.
  it('uploading a different photo under an already-used file name -> 422 naming it, first kept', async () => {
    const app = createApp();
    const first = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .attach('photoFiles', await makeJpeg(), 'duplicate.jpg');
    expect(first.status).toBe(303);

    const second = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .attach('photoFiles', await makeJpeg({ r: 10, g: 200, b: 10 }), 'duplicate.jpg');
    expect(second.status).toBe(422);
    expect(second.text).toContain('already uploaded');
    expect(second.text).toContain('duplicate.jpg');
    expect(ownerPhotoRows('duplicate.jpg')).toHaveLength(1);
  });

  // Defect caught: re-sending the same file with a new caption or new tags is
  // reported as uploaded while the change is silently dropped, so the member
  // believes their caption or tags were saved.
  it('the same photo under the same name with a changed caption or tags -> 422, first kept unchanged', async () => {
    const app = createApp();
    const jpeg = await makeJpeg({ r: 30, g: 30, b: 200 });
    const upload = (caption: string, tags: string) => request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('caption', caption)
      .field('tags', tags)
      .attach('photoFiles', jpeg, 'recaptioned.jpg');

    expect((await upload('First caption', '#first')).status).toBe(303);
    const rows = ownerPhotoRows('recaptioned.jpg');
    expect(rows).toHaveLength(1);

    const changedCaption = await upload('A different caption', '#first');
    expect(changedCaption.status).toBe(422);
    expect(changedCaption.text).toContain('recaptioned.jpg');

    const changedTags = await upload('First caption', '#second');
    expect(changedTags.status).toBe(422);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const caption = (db.prepare('SELECT caption FROM media_items WHERE id = ?').get(rows[0]!.id) as { caption: string }).caption;
    db.close();
    expect(ownerPhotoRows('recaptioned.jpg')).toHaveLength(1);
    expect(caption).toBe('First caption');

    // The unchanged form is still the repeat it was.
    expect((await upload('First caption', '#first')).status).toBe(303);
  });

  it('a photo past the default 30 in the hour -> 429 with Retry-After', async () => {
    const app = createApp();
    const jpeg = await makeJpeg();
    for (let i = 0; i < 30; i++) {
      const ok = await request(app)
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'photo')
        .attach('photoFiles', jpeg, `r${i}.jpg`);
      expect(ok.status).toBe(303);
    }
    const blocked = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .attach('photoFiles', jpeg, 'r31.jpg');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('admin uploading more than the photo limit is not rate-limited', async () => {
    // M3: admins bypass the per-DD rate limit at the controller seam.
    const app = createApp();
    const jpeg = await makeJpeg();
    for (let i = 0; i < 32; i++) {
      const res = await request(app)
        .post(`/members/${ADMIN_SLUG}/media/upload`)
        .set('Cookie', adminCookie())
        .field('mediaType', 'photo')
        .attach('photoFiles', jpeg, `admin-r${i}.jpg`);
      expect(res.status).toBe(303);
    }
  });

  it('photo upload rate limit is tunable via system_config_current', async () => {
    // M3: lower the bucket to 2 via system_config; the 3rd upload should 429.
    const tuneDb = new BetterSqlite3(TEST_DB_PATH);
    insertSystemConfig(tuneDb, {
      config_key: 'photo_upload_rate_limit_per_hour',
      value_json: '2',
      created_at: '2026-05-16T00:00:00.000Z',
    });
    tuneDb.close();
    try {
      const app = createApp();
      const jpeg = await makeJpeg();
      for (let i = 0; i < 2; i++) {
        const ok = await request(app)
          .post(`/members/${OWNER_SLUG}/media/upload`)
          .set('Cookie', ownerCookie())
          .field('mediaType', 'photo')
          .attach('photoFiles', jpeg, `t${i}.jpg`);
        expect(ok.status).toBe(303);
      }
      const blocked = await request(app)
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'photo')
        .attach('photoFiles', jpeg, 't3.jpg');
      expect(blocked.status).toBe(429);
    } finally {
      // Restore the platform-epoch seeded default so later tests see 30/hr.
      const restoreDb = new BetterSqlite3(TEST_DB_PATH);
      insertSystemConfig(restoreDb, {
        config_key: 'photo_upload_rate_limit_per_hour',
        value_json: '30',
        created_at: '2026-05-16T00:00:01.000Z',
        reason_text: 'Test restore',
      });
      restoreDb.close();
    }
  });

  // An administrator lowers the size per photo below the 25 MB code maximum.
  // The member is then held to that number exactly: a photo of the limit's
  // size is shared, one byte more is refused naming the configured size, and
  // nothing is stored. An administrator is held only to the code maximum.
  describe('size per photo set by an administrator', () => {
    const ONE_MB = 1024 * 1024;

    // A real photo padded after its end-of-image marker, which a JPEG decoder
    // never reads, so the file is exactly the size a case needs.
    async function jpegOfExactly(bytes: number): Promise<Buffer> {
      const jpeg = await makeJpeg({ r: 30, g: 60, b: 90 });
      return Buffer.concat([jpeg, Buffer.alloc(bytes - jpeg.length)]);
    }

    function setPhotoMaxMb(value: string, createdAt: string): void {
      const db = new BetterSqlite3(TEST_DB_PATH);
      insertSystemConfig(db, { config_key: 'photo_upload_max_file_mb', value_json: value, created_at: createdAt });
      db.close();
    }

    beforeAll(() => setPhotoMaxMb('1', '2026-05-17T00:00:00.000Z'));
    afterAll(() => setPhotoMaxMb('25', '2026-05-17T00:00:01.000Z'));

    it('a member photo of exactly the configured size is shared', async () => {
      const res = await request(createApp())
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'photo')
        .attach('photoFiles', await jpegOfExactly(ONE_MB), 'size-at-limit.jpg');
      expect(res.status).toBe(303);
      expect(ownerPhotoRows('size-at-limit.jpg')).toHaveLength(1);
    });

    it('a member photo one byte over the configured size -> 422 naming that size, nothing stored', async () => {
      const { photoTooLargeMessage } = await import('../../src/services/curatorMediaService');
      const filesBefore = storedFileCount();
      const res = await request(createApp())
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'photo')
        .attach('photoFiles', await jpegOfExactly(ONE_MB + 1), 'size-over-limit.jpg');
      expect(res.status).toBe(422);
      expect(res.text).toContain(photoTooLargeMessage(ONE_MB));
      expect(ownerPhotoRows('size-over-limit.jpg')).toHaveLength(0);
      expect(storedFileCount()).toBe(filesBefore);
    });

    // The settings page refuses a value above 25, but a value stored some other
    // way must still never let a member past the code maximum.
    it('a stored size above the code maximum still refuses a member photo one byte over 25 MB', async () => {
      setPhotoMaxMb('100', '2026-05-17T00:00:00.500Z');
      try {
        const res = await request(createApp())
          .post(`/members/${OWNER_SLUG}/media/upload`)
          .set('Cookie', ownerCookie())
          .field('mediaType', 'photo')
          .attach('photoFiles', await jpegOfExactly(25 * ONE_MB + 1), 'size-over-code-max.jpg');
        expect(res.status).toBe(422);
        expect(ownerPhotoRows('size-over-code-max.jpg')).toHaveLength(0);
      } finally {
        setPhotoMaxMb('1', '2026-05-17T00:00:00.750Z');
      }
    });

    it('an administrator is not held to the configured size', async () => {
      const res = await request(createApp())
        .post(`/members/${ADMIN_SLUG}/media/upload`)
        .set('Cookie', adminCookie())
        .field('mediaType', 'photo')
        .attach('photoFiles', await jpegOfExactly(ONE_MB + 1), 'admin-size-over-member-limit.jpg');
      expect(res.status).toBe(303);
    });
  });

  // A double click or back-button re-post sends the same file under the same
  // name again. The repeat reports the first outcome and writes, stores and
  // counts nothing.
  it('uploading the same photo twice -> second answers like the first; one row, one audit row, nothing stored again, no slot spent', async () => {
    // The limit is tuned to two so a spent slot shows as a refusal. The rows
    // carry instants after the tuning case above, which must run first, so
    // these are the current ones while this case runs.
    const tuneDb = new BetterSqlite3(TEST_DB_PATH);
    insertSystemConfig(tuneDb, {
      config_key: 'photo_upload_rate_limit_per_hour',
      value_json: '2',
      created_at: '2026-05-17T00:00:00.000Z',
    });
    tuneDb.close();
    try {
      const app = createApp();
      const jpeg = await makeJpeg();
      const upload = (bytes: Buffer, name: string) => request(app)
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'photo')
        .attach('photoFiles', bytes, name);

      const first = await upload(jpeg, 'twice.jpg');
      expect(first.status).toBe(303);
      const storedAfterFirst = storedFileCount();

      const second = await upload(jpeg, 'twice.jpg');
      expect(second.status, 'a repeated upload is not an error').toBe(303);
      expect(second.headers.location).toBe(first.headers.location);
      expect(flashOf(first)).toContain('media_saved%3Ashare');
      expect(flashOf(second)).toBe(flashOf(first));

      const rows = ownerPhotoRows('twice.jpg');
      expect(rows).toHaveLength(1);
      expect(auditCountFor('media.member_uploaded', rows[0]!.id)).toBe(1);
      expect(storedFileCount()).toBe(storedAfterFirst);

      // One slot spent so far, so the second of two still lands; the next
      // proves the limit of two is the one in force.
      expect((await upload(jpeg, 'after-twice.jpg')).status).toBe(303);
      expect((await upload(jpeg, 'past-limit.jpg')).status).toBe(429);
    } finally {
      const restoreDb = new BetterSqlite3(TEST_DB_PATH);
      insertSystemConfig(restoreDb, {
        config_key: 'photo_upload_rate_limit_per_hour',
        value_json: '10',
        created_at: '2026-05-17T00:00:01.000Z',
        reason_text: 'Test restore',
      });
      restoreDb.close();
    }
  });
});

// ── POST /members/:memberKey/media/upload — video URL ──────────────────────

describe('POST /members/:memberKey/media/upload (Share Media: several photos, a named gallery)', () => {
  function galleryRow(ownerId: string, name: string): { id: string } | undefined {
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      return db.prepare('SELECT id FROM member_galleries WHERE owner_member_id = ? AND name = ?')
        .get(ownerId, name) as { id: string } | undefined;
    } finally { db.close(); }
  }

  function galleryCriteria(galleryId: string): string[] {
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      return (db.prepare(
        'SELECT t.tag_normalized FROM member_gallery_tags g JOIN tags t ON t.id = g.tag_id WHERE g.gallery_id = ?',
      ).all(galleryId) as Array<{ tag_normalized: string }>).map((r) => r.tag_normalized).sort();
    } finally { db.close(); }
  }

  function tagsOf(mediaId: string): string[] {
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      return (db.prepare('SELECT tag_display FROM media_tags WHERE media_id = ?').all(mediaId) as Array<{ tag_display: string }>)
        .map((r) => r.tag_display.toLowerCase());
    } finally { db.close(); }
  }

  function captionOf(mediaId: string): string | null {
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      return (db.prepare('SELECT caption FROM media_items WHERE id = ?').get(mediaId) as { caption: string | null }).caption;
    } finally { db.close(); }
  }

  // The token the Share page's script records for a gallery, from the same
  // helper the page's preview and the save both use.
  async function previewToken(name: string, tags: string): Promise<string> {
    const svc = await import('../../src/services/curatorMediaService');
    const p = svc.previewNewMemberGallery(OWNER_SLUG, name, svc.parseTagList(tags), () => false);
    if ('refusal' in p) throw new Error(p.refusal);
    return svc.newGalleryPreviewToken(p);
  }

  function setConfig(key: string, value: string, createdAt: string): void {
    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      insertSystemConfig(db, { config_key: key, value_json: value, effective_start_at: createdAt });
    } finally { db.close(); }
  }

  // Defect caught: several chosen photos are not each shared, a per-photo
  // caption lands on the wrong photo, or the shared hashtags miss one of them.
  it('shares several photos at once, each with its own caption and all with the hashtags', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', '#beach_day')
      .field('caption_for:0', 'first caption')
      .field('caption_for:1', 'second caption')
      .attach('photoFiles', await makeJpeg({ r: 1, g: 2, b: 3 }), 'multi-a.jpg')
      .attach('photoFiles', await makeJpeg({ r: 4, g: 5, b: 6 }), 'multi-b.jpg');
    expect(res.status).toBe(303);
    const a = mediaIdByFilename('multi-a.jpg');
    const b = mediaIdByFilename('multi-b.jpg');
    expect(captionOf(a)).toBe('first caption');
    expect(captionOf(b)).toBe('second caption');
    for (const id of [a, b]) expect(tagsOf(id)).toEqual(expect.arrayContaining(['#beach_day', `#by_${OWNER_SLUG}`]));
    expect(res.headers.location).toBe(`/media/gallery_${OWNER_SLUG}_personal_gallery/${a}`);
  });

  // Defect caught: a photo the reader drops for its size shifts every later
  // caption onto the wrong photo, because positions are counted over the
  // photos kept rather than over every photo chosen.
  it('keeps each caption on its own photo when an earlier photo is dropped for its size', async () => {
    // Dated after the size-per-photo block above restores its own setting, so
    // the latest-effective value is this one.
    setConfig('photo_upload_max_file_mb', '1', '2026-05-18T00:00:00.000Z');
    try {
      const big = Buffer.concat([await makeJpeg({ r: 7, g: 7, b: 7 }), Buffer.alloc(1100 * 1024)]);
      const res = await request(createApp())
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'photo')
        .field('caption_for:0', 'big caption')
        .field('caption_for:1', 'small caption')
        .attach('photoFiles', big, 'shift-big.jpg')
        .attach('photoFiles', await makeJpeg({ r: 8, g: 8, b: 8 }), 'shift-small.jpg');
      expect(res.status).toBe(303);
      expect(captionOf(mediaIdByFilename('shift-small.jpg'))).toBe('small caption');
      expect(ownerPhotoRows('shift-big.jpg')).toHaveLength(0);
    } finally {
      setConfig('photo_upload_max_file_mb', '25', '2026-05-18T00:00:01.000Z');
    }
  });

  // Defect caught: photos sent under one file name (a phone browser names
  // every photo image.jpg) all take the last photo's caption, because the
  // caption was looked up by the file's name.
  it('keeps the first photo\'s caption when two photos arrive under one file name', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('caption_for:0', 'caption of the first')
      .field('caption_for:1', 'caption of the second')
      .attach('photoFiles', await makeJpeg({ r: 31, g: 2, b: 2 }), 'same-name.jpg')
      .attach('photoFiles', await makeJpeg({ r: 2, g: 31, b: 2 }), 'same-name.jpg');
    expect(res.status).toBe(303);
    expect(captionOf(mediaIdByFilename('same-name.jpg'))).toBe('caption of the first');
  });

  // Defect caught: one bad file blocks the good ones, or is dropped without
  // the member being told which file was not shared.
  it('shares the good photos and names the bad file in a separate refusal', async () => {
    const agent = request.agent(createApp());
    const res = await agent
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .attach('photoFiles', await makeJpeg(), 'good-one.jpg')
      .attach('photoFiles', Buffer.from('not an image at all'), 'beach.gif');
    expect(res.status).toBe(303);
    expect(ownerPhotoRows('good-one.jpg')).toHaveLength(1);
    expect(ownerPhotoRows('beach.gif')).toHaveLength(0);
    const landed = await agent.get(res.headers.location).set('Cookie', ownerCookie());
    expect(landed.text).toContain('class="form-success-banner"');
    expect(landed.text).toMatch(/class="form-error-banner"[^]*beach\.gif/);
  });

  // Defect caught: the configured photos-per-submit setting limits nothing,
  // or a change to it does not reach the next submit.
  it('refuses more photos than the configured count, writing nothing, and follows a changed setting', async () => {
    setConfig('photo_upload_max_files_per_submit', '1', '2026-02-01T00:00:00.000Z');
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .attach('photoFiles', await makeJpeg(), 'count-a.jpg')
      .attach('photoFiles', await makeJpeg({ r: 9, g: 9, b: 9 }), 'count-b.jpg');
    expect(res.status).toBe(422);
    expect(ownerPhotoRows('count-a.jpg')).toHaveLength(0);
    setConfig('photo_upload_max_files_per_submit', '4', '2026-02-01T00:00:01.000Z');
    const ok = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .attach('photoFiles', await makeJpeg(), 'count-a.jpg')
      .attach('photoFiles', await makeJpeg({ r: 9, g: 9, b: 9 }), 'count-b.jpg');
    expect(ok.status).toBe(303);
  });

  // Defect caught: an administrator's submit skips the photos-per-submit
  // setting, so one administrator upload can make the web container hold more
  // than the setting allows and an out-of-memory restart drops every request.
  it('holds an administrator to the configured photos-per-submit count', async () => {
    setConfig('photo_upload_max_files_per_submit', '1', '2026-02-01T00:00:02.000Z');
    try {
      const res = await request(createApp())
        .post(`/members/${ADMIN_SLUG}/media/upload`)
        .set('Cookie', adminCookie())
        .field('mediaType', 'photo')
        .attach('photoFiles', await makeJpeg(), 'admin-count-a.jpg')
        .attach('photoFiles', await makeJpeg({ r: 9, g: 9, b: 9 }), 'admin-count-b.jpg');
      expect(res.status).toBe(422);
    } finally {
      setConfig('photo_upload_max_files_per_submit', '4', '2026-02-01T00:00:03.000Z');
    }
  });

  // Defect caught: a submit far over the total is read into memory whole before
  // the total is checked, so "Total per submit" bounds nothing the web
  // container holds.
  it('refuses a submit whose declared size passes the configured total before reading it, writing nothing', async () => {
    // Dated before the total test below, whose own setting must stay the latest.
    setConfig('photo_upload_max_submit_mb', '1', '2026-02-01T12:00:00.000Z');
    try {
      const big = Buffer.concat([await makeJpeg(), Buffer.alloc(3 * 1024 * 1024)]);
      const res = await request(createApp())
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'photo')
        .attach('photoFiles', big, 'declared-too-big.jpg');
      expect(res.status).toBe(422);
      expect(ownerPhotoRows('declared-too-big.jpg')).toHaveLength(0);
    } finally {
      setConfig('photo_upload_max_submit_mb', '50', '2026-02-01T12:00:01.000Z');
    }
  });

  // Defect caught: the total-per-submit setting limits nothing, so one
  // submit can make the web container hold any amount of photos.
  it('refuses photos that together pass the configured total, writing nothing', async () => {
    setConfig('photo_upload_max_submit_mb', '1', '2026-02-02T00:00:00.000Z');
    try {
      const big = Buffer.concat([await makeJpeg(), Buffer.alloc(600 * 1024)]);
      const res = await request(createApp())
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'photo')
        .attach('photoFiles', big, 'total-a.jpg')
        .attach('photoFiles', big, 'total-b.jpg');
      expect(res.status).toBe(422);
      expect(ownerPhotoRows('total-a.jpg')).toHaveLength(0);
      expect(ownerPhotoRows('total-b.jpg')).toHaveLength(0);
    } finally {
      setConfig('photo_upload_max_submit_mb', '50', '2026-02-02T00:00:01.000Z');
    }
  });

  // Defect caught: naming hashtags as a gallery saves other hashtags than the
  // ones typed, the shared photo does not carry them, or the member lands
  // outside the new gallery.
  it('names the typed hashtags as a gallery that shows the photo shared with them', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', '#event_2026_worlds')
      .field('galleryName', 'Worlds 2026')
      .field('galleryPreview', await previewToken('Worlds 2026', '#event_2026_worlds'))
      .attach('photoFiles', await makeJpeg(), 'worlds.jpg');
    expect(res.status).toBe(303);
    const gallery = galleryRow(OWNER_ID, 'Worlds 2026')!;
    expect(gallery.id).toBe(`gallery_${OWNER_SLUG}_worlds_2026`);
    expect(galleryCriteria(gallery.id)).toEqual([`#by_${OWNER_SLUG}`, '#event_2026_worlds'].sort());
    const mediaId = mediaIdByFilename('worlds.jpg');
    expect(tagsOf(mediaId)).toContain('#event_2026_worlds');
    expect(res.headers.location).toBe(`/media/${gallery.id}/${mediaId}`);
    expect(auditCountFor('media.member_gallery_created', gallery.id)).toBe(1);
    expect(auditCountFor('media.member_uploaded', mediaId)).toBe(1);
  });

  // Defect caught: with no hashtags typed the gallery is saved with only the
  // owner's tag, so it is a copy of the Personal Gallery, or the photo misses
  // the hashtag made from the name and does not show in it.
  it('uses the hashtag made from the name when no hashtag is typed', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('galleryName', 'Beach Trip')
      .field('galleryPreview', await previewToken('Beach Trip', ''))
      .attach('photoFiles', await makeJpeg(), 'beach-trip.jpg');
    expect(res.status).toBe(303);
    const gallery = galleryRow(OWNER_ID, 'Beach Trip')!;
    expect(galleryCriteria(gallery.id)).toEqual([`#by_${OWNER_SLUG}`, '#beach_trip'].sort());
    expect(tagsOf(mediaIdByFilename('beach-trip.jpg'))).toContain('#beach_trip');
  });

  // Defect caught: a gallery is saved before the member has seen its address
  // and hashtags, or the form shown to confirm cannot be sent back as it is.
  it('shows a new gallery before saving it when no preview was recorded, and saves it from the form as shown', async () => {
    const first = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', '#confirm_me')
      .field('galleryName', 'Confirm Round');
    expect(first.status).toBe(200);
    expect(first.text).toContain('class="form-notice"');
    expect(first.text).toContain(`/media/gallery_${OWNER_SLUG}_confirm_round`);
    expect(galleryRow(OWNER_ID, 'Confirm Round')).toBeUndefined();
    const token = first.text.match(/name="galleryPreview" value="([^"]*)"/)?.[1]?.replace(/&#x23;/g, '#') ?? '';
    expect(token).not.toBe('');

    const second = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', '#confirm_me')
      .field('galleryName', 'Confirm Round')
      .field('galleryPreview', token);
    expect(second.status).toBe(303);
    const gallery = galleryRow(OWNER_ID, 'Confirm Round')!;
    expect(second.headers.location).toBe(`/media/${gallery.id}`);
  });

  // Defect caught: a gallery saved with nothing shared drops the note that a
  // typed hashtag was stored in its folded form, so the member never learns
  // the gallery carries another spelling than the one they typed.
  it('names a typed hashtag stored folded when only a gallery is saved', async () => {
    const agent = request.agent(createApp());
    const res = await agent
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', '#Zürich-Trip')
      .field('galleryName', 'Folded Only')
      .field('galleryPreview', await previewToken('Folded Only', '#Zürich-Trip'));
    expect(res.status).toBe(303);
    const landed = await agent.get(res.headers.location).set('Cookie', ownerCookie());
    const banner = /class="form-success-banner"[\s\S]*?<\/div>/.exec(landed.text)?.[0] ?? '';
    expect(banner).toContain('#Zürich-Trip');
    expect(banner).toContain('#Zurich_Trip');
  });

  // Defect caught: naming a gallery the member already has, edited since,
  // spends a gallery-write slot, so at the hourly limit the whole share is
  // refused although nothing needed creating.
  it('shares into a gallery the member already has, edited since, without spending a gallery-write slot', async () => {
    const share = async (photo: string) => request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', '#held_already')
      .field('galleryName', 'Held Already')
      .field('galleryPreview', await previewToken('Held Already', '#held_already'))
      .attach('photoFiles', await makeJpeg({ r: photo.length * 9, g: 3, b: 3 }), photo);
    expect((await share('held-1.jpg')).status).toBe(303);
    const held = galleryRow(OWNER_ID, 'Held Already')!;
    expect((await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/${held.id}/edit`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: 'Held Already', description: 'edited since', sortOrder: 'upload_desc', criteriaTags: '#held_already', excludeTags: '' })).status).toBe(303);
    // The create and the edit above spent two slots; at a limit of two, a
    // share that spent another would be refused.
    setConfig('gallery_write_rate_limit_per_hour', '2', '2026-02-03T00:00:00.000Z');
    try {
      const again = await share('held-two.jpg');
      expect(again.status).toBe(303);
      expect(ownerPhotoRows('held-two.jpg')).toHaveLength(1);
    } finally {
      setConfig('gallery_write_rate_limit_per_hour', '30', '2026-02-03T00:00:01.000Z');
    }
  });

  // Defect caught: sharing a new photo toward a gallery the member already
  // has, unchanged, reports the gallery as just saved, a success the member
  // did not cause.
  it('reports a gallery the member already had as held, not as saved, when a new photo is shared toward it', async () => {
    const share = async (agent: ReturnType<typeof request.agent>, photo: string, r: number) => agent
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', '#held_unchanged')
      .field('galleryName', 'Held Unchanged')
      .field('galleryPreview', await previewToken('Held Unchanged', '#held_unchanged'))
      .attach('photoFiles', await makeJpeg({ r, g: 5, b: 5 }), photo);
    const agent = request.agent(createApp());
    const first = await share(agent, 'held-unchanged-1.jpg', 40);
    expect(first.status).toBe(303);
    const gallery = galleryRow(OWNER_ID, 'Held Unchanged')!;
    const firstLanded = await agent.get(first.headers.location).set('Cookie', ownerCookie());
    expect(firstLanded.text).toMatch(new RegExp(`class="form-success-banner"[^]*?/media/${gallery.id}[^/]`));

    const second = await share(agent, 'held-unchanged-2.jpg', 90);
    expect(second.status).toBe(303);
    expect(ownerPhotoRows('held-unchanged-2.jpg')).toHaveLength(1);
    const landed = await agent.get(second.headers.location).set('Cookie', ownerCookie());
    const notice = /class="form-notice"[\s\S]*?<\/div>/.exec(landed.text)?.[0] ?? '';
    expect(notice).toContain('Held Unchanged');
    const banner = /class="form-success-banner"[\s\S]*?<\/div>/.exec(landed.text)?.[0] ?? '';
    expect(banner).not.toContain(`/media/${gallery.id}`);
    expect(auditCountFor('media.member_gallery_created', gallery.id)).toBe(1);
  });

  // Defect caught: the member's own share sent twice reports the gallery as
  // merely held, though the first submit is the one that saved it.
  it('reports the first submit\'s saved gallery when the member\'s own share is sent twice', async () => {
    const agent = request.agent(createApp());
    const send = async () => agent
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', '#sent_twice')
      .field('galleryName', 'Sent Twice')
      .field('galleryPreview', await previewToken('Sent Twice', '#sent_twice'))
      .attach('photoFiles', await makeJpeg({ r: 66, g: 6, b: 6 }), 'sent-twice.jpg');
    expect((await send()).status).toBe(303);
    const again = await send();
    expect(again.status).toBe(303);
    const gallery = galleryRow(OWNER_ID, 'Sent Twice')!;
    const landed = await agent.get(again.headers.location).set('Cookie', ownerCookie());
    const banner = /class="form-success-banner"[\s\S]*?<\/div>/.exec(landed.text)?.[0] ?? '';
    expect(banner).toContain(`/media/${gallery.id}`);
    expect(landed.text).not.toContain('class="form-notice"');
    expect(ownerPhotoRows('sent-twice.jpg')).toHaveLength(1);
  });

  // Defect caught: when the hourly photo limit stops the first good photo and
  // no gallery was named, the refusal drops the photos already refused for
  // their size and the reminder to choose the photos again.
  it('names the size refusals and asks for the photos again when the hourly limit stops the first good photo', async () => {
    const svc = await import('../../src/services/curatorMediaService');
    setConfig('photo_upload_max_file_mb', '1', '2026-05-19T00:00:00.000Z');
    // Dated before the later hourly-limit case's own setting, so that one's
    // value is still the latest when it runs.
    setConfig('photo_upload_rate_limit_per_hour', '1', '2026-06-02T00:00:00.000Z');
    try {
      const spent = await request(createApp())
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'photo')
        .attach('photoFiles', await makeJpeg({ r: 12, g: 13, b: 14 }), 'spends-the-slot.jpg');
      expect(spent.status).toBe(303);
      const big = Buffer.concat([await makeJpeg({ r: 15, g: 15, b: 15 }), Buffer.alloc(1100 * 1024)]);
      const res = await request(createApp())
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'photo')
        .attach('photoFiles', big, 'limit-big.jpg')
        .attach('photoFiles', await makeJpeg({ r: 16, g: 16, b: 16 }), 'limit-good.jpg');
      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
      const banner = /class="form-error-banner"[\s\S]*?<\/div>/.exec(res.text)?.[0] ?? '';
      expect(banner).toContain(svc.photoTooLargeMessage(1024 * 1024).replace(/\.$/, ''));
      expect(banner).toContain('limit-good.jpg');
      expect(banner).toContain(svc.SHARE_CHOOSE_AGAIN);
      expect(ownerPhotoRows('limit-good.jpg')).toHaveLength(0);
    } finally {
      setConfig('photo_upload_rate_limit_per_hour', '30', '2026-06-02T00:00:01.000Z');
      setConfig('photo_upload_max_file_mb', '25', '2026-05-19T00:00:01.000Z');
    }
  });

  // Defect caught: a second gallery under a name the member already uses is
  // saved, or the first one's hashtags are rewritten.
  it('refuses a gallery named like one the member has, with different hashtags', async () => {
    const make = async (tags: string) => request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', tags)
      .field('galleryName', 'Twin Name')
      .field('galleryPreview', await previewToken('Twin Name', tags));
    expect((await make('#first_set')).status).toBe(303);
    const refused = await make('#second_set');
    expect(refused.status).toBe(422);
    const gallery = galleryRow(OWNER_ID, 'Twin Name')!;
    expect(galleryCriteria(gallery.id)).toEqual([`#by_${OWNER_SLUG}`, '#first_set'].sort());
  });

  // Defect caught: a name with letters that have no a to z form is saved under
  // a random or shortened address.
  it('refuses a gallery name whose letters have no a to z form, writing nothing', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', '#anything')
      .field('galleryName', '東京');
    expect(res.status).toBe(422);
    expect(galleryRow(OWNER_ID, '東京')).toBeUndefined();
  });

  // Defect caught: the Share link on one of the member's galleries opens the
  // form without its hashtags, or another member's gallery fills them in.
  it('fills the hashtags from the member\'s own gallery named in ?gallery=, and from no one else\'s', async () => {
    await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', '#prefill_me')
      .field('galleryName', 'Prefill Source')
      .field('galleryPreview', await previewToken('Prefill Source', '#prefill_me'));
    const own = galleryRow(OWNER_ID, 'Prefill Source')!;
    const page = await request(createApp())
      .get(`/members/${OWNER_SLUG}/media/upload?gallery=${own.id}`)
      .set('Cookie', ownerCookie());
    expect(page.text).toMatch(/name="tags" value="[^"]*prefill_me/);
    const foreign = await request(createApp())
      .get(`/members/${OTHER_SLUG}/media/upload?gallery=${own.id}`)
      .set('Cookie', otherCookie());
    expect(foreign.text).not.toContain('prefill_me');
  });

  // Defect caught: the item's edit control is offered to someone who is not
  // its owner, or withheld from the owner.
  it('offers Edit This Item to the owner only', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .attach('photoFiles', await makeJpeg(), 'edit-control.jpg');
    const mediaId = mediaIdByFilename('edit-control.jpg');
    const editHref = `href="/members/${OWNER_SLUG}/media/${mediaId}/edit"`;
    const asOwner = await request(createApp()).get(res.headers.location).set('Cookie', ownerCookie());
    expect(asOwner.text).toContain(editHref);
    const asOther = await request(createApp()).get(res.headers.location).set('Cookie', otherCookie());
    expect(asOther.status).toBe(200);
    expect(asOther.text).not.toContain('/media/' + mediaId + '/edit');
    const asVisitor = await request(createApp()).get(res.headers.location);
    expect(asVisitor.status).toBe(200);
    expect(asVisitor.text).not.toContain('/media/' + mediaId + '/edit');
  });

  // Defect caught: the "shows in" line lists a gallery the item does not show
  // in (one that excludes a hashtag it carries), misses one it does, or names
  // the Personal Gallery, which every share lands in and which "your
  // galleries" leaves out everywhere else.
  it('names the owner\'s named galleries the shared photo shows in, leaving out one that excludes it and the Personal Gallery', async () => {
    const make = async (name: string, tags: string) => request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', tags)
      .field('galleryName', name)
      .field('galleryPreview', await previewToken(name, tags));
    expect((await make('Shows Here', '#shows_in')).status).toBe(303);
    expect((await make('Excludes It Too', '#shows_in_x')).status).toBe(303);
    const excluder = galleryRow(OWNER_ID, 'Excludes It Too')!;
    expect((await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/${excluder.id}/edit`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: 'Excludes It Too', description: '', sortOrder: 'upload_desc', criteriaTags: '', excludeTags: '#shows_in' })).status).toBe(303);

    const agent = request.agent(createApp());
    const res = await agent
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', '#shows_in')
      .attach('photoFiles', await makeJpeg(), 'shows-in.jpg');
    const landed = await agent.get(res.headers.location).set('Cookie', ownerCookie());
    const banner = /class="form-success-banner"[\s\S]*?<\/div>/.exec(landed.text)?.[0] ?? '';
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const personal = db.prepare('SELECT name FROM member_galleries WHERE owner_member_id = ? AND is_default = 1')
      .get(OWNER_ID) as { name: string };
    db.close();
    expect(banner).toContain('Shows Here');
    expect(banner).not.toContain(personal.name);
    expect(banner).not.toContain('Excludes It Too');
  });

  // Defect caught: a hand-posted gallery id still drops a photo "into" a
  // gallery, putting another member's hashtags on it.
  it('ignores a posted gallery id', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('galleryId', 'gallery_mu_other_anything')
      .attach('photoFiles', await makeJpeg(), 'stray-id.jpg');
    expect(res.status).toBe(303);
    expect(tagsOf(mediaIdByFilename('stray-id.jpg'))).toEqual([`#by_${OWNER_SLUG}`]);
  });

  // Defect caught: reaching the hourly limit partway loses the photos already
  // shared, or the rest are dropped without being named.
  it('keeps the photos shared before the hourly limit and names the rest', async () => {
    setConfig('photo_upload_rate_limit_per_hour', '1', '2026-06-03T00:00:00.000Z');
    try {
      const agent = request.agent(createApp());
      const res = await agent
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'photo')
        .attach('photoFiles', await makeJpeg(), 'within-limit.jpg')
        .attach('photoFiles', await makeJpeg({ r: 7, g: 7, b: 7 }), 'past-limit.jpg');
      expect(res.status).toBe(303);
      expect(ownerPhotoRows('within-limit.jpg')).toHaveLength(1);
      expect(ownerPhotoRows('past-limit.jpg')).toHaveLength(0);
      const landed = await agent.get(res.headers.location).set('Cookie', ownerCookie());
      expect(landed.text).toMatch(/class="form-error-banner"[^]*past-limit\.jpg/);
    } finally {
      setConfig('photo_upload_rate_limit_per_hour', '30', '2026-06-03T00:00:01.000Z');
    }
  });
});

describe('POST /members/:memberKey/media/upload (video)', () => {
  it('valid YouTube URL -> 303 + media row + #<slug> tag', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'video')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      .field('videoCaption', 'classic')
      .field('tags', '#tutorial');
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(new RegExp(`^/media/gallery_${OWNER_SLUG}_personal_gallery/media_[0-9a-f]+$`));

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
      // The stored URL is the canonical platform URL, not the raw string.
      expect(row?.video_url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    } finally {
      db.close();
    }
  });

  it("video_platform='s3' is rejected at the member-upload boundary -> 422", async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'video')
      .field('videoPlatform', 's3')
      .field('videoUrl', 'https://example.com/clip.mp4')
      .field('caption', 's3 attempt')
      .field('tags', '');
    expect(res.status).toBe(422);
  });

  it('stores the canonical platform URL, never the member-typed string: a foreign-host wrapper URL carrying a valid id must not become the rendered href', async () => {
    const app = createApp();
    // The verifier stub accepts this (worst case: the platform oEmbed lets a
    // wrapper through); the persisted URL must still be canonical.
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'video')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://evil.example/redirect?u=https://www.youtube.com/watch?v=wRaPPeRiD11')
      .field('videoCaption', 'wrapped')
      .field('tags', '');
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const row = db.prepare(`
        SELECT video_id, video_url
        FROM media_items
        WHERE uploader_member_id = ? AND media_type = 'video' AND caption = 'wrapped'
      `).get(OWNER_ID) as { video_id: string; video_url: string } | undefined;
      expect(row?.video_id).toBe('wRaPPeRiD11');
      expect(row?.video_url).toBe('https://www.youtube.com/watch?v=wRaPPeRiD11');
      expect(row?.video_url).not.toContain('evil.example');
    } finally {
      db.close();
    }
  });

  it('Vimeo URL with thumbnail body -> 303 + thumbnail_url stored', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'video')
      .field('videoPlatform', 'vimeo')
      .field('videoUrl', 'https://vimeo.com/123456789')
      .field('tags', '');
    expect(res.status).toBe(303);
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

  // Defect caught: the platform is no longer chosen, so a link it cannot be
  // read from must be refused rather than stored under a guessed platform.
  it('a link that is neither YouTube nor Vimeo -> 422, nothing written, verifier not asked', async () => {
    const before = videoVerifierCalls;
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'video')
      .field('videoUrl', 'https://example.com/not-a-platform');
    expect(res.status).toBe(422);
    expect(videoVerifierCalls).toBe(before);
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const n = db.prepare("SELECT COUNT(*) AS n FROM media_items WHERE uploader_member_id = ? AND media_type = 'video'")
        .get(OWNER_ID) as { n: number };
      expect(n.n).toBe(0);
    } finally { db.close(); }
  });

  // Defect caught: the platform is taken from anything but the link itself.
  it('takes the platform from the link: a Vimeo link is stored as Vimeo', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'video')
      .field('videoUrl', 'https://vimeo.com/987654321');
    expect(res.status).toBe(303);
    expect(ownerVideoRows('987654321')).toHaveLength(1);
  });

  it('6th video submission in the hour -> 429 with Retry-After', async () => {
    // M3: parity regression at the configured default of 5/hr.
    const app = createApp();
    for (let i = 0; i < 5; i++) {
      const ok = await request(app)
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'video')
        .field('videoPlatform', 'youtube')
        .field('videoUrl', `https://www.youtube.com/watch?v=videovid${i}xx`);
      expect(ok.status).toBe(303);
    }
    const blocked = await request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'video')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=videovid6xx');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('admin submitting more than the video limit is not rate-limited', async () => {
    // M3: admins bypass the per-DD rate limit at the controller seam.
    const app = createApp();
    for (let i = 0; i < 8; i++) {
      const res = await request(app)
        .post(`/members/${ADMIN_SLUG}/media/upload`)
        .set('Cookie', adminCookie())
        .field('mediaType', 'video')
        .field('videoPlatform', 'youtube')
        .field('videoUrl', `https://www.youtube.com/watch?v=adminvid${i}xx`);
      expect(res.status).toBe(303);
    }
  });

  it('video submission rate limit is tunable via system_config_current', async () => {
    // M3: lower the bucket to 2 via system_config; the 3rd submission should 429.
    const tuneDb = new BetterSqlite3(TEST_DB_PATH);
    insertSystemConfig(tuneDb, {
      config_key: 'video_submission_rate_limit_per_hour',
      value_json: '2',
      created_at: '2026-05-16T00:00:00.000Z',
    });
    tuneDb.close();
    try {
      const app = createApp();
      for (let i = 0; i < 2; i++) {
        const ok = await request(app)
          .post(`/members/${OWNER_SLUG}/media/upload`)
          .set('Cookie', ownerCookie())
          .field('mediaType', 'video')
          .field('videoPlatform', 'youtube')
          .field('videoUrl', `https://www.youtube.com/watch?v=tunevidd${i}xx`);
        expect(ok.status).toBe(303);
      }
      const blocked = await request(app)
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'video')
        .field('videoPlatform', 'youtube')
        .field('videoUrl', 'https://www.youtube.com/watch?v=tunevidd3xx');
      expect(blocked.status).toBe(429);
    } finally {
      const restoreDb = new BetterSqlite3(TEST_DB_PATH);
      insertSystemConfig(restoreDb, {
        config_key: 'video_submission_rate_limit_per_hour',
        value_json: '5',
        created_at: '2026-05-16T00:00:01.000Z',
        reason_text: 'Test restore',
      });
      restoreDb.close();
    }
  });

  // The same video URL submitted twice is the item the first submit made: the
  // repeat reports the first outcome, writes nothing, does not ask the
  // platform again and counts no submission.
  it('submitting the same video twice -> second answers like the first; one row, one audit row, verifier asked once, no slot spent', async () => {
    // The limit is tuned to two so a spent slot shows as a refusal. The rows
    // carry instants after the tuning case above, which must run first, so
    // these are the current ones while this case runs.
    const tuneDb = new BetterSqlite3(TEST_DB_PATH);
    insertSystemConfig(tuneDb, {
      config_key: 'video_submission_rate_limit_per_hour',
      value_json: '2',
      created_at: '2026-05-17T00:00:00.000Z',
    });
    tuneDb.close();
    try {
      const app = createApp();
      const submit = (videoId: string) => request(app)
        .post(`/members/${OWNER_SLUG}/media/upload`)
        .set('Cookie', ownerCookie())
        .field('mediaType', 'video')
        .field('videoPlatform', 'youtube')
        .field('videoUrl', `https://www.youtube.com/watch?v=${videoId}`);

      const callsBefore = videoVerifierCalls;
      const first = await submit('twicevidxxx');
      expect(first.status).toBe(303);
      const second = await submit('twicevidxxx');
      expect(second.status, 'a repeated submission is not an error').toBe(303);
      expect(second.headers.location).toBe(first.headers.location);
      expect(flashOf(first)).toContain('media_saved%3Ashare');
      expect(flashOf(second)).toBe(flashOf(first));
      expect(videoVerifierCalls - callsBefore).toBe(1);

      const rows = ownerVideoRows('twicevidxxx');
      expect(rows).toHaveLength(1);
      expect(auditCountFor('media.member_uploaded', rows[0]!.id)).toBe(1);

      // One slot spent so far, so the second of two still lands; the next
      // proves the limit of two is the one in force.
      expect((await submit('aftertwicex')).status).toBe(303);
      expect((await submit('pastlimitxx')).status).toBe(429);
    } finally {
      const restoreDb = new BetterSqlite3(TEST_DB_PATH);
      insertSystemConfig(restoreDb, {
        config_key: 'video_submission_rate_limit_per_hour',
        value_json: '5',
        created_at: '2026-05-17T00:00:01.000Z',
        reason_text: 'Test restore',
      });
      restoreDb.close();
    }
  });
});

// ── The same submission twice, overlapping, or carrying a link ─────────────

describe('a member upload or gallery create submitted twice', () => {
  async function service() {
    const mod = await import('../../src/services/curatorMediaService');
    return mod.getDefaultCuratorMediaService();
  }

  function ownerGalleryRows(name: string): Array<{ id: string }> {
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      return db.prepare(
        'SELECT id FROM member_galleries WHERE owner_member_id = ? AND name = ?',
      ).all(OWNER_ID, name) as Array<{ id: string }>;
    } finally { db.close(); }
  }

  // Defect caught: recognising a repeat that carries a link runs the full
  // outbound link check (lookup, safe-browsing and reachability) before any
  // throttle, so a repeat costs a network round trip, and fails outright
  // whenever that check does.
  it('a repeat carrying a link is recognised without checking the link again', async () => {
    const app = createApp();
    const submit = () => request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'video')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=linkrepeatx')
      // Written as a member types it; stored in its normalised form.
      .field('externalUrl', 'https://Example.org/clip');

    const first = await submit();
    expect(first.status).toBe(303);
    const sb = await import('../../src/adapters/safeBrowsingAdapter');
    const stub = sb.getSafeBrowsingAdapter() as ReturnType<typeof sb.createStubSafeBrowsingAdapter>;
    stub.failNext(new Error('safe-browsing unreachable'));
    try {
      const second = await submit();
      expect(second.status).toBe(303);
      expect(flashOf(second)).toBe(flashOf(first));
      expect(ownerVideoRows('linkrepeatx')).toHaveLength(1);
    } finally {
      sb.resetSafeBrowsingAdapterForTests();
    }
  });

  // Defect caught: the two submits of a double click both look for the first
  // one's item before either has written it, so a video is added twice, a photo
  // is refused as "already uploaded", and a gallery as "already exists".
  it('overlapping double submits of a video, a photo and a gallery each end at one item', async () => {
    const svc = await service();
    const video = { memberId: OWNER_ID, slug: OWNER_SLUG, videoPlatform: 'youtube' as const,
      videoUrl: 'https://www.youtube.com/watch?v=overlapvidx', caption: null, tags: [] };
    const [v1, v2] = await Promise.all([svc.submitVideoForMember(video), svc.submitVideoForMember(video)]);
    expect(v2.mediaId).toBe(v1.mediaId);
    expect(ownerVideoRows('overlapvidx')).toHaveLength(1);

    const photo = { memberId: OWNER_ID, slug: OWNER_SLUG, photoBuffer: await makeJpeg(),
      sourceFilename: 'overlap.jpg', caption: null, tags: [] };
    const [p1, p2] = await Promise.all([svc.uploadPhotoForMember(photo), svc.uploadPhotoForMember(photo)]);
    expect(p2.mediaId).toBe(p1.mediaId);
    expect(ownerPhotoRows('overlap.jpg')).toHaveLength(1);

    const gallery = { actorMemberId: OWNER_ID, actorIsAdmin: false, ownerMemberId: OWNER_ID, ownerSlug: OWNER_SLUG,
      updates: { name: 'Overlap Gallery', description: '', sortOrder: 'upload_desc', criteriaTags: ['#overlap'], excludeTags: [] } };
    const [g1, g2] = await Promise.all([svc.createGallery(gallery), svc.createGallery(gallery)]);
    expect(g2.id).toBe(g1.id);
    expect(ownerGalleryRows('Overlap Gallery')).toHaveLength(1);
  });
});

// ── A named gallery cannot carry a forged uploader hashtag ─────────────────

describe('a gallery named on the Share Media form', () => {
  // Defect caught: a typed `#by_` hashtag reaches the gallery's criteria, so a
  // member's gallery scopes to another member's uploads.
  it('refuses a typed #by_ hashtag and creates no gallery', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('tags', `#by_${OTHER_SLUG} #footbag`)
      .field('galleryName', 'Forged Attribution');
    expect(res.status).toBe(422);
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const gallery = db.prepare(
        'SELECT id FROM member_galleries WHERE owner_member_id = ? AND name = ?',
      ).get(OWNER_ID, 'Forged Attribution') as { id: string } | undefined;
      expect(gallery).toBeUndefined();
    } finally {
      db.close();
    }
  });
});

// ── Caption cleaning on upload ─────────────────────────────────────────────

describe('a member upload caption is cleaned before it is stored', () => {
  // Markup, a C1 control character, CRLF paragraph breaks and a decomposed
  // accent, as a browser or a pasted document can send them.
  const DIRTY_CAPTION = 'Café <b>trick</b>\u0085 line\r\n\r\nSecond para';
  const CLEAN_CAPTION = 'Café trick line\n\nSecond para';

  function storedCaption(where: string, value: string): string | null {
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const row = db.prepare(
        `SELECT caption FROM media_items WHERE uploader_member_id = ? AND ${where} = ?`,
      ).get(OWNER_ID, value) as { caption: string | null } | undefined;
      return row?.caption ?? null;
    } finally { db.close(); }
  }

  // Defect caught: a photo caption is stored with live markup, a control
  // character, CRLF line ends or a decomposed accent, so every later render and
  // comparison depends on escaping alone.
  it('a photo upload stores the cleaned caption', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'photo')
      .field('caption', DIRTY_CAPTION)
      .attach('photoFiles', await makeJpeg(), 'clean-caption.jpg');
    expect(res.status).toBe(303);
    expect(storedCaption('source_filename', 'clean-caption.jpg')).toBe(CLEAN_CAPTION);
  });

  // Defect caught: a video submission skips the cleaning the photo path runs.
  it('a video submission stores the cleaned caption', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'video')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=cleancapvid')
      .field('videoCaption', DIRTY_CAPTION);
    expect(res.status).toBe(303);
    expect(storedCaption('video_id', 'cleancapvid')).toBe(CLEAN_CAPTION);
  });

  // Defect caught: the early repeat check compares the raw resubmitted caption
  // with the cleaned one the first submit stored, so the same submission sent
  // twice misses it and asks the video platform again before the write-time
  // check catches the repeat.
  it('the same video with the same dirty caption submitted twice asks the platform once', async () => {
    const app = createApp();
    const submit = () => request(app)
      .post(`/members/${OWNER_SLUG}/media/upload`)
      .set('Cookie', ownerCookie())
      .field('mediaType', 'video')
      .field('videoPlatform', 'youtube')
      .field('videoUrl', 'https://www.youtube.com/watch?v=cleantwicev')
      .field('videoCaption', DIRTY_CAPTION);
    expect((await submit()).status).toBe(303);
    const callsAfterFirst = videoVerifierCalls;
    const second = await submit();
    expect(second.status, 'a repeated submission is not an error').toBe(303);
    expect(videoVerifierCalls).toBe(callsAfterFirst);
    expect(ownerVideoRows('cleantwicev')).toHaveLength(1);
  });
});
