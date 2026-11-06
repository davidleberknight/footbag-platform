/**
 * Integration tests for the owner-only per-item media edit routes:
 *   GET  /members/:memberKey/media/:mediaId/edit
 *   POST /members/:memberKey/media/:mediaId/edit
 *
 * Auth: requireAuth + same-slug ownership check. Mismatched slug or
 * mismatched ownership (valid mediaId but uploaded by someone else)
 * both render 404 (anti-enumeration; matches the rest of /members/).
 *
 * Tier gating: the GET form and the POST are both gated by
 * requireTier1Benefits, so an owner the save would refuse is never handed the
 * form. The item itself stays readable on its own page.
 *
 * Route ordering: /media/upload must match before /media/:mediaId/edit;
 * the route also guards :mediaId === 'upload' defensively.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4197');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { defaultSubmitButton } from '../fixtures/defaultSubmitButton';

import {
  insertMember,
  completeOnboarding,
  insertMemberTierGrant,
  createTestSessionJwt,
  insertMediaItem,
  insertTag,
  attachMediaTag,
  insertSystemConfig,
  insertMemberGallery,
  insertGalleryCriterionTag,
  insertGalleryExcludeTag,
} from '../fixtures/factories';

const OWNER_ID    = 'member-mme-owner-001';
const OWNER_SLUG  = 'mme_owner';
const OTHER_ID    = 'member-mme-other-001';
const OTHER_SLUG  = 'mme_other';
const TIER0_ID    = 'member-mme-tier0-001';
const TIER0_SLUG  = 'mme_tier0';

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role: 'member' })}`;
}

function findMediaTags(mediaId: string): string[] {
  const db = new BetterSqlite3(dbPath);
  try {
    const rows = db.prepare(
      `SELECT t.tag_display FROM media_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.media_id = ? ORDER BY t.tag_display`,
    ).all(mediaId) as { tag_display: string }[];
    return rows.map((r) => r.tag_display);
  } finally { db.close(); }
}

function findMediaCaption(mediaId: string): string | null {
  const db = new BetterSqlite3(dbPath);
  try {
    const row = db.prepare(`SELECT caption FROM media_items WHERE id = ?`).get(mediaId) as { caption: string | null } | undefined;
    return row?.caption ?? null;
  } finally { db.close(); }
}

function findMediaExternalUrl(mediaId: string): string | null {
  const db = new BetterSqlite3(dbPath);
  try {
    const row = db.prepare(`SELECT external_url FROM media_items WHERE id = ?`).get(mediaId) as { external_url: string | null } | undefined;
    return row?.external_url ?? null;
  } finally { db.close(); }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
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

  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
});

function insertOwnerMedia(filename = 'mme-owner.jpg', caption: string | null = 'orig'): string {
  const db = new BetterSqlite3(dbPath);
  db.pragma('foreign_keys = ON');
  try {
    return insertMediaItem(db, { uploader_member_id: OWNER_ID, source_filename: filename, caption });
  } finally { db.close(); }
}

function insertOtherMedia(filename = 'mme-other.jpg'): string {
  const db = new BetterSqlite3(dbPath);
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

  // Defect caught: Enter in a field such as External URL runs the player
  // search instead of saving, so the member's edit is not saved.
  it('makes Save the edit form\'s default button, ahead of the player search', async () => {
    const mediaId = insertOwnerMedia('owner-enter.jpg', null);
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-member-search-submit');
    const formId = /<form id="([^"]+)"[^>]*method="POST"/.exec(res.text)?.[1] ?? '';
    const button = defaultSubmitButton(res.text, formId);
    expect(button?.overridesForm).toBe(false);
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
    // regresses, the route's :mediaId === 'upload' guard prevents
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
    // Defect caught: a save lands on the gallery list rather than the item the
    // member just changed. This item was stored without the Personal Gallery
    // a real upload materializes, so it lands on its own page.
    expect(res.headers.location).toBe(`/media/item/${mediaId}`);
    expect(findMediaCaption(mediaId)).toBe('after edit');
    const tags = findMediaTags(mediaId);
    expect(tags).toContain('#footbags');
    expect(tags).toContain('#colorful');
    expect(tags).toContain(`#by_${OWNER_SLUG}`);
    expect(findMediaExternalUrl(mediaId)).toBe('https://example.com/source');
  });

  // Defect caught: an edited caption is stored with live markup, a control
  // character, CRLF line ends or a decomposed accent.
  it('POST owner edit stores the cleaned caption', async () => {
    const mediaId = insertOwnerMedia('owner-edits-clean.jpg', 'before');
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({
        caption: 'Café <i>edit</i>\u0085 one\r\n\r\ntwo',
        tags: '',
        externalUrl: '',
      });
    expect(res.status).toBe(303);
    expect(findMediaCaption(mediaId)).toBe('Café edit one\n\ntwo');
    // The audit row names the fields the owner changed, never their words.
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const audit = db.prepare(
      "SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'media.member_edited'",
    ).get(mediaId) as { metadata_json: string };
    db.close();
    expect(JSON.parse(audit.metadata_json).fields).toContain('caption');
    expect(audit.metadata_json).not.toContain('Café');
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

  it("GET tier-gated: tier-0 owner → 403 naming the benefit, not the generic wall", async () => {
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    const mediaId = insertMediaItem(db, { uploader_member_id: TIER0_ID, source_filename: 'tier0-get.jpg', caption: 'orig' });
    db.close();

    const res = await request(createApp())
      .get(`/members/${TIER0_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(TIER0_ID));
    expect(res.status).toBe(403);
    expect(res.text).toContain('Sharing media is a Tier 1 benefit.');
    expect(res.text).not.toContain('have permission to view this page');
  });

  it("POST tier-gated: tier-0 owner → 403 from requireTier1Benefits", async () => {
    // Insert a media row owned by the tier-0 member. POST must 403 at the
    // middleware before touching the service.
    const db = new BetterSqlite3(dbPath);
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

  // A hand-made request repeating the tags field arrives as a list, not text;
  // it must be answered as a submission, never crash the save with a 500.
  it('POST with the tags field repeated is answered as a save, not a server error', async () => {
    const mediaId = insertOwnerMedia('owner-repeated-tags.jpg');
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send('caption=&externalUrl=&tags=%23one&tags=%23two');
    expect(res.status).toBe(303);
    expect(findMediaTags(mediaId)).toEqual([`#by_${OWNER_SLUG}`]);
  });

  // A typed hashtag is stored in its folded form, and the member is told on the
  // page they land on which hashtag they typed and what it was saved as, so a
  // changed hashtag never goes unexplained.
  it('POST stores a typed hashtag folded and names both forms in the saved message', async () => {
    const mediaId = insertOwnerMedia('owner-fold-tag.jpg');
    const res = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({ caption: '', tags: '#Zoë-Müller #plainfold', externalUrl: '' });
    expect(res.status).toBe(303);
    // The display form keeps the capitals typed; matching ignores case.
    const tags = findMediaTags(mediaId).map((t) => t.toLowerCase());
    expect(tags).toContain('#zoe_muller');
    expect(tags).toContain('#plainfold');
    expect(tags.some((t) => /[^\x00-\x7f]|-/.test(t))).toBe(false);
    const flash = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
      .find((c) => c.startsWith('footbag_flash='))?.split(';')[0];
    expect(flash).toBeDefined();
    const landed = await request(createApp())
      .get(res.headers.location)
      .set('Cookie', [cookieFor(OWNER_ID), flash!].join('; '));
    expect(landed.status).toBe(200);
    const banner = (/class="form-success-banner"[\s\S]*?<\/div>/.exec(landed.text)?.[0] ?? '').toLowerCase();
    // The sentence naming the folded hashtag, among the banner's sentences.
    const foldSentence = (banner.match(/<p>[^<]*<\/p>/g) ?? []).find((p) => p.includes('zoë-müller')) ?? '';
    expect(foldSentence).toContain('#zoe_muller');
    // A hashtag typed clean is not reported as changed.
    expect(foldSentence).not.toContain('#plainfold');
  });

  // The documented rules hold on the server whatever the browser sent: at most
  // 30 hashtags on an item, and no hashtag holding a letter with no a to z form.
  it('POST refuses a 31st hashtag and a hashtag with no Latin form, saving nothing', async () => {
    const mediaId = insertOwnerMedia('owner-tag-rules.jpg', 'orig');
    const thirty = Array.from({ length: 30 }, (_, i) => `#rulecount${i}`);
    const ok = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({ caption: 'orig', tags: thirty.join(' '), externalUrl: '' });
    expect(ok.status).toBe(303);
    const tooMany = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({ caption: 'changed', tags: [...thirty, '#rulecount30'].join(' '), externalUrl: '' });
    expect(tooMany.status).toBe(422);
    expect(findMediaCaption(mediaId)).toBe('orig');
    const noLatin = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      // Partly Latin, so folding alone would quietly keep "#tokyo" and drop the rest.
      .send({ caption: 'changed', tags: '#tokyo東京', externalUrl: '' });
    expect(noLatin.status).toBe(422);
    expect(noLatin.text).toContain('#tokyo東京');
    expect(findMediaCaption(mediaId)).toBe('orig');
    expect(findMediaTags(mediaId)).toContain('#rulecount29');
  });

  // Per-item media edit was unlimited per session,
  // allowing Safe Browsing / DNS / HTTP reachability quota exhaustion via
  // repeated externalUrl validation.
  it('POST exceeding media-edit rate-limit → 429 with Retry-After', async () => {
    const rlMod = await import('../../src/services/rateLimitService');
    rlMod.resetRateLimitForTests();
    const tuneDb = new BetterSqlite3(dbPath);
    insertSystemConfig(tuneDb, {
      config_key: 'media_edit_rate_limit_per_hour',
      value_json: '2',
    });
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
    const db = new BetterSqlite3(dbPath);
    try {
      return db.prepare('SELECT 1 FROM media_items WHERE id = ?').get(mediaId) !== undefined;
    } finally { db.close(); }
  }

  function attachTag(mediaId: string): string {
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    try {
      const tagId = insertTag(db, {});
      attachMediaTag(db, mediaId, tagId);
      return tagId;
    } finally { db.close(); }
  }

  function tagRowCount(mediaId: string): number {
    const db = new BetterSqlite3(dbPath);
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

    const db = new BetterSqlite3(dbPath);
    try {
      const audit = db.prepare(
        `SELECT actor_member_id FROM audit_entries WHERE action_type = 'media.member_deleted' AND entity_id = ?`,
      ).get(mediaId) as { actor_member_id: string } | undefined;
      expect(audit?.actor_member_id).toBe(OWNER_ID);
    } finally { db.close(); }
  });

  // A double click or back-button re-post sends the delete again after the row
  // is gone. The repeat reports the first outcome, writes no second audit row
  // and spends no media-edit slot: with the limit tuned to two and both slots
  // spent by real deletes, a counted repeat would be refused.
  it('POST the same delete twice -> second answers like the first, one audit row, no slot spent', async () => {
    const rlMod = await import('../../src/services/rateLimitService');
    rlMod.resetRateLimitForTests();
    const tuneDb = new BetterSqlite3(dbPath);
    insertSystemConfig(tuneDb, {
      config_key: 'media_edit_rate_limit_per_hour',
      value_json: '2',
      // Its own effective instant, so it cannot collide with the edit
      // rate-limit case's row for the same key; both carry the same limit.
      effective_start_at: '2026-01-03T00:00:00.000Z',
    });
    tuneDb.close();
    const flashOf = (res: { headers: Record<string, unknown> }) =>
      ([] as string[]).concat((res.headers['set-cookie'] as string[] | undefined) ?? [])
        .find((c) => c.startsWith('footbag_flash='))?.split(';')[0];
    const del = (id: string) => request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${id}/delete`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({});
    try {
      const mediaId = insertOwnerMedia('owner-delete-twice.jpg');
      const filler = insertOwnerMedia('owner-delete-filler.jpg');

      const first = await del(mediaId);
      expect(first.status).toBe(303);
      expect((await del(filler)).status).toBe(303);

      const second = await del(mediaId);
      expect(second.status, 'a repeated delete is not an error').toBe(303);
      expect(second.headers.location).toBe(first.headers.location);
      expect(flashOf(first)).toContain('media_saved%3Adelete');
      expect(flashOf(second)).toBe(flashOf(first));

      const db = new BetterSqlite3(dbPath);
      try {
        const n = db.prepare(
          `SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = 'media.member_deleted' AND entity_id = ?`,
        ).get(mediaId) as { n: number };
        expect(n.n).toBe(1);
      } finally { db.close(); }

      // The limit of two is the one in force: a third real delete is refused.
      const third = insertOwnerMedia('owner-delete-third.jpg');
      expect((await del(third)).status).toBe(429);
    } finally {
      rlMod.resetRateLimitForTests();
    }
  });

  // A delete the member may not make changes nothing, so it spends no slot.
  it('POST refused deletes (an avatar) spend no media-edit slot', async () => {
    const rlMod = await import('../../src/services/rateLimitService');
    rlMod.resetRateLimitForTests();
    const tuneDb = new BetterSqlite3(dbPath);
    insertSystemConfig(tuneDb, {
      config_key: 'media_edit_rate_limit_per_hour',
      value_json: '2',
      effective_start_at: '2026-01-04T00:00:00.000Z',
    });
    // A member of its own: one avatar per member, and the suite's members'
    // avatars are seeded by other cases.
    const rlId = 'member-mme-avatar-rl-001';
    const rlSlug = 'mme_avatar_rl';
    tuneDb.pragma('foreign_keys = ON');
    insertMember(tuneDb, { id: rlId, slug: rlSlug, display_name: 'MME Avatar RL' });
    completeOnboarding(tuneDb, rlId);
    insertMemberTierGrant(tuneDb, { member_id: rlId, new_tier_status: 'tier1' });
    const avatarId = insertMediaItem(tuneDb, { uploader_member_id: rlId, is_avatar: 1, source_filename: 'rl-avatar.jpg', caption: null });
    const realId = insertMediaItem(tuneDb, { uploader_member_id: rlId, source_filename: 'rl-real.jpg', caption: null });
    tuneDb.close();
    const del = (id: string) => request(createApp())
      .post(`/members/${rlSlug}/media/${id}/delete`)
      .set('Cookie', cookieFor(rlId))
      .type('form')
      .send({});
    try {
      for (let i = 0; i < 2; i++) {
        expect((await del(avatarId)).status, `refused attempt ${i + 1}`).toBe(404);
      }
      expect((await del(realId)).status).toBe(303);
      expect(rowExists(avatarId)).toBe(true);
    } finally {
      rlMod.resetRateLimitForTests();
    }
  });

  it("POST a delete of another member's already-deleted item -> 404 (no leak of their deletion)", async () => {
    const otherMediaId = insertOtherMedia('other-deleted-first.jpg');
    const gone = await request(createApp())
      .post(`/members/${OTHER_SLUG}/media/${otherMediaId}/delete`)
      .set('Cookie', cookieFor(OTHER_ID))
      .type('form')
      .send({});
    expect(gone.status).toBe(303);

    const probe = await request(createApp())
      .post(`/members/${OWNER_SLUG}/media/${otherMediaId}/delete`)
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({});
    expect(probe.status).toBe(404);
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
    const db = new BetterSqlite3(dbPath);
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
    const db = new BetterSqlite3(dbPath);
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

  it('the edit page links Delete This Item to the confirm page instead of posting the delete', async () => {
    const mediaId = insertOwnerMedia('owner-delete-form.jpg');
    const res = await request(createApp())
      .get(`/members/${OWNER_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    // A form posting here would delete on one click wherever JavaScript is off.
    expect(res.text).toContain(`href="/members/${OWNER_SLUG}/media/${mediaId}/delete"`);
    expect(res.text).not.toContain(`action="/members/${OWNER_SLUG}/media/${mediaId}/delete"`);
  });
});

describe('member per-item media delete confirm page', () => {
  function rowExists(mediaId: string): boolean {
    const db = new BetterSqlite3(dbPath);
    try {
      return db.prepare('SELECT 1 FROM media_items WHERE id = ?').get(mediaId) !== undefined;
    } finally { db.close(); }
  }

  it('shows the owner the item and the consequence, deletes nothing, and posts only from its own button', async () => {
    const mediaId = insertOwnerMedia('owner-confirm.jpg', 'Sunset hackey session');
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    try {
      attachMediaTag(db, mediaId, insertTag(db, { tag_normalized: '#mme_confirm_tag', tag_display: '#mme_confirm_tag' }));
      // Another case in this file may already have created the uploader tag.
      const existing = db.prepare('SELECT id FROM tags WHERE tag_normalized = ?').get(`#by_${OWNER_SLUG}`) as
        | { id: string } | undefined;
      attachMediaTag(db, mediaId, existing?.id
        ?? insertTag(db, { tag_normalized: `#by_${OWNER_SLUG}`, tag_display: `#by_${OWNER_SLUG}` }));
    } finally { db.close(); }

    const deleteAction = `/members/${OWNER_SLUG}/media/${mediaId}/delete`;
    const res = await request(createApp())
      .get(deleteAction)
      .set('Cookie', cookieFor(OWNER_ID));

    expect(res.status).toBe(200);
    // The member must see which item goes before committing to a permanent loss.
    expect(res.text).toContain('Sunset hackey session');
    expect(res.text).toContain('#mme_confirm_tag');
    // The platform's own uploader marker is not one of the member's tags.
    expect(res.text).not.toContain(`#by_${OWNER_SLUG}`);
    expect(res.text).toContain('This cannot be undone.');
    // Exactly one form posts the delete, and Cancel returns to the edit page.
    expect(res.text.split(`action="${deleteAction}"`)).toHaveLength(2);
    expect(res.text).toContain(`href="/members/${OWNER_SLUG}/media/${mediaId}/edit"`);
    // Viewing the confirm page is not the delete.
    expect(rowExists(mediaId)).toBe(true);
  });

  it("404s another member's item, another member's path, an unknown id, an avatar and the upload segment", async () => {
    const otherMediaId = insertOtherMedia('other-confirm.jpg');
    const ownMediaId = insertOwnerMedia('owner-confirm-other-path.jpg');
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    // One avatar per member, and the owner's is taken by another case here.
    const avatarId = insertMediaItem(db, { uploader_member_id: OTHER_ID, is_avatar: 1, source_filename: 'other-avatar-confirm.jpg', caption: null });
    db.close();

    const cases: Array<[string, string]> = [
      [`/members/${OWNER_SLUG}/media/${otherMediaId}/delete`, OWNER_ID],
      [`/members/${OWNER_SLUG}/media/${ownMediaId}/delete`, OTHER_ID],
      [`/members/${OWNER_SLUG}/media/no-such-item/delete`, OWNER_ID],
      [`/members/${OTHER_SLUG}/media/${avatarId}/delete`, OTHER_ID],
      [`/members/${OWNER_SLUG}/media/upload/delete`, OWNER_ID],
    ];
    for (const [url, as] of cases) {
      const res = await request(createApp()).get(url).set('Cookie', cookieFor(as));
      expect(res.status, `${as} -> ${url}`).toBe(404);
    }
  });

  it('refuses a tier-0 owner (403) and sends an unauthenticated visitor to log in', async () => {
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    const tier0MediaId = insertMediaItem(db, { uploader_member_id: TIER0_ID, source_filename: 'tier0-confirm.jpg', caption: null });
    db.close();
    const tier0 = await request(createApp())
      .get(`/members/${TIER0_SLUG}/media/${tier0MediaId}/delete`)
      .set('Cookie', cookieFor(TIER0_ID));
    expect(tier0.status).toBe(403);

    const mediaId = insertOwnerMedia('owner-confirm-anon.jpg');
    const anon = await request(createApp()).get(`/members/${OWNER_SLUG}/media/${mediaId}/delete`);
    expect(anon.status).toBe(302);
    expect(anon.headers.location).toMatch(/\/login/);
  });
});

describe('where a saved edit lands', () => {
  const PG_ID = 'member-mme-pg-001';
  const PG_SLUG = 'mme_pg';
  const PERSONAL_ID = `gallery_${PG_SLUG}_personal_gallery`;
  const HIDDEN_TAG = `#${PG_SLUG}_hidden`;
  let oldestId = '';
  let hiddenId = '';

  // The Personal Gallery pages through every item it matches, so an item
  // uploaded before more newer ones than one query window holds is still in
  // its set; an item carrying a hashtag the gallery excludes is not.
  beforeAll(async () => {
    const { GALLERY_ITEMS_QUERY_CAP } = await import('../../src/db/db');
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    try {
      insertMember(db, { id: PG_ID, slug: PG_SLUG, display_name: 'MME Personal' });
      completeOnboarding(db, PG_ID);
      insertMemberTierGrant(db, { member_id: PG_ID, new_tier_status: 'tier1' });
      const byTag = `#by_${PG_SLUG}`;
      oldestId = insertMediaItem(db, {
        uploader_member_id: PG_ID, source_filename: 'pg-oldest.jpg', caption: 'oldest',
        uploaded_at: '2020-01-01T00:00:00.000Z', tags: [byTag],
      });
      for (let i = 0; i < GALLERY_ITEMS_QUERY_CAP; i += 1) {
        const at = new Date(Date.UTC(2021, 0, 1) + i * 60_000).toISOString();
        insertMediaItem(db, {
          uploader_member_id: PG_ID, source_filename: `pg-newer-${i}.jpg`, caption: null, uploaded_at: at, tags: [byTag],
        });
      }
      hiddenId = insertMediaItem(db, {
        uploader_member_id: PG_ID, source_filename: 'pg-hidden.jpg', caption: 'hidden',
        uploaded_at: '2022-01-01T00:00:00.000Z', tags: [byTag, HIDDEN_TAG],
      });
      insertMemberGallery(db, {
        id: PERSONAL_ID, owner_member_id: PG_ID, name: 'Personal Gallery', is_default: 1,
        sort_order: 'upload_desc', created_by: PG_ID,
      });
      const tagId = (db.prepare('SELECT id FROM tags WHERE tag_normalized = ?').get(byTag) as { id: string }).id;
      insertGalleryCriterionTag(db, PERSONAL_ID, tagId);
      const hiddenTagId = (db.prepare('SELECT id FROM tags WHERE tag_normalized = ?').get(HIDDEN_TAG) as { id: string }).id;
      insertGalleryExcludeTag(db, PERSONAL_ID, hiddenTagId);
    } finally { db.close(); }
  });

  async function save(mediaId: string, tags = ''): Promise<string> {
    const res = await request(createApp())
      .post(`/members/${PG_SLUG}/media/${mediaId}/edit`)
      .set('Cookie', cookieFor(PG_ID))
      .type('form')
      .send({ caption: 'edited', tags, externalUrl: '' });
    expect(res.status).toBe(303);
    return res.headers.location as string;
  }

  // Defect caught: saving an item the Personal Gallery excludes sends the
  // member to that gallery's page for the item, which is not found, instead
  // of to the item's own page.
  it('lands on the item\'s own page when the Personal Gallery excludes it', async () => {
    const outside = await save(hiddenId, HIDDEN_TAG);
    expect(outside).toBe(`/media/item/${hiddenId}`);
    expect((await request(createApp()).get(outside).set('Cookie', cookieFor(PG_ID))).status).toBe(200);
  });

  // Defect caught: an item further down the gallery than one query window is
  // treated as outside it, so the member lands on the item's own page instead
  // of inside the gallery that pages through to it.
  it('lands inside the Personal Gallery for an item past the first query window', async () => {
    const inside = await save(oldestId);
    expect(inside).toBe(`/media/${PERSONAL_ID}/${oldestId}`);
    expect((await request(createApp()).get(inside).set('Cookie', cookieFor(PG_ID))).status).toBe(200);
  });
});
