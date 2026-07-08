/**
 * Admin club-cleanup queue happy path in a real browser: an authenticated
 * admin loads /admin/club-cleanup and the queue renders with a candidate that
 * needs review. The browser layer proves the page's template renders and its
 * chrome (CSP, client assets) does not break the admin surface.
 */
import { test, expect } from '@playwright/test';
import { insertLegacyClubCandidate } from '../fixtures/factories';
import { seedAdmin } from '../fixtures/personas';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

test('admin loads the cleanup queue with a candidate needing review', async ({ browser, baseURL }) => {
  const candidateName = `Cleanup Candidate ${rand()}`;
  const db = openLiveDb();
  const admin = seedAdmin(db, { slug: `cleanup_admin_${rand()}` });
  insertLegacyClubCandidate(db, { display_name: candidateName, classification: 'onboarding_visible' });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, admin);
  const page = await ctx.newPage();

  const res = await page.goto('/admin/club-cleanup');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: /Club Cleanup Queue/i })).toBeVisible();
  // The candidate renders into a collapsible queue section, so it is present in
  // the page (attached) though not visible until its section is expanded.
  await expect(page.getByText(candidateName)).toBeAttached();

  await ctx.close();
});

test('unauthenticated visitor is sent to login instead of the cleanup queue', async ({ page }) => {
  await page.goto('/admin/club-cleanup');
  // The auth gate redirects an anonymous visitor to login rather than serving the queue.
  await expect(page).toHaveURL(/\/login/);
});
