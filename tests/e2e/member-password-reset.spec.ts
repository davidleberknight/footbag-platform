/**
 * Password-reset happy path in a real browser: request a reset link from the
 * forgot-password form, recover the emailed link out-of-band from the captured
 * outbox (the form never renders it, to avoid handing an attacker a live token
 * for any address they type), set a new password on the token page, and land
 * authenticated on the member's own profile. The browser layer is what proves
 * the emailed link is well-formed, the token page's form posts to the right
 * handler, and the session cookie is issued on success.
 */
import { test, expect } from '@playwright/test';
import { seedTier0Member } from '../fixtures/personas';
import { openLiveDb } from './helpers/wizard-auth';

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Recovers the reset link out-of-band from the captured outbox. The sent page
// deliberately never reflects it, so the outbox row keyed by the requesting
// member is the only path to the token.
function passwordResetPath(memberId: string): string {
  const db = openLiveDb();
  try {
    const row = db.prepare(
      `SELECT body_text FROM outbox_emails
       WHERE recipient_member_id = ? AND body_text LIKE '%/password/reset/%'
       ORDER BY created_at DESC LIMIT 1`,
    ).get(memberId) as { body_text: string | null } | undefined;
    const m = row?.body_text?.match(/(\/password\/reset\/[A-Za-z0-9_-]+)/);
    if (!m) throw new Error(`no password-reset link in outbox for member ${memberId}`);
    return m[1];
  } finally {
    db.close();
  }
}

test('forgot -> emailed link -> set new password -> authenticated on own profile', { tag: ['@security'] }, async ({ page }) => {
  const email = `pwreset-${rand()}-${Date.now()}@example.com`;
  const db = openLiveDb();
  const persona = seedTier0Member(db, { slug: `pwreset_${rand()}`, overrides: { login_email: email } });
  db.close();

  await page.goto('/password/forgot');
  await page.locator('#email').fill(email);
  await page.getByRole('button', { name: /Send Reset Link/i }).click();

  // Uniform sent page; the link itself is never on it.
  await expect(page.getByText(/reset/i).first()).toBeVisible();
  await expect(page.locator('a[href*="/password/reset/"]')).toHaveCount(0);

  const resetPath = passwordResetPath(persona.memberId);
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
