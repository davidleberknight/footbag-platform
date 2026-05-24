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

  get skipButton() {
    return this.page.getByRole('button', { name: /Skip for now/i });
  }

  get dashboardLink() {
    return this.page.getByRole('link', { name: /Back to dashboard/i });
  }

  get heading() {
    return this.page.getByRole('heading', { level: 1 });
  }

  async skipCurrentTask(): Promise<void> {
    await this.skipButton.click();
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

  get saveButton() {
    return this.page.getByRole('button', { name: 'Save' });
  }

  async submitYear(year: string): Promise<void> {
    await this.yearInput.fill(year);
    await this.saveButton.click();
    await this.page.waitForURL(/\/register\/wizard\//);
  }

  // Show competitive results task
  get resultsToggle() {
    return this.page.locator('input[name="enabled"]');
  }

  // Club affiliations task
  get clubCardHeading() {
    return this.page.locator('h2').first();
  }

  get clubYesButton() {
    return this.page.locator('.wizard-card-actions button[value="confirm"]');
  }

  get clubNoButton() {
    return this.page.locator('.wizard-card-actions button[value="decline"]');
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
