/**
 * Club affiliation wizard task in a real browser: per-card confirm and decline
 * through the card form, the multi-card progression, and the wrap-up landing a
 * member with no cards reaches, whose explicit no-club answer completes the
 * task and which offers no way out of the wizard. The task is optional to
 * fulfil but not to answer: it completes only on a recorded explicit answer.
 *
 * The member reaches their cards through the old account their claim step
 * holds. A prospective member's card answers are held too, so the suggestion
 * rows stay pending mid-wizard, and the claim and every club answer are written
 * together when the last step is answered.
 */
import { test, expect } from '@playwright/test';
import type BetterSqlite3 from 'better-sqlite3';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';
import {
  seedBrandNewPlayer,
  seedMemberWithClubCards,
  getTaskState,
  getAffiliationStatus,
  getHeldAnswer,
  getMemberField,
  isLegacyClaimed,
  countClubMemberships,
  completeThroughLegacyClaim,
} from './helpers/onboarding';
import { WizardPage } from './pages/wizard.page';

const CLUB_STEP = /\/register\/wizard\/club_affiliations$/;

function heldClubAnswers(db: BetterSqlite3.Database, memberId: string): Array<Record<string, unknown>> {
  const held = getHeldAnswer(db, memberId, 'club_affiliations') as { answers?: Array<Record<string, unknown>> } | null;
  return held?.answers ?? [];
}

// The held claim the cards were derived from has landed and every hold is
// released, so the answers just written belong to the claimed identity.
function expectClaimLandedAndReleased(
  db: BetterSqlite3.Database,
  persona: { memberId: string; legacyMemberId: string; personId: string },
): void {
  expect(getMemberField(db, persona.memberId, 'legacy_member_id')).toBe(persona.legacyMemberId);
  expect(getMemberField(db, persona.memberId, 'historical_person_id')).toBe(persona.personId);
  expect(isLegacyClaimed(db, persona.legacyMemberId)).toBe(true);
  expect(getHeldAnswer(db, persona.memberId, 'legacy_claim')).toBeNull();
  expect(getHeldAnswer(db, persona.memberId, 'club_affiliations')).toBeNull();
}

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

  // Answering the only card was the last step owed, so the claim and the
  // confirmation landed together: the suggestion resolved and the member is in
  // the club.
  const db2 = openLiveDb();
  expect(getAffiliationStatus(db2, persona.affiliationIds[0])).toBe('confirmed_current');
  expect(countClubMemberships(db2, persona.memberId, persona.clubIds[0])).toBe(1);
  expect(getTaskState(db2, persona.memberId, 'club_affiliations')).toBe('completed');
  expectClaimLandedAndReleased(db2, persona);
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

  // The decline is held, not written: the suggestion stays pending and the
  // claim behind the card is still unwritten while the member owes a step.
  const db2 = openLiveDb();
  expect(getAffiliationStatus(db2, persona.affiliationIds[0])).toBe('pending');
  expect(heldClubAnswers(db2, persona.memberId)).toEqual([
    expect.objectContaining({ kind: 'card', candidateId: persona.affiliationIds[0], userDecision: 'decline' }),
  ]);
  expect(getMemberField(db2, persona.memberId, 'legacy_member_id')).toBeNull();
  expect(getTaskState(db2, persona.memberId, 'club_affiliations')).toBe('pending');
  db2.close();

  await wizard.answerCurrentTask(/\/register\/wizard\/complete$/);

  const db3 = openLiveDb();
  expect(getAffiliationStatus(db3, persona.affiliationIds[0])).toBe('rejected');
  expect(countClubMemberships(db3, persona.memberId, persona.clubIds[0])).toBe(0);
  expectClaimLandedAndReleased(db3, persona);
  db3.close();

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

  const mid = openLiveDb();
  for (const affiliationId of persona.affiliationIds) {
    expect(getAffiliationStatus(mid, affiliationId), affiliationId).toBe('pending');
  }
  expect(heldClubAnswers(mid, persona.memberId)).toHaveLength(persona.affiliationIds.length);
  mid.close();

  await wizard.answerCurrentTask(/\/register\/wizard\/complete$/);

  const db2 = openLiveDb();
  for (const [i, affiliationId] of persona.affiliationIds.entries()) {
    expect(getAffiliationStatus(db2, affiliationId), affiliationId).toBe('rejected');
    expect(countClubMemberships(db2, persona.memberId, persona.clubIds[i]), affiliationId).toBe(0);
  }
  expect(getTaskState(db2, persona.memberId, 'club_affiliations')).toBe('completed');
  expectClaimLandedAndReleased(db2, persona);
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
