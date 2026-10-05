/**
 * Club affiliation wizard task in a real browser: per-card confirm and decline
 * through the card form, the multi-card progression, and the wrap-up landing a
 * member with no cards reaches, whose explicit no-club answer completes the
 * task and which offers no way out of the wizard. The task is optional to
 * fulfil but not to answer: it completes only on a recorded explicit answer.
 */
import { test, expect } from '@playwright/test';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';
import {
  seedBrandNewPlayer,
  seedMemberWithClubCards,
  getTaskState,
  getAffiliationStatus,
  completeThroughLegacyClaim,
} from './helpers/onboarding';
import { WizardPage } from './pages/wizard.page';

const CLUB_STEP = /\/register\/wizard\/club_affiliations$/;

test('confirm membership card: resolves and advances', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithClubCards(db, { slug: `ca_cfm_${Date.now()}`, clubCount: 1, withCoLeader: true });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');
  await page.locator('input[name="activitySignal"][value="active"]').check();
  await wizard.clubYesRadio.check();
  await wizard.clubSaveAnswersButton.click();
  await expect(page).toHaveURL(/\/register\/wizard\/complete$/);

  const db2 = openLiveDb();
  expect(getAffiliationStatus(db2, persona.affiliationIds[0])).not.toBe('pending');
  expect(getTaskState(db2, persona.memberId, 'club_affiliations')).toBe('completed');
  db2.close();

  await ctx.close();
});

test('decline the only membership card: card resolves, task still needs an answer', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithClubCards(db, { slug: `ca_dec_${Date.now()}`, clubCount: 1 });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');
  await page.locator('input[name="activitySignal"][value="not_active"]').check();
  await wizard.clubNoRadio.check();
  await wizard.clubSaveAnswersButton.click();

  // Running out of cards is not an answer to the task. The member lands back on
  // the club step's wrap-up landing and the task stays outstanding until the
  // explicit no-club answer is given there.
  await expect(page).toHaveURL(CLUB_STEP);
  await expect(wizard.noClubsButton).toBeVisible();

  const db2 = openLiveDb();
  expect(getAffiliationStatus(db2, persona.affiliationIds[0])).toBe('rejected');
  expect(getTaskState(db2, persona.memberId, 'club_affiliations')).toBe('pending');
  db2.close();

  await ctx.close();
});

test('with no cards the club step renders the wrap-up landing, stays pending, and Finish Without a Club completes it', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `ca_fin_${Date.now()}` });
  completeThroughLegacyClaim(db, persona.memberId);
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');
  await expect(page).toHaveURL(CLUB_STEP);
  await expect(wizard.noClubsButton).toBeVisible();
  const db2 = openLiveDb();
  expect(getTaskState(db2, persona.memberId, 'club_affiliations')).toBe('pending');
  db2.close();

  await wizard.answerCurrentTask(/\/register\/wizard\/complete$/);
  const db3 = openLiveDb();
  expect(getTaskState(db3, persona.memberId, 'club_affiliations')).toBe('completed');
  db3.close();

  await ctx.close();
});

test('wrap-up landing offers no way out of the wizard into a club capability page', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `ca_noout_${Date.now()}` });
  completeThroughLegacyClaim(db, persona.memberId);
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');
  // The landing itself, not a redirect elsewhere, is what is under test.
  await expect(page).toHaveURL(CLUB_STEP);
  await expect(wizard.noClubsButton).toBeVisible();

  // Joining and creating clubs are member capabilities the onboarding gate is
  // still fencing, so a link to one from inside the wizard would bounce the
  // member straight back here.
  const section = page.locator('.wrapper section');
  await expect(section.locator('a[href^="/clubs"]')).toHaveCount(0);

  await ctx.close();
});

test('declining each card in turn reaches the wrap-up, and Finish Without a Club completes the task', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithClubCards(db, { slug: `ca_none_all_${Date.now()}`, clubCount: 2 });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  // Each card is answered on its own; there is no bulk exit beside an open card.
  await wizard.goto('club_affiliations');
  for (let i = 0; i < persona.affiliationIds.length; i++) {
    await wizard.clubNoRadio.check();
    await page.getByRole('radio', { name: /Not active anymore/i }).check();
    await wizard.clubSaveAnswersButton.click();
    await expect(page).toHaveURL(CLUB_STEP);
  }

  await wizard.answerCurrentTask(/\/register\/wizard\/complete$/);

  const db2 = openLiveDb();
  for (const affiliationId of persona.affiliationIds) {
    expect(getAffiliationStatus(db2, affiliationId)).toBe('rejected');
  }
  expect(getTaskState(db2, persona.memberId, 'club_affiliations')).toBe('completed');
  db2.close();

  await ctx.close();
});

test('multi-card flow: resolve first, see second with updated progress', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithClubCards(db, { slug: `ca_mc_${Date.now()}`, clubCount: 2 });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');

  const progressBefore = await wizard.clubProgressText.textContent();
  expect(progressBefore).toMatch(/2 clubs to review/i);

  await page.locator('input[name="activitySignal"][value="active"]').check();
  await wizard.clubYesRadio.check();
  await wizard.clubSaveAnswersButton.click();
  await expect(page).toHaveURL(CLUB_STEP);

  await expect(wizard.successBanner).toBeVisible();
  await expect(wizard.clubYesRadio).toBeVisible();

  await ctx.close();
});
