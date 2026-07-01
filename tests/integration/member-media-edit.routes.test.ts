/**
 * Integration tests for the owner-only per-item media edit routes:
 *   GET  /members/:memberKey/media/:mediaId/edit
 *   POST /members/:memberKey/media/:mediaId/edit
 *
 * Auth: requireAuth + same-slug ownership check. Mismatched slug or
 * mismatched ownership (valid mediaId but uploaded by someone else)
 * both render 404 (anti-enumeration; matches the rest of /members/).
 *
 * Tier gating: POST is gated by requireTier1Benefits; GET stays open
 * so tier-0 owners can read their own existing items.
 *
 * Route ordering: /media/upload must match before /media/:mediaId/edit;
 * the controller also guards :mediaId === 'upload' defensively.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_DB_PATH = path.join(os.tmpdir(), `footbag-test-member-media-edit-${Date.now()}.db`);
process.env.FOOTBAG_DB_PATH = TEST_DB_PATH;
process.env.PORT            = '3098';
process.env.NODE_ENV        = 'test';
process.env.LOG_LEVEL       = 'error';
process.env.PUBLIC_BASE_URL = 'http://localhost:3098';
process.env.SESSION_SECRET  = 'member-media-edit-routes-test-secret';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { createTestDb } from '../fixtures/testDb';

import {
  insertMember,
  completeOnboarding,
  insertMemberTierGrant,
  createTestSessionJwt,
  insertMediaItem,
  insertTag,
} from '../fixtures/factories';

const OWNER_ID    = 'member-mme-owner-001';
const OWNER_SLUG  = 'mme_owner';
const OTHER_ID    = 'member-mme-other-001';
const OTHER_SLUG  = 'mme_other';
const TIER0_ID    = 'member-mme-tier0-001';
const TIER0_SLUG  = 'mme_tier0';

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role: 'member' })}`;
}

function findMediaTags(mediaId: string): string[] {
  const db = new BetterSqlite3(TEST_DB_PATH);
  try {
    const rows = db.prepare(
      `SELECT t.tag_display FROM media_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.media_id = ? ORDER BY t.tag_display`,
    ).all(mediaId) as { tag_display: string }[];
    return rows.map((r) => r.tag_display);
  } finally { db.close(); }
}

function findMediaCaption(mediaId: string): string | null {
  const db = new BetterSqlite3(TEST_DB_PATH);
  try {
    const row = db.prepare(`SELECT caption FROM media_items WHERE id = ?`).get(mediaId) as { caption: string | null } | undefined;
    return row?.caption ?? null;
  } finally { db.close(); }
}

function findMediaExternalUrl(mediaId: string): string | null {
  const db = new BetterSqlite3(TEST_DB_PATH);
  try {
    const row = db.prepare(`SELECT external_url FROM media_items WHERE id = ?`).get(mediaId) as { external_url: string | null } | undefined;
    return row?.external_url ?? null;
  } finally { db.close(); }
}

beforeAll(async () => {
  const db = createTestDb(TEST_DB_PATH);
  insertMember(db, { id: OWNER_ID, slug: OWNER_SLUG, display_name: 'MME Owner' });
  completeOnboarding(db, OWNER_ID);
  insertMember(db, { id: OTHER_ID, slug: OTHER_SLUG, display_name: 'MME Other' });
  completeOnboarding(db, OTHER_ID);
  insertMember(db, { id: TIER0_ID, slug: TIER0_SLUG, display_name: 'MME Tier0' });
  completeOnboarding(db, TIER0_ID);

  insertMemberTierGrant(db, { member_id: OWNER_ID, new_tier_status: 'tier1' });
  insertMemberTierGrant(db, { member_id: OTHER_ID, new_tier_status: 'tier1' });
  // TIER0_ID stays at the default tier (tier0) — no grant inserted.

  db.close();

  const mod = await import('../../src/app');
  createApp = mod.createApp;
});

afterAll(() => {
  try { fs.unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
  try { fs.unlinkSync(`${TEST_DB_PATH}-wal`); } catch { /* ignore */ }
  try { fs.unlinkSync(`${TEST_DB_PATH}-shm`); } catch { /* ignore */ }
});

function insertOwnerMedia(filename = 'mme-owner.jpg', caption: string | null = 'orig'): string {
  const db = new BetterSqlite3(TEST_DB_PATH);
  db.pragma('foreign_keys = ON');
  try {
    return insertMediaItem(db, { uploader_member_id: OWNER_ID, source_filename: filename, caption });
  } finally { db.close(); }
}

function insertOtherMedia(filename = 'mme-other.jpg'): string {
  const db = new BetterSqlite3(TEST_DB_PATH);
  db.pragma('foreign_keys = ON');
  try {
    return insertMediaItem(db, { uploader_member_id: OTHER_ID, source_filename: filename, caption: null });
  } finally { db.close(); }
}

describe('member per-item media edit routes', () => {
  it('GET /members/:slug/media/:id/edit — owner → 200 with caption + tags pre-filled', async () => {
    const mediaId = insertOwnerMedia('owner-gets.jpg', 'hello caption');
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('hello caption');
    expect(res.text).toContain('name="tags"');
    expect(res.text).toContain('name="externalUrl"');
  });

  it('GET unauthenticated → 302 /login', async () => {
    const mediaId = insertOwnerMedia('owner-anon.jpg');
    const res = await request(createApp()).get(`/members/${OWNER_SLUG}/media/${mediaId}/edit`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });

  it('GET non-owner slug (different member, valid mediaId) → 404', async () => {
    const mediaId = insertOwnerMedia('owner-only.jpg');
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OTHER_ID));
    expect(res.status).toBe(404);
  });

  it("GET valid mediaId owned by another member (slug=session) → 404 (anti-enumeration)", async () => {
    const otherMediaId = insertOtherMedia('other-private.jpg');
    // Owner session is browsing their own /members/<owner>/ URL space,
    // but the mediaId belongs to OTHER. Must 404.
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/media/${otherMediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(404);
  });

  it('GET non-existent mediaId → 404', async () => {
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/media/media_does_not_exist_zzz/edit`)
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(404);
  });

  it("GET :mediaId === 'upload' → 404 (literal-segment defense)", async () => {
    // The literal /media/upload GET route is registered before this one
    // and renders the upload form on its own. If route ordering ever
    // regresses, the controller's :mediaId === 'upload' guard prevents
    // 'upload' from being treated as an id. Reach it by hitting the
    // literal segment with no trailing edit segment is impossible
    // (different route shape), so the guard is exercised indirectly:
    // a POST to /media/upload/edit with the owner session must 404
    // through the guard (the upload route is GET+POST on /media/upload,
    // not on /media/upload/edit).
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/media/upload/edit`)
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(404);
  });

  it('POST owner happy path → 303 redirect; caption + tags + externalUrl persisted', async () => {
    const mediaId = insertOwnerMedia('owner-edits.jpg', 'before');
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({ caption: 'after edit', tags: '#footbags #colorful', externalUrl: 'https://example.com/source' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${OWNER_SLUG}/galleries`);
    expect(findMediaCaption(mediaId)).toBe('after edit');
    const tags = findMediaTags(mediaId);
    expect(tags).toContain('#footbags');
    expect(tags).toContain('#colorful');
    expect(tags).toContain(`#by_${OWNER_SLUG}`);
    expect(findMediaExternalUrl(mediaId)).toBe('https://example.com/source');
  });

  it('POST non-owner slug → 404 (no write)', async () => {
    const mediaId = insertOwnerMedia('owner-nonowner-write.jpg', 'untouched');
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OTHER_ID))
      .type('form')
      .send({ caption: 'forged', tags: '', externalUrl: '' });
    expect(res.status).toBe(404);
    expect(findMediaCaption(mediaId)).toBe('untouched');
  });

  it("POST tier-gated: tier-0 owner → 403 from requireTier1Benefits", async () => {
    // Insert a media row owned by the tier-0 member. The GET path is open
    // to tier-0 (read-only), but POST must 403 at the middleware before
    // touching the service.
    const db = new BetterSqlite3(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    const mediaId = insertMediaItem(db, { uploader_member_id: TIER0_ID, source_filename: 'tier0.jpg', caption: 'orig' });
    db.close();

    const res = await request(createApp())
      .post(`/members/${TIER0_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(TIER0_ID))
      .type('form')
      .send({ caption: 'tier0 attempt', tags: '', externalUrl: '' });
    expect(res.status).toBe(403);
    expect(findMediaCaption(mediaId)).toBe('orig');
  });

  it('POST malformed tag (#by_* in input) → 422 with re-rendered form', async () => {
    const mediaId = insertOwnerMedia('owner-bad-tag.jpg', 'orig');
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({ caption: 'tried-bad-tag', tags: '#by_someoneelse', externalUrl: '' });
    expect(res.status).toBe(422);
    expect(res.text).toMatch(/by_/);
    // The transactional write should not have committed.
    expect(findMediaCaption(mediaId)).toBe('orig');
  });

  it('POST tags=empty → strips all user tags, leaves #by_<slug>', async () => {
    const mediaId = insertOwnerMedia('owner-strip-tags.jpg');
    // First save adds a custom tag.
    await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({ caption: '', tags: '#temp', externalUrl: '' });
    expect(findMediaTags(mediaId)).toContain('#temp');
    // Second save clears all user tags.
    await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({ caption: '', tags: '', externalUrl: '' });
    const tags = findMediaTags(mediaId);
    expect(tags).toEqual([`#by_${OWNER_SLUG}`]);
  });

  // Per-item media edit was unlimited per session,
  // allowing Safe Browsing / DNS / HTTP reachability quota exhaustion via
  // repeated externalUrl validation.
  it('POST exceeding media-edit rate-limit → 429 with Retry-After', async () => {
    const rlMod = await import('../../src/services/rateLimitService');
    rlMod.resetRateLimitForTests();
    const tuneDb = new BetterSqlite3(TEST_DB_PATH);
    tuneDb.prepare(`
      INSERT INTO system_config
        (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
      VALUES (?, ?, 'media_edit_rate_limit_per_hour', '2', ?, 'Test tunable', NULL)
    `).run('test-media-edit-rl', '2026-05-22T00:00:00.000Z', '2026-05-22T00:00:00.000Z');
    tuneDb.close();
    try {
      const mediaId = insertOwnerMedia('owner-rl.jpg');
      for (let i = 0; i < 2; i++) {
        const ok = await request(createApp())
          .post(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
          .set('Cookie', cookieFor(OWNER_ID))
          .type('form')
          .send({ caption: `pass-${i}`, tags: '', externalUrl: '' });
        expect(ok.status).toBe(303);
      }
      const blocked = await request(createApp())
        .post(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
        .set('Cookie', cookieFor(OWNER_ID))
        .type('form')
        .send({ caption: 'blocked', tags: '', externalUrl: '' });
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
    } finally {
      rlMod.resetRateLimitForTests();
    }
  });
});

describe('member per-item media delete route', () => {
  function rowExists(mediaId: string): boolean {
    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      return db.prepare('SELECT 1 FROM media_items WHERE id = ?').get(mediaId) !== undefined;
    } finally { db.close(); }
  }

  function attachTag(mediaId: string): string {
    const db = new BetterSqlite3(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    try {
      const tagId = insertTag(db, {});
      db.prepare(`
        INSERT INTO media_tags (id, created_at, created_by, updated_at, updated_by, version, media_id, tag_id, tag_display)
        VALUES (?, '2026-01-01T00:00:00.000Z', 'test', '2026-01-01T00:00:00.000Z', 'test', 1, ?, ?, '#deltest')
      `).run(`mtag-del-${mediaId}`, mediaId, tagId);
      return tagId;
    } finally { db.close(); }
  }

  function tagRowCount(mediaId: string): number {
    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      return (db.prepare('SELECT COUNT(*) AS n FROM media_tags WHERE media_id = ?').get(mediaId) as { n: number }).n;
    } finally { db.close(); }
  }

  it('POST owner delete -> 303, row permanently gone, tag rows cascade, audit written', async () => {
    const mediaId = insertOwnerMedia('owner-delete.jpg');
    attachTag(mediaId);
    expect(tagRowCount(mediaId)).toBe(1);

    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${mediaId}/delete`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({});
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${OWNER_SLUG}/galleries`);
    expect(rowExists(mediaId)).toBe(false);
    expect(tagRowCount(mediaId)).toBe(0);

    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      const audit = db.prepare(
        `SELECT actor_member_id FROM audit_entries WHERE action_type = 'media.member_deleted' AND entity_id = ?`,
      ).get(mediaId) as { actor_member_id: string } | undefined;
      expect(audit?.actor_member_id).toBe(OWNER_ID);
    } finally { db.close(); }
  });

  it("POST against another member's item -> 404, row intact (anti-enumeration)", async () => {
    const otherMediaId = insertOtherMedia('other-delete.jpg');
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${otherMediaId}/delete`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({});
    expect(res.status).toBe(404);
    expect(rowExists(otherMediaId)).toBe(true);
  });

  it('POST unauthenticated -> 302 /login, row intact', async () => {
    const mediaId = insertOwnerMedia('owner-delete-anon.jpg');
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${mediaId}/delete`)
      .type('form')
      .send({});
    expect(res.status).toBe(302);
    expect(rowExists(mediaId)).toBe(true);
  });

  it('POST by a tier-0 owner -> 403 (delete controls require Tier 1 benefits), row intact', async () => {
    const db = new BetterSqlite3(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    const mediaId = insertMediaItem(db, { uploader_member_id: TIER0_ID, source_filename: 'tier0-del.jpg', caption: null });
    db.close();

    const res = await request(createApp())
      .post(`/members/${TIER0_SLUG}/media/${mediaId}/delete`)
      .set('Cookie', cookieFor(TIER0_ID))
      .type('form')
      .send({});
    expect(res.status).toBe(403);
    expect(rowExists(mediaId)).toBe(true);
  });

  it('POST against an avatar row -> 404, row intact (avatar lifecycle belongs to avatar upload)', async () => {
    const db = new BetterSqlite3(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    const avatarId = insertMediaItem(db, { uploader_member_id: OWNER_ID, is_avatar: 1, source_filename: 'owner-avatar.jpg', caption: null });
    db.close();

    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${avatarId}/delete`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({});
    expect(res.status).toBe(404);
    expect(rowExists(avatarId)).toBe(true);
  });

  it('the edit page renders the delete form with a confirm guard', async () => {
    const mediaId = insertOwnerMedia('owner-delete-form.jpg');
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain(`action="/members/${OWNER_SLUG}/media/${mediaId}/delete"`);
    expect(res.text).toContain('data-confirm=');
  });
});
