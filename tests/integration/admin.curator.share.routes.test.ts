/**
 * The curator's Share Media form at /admin/curator/upload: the member's form
 * with the curator's differences. It offers photos, a YouTube or Vimeo link and
 * a video file; locks #curated where a member's form locks #by_; suggests
 * Footbag Hacky's galleries and fills the hashtags from one named in
 * ?gallery=; takes several photos in one submit, each with its own caption,
 * within the photos-per-submit setting that holds every uploader; keeps a
 * link's clip range and external URL; and makes a gallery named on it
 * Footbag Hacky's. Where storage is S3 a video file goes up from the browser,
 * and the sign step that starts it keeps the external URL on the job and makes
 * the named gallery first. Runs on a host where sidecar writes are off, so no
 * category or primary slug is asked for.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const TEST_MEDIA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-media-curator-share-'));

const { dbPath } = setTestEnv('4207');
process.env.FOOTBAG_MEDIA_DIR = TEST_MEDIA_DIR;
process.env.FOOTBAG_CURATED_MEDIA_DIR = TEST_MEDIA_DIR;
// Config freezes this at module load, so it is cleared before the app loads.
process.env.ALLOW_CURATED_SIDECAR_WRITES = '0';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import sharp from 'sharp';
import BetterSqlite3 from 'better-sqlite3';

import { insertMember, insertMemberTierGrant, createTestSessionJwt, insertSystemConfig } from '../fixtures/factories';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svcMod: typeof import('../../src/services/curatorMediaService');
let resetImageProcessingAdapterForTests: () => void;
let resetRateLimitForTests: () => void;

const ADMIN_ID  = 'admin-curator-share-001';
const SYSTEM_ID = 'member_footbag_hacky_share_test';

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

async function makeJpeg(r = 40): Promise<Buffer> {
  return sharp({ create: { width: 256, height: 256, channels: 3, background: { r, g: 90, b: 140 } } }).jpeg().toBuffer();
}

function db(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath, { readonly: true });
}

function tokenFor(name: string, tags: string, slug = ''): string {
  const p = svcMod.previewNewCuratorGallery(name, svcMod.parseTagList(tags), slug, () => false);
  if ('refusal' in p) throw new Error(p.refusal);
  return svcMod.newGalleryPreviewToken(p);
}

beforeAll(async () => {
  const d = createTestDb(dbPath);
  insertMember(d, { id: ADMIN_ID, slug: 'curator_share_admin', display_name: 'Curator Share Admin', login_email: 'curator-share@example.com', is_admin: 1 });
  insertMemberTierGrant(d, { member_id: ADMIN_ID, new_tier_status: 'tier2', reason_code: 'purchase.tier2' });
  insertMember(d, { id: SYSTEM_ID, slug: 'footbag_hacky_share', display_name: 'Footbag Hacky', real_name: 'Footbag Hacky', is_system: 1 });
  d.close();

  createApp = await importApp();
  svcMod = await import('../../src/services/curatorMediaService');
  svcMod.setCuratedRootDirForTests(TEST_MEDIA_DIR);
  svcMod.setVideoUrlVerifierForTests(async () => ({ ok: true, status: 200, body: { title: 'share' } }));
  resetRateLimitForTests = (await import('../../src/services/rateLimitService')).resetRateLimitForTests;

  const adapterMod = await import('../../src/adapters/imageProcessingAdapter');
  const imgMod = await import('../../src/lib/imageProcessing');
  resetImageProcessingAdapterForTests = adapterMod.resetImageProcessingAdapterForTests;
  const fakeFetch: typeof fetch = async (_input, init) => {
    const body = init?.body as Buffer | Uint8Array;
    const processed = await imgMod.processPhoto(Buffer.isBuffer(body) ? body : Buffer.from(body));
    return new Response(JSON.stringify({
      thumb: processed.thumb.toString('base64'),
      display: processed.display.toString('base64'),
      widthPx: processed.widthPx,
      heightPx: processed.heightPx,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  adapterMod.setImageProcessingAdapterForTests(
    adapterMod.createHttpImageAdapter({ internalSecret: 'test-internal-event-secret', baseUrl: 'http://test-injected', fetchImpl: fakeFetch }),
  );
});

afterAll(() => {
  resetImageProcessingAdapterForTests();
  svcMod.resetVideoUrlVerifierForTests();
  svcMod.resetCuratedRootDirForTests();
  cleanupTestDb(dbPath);
  try { fs.rmSync(TEST_MEDIA_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('GET /admin/curator/upload', () => {
  // Defect caught: the curator form is not the shared one: a tab missing, the
  // member's #by_ shown instead of #curated, or Footbag Hacky's galleries not
  // offered, so the curator cannot add a gallery's hashtags in one click.
  it('renders the shared form with the curator\'s three tabs, #curated locked and Footbag Hacky\'s galleries offered', async () => {
    const made = await request(createApp()).post('/admin/curator/upload').set('Cookie', adminCookie())
      .field('mediaType', 'photo').field('tags', '#offered_chip').field('galleryName', 'Offered Chip')
      .field('galleryPreview', tokenFor('Offered Chip', '#offered_chip'));
    expect(made.status).toBe(303);
    const res = await request(createApp()).get('/admin/curator/upload').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-share-form');
    for (const value of ['photo', 'url_reference', 'video']) {
      expect(res.text, value).toMatch(new RegExp(`name="mediaType" value="${value}"`));
    }
    expect(res.text).toMatch(/<span class="hashtag">#curated<\/span>/);
    expect(res.text).not.toMatch(/<span class="hashtag">#by_/);
    expect(res.text).toContain('data-tag="#offered_chip"');
    expect(res.text).not.toContain('name="primarySlug"');
  });

  // Defect caught: the edit page's upload link opens the form without the
  // gallery's hashtags, or puts #curated in the field, which the form refuses.
  it('fills the hashtags from the Footbag Hacky gallery named in ?gallery=, leaving out #curated, and ignores any other id', async () => {
    await request(createApp()).post('/admin/curator/upload').set('Cookie', adminCookie())
      .field('mediaType', 'photo').field('tags', '#prefill_one #prefill_two').field('galleryName', 'Prefill Source')
      .field('galleryPreview', tokenFor('Prefill Source', '#prefill_one #prefill_two'));
    const filled = await request(createApp()).get('/admin/curator/upload?gallery=gallery_prefill_source').set('Cookie', adminCookie());
    expect(filled.text).toMatch(/id="share-tags" type="text" name="tags" value="#prefill_one #prefill_two"/);
    const other = await request(createApp()).get('/admin/curator/upload?gallery=gallery_does_not_exist').set('Cookie', adminCookie());
    expect(other.text).toMatch(/id="share-tags" type="text" name="tags" value=""/);
  });
});

describe('POST /admin/curator/upload', () => {
  // Defect caught: the curator form keeps only the last photo of a submit, or
  // gives a photo another photo's caption.
  it('uploads several photos in one submit, each with its own caption and the shared hashtags', async () => {
    const res = await request(createApp()).post('/admin/curator/upload').set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('tags', '#several_at_once')
      .field('caption_for:0', 'several first')
      .field('caption_for:1', 'several second')
      .attach('photoFiles', await makeJpeg(10), 'first.jpg')
      .attach('photoFiles', await makeJpeg(200), 'second.jpg');
    expect(res.status).toBe(303);
    const d = db();
    const rows = d.prepare(`
      SELECT mi.caption, mi.uploader_member_id FROM media_items mi
      JOIN media_tags mt ON mt.media_id = mi.id JOIN tags t ON t.id = mt.tag_id
      WHERE t.tag_normalized = '#several_at_once' ORDER BY mi.caption
    `).all() as { caption: string; uploader_member_id: string }[];
    d.close();
    expect(rows).toEqual([
      { caption: 'several first', uploader_member_id: SYSTEM_ID },
      { caption: 'several second', uploader_member_id: SYSTEM_ID },
    ]);
  });

  // Defect caught: two photos sent under one file name (a phone browser names
  // each image.jpg) fail the whole submit with a server error, losing the
  // report of the first photo already stored, instead of the second being
  // refused by name as a member's would be.
  it('stores the first of two photos sent under one file name and names the second as refused', async () => {
    const agent = request.agent(createApp());
    const res = await agent.post('/admin/curator/upload').set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('tags', '#one_file_name')
      .field('caption_for:0', 'first under one name')
      .field('caption_for:1', 'second under one name')
      .attach('photoFiles', await makeJpeg(61), 'image.jpg')
      .attach('photoFiles', await makeJpeg(62), 'image.jpg');
    expect(res.status).toBe(303);
    const d = db();
    const rows = d.prepare(`SELECT caption FROM media_items WHERE source_filename = 'image.jpg' AND uploader_member_id = ?`)
      .all(SYSTEM_ID) as { caption: string }[];
    d.close();
    expect(rows).toEqual([{ caption: 'first under one name' }]);
    const landed = await agent.get(res.headers.location).set('Cookie', adminCookie());
    expect(landed.text).toMatch(/class="form-success-banner"/);
    expect(landed.text).toMatch(/class="form-error-banner"[^]*image\.jpg/);
  });

  // Defect caught: the curator skips the photos-per-submit setting, so one
  // curator submit can hold more than the web container is sized for.
  it('holds the curator to the photos-per-submit setting, writing nothing', async () => {
    const d = new BetterSqlite3(dbPath);
    insertSystemConfig(d, { config_key: 'photo_upload_max_files_per_submit', value_json: '1', created_at: '2026-03-01T00:00:00.000Z' });
    d.close();
    try {
      const res = await request(createApp()).post('/admin/curator/upload').set('Cookie', adminCookie())
        .field('mediaType', 'photo')
        .field('tags', '#over_the_count')
        .attach('photoFiles', await makeJpeg(11), 'a.jpg')
        .attach('photoFiles', await makeJpeg(12), 'b.jpg');
      expect(res.status).toBe(422);
      const r = db();
      const n = r.prepare(`SELECT COUNT(*) AS n FROM tags WHERE tag_normalized = '#over_the_count'`).get() as { n: number };
      r.close();
      expect(n.n).toBe(0);
    } finally {
      const reset = new BetterSqlite3(dbPath);
      insertSystemConfig(reset, { config_key: 'photo_upload_max_files_per_submit', value_json: '4', created_at: '2026-03-01T00:00:01.000Z' });
      reset.close();
    }
  });

  // Defect caught: a link's clip range or external URL is dropped on upload,
  // so the curator has to edit every clip after uploading it.
  it('keeps a link\'s caption, clip range and external URL, taking the platform from the link', async () => {
    const url = 'https://www.youtube.com/watch?v=CLIPRANGE01';
    const res = await request(createApp()).post('/admin/curator/upload').set('Cookie', adminCookie())
      .field('mediaType', 'url_reference')
      .field('videoUrl', url)
      .field('videoCaption', 'clip range demo')
      .field('startSeconds', '12')
      .field('endSeconds', '40')
      .field('externalUrl', 'https://example.com/clip-source')
      .field('tags', '#clip_range');
    expect(res.status).toBe(303);
    const d = db();
    const row = d.prepare('SELECT caption, video_platform, start_seconds, end_seconds, external_url FROM media_items WHERE video_url = ?')
      .get(url) as Record<string, unknown>;
    d.close();
    expect(row).toEqual({
      caption: 'clip range demo', video_platform: 'youtube', start_seconds: 12, end_seconds: 40,
      external_url: 'https://example.com/clip-source',
    });
  });

  // Defect caught: a clip start that is not a whole number of seconds reaches
  // the database, or is silently dropped.
  it('refuses a clip start that is not a whole number of seconds, writing nothing', async () => {
    const url = 'https://www.youtube.com/watch?v=CLIPBAD0001';
    const res = await request(createApp()).post('/admin/curator/upload').set('Cookie', adminCookie())
      .field('mediaType', 'url_reference').field('videoUrl', url).field('startSeconds', '1.5').field('tags', '#clip_bad');
    expect(res.status).toBe(422);
    const d = db();
    expect(d.prepare('SELECT id FROM media_items WHERE video_url = ?').get(url)).toBeUndefined();
    d.close();
  });

  // Defect caught: photos shared with a named gallery do not carry its
  // hashtags, so they never show in the gallery made for them.
  it('makes the named gallery and gives the photos its hashtags in one submit', async () => {
    const res = await request(createApp()).post('/admin/curator/upload').set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('galleryName', 'Made With Photos')
      .field('galleryPreview', tokenFor('Made With Photos', ''))
      .attach('photoFiles', await makeJpeg(77), 'with-gallery.jpg');
    expect(res.status).toBe(303);
    const d = db();
    const owner = d.prepare('SELECT owner_member_id FROM member_galleries WHERE id = ?').get('gallery_made_with_photos') as { owner_member_id: string };
    const tagged = d.prepare(`
      SELECT COUNT(*) AS n FROM media_items mi JOIN media_tags mt ON mt.media_id = mi.id JOIN tags t ON t.id = mt.tag_id
      WHERE mi.source_filename = 'with-gallery.jpg' AND t.tag_normalized = '#made_with_photos'
    `).get() as { n: number };
    d.close();
    expect(owner.owner_member_id).toBe(SYSTEM_ID);
    expect(tagged.n).toBe(1);
  });

  function setCuratorLimit(value: string, createdAt: string): void {
    const d = new BetterSqlite3(dbPath);
    insertSystemConfig(d, { config_key: 'curator_write_rate_limit_per_hour', value_json: value, created_at: createdAt });
    d.close();
  }

  function photoCount(filename: string): number {
    const d = db();
    const n = (d.prepare('SELECT COUNT(*) AS n FROM media_items WHERE source_filename = ?').get(filename) as { n: number }).n;
    d.close();
    return n;
  }

  // Defect caught: the curator's write limit reached partway through a
  // submit answers with a server error, though the photos before it and the
  // gallery were already saved, and the rest are never named.
  it('keeps the photos saved before the curator write limit and names the rest', async () => {
    resetRateLimitForTests();
    // One slot for the gallery, one for the first photo.
    setCuratorLimit('2', '2026-03-02T00:00:00.000Z');
    try {
      const agent = request.agent(createApp());
      const res = await agent.post('/admin/curator/upload').set('Cookie', adminCookie())
        .field('mediaType', 'photo')
        .field('tags', '#limit_partway')
        .field('galleryName', 'Limit Partway')
        .field('galleryPreview', tokenFor('Limit Partway', '#limit_partway'))
        .attach('photoFiles', await makeJpeg(51), 'before-limit.jpg')
        .attach('photoFiles', await makeJpeg(52), 'past-limit.jpg');
      expect(res.status).toBe(303);
      expect(photoCount('before-limit.jpg')).toBe(1);
      expect(photoCount('past-limit.jpg')).toBe(0);
      const landed = await agent.get(res.headers.location).set('Cookie', adminCookie());
      expect(landed.text).toMatch(/class="form-error-banner"[^]*past-limit\.jpg/);
      expect(landed.text).toContain('/media/gallery_limit_partway');
    } finally {
      setCuratorLimit('60', '2026-03-02T00:00:01.000Z');
      resetRateLimitForTests();
    }
  });

  // Defect caught: the curator's write limit stopping the first photo of a
  // submit with no gallery answers with a server error rather than the form
  // with its refusal and a Retry-After.
  it('refuses with 429 and names the photos when the curator write limit stops the first one', async () => {
    resetRateLimitForTests();
    setCuratorLimit('1', '2026-03-03T00:00:00.000Z');
    try {
      const spent = await request(createApp()).post('/admin/curator/upload').set('Cookie', adminCookie())
        .field('mediaType', 'photo')
        .field('tags', '#limit_first')
        .attach('photoFiles', await makeJpeg(55), 'limit-spend.jpg');
      expect(spent.status).toBe(303);
      const res = await request(createApp()).post('/admin/curator/upload').set('Cookie', adminCookie())
        .field('mediaType', 'photo')
        .field('tags', '#limit_first')
        .attach('photoFiles', await makeJpeg(53), 'limit-first.jpg');
      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
      expect(res.text).toMatch(/class="form-error-banner"[^]*limit-first\.jpg/);
      expect(res.text).toContain(svcMod.SHARE_CHOOSE_AGAIN);
      expect(photoCount('limit-first.jpg')).toBe(0);
    } finally {
      setCuratorLimit('60', '2026-03-03T00:00:01.000Z');
      resetRateLimitForTests();
    }
  });

  // Defect caught: a link refused for the item is found only after the named
  // gallery is written, so a refused share leaves a gallery behind.
  it('refuses an external URL before writing the named gallery', async () => {
    const res = await request(createApp()).post('/admin/curator/upload').set('Cookie', adminCookie())
      .field('mediaType', 'photo')
      .field('tags', '#bad_link_gallery')
      .field('externalUrl', 'javascript:alert(1)')
      .field('galleryName', 'Bad Link Gallery')
      .field('galleryPreview', tokenFor('Bad Link Gallery', '#bad_link_gallery'))
      .attach('photoFiles', await makeJpeg(54), 'bad-link.jpg');
    expect(res.status).toBe(422);
    const d = db();
    expect(d.prepare('SELECT id FROM member_galleries WHERE id = ?').get('gallery_bad_link_gallery')).toBeUndefined();
    d.close();
    expect(photoCount('bad-link.jpg')).toBe(0);
  });
});

describe('the declared-size bound on a Share Media submit', () => {
  // Defect caught: a submit far over "Total per submit" is read into memory
  // before anything checks its size, or a legitimate video file on the
  // curator's local form is refused as too many photos.
  it('refuses a declared size past the total plus framing, and lets a video file through where the form takes one', () => {
    const MB = 1024 * 1024;
    const total = svcMod.photoMaxSubmitBytes();
    expect(svcMod.shareBodyRefusal(total + 2 * MB, { allowsVideoFile: false })).not.toBeNull();
    expect(svcMod.shareBodyRefusal(total, { allowsVideoFile: false })).toBeNull();
    expect(svcMod.shareBodyRefusal(Number.NaN, { allowsVideoFile: false })).toBeNull();
    expect(svcMod.shareBodyRefusal(total + 2 * MB, { allowsVideoFile: true })).toBeNull();
    expect(svcMod.shareBodyRefusal(svcMod.VIDEO_MAX_BYTES + svcMod.POSTER_MAX_BYTES + 2 * MB, { allowsVideoFile: true }))
      .toBe(svcMod.VIDEO_TOO_LARGE_MESSAGE);
  });
});

describe('POST /admin/curator/upload/sign', () => {
  function body(overrides: Record<string, unknown> = {}) {
    return {
      videoFilename: 'sign-clip.mp4',
      videoContentType: 'video/mp4',
      videoSizeBytes: 5 * 1024 * 1024,
      posterContentType: 'image/jpeg',
      posterSizeBytes: 100 * 1024,
      caption: 'a signed clip',
      tags: '#signed_clip',
      ...overrides,
    };
  }
  function job(id: string): Record<string, unknown> | undefined {
    const d = db();
    const row = d.prepare('SELECT tags, external_url FROM media_jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    d.close();
    return row;
  }

  // Defect caught: a video sent straight to storage loses its external URL,
  // or one the form would refuse is kept.
  it('keeps the external URL on the job, and refuses a link the form would refuse', async () => {
    const ok = await request(createApp()).post('/admin/curator/upload/sign').set('Cookie', adminCookie())
      .send(body({ externalUrl: 'https://example.com/signed-source' }));
    expect(ok.status).toBe(200);
    expect(job(ok.body.jobId)?.external_url).toBe('https://example.com/signed-source');
    const bad = await request(createApp()).post('/admin/curator/upload/sign').set('Cookie', adminCookie())
      .send(body({ externalUrl: 'javascript:alert(1)' }));
    expect(bad.status).toBe(400);
  });

  // Defect caught: a gallery named on the video-file tab is never made, or is
  // made under an address the curator was not shown.
  it('makes a gallery named on the video-file tab when the preview matches, and refuses a stale one making nothing', async () => {
    const ok = await request(createApp()).post('/admin/curator/upload/sign').set('Cookie', adminCookie())
      .send(body({ galleryName: 'Signed Gallery', tags: '#signed_gallery', galleryPreview: tokenFor('Signed Gallery', '#signed_gallery') }));
    expect(ok.status).toBe(200);
    expect(job(ok.body.jobId)?.tags).toBe('#signed_gallery');
    const d = db();
    const made = d.prepare('SELECT owner_member_id FROM member_galleries WHERE id = ?').get('gallery_signed_gallery') as { owner_member_id: string } | undefined;
    d.close();
    expect(made?.owner_member_id).toBe(SYSTEM_ID);

    const stale = await request(createApp()).post('/admin/curator/upload/sign').set('Cookie', adminCookie())
      .send(body({ galleryName: 'Stale Gallery', tags: '#stale_gallery', galleryPreview: 'gallery_something_else #curated' }));
    expect(stale.status).toBe(400);
    const s = db();
    expect(s.prepare('SELECT id FROM member_galleries WHERE id = ?').get('gallery_stale_gallery')).toBeUndefined();
    expect(s.prepare(`SELECT id FROM media_jobs WHERE tags = '#stale_gallery'`).get()).toBeUndefined();
    s.close();
  });

  // Defect caught: a video file the sign step refuses for its type, its size
  // or its external URL is found only after the named gallery is written, so
  // a refused upload leaves a gallery behind.
  it('refuses a video the sign step would refuse before writing the named gallery', async () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['Refused Type Gallery', { videoContentType: 'video/x-flv' }],
      ['Refused Size Gallery', { videoSizeBytes: svcMod.VIDEO_MAX_BYTES + 1 }],
      ['Refused Link Gallery', { externalUrl: 'javascript:alert(1)' }],
    ];
    for (const [name, overrides] of cases) {
      const tags = `#${name.toLowerCase().replace(/ /g, '_')}`;
      const res = await request(createApp()).post('/admin/curator/upload/sign').set('Cookie', adminCookie())
        .send(body({ galleryName: name, tags, galleryPreview: tokenFor(name, tags), ...overrides }));
      expect(res.status, name).toBe(400);
      const d = db();
      const id = `gallery_${name.toLowerCase().replace(/ /g, '_')}`;
      expect(d.prepare('SELECT id FROM member_galleries WHERE id = ?').get(id), name).toBeUndefined();
      d.close();
    }
  });
});
