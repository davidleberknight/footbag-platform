/**
 * Lightweight Playwright E2E tests for the onboarding wizard.
 *
 * These cover browser-only behavior that integration tests cannot
 * prove: session cookie chain, redirect handling, form fill + PRG,
 * dashboard widget rendering, and accessibility.
 *
 * Kept deliberately lightweight: only checks that genuinely need a real
 * browser belong here; everything else lives in the integration suite.
 */
import { test, expect } from '@playwright/test';
import {
  seedBrandNewPlayer,
  seedMemberMidWizard,
  seedMemberWithClubCards,
  seedTier0Member,
} from './helpers/onboarding';
import { insertLegacyMember } from '../fixtures/factories';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';
import { WizardPage } from './pages/wizard.page';
import { DashboardPage } from './pages/dashboard.page';
import { RegisterPage } from './pages/register.page';

// ── Registration -> verification -> wizard entry ─────────────────────────────

test('post-verify: register -> check-email -> click verify link -> lands on wizard', { tag: ['@smoke'] }, async ({ page }) => {
  const stamp = Date.now();
  const email = `e2e-reg-${stamp}@example.com`;
  const registerPage = new RegisterPage(page);

  await registerPage.goto();
  await registerPage.fillRegistration({
    realName: 'Test Newbie',
    email,
    password: 'e2e-test-password-123',
  });
  await registerPage.submit();
  await page.waitForURL(/\/register\/check-email/);

  const verifyUrl = await registerPage.getSimulatedVerifyUrl();
  expect(verifyUrl, 'dev simulated-email card should contain a verify link').toBeTruthy();

  await page.goto(verifyUrl!);
  await page.waitForURL(/\/register\/wizard\/|\/members\//);

  expect(page.url()).toMatch(/\/register\/wizard\/legacy_claim|\/members\//);
});

// ── Skip legacy_claim -> land on next task ───────────────────────────────────

test('skip legacy_claim -> advances to next task', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `e2e_skip_${Date.now()}` });
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await expect(wizard.skipButton).toBeVisible();
  await wizard.skipCurrentTask();

  expect(page.url()).toMatch(/\/register\/wizard\/(personal_details|club_affiliations)/);

  await context.close();
});

// ── Dashboard task widget: Resume buttons ────────────────────────────────────

test('dashboard shows Resume button for skipped tasks', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier0Member(db, { slug: `e2e_widget_${Date.now()}` });
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await wizard.skipCurrentTask();

  const dashboard = new DashboardPage(page);
  await dashboard.goto(persona.slug);
  await expect(dashboard.taskWidget).toBeVisible();
  await expect(dashboard.resumeButtons.first()).toBeVisible();

  await context.close();
});

// ── Resume task from dashboard ───────────────────────────────────────────────

test('clicking Resume on dashboard opens the wizard task page', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier0Member(db, { slug: `e2e_resume_${Date.now()}` });
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await wizard.skipCurrentTask();

  const dashboard = new DashboardPage(page);
  await dashboard.goto(persona.slug);
  await dashboard.clickFirstResume();

  expect(page.url()).toMatch(/\/register\/wizard\//);

  await context.close();
});

// ── First competition year form fill ─────────────────────────────────────────

test('complete personal_details via form fill -> advances to next task', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberMidWizard(db, { slug: `e2e_year_${Date.now()}` });
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('personal_details');
  await expect(wizard.yearInput).toBeVisible();
  await page.locator('#city').fill('Portland');
  await page.locator('#country').fill('US');
  await page.locator('#birthDate').fill('2000-01-15');
  await wizard.submitYear('2005');

  expect(page.url()).toMatch(/\/register\/wizard\/club_affiliations/);

  await context.close();
});

// ── Email-equality fast path auto-link ───────────────────────────────────────

test('legacy-claim email-equality fast path: auto-links and advances', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const stamp = Date.now();
  const sharedEmail = `e2e-fastpath-${stamp}@example.com`;

  insertLegacyMember(db, {
    legacy_member_id: `LM-E2E-FP-${stamp}`,
    legacy_email: sharedEmail,
    real_name: 'Fast Path',
  });

  const persona = seedTier0Member(db, {
    slug: `e2e_fp_${stamp}`,
    overrides: { login_email: sharedEmail, real_name: 'Fast Path' },
  });
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await wizard.submitIdentifier(sharedEmail);

  expect(page.url()).toMatch(/\/register\/wizard\/(personal_details|club_affiliations)/);

  await context.close();
});

// ── Unknown taskType -> 404 ──────────────────────────────────────────────────

test('unknown taskType renders 404 page', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier0Member(db, { slug: `e2e_404_${Date.now()}` });
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();

  const res = await page.goto('/register/wizard/bogus_task');
  expect(res?.status()).toBe(404);

  await context.close();
});

// ── Accessibility: wizard pages pass basic checks ────────────────────────────

test('wizard pages have accessible form labels and heading', { tag: ['@a11y'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier0Member(db, { slug: `e2e_a11y_${Date.now()}` });
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await expect(wizard.heading).toBeVisible();
  await expect(wizard.skipButton).toBeVisible();
  const identifierLabel = page.locator('label[for="identifier"]');
  await expect(identifierLabel).toBeVisible();

  await wizard.skipCurrentTask();

  const tasks = ['club_affiliations'];
  for (const taskType of tasks) {
    await wizard.goto(taskType);
    const status = await page.evaluate(() => document.readyState);
    if (status === 'complete') {
      await expect(wizard.heading).toBeVisible();
      await expect(wizard.skipButton).toBeVisible();
    }
  }

  await context.close();
});

test('club-affiliations disambiguation group is a labelled fieldset', { tag: ['@a11y'] }, async ({ browser, baseURL }) => {
  // Two candidate clubs in one city produce the disambiguation card. Its
  // checkboxes must be grouped in a fieldset whose legend carries the question,
  // so a screen reader announces the choice and the group together.
  const db = openLiveDb();
  const persona = seedMemberWithClubCards(db, {
    slug: `e2e_club_fieldset_${Date.now()}`,
    clubCount: 2,
    city: 'Disambigville',
  });
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');

  const fieldset = page.locator('fieldset.form-fieldset');
  await expect(fieldset).toBeVisible();

  const legend = fieldset.locator('legend.card-title');
  await expect(legend).toBeVisible();
  await expect(legend).toContainText(/Which clubs in .+ were you part of\?/);

  const checkboxes = fieldset.locator('input[type="checkbox"][name="selectedCandidateIds"]');
  expect(await checkboxes.count()).toBeGreaterThan(0);

  await context.close();
});

// ── Keyboard navigation ──────────────────────────────────────────────────────

test('wizard skip button is keyboard-reachable and activatable', { tag: ['@a11y'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier0Member(db, { slug: `e2e_kbd_${Date.now()}` });
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');

  await wizard.skipButton.focus();
  await expect(wizard.skipButton).toBeFocused();

  await page.keyboard.press('Enter');
  await page.waitForURL(/\/register\/wizard\/(?!legacy_claim)/);

  expect(page.url()).not.toContain('legacy_claim');

  await context.close();
});
