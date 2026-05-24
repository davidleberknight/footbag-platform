/**
 * Core onboarding wizard flow: task sequencing, skip/advance,
 * form submission with DB verification, reload resilience,
 * anti-enumeration, and completion page.
 */
import { test, expect } from '@playwright/test';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';
import { seedBrandNewPlayer, seedMemberWithAutoLinkCandidate, seedMemberMidWizard, seedTier0Member, getTaskState, getMemberField, isLegacyClaimed, countTierGrants, raiseClaimRateLimits } from './helpers/onboarding';

test.beforeAll(() => {
  const db = openLiveDb();
  raiseClaimRateLimits(db);
  db.close();
});
import { WizardPage } from './pages/wizard.page';

test('brand-new player sees legacy_claim with search form, no candidate cards, sensible text', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `w_new_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await expect(wizard.heading).toBeVisible();
  await expect(wizard.identifierInput).toBeVisible();
  await expect(wizard.findButton).toBeVisible();
  await expect(wizard.skipButton).toBeVisible();

  const body = await page.textContent('body');
  expect(body).not.toMatch(/we found|match found|candidate/i);

  await ctx.close();
});

test('skip legacy_claim: advances, DB state=skipped, next task heading visible', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `w_skip_${Date.now()}` });
  const { memberId } = persona;
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await wizard.skipCurrentTask();

  await expect(wizard.heading).toBeVisible();
  expect(page.url()).not.toContain('legacy_claim');

  const db2 = openLiveDb();
  expect(getTaskState(db2, memberId, 'legacy_claim')).toBe('skipped');
  db2.close();

  await ctx.close();
});

test('auto-link fast path: email match links member, sets HP, writes tier grant', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithAutoLinkCandidate(db, { slug: `w_al_${Date.now()}` });
  const { memberId, legacyMemberId } = persona;
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  const loginEmail = await page.evaluate(() =>
    document.querySelector('#identifier')?.getAttribute('placeholder') ?? '',
  );

  const db2 = openLiveDb();
  const email = (db2.prepare('SELECT login_email FROM members WHERE id = ?').get(memberId) as { login_email: string }).login_email;
  db2.close();

  await wizard.submitIdentifier(email);
  expect(page.url()).not.toContain('legacy_claim');

  const db3 = openLiveDb();
  expect(getMemberField(db3, memberId, 'legacy_member_id')).toBe(legacyMemberId);
  expect(getMemberField(db3, memberId, 'historical_person_id')).toBeTruthy();
  expect(isLegacyClaimed(db3, legacyMemberId)).toBe(true);
  expect(countTierGrants(db3, memberId, 'legacy.claim_tier_grant')).toBeGreaterThanOrEqual(1);
  expect(getTaskState(db3, memberId, 'legacy_claim')).toBe('completed');
  db3.close();

  await ctx.close();
});

test('no-match search: renders guidance banner (no candidate count or identity leak)', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `w_ae_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await wizard.submitIdentifier(`garbage-${Date.now()}`);

  const body = await page.textContent('body') ?? '';
  expect(body).not.toMatch(/\d+ (match|record|candidate)/i);
  expect(body).not.toMatch(/found \d/i);

  await ctx.close();
});

test('first_competition_year: valid year saves to DB', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberMidWizard(db, { slug: `w_yr_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('first_competition_year');
  await wizard.submitYear('2005');

  expect(page.url()).toContain('show_competitive_results');

  const db2 = openLiveDb();
  expect(getMemberField(db2, persona.memberId, 'first_competition_year')).toBe(2005);
  expect(getTaskState(db2, persona.memberId, 'first_competition_year')).toBe('completed');
  db2.close();

  await ctx.close();
});

test('first_competition_year: out-of-range year blocked by browser validation, stays on page', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberMidWizard(db, { slug: `w_byr_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('first_competition_year');
  await wizard.yearInput.fill('1900');
  await wizard.saveButton.click();

  expect(page.url()).toContain('first_competition_year');

  const validationMessage = await wizard.yearInput.evaluate(
    (el: HTMLInputElement) => el.validationMessage,
  );
  expect(validationMessage).toBeTruthy();

  const db2 = openLiveDb();
  expect(getTaskState(db2, persona.memberId, 'first_competition_year')).toBe('pending');
  db2.close();

  await ctx.close();
});

test('first_competition_year: empty year accepted, clears field', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberMidWizard(db, { slug: `w_eyr_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('first_competition_year');
  await wizard.yearInput.fill('');
  await wizard.saveButton.click();
  await page.waitForURL(/\/register\/wizard\//);

  expect(page.url()).toContain('show_competitive_results');

  const db2 = openLiveDb();
  expect(getMemberField(db2, persona.memberId, 'first_competition_year')).toBeNull();
  expect(getTaskState(db2, persona.memberId, 'first_competition_year')).toBe('completed');
  db2.close();

  await ctx.close();
});

test('show_competitive_results: toggle on, submit, advances to completion', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberMidWizard(db, { slug: `w_scr_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('first_competition_year');
  await wizard.skipCurrentTask();
  expect(page.url()).toContain('show_competitive_results');

  await wizard.resultsToggle.check();
  await wizard.saveButton.click();
  await page.waitForURL(/\/register\/wizard\//);

  await expect(wizard.completionMessage).toBeVisible();

  const db2 = openLiveDb();
  expect(getMemberField(db2, persona.memberId, 'show_competitive_results')).toBe(1);
  db2.close();

  await ctx.close();
});

test('completion page: text correct, profile link works', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `w_comp_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await wizard.skipCurrentTask();
  // club_affiliations auto-transitions for brand-new player
  await page.waitForURL(/\/register\/wizard\//);
  await wizard.skipCurrentTask();
  await wizard.skipCurrentTask();
  await page.waitForURL(/\/register\/wizard\/complete/);

  await expect(wizard.completionMessage).toBeVisible();
  await expect(wizard.profileLink).toBeVisible();
  await wizard.profileLink.click();
  expect(page.url()).toContain(`/members/${persona.slug}`);

  await ctx.close();
});

test('skip all four tasks end-to-end -> completion -> profile', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `w_all_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await wizard.skipCurrentTask();
  // club_affiliations auto-skips for no-match member
  await page.waitForURL(/\/register\/wizard\//);
  await wizard.skipCurrentTask();
  await wizard.skipCurrentTask();
  await page.waitForURL(/\/register\/wizard\/complete/);

  await expect(wizard.completionMessage).toBeVisible();

  const db2 = openLiveDb();
  expect(getTaskState(db2, persona.memberId, 'legacy_claim')).toBe('skipped');
  expect(getTaskState(db2, persona.memberId, 'first_competition_year')).toBe('skipped');
  expect(getTaskState(db2, persona.memberId, 'show_competitive_results')).toBe('skipped');
  db2.close();

  await ctx.close();
});

test('browser reload mid-wizard preserves state', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `w_rel_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await wizard.skipCurrentTask();
  await page.waitForURL(/\/register\/wizard\//);

  const urlBeforeReload = page.url();
  await page.reload();
  expect(page.url()).toBe(urlBeforeReload);
  await expect(wizard.heading).toBeVisible();

  await ctx.close();
});

test('unknown taskType renders 404', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier0Member(db, { slug: `w_404_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();

  const res = await page.goto('/register/wizard/bogus_task');
  expect(res?.status()).toBe(404);

  await ctx.close();
});
