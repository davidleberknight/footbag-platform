/**
 * The onboarding claim step as a member uses it in a real browser: each kind of
 * card answered through its own control, the decline that stands, the two
 * non-claiming answers, the last attempt, and the cases only a browser shows
 * (a second tab, the back button, a double submit). Every matching rule is
 * proven in the integration suite; these journeys prove the forms, redirects
 * and session chain carry a member through them.
 */
import { test, expect, type Page } from '@playwright/test';
import type BetterSqlite3 from 'better-sqlite3';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';
import {
  seedMemberWithEmailMatchedPair,
  seedMemberWithRecordOnly,
  seedMemberWithSurnameDifferingAccount,
  seedMemberWithNameOnlyAccount,
  seedMemberWithMisdatedAccount,
  getTaskState,
  getMemberField,
  isLegacyClaimed,
  raiseClaimRateLimits,
  completePersonalDetails,
} from './helpers/onboarding';
import { WizardPage } from './pages/wizard.page';

const CLUB_STEP = /\/register\/wizard\/club_affiliations$/;
const CLAIM_STEP = /\/register\/wizard\/legacy_claim(\?.*)?$/;

test.beforeAll(() => {
  const db = openLiveDb();
  raiseClaimRateLimits(db);
  db.close();
});

function countAudit(db: BetterSqlite3.Database, actionType: string, memberId: string): number {
  return (db.prepare(
    "SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = ? AND entity_type = 'member' AND entity_id = ?",
  ).get(actionType, memberId) as { c: number }).c;
}

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = openLiveDb();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

async function openClaimStep(page: Page): Promise<WizardPage> {
  const wizard = new WizardPage(page);
  await wizard.goto('legacy_claim');
  await expect(page).toHaveURL(CLAIM_STEP);
  return wizard;
}

test('an old account the member\'s own email reaches is claimed whole from its card, and the member goes straight on to the club step', { tag: ['@migration'] }, async ({ browser, baseURL }) => {
  const persona = withDb((db) => {
    const p = seedMemberWithEmailMatchedPair(db);
    completePersonalDetails(db, p.memberId);
    return p;
  });

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = await openClaimStep(page);

  await expect(wizard.cards).toHaveCount(1);
  await wizard.claimButton(wizard.cards.first()).click();
  await expect(page).toHaveURL(CLUB_STEP);

  withDb((db) => {
    expect(getMemberField(db, persona.memberId, 'legacy_member_id')).toBe(persona.legacyMemberId);
    expect(getMemberField(db, persona.memberId, 'historical_person_id')).toBe(persona.personId);
    expect(isLegacyClaimed(db, persona.legacyMemberId)).toBe(true);
    expect(getTaskState(db, persona.memberId, 'legacy_claim')).toBe('completed');
  });

  // One pass: the step does not come back to offer anything further.
  await wizard.goto('legacy_claim');
  await expect(page).toHaveURL(CLUB_STEP);

  await ctx.close();
});

test('a competition record with no old account is claimed through its confirmation page', { tag: ['@migration'] }, async ({ browser, baseURL }) => {
  const persona = withDb((db) => seedMemberWithRecordOnly(db));

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = await openClaimStep(page);

  await wizard.recordClaimLink(wizard.card(persona.personName)).click();
  await expect(page).toHaveURL(new RegExp(`/history/${persona.personId}/claim$`));
  await page.getByRole('button', { name: /Yes, This Is Me: Link the Record/i }).click();
  await expect(page).toHaveURL(CLUB_STEP);

  withDb((db) => {
    expect(getMemberField(db, persona.memberId, 'historical_person_id')).toBe(persona.personId);
  });

  await ctx.close();
});

test('a card whose surname differs is claimed in one step by naming the surname used before', { tag: ['@migration'] }, async ({ browser, baseURL }) => {
  const persona = withDb((db) => seedMemberWithSurnameDifferingAccount(db));

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = await openClaimStep(page);

  const card = wizard.cards.first();
  await expect(wizard.claimButton(card)).toHaveCount(0);
  const button = wizard.surnameClaimButton(card);
  await expect(button).toContainText(persona.oldSurname);
  await button.click();
  await expect(page).toHaveURL(CLUB_STEP);

  withDb((db) => {
    expect(getMemberField(db, persona.memberId, 'legacy_member_id')).toBe(persona.legacyMemberId);
    const anchor = db.prepare(
      "SELECT anchor_value FROM member_declared_anchors WHERE member_id = ? AND anchor_type = 'former_surname'",
    ).get(persona.memberId) as { anchor_value: string } | undefined;
    expect(anchor?.anchor_value).toBe(persona.oldSurname);
  });

  await ctx.close();
});

test('an old account found by name alone shows no claim control until the member adds an old email it carried', { tag: ['@migration'] }, async ({ browser, baseURL }) => {
  const persona = withDb((db) => seedMemberWithNameOnlyAccount(db));

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = await openClaimStep(page);

  const card = wizard.card(persona.accountName);
  await expect(card).toHaveCount(1);
  await expect(wizard.claimButton(card)).toHaveCount(0);

  await wizard.oldEmailInput.fill(persona.oldEmail);
  await wizard.addOldEmailButton.click();
  await expect(page).toHaveURL(/\/register\/wizard\/legacy_claim\?anchor=saved$/);
  await expect(wizard.successBanner.first()).toBeVisible();

  // Add-only: the address is listed and nothing offers to take it back.
  await expect(page.locator('ul.mb-4 li').filter({ hasText: persona.oldEmail })).toHaveCount(1);
  await expect(page.getByRole('button', { name: /^Remove$/ })).toHaveCount(0);

  await wizard.claimButton(wizard.card(persona.accountName)).click();
  await expect(page).toHaveURL(CLUB_STEP);
  withDb((db) => {
    expect(getMemberField(db, persona.memberId, 'legacy_member_id')).toBe(persona.legacyMemberId);
  });

  await ctx.close();
});

test('the cannot-find-it answer finishes the claim step and opens one last attempt, where a corrected date of birth turns up a claimable card', { tag: ['@migration'] }, async ({ browser, baseURL }) => {
  const persona = withDb((db) => seedMemberWithMisdatedAccount(db));

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = await openClaimStep(page);

  const card = wizard.card(persona.accountName);
  await expect(wizard.claimButton(card)).toHaveCount(0);
  await wizard.cannotFindOldAccountButton.click();
  await expect(page).toHaveURL(CLAIM_STEP);
  await expect(wizard.sharpenBirthDateForm).toBeVisible();
  withDb((db) => expect(getTaskState(db, persona.memberId, 'legacy_claim')).toBe('completed'));

  await page.locator('#sharpenBirthDay').fill('9');
  await page.locator('#sharpenBirthMonth').selectOption('3');
  await page.locator('#sharpenBirthYear').fill('1984');
  await page.getByRole('button', { name: 'Save Date of Birth' }).click();
  await expect(page).toHaveURL(/birth_date=saved$/);

  await wizard.claimButton(wizard.card(persona.accountName)).click();
  await expect(page).toHaveURL(CLUB_STEP);
  withDb((db) => {
    expect(getMemberField(db, persona.memberId, 'legacy_member_id')).toBe(persona.legacyMemberId);
  });

  // The attempt closed with the claim; the step does not render again.
  await wizard.goto('legacy_claim');
  await expect(page).toHaveURL(CLUB_STEP);

  await ctx.close();
});

test('I Never Had an Old Account with a card on screen completes the step without linking it', { tag: ['@migration'] }, async ({ browser, baseURL }) => {
  const persona = withDb((db) => {
    const p = seedMemberWithEmailMatchedPair(db);
    completePersonalDetails(db, p.memberId);
    return p;
  });

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = await openClaimStep(page);

  await expect(wizard.cards).toHaveCount(1);
  await wizard.answerCurrentTask(CLUB_STEP);

  withDb((db) => {
    expect(getTaskState(db, persona.memberId, 'legacy_claim')).toBe('completed');
    expect(getMemberField(db, persona.memberId, 'legacy_member_id')).toBeNull();
  });

  await ctx.close();
});

test('a double-submitted card claim lands on the first outcome, never an error page', { tag: ['@migration'] }, async ({ browser, baseURL }) => {
  const persona = withDb((db) => {
    const p = seedMemberWithEmailMatchedPair(db);
    completePersonalDetails(db, p.memberId);
    return p;
  });

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const first = await ctx.newPage();
  const second = await ctx.newPage();
  const w1 = await openClaimStep(first);
  const w2 = await openClaimStep(second);

  await w1.claimButton(w1.cards.first()).click();
  await expect(first).toHaveURL(CLUB_STEP);
  // The second tab still holds the form the first one already answered.
  await w2.claimButton(w2.cards.first()).click();
  await expect(second).toHaveURL(CLUB_STEP);

  withDb((db) => expect(countAudit(db, 'claim.legacy_account', persona.memberId)).toBe(1));
  await ctx.close();
});

test('a double-submitted record confirmation lands on the first outcome, never an error page', { tag: ['@migration'] }, async ({ browser, baseURL }) => {
  const persona = withDb((db) => seedMemberWithRecordOnly(db));

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const first = await ctx.newPage();
  const second = await ctx.newPage();
  for (const p of [first, second]) await p.goto(`/history/${persona.personId}/claim`);

  const confirm = (p: Page) => p.getByRole('button', { name: /Yes, This Is Me: Link the Record/i });
  await confirm(first).click();
  await expect(first).toHaveURL(CLUB_STEP);
  await confirm(second).click();
  await expect(second).toHaveURL(CLUB_STEP);

  withDb((db) => expect(countAudit(db, 'claim.historical_person', persona.memberId)).toBe(1));
  await ctx.close();
});

test('a double-submitted anchor add lands on the first outcome, never an error page', { tag: ['@migration'] }, async ({ browser, baseURL }) => {
  const persona = withDb((db) => seedMemberWithNameOnlyAccount(db));

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const first = await ctx.newPage();
  const second = await ctx.newPage();
  const w1 = await openClaimStep(first);
  const w2 = await openClaimStep(second);

  for (const [page, wizard] of [[first, w1], [second, w2]] as const) {
    await wizard.oldEmailInput.fill(persona.oldEmail);
    await wizard.addOldEmailButton.click();
    await expect(page).toHaveURL(/anchor=saved$/);
    await expect(wizard.inlineError).toHaveCount(0);
  }

  withDb((db) => {
    const rows = db.prepare(
      "SELECT COUNT(*) AS c FROM member_declared_anchors WHERE member_id = ? AND anchor_type = 'old_email'",
    ).get(persona.memberId) as { c: number };
    expect(rows.c).toBe(1);
  });
  await ctx.close();
});

test('a wizard form sent from a tab left open after signing up finished goes to the identity-link request and claims nothing', { tag: ['@migration', '@security'] }, async ({ browser, baseURL }) => {
  const persona = withDb((db) => {
    const p = seedMemberWithEmailMatchedPair(db);
    completePersonalDetails(db, p.memberId);
    return p;
  });

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const stale = await ctx.newPage();
  const staleWizard = await openClaimStep(stale);

  const live = await ctx.newPage();
  const liveWizard = await openClaimStep(live);
  await liveWizard.answerCurrentTask(CLUB_STEP);
  await liveWizard.answerCurrentTask(/\/register\/wizard\/complete$/);

  await staleWizard.claimButton(staleWizard.cards.first()).click();
  await expect(stale).toHaveURL(
    new RegExp(`/members/${persona.slug}/contact-admin\\?category=identity_link_issue$`),
  );
  withDb((db) => expect(getMemberField(db, persona.memberId, 'legacy_member_id')).toBeNull());

  await ctx.close();
});

test('going back to the claim step after answering it offers no answer controls, and the member still reaches the step they owe', async ({ browser, baseURL }) => {
  const persona = withDb((db) => seedMemberWithNameOnlyAccount(db));

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  const wizard = await openClaimStep(page);
  await wizard.answerCurrentTask(CLUB_STEP);

  await page.goBack();
  await expect(page).toHaveURL(CLUB_STEP);
  await expect(wizard.neverHadOldAccountButton).toHaveCount(0);
  await expect(wizard.noClubsButton).toBeVisible();

  await ctx.close();
});

test('a registrant who opens a competition-record claim link before giving personal details lands on the personal details form', async ({ browser, baseURL }) => {
  const persona = withDb((db) => seedMemberWithRecordOnly(db, { personalDetailsDone: false }));

  const ctx = await createAuthenticatedContext(browser, baseURL!, persona);
  const page = await ctx.newPage();
  await page.goto(`/history/${persona.personId}/claim`);
  await expect(page).toHaveURL(/\/register\/wizard\/personal_details$/);
  withDb((db) => expect(getMemberField(db, persona.memberId, 'historical_person_id')).toBeNull());

  await ctx.close();
});
