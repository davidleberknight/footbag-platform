/**
 * Club affiliation wizard task: card rendering, per-card confirm and decline,
 * leadership cards with signals, multi-card flow, the wrap-up landing a member
 * with no cards reaches, the explicit no-club answer that declines every
 * remaining card at once, and junk candidate exclusion. The task is optional to
 * fulfil but not to answer: it completes only on a recorded explicit answer.
 */
import { test, expect } from '@playwright/test';
import { insertLegacyClubCandidate, insertLegacyPersonClubAffiliation } from '../fixtures/factories';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';
import {
  seedBrandNewPlayer,
  seedMemberWithClubCards,
  seedMemberWithLeadershipCard,
  getTaskState,
  getAffiliationStatus,
  completePersonalDetails,
} from './helpers/onboarding';
import { WizardPage } from './pages/wizard.page';

test('membership card: renders club name, confirm/decline buttons', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithClubCards(db, { slug: `ca_mem_${Date.now()}`, clubCount: 1 });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');
  await expect(wizard.clubCardHeading).toBeVisible();
  const question = await wizard.clubMembershipQuestion.textContent();
  expect(question).toMatch(/Were you a member of/i);

  await expect(wizard.clubYesRadio).toBeVisible();
  await expect(wizard.clubNoRadio).toBeVisible();
  await expect(wizard.clubSaveAnswersButton).toBeVisible();
  // No bulk exit beside an open card: each suggestion is answered on its own
  // card so every answer carries an activity signal; the no-club answer lives
  // on the wrap-up landing only.
  await expect(page.getByRole('button', { name: /None of These Are My Clubs/i })).toHaveCount(0);

  await ctx.close();
});

test('card page opens with the request for help cleaning up the old club data', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithClubCards(db, { slug: `ca_lead_${Date.now()}`, clubCount: 1 });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');
  await expect(page.getByText('Please help us to clean up the old club data.')).toBeVisible();

  await ctx.close();
});

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
  await page.waitForURL(/\/register\/wizard\//);

  expect(page.url()).not.toContain('club_affiliations');

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
  await page.waitForURL(/\/register\/wizard\//);

  // Running out of cards is not an answer to the task. The member lands back on
  // the club step's wrap-up landing and the task stays outstanding until the
  // explicit no-club answer is given there.
  expect(page.url()).toContain('club_affiliations');
  await expect(wizard.noClubsButton).toBeVisible();

  const db2 = openLiveDb();
  expect(getAffiliationStatus(db2, persona.affiliationIds[0])).toBe('rejected');
  expect(getTaskState(db2, persona.memberId, 'club_affiliations')).toBe('pending');
  db2.close();

  await ctx.close();
});

test('leadership card: renders role and signal checklist', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithLeadershipCard(db, { slug: `ca_ldr_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');
  const question = await wizard.clubMembershipQuestion.textContent();
  expect(question).toMatch(/Were you a leader or organizer of/i);
  await expect(wizard.signalChecklist).toBeVisible();
  await expect(wizard.clubYesRadio).toBeVisible();

  await ctx.close();
});

test('no cards -> club_affiliations renders the wrap-up landing, stays pending', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `ca_none_${Date.now()}` });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');

  // The club step is universal: a brand-new player with no suggestion cards
  // still reaches the wrap-up landing rather than an empty page, and the task
  // stays outstanding until the explicit no-club answer is given.
  expect(page.url()).toContain('club_affiliations');
  await expect(page.getByText('Clubs come after onboarding')).toBeVisible();
  await expect(wizard.noClubsButton).toBeVisible();

  const db2 = openLiveDb();
  const state = getTaskState(db2, persona.memberId, 'club_affiliations');
  expect(state).toBe('pending');
  db2.close();

  await ctx.close();
});

test('wrap-up landing offers no way out of the wizard into a club capability page', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `ca_noout_${Date.now()}` });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');

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

  // Each card is answered on its own, so every decline still records an
  // activity signal; there is no bulk exit beside an open card.
  await wizard.goto('club_affiliations');
  for (let i = 0; i < persona.affiliationIds.length; i++) {
    await wizard.clubNoRadio.check();
    await page.getByRole('radio', { name: /Not active anymore/i }).check();
    await wizard.clubSaveAnswersButton.click();
    await page.waitForURL(/\/register\/wizard\//);
    await wizard.goto('club_affiliations');
  }

  await expect(page.getByText('Clubs come after onboarding')).toBeVisible();
  await wizard.noClubsButton.click();
  await page.waitForURL(/\/register\/wizard\//);

  expect(page.url()).not.toContain('club_affiliations');

  const db2 = openLiveDb();
  for (const affiliationId of persona.affiliationIds) {
    expect(getAffiliationStatus(db2, affiliationId)).toBe('rejected');
  }
  expect(getTaskState(db2, persona.memberId, 'club_affiliations')).toBe('completed');
  // The per-card answers are what the mandatory step exists to collect: one
  // activity signal per resolved card.
  const signals = db2.prepare(
    'SELECT COUNT(*) AS c FROM club_viability_signals WHERE member_id = ?',
  ).get(persona.memberId) as { c: number };
  expect(signals.c).toBe(persona.affiliationIds.length);
  db2.close();

  await ctx.close();
});

test('Finish Without a Club on the wrap-up landing completes the task', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `ca_fin_${Date.now()}` });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');
  await wizard.noClubsButton.click();
  await page.waitForURL(/\/register\/wizard\//);

  expect(page.url()).not.toContain('club_affiliations');

  const db2 = openLiveDb();
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
  await page.waitForURL(/\/register\/wizard\/club_affiliations/);

  await expect(wizard.successBanner).toBeVisible();

  await expect(wizard.clubCardHeading).toBeVisible();
  const question2 = await wizard.clubMembershipQuestion.textContent();
  expect(question2).toMatch(/Were you a member of|Were you a leader or organizer of/i);

  await ctx.close();
});

test('junk candidates not shown in wizard', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithClubCards(db, { slug: `ca_jnk_${Date.now()}`, clubCount: 1 });

  const legacyMemberId = (db.prepare('SELECT legacy_member_id FROM members WHERE id = ?').get(persona.memberId) as { legacy_member_id: string }).legacy_member_id;
  const personRow = db.prepare('SELECT person_id FROM historical_persons WHERE legacy_member_id = ?').get(legacyMemberId) as { person_id: string };

  const junkCandidate = insertLegacyClubCandidate(db, {
    classification: 'junk',
    display_name: 'JUNK_INVISIBLE_CLUB',
  });
  insertLegacyPersonClubAffiliation(db, {
    historical_person_id: personRow.person_id,
    legacy_member_id: legacyMemberId,
    legacy_club_candidate_id: junkCandidate,
    inferred_role: 'member',
  });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');

  const body = await page.textContent('body');
  expect(body).not.toContain('JUNK_INVISIBLE_CLUB');

  await ctx.close();
});
