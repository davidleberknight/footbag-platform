/**
 * Core onboarding wizard flow in a real browser: every task answered in order
 * through its own form, the completion page and its way onward, and the one
 * personal-details input whose handling only the browser round trip shows.
 * Every task is required; the only way past one is to answer it.
 */
import { test, expect } from '@playwright/test';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';
import { seedBrandNewPlayer, seedMemberMidWizard, getTaskState, getMemberField, raiseClaimRateLimits } from './helpers/onboarding';
import { WizardPage } from './pages/wizard.page';

test.beforeAll(() => {
  const db = openLiveDb();
  raiseClaimRateLimits(db);
  db.close();
});

test('personal_details: an empty first-competition year is accepted and stored as none', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberMidWizard(db, { slug: `w_eyr_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('personal_details');
  await wizard.fillPersonalDetailsAndSave(/\/register\/wizard\/club_affiliations$/, { year: '' });

  const db2 = openLiveDb();
  expect(getMemberField(db2, persona.memberId, 'first_competition_year')).toBeNull();
  expect(getTaskState(db2, persona.memberId, 'personal_details')).toBe('completed');
  db2.close();

  await ctx.close();
});

test('answering all three tasks in order reaches the completion page, every task is completed, and the profile link works', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `w_all_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('personal_details');
  await wizard.fillPersonalDetailsAndSave(/\/register\/wizard\/legacy_claim$/);
  await wizard.answerCurrentTask(/\/register\/wizard\/club_affiliations$/);
  await wizard.answerCurrentTask(/\/register\/wizard\/complete$/);

  await expect(wizard.completionMessage).toBeVisible();

  // Onboarding is complete only when all three tasks are completed, so an
  // answered task in any other state would leave the member fenced out.
  const db2 = openLiveDb();
  expect(getTaskState(db2, persona.memberId, 'personal_details')).toBe('completed');
  expect(getTaskState(db2, persona.memberId, 'legacy_claim')).toBe('completed');
  expect(getTaskState(db2, persona.memberId, 'club_affiliations')).toBe('completed');
  db2.close();

  await wizard.profileLink.click();
  await expect(page).toHaveURL(new RegExp(`/members/${persona.slug}$`));

  await ctx.close();
});
