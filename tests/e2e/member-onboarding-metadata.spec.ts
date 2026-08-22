/**
 * Metadata tasks, auth gates, auto-transition for completed tasks,
 * keyboard navigation, and accessibility.
 */
import { test, expect } from '@playwright/test';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';
import { seedBrandNewPlayer, seedMemberMidWizard, seedAllTasksCompleted, getTaskState, completePersonalDetails } from './helpers/onboarding';
import { WizardPage } from './pages/wizard.page';

test('personal_details: out-of-range year 1900 rejected inline', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberMidWizard(db, { slug: `m_lo_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('personal_details');
  await wizard.yearInput.fill('1900');
  await wizard.saveButton.click();

  expect(page.url()).toContain('personal_details');
  const msg = await wizard.yearInput.evaluate((el: HTMLInputElement) => el.validationMessage);
  expect(msg).toBeTruthy();

  await ctx.close();
});

test('personal_details: future year rejected inline', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberMidWizard(db, { slug: `m_hi_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('personal_details');
  await page.locator('#city').fill('Portland');
  await wizard.selectCountry('United States', 'OR');
  await wizard.fillBirthDate();
  await wizard.yearInput.fill('2099');
  await wizard.saveButton.click();

  // The year field has no browser max, so a future year reaches the server,
  // which rejects it and re-renders the form with an inline error; the task
  // is not completed.
  expect(page.url()).toContain('personal_details');
  await expect(wizard.inlineError).toBeVisible();

  const db2 = openLiveDb();
  expect(getTaskState(db2, persona.memberId, 'personal_details')).toBe('pending');
  db2.close();

  await ctx.close();
});

test('unauthenticated wizard access redirects to login with returnTo', async ({ page }) => {
  const routes = [
    '/register/wizard/legacy_claim',
    '/register/wizard/club_affiliations',
    '/register/wizard/complete',
  ];

  for (const route of routes) {
    const res = await page.goto(route);
    expect(page.url(), `${route} should redirect to /login`).toContain('/login');
    expect(page.url()).toContain('returnTo=');
  }
});

test('GET wizard task after all completed and fully linked -> auto-transitions away', async ({ browser, baseURL }) => {
  // The wizard belongs to signing up. A member who has finished has no task
  // there and no claim control that would act, so the whole surface is closed
  // to them and they are sent to their own profile; a link they still need is
  // asked for through the identity-link category of the contact form.
  const db = openLiveDb();
  const persona = seedAllTasksCompleted(db, { slug: `m_at_${Date.now()}`, linked: true });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();

  await page.goto('/register/wizard/legacy_claim');
  await page.waitForURL(new RegExp(`/members/${persona.slug}$`));

  await ctx.close();
});

test('keyboard: Tab reaches identifier input, the search button, and both non-claiming answers', { tag: ['@a11y'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `m_kbd_${Date.now()}` });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');

  const identifierReachable = await reachByTab(page, '#identifier');
  expect(identifierReachable).toBe(true);

  // Exact text: the step also carries "I Had One but Cannot Find It", which a
  // substring match would reach instead of the search control.
  const findReachable = await reachByTab(page, 'button:text-is("Find")');
  expect(findReachable).toBe(true);

  // Both non-claiming answers are keyboard-reachable. A registrant who did hold
  // an old account must be able to say so without a mouse, and without being
  // pushed onto the other answer, which would be a false statement for them.
  const neverHadReachable = await reachByTab(page, 'button:has-text("I Never Had an Old Account")');
  expect(neverHadReachable).toBe(true);

  const cannotFindReachable = await reachByTab(page, 'button:has-text("I Had One but Cannot Find It")');
  expect(cannotFindReachable).toBe(true);

  await ctx.close();
});

test('accessibility: form labels programmatically associated on legacy_claim', { tag: ['@a11y'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `m_a11y_${Date.now()}` });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();

  await page.goto('/register/wizard/legacy_claim');

  const label = page.locator('label[for="identifier"]');
  await expect(label).toBeVisible();

  const input = page.locator('#identifier');
  await expect(input).toBeVisible();

  const labelFor = await label.getAttribute('for');
  const inputId = await input.getAttribute('id');
  expect(labelFor).toBe(inputId);

  await ctx.close();
});

async function reachByTab(page: import('@playwright/test').Page, selector: string, maxTabs = 40): Promise<boolean> {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    const matches = await page.locator(`${selector}:focus`).count();
    if (matches > 0) return true;
  }
  return false;
}
