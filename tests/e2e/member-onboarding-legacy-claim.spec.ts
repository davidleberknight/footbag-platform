/**
 * Legacy claim paths: auto-link candidate cards, manual search with
 * enqueued token, token confirm/consume, direct HP claim, and
 * anti-enumeration equivalence.
 */
import { test, expect } from '@playwright/test';
import { insertLegacyMember, insertHistoricalPerson } from '../fixtures/factories';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';
import { seedBrandNewPlayer, seedMemberWithAutoLinkCandidate, seedMemberWithLegacyDiffEmail, seedMemberWithHpMatch, getMemberField, getTaskState, raiseClaimRateLimits, legacyClaimConfirmUrl, completePersonalDetails } from './helpers/onboarding';

test.beforeAll(() => {
  const db = openLiveDb();
  raiseClaimRateLimits(db);
  db.close();
});
import { WizardPage } from './pages/wizard.page';

test('auto-link candidate card visible for high-confidence member', { tag: ['@migration'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithAutoLinkCandidate(db, { slug: `lc_al_${Date.now()}`, personName: 'Autolink Person' });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  const body = await page.textContent('body');
  expect(body).toContain('Autolink Person');

  const linkButton = page.getByRole('button', { name: /this is me/i });
  await expect(linkButton).toBeVisible();

  await ctx.close();
});

test('auto-link confirm advances to next task', { tag: ['@migration'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithAutoLinkCandidate(db, { slug: `lc_ac_${Date.now()}` });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');

  const linkButton = page.getByRole('button', { name: /this is me/i });
  await linkButton.click();
  await page.waitForURL(/\/register\/wizard\//);

  expect(page.url()).not.toContain('legacy_claim');

  const db2 = openLiveDb();
  expect(getTaskState(db2, persona.memberId, 'legacy_claim')).toBe('completed');
  db2.close();

  await ctx.close();
});

test('manual search: enqueued path shows the banner but never the confirm link', { tag: ['@migration'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithLegacyDiffEmail(db, { slug: `lc_enq_${Date.now()}` });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await wizard.submitIdentifier(persona.legacyEmail);

  const sentBanner = page.locator('.form-success-banner');
  await expect(sentBanner).toBeVisible();
  const bannerText = await sentBanner.textContent();
  expect(bannerText).toMatch(/confirmation link has been sent/i);

  // The ownership-proof confirm link is addressed to the legacy account's email,
  // not the claiming member, so the sent page must never reflect it.
  await expect(page.locator('.sec-card-dev')).toHaveCount(0);
  await expect(page.locator('a[href*="/claim/confirm/"]')).toHaveCount(0);

  // The token was genuinely enqueued out-of-band to the legacy email's outbox.
  const db2 = openLiveDb();
  const confirmUrl = legacyClaimConfirmUrl(db2, persona.memberId);
  db2.close();
  expect(confirmUrl).toMatch(/\/claim\/confirm\//);

  await ctx.close();
});

test('token confirm page shows record details and confirm button', { tag: ['@migration'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithLegacyDiffEmail(db, { slug: `lc_tok_${Date.now()}` });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await wizard.submitIdentifier(persona.legacyEmail);

  const db2 = openLiveDb();
  const tokenHref = legacyClaimConfirmUrl(db2, persona.memberId);
  db2.close();

  await page.goto(tokenHref);

  const body = await page.textContent('body');
  expect(body).toContain('Enqueued Claim');

  const confirmButton = page.getByRole('button', { name: /confirm and link/i });
  await expect(confirmButton).toBeVisible();

  await ctx.close();
});

test('token consume advances wizard and links member', { tag: ['@migration'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithLegacyDiffEmail(db, { slug: `lc_con_${Date.now()}` });
  completePersonalDetails(db, persona.memberId);
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = new WizardPage(page);

  await wizard.goto('legacy_claim');
  await wizard.submitIdentifier(persona.legacyEmail);

  const tokenDb = openLiveDb();
  const tokenHref = legacyClaimConfirmUrl(tokenDb, persona.memberId);
  tokenDb.close();
  await page.goto(tokenHref);

  const confirmButton = page.getByRole('button', { name: /confirm and link/i });
  await confirmButton.click();
  await page.waitForURL(/\/register\/wizard\//);

  expect(page.url()).not.toContain('legacy_claim');

  const db2 = openLiveDb();
  expect(getMemberField(db2, persona.memberId, 'legacy_member_id')).toBe(persona.legacyMemberId);
  expect(getTaskState(db2, persona.memberId, 'legacy_claim')).toBe('completed');
  db2.close();

  await ctx.close();
});

test('direct HP claim: surname match shows confirm page with name', { tag: ['@migration'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const persona = seedMemberWithHpMatch(db, { slug: `lc_hp_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();

  await page.goto(`/history/${persona.personId}/claim`);
  const body = await page.textContent('body');
  expect(body).toContain('Robert Testplayer');

  const claimButton = page.getByRole('button', { name: /yes.*this is me|link the record/i });
  await expect(claimButton).toBeVisible();

  await ctx.close();
});

test('HP claim surname mismatch: claim-unavailable page (anti-enum safe)', { tag: ['@migration', '@security'] }, async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const personId = insertHistoricalPerson(db, { person_name: 'Totally Different' });
  const persona = seedBrandNewPlayer(db, { slug: `lc_mm_${Date.now()}` });
  db.close();

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();

  const res = await page.goto(`/history/${personId}/claim`);
  expect(res?.status()).toBe(200);

  const body = await page.textContent('body');
  expect(body).toMatch(/unavailable|cannot.*link/i);
  expect(body).not.toContain('Totally Different');

  await ctx.close();
});

test('anti-enum: no-match and match searches show identical banner text', { tag: ['@migration', '@security'] }, async ({ browser, baseURL }) => {
  const stamp = Date.now();

  const db = openLiveDb();
  const noMatchPersona = seedBrandNewPlayer(db, { slug: `lc_ae1_${stamp}` });
  const legacyEmail = `ae-match-${stamp}@oldsite.example`;
  insertLegacyMember(db, { legacy_member_id: `LM-AE-${stamp}`, legacy_email: legacyEmail, real_name: 'AE Match' });
  const matchPersona = seedBrandNewPlayer(db, { slug: `lc_ae2_${stamp}` });
  completePersonalDetails(db, noMatchPersona.memberId);
  completePersonalDetails(db, matchPersona.memberId);
  db.close();

  const ctx1 = await createAuthenticatedContext(browser, baseURL!, noMatchPersona);
  const page1 = await ctx1.newPage();
  const w1 = new WizardPage(page1);
  await w1.goto('legacy_claim');
  await w1.submitIdentifier(`garbage-${stamp}`);
  const noMatchBanner = await page1.textContent('[role="status"], .form-success-banner') ?? '';
  await ctx1.close();

  const ctx2 = await createAuthenticatedContext(browser, baseURL!, matchPersona);
  const page2 = await ctx2.newPage();
  const w2 = new WizardPage(page2);
  await w2.goto('legacy_claim');
  await w2.submitIdentifier(legacyEmail);
  const matchBanner = await page2.textContent('[role="status"], .form-success-banner') ?? '';
  await ctx2.close();

  expect(noMatchBanner.trim()).toBe(matchBanner.trim());
});
