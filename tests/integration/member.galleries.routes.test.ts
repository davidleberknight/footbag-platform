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
 * CSRF posture: SameSite=Lax session cookie + POST-only state changes,
 * verified centrally by tests/integration/csrf.test.ts. No synchronizer
 * tokens are used, so this file does not assert a token-rejection
 * branch — the cross-site-POST and verb-discipline invariants live
 * with the central CSRF tests.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DB_PATH = path.join(os.tmpdir(), `footbag-test-member-gal-${Date.now()}.db`);
let resetImageProcessingAdapterForTests: (() => void) | null = null;
process.env.FOOTBAG_DB_PATH = TEST_DB_PATH;
process.env.PORT            = '3097';
process.env.NODE_ENV        = 'test';
process.env.LOG_LEVEL       = 'error';
process.env.PUBLIC_BASE_URL = 'http://localhost:3097';
process.env.SESSION_SECRET  = 'member-galleries-routes-test-secret';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import sharp from 'sharp';

import {
  insertMember,
  insertMemberTierGrant,
  createTestSessionJwt,
  insertMediaItem,
} from '../fixtures/factories';

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

  // Grant Tier 1 to OWNER and OTHER so the requireTier1Benefits gate on
  // POST /members/:slug/galleries{,/...} passes. Without this, every POST
  // 403s from the gate before reaching the controller's owner check, and
  // the cross-member 404 anti-enumeration tests would no longer reach the
  // owner-check branch they exist to verify.
  insertMemberTierGrant(db, { member_id: OWNER_ID, new_tier_status: 'tier1' });
  insertMemberTierGrant(db, { member_id: OTHER_ID, new_tier_status: 'tier1' });
  // Admin must hold Tier 2+ per USER_STORIES §3.6 to pass the
  // assertTier1Benefits defense-in-depth check in curatorMediaService
  // (admin moderation test exercises updateGallery via the admin curator
  // route, which routes through the same service method).
  insertMemberTierGrant(db, { member_id: ADMIN_ID, new_tier_status: 'tier2', reason_code: 'purchase.tier2' });

  db.close();

  const mod = await import('../../src/app');
  createApp = mod.createApp;

  // FH-owned writes from this suite (admin moderation tests, etc.)
  // would touch /curated/galleries/ in the repo. Redirect to a temp
  // dir so the suite never mutates the real /curated/ tree.
  CURATED_TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-routes-curated-'));
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.setCuratedRootDirForTests(CURATED_TMP_ROOT);

  // In-process Sharp pipeline injected at the HTTP-adapter boundary so
  // mid-edit / on-create photo uploads run without a real image worker.
  // Mirrors the upload-route suite.
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
});

afterAll(async () => {
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.resetCuratedRootDirForTests();
  if (resetImageProcessingAdapterForTests) resetImageProcessingAdapterForTests();
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
    expect(res.text).toMatch(/href="\/members\/mg_owner\/galleries\/gallery_mg_owner_[a-z0-9_]+\/edit"/);
    expect(res.text).toMatch(/action="\/members\/mg_owner\/galleries\/gallery_mg_owner_[a-z0-9_]+\/delete"/);
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

  // Regression: read-only gallery list must not pull the image or video
  // worker adapters (both throw "INTERNAL_EVENT_SECRET not configured"
  // at first resolution when the secret is unset). Test fixtures set the
  // secret so the failure was invisible without spying.
  it('does not resolve the video or image worker adapter on a read-only gallery list', async () => {
    const { vi } = await import('vitest');
    const videoMod = await import('../../src/adapters/videoTranscodingAdapter');
    const imageMod = await import('../../src/adapters/imageProcessingAdapter');
    const videoSpy = vi.spyOn(videoMod, 'getVideoTranscodingAdapter')
      .mockImplementation(() => {
        throw new Error('regression: video adapter resolved on /members/:slug/galleries');
      });
    const imageSpy = vi.spyOn(imageMod, 'getImageProcessingAdapter')
      .mockImplementation(() => {
        throw new Error('regression: image adapter resolved on /members/:slug/galleries');
      });
    try {
      const res = await request(createApp())
        .get(`/members/${OWNER_SLUG}/galleries`)
        .set('Cookie', ownerCookie());
      expect(res.status).toBe(200);
      expect(videoSpy).not.toHaveBeenCalled();
      expect(imageSpy).not.toHaveBeenCalled();
    } finally {
      videoSpy.mockRestore();
      imageSpy.mockRestore();
    }
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
    expect(id).toBe('gallery_mg_owner_fresh_gallery');
  });

  it('auto-applies #by_<slug> when criteriaTags is empty (My Photos default)', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: 'My Photos', description: '', sortOrder: 'upload_desc', criteriaTags: '', excludeTags: '' });
    expect(res.status).toBe(302);
    const id = findGalleryIdByName('My Photos')!;
    expect(id).toBe('gallery_mg_owner_my_photos');
    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      const tags = db.prepare(
        `SELECT t.tag_display FROM member_gallery_tags mgt JOIN tags t ON t.id = mgt.tag_id WHERE mgt.gallery_id = ?`,
      ).all(id) as { tag_display: string }[];
      expect(tags.map((t) => t.tag_display)).toEqual([`#by_${OWNER_SLUG}`]);
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
    expect(id).toBe('gallery_mg_owner_forge_attempt');
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

  it('renders inline field-level error next to the offending input', async () => {
    await createGalleryViaApi('Inline Error Source');
    const id = findGalleryIdByName('Inline Error Source')!;
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: '', description: '', sortOrder: 'upload_desc', criteriaTags: '#x', excludeTags: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('form-field-error');
    expect(res.text).toContain('Gallery name is required');
  });

  it('renders inline error against criteriaTags when a tag is invalid', async () => {
    await createGalleryViaApi('Bad Crit Source');
    const id = findGalleryIdByName('Bad Crit Source')!;
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({ name: 'X', description: '', sortOrder: 'upload_desc', criteriaTags: '#NotLowercase', excludeTags: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('form-field-error');
    expect(res.text).toMatch(/criteria tag must be lowercase/i);
  });

  it('persists a valid external link on update and pre-fills it on the next edit page render', async () => {
    await createGalleryViaApi('Linked Source', '#linked');
    const id = findGalleryIdByName('Linked Source')!;

    const post = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({
        name: 'Linked Source',
        description: '',
        sortOrder: 'upload_desc',
        criteriaTags: '#linked',
        excludeTags: '',
        externalLinkLabel0: 'Project page',
        externalLinkUrl0: 'https://example.com/project',
      });
    expect(post.status).toBe(302);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const rows = db.prepare(
        `SELECT label, url, sort_order FROM gallery_external_links WHERE gallery_id = ? ORDER BY sort_order`,
      ).all(id) as Array<{ label: string; url: string; sort_order: number }>;
      expect(rows).toEqual([
        { label: 'Project page', url: 'https://example.com/project', sort_order: 0 },
      ]);
    } finally { db.close(); }

    const get = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', ownerCookie());
    expect(get.status).toBe(200);
    expect(get.text).toContain('value="Project page"');
    expect(get.text).toContain('value="https://example.com/project"');
  });

  it('rejects an invalid external link URL with a per-field inline error and persists nothing', async () => {
    await createGalleryViaApi('Bad URL Source', '#badurl');
    const id = findGalleryIdByName('Bad URL Source')!;

    const post = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({
        name: 'Bad URL Source',
        description: '',
        sortOrder: 'upload_desc',
        criteriaTags: '#badurl',
        excludeTags: '',
        externalLinkLabel0: 'Bogus',
        externalLinkUrl0: 'javascript:alert(1)',
      });
    expect(post.status).toBe(422);
    expect(post.text).toContain('form-field-error');
    expect(post.text).toMatch(/disallowed protocol/i);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const count = db.prepare(
        `SELECT COUNT(*) as n FROM gallery_external_links WHERE gallery_id = ?`,
      ).get(id) as { n: number };
      expect(count.n).toBe(0);
    } finally { db.close(); }
  });

  it('clears existing external links on update with empty inputs', async () => {
    await createGalleryViaApi('Clear Links', '#clearlinks');
    const id = findGalleryIdByName('Clear Links')!;
    // Seed one link via service direct.
    await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({
        name: 'Clear Links',
        description: '',
        sortOrder: 'upload_desc',
        criteriaTags: '#clearlinks',
        excludeTags: '',
        externalLinkLabel0: 'Initial',
        externalLinkUrl0: 'https://example.com/initial',
      });
    // Then re-submit with empty link inputs.
    const second = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', ownerCookie())
      .type('form')
      .send({
        name: 'Clear Links',
        description: '',
        sortOrder: 'upload_desc',
        criteriaTags: '#clearlinks',
        excludeTags: '',
        externalLinkLabel0: '',
        externalLinkUrl0: '',
      });
    expect(second.status).toBe(302);

    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const count = db.prepare(
        `SELECT COUNT(*) as n FROM gallery_external_links WHERE gallery_id = ?`,
      ).get(id) as { n: number };
      expect(count.n).toBe(0);
    } finally { db.close(); }
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
    // against a member-owned gallery to confirm admin moderation works
    // on member-owned rows alongside FH-owned rows.
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

// ── No-picker model: current-items display + uploadTags pass-through ──────

describe('gallery edit current-items display + uploadTags', () => {
  beforeEach(() => {
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

  it('GET /galleries/new does not render the picker', async () => {
    const db = new BetterSqlite3(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    insertMediaItem(db, { uploader_member_id: OWNER_ID, source_filename: 'mine.jpg', caption: null });
    db.close();

    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries/new`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('member-media-picker');
    expect(res.text).not.toContain('Add items from your existing uploads');
    // Upload widget is still present.
    expect(res.text).toContain('Upload files now');
    expect(res.text).toContain('Extra tags for these uploads');
  });

  it('GET /galleries/:id/edit shows the current-items thumbnail display when items match', async () => {
    // Create a gallery with criteria #pickedup; insert an item carrying
    // both #by_<owner> (auto on upload, simulated via factory tags) and
    // #pickedup so it matches the gallery's tag-AND.
    await createGalleryViaApi('Picked Up', '#pickedup');
    const id = findGalleryIdByName('Picked Up')!;

    const db = new BetterSqlite3(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    const m = insertMediaItem(db, { uploader_member_id: OWNER_ID, source_filename: 'show.jpg', caption: null });
    // Tag the item with both criteria tags so it appears in the gallery.
    const insertTag = db.prepare(
      `INSERT INTO tags (id, created_at, created_by, updated_at, updated_by, version, tag_normalized, tag_display, is_standard, standard_type) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, 0, NULL) ON CONFLICT(tag_normalized) DO NOTHING`,
    );
    const findTagId = db.prepare(`SELECT id FROM tags WHERE tag_normalized = ?`);
    function tagId(display: string): string {
      const norm = display.toLowerCase();
      insertTag.run(`tag_${norm.slice(1)}`, '2026-01-01', '2026-01-01', norm, display);
      const row = findTagId.get(norm) as { id: string };
      return row.id;
    }
    const insertMediaTag = db.prepare(
      `INSERT INTO media_tags (id, created_at, created_by, updated_at, updated_by, version, media_id, tag_id, tag_display) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?)`,
    );
    insertMediaTag.run(`mt_${m}_by`, '2026-01-01', '2026-01-01', m, tagId(`#by_${OWNER_SLUG}`), `#by_${OWNER_SLUG}`);
    insertMediaTag.run(`mt_${m}_pick`, '2026-01-01', '2026-01-01', m, tagId('#pickedup'), '#pickedup');
    db.close();

    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Items currently in this gallery');
    expect(res.text).toContain('show.jpg');
    expect(res.text).toContain(`/members/${OWNER_SLUG}/media/${m}/edit`);
    expect(res.text).not.toContain('member-media-picker');
  });

  it('multipart POST /galleries auto-stamps gallery criteria + merges uploadTags onto uploaded files', async () => {
    const jpeg = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 50, g: 100, b: 150 } },
    }).jpeg().toBuffer();

    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .field('name', 'Tag-Auto-Stamp')
      .field('description', '')
      .field('sortOrder', 'upload_desc')
      .field('criteriaTags', '#footbags')
      .field('excludeTags', '')
      .field('uploadTags', '#myuploads')
      .attach('photoFiles', jpeg, 'pixel.jpg');
    expect(res.status).toBe(302);

    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      const row = db.prepare(`SELECT id FROM media_items WHERE source_filename = ? ORDER BY uploaded_at DESC LIMIT 1`).get('pixel.jpg') as { id: string } | undefined;
      expect(row).toBeTruthy();
      const tags = findMediaTags(row!.id);
      // Auto-stamped from gallery's non-#by_* criteria + merged with
      // user-supplied uploadTags + service-prepended #by_<slug>.
      expect(tags).toContain('#footbags');
      expect(tags).toContain('#myuploads');
      expect(tags).toContain(`#by_${OWNER_SLUG}`);
    } finally { db.close(); }
  });

  it('multipart POST /galleries with empty uploadTags still auto-stamps the gallery criteria onto uploads', async () => {
    const jpeg = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 50, g: 100, b: 150 } },
    }).jpeg().toBuffer();

    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .field('name', 'Bare Uploads')
      .field('description', '')
      .field('sortOrder', 'upload_desc')
      .field('criteriaTags', '#somecat')
      .field('excludeTags', '')
      .field('uploadTags', '')
      .attach('photoFiles', jpeg, 'bare.jpg');
    expect(res.status).toBe(302);

    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      const row = db.prepare(`SELECT id FROM media_items WHERE source_filename = ? ORDER BY uploaded_at DESC LIMIT 1`).get('bare.jpg') as { id: string } | undefined;
      expect(row).toBeTruthy();
      const tags = findMediaTags(row!.id);
      // Empty uploadTags + auto-stamped criteria + auto #by_<slug>.
      expect(tags.sort()).toEqual([`#by_${OWNER_SLUG}`, '#somecat'].sort());
    } finally { db.close(); }
  });

  it('multipart POST /galleries/:id/edit accepts file uploads with uploadTags', async () => {
    await createGalleryViaApi('Edit-And-Upload', '#edittag');
    const id = findGalleryIdByName('Edit-And-Upload')!;

    const jpeg = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 50, g: 100, b: 150 } },
    }).jpeg().toBuffer();

    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries/${id}/edit`)
      .set('Cookie', ownerCookie())
      .field('name', 'Edit-And-Upload')
      .field('description', 'updated')
      .field('sortOrder', 'upload_desc')
      .field('criteriaTags', '#edittag')
      .field('excludeTags', '')
      .field('uploadTags', '#edittag')
      .attach('photoFiles', jpeg, 'mid-edit.jpg');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/members/${OWNER_SLUG}/galleries?saved=edit`);

    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      const row = db.prepare(`SELECT id FROM media_items WHERE source_filename = ? ORDER BY uploaded_at DESC LIMIT 1`).get('mid-edit.jpg') as { id: string } | undefined;
      expect(row).toBeTruthy();
      const tags = findMediaTags(row!.id);
      expect(tags).toContain('#edittag');
      expect(tags).toContain(`#by_${OWNER_SLUG}`);
    } finally { db.close(); }
  });

  it('multipart submit with empty file input does not error (browser sends empty part)', async () => {
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/galleries`)
      .set('Cookie', ownerCookie())
      .field('name', 'No File')
      .field('description', '')
      .field('sortOrder', 'upload_desc')
      .field('criteriaTags', '#nofile')
      .field('excludeTags', '')
      .field('uploadTags', '')
      .attach('photoFiles', Buffer.alloc(0), '');
    expect(res.status).toBe(302);
    expect(res.text).not.toContain('Only JPEG and PNG');
    expect(findGalleryIdByName('No File')).toBeTruthy();
  });
});
