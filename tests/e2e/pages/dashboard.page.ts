/**
 * Page object for the member dashboard / personal home (/members/:slug).
 * A profile page exists only for a full member: a pending registrant who
 * requests their own page is routed to their next outstanding wizard task,
 * so resume-from-anywhere is the gate redirect, not an on-page widget.
 */
import type { Page } from '@playwright/test';

export class DashboardPage {
  constructor(private page: Page) {}

  async goto(slug: string): Promise<void> {
    await this.page.goto(`/members/${slug}`);
  }

  get heading() {
    return this.page.getByRole('heading', { level: 1 });
  }

}
