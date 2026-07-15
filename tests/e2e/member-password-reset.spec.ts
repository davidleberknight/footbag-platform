/**
 * Password-reset happy path in a real browser: request a reset link from the
 * forgot-password form, recover the link from the dev simulated-email card the
 * stub SES adapter renders on the sent page, set a new password on the token
 * page, and land authenticated on the member's own profile. Production renders
 * no card, so no token ever reaches a live visitor; the live-adapter suites pin
 * that. The browser layer is what proves the emailed link is well-formed, the
 * token page's form posts to the right handler, and the session cookie is issued
 * on success.
 */
import { test, expect } from '@playwright/test';
import { seedTier0Member } from '../fixtures/personas';
import { openLiveDb } from './helpers/wizard-auth';

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

test('forgot -> emailed link -> set new password -> authenticated on own profile', { tag: ['@security'] }, async ({ page }) => {
  const email = `pwreset-${rand()}-${Date.now()}@example.com`;
  const db = openLiveDb();
  const persona = seedTier0Member(db, { slug: `pwreset_${rand()}`, overrides: { login_email: email } });
  db.close();

  await page.goto('/password/forgot');
  await page.locator('#email').fill(email);
  await page.getByRole('button', { name: /Send Reset Link/i }).click();

  // Uniform sent page. Under the stub SES adapter (dev and e2e) the
  // simulated-email card shows the submitter's own reset link so a tester
  // finishes the reset on the page; production renders no card at all, which the
  // live-adapter suites pin. Recover the link from that card, the tester's
  // on-page recovery surface.
  await expect(page.getByText(/reset/i).first()).toBeVisible();
  const resetLink = page.locator('.sec-card-dev a[href*="/password/reset/"]');
  await expect(resetLink).toHaveCount(1);
  const resetHref = await resetLink.first().getAttribute('href');
  const resetPath = new URL(resetHref ?? '', page.url()).pathname;
  await page.goto(resetPath);

  const newPassword = `Corr3ct-Horse-${rand()}`;
  await page.locator('#newPassword').fill(newPassword);
  await page.locator('#confirmPassword').fill(newPassword);
  await page.getByRole('button', { name: /Set New Password/i }).click();

  // Success issues a session cookie and redirects to the member's own profile,
  // matching the login and verify flows.
  await page.waitForURL(/\/members\//);
  expect(page.url()).toContain(`/members/${persona.slug}`);
});
