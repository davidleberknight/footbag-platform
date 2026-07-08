/**
 * Mobile-viewport smoke over the main freestyle public pages.
 *
 * The responsive design contract says every public page works at phone width
 * with wide content scrolling inside its own container, never the page body.
 * This spec drives a phone-sized browser context (no Playwright project or
 * config change) over the landing, the trick dictionary index, one seeded trick
 * detail, the records page, and the glossary, asserting each renders with its
 * main content and without horizontal document overflow. Assertions stay
 * structural; no screenshots.
 */
import { test, expect } from '@playwright/test';
import { insertFreestyleTrick } from '../fixtures/factories';
import { openLiveDb } from './helpers/liveDb';

const PHONE = { width: 390, height: 844 };

test('freestyle public pages render at phone width without horizontal overflow', { tag: ['@smoke'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const slug = `e2e_fs_mobile_${Date.now()}`;
  insertFreestyleTrick(db, {
    slug, canonical_name: `e2e fs mobile ${Date.now()}`, adds: '3',
    trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'curated', is_active: 1,
  });
  db.close();

  const context = await browser.newContext({ viewport: PHONE, baseURL: baseURL! });
  const page = await context.newPage();

  const pages = [
    '/freestyle',
    '/freestyle/tricks',
    `/freestyle/tricks/${slug}`,
    '/records',
    '/freestyle/glossary',
  ];
  const overflows: string[] = [];
  for (const mobilePath of pages) {
    const res = await page.goto(mobilePath);
    expect(res?.status() ?? 500, `${mobilePath} status`).toBeLessThan(500);
    await expect(page.locator('div.error-page'), `${mobilePath} error-page`).toHaveCount(0);
    await expect(page.locator('h1').first(), `${mobilePath} h1`).toBeVisible();

    // Wide content (tables, notation blocks) must scroll inside its own
    // container; the document itself must not scroll horizontally. One pixel
    // of tolerance absorbs rounding.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > PHONE.width + 1) {
      overflows.push(`${mobilePath}: scrollWidth ${scrollWidth} > ${PHONE.width}`);
    }
  }
  await context.close();
  expect(overflows.join('\n'), `horizontal document overflow at phone width:\n${overflows.join('\n')}`).toBe('');
});
