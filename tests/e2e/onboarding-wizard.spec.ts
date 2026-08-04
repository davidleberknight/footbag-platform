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
import { randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import {
  seedBrandNewPlayer,
  seedMemberMidWizard,
  seedMemberWithClubCards,
  seedTier0Member,
  completePersonalDetails,
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
  // The surname varies per run, in letters only. Registration derives a
  // permanent profile URL from the name, so a fixed name means a fixed URL and
  // any second registration of it against the same database is refused for a URL
  // already taken, failing on a collision rather than on anything this test is
  // about. Letters only because a legal name may not contain digits, so a
  // numeric stamp is rejected by validation before the flow even starts.
  const surname = `Newbie${Array.from(randomBytes(6))
    .map((b) => String.fromCharCode(97 + (b % 26)))
    .join('')}`;
  await registerPage.fillRegistration({
    realName: `Test ${surname}`,
    email,
    password: 'e2e-test-password-123',
  });
  await registerPage.submit();
  await page.waitForURL(/\/register\/check-email/);

  const verifyUrl = await registerPage.getSimulatedVerifyUrl();
  expect(verifyUrl, 'dev simulated-email card should contain a verify link').toBeTruthy();

  await page.goto(verifyUrl!);
  await page.waitForURL(/\/register\/wizard\/|\/members\//);

  // personal_details is the first task in the fixed order, so a freshly
  // verified member lands there before the legacy-claim step.
  expect(page.url()).toMatch(/\/register\/wizard\/personal_details|\/members\//);
});

// ── Answer legacy_claim -> land on next task ─────────────────────────────────

test('answering legacy_claim without linking advances to the next task', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `e2e_cwl_${Date.now()}` });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await expect(wizard.continueWithoutLinkingButton).toBeVisible();
  await wizard.answerCurrentTask();

  expect(page.url()).toMatch(/\/register\/wizard\/club_affiliations/);

  await context.close();
});

// ── Dashboard task widget: Continue Onboarding buttons ───────────────────────

test('a pending registrant visiting their own profile is routed to the next outstanding task', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier0Member(db, { slug: `e2e_resume_${Date.now()}` });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await wizard.answerCurrentTask();

  // Resume is the gate redirect: the profile page does not exist while
  // pending, so requesting it lands on the next outstanding wizard task.
  const dashboard = new DashboardPage(page);
  await dashboard.goto(persona.slug);
  await page.waitForURL(/\/register\/wizard\/club_affiliations/);
  expect(page.url()).toMatch(/\/register\/wizard\/club_affiliations/);

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
  await wizard.selectCountry('United States', 'OR');
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
  completePersonalDetails(db, persona.memberId);
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
  completePersonalDetails(db, persona.memberId);
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await expect(wizard.heading).toBeVisible();
  await expect(wizard.continueWithoutLinkingButton).toBeVisible();
  const identifierLabel = page.locator('label[for="identifier"]');
  await expect(identifierLabel).toBeVisible();

  await wizard.answerCurrentTask();

  // The club step is reached by the advance above; it carries its own heading
  // and its own explicit answer control.
  expect(page.url()).toContain('club_affiliations');
  await expect(wizard.heading).toBeVisible();
  await expect(wizard.noClubsButton).toBeVisible();

  await context.close();
});

test('club-affiliations disambiguation group is a single-select labelled fieldset', { tag: ['@a11y'] }, async ({ browser, baseURL }) => {
  // Two candidate clubs in one city produce the disambiguation card. It resolves
  // only which club is the member's, so the options are radios sharing one name
  // rather than independent checkboxes, grouped in a fieldset whose legend
  // carries the question so a screen reader announces choice and group together.
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
  await expect(legend).toContainText(/Which of these clubs in .+ were you part of\?/);

  const radios = fieldset.locator('input[type="radio"][name="selectedCandidateIds"]');
  expect(await radios.count()).toBeGreaterThan(1);
  await expect(fieldset.locator('input[type="checkbox"]')).toHaveCount(0);

  await context.close();
});

// ── Keyboard navigation ──────────────────────────────────────────────────────

test('the continue-without-linking answer is keyboard-reachable and activatable', { tag: ['@a11y'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier0Member(db, { slug: `e2e_kbd_${Date.now()}` });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');

  // Continue-without-linking carries a required attestation checkbox; without it
  // the form fails HTML5 validation and never submits, so satisfy it before
  // exercising keyboard activation of the button itself.
  await wizard.noOldAccountCheckbox.check();

  await wizard.continueWithoutLinkingButton.focus();
  await expect(wizard.continueWithoutLinkingButton).toBeFocused();

  await page.keyboard.press('Enter');
  await page.waitForURL(/\/register\/wizard\/(?!legacy_claim)/);

  expect(page.url()).not.toContain('legacy_claim');

  await context.close();
});
