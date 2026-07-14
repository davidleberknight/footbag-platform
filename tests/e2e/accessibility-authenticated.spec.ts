/**
 * Automated WCAG 2.1 AA accessibility scan of the authenticated surfaces.
 *
 * The anonymous scan covers the public pages; the member, onboarding, and admin
 * surfaces render only inside a session, so this suite seeds a persona, opens an
 * authenticated browser context, and runs the same axe WCAG 2.1 AA scan over the
 * pages behind the login gate. Form-dense pages (profile edit, gallery edit,
 * admin panels, the claim wizard) are where label and ARIA violations are most
 * likely, so they are the coverage this adds. Each test accumulates every page's
 * violations into a single failure so one run reports the whole surface.
 *
 * The scan excludes the colour-contrast rule, matching the public-page scan: the
 * shared theme's near-threshold greens and greys are an accepted site-wide
 * choice, so this gate covers the automatable structural checks (form labels,
 * ARIA, landmarks, headings) rather than re-litigating contrast per surface.
 *
 * Tagged @a11y so `--grep @a11y` runs the accessibility tier on its own; not
 * @smoke, because seeding a session per persona is heavier than the quick smoke
 * run over anonymous pages.
 */
import { test, expect } from '@playwright/test';
import { scanWcagAa, formatFindings } from './helpers/axe';
import { seedAdmin, seedTier1Member, seedTier0Member } from '../fixtures/personas';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';
import {
  insertMemberGallery,
  insertTag,
  insertClub,
  insertMemberClubAffiliation,
  insertFreestyleTrick,
  insertAuditEntry,
  insertOutboxEmail,
} from '../fixtures/factories';

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function scanPages(
  context: Awaited<ReturnType<typeof createAuthenticatedContext>>,
  pages: Array<{ path: string; name: string }>,
): Promise<void> {
  const page = await context.newPage();
  const report: string[] = [];
  for (const { path, name } of pages) {
    const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
    expect(res, `${name} (${path}) should respond`).not.toBeNull();
    expect(res!.status(), `${name} (${path}) should render, not error`).toBeLessThan(400);
    const findings = await scanWcagAa(page, { disableRules: ['color-contrast'] });
    if (findings.length > 0) report.push(formatFindings(name, findings));
  }
  expect(report.join('\n'), `axe WCAG 2.1 AA violations found:\n${report.join('\n')}`).toBe('');
}

test('member surfaces have no WCAG 2.1 AA axe violations', { tag: ['@a11y'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const suffix = rand();
  const member = seedTier1Member(db, { slug: `a11y_member_${suffix}` });
  const galleryId = insertMemberGallery(db, {
    owner_member_id: member.memberId,
    name: `A11y Gallery ${suffix}`,
  });
  const clubKey = `club_a11y_${suffix}`;
  const clubTagId = insertTag(db, { standard_type: 'club', tag_normalized: `#${clubKey}` });
  const clubId = insertClub(db, { hashtag_tag_id: clubTagId, name: `A11y Club ${suffix}` });
  insertMemberClubAffiliation(db, member.memberId, clubId);
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, member);
  try {
    await scanPages(ctx, [
      { path: `/members/${member.slug}`, name: 'member profile' },
      { path: `/members/${member.slug}/edit`, name: 'profile edit' },
      { path: `/members/${member.slug}/edit/password`, name: 'password edit' },
      { path: `/members/${member.slug}/contact-admin`, name: 'contact admin' },
      { path: `/members/${member.slug}/galleries`, name: 'member galleries' },
      { path: `/members/${member.slug}/galleries/new`, name: 'new gallery' },
      { path: `/members/${member.slug}/galleries/${galleryId}/edit`, name: 'gallery edit' },
      { path: `/clubs/${clubKey}`, name: 'club detail (member)' },
    ]);
  } finally {
    await ctx.close();
  }
});

test('the onboarding claim wizard has no WCAG 2.1 AA axe violations', { tag: ['@a11y'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const member = seedTier0Member(db, { slug: `a11y_wizard_${rand()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, member);
  try {
    await scanPages(ctx, [
      { path: '/register/wizard/legacy_claim', name: 'legacy-claim wizard' },
    ]);
  } finally {
    await ctx.close();
  }
});

test('admin surfaces have no WCAG 2.1 AA axe violations', { tag: ['@a11y'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const suffix = rand();
  const admin = seedAdmin(db, { slug: `a11y_admin_${suffix}` });
  // Seed one row per table the admin lists read, so the pages render populated
  // rows rather than only their empty state.
  insertFreestyleTrick(db, {
    slug: `a11y_trick_${suffix}`, canonical_name: `a11y trick ${suffix}`, adds: '3',
    trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'curated', is_active: 1,
  });
  insertAuditEntry(db, { action_type: 'member.profile_update', entity_id: admin.memberId });
  insertOutboxEmail(db, { subject: `A11y probe ${suffix}`, status: 'sent' });
  const clubTagId = insertTag(db, { standard_type: 'club', tag_normalized: `#club_admin_a11y_${suffix}` });
  insertClub(db, { hashtag_tag_id: clubTagId, name: `A11y Admin Club ${suffix}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, admin);
  try {
    await scanPages(ctx, [
      { path: '/admin', name: 'admin dashboard' },
      { path: '/admin/work-queue', name: 'admin work queue' },
      { path: '/admin/admin-roles', name: 'admin roles' },
      { path: '/admin/audit-log', name: 'audit log' },
      { path: '/admin/email-log', name: 'email log' },
      { path: '/admin/club-cleanup', name: 'club cleanup' },
      { path: '/admin/clubs/leadership', name: 'club leadership' },
      { path: '/admin/freestyle/tricks', name: 'freestyle tricks admin' },
      { path: '/admin/freestyle/records', name: 'freestyle records admin' },
      { path: '/admin/curator/upload', name: 'curator upload' },
    ]);
  } finally {
    await ctx.close();
  }
});
