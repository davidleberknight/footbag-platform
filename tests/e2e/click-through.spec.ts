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
 *      and names it as a gallery; the test asserts all four appear in it
 *      AND their bytes actually serve, and that a cover chosen on the
 *      gallery edit form heads the gallery's cards and becomes its share
 *      image. A media row with no
 *      media-store bytes renders a broken image; only a real share
 *      proves the store path end-to-end.
 *
 *   5. Curator Share Media — an administrator uploads two real clips on
 *      the Video file tab, one into a new Footbag Hacky gallery, through
 *      the site's own video pipeline; the gallery holds the clip carrying
 *      its hashtags and the poster serves, and the club the clip is tagged
 *      with shows it on its page.
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
import {
  insertClub, insertFreestyleTrick, insertPersonaNamedGallery, insertTag,
} from '../fixtures/factories';
import { ensureSystemMember, openLiveDb } from './helpers/liveDb';

// The club the shared clip is tagged with. Its hashtag is fixed; its row is
// seeded once per stack, whichever spec gets there first.
const WELLINGTON_TAG = '#club_wellington';

/**
 * The club Wellington Hack Crew, seeded before any upload names its hashtag,
 * so the upload attaches the standard tag rather than minting a free-form one.
 */
function ensureWellington(): void {
  const db = openLiveDb();
  try {
    const tagExists = (tag: string): boolean =>
      db.prepare('SELECT 1 FROM tags WHERE tag_normalized = ?').get(tag) !== undefined;
    if (!tagExists(WELLINGTON_TAG)) {
      const tagId = insertTag(db, { tag_normalized: WELLINGTON_TAG, standard_type: 'club' });
      insertClub(db, {
        name: 'Wellington Hack Crew',
        city: 'Wellington',
        country: 'New Zealand',
        hashtag_tag_id: tagId,
      });
    }
  } finally {
    db.close();
  }
}

// The curator journey credits its uploads to the system member.
test.beforeAll(() => {
  ensureSystemMember();
  ensureWellington();
});

// The media item ids the tiles under a locator open, read from their links: the
// last path segment, whether the tile opens /media/item/<id> or the item inside
// its gallery (/media/<galleryId>/<id>).
async function tileItemIds(tiles: import('@playwright/test').Locator): Promise<string[]> {
  const hrefs = await tiles.locator('a.gallery-tile-media').evaluateAll(
    (links) => links.map((a) => a.getAttribute('href') ?? ''));
  return hrefs.map((h) => h.split('?')[0].split('/').pop() ?? h);
}

// Every image under a locator decoded real bytes: a missing or broken
// rendition leaves naturalWidth at 0.
async function expectImagesDecoded(images: import('@playwright/test').Locator): Promise<void> {
  for (const img of await images.all()) {
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
}

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
  // A second gallery holding everything the member shares, as the gallery_owner
  // persona's Shred Reel does, so a cover chosen for one gallery is seen not to move
  // another's.
  const reelId = `gallery_${slug}_reel`;
  insertPersonaNamedGallery(db, { galleryId: reelId, ownerMemberId: persona.memberId, ownerSlug: slug, name: 'Shred Reel' });
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
  await expectImagesDecoded(images);

  // The gallery card image before any choice is the newest photo's thumbnail.
  await page.goto(`/members/${slug}/galleries`);
  const listCover = page.locator(`tr:has(a[href="/media/${galleryId}"]) img.gallery-list-cover`);
  const newestThumb = await listCover.getAttribute('src');

  // On the edit form every photo offers itself as the cover, and the newest
  // photo is the choice until another is saved.
  await page.goto(`/members/${slug}/galleries/${galleryId}/edit`);
  const coverForm = page.locator('form:has(input[name="coverMediaId"])');
  // Catches: a gallery whose cover starts as some arbitrary photo rather than
  // following the newest.
  await expect(coverForm.locator('input[name="coverMediaId"][value=""]')).toBeChecked();
  const cells = coverForm.locator('.picker-cell:has(input[name="coverMediaId"])');
  // Catches: a photo of the gallery that cannot be chosen as its cover.
  await expect(cells).toHaveCount(4);
  let chosenId = '';
  let chosenThumb = '';
  for (const cell of await cells.all()) {
    const thumb = (await cell.locator('img').getAttribute('src')) ?? '';
    if (thumb !== newestThumb) {
      chosenThumb = thumb;
      chosenId = (await cell.locator('input[name="coverMediaId"]').getAttribute('value')) ?? '';
      await cell.locator('input[name="coverMediaId"]').check();
      break;
    }
  }
  expect(chosenId, 'a photo other than the newest to choose').not.toBe('');
  const saved = page.waitForResponse(
    (r) => r.url().endsWith(`/galleries/${galleryId}/edit`) && r.request().method() === 'POST',
  );
  await coverForm.locator('.form-actions button[type=submit]').click();
  // Catches: the real form's save refused or failing.
  expect((await saved).status()).toBeLessThan(400);

  // The chosen photo now heads the gallery's card on the public list, in My
  // Galleries and on the owner's profile, and its bytes serve on each.
  const coverSurfaces: Array<[string, string]> = [
    ['/media/member-galleries', `.card:has(a.card-title[href="/media/${galleryId}"]) img.card-cover`],
    [`/members/${slug}/galleries`, `tr:has(a[href="/media/${galleryId}"]) img.gallery-list-cover`],
    [`/members/${slug}`, `.card:has(a.card-title[href="/media/${galleryId}"]) img.card-cover`],
  ];
  for (const [surface, selector] of coverSurfaces) {
    await page.goto(surface);
    const cover = page.locator(selector);
    // Catches: a saved cover ignored, the card still showing the newest photo.
    await expect(cover, `${surface} cover`).toHaveAttribute('src', chosenThumb);
    await expectImagesDecoded(cover);
  }
  // Catches: one gallery's chosen cover heading another gallery's card, which
  // still follows its own newest photo.
  await expect(page.locator(`.card:has(a.card-title[href="/media/${reelId}"]) img.card-cover`))
    .toHaveAttribute('src', newestThumb ?? '');

  // The gallery page's share image is the cover's display rendition, as an
  // absolute address a social preview can fetch.
  const liveDb = openLiveDb();
  const { s3_key_display: displayKey } = liveDb
    .prepare('SELECT s3_key_display FROM media_items WHERE id = ?')
    .get(chosenId) as { s3_key_display: string };
  liveDb.close();
  await page.goto(`/media/${galleryId}`);
  const ogImage = (await page.locator('meta[property="og:image"]').getAttribute('content')) ?? '';
  // Catches: a share image that is not the chosen cover's display rendition,
  // or a relative address a social preview cannot fetch.
  expect(ogImage.startsWith(`${baseURL}/`) && ogImage.endsWith(displayKey), ogImage).toBe(true);
  // Catches: a share image address that does not serve an image.
  const ogRes = await page.request.get(ogImage);
  expect(ogRes.status()).toBe(200);
  expect(ogRes.headers()['content-type']).toMatch(/^image\//);

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
    // The server transcodes the clip before it answers, which on a loaded
    // machine outlasts a click's own budget for the navigation it starts; the
    // response wait below, under the test's budget, is what waits for it.
    await page.locator('form[data-share-form] button[type=submit]').click({ noWaitAfter: true });
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
  const wellingtonIds = await tileItemIds(tiles);

  // The club the clip is tagged with links its gallery from its media line,
  // through both its hashtag and the gallery link, and shows no items itself;
  // the gallery the link opens holds the clip.
  const clubGalleryHref = `/media/browse?context=${WELLINGTON_TAG.slice(1)}`;
  await page.goto(`/clubs/${WELLINGTON_TAG.slice(1)}`);
  // Catches: the club's hashtag not leading to its gallery.
  await expect(page.locator(`#club-media a.hashtag[href="${clubGalleryHref}"]`)).toHaveCount(1);
  // Catches: the club page listing individual items that belong in the gallery.
  await expect(page.locator('.gallery-tile')).toHaveCount(0);
  // Catches: the club's gallery link missing or leading elsewhere.
  await page.locator(`#club-media a.action-link[href="${clubGalleryHref}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${clubGalleryHref.replace('?', '\\?')}$`));
  const clubTiles = page.locator('.gallery-grid .gallery-tile');
  // Catches: media carrying the club's hashtag missing from the club's
  // gallery, or the clip without that hashtag shown there.
  expect(await tileItemIds(clubTiles)).toEqual(wellingtonIds);
  // Catches: the clip's tile not marked as a video to play.
  await expect(clubTiles.locator('.gallery-tile-video')).toHaveCount(1);
  // Catches: a gallery tile whose poster does not serve from the media store.
  await expectImagesDecoded(clubTiles.locator('img'));

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
