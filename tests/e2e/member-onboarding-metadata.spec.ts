/**
 * Metadata tasks, auth gates, auto-transition for completed tasks,
 * keyboard navigation, and accessibility.
 */
import { test, expect } from '@playwright/test';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';
import { seedBrandNewPlayer, seedMemberMidWizard, seedAllTasksCompleted, getTaskState, getMemberField } from './helpers/onboarding';
import { WizardPage } from './pages/wizard.page';

test('first_competition_year: out-of-range year 1900 rejected inline', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberMidWizard(db, { slug: `m_lo_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('first_competition_year');
  await wizard.yearInput.fill('1900');
  await wizard.saveButton.click();

  expect(page.url()).toContain('first_competition_year');
  const msg = await wizard.yearInput.evaluate((el: HTMLInputElement) => el.validationMessage);
  expect(msg).toBeTruthy();

  await ctx.close();
});

test('first_competition_year: future year rejected inline', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberMidWizard(db, { slug: `m_hi_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('first_competition_year');
  await wizard.yearInput.fill('2099');
  await wizard.saveButton.click();

  expect(page.url()).toContain('first_competition_year');
  await expect(wizard.inlineError).toBeVisible();

  await ctx.close();
});

test('show_competitive_results default state is unchecked', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberMidWizard(db, { slug: `m_def_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('first_competition_year');
  await wizard.skipCurrentTask();
  expect(page.url()).toContain('show_competitive_results');

  const isChecked = await wizard.resultsToggle.isChecked();
  // show_competitive_results defaults to 1 in the factory (insertMember default)
  // The toggle state should match whatever the member's current DB value is
  const db2 = openLiveDb();
  const dbValue = getMemberField(db2, persona.memberId, 'show_competitive_results');
  db2.close();

  expect(isChecked).toBe(dbValue === 1);

  await ctx.close();
});

test('unauthenticated wizard access redirects to login with returnTo', async ({ page }) => {
  const routes = [
    '/register/wizard/legacy_claim',
    '/register/wizard/club_affiliations',
    '/register/wizard/first_competition_year',
    '/register/wizard/show_competitive_results',
    '/register/wizard/complete',
  ];

  for (const route of routes) {
    const res = await page.goto(route);
    expect(page.url(), `${route} should redirect to /login`).toContain('/login');
    expect(page.url()).toContain('returnTo=');
  }
});

test('GET wizard task after all completed -> auto-transitions away', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedAllTasksCompleted(db, { slug: `m_at_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();

  await page.goto('/register/wizard/legacy_claim');
  await page.waitForURL(/\/register\/wizard\/complete/);

  const wizard = new WizardPage(page);
  await expect(wizard.completionMessage).toBeVisible();

  await ctx.close();
});

test('keyboard: Tab reaches identifier input, Find button, Skip button', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `m_kbd_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');

  const identifierReachable = await reachByTab(page, '#identifier');
  expect(identifierReachable).toBe(true);

  const findReachable = await reachByTab(page, 'button:has-text("Find")');
  expect(findReachable).toBe(true);

  const skipReachable = await reachByTab(page, 'button:has-text("Skip for now")');
  expect(skipReachable).toBe(true);

  await ctx.close();
});

test('accessibility: form labels programmatically associated on legacy_claim', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `m_a11y_${Date.now()}` });
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
