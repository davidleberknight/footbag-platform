/**
 * Admin spot check in a real browser: an authenticated admin loads the work
 * queue and a second admin surface (the dashboard) and both render. This is
 * the shallow browser smoke that a template break, CSP regression, or broken
 * client asset on the admin surfaces would surface where a handler-only test
 * cannot.
 */
import { test, expect } from '@playwright/test';
import { seedAdmin, seedTier1Member } from '../fixtures/personas';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

test('admin loads the work queue and the dashboard', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const admin = seedAdmin(db, { slug: `spot_admin_${rand()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, admin);
  const page = await ctx.newPage();

  const queueRes = await page.goto('/admin/work-queue');
  expect(queueRes?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: /Admin Work Queue/i })).toBeVisible();

  const dashRes = await page.goto('/admin');
  expect(dashRes?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: /Admin Dashboard/i })).toBeVisible();

  await ctx.close();
});

test('a non-admin member is forbidden from the admin surfaces', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const member = seedTier1Member(db, { slug: `spot_member_${rand()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, member);
  const page = await ctx.newPage();

  const res = await page.goto('/admin/work-queue');
  expect(res?.status()).toBe(403);

  await ctx.close();
});
