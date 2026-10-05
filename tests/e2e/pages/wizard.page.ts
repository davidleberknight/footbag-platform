/**
 * Page object for the onboarding wizard (/register/wizard/:taskType).
 * Uses accessible role/name locators per Playwright best practice.
 */
import { expect, type Locator, type Page } from '@playwright/test';

export class WizardPage {
  constructor(private page: Page) {}

  async goto(taskType: string): Promise<void> {
    await this.page.goto(`/register/wizard/${taskType}`);
  }

  // legacy_claim's two non-claiming answers, either of which COMPLETES the task.
  // They are separate controls because they are different facts: a registrant
  // who did hold an old account is never asked to say they did not in order to
  // finish signing up.
  get neverHadOldAccountButton() {
    return this.page.getByRole('button', { name: /I Never Had an Old Account/i });
  }

  get cannotFindOldAccountButton() {
    return this.page.getByRole('button', { name: /I Had One but Cannot Find It/i });
  }

  // The last attempt at the match, opened by the cannot-find-it answer. It gates
  // nothing: the task is already complete by the time it renders.
  get sharpenBirthDateForm() {
    return this.page.locator('form[action="/register/wizard/legacy_claim/birth-date"]');
  }

  // One claim-step card, found by the name it shows.
  card(name: string): Locator {
    return this.page.locator('li.candidate-card').filter({ hasText: name });
  }

  get cards(): Locator {
    return this.page.locator('li.candidate-card');
  }

  claimButton(card: Locator): Locator {
    return card.getByRole('button', { name: /This Is Me, Link My History/i });
  }

  recordClaimLink(card: Locator): Locator {
    return card.getByRole('link', { name: /Claim This Record/i });
  }

  surnameClaimButton(card: Locator): Locator {
    return card.getByRole('button', { name: /This Is Me, I Used the Surname/i });
  }

  declineButton(card: Locator): Locator {
    return card.getByRole('button', { name: /This Is Not Me/i });
  }

  get oldEmailInput() {
    return this.page.locator('#oldEmail');
  }

  get addOldEmailButton() {
    return this.page.getByRole('button', { name: 'Add Old Email' });
  }

  // club_affiliations' explicit no-club answer on the wrap-up landing. It
  // completes the task; there is no skip anywhere in the wizard.
  get noClubsButton() {
    return this.page.getByRole('button', { name: /Finish Without a Club/i }).first();
  }

  get heading() {
    return this.page.getByRole('heading', { level: 1 });
  }

  // Completes the current task by its explicit answer control and waits for the
  // destination the caller names. legacy_claim is answered by the never-had-one
  // answer; club_affiliations by the no-club answer. personal_details is
  // required and cannot be advanced this way.
  async answerCurrentTask(expected: RegExp): Promise<void> {
    const url = this.page.url();
    if (url.includes('legacy_claim')) {
      await this.neverHadOldAccountButton.click();
    } else if (url.includes('club_affiliations')) {
      await this.noClubsButton.click();
    } else {
      throw new Error(`answerCurrentTask: current task has no explicit answer control: ${url}`);
    }
    await expect(this.page).toHaveURL(expected);
  }

  // First competition year field on personal_details.
  get yearInput() {
    return this.page.locator('#year');
  }

  // personal_details submit. Its label reads "Save and Continue" while more
  // tasks remain and "Save and Complete" on the last one.
  get saveButton() {
    return this.page.getByRole('button', { name: /Save and (Continue|Complete) Onboarding/ }).first();
  }

  // Fills the personal_details required fields (city, country, region where the
  // country needs one, and the date of birth) plus an optional
  // first-competition year, then saves and waits for the destination named.
  async fillPersonalDetailsAndSave(
    expected: RegExp,
    opts: {
      city?: string; country?: string; region?: string; year?: string;
      birthDay?: string; birthMonth?: string; birthYear?: string;
    } = {},
  ): Promise<void> {
    await this.page.locator('#city').fill(opts.city ?? 'Portland');
    await this.selectCountry(opts.country ?? 'United States', opts.region ?? 'OR');
    await this.fillBirthDate(opts);
    if (opts.year !== undefined) await this.yearInput.fill(opts.year);
    await this.saveButton.click();
    await expect(this.page).toHaveURL(expected);
  }

  // The date is three labelled parts, with the month chosen by name.
  async fillBirthDate(
    opts: { birthDay?: string; birthMonth?: string; birthYear?: string } = {},
  ): Promise<void> {
    await this.page.locator('#birthDay').fill(opts.birthDay ?? '15');
    await this.page.locator('#birthMonth').selectOption(opts.birthMonth ?? '1');
    await this.page.locator('#birthYear').fill(opts.birthYear ?? '2000');
  }

  // Country is a picker, and choosing the USA or Canada turns the region field
  // into a state/province picker the form requires. The region control is
  // whichever one the server rendered for the country already on file, so this
  // sets it when it is a picker and leaves a free-text region alone.
  async selectCountry(country: string, region: string): Promise<void> {
    await this.page.locator('#country').selectOption({ label: country });
    const regionSelect = this.page.locator('select#region');
    if (await regionSelect.count()) await regionSelect.selectOption(region);
  }

  // Club affiliations task
  get clubCardHeading() {
    return this.page.locator('.card-title').first();
  }

  get clubYesRadio() {
    return this.page.locator('input[name="userDecision"][value="confirm"]');
  }

  get clubNoRadio() {
    return this.page.locator('input[name="userDecision"][value="decline"]');
  }

  get clubSaveAnswersButton() {
    return this.page.getByRole('button', { name: /Save Answers/i }).first();
  }

  get clubProgressText() {
    return this.page.locator('.text-muted.fs-sm').first();
  }

  // Error display
  get inlineError() {
    return this.page.locator('[role="alert"]');
  }

  get successBanner() {
    return this.page.locator('[role="status"]');
  }

  // Completion page
  get completionMessage() {
    return this.page.getByText(/onboarding is complete/i);
  }

  get profileLink() {
    return this.page.getByRole('link', { name: /continue to your profile/i });
  }
}
