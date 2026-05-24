/**
 * Page object for the member dashboard / personal home (/members/:slug).
 * Focuses on the onboarding task widget.
 */
import type { Page } from '@playwright/test';

export class DashboardPage {
  constructor(private page: Page) {}

  async goto(slug: string): Promise<void> {
    await this.page.goto(`/members/${slug}`);
  }

  get taskWidget() {
    return this.page.locator('.onboarding-task-widget');
  }

  get resumeButtons() {
    return this.page.locator('.onboarding-task-cta');
  }

  async clickFirstResume(): Promise<void> {
    await this.resumeButtons.first().click();
    await this.page.waitForURL(/\/register\/wizard\//);
  }

  get heading() {
    return this.page.getByRole('heading', { level: 1 });
  }

  get skippedSection() {
    return this.page.locator('.onboarding-task-list-skipped');
  }

  get skippedIntroText() {
    return this.page.getByText(/You skipped these/i);
  }

  get pendingTasks() {
    return this.page.locator('.onboarding-task-list:not(.onboarding-task-list-skipped) .onboarding-task-row');
  }

  get skippedTasks() {
    return this.page.locator('.onboarding-task-list-skipped .onboarding-task-row');
  }

  get taskLabels() {
    return this.page.locator('.onboarding-task-label');
  }

  get legacyClaimCta() {
    return this.page.locator('a[href*="/register/wizard/legacy_claim"]');
  }
}
