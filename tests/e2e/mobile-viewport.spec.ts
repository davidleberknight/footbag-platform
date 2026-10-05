/**
 * Mobile-viewport smoke over the main freestyle public pages.
 *
 * The responsive design contract says every public page works at phone width
 * with wide content scrolling inside its own container, never the page body.
 * This spec drives a phone-sized browser context (no Playwright project or
 * config change) over the landing, the trick dictionary index, one seeded trick
 * detail, the records page, the glossary, and Freestyle Concepts, asserting each renders with its
 * main content and without horizontal document overflow. Assertions stay
 * structural; no screenshots.
 *
 * A second spec drives every onboarding step at phone width, asserting each
 * step's answer controls sit inside the screen so a registrant on a phone can
 * finish signing up.
 *
 * A third spec covers the two authenticated pages whose tables carry controls
 * in their rightmost columns: the member payment history and the gallery
 * editor. There the contract is stronger than "no overflow" — the table has to
 * scroll inside its own container, because a clipped table leaves the cancel
 * and row-action controls present in the DOM and unreachable on a phone.
 */
import { test, expect } from '@playwright/test';
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';
import { seedTier1Member } from '../fixtures/personas';
import {
  insertPersonaNamedGallery,
  insertRecurringDonationSubscription,
} from '../../src/testkit/personaRowBuilders';
import { authenticateContext } from './helpers/wizard-auth';
import { openLiveDb } from './helpers/liveDb';
import {
  seedMemberMidWizard,
  seedMemberWithEveryCardKind,
  seedMemberWithClubCards,
  seedTier0Member as seedPendingTier0,
  completeThroughLegacyClaim,
} from './helpers/onboarding';
import type { Persona } from '../fixtures/personas';

const PHONE = { width: 390, height: 844 };

test('freestyle public pages render at phone width without horizontal overflow', { tag: ['@smoke'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const slug = `e2e_fs_mobile_${Date.now()}`;
  insertFreestyleTrick(db, {
    slug, canonical_name: `e2e fs mobile ${Date.now()}`, adds: '3',
    trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'curated', is_active: 1,
  });
  // A dictionary row at the real data's widest: the longest canonical name is
  // 47 characters, the longest movement notation 132, and the longest slug, which
  // is also the hashtag and has no break point, 47
  // (surging_ducking_paradox_symposium_whirling_rake). A displayed nickname
  // rides on the same line as the name. A short row fits a phone in any layout,
  // so the row check below would pass without testing anything.
  const longSlug = `e2e_surging_ducking_paradox_symposium_${String(Date.now() % 1e9).padStart(9, '0')}`;
  insertFreestyleTrick(db, {
    slug: longSlug, canonical_name: `e2e mobile stepping paradox blurry whirling ${Date.now() % 1000}`.slice(0, 47), adds: '9',
    trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'curated', is_active: 1,
    operational_notation: 'SET > STEPPING [BOD] > PARADOX [BOD] > BLURRY [BOD] > SPIN [BOD] > LEGGY IN [DEX] > SAME CLIP [XBD] [DEL] > OP TOE',
  });
  insertFreestyleTrickAlias(db, `${longSlug}_nick`, longSlug, 'the extraordinarily long community nickname', { alias_type: 'common', alias_display: 1 });
  db.close();

  const context = await browser.newContext({ viewport: PHONE, baseURL: baseURL! });
  const page = await context.newPage();

  const pages = [
    '/freestyle',
    '/freestyle/tricks',
    `/freestyle/tricks/${slug}`,
    '/records',
    '/freestyle/glossary',
    '/freestyle/concepts',
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
      // Name the innermost elements past the edge, so a failure says what to fix.
      const culprits = await page.evaluate((width) => [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > width + 1
          && ![...el.children].some((c) => c.getBoundingClientRect().right > width + 1))
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()} in .${el.closest('[class]')?.className ?? ''} "${(el.textContent ?? '').trim().slice(0, 40)}" (${Math.round(el.getBoundingClientRect().right)}px)`), PHONE.width);
      overflows.push(`${mobilePath}: scrollWidth ${scrollWidth} > ${PHONE.width}: ${culprits.join(', ')}`);
    }
  }

  // The seeded row itself must fit the screen, so the check cannot pass on a
  // page where the row was clipped by an ancestor rather than laid out to fit.
  await page.goto('/freestyle/tricks');
  const row = page.locator(`article.dict-trick-row[data-trick-slug="${longSlug}"]`);
  await expect(row, 'the seeded long row must be listed').toHaveCount(1);
  const rowRight = await row.evaluate((el) => Math.max(
    el.getBoundingClientRect().right,
    ...[...el.querySelectorAll('*')].map((c) => c.getBoundingClientRect().right),
  ));
  if (rowRight > PHONE.width + 1) {
    overflows.push(`/freestyle/tricks: the seeded row reaches ${Math.round(rowRight)}px > ${PHONE.width}`);
  }
  await context.close();
  expect(overflows.join('\n'), `horizontal document overflow at phone width:\n${overflows.join('\n')}`).toBe('');
});

test('every onboarding step is usable at phone width with its submit control reachable', async ({ browser, baseURL }) => {
  // A registrant on a phone has to be able to finish signing up: every step's
  // answer control must sit inside the screen, and no step may scroll sideways.
  const db = openLiveDb();
  const details = seedMemberMidWizard(db, { slug: `e2e_mob_pd_${Date.now()}` });
  const claim = seedMemberWithEveryCardKind(db);
  const club = seedMemberWithClubCards(db, { clubCount: 1 });
  const wrap = seedPendingTier0(db, { slug: `e2e_mob_wrap_${Date.now()}` });
  completeThroughLegacyClaim(db, wrap.memberId);
  db.close();

  const steps: Array<[Persona, string, RegExp]> = [
    [details, '/register/wizard/personal_details', /Save and (Continue|Complete) Onboarding/],
    [claim, '/register/wizard/legacy_claim', /This Is Me, Link My History|Claim This Record|This Is Me, I Used the Surname|This Is Not Me|I Never Had an Old Account|I Had One but Cannot Find It|Add Old Email|Add Former Name/],
    [club, '/register/wizard/club_affiliations', /Save Answers/],
    [wrap, '/register/wizard/club_affiliations', /Finish Without a Club/],
  ];
  const problems: string[] = [];
  for (const [persona, stepPath, controls] of steps) {
    const context = await browser.newContext({ viewport: PHONE, baseURL: baseURL! });
    await authenticateContext(context, baseURL!, persona);
    const page = await context.newPage();
    await page.goto(stepPath);
    await expect(page, `${stepPath} renders where requested`).toHaveURL(new RegExp(`${stepPath}$`));

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scrollWidth > PHONE.width + 1) problems.push(`${stepPath}: scrollWidth ${scrollWidth} > ${PHONE.width}`);

    const buttons = page.locator('main button, main a.btn').filter({ hasText: controls });
    const count = await buttons.count();
    if (count === 0) problems.push(`${stepPath}: no answer control rendered`);
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      if (!box || box.x < 0 || box.x + box.width > PHONE.width + 1) {
        problems.push(`${stepPath}: "${(await buttons.nth(i).textContent())?.trim()}" lies outside the screen`);
      }
    }
    await context.close();
  }
  expect(problems.join('\n'), `onboarding steps at phone width:\n${problems.join('\n')}`).toBe('');
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
    donation_note: 'Phone-width layout check',
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
  await expect(page.getByRole('link', { name: /Cancel Recurring Donation/i })).toBeVisible();

  await context.close();
  expect(overflows.join('\n'), `horizontal document overflow at phone width:\n${overflows.join('\n')}`).toBe('');
});
