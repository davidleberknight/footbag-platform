/**
 * Club affiliation wizard task: card rendering, confirm/decline,
 * leadership cards with signals, multi-card flow, auto-transition
 * for no-cards, skip, and junk candidate exclusion.
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
  await expect(wizard.skipRemainingClubsButton).toBeVisible();

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

test('decline membership card: resolves and advances', async ({ browser, baseURL }) => {
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

  const db2 = openLiveDb();
  expect(getAffiliationStatus(db2, persona.affiliationIds[0])).toBe('rejected');
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
  expect(question).toMatch(/Were you a contact for/i);
  await expect(wizard.signalChecklist).toBeVisible();
  await expect(wizard.clubYesRadio).toBeVisible();

  await ctx.close();
});

test('no cards -> club_affiliations renders the wrap-up landing, stays pending', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `ca_none_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');

  // club_affiliations is universal: a brand-new player with no suggestion cards
  // still reaches the find-or-create-your-club wrap-up landing rather than an
  // empty page, and the task stays pending.
  expect(page.url()).toContain('club_affiliations');
  await expect(page.locator('text=Find or create your club')).toBeVisible();

  const db2 = openLiveDb();
  const state = getTaskState(db2, persona.memberId, 'club_affiliations');
  expect(state).toBe('pending');
  db2.close();

  await ctx.close();
});

test('skip remaining clubs: task skipped, advances', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithClubCards(db, { slug: `ca_skp_${Date.now()}`, clubCount: 1 });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');
  await wizard.skipRemainingClubsButton.click();
  await page.waitForURL(/\/register\/wizard\//);

  expect(page.url()).not.toContain('club_affiliations');

  const db2 = openLiveDb();
  expect(getTaskState(db2, persona.memberId, 'club_affiliations')).toBe('skipped');
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
  expect(question2).toMatch(/Were you a member of|Were you a contact for/i);

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
