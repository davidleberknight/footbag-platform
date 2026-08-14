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
 *
 * A second spec covers the two authenticated pages whose tables carry controls
 * in their rightmost columns: the member payment history and the gallery
 * editor. There the contract is stronger than "no overflow" — the table has to
 * scroll inside its own container, because a clipped table leaves the cancel
 * and row-action controls present in the DOM and unreachable on a phone.
 */
import { test, expect } from '@playwright/test';
import { insertFreestyleTrick } from '../fixtures/factories';
import { seedTier1Member } from '../fixtures/personas';
import {
  insertPersonaNamedGallery,
  insertRecurringDonationSubscription,
} from '../../src/testkit/personaRowBuilders';
import { authenticateContext } from './helpers/wizard-auth';
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

test('member payment history and gallery editor render at phone width with their controls reachable', { tag: ['@smoke'] }, async ({ browser, baseURL }) => {
  // Both pages carry a wide table whose last columns hold the controls: the
  // cancel-recurring-donation button, and the per-gallery row actions. Clipped
  // rather than scrolled, those controls exist in the DOM and cannot be reached
  // on a phone, which is a functional failure rather than a cosmetic one.
  const db = openLiveDb();
  const slug = `e2e_mobile_tables_${Date.now()}`;
  const persona = seedTier1Member(db, { slug });
  insertRecurringDonationSubscription(db, {
    member_id: persona.memberId,
    status: 'active',
    amount_cents: 2500,
    donation_comment: 'Phone-width layout check',
  });
  insertPersonaNamedGallery(db, {
    galleryId: `gal_${slug}`,
    ownerMemberId: persona.memberId,
    ownerSlug: slug,
    name: 'Phone Width Gallery',
  });
  db.close();

  const context = await browser.newContext({ viewport: PHONE, baseURL: baseURL! });
  await authenticateContext(context, baseURL!, persona);
  const page = await context.newPage();

  const overflows: string[] = [];
  for (const mobilePath of [`/members/${slug}/payments`, `/members/${slug}/galleries`]) {
    const res = await page.goto(mobilePath);
    expect(res?.status() ?? 500, `${mobilePath} status`).toBeLessThan(500);
    await expect(page.locator('h1').first(), `${mobilePath} h1`).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > PHONE.width + 1) {
      overflows.push(`${mobilePath}: scrollWidth ${scrollWidth} > ${PHONE.width}`);
    }

    // The wide table scrolls inside its own container. Without the wrapper this
    // is zero, which is what "clipped and unreachable" looks like in the DOM.
    const wrapperScrolls = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.records-table-wrap')).some(
        (el) => el.scrollWidth > el.clientWidth,
      ),
    );
    expect(wrapperScrolls, `${mobilePath}: wide table should scroll inside .records-table-wrap`).toBe(true);
  }

  // The control furthest from the left edge on each page is reachable by
  // scrolling its own container, not the document.
  await page.goto(`/members/${slug}/payments`);
  await expect(page.getByRole('button', { name: /Cancel Recurring Donation/i })).toBeVisible();

  await context.close();
  expect(overflows.join('\n'), `horizontal document overflow at phone width:\n${overflows.join('\n')}`).toBe('');
});
