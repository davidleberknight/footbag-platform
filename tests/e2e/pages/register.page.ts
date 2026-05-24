/**
 * Page object for registration flow: /register, /register/check-email,
 * and the simulated-email-card (dev mode only).
 */
import type { Page } from '@playwright/test';

export class RegisterPage {
  constructor(private page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/register');
  }

  get realNameInput() {
    return this.page.getByLabel('Full legal name');
  }

  get emailInput() {
    return this.page.getByLabel('Email address');
  }

  get passwordInput() {
    return this.page.locator('#password');
  }

  get confirmPasswordInput() {
    return this.page.locator('#confirmPassword');
  }

  get submitButton() {
    return this.page.getByRole('button', { name: /create account/i });
  }

  async fillRegistration(opts: {
    realName: string;
    email: string;
    password: string;
  }): Promise<void> {
    await this.realNameInput.fill(opts.realName);
    await this.emailInput.fill(opts.email);
    await this.passwordInput.fill(opts.password);
    await this.confirmPasswordInput.fill(opts.password);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /** On /register/check-email, extract the verify URL from the simulated email card. */
  async getSimulatedVerifyUrl(): Promise<string | null> {
    const card = this.page.locator('.sec-card-dev, .sec-card');
    if (await card.count() === 0) return null;
    const verifyLink = card.locator('a[href*="/verify/"]');
    if (await verifyLink.count() === 0) return null;
    return verifyLink.first().getAttribute('href');
  }
}
