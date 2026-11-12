/**
 * The Treasurer walkthrough in a real browser: signed in through the persona
 * switch as the finance administrator, the walk opens each finance page in the
 * order the walkthrough shows them and follows the links a person would click,
 * from the payments dashboard to a commented donation, the newest report and
 * the resolved reconciliation issue. The persona is built through the persona
 * refresh, as a tester builds it. Every business rule on these pages is
 * proved in the integration suite; this checks that the pages render, link to
 * each other and carry the seeded figures when driven by a browser.
 */
import { test, expect } from '@playwright/test';
import { authenticateContext } from './helpers/wizard-auth';
import type { Persona } from '../fixtures/personas';

const SLUG = 'finance_admin';

test('the finance administrator walks the finance pages in the walkthrough order', async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  // Built as a tester builds it: the persona refresh, which also runs the
  // nightly reconciliation and the Treasurer digest the reports page shows.
  // Posted directly, because a stack holding no persona offers no refresh form.
  const refreshed = await context.request.post(`${baseURL}/dev/personas/refresh`, {
    headers: { Origin: baseURL! },
    maxRedirects: 0,
  });
  expect(refreshed.status(), 'the persona refresh redirects back to the listing').toBe(302);
  await authenticateContext(context, baseURL!, { slug: SLUG } as Persona);

  // The payments dashboard: deliveries, the failure today, and volume.
  const health = await page.goto('/admin/payments/health');
  expect(health?.status()).toBe(200);
  await expect(page.getByText('evt_persona_fin_failed')).toBeVisible();

  // All Payments, filtered to donations, then a commented donation's detail.
  const list = await page.goto('/admin/payments?type=donation');
  expect(list?.status()).toBe(200);
  await page.locator('a[href="/admin/payments/pay_persona_fin_d_ada"]').first().click();
  await expect(page).toHaveURL(/\/admin\/payments\/pay_persona_fin_d_ada$/);
  await expect(page.getByText('Thanks for keeping the site running.')).toBeVisible();

  // Financial Reports, then the newest report: the refresh's own run, carrying
  // the seeded euro donations and the explained rehearsal charge forward.
  await page.goto('/admin/payments/reports');
  const reportLinks = page.locator('a[href^="/admin/payments/reports/"]');
  await expect(reportLinks.first()).toBeVisible();
  await reportLinks.first().click();
  await expect(page).toHaveURL(/\/admin\/payments\/reports\/[^/]+$/);
  await expect(page.getByRole('cell', { name: '45.00 EUR' }).first()).toBeVisible();
  await expect(page.getByText(/A rehearsal charge made in Stripe test mode/).first()).toBeVisible();

  // Reconciliation Issues, switched to the resolved view.
  const issues = await page.goto('/admin/payments/reconciliation?status=resolved');
  expect(issues?.status()).toBe(200);
  await expect(page.getByText(/The webhook arrived late/).first()).toBeVisible();

  await context.close();
});
