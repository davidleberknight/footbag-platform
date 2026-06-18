/**
 * E2E regression suite. Four deliberately small tests:
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
 *   4. Named-gallery photo upload — a persona owns an empty named
 *      gallery; the test uploads a photo through the member upload UI
 *      and asserts it appears AND its bytes actually serve. A seeded
 *      media row with no media-store bytes renders a broken image;
 *      only a real upload proves the store path end-to-end.
 *
 * The adapter-misconfig integration suite covers failure-mode contracts
 * (worker down → 503, worker 503 → 503, generic error → 500) at supertest
 * speed. This file only covers the success paths that need two real
 * processes talking over HTTP.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import sharp from 'sharp';
import { seedTier1Member, personaToPlaywrightCookies } from '../fixtures/personas';
import { insertPersonaNamedGallery } from '../../src/testkit/personaRowBuilders';

const DB_PATH_FILE = path.join(process.env.TMPDIR ?? '/tmp', 'footbag-e2e-db-path');

function openLiveDb(): BetterSqlite3.Database {
  const dbPath = fs.readFileSync(DB_PATH_FILE, 'utf8').trim();
  // Must match the path start-stack.sh exports so the test signer and
  // the running app's verifier resolve to the same keypair file.
  process.env.JWT_LOCAL_KEYPAIR_PATH =
    process.env.JWT_LOCAL_KEYPAIR_PATH
    ?? path.join(process.env.TMPDIR ?? '/tmp', 'footbag-e2e-jwt.pem');
  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

test('Tier-1 member uploads avatar end-to-end against real image worker', { tag: ['@smoke'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier1Member(db, { slug: `e2e_avatar_${Date.now()}` });
  db.close();

  const context = await browser.newContext();
  await context.addCookies(personaToPlaywrightCookies(persona, { domain: new URL(baseURL!).hostname }));

  const page = await context.newPage();
  await page.goto(`/members/${persona.slug}/edit`);
  await expect(page.locator('text=Service Unavailable')).toHaveCount(0);

  // 10x10 red JPEG, well under AVATAR_MAX_BYTES.
  const jpegBytes = await sharp({
    create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } },
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

test('Tier-1 member uploads a photo into their named gallery end-to-end', { tag: ['@smoke'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const slug = `e2e_gallery_${Date.now()}`;
  const persona = seedTier1Member(db, { slug });
  const galleryId = `gallery_persona_${slug}`;
  insertPersonaNamedGallery(db, {
    galleryId,
    ownerMemberId: persona.memberId,
    ownerSlug: slug,
    name: 'Highlights Reel',
  });
  db.close();

  const context = await browser.newContext();
  await context.addCookies(personaToPlaywrightCookies(persona, { domain: new URL(baseURL!).hostname }));
  const page = await context.newPage();

  // A fresh deploy seeds the gallery container only, never the media, so the
  // named gallery starts empty.
  await page.goto(`/media/${galleryId}`);
  await expect(page.locator('text=No photos or videos found with this tag')).toBeVisible();

  // Upload a real photo through the member upload UI, exercising the real image
  // worker the same way the avatar test does.
  await page.goto(`/members/${slug}/media/upload`);
  const jpegBytes = await sharp({
    create: { width: 12, height: 12, channels: 3, background: { r: 0, g: 128, b: 255 } },
  }).jpeg().toBuffer();
  await page.locator('input[type=file]#photoFile').setInputFiles({
    name: 'highlight.jpg',
    mimeType: 'image/jpeg',
    buffer: jpegBytes,
  });
  const uploadResponse = page.waitForResponse(
    (r) => r.url().includes(`/members/${slug}/media/upload`) && r.request().method() === 'POST',
  );
  await page.locator('form.upload-form button[type=submit]').first().click();
  const uploadRes = await uploadResponse;
  expect(uploadRes.status()).toBeGreaterThanOrEqual(200);
  expect(uploadRes.status()).toBeLessThan(400);

  // The photo now appears in the previously-empty named gallery and its bytes
  // actually serve from the media store: a seeded row with no bytes (the original
  // bug) would render a broken image with naturalWidth 0. The transcode is async,
  // so poll with reloads until the image is served.
  await expect
    .poll(
      async () => {
        await page.goto(`/media/${galleryId}`);
        const img = page.locator('.gallery-grid .gallery-tile img').first();
        if ((await img.count()) === 0) return 0;
        return img.evaluate((el) => (el as HTMLImageElement).naturalWidth);
      },
      { timeout: 30_000, intervals: [1_000, 2_000, 3_000, 5_000] },
    )
    .toBeGreaterThan(0);

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
  '/sideline',
  '/rules',
  '/records',
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

test('Authenticated owner can render their own edit page', { tag: ['@smoke'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier1Member(db, { slug: `e2e_edit_${Date.now()}` });
  db.close();

  const context = await browser.newContext();
  await context.addCookies(personaToPlaywrightCookies(persona, { domain: new URL(baseURL!).hostname }));

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
