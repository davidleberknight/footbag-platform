/**
 * Dashboard task widget: correct task visibility, resume behavior,
 * profile-edit CTA, session persistence, and state correctness.
 */
import { test, expect } from '@playwright/test';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';
import { seedBrandNewPlayer, seedTier0Member, seedMemberWithAutoLinkCandidate, seedAllTasksCompleted, seedMixedTaskState, getTaskState } from './helpers/onboarding';
import { WizardPage } from './pages/wizard.page';
import { DashboardPage } from './pages/dashboard.page';

test('skipped tasks appear in dashboard widget with Resume affordance', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier0Member(db, { slug: `d_skip_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');
  await wizard.skipCurrentTask();

  const dashboard = new DashboardPage(page);
  await dashboard.goto(persona.slug);

  await expect(dashboard.taskWidget).toBeVisible();
  await expect(dashboard.skippedIntroText).toBeVisible();
  await expect(dashboard.resumeButtons.first()).toBeVisible();

  await ctx.close();
});

test('completed tasks do NOT appear in dashboard widget', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMixedTaskState(db, { slug: `d_mix_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const dashboard = new DashboardPage(page);
  await dashboard.goto(persona.slug);

  await expect(dashboard.taskWidget).toBeVisible();

  const labels = await dashboard.taskLabels.allTextContents();
  for (const label of labels) {
    expect(label.toLowerCase()).not.toContain('legacy');
  }

  await ctx.close();
});

test('resume skipped task opens correct wizard page with correct heading', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier0Member(db, { slug: `d_res_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');
  await wizard.skipCurrentTask();

  const dashboard = new DashboardPage(page);
  await dashboard.goto(persona.slug);
  await dashboard.clickFirstSkippedResume();

  expect(page.url()).toContain('/register/wizard/club_affiliations');
  await expect(wizard.heading).toBeVisible();
  await expect(wizard.skipButton).toBeVisible();

  await ctx.close();
});

test('all tasks completed -> widget section absent', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedAllTasksCompleted(db, { slug: `d_done_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const dashboard = new DashboardPage(page);
  await dashboard.goto(persona.slug);

  await expect(dashboard.taskWidget).toHaveCount(0);

  await ctx.close();
});

test('mixed state widget shows correct pending and skipped counts', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMixedTaskState(db, { slug: `d_cnt_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const dashboard = new DashboardPage(page);
  await dashboard.goto(persona.slug);

  await expect(dashboard.taskWidget).toBeVisible();
  const pendingCount = await dashboard.pendingTasks.count();
  const skippedCount = await dashboard.skippedTasks.count();
  expect(pendingCount + skippedCount).toBeGreaterThanOrEqual(2);

  await ctx.close();
});

test('profile edit page shows legacy CTA when unlinked', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedBrandNewPlayer(db, { slug: `d_cta_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();

  await page.goto(`/members/${persona.slug}/edit`);
  const ctaLink = page.locator('a[href*="/register/wizard/legacy_claim"]');
  await expect(ctaLink).toBeVisible();

  await ctx.close();
});

test('profile edit page hides legacy CTA after successful claim', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithAutoLinkCandidate(db, { slug: `d_nct_${Date.now()}` });
  const email = (db.prepare('SELECT login_email FROM members WHERE id = ?').get(persona.memberId) as { login_email: string }).login_email;
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await wizard.submitIdentifier(email);

  await page.goto(`/members/${persona.slug}/edit`);
  const ctaLink = page.locator('a[href*="/register/wizard/legacy_claim"]');
  await expect(ctaLink).toHaveCount(0);

  await ctx.close();
});

test('logout and re-login preserves wizard task state', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedTier0Member(db, { slug: `d_ses_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('club_affiliations');
  await wizard.skipCurrentTask();

  const db2 = openLiveDb();
  expect(getTaskState(db2, persona.memberId, 'club_affiliations')).toBe('skipped');
  db2.close();

  await ctx.close();

  const ctx2 = await createAuthenticatedContext(browser, baseURL!, persona);
  const page2 = await ctx2.newPage();
  const dashboard = new DashboardPage(page2);
  await dashboard.goto(persona.slug);

  await expect(dashboard.taskWidget).toBeVisible();
  await expect(dashboard.skippedIntroText).toBeVisible();

  await ctx2.close();
});
