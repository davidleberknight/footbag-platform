/**
 * Page object for the onboarding wizard (/register/wizard/:taskType).
 * Uses accessible role/name locators per Playwright best practice.
 */
import type { Page } from '@playwright/test';

export class WizardPage {
  constructor(private page: Page) {}

  async goto(taskType: string): Promise<void> {
    await this.page.goto(`/register/wizard/${taskType}`);
  }

  // legacy_claim's "nothing to claim" decision, which COMPLETES the task.
  get continueWithoutLinkingButton() {
    return this.page.getByRole('button', { name: /Continue Without Linking a Past Account/i });
  }

  // club_affiliations skip control (wrap-up "Skip for Now" or the cards-view
  // "Skip Remaining Clubs for Now").
  get skipClubButton() {
    return this.page.getByRole('button', { name: /Skip (Remaining Clubs )?for Now/i }).first();
  }

  // The advance/skip control on the current task page: legacy_claim's
  // continue-without-linking, or club_affiliations' skip. personal_details has
  // no such control; its required fields must be filled and saved.
  get skipButton() {
    return this.page
      .getByRole('button', { name: /Continue Without Linking a Past Account|Skip (Remaining Clubs )?for Now/i })
      .first();
  }

  get dashboardLink() {
    return this.page.getByRole('link', { name: /Back to dashboard/i });
  }

  get heading() {
    return this.page.getByRole('heading', { level: 1 });
  }

  // Advances past the current task using its own control. legacy_claim is
  // completed by the continue-without-linking decision; club_affiliations is
  // skipped. personal_details is required and cannot be advanced this way.
  async skipCurrentTask(): Promise<void> {
    const url = this.page.url();
    if (url.includes('legacy_claim')) {
      await this.continueWithoutLinkingButton.click();
    } else if (url.includes('club_affiliations')) {
      await this.skipClubButton.click();
    } else {
      throw new Error(`skipCurrentTask: current task has no skip/continue control: ${url}`);
    }
    await this.page.waitForURL(/\/register\/wizard\//);
  }

  // Legacy claim task
  get identifierInput() {
    return this.page.locator('#identifier');
  }

  get findButton() {
    return this.page.getByRole('button', { name: 'Find' });
  }

  async submitIdentifier(identifier: string): Promise<void> {
    await this.identifierInput.fill(identifier);
    await this.findButton.click();
    await this.page.waitForURL(/\/register\/wizard\//);
  }

  // First competition year task
  get yearInput() {
    return this.page.locator('#year');
  }

  // personal_details submit. Its label reads "Save and Continue" while more
  // tasks remain and "Save and Complete" on the last one.
  get saveButton() {
    return this.page.getByRole('button', { name: /Save and (Continue|Complete) Onboarding/ }).first();
  }

  async submitYear(year: string): Promise<void> {
    await this.yearInput.fill(year);
    await this.saveButton.click();
    await this.page.waitForURL(/\/register\/wizard\//);
  }

  // Fills the personal_details required fields (city, country, birthDate) plus
  // an optional first-competition year, then saves and waits for the advance.
  async fillPersonalDetailsAndSave(
    opts: { city?: string; country?: string; birthDate?: string; year?: string } = {},
  ): Promise<void> {
    await this.page.locator('#city').fill(opts.city ?? 'Portland');
    await this.page.locator('#country').fill(opts.country ?? 'US');
    await this.page.locator('#birthDate').fill(opts.birthDate ?? '2000-01-15');
    if (opts.year !== undefined) await this.yearInput.fill(opts.year);
    await this.saveButton.click();
    await this.page.waitForURL(/\/register\/wizard\//);
  }

  // Show competitive results task
  get resultsToggle() {
    return this.page.locator('input[name="enabled"]');
  }

  // Club affiliations task
  get clubCardHeading() {
    return this.page.locator('.card-title').first();
  }

  get clubMembershipQuestion() {
    return this.page.locator('fieldset:has(input[name="userDecision"]) legend');
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

  get skipRemainingClubsButton() {
    return this.page.getByRole('button', { name: /Skip remaining clubs/i });
  }

  get clubProgressText() {
    return this.page.locator('.text-muted.fs-sm').first();
  }

  get signalChecklist() {
    return this.page.locator('.signal-checklist');
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
    return this.page.getByText(/onboarding tasks are handled/i);
  }

  get profileLink() {
    return this.page.getByRole('link', { name: /continue to your profile/i });
  }

  currentUrl(): string {
    return this.page.url();
  }
}
