/**
 * E2E regression suite. Five deliberately small tests:
 *
 *   1. Avatar upload happy path against the real image worker. The
 *      May 2026 bug was that imageWorker.ts didn't import dotenv, so
 *      the worker never saw INTERNAL_EVENT_SECRET and rejected every
 *      upload with 503. No stubbed-adapter test could have caught it.
 *
 *   2. Public nav reachability — one looping test that GETs every
 *      top-level public surface and asserts no Service Unavailable
 *      page renders. As nav surfaces fill in over time, more pages
 *      get added to the array, NOT to the test count. Don't click
 *      every item inside a page; that's supertest territory.
 *
 *   3. Authenticated owner edit — one logged-in render of the edit
 *      page. Proves the JWT signing seam survives a real browser
 *      request end-to-end (the chain that "stubbed-adapter" tests
 *      cannot prove).
 *
 *   4. Share Media — a member shares four real photos with one hashtag
 *      and names it as a gallery; the test asserts all four appear in
 *      it AND their bytes actually serve. A media row with no
 *      media-store bytes renders a broken image; only a real share
 *      proves the store path end-to-end.
 *
 *   5. Curator Share Media — an administrator uploads two real clips on
 *      the Video file tab, one into a new Footbag Hacky gallery, through
 *      the site's own video pipeline; the gallery holds the clip carrying
 *      its hashtags and the poster serves.
 *
 * The adapter-misconfig integration suite covers failure-mode contracts
 * (worker down → 503, worker 503 → 503, generic error → 500) at supertest
 * speed. This file only covers the success paths that need two real
 * processes talking over HTTP.
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import sharp from 'sharp';
import { seedAdmin, seedTier1Member } from '../fixtures/personas';
import { authenticateContext } from './helpers/wizard-auth';
import { completeOnboarding } from '../../src/testkit/personaRowBuilders';
import { insertFreestyleTrick } from '../fixtures/factories';
import { ensureSystemMember, openLiveDb } from './helpers/liveDb';

// The curator journey credits its uploads to the system member.
test.beforeAll(() => ensureSystemMember());

test('Tier-1 member uploads avatar end-to-end against real image worker', { tag: ['@smoke'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier1Member(db, { slug: `e2e_avatar_${Date.now()}` });
  db.close();

  const context = await browser.newContext();
  await authenticateContext(context, baseURL!, persona);

  const page = await context.newPage();
  await page.goto(`/members/${persona.slug}/edit`);
  await expect(page.locator('text=Service Unavailable')).toHaveCount(0);

  // 256x256 red JPEG: within the accepted dimension limits, well under AVATAR_MAX_BYTES.
  const jpegBytes = await sharp({
    create: { width: 256, height: 256, channels: 3, background: { r: 255, g: 0, b: 0 } },
  }).jpeg().toBuffer();

  await page.locator('input[type=file][name=avatar]').setInputFiles({
    name: 'e2e.jpg',
    mimeType: 'image/jpeg',
    buffer: jpegBytes,
  });

  const responsePromise = page.waitForResponse(
    (r) => r.url().includes(`/members/${persona.slug}/avatar`) && r.request().method() === 'POST',
  );
  await page.locator('form.avatar-edit-form button[type=submit]').first().click();
  const uploadRes = await responsePromise;

  // Pre-fix: 500 status with a 503-labeled body. Post-fix: 302 to the
  // edit page (or 200 if redirects are auto-followed).
  expect(uploadRes.status()).toBeGreaterThanOrEqual(200);
  expect(uploadRes.status()).toBeLessThan(400);
  await expect(page.locator('text=Service Unavailable')).toHaveCount(0);

  await context.close();
});

// The committed test media (src/testkit/assets/): real phone photos and short
// clips, so a share exercises the image worker and the video pipeline on real
// files rather than generated ones.
const ASSETS = path.join(process.cwd(), 'src', 'testkit', 'assets');

test('Tier-1 member shares four real photos and names their hashtags as a gallery', { tag: ['@smoke'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const slug = `e2e_gallery_${Date.now()}`;
  const persona = seedTier1Member(db, { slug });
  // The /members/*/media/upload page is behind the onboarding gate, so an
  // un-onboarded member is redirected to the wizard and the form never renders.
  completeOnboarding(db, persona.memberId);
  db.close();

  const context = await browser.newContext();
  await authenticateContext(context, baseURL!, persona);
  const page = await context.newPage();

  // Four photos at once, the default photos-per-submit, one hashtag for all,
  // and a gallery named from it, through the Share Media form a member uses.
  await page.goto(`/members/${slug}/media/upload`);
  await page.locator('#share-photo-files').setInputFiles(
    ['fb_182a.jpg', 'fb_182b.jpg', 'fb_182c.jpg', 'collection.jpg'].map((f) => path.join(ASSETS, f)),
  );
  await page.locator('#share-tags').fill('footbags');
  await page.locator('#share-gallery-name').pressSequentially('Footbags');
  const galleryId = `gallery_${slug}_footbags`;
  // The form's own preview, which the server checks, names the gallery's address.
  await expect(page.locator('[data-share-preview]')).toContainText(`/media/${galleryId}`);
  const shared = page.waitForResponse(
    (r) => r.url().includes(`/members/${slug}/media/upload`) && r.request().method() === 'POST',
  );
  await page.locator('form[data-share-form] button[type=submit]').click();
  expect((await shared).status()).toBe(303);

  // All four show in the new gallery and their bytes serve from the media
  // store: a row with no bytes renders a broken image with naturalWidth 0.
  await page.goto(`/media/${galleryId}`);
  const images = page.locator('.gallery-grid .gallery-tile img');
  await expect(images).toHaveCount(4);
  for (const img of await images.all()) {
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }

  await context.close();
});

test('the curator uploads two real video clips, one into a new Footbag Hacky gallery', { tag: ['@smoke'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const admin = seedAdmin(db);
  db.close();

  const context = await browser.newContext();
  await authenticateContext(context, baseURL!, admin);
  const page = await context.newPage();

  // Each clip on the Video file tab with its poster, through the curator's
  // Share Media form and the site's own video pipeline.
  const upload = async (clip: string, poster: string, tags: string, gallery: string) => {
    await page.goto('/admin/curator/upload');
    await page.locator('label[for="share-tab-file"]').click();
    await page.locator('#share-video-file').setInputFiles(path.join(ASSETS, clip));
    await page.locator('#share-poster').setInputFiles(path.join(ASSETS, poster));
    // The stack writes curated files (to a throwaway tree), so each upload
    // names the category directory it lands in.
    await page.locator('#share-new-category').fill('e2e_videos');
    await page.locator('#share-tags').fill(tags);
    if (gallery) await page.locator('#share-gallery-name').pressSequentially(gallery);
    const done = page.waitForResponse((r) => r.url().endsWith('/admin/curator/upload') && r.request().method() === 'POST');
    await page.locator('form[data-share-form] button[type=submit]').click();
    expect((await done).status()).toBe(303);
    await expect(page.locator('.form-success-banner')).toBeVisible();
  };
  await upload('chinlone_clip.mp4', 'chinlone_poster.jpg', 'chinlone', '');
  await upload('baganrally_clip.mp4', 'baganrally_poster.jpg', '#chinlone #club_wellington', 'Wellington Chinlone');

  // The new gallery holds the clip carrying both its hashtags, and not the
  // one carrying only #chinlone; its poster serves.
  await page.goto('/media/gallery_wellington_chinlone');
  const tiles = page.locator('.gallery-grid .gallery-tile');
  await expect(tiles).toHaveCount(1);
  await expect(tiles.locator('.gallery-tile-video')).toHaveCount(1);
  await expect.poll(() => tiles.locator('img').first().evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  await context.close();
});

// Top-level public surfaces. As each section grows real content, add
// the path to this array; do NOT split into per-path tests. The point
// is "does the page render at all," not "does every button work."
const PUBLIC_NAV_PATHS = [
  '/',
  '/events',
  '/clubs',
  '/net',
  '/freestyle',
  '/x-square',
  '/golf',
  '/consecutives',
  '/sideline',
  '/rules',
  '/equipment',
  '/hof',
  '/bap',
  '/media',
];

test('Public nav surfaces all render without Service Unavailable', { tag: ['@smoke'] }, async ({ page }) => {
  for (const navPath of PUBLIC_NAV_PATHS) {
    const res = await page.goto(navPath);
    expect(res?.status() ?? 500, `${navPath} status`).toBeLessThan(500);
    await expect(page.locator('div.error-page'), `${navPath} error-page`).toHaveCount(0);
  }
});

// The freestyle public walk: landing, dictionary index, one seeded trick
// detail, the trick records, glossary, Freestyle Concepts, learn, and the
// media hub. One
// looping test in this file's nav-reachability style: does each page render
// with its main content, not does every control work.
test('Freestyle public surfaces render end-to-end for an anonymous visitor', { tag: ['@smoke'] }, async ({ page }) => {
  const db = openLiveDb();
  const slug = `e2e_fs_walk_${Date.now()}`;
  insertFreestyleTrick(db, {
    slug, canonical_name: `e2e fs walk ${Date.now()}`, adds: '3',
    trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'curated', is_active: 1,
  });
  db.close();

  const walk = [
    '/freestyle',
    '/freestyle/tricks',
    `/freestyle/tricks/${slug}`,
    '/freestyle/records',
    '/freestyle/glossary',
    '/freestyle/concepts',
    '/freestyle/start',
    '/freestyle/media',
  ];
  for (const walkPath of walk) {
    const res = await page.goto(walkPath);
    expect(res?.status() ?? 500, `${walkPath} status`).toBeLessThan(500);
    await expect(page.locator('div.error-page'), `${walkPath} error-page`).toHaveCount(0);
    await expect(page.locator('h1').first(), `${walkPath} h1`).toBeVisible();
  }
});

test('Authenticated owner can render their own edit page', { tag: ['@smoke'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier1Member(db, { slug: `e2e_edit_${Date.now()}` });
  db.close();

  const context = await browser.newContext();
  await authenticateContext(context, baseURL!, persona);

  const page = await context.newPage();
  const res = await page.goto(`/members/${persona.slug}/edit`);
  // Pre-fix: a redirect chain to /login meant page.goto's final status
  // was 200 on /login, masking the auth failure. Assert the final URL
  // sat on the edit page, not /login.
  expect(res?.status() ?? 500).toBeLessThan(500);
  expect(page.url()).toContain(`/members/${persona.slug}/edit`);
  await expect(page.locator('div.error-page')).toHaveCount(0);

  await context.close();
});
