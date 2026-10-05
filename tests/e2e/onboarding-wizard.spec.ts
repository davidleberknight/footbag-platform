/**
 * Browser-only onboarding behaviour: the session chain from registration
 * through sign-out and back, the gate routing a pending registrant to the step
 * they owe, the registration form's client-side defaults, and keyboard and
 * grouping accessibility. Everything else lives in the integration suite.
 */
import { randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import {
  seedMemberWithClubCards,
  seedTier0Member,
  completePersonalDetails,
  getTaskState,
} from './helpers/onboarding';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';
import { WizardPage } from './pages/wizard.page';
import { DashboardPage } from './pages/dashboard.page';
import { RegisterPage } from './pages/register.page';

// Letters only: a legal name may not contain digits, and the surname also
// becomes part of the permanent profile address, so it varies per run.
function lettersOnly(n = 8): string {
  return Array.from(randomBytes(n)).map((b) => String.fromCharCode(97 + (b % 26))).join('');
}

test('a registrant who signs out part-way through and signs back in is returned to the step they still owe, and can finish', { tag: ['@smoke'] }, async ({ page }) => {
  const email = `e2e-reg-${lettersOnly()}@example.com`;
  const password = 'e2e-test-password-123';
  const surname = `Newbie${lettersOnly(6)}`;
  const registerPage = new RegisterPage(page);
  const wizard = new WizardPage(page);

  await registerPage.goto();
  await registerPage.fillRegistration({ givenNames: 'Test', familyName: surname, email, password });
  await registerPage.submit();
  await expect(page).toHaveURL(/\/register\/check-email/);

  const verifyUrl = await registerPage.getSimulatedVerifyUrl();
  expect(verifyUrl, 'dev simulated-email card should contain a verify link').toBeTruthy();
  await page.goto(verifyUrl!);
  // A freshly verified registrant is pending, never a member with a profile.
  await expect(page).toHaveURL(/\/register\/wizard\/personal_details$/);

  // A country with no state or province list, so the form asks for no region:
  // a new account has no country on file, and the region picker for the USA
  // and Canada appears only once the country is saved.
  await wizard.fillPersonalDetailsAndSave(/\/register\/wizard\/legacy_claim$/, { city: 'Lyon', country: 'France' });
  await wizard.answerCurrentTask(/\/register\/wizard\/club_affiliations$/);

  await page.getByRole('button', { name: 'Logout' }).click();
  await page.goto('/register/wizard/legacy_claim');
  await expect(page).toHaveURL(/\/login\?returnTo=/);

  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Log In' }).click();
  // The claim step is answered, so the gate sends the member to the step they owe.
  await expect(page).toHaveURL(/\/register\/wizard\/club_affiliations$/);

  await wizard.answerCurrentTask(/\/register\/wizard\/complete$/);
  await wizard.profileLink.click();
  await expect(page).toHaveURL(/\/members\/[a-z0-9_]+$/);
  expect(page.url()).toContain(surname.toLowerCase());
});

test('a pending registrant visiting their own profile is routed to the next outstanding task', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier0Member(db, { slug: `e2e_resume_${Date.now()}` });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await wizard.answerCurrentTask(/\/register\/wizard\/club_affiliations$/);

  // Resume is the gate redirect: the profile page does not exist while
  // pending, so requesting it lands on the next outstanding wizard task.
  const dashboard = new DashboardPage(page);
  await dashboard.goto(persona.slug);
  await expect(page).toHaveURL(/\/register\/wizard\/club_affiliations$/);

  await context.close();
});

test('the registration form fills the display name and profile address from the legal name, keeps a value the visitor edited, and refuses a short password', async ({ page }) => {
  const registerPage = new RegisterPage(page);
  await registerPage.goto();

  const surname = `Defaults${lettersOnly(6)}`;
  await registerPage.givenNamesInput.fill('Jane');
  await registerPage.familyNameInput.fill(surname);
  await registerPage.familyNameInput.blur();
  await expect(page.locator('#displayName')).toHaveValue(`Jane ${surname}`);
  await expect(page.locator('#slug')).toHaveValue(`jane_${surname.toLowerCase()}`);

  // A display name the visitor typed is theirs and is not overwritten.
  await page.locator('#displayName').fill(`JJ ${surname}`);
  await page.locator('#displayName').blur();
  await registerPage.givenNamesInput.fill('Janet');
  await registerPage.givenNamesInput.blur();
  await expect(page.locator('#displayName')).toHaveValue(`JJ ${surname}`);

  await registerPage.emailInput.fill(`e2e-def-${lettersOnly()}@example.com`);
  await registerPage.passwordInput.fill('short');
  await registerPage.confirmPasswordInput.fill('short');
  await registerPage.submit();
  await expect(page).toHaveURL(/\/register$/);
  const message = await registerPage.passwordInput.evaluate((el: HTMLInputElement) => el.validationMessage);
  expect(message).toBeTruthy();
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
  await expect(fieldset.locator('legend.card-title')).toBeVisible();

  const radios = fieldset.locator('input[type="radio"][name="selectedCandidateIds"]');
  expect(await radios.count()).toBeGreaterThan(1);
  await expect(fieldset.locator('input[type="checkbox"]')).toHaveCount(0);

  await context.close();
});

test('choosing one club on the grouped card leads to that club\'s own card, and answering it finishes the step', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithClubCards(db, {
    slug: `e2e_club_group_${Date.now()}`,
    clubCount: 2,
    city: `Groupville${lettersOnly(4)}`,
    withCoLeader: true,
  });
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');
  await page.locator('input[name="selectedCandidateIds"]').first().check();
  await page.getByRole('button', { name: 'Confirm Selection' }).click();
  await expect(page).toHaveURL(/\/register\/wizard\/club_affiliations$/);
  await expect(wizard.clubYesRadio).toBeVisible();

  await page.locator('input[name="activitySignal"][value="active"]').check();
  await wizard.clubYesRadio.check();
  await wizard.clubSaveAnswersButton.click();
  await expect(page).toHaveURL(/\/register\/wizard\/complete$/);

  const db2 = openLiveDb();
  expect(getTaskState(db2, persona.memberId, 'club_affiliations')).toBe('completed');
  db2.close();

  await context.close();
});

test('the never-had-one answer is keyboard-reachable and activatable', { tag: ['@a11y'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier0Member(db, { slug: `e2e_kbd_${Date.now()}` });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const context = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await context.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');

  // Either answer submits on its own, so keyboard activation is exercised
  // directly on the button rather than after satisfying a separate control.
  await wizard.neverHadOldAccountButton.focus();
  await expect(wizard.neverHadOldAccountButton).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/register\/wizard\/club_affiliations$/);

  await context.close();
});
