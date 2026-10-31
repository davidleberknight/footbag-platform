/**
 * Personal-details year handling in the browser, the wizard closing to a
 * member who has finished, and keyboard reachability of the claim step's
 * controls.
 */
import { test, expect } from '@playwright/test';
import { openLiveDb, createAuthenticatedContext, authenticateContext } from './helpers/wizard-auth';
import { seedBrandNewPlayer, seedMemberMidWizard, seedAllTasksCompleted, getTaskState, completePersonalDetails } from './helpers/onboarding';
import { WizardPage } from './pages/wizard.page';

test('personal_details: an out-of-range year 1900 is blocked by the browser and the step stays put', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberMidWizard(db, { slug: `m_lo_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('personal_details');
  await wizard.yearInput.fill('1900');
  await wizard.saveButton.click();

  await expect(page).toHaveURL(/\/register\/wizard\/personal_details$/);
  const msg = await wizard.yearInput.evaluate((el: HTMLInputElement) => el.validationMessage);
  expect(msg).toBeTruthy();

  const db2 = openLiveDb();
  expect(getTaskState(db2, persona.memberId, 'personal_details')).toBe('pending');
  db2.close();

  await ctx.close();
});

test('personal_details: a future year is refused by the server with an inline error', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberMidWizard(db, { slug: `m_hi_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('personal_details');
  await page.locator('#city').fill('Portland');
  await wizard.selectCountry('United States', 'Oregon');
  await wizard.fillBirthDate();
  await wizard.yearInput.fill('2099');
  await wizard.saveButton.click();

  // The year field has no browser max, so a future year reaches the server,
  // which rejects it and re-renders the form with an inline error; the task
  // is not completed.
  await expect(wizard.inlineError).toBeVisible();
  await expect(page).toHaveURL(/\/register\/wizard\/personal_details/);

  const db2 = openLiveDb();
  expect(getTaskState(db2, persona.memberId, 'personal_details')).toBe('pending');
  db2.close();

  await ctx.close();
});

// A member only ever sees their own country's states. Defect caught: another
// country's entries are offered, the list does not follow the country, or a
// US registrant can save with no state.
test('personal_details: the state list appears for the chosen country only and follows it', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  // A real new registrant has no location on file.
  const persona = seedBrandNewPlayer(db, { slug: `m_rg_${Date.now()}`, overrides: { country: null, region: null } });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);
  await wizard.goto('personal_details');
  const field = page.locator('[data-region-field]');
  const region = page.locator('select#region');
  const offered = () => region.locator('option[value]:not([value=""])').evaluateAll(
    (opts) => opts.map((o) => (o as HTMLOptionElement).value),
  );

  await expect(field).toBeHidden();

  await page.locator('#country').selectOption({ label: 'United States' });
  await expect(field).toBeVisible();
  await expect(region).toBeFocused();
  await expect(region).toHaveAttribute('required', '');
  const us = await offered();
  expect(us.length).toBeGreaterThan(40);
  expect(us.every((v) => v.startsWith('US-'))).toBe(true);
  await region.selectOption({ label: 'Oregon' });

  await page.locator('#country').selectOption({ label: 'Canada' });
  const ca = await offered();
  expect(ca.length).toBeGreaterThan(0);
  expect(ca.every((v) => v.startsWith('CA-'))).toBe(true);
  await expect(region).toHaveValue('');

  await page.locator('#country').selectOption({ label: 'New Zealand' });
  await expect(field).toBeHidden();

  await page.locator('#city').fill('Eugene');
  await wizard.selectCountry('United States', 'Oregon');
  await wizard.fillBirthDate();
  await wizard.saveButton.click();
  await expect(page).toHaveURL(/\/register\/wizard\/legacy_claim$/);
  await ctx.close();
});

// Without JavaScript the form still works and still never shows another
// country's states: the first save asks for the state, offering the chosen
// country's list only.
test('personal_details: without JavaScript, the chosen country\'s list follows the first save', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `m_rgnj_${Date.now()}`, overrides: { country: null, region: null } });
  db.close();

  const ctx = await browser.newContext({ javaScriptEnabled: false });
  await authenticateContext(ctx, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);
  await wizard.goto('personal_details');
  await expect(page.locator('[data-region-field]')).toBeHidden();

  // A click's stability check needs page scripts, which this browser has turned
  // off, so the form is submitted from the keyboard, as a keyboard user does.
  await page.locator('#city').fill('Eugene');
  await page.locator('#country').selectOption({ label: 'United States' });
  await wizard.fillBirthDate();
  await wizard.saveButton.press('Enter');
  await expect(page.locator('[data-region-field]')).toBeVisible();
  await expect(page).toHaveURL(/\/register\/wizard\/personal_details/);
  const values = await page.locator('select#region option[value]:not([value=""])').evaluateAll(
    (opts) => opts.map((o) => (o as HTMLOptionElement).value),
  );
  expect(values.length).toBeGreaterThan(40);
  expect(values.every((v) => v.startsWith('US-'))).toBe(true);

  await page.locator('select#region').selectOption({ label: 'Oregon' });
  await wizard.fillBirthDate();
  await wizard.saveButton.press('Enter');
  await expect(page).toHaveURL(/\/register\/wizard\/legacy_claim$/);
  await ctx.close();
});

test('a member who has finished signing up is sent from the wizard to their own profile', async ({ browser, baseURL }) => {
  // The wizard belongs to signing up. A member who has finished has no task
  // there and no claim control that would act, so the whole surface is closed
  // to them; a link they still need is asked for through the identity-link
  // category of the contact form.
  const db = openLiveDb();
  const persona = seedAllTasksCompleted(db, { slug: `m_at_${Date.now()}`, linked: true });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();

  await page.goto('/register/wizard/legacy_claim');
  await expect(page).toHaveURL(new RegExp(`/members/${persona.slug}$`));

  await ctx.close();
});

test('keyboard: Tab reaches the old-email field, its add button, and both non-claiming answers', { tag: ['@a11y'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `m_kbd_${Date.now()}` });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await expect(page).toHaveURL(/\/register\/wizard\/legacy_claim$/);

  // The old address is how a member reaches an old account their current email
  // does not, so its field and button must be reachable without a mouse.
  expect(await reachByTab(page, '#oldEmail')).toBe(true);
  expect(await reachByTab(page, 'button:text-is("Add Old Email")')).toBe(true);

  // Both non-claiming answers are keyboard-reachable. A registrant who did hold
  // an old account must be able to say so without a mouse, and without being
  // pushed onto the other answer, which would be a false statement for them.
  await page.goto('/register/wizard/legacy_claim');
  expect(await reachByTab(page, 'button:has-text("I Never Had an Old Account")')).toBe(true);
  expect(await reachByTab(page, 'button:has-text("I Had One but Cannot Find It")')).toBe(true);

  await ctx.close();
});

async function reachByTab(page: import('@playwright/test').Page, selector: string, maxTabs = 60): Promise<boolean> {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    const matches = await page.locator(`${selector}:focus`).count();
    if (matches > 0) return true;
  }
  return false;
}
