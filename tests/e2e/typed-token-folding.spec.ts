/**
 * A typed profile URL is folded by the site's one rule before it becomes
 * permanent, and the member sees the folded value first, with or without
 * JavaScript.
 *
 * With scripts, the field folds as the member leaves it and the line under it
 * says what changed; a value holding letters with no a to z form is left as
 * typed, for the server to refuse. Without scripts, the first submit comes back
 * holding the folded URL as a notice and creates nothing, and resubmitting the
 * form as rendered, with the password typed again, creates the account.
 */
import { test, expect } from '@playwright/test';

test('with JavaScript the profile URL folds as the member leaves the field', async ({ page }) => {
  await page.goto('/register');
  await page.waitForFunction(() => {
    const fold = (window as unknown as { footbagFold?: { isLoaded(): boolean } }).footbagFold;
    return !!fold && fold.isLoaded();
  });
  const slug = page.locator('#slug');
  const note = page.locator('[data-fold-note]').first();
  await expect(note).toHaveText('');

  await slug.fill('Zoë-Müller');
  await page.locator('#givenNames').focus();
  await expect(slug).toHaveValue('zoe_muller');
  await expect(note).toContainText('zoe_muller');

  await slug.fill('kenji_日本');
  await page.locator('#givenNames').focus();
  await expect(slug).toHaveValue('kenji_日本');
  await expect(note).toHaveText('');
});

test('without JavaScript the folded URL is shown first, then created on resubmit', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL: baseURL!, javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto('/register');
    const stamp = Date.now();
    await page.fill('#givenNames', 'Zoë');
    await page.fill('#familyName', 'Foldspec');
    await page.fill('#email', `foldspec-${stamp}@example.com`);
    await page.fill('#slug', `Zoë-Foldspec-${stamp}`);
    await page.fill('#password', 'securepass123');
    await page.fill('#confirmPassword', 'securepass123');
    await Promise.all([page.waitForLoadState('load'), page.press('#confirmPassword', 'Enter')]);

    await expect(page).toHaveURL(/\/register$/);
    await expect(page.locator('.form-notice')).toHaveCount(1);
    await expect(page.locator('.form-error-banner')).toHaveCount(0);
    await expect(page.locator('#slug')).toHaveValue(`zoe_foldspec_${stamp}`);

    await page.fill('#password', 'securepass123');
    await page.fill('#confirmPassword', 'securepass123');
    await Promise.all([page.waitForURL(/\/register\/check-email/), page.press('#confirmPassword', 'Enter')]);
  } finally {
    await context.close();
  }
});
