/**
 * An event's sanction, driven front to back in a real browser.
 *
 * One run covers the whole flow. A Tier 2 organizer creates a sanctioned event
 * with a fee and an open-only division, opens the request from the manage
 * page, is told of the missing Women's and Intermediate divisions, is refused
 * an empty submit and then a complete one while the divisions are missing,
 * adds them on the manage page and submits. An administrator finds the request in the
 * sanctioning area with every answer, and rejects it with a reason. The
 * organizer sees the reason, resubmits from the prefilled form, and the
 * administrator approves: the event is public, badged as sanctioned, listed in
 * Upcoming Events and taking payment. A second sanctioned draft is recorded as
 * a Board-awarded World Championships from the administrator's award page. A
 * Tier 1 member is offered no sanctioned path at all, and a visitor finds the
 * sanctioning guidelines from the events page.
 *
 * Handler tests prove each step. Only the browser proves an organizer can get
 * from the manage page to the request and back, that each form posts what the
 * page shows, and that the decisions are reachable from the queue list an
 * administrator actually works from.
 */
import { test, expect, type Page } from '@playwright/test';
import { seedAdmin, seedTier1Member, type Persona } from '../fixtures/personas';
import { createMemberAtTier, createTestSessionJwt } from '../fixtures/factories';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';

function rand(): string {
  return Math.random().toString(36).slice(2, 8);
}

const GUIDELINES = '/ifpa/sanctioning-guidelines';

function sanctionLine(page: Page) {
  return page.locator('section:has(h2:text-is("Sanction")) p').first();
}

async function createSanctionedEvent(page: Page, title: string, city: string, fee: string): Promise<string> {
  await page.goto('/events/create');
  await page.fill('input[name="title"]', title);
  await page.fill('textarea[name="description"]', 'A browser journey event.');
  await page.fill('input[name="start_date"]', '2030-06-01');
  await page.fill('input[name="end_date"]', '2030-06-02');
  await page.fill('input[name="city"]', city);
  await page.selectOption('select[name="country"]', { label: 'United States' });
  await page.check('input[name="event_type"][value="sanctioned"]');
  if (fee) await page.fill('input[name="competitor_fee"]', fee);
  await page.locator('form[action="/events/create"] button[type="submit"]').click();
  await expect(page).toHaveURL(/\/events\/event_2030_[a-z0-9_]+\/manage$/);
  return page.url().split('/events/')[1].split('/')[0];
}

/** Open the sanctioning area's item for this event, from the list. */
async function openItemFor(page: Page, title: string): Promise<void> {
  await page.goto('/admin/work-queue?kind=waiting&topic=sanctioning');
  const hrefs = [...new Set(await page.locator('a[href^="/admin/work-queue/wq_"]')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? '')))];
  for (const href of hrefs) {
    await page.goto(href);
    if (await page.locator(`h3:text-is("${title}")`).count()) return;
  }
  throw new Error(`no sanctioning item for ${title}`);
}

test('an organizer requests sanction, an administrator rejects then approves it, and a Board award is recorded', async ({
  browser, baseURL,
}) => {
  const id = rand();
  const title = `Journey Sanction Cup ${id}`;
  const worlds = `Journey Worlds ${id}`;
  const db = openLiveDb();
  const admin = seedAdmin(db, { slug: `sx_admin_${id}` });
  const tier1 = seedTier1Member(db, { slug: `sx_tier1_${id}` });
  const organizerId = `sx-org-${id}`;
  createMemberAtTier(db, { id: organizerId, slug: `sx_org_${id}`, tier: 'tier2' });
  const organizer: Persona = {
    memberId: organizerId,
    slug: `sx_org_${id}`,
    cookieHeader: `__Host-footbag_session=${createTestSessionJwt({ memberId: organizerId, role: 'member' })}`,
    tier: 'tier2',
    isAdmin: false,
  };
  db.close();

  // ── A visitor finds the guidelines; a Tier 1 member gets no sanctioned path ──
  const anon = await browser.newContext({ baseURL });
  const anonPage = await anon.newPage();
  await anonPage.goto('/events');
  await expect(anonPage.locator(`a[href="${GUIDELINES}"]`)).toHaveCount(1);
  const t1Page = await (await createAuthenticatedContext(browser, baseURL!, tier1)).newPage();
  await t1Page.goto('/events/create');
  await expect(t1Page.locator('input[name="event_type"][value="sanctioned"]')).toHaveCount(0);

  // ── The organizer creates the event and asks ───────────────────────────────
  const orgPage = await (await createAuthenticatedContext(browser, baseURL!, organizer)).newPage();
  await orgPage.goto('/events/create');
  await expect(orgPage.locator(`form a[href="${GUIDELINES}"]`)).toHaveCount(1);
  const key = await createSanctionedEvent(orgPage, title, 'Journeyville', '20');
  await expect(sanctionLine(orgPage)).toHaveText('Not requested yet.');
  await orgPage.goto(`/events/${key}/manage?game=game_footbag_net`);
  await orgPage.check('input[name="team_type"][value="singles"]');
  await orgPage.check('input[name="gender"][value="open"]');
  await orgPage.check('input[name="division_class"][value="open"]');
  await orgPage.locator(`form[action="/events/${key}/divisions"] button[type="submit"]`).click();

  await orgPage.goto(`/events/${key}/manage`);
  await orgPage.getByRole('link', { name: 'Request Sanction' }).click();
  await expect(orgPage).toHaveURL(new RegExp(`/events/${key}/sanction$`));
  await expect(orgPage.locator('.notice-card--warn')).toContainText("Women's in Singles Footbag Net");
  await expect(orgPage.locator('.notice-card--warn')).toContainText('Intermediate in Singles Footbag Net');
  const submit = orgPage.getByRole('button', { name: 'Submit Sanction Request' });
  await submit.click();
  await expect(orgPage.locator('.form-field-error').first()).toBeVisible();
  const fillRequest = async (): Promise<void> => {
    await orgPage.check('input[name="attest"][value="1"]');
    await orgPage.check('input[name="deviates"][value="no"]');
    await orgPage.check('input[name="prize_money"][value="no"]');
    await orgPage.check('input[name="frequency"][value="first_time"]');
    await orgPage.fill('input[name="expected_players"]', '32');
    await orgPage.check('input[name="permits"][value="not_needed"]');
    await orgPage.check('input[name="insurance"][value="yes"]');
    await orgPage.fill('textarea[name="justification"]', 'Covers the gym and the trophies.');
  };
  // Every answer complete, but the event still lacks the divisions IFPA requires.
  await fillRequest();
  await submit.click();
  await expect(orgPage).toHaveURL(new RegExp(`/events/${key}/sanction$`));
  await expect(orgPage.locator('fieldset .form-field-error').first()).toContainText("Women's in Singles Footbag Net");

  // The organizer adds the two divisions the page named, then asks again.
  for (const [gender, cls] of [['women', 'open'], ['open', 'intermediate']] as const) {
    await orgPage.goto(`/events/${key}/manage?game=game_footbag_net`);
    await orgPage.check('input[name="team_type"][value="singles"]');
    await orgPage.check(`input[name="gender"][value="${gender}"]`);
    await orgPage.check(`input[name="division_class"][value="${cls}"]`);
    await orgPage.locator(`form[action="/events/${key}/divisions"] button[type="submit"]`).click();
  }
  await orgPage.goto(`/events/${key}/sanction`);
  await expect(orgPage.locator('.notice-card--warn')).toHaveCount(0);
  await fillRequest();
  await submit.click();
  await expect(orgPage).toHaveURL(new RegExp(`/events/${key}/manage$`));
  await expect(sanctionLine(orgPage)).toHaveText('Pending review by IFPA.');
  expect((await anonPage.goto(`/events/${key}`))?.status()).toBe(404);

  // ── The administrator rejects it from the sanctioning area ──────────────────
  const adminPage = await (await createAuthenticatedContext(browser, baseURL!, admin)).newPage();
  await openItemFor(adminPage, title);
  await expect(adminPage.locator('dd', { hasText: 'Covers the gym and the trophies.' })).toHaveCount(1);
  const reason = 'State the expected number of spectators';
  await adminPage.locator('form[action$="/sanction/reject"] textarea[name="reason"]').fill(reason);
  await adminPage.locator('form[action$="/sanction/reject"] button[type="submit"]').click();
  await expect(adminPage).toHaveURL(/\/admin\/work-queue/);

  // ── The organizer sees the reason and resubmits ─────────────────────────────
  await orgPage.goto(`/events/${key}/manage`);
  await expect(sanctionLine(orgPage)).toContainText(reason);
  await orgPage.getByRole('link', { name: 'Request Sanction' }).click();
  await expect(orgPage.locator('input[name="expected_players"]')).toHaveValue('32');
  await orgPage.check('input[name="attest"][value="1"]');
  await orgPage.getByRole('button', { name: 'Submit Sanction Request' }).click();
  await expect(sanctionLine(orgPage)).toHaveText('Pending review by IFPA.');

  // ── The administrator approves; the event is public and sanctioned ──────────
  await openItemFor(adminPage, title);
  await adminPage.locator('form[action$="/sanction/approve"] button[type="submit"]').click();
  expect((await anonPage.goto(`/events/${key}`))?.status()).toBe(200);
  await expect(anonPage.locator('.badge', { hasText: 'IFPA-sanctioned' })).toHaveCount(1);
  await anonPage.goto('/events');
  await expect(anonPage.locator(`a[href="/events/${key}"]`)).toHaveCount(1);

  // ── A Board-awarded World Championships ─────────────────────────────────────
  const worldsKey = await createSanctionedEvent(orgPage, worlds, 'Worldsville', '');
  await adminPage.goto('/admin');
  await adminPage.locator('a[href="/admin/events/sanctions"]').click();
  const card = adminPage.locator('.card', { hasText: worlds });
  await card.locator('textarea[name="citation"]').fill('IFPA Board decision awarding the 2030 Worlds');
  await card.getByRole('button').click();
  await expect(adminPage.locator('.card', { hasText: worlds })).toHaveCount(0);
  expect((await anonPage.goto(`/events/${worldsKey}`))?.status()).toBe(200);

  // ── What the run left behind ────────────────────────────────────────────────
  const check = openLiveDb();
  const event = (key2: string) => check.prepare(
    `SELECT e.status, e.sanction_status, e.payment_enabled, e.sanction_decision_reason
       FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE t.tag_normalized = ?`,
  ).get(`#${key2}`) as Record<string, string | number | null>;
  expect(event(key)).toMatchObject({ status: 'reg_open', sanction_status: 'approved', payment_enabled: 1 });
  expect(event(worldsKey)).toMatchObject({
    status: 'reg_open', sanction_status: 'approved', payment_enabled: 0,
    sanction_decision_reason: 'IFPA Board decision awarding the 2030 Worlds',
  });
  const mail = (check.prepare(
    "SELECT template_key FROM outbox_emails WHERE recipient_member_id = ? AND template_key LIKE 'event_sanction%' ORDER BY created_at, id",
  ).all(organizerId) as Array<{ template_key: string }>).map((m) => m.template_key).sort();
  expect(mail).toEqual([
    'event_sanction_rejected', 'event_sanction_requested', 'event_sanction_requested',
    'event_sanctioned', 'event_sanctioned',
  ]);
  const acts = (check.prepare(
    `SELECT a.action_type FROM audit_entries a JOIN events e ON e.id = a.entity_id
       JOIN tags t ON t.id = e.hashtag_tag_id
      WHERE t.tag_normalized IN (?, ?) AND a.action_type LIKE 'event.sanction%'`,
  ).all(`#${key}`, `#${worldsKey}`) as Array<{ action_type: string }>).map((a) => a.action_type).sort();
  expect(acts).toEqual([
    'event.sanction_approved', 'event.sanction_awarded', 'event.sanction_rejected',
    'event.sanction_requested', 'event.sanction_requested',
  ]);
  check.close();
});
