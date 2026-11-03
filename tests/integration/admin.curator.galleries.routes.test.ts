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
process.env.ALLOW_CURATED_SIDECAR_WRITES = '1';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { createTestDb } from '../fixtures/testDb';

import {
  insertMember,
  insertMemberTierGrant,
  insertMemberGallery,
  insertFreeformTag,
  insertGalleryCriterionTag,
  insertGalleryExcludeTag,
  createTestSessionJwt,
  insertSystemConfig,
} from '../fixtures/factories';

// FH-owned gallery edits via POST /admin/curator/galleries/:id/edit now
// write a JSON sidecar to /curated/galleries/<slug>.json after the DB
// transaction commits. Redirect that write to a per-run temp dir so
// the suite never mutates the repo's real /curated/ tree.
let CURATED_TMP_ROOT: string;

const ADMIN_ID    = 'admin-galleries-001';
const ADMIN_SLUG  = 'galleries_admin';
const MEMBER_ID   = 'member-galleries-001';
const MEMBER_SLUG = 'galleries_regular_member';
const SYSTEM_ID   = 'member_footbag_hacky_galleries_test';

const GALLERY_A = 'gallery_test_alpha';
const GALLERY_B = 'gallery_test_beta';

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svcMod: typeof import('../../src/services/curatorMediaService');

/**
 * Name a gallery on the curator Share Media form with nothing else in the
 * submit, sending the preview the page's script would record unless told not
 * to. `agent` keeps the flash cookie for a following GET.
 */
async function nameGallery(
  o: { name: string; tags?: string; slug?: string; sort?: string; exclude?: string; withPreview?: boolean },
  agent?: ReturnType<typeof request.agent>,
  cookie: string = adminCookie(),
) {
  const tags = o.tags ?? '';
  let token = '';
  if (o.withPreview !== false) {
    const p = svcMod.previewNewCuratorGallery(o.name, svcMod.parseTagList(tags), o.slug ?? '', () => false);
    if (!('refusal' in p)) token = svcMod.newGalleryPreviewToken(p);
  }
  return (agent ?? request(createApp())).post('/admin/curator/upload').set('Cookie', cookie)
    .field('mediaType', 'photo')
    .field('tags', tags)
    .field('galleryName', o.name)
    .field('gallerySlug', o.slug ?? '')
    .field('gallerySort', o.sort ?? '')
    .field('galleryExcludeTags', o.exclude ?? '')
    .field('galleryPreview', token);
}

function seedGalleryRow(
  db: BetterSqlite3.Database,
  galleryId: string,
  name: string,
  description: string,
  sortOrder: 'upload_desc' | 'upload_asc' | 'caption_asc',
): void {
  insertMemberGallery(db, {
    id: galleryId,
    owner_member_id: SYSTEM_ID,
    name,
    description,
    is_default: 0,
    sort_order: sortOrder,
    created_at: '2026-01-01T00:00:00Z',
  });
}

function seedTagAndLink(
  db: BetterSqlite3.Database,
  galleryId: string,
  tagDisplay: string,
  table: 'member_gallery_tags' | 'member_gallery_exclude_tags',
): void {
  const norm = tagDisplay.toLowerCase();
  let tagId = (db.prepare('SELECT id FROM tags WHERE tag_normalized = ?').get(norm) as { id: string } | undefined)?.id;
  if (!tagId) {
    tagId = insertFreeformTag(db, {
      id: `tag_${Buffer.from(norm).toString('hex').slice(0, 24)}`,
      tag_normalized: norm,
      tag_display: tagDisplay,
    });
  }
  if (table === 'member_gallery_tags') {
    insertGalleryCriterionTag(db, galleryId, tagId);
  } else {
    insertGalleryExcludeTag(db, galleryId, tagId);
  }
}

beforeAll(async () => {
  const db = createTestDb(TEST_DB_PATH);
  insertMember(db, { id: ADMIN_ID,  slug: ADMIN_SLUG,  display_name: 'Galleries Admin', login_email: 'admin-galleries@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'Galleries Member', login_email: 'member-galleries@example.com' });
  insertMember(db, { id: SYSTEM_ID, slug: 'footbag_hacky_galleries', display_name: 'Footbag Hacky', real_name: 'Footbag Hacky', is_system: 1 });

  // Admin must hold Tier 2+ to pass the assertTier1Benefits
  // defense-in-depth check in curatorMediaService.
  insertMemberTierGrant(db, { member_id: ADMIN_ID, new_tier_status: 'tier2', reason_code: 'purchase.tier2' });

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

  CURATED_TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-admin-galleries-routes-'));
  svcMod = await import('../../src/services/curatorMediaService');
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

  // Defect caught: the controller resolving `getVideoTranscodingAdapter()`
  // and `getImageProcessingAdapter()` eagerly while building its service.
  // Both throw "INTERNAL_EVENT_SECRET not configured" at first resolution
  // when the secret is unset, so every gallery route, read-only ones
  // included, answers 500 on a dev environment without the secret. The
  // test fixture sets the secret, which hides that failure, so this spies
  // on both factories instead.
  it('does not invoke the video or image worker adapter on a read-only gallery list', async () => {
    const videoMod = await import('../../src/adapters/videoTranscodingAdapter');
    const imageMod = await import('../../src/adapters/imageProcessingAdapter');
    const fail = (label: string) => () => {
      throw new Error(`regression: ${label} on /admin/curator/galleries`);
    };
    const videoTranscode = vi.fn(fail('video transcode invoked'));
    const imageProcessAvatar = vi.fn(fail('image processAvatar invoked'));
    const imageProcessPhoto = vi.fn(fail('image processPhoto invoked'));
    const videoSpy = vi.spyOn(videoMod, 'getVideoTranscodingAdapter').mockImplementation(() => ({
      transcode: videoTranscode,
      transcodeFromStorage: vi.fn(fail('video transcodeFromStorage invoked')),
    }));
    const imageSpy = vi.spyOn(imageMod, 'getImageProcessingAdapter').mockImplementation(() => ({
      processAvatar: imageProcessAvatar,
      processPhoto: imageProcessPhoto,
    }));
    try {
      const res = await request(createApp())
        .get('/admin/curator/galleries')
        .set('Cookie', adminCookie());
      expect(res.status).toBe(200);
      expect(videoTranscode).not.toHaveBeenCalled();
      expect(imageProcessAvatar).not.toHaveBeenCalled();
      expect(imageProcessPhoto).not.toHaveBeenCalled();
    } finally {
      videoSpy.mockRestore();
      imageSpy.mockRestore();
    }
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

    expect(res.status).toBe(303);
    // Defect caught: a save lands anywhere but the gallery just changed.
    expect(res.headers.location).toBe(`/media/${GALLERY_A}`);

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
    expect(first.status).toBe(303);
    expect(second.status).toBe(303);
  });

  it('writes an media.curated_gallery_updated audit row scoped to the admin actor', async () => {
    const app = createApp();
    const create = await nameGallery({ name: 'Audit Update Target', tags: '#freestyle' });
    expect(create.status).toBe(303);
    const edit = await request(app)
      .post('/admin/curator/galleries/gallery_audit_update_target/edit')
      .set('Cookie', adminCookie())
      .type('form')
      .send({
        name: 'Audit Update Target',
        description: 'changed',
        sortOrder: 'caption_asc',
        criteriaTags: '#freestyle #curated',
        excludeTags: '',
      });
    expect(edit.status).toBe(303);
    const db = new BetterSqlite3(TEST_DB_PATH);
    const audit = db.prepare(
      `SELECT actor_type, actor_member_id, entity_type FROM audit_entries
       WHERE entity_id = ? AND action_type = 'media.curated_gallery_updated'`,
    ).get('gallery_audit_update_target') as Record<string, unknown> | undefined;
    db.close();
    expect(audit).toBeDefined();
    expect(audit!.actor_type).toBe('admin');
    expect(audit!.actor_member_id).toBe(ADMIN_ID);
    expect(audit!.entity_type).toBe('gallery');
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

  it('FH-owned gallery: empty criteria input is rejected with 422 (galleries are author-defined)', async () => {
    // FH-owned galleries are topic-defined: `#curated` is not auto-added,
    // so an FH gallery, like a member gallery, must declare at least one
    // criteria tag. A curated collection lists `#curated` itself; a topic
    // gallery lists its topic tag. Empty criteria cannot be saved.
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
    expect(res.text).toMatch(/at least one criteria hashtag/i);
  });

  // A hyphen is not a tag character: the typed criterion is folded into the one
  // form and saved, rather than refused, so it matches the media tagged with it.
  it('saves a hyphenated criteria tag in its folded form', async () => {
    const res = await request(createApp())
      .post(`/admin/curator/galleries/${GALLERY_B}/edit`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({
        name: 'Beta Gallery',
        description: '',
        sortOrder: 'upload_desc',
        criteriaTags: '#fold-me-criterion',
        excludeTags: '',
      });
    expect(res.status).toBe(303);
    const db = new BetterSqlite3(TEST_DB_PATH);
    const criteria = (db.prepare(
      `SELECT t.tag_normalized FROM member_gallery_tags g JOIN tags t ON t.id = g.tag_id WHERE g.gallery_id = ?`,
    ).all(GALLERY_B) as { tag_normalized: string }[]).map((r) => r.tag_normalized);
    db.close();
    expect(criteria).toContain('#fold_me_criterion');
    expect(criteria).not.toContain('#fold-me-criterion');
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

function galleryRow(id: string): { name: string; owner_member_id: string; sort_order: string } | undefined {
  const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
  try {
    return db.prepare('SELECT name, owner_member_id, sort_order FROM member_galleries WHERE id = ?').get(id) as
      { name: string; owner_member_id: string; sort_order: string } | undefined;
  } finally { db.close(); }
}

function galleryCriteria(id: string, table: 'member_gallery_tags' | 'member_gallery_exclude_tags' = 'member_gallery_tags'): string[] {
  const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
  try {
    return (db.prepare(`SELECT t.tag_normalized AS tag FROM ${table} g JOIN tags t ON t.id = g.tag_id WHERE g.gallery_id = ?`)
      .all(id) as { tag: string }[]).map((r) => r.tag).sort();
  } finally { db.close(); }
}

describe('retired curator create-gallery routes', () => {
  // Defect caught: a second create page lives on beside the Share Media form,
  // so a curator gallery can be made two ways with two sets of rules.
  it('answers the old create page and its POST with not found', async () => {
    const page = await request(createApp()).get('/admin/curator/galleries/new').set('Cookie', adminCookie());
    expect(page.status).toBe(404);
    const post = await request(createApp()).post('/admin/curator/galleries').set('Cookie', adminCookie())
      .type('form').send({ idSlug: 'retired', name: 'Retired', sortOrder: 'upload_desc', criteriaTags: '#x' });
    expect(post.status).toBe(404);
    expect(galleryRow('gallery_retired')).toBeUndefined();
  });

  // Defect caught: the list's create button leads to the retired page.
  it('links the gallery list\'s create button to the curator Share Media form', async () => {
    const list = await request(createApp()).get('/admin/curator/galleries').set('Cookie', adminCookie());
    expect(list.text).toMatch(/href="\/admin\/curator\/upload" class="btn btn-primary"/);
  });
});

describe('POST /admin/curator/upload: naming a Footbag Hacky gallery', () => {
  // Defect caught: a gallery named on the curator form is not Footbag Hacky's,
  // misses #curated, lands somewhere other than the form, or writes no sidecar
  // where sidecar writes are on.
  it('saves the typed hashtags plus #curated as a Footbag Hacky gallery, writes its sidecar, and reports it on the form', async () => {
    const agent = request.agent(createApp());
    const res = await nameGallery({ name: 'Created On Share', tags: '#freestyle #created' }, agent);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/curator/upload');
    const row = galleryRow('gallery_created_on_share');
    expect(row?.owner_member_id).toBe(SYSTEM_ID);
    expect(row?.sort_order).toBe('upload_desc');
    expect(galleryCriteria('gallery_created_on_share')).toEqual(['#created', '#curated', '#freestyle']);
    const sidecarPath = path.join(CURATED_TMP_ROOT, 'galleries', 'created_on_share.json');
    expect(JSON.parse(fs.readFileSync(sidecarPath, 'utf8'))).toMatchObject({ id: 'gallery_created_on_share' });
    const landed = await agent.get('/admin/curator/upload').set('Cookie', adminCookie());
    expect(/class="form-success-banner"[\s\S]*?<\/div>/.exec(landed.text)?.[0] ?? '').toContain('/media/gallery_created_on_share');
  });

  // Defect caught: a gallery is saved under an address and hashtags the
  // curator was never shown.
  it('shows the address and hashtags first when the submit carries no preview, writing nothing', async () => {
    const res = await nameGallery({ name: 'Needs A Preview', tags: '#preview_first', withPreview: false });
    expect(res.status).toBe(200);
    expect(res.text).toContain('/media/gallery_needs_a_preview');
    expect(res.text).toMatch(/name="galleryPreview" value="gallery_needs_a_preview #curated #preview_first"/);
    expect(galleryRow('gallery_needs_a_preview')).toBeUndefined();
  });

  // Defect caught: the address given under Advanced is ignored, or kept as
  // typed instead of folded by the slug rule.
  it('makes the address from the Advanced slug, folded, with the order and excluded hashtags given there', async () => {
    const res = await nameGallery({
      name: 'A Long Display Name For Tricks', tags: '#trick', slug: 'Short-One', sort: 'caption_asc', exclude: '#deprecated',
    });
    expect(res.status).toBe(303);
    expect(galleryRow('gallery_short_one')?.sort_order).toBe('caption_asc');
    expect(galleryCriteria('gallery_short_one', 'member_gallery_exclude_tags')).toEqual(['#deprecated']);
  });

  // Defect caught: a curator gallery takes over an address another gallery
  // holds, or quietly takes a numbered one the curator never saw.
  it('refuses an address another gallery holds, naming the Advanced field and keeping what was typed', async () => {
    const res = await nameGallery({ name: 'Wants Alpha', tags: '#freestyle', slug: 'test_alpha' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('/media/gallery_test_alpha');
    expect(res.text).toMatch(/name="galleryName"[^>]*value="Wants Alpha"/);
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const named = db.prepare('SELECT COUNT(*) AS n FROM member_galleries WHERE name = ?').get('Wants Alpha') as { n: number };
    db.close();
    expect(named.n).toBe(0);
  });

  // Defect caught: a second gallery under one name, or a repeat of the first
  // submit refused as a clash.
  it('refuses a second gallery under one name with other hashtags, and takes a repeat as the first', async () => {
    expect((await nameGallery({ name: 'Twin Curator Name', tags: '#first_set' })).status).toBe(303);
    const clash = await nameGallery({ name: 'Twin Curator Name', tags: '#second_set', slug: 'twin_other' });
    expect(clash.status).toBe(422);
    expect(galleryRow('gallery_twin_other')).toBeUndefined();
    const repeat = await nameGallery({ name: 'Twin Curator Name', tags: '#first_set' });
    expect(repeat.status).toBe(303);
    expect(galleryCriteria('gallery_twin_curator_name')).toEqual(['#curated', '#first_set']);
  });

  // Defect caught: a name or address of symbols only, or an order the form
  // does not offer, reaches the database.
  it('refuses an address of symbols only and an unknown order, writing nothing', async () => {
    const symbols = await nameGallery({ name: 'Symbol Slug', tags: '#x_tag', slug: '!!!' });
    expect(symbols.status).toBe(422);
    expect(galleryRow('gallery_symbol_slug')).toBeUndefined();
    const sort = await nameGallery({ name: 'Bad Sort', tags: '#x_tag', sort: 'random_garbage' });
    expect(sort.status).toBe(422);
    expect(galleryRow('gallery_bad_sort')).toBeUndefined();
  });

  // Defect caught: a gallery created on the Share form leaves no
  // accountability record naming the admin.
  it('writes a media.curated_gallery_created audit row scoped to the admin actor', async () => {
    expect((await nameGallery({ name: 'Audit Create Target', tags: '#freestyle' })).status).toBe(303);
    const db = new BetterSqlite3(TEST_DB_PATH);
    const audit = db.prepare(
      `SELECT actor_type, actor_member_id, entity_type FROM audit_entries
       WHERE entity_id = ? AND action_type = 'media.curated_gallery_created'`,
    ).get('gallery_audit_create_target') as Record<string, unknown> | undefined;
    db.close();
    expect(audit).toMatchObject({ actor_type: 'admin', actor_member_id: ADMIN_ID, entity_type: 'gallery' });
  });

  // Defect caught: someone other than an admin makes a Footbag Hacky gallery.
  it('sends a visitor to log in and refuses a member with 403, writing nothing', async () => {
    const visitor = await request(createApp()).post('/admin/curator/upload')
      .field('mediaType', 'photo').field('galleryName', 'Visitor Gallery').field('tags', '#x_tag');
    expect(visitor.status).toBe(302);
    expect(visitor.headers.location).toMatch(/\/login/);
    const member = await nameGallery({ name: 'Member Gallery', tags: '#x_tag' }, undefined, memberCookie());
    expect(member.status).toBe(403);
    expect(galleryRow('gallery_member_gallery')).toBeUndefined();
  });
});


describe('POST /admin/curator/galleries/:id/delete', () => {
  it('deletes the gallery + sidecar and redirects with flash', async () => {
    const app = createApp();

    // Create a one-shot target so this test is independent of the others.
    const create = await nameGallery({ name: 'Delete Target', tags: '#freestyle' });
    expect(create.status).toBe(303);

    const sidecarPath = path.join(CURATED_TMP_ROOT, 'galleries', 'delete_target.json');
    expect(fs.existsSync(sidecarPath)).toBe(true);

    const del = await request(app)
      .post('/admin/curator/galleries/gallery_delete_target/delete')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ confirmed: '1' });
    expect(del.status).toBe(303);
    expect(del.headers.location).toBe('/admin/curator/galleries');

    expect(fs.existsSync(sidecarPath)).toBe(false);

    const list = await request(app)
      .get('/admin/curator/galleries')
      .set('Cookie', adminCookie());
    expect(list.text).not.toContain('gallery_delete_target');
  });

  it('a repeated delete by the same admin reports the first delete: 303 to the same list, no 404', async () => {
    // Defect caught: a re-posted delete shows "not found" for a gallery this admin just deleted.
    const app = createApp();
    expect((await nameGallery({ name: 'Repeat Delete Target', tags: '#freestyle' })).status).toBe(303);
    const send = () => request(app)
      .post('/admin/curator/galleries/gallery_repeat_delete_target/delete')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ confirmed: '1' });
    const first = await send();
    expect(first.status).toBe(303);
    const repeat = await send();
    expect(repeat.status).toBe(303);
    expect(repeat.headers.location).toBe('/admin/curator/galleries');
    const db = new BetterSqlite3(TEST_DB_PATH);
    const deletes = (db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries
        WHERE entity_id = ? AND action_type = 'media.curated_gallery_deleted'`,
    ).get('gallery_repeat_delete_target') as { n: number }).n;
    db.close();
    expect(deletes).toBe(1);
  });

  it('returns 404 for an unknown gallery id', async () => {
    const res = await request(createApp())
      .post('/admin/curator/galleries/gallery_does_not_exist/delete')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ confirmed: '1' });
    expect(res.status).toBe(404);
  });

  // The curated list never links a member's own gallery, so this id can only
  // arrive by being posted directly. Answering anything but not-found would let
  // any administrator hard-delete a member's gallery from a surface that exists
  // to manage the curated ones.
  it("returns 404 for a member's own gallery, which is not this surface's to delete", async () => {
    const db = new BetterSqlite3(TEST_DB_PATH);
    insertMemberGallery(db, {
      id: 'gallery_member_owned',
      owner_member_id: MEMBER_ID,
      name: 'Member Set',
    });
    db.close();

    const res = await request(createApp())
      .post('/admin/curator/galleries/gallery_member_owned/delete')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ confirmed: '1' });
    expect(res.status).toBe(404);

    const check = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const still = check.prepare('SELECT id FROM member_galleries WHERE id = ?').get('gallery_member_owned');
    check.close();
    expect(still).toBeDefined();
  });

  // Defect caught: an administrator's own member gallery is hard-deleted from the
  // curated surface, which never lists it, with no owner check of the member route.
  it("returns 404 for the administrator's own member gallery, deleting nothing and auditing nothing", async () => {
    const db = new BetterSqlite3(TEST_DB_PATH);
    insertMemberGallery(db, {
      id: 'gallery_admin_owned',
      owner_member_id: ADMIN_ID,
      name: 'Admin Own Set',
    });
    db.close();

    const res = await request(createApp())
      .post('/admin/curator/galleries/gallery_admin_owned/delete')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ confirmed: '1' });
    expect(res.status).toBe(404);

    const check = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const still = check.prepare('SELECT id, owner_member_id FROM member_galleries WHERE id = ?').get('gallery_admin_owned');
    const audits = (check.prepare(
      "SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = ? AND action_type LIKE 'media.%gallery_deleted'",
    ).get('gallery_admin_owned') as { n: number }).n;
    check.close();
    expect(still).toEqual({ id: 'gallery_admin_owned', owner_member_id: ADMIN_ID });
    expect(audits).toBe(0);
  });

  it('redirects unauthenticated requests to login', async () => {
    const res = await request(createApp())
      .post(`/admin/curator/galleries/${GALLERY_A}/delete`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });

  it('rejects authed-but-not-admin POSTs with 403', async () => {
    const res = await request(createApp())
      .post(`/admin/curator/galleries/${GALLERY_A}/delete`)
      .set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });
});

// Kept last: this block tunes curator_write_rate_limit_per_hour via system_config,
// a latest-effective value that would otherwise throttle gallery POSTs in any
// subsequent describe.
describe('naming a gallery on the curator Share Media form — curator write rate limit', () => {
  it('admin exceeding the curator-write limit -> 429 with Retry-After', async () => {
    const rlMod = await import('../../src/services/rateLimitService');
    rlMod.resetRateLimitForTests();
    const tuneDb = new BetterSqlite3(TEST_DB_PATH);
    insertSystemConfig(tuneDb, {
      config_key: 'curator_write_rate_limit_per_hour',
      value_json: '2',
    });
    tuneDb.close();
    try {
      for (let i = 0; i < 2; i++) {
        const ok = await nameGallery({ name: `Rate Limit Pass ${i}`, tags: '#freestyle' });
        expect(ok.status).toBe(303);
      }
      const blocked = await nameGallery({ name: 'Rate Limit Blocked', tags: '#freestyle' });
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
    } finally {
      rlMod.resetRateLimitForTests();
    }
  });
});
