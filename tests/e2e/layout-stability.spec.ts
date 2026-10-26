/**
 * Pages hold still while they load, and stay whole without JavaScript.
 *
 * The whole-site rendered-style check measures each page once it has settled,
 * with scripts running, so it cannot see two failures a visitor does see. A box
 * a script fills in after the first paint pushes everything below it down the
 * page while the reader is already looking at it. And a form a script rebuilds
 * hides whatever its plain-HTML fields looked like, so a fault in them shows
 * only to a visitor without JavaScript, and as a jump for everyone else while
 * the page loads.
 *
 * The clubs world map is the first case: its picture arrives by a second
 * request, so the box must hold the map's final size from the first paint and
 * must not be drawn at all where no script will fill it. The media hashtag
 * search is the second: its two fields must keep a field's height at phone
 * width before the chip script replaces them.
 */
import { test, expect } from '@playwright/test';
import { insertClub } from '../../src/testkit/personaRowBuilders';
import { openLiveDb } from './helpers/liveDb';

const LAPTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

test.beforeAll(() => {
  // The directory hides any club whose id carries the factory's reserved test
  // prefix, so the one club the map needs takes an ordinary id on this
  // throwaway stack's database.
  const db = openLiveDb();
  insertClub(db, { id: `club-e2e-map-${Date.now()}`, publiclyVisible: true, country: 'Canada', city: 'Map Box City' });
  db.close();
});

test('the clubs map box holds its final size before the map arrives, so the country index never moves', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: LAPTOP, baseURL: baseURL! });
  const page = await context.newPage();

  // Hold the map picture until the page has been measured without it.
  let releaseMap!: () => void;
  const mapHeld = new Promise<void>((resolve) => { releaseMap = resolve; });
  await page.route('**/img/world-map.svg*', async (route) => {
    await mapHeld;
    await route.continue();
  });

  const mapRequested = page.waitForRequest('**/img/world-map.svg*');
  await page.goto('/clubs');
  await mapRequested;

  const box = page.locator('#clubs-map');
  const index = page.locator('.club-country-index');
  const before = {
    boxHeight: (await box.boundingBox())?.height ?? 0,
    boxWidth: (await box.boundingBox())?.width ?? 0,
    indexTop: (await index.boundingBox())?.y ?? -1,
  };
  // An empty box at this point is the jump: the map would push the index down on arrival.
  expect(before.boxHeight, 'map box is drawn at its final size before the map picture arrives').toBeGreaterThan(200);
  // Reserving the height must not shrink the map into a narrow block at one side of the page.
  const columnWidth = (await index.boundingBox())?.width ?? 0;
  expect(Math.abs(before.boxWidth - columnWidth), 'map box spans the content column like the index below it').toBeLessThanOrEqual(1);

  releaseMap();
  await expect(page.locator('#clubs-map .clubs-map-svg')).toBeVisible();
  const after = {
    boxHeight: (await box.boundingBox())?.height ?? 0,
    indexTop: (await index.boundingBox())?.y ?? -1,
  };

  expect(Math.abs(after.boxHeight - before.boxHeight), 'map box keeps its height when the map is drawn into it').toBeLessThanOrEqual(1);
  expect(Math.abs(after.indexTop - before.indexTop), 'country index stays where the reader first saw it').toBeLessThanOrEqual(1);
  await context.close();
});

test('without JavaScript the clubs page draws no empty map box, and the country index still shows', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: LAPTOP, baseURL: baseURL!, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/clubs');

  await expect(page.locator('.club-country-index'), 'the country index is the page without the map').toBeVisible();
  await expect(page.locator('#clubs-map'), 'no script will fill the map box, so it is not drawn').toBeHidden();
  await context.close();
});

test('at phone width the plain hashtag fields keep a field height before any script replaces them', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: PHONE, baseURL: baseURL!, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/media/browse');

  const submit = await page.locator('.browse-search-form button[type="submit"]').boundingBox();
  const fields = page.locator('.browse-search-form .browse-search-input');
  await expect(fields).toHaveCount(2);
  for (const field of await fields.all()) {
    const label = await field.getAttribute('aria-label');
    const rect = await field.boundingBox();
    // A field taller than the button beside it is the column layout reading the
    // row's flex-basis as a height: a visitor sees boxes hundreds of pixels tall.
    expect(rect?.height ?? 0, `${label} is no taller than the Browse button`).toBeLessThanOrEqual(submit?.height ?? 0);
  }
  await context.close();
});
