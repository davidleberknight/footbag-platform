/**
 * The administrator question channel, driven front to back in a real browser.
 *
 * One run covers the whole surface: an administrator finds the link-help
 * request on the work queue, puts a question to the member, and the card
 * reports it is waiting on someone outside the queue. The member is nudged by
 * an email that names nothing. The member signs in, finds the question from
 * their own profile, reads it, corrects the date it asked about, and the
 * corrected date reaches their record, which is what lets the matcher place
 * them. The administrator then sees the answer on the item they asked from, and
 * the item is still theirs to close.
 *
 * A handler test can prove each of those steps. Only the browser proves the
 * member can actually get from their profile to the question, that the form
 * posts what the page shows, and that the private text renders on the one
 * surface that is allowed to show it and on no other.
 */
import { test, expect, type Page } from '@playwright/test';
import { seedAdmin, seedTier1Member } from '../fixtures/personas';
import { openLiveDb, createAuthenticatedContext } from './helpers/wizard-auth';

/**
 * The one work-queue card for this item.
 *
 * Every assertion about a card is scoped through this. The seeded persona
 * catalogue carries other members with questions waiting, so a page-wide match
 * for a card's own wording resolves to several and proves nothing about this
 * one. The link-help approve form is the anchor because it is on the card in
 * every state, unlike the ask form, which disappears once a question is sent.
 */
function cardFor(page: Page, queueItemId: string) {
  return page.locator('.work-queue-item').filter({
    has: page.locator(`form[action="/admin/work-queue/${queueItemId}/link-help/approve"]`),
  });
}

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

const STORED_DATE = '1985-06-15';
const CORRECTED_DAY = '2';
const CORRECTED_MONTH = '11';
const CORRECTED_YEAR = '1979';
const CORRECTED_DATE = '1979-11-02';

const QUESTION_SUBJECT = 'Please check your date of birth';
const QUESTION_BODY =
  'To find your old footbag.org record we need the date of birth it was registered under. '
  + 'Can you confirm the date on your account, or correct it if it is wrong?';

test('an administrator asks a member for their date of birth on a link-help request and gets an answer back', async ({
  browser, baseURL,
}) => {
  const db = openLiveDb();
  const admin = seedAdmin(db, { slug: `q_admin_${rand()}` });
  const member = seedTier1Member(db, {
    slug: `q_member_${rand()}`,
    overrides: { birth_date: STORED_DATE, city: 'Portland', region: 'OR', country: 'USA' },
  });

  // The item an administrator would be looking at: a member who could not find
  // their old account in the wizard and asked for help linking it.
  const queueItemId = `wq-e2e-${rand()}`;
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO work_queue_items
      (id, created_at, created_by, updated_at, updated_by, version,
       queue_category, task_type, entity_type, entity_id, status, priority,
       opened_at, reason_text, detail_text)
    VALUES (?, ?, 'system', ?, 'system', 1, 'membership', 'member_link_help_request',
            'member', ?, 'open', 5, ?, ?, ?)
  `).run(
    queueItemId, nowIso, nowIso, member.memberId, nowIso,
    'The member asked for help linking their old account.',
    'The member could not find their record in the wizard.',
  );
  const outboxBefore =
    (db.prepare('SELECT COUNT(*) AS c FROM outbox_emails').get() as { c: number }).c;
  db.close();

  // ── The administrator asks ────────────────────────────────────────────────
  const adminCtx = await createAuthenticatedContext(browser, baseURL!, admin);
  const adminPage = await adminCtx.newPage();

  await adminPage.goto('/admin/work-queue');
  await expect(adminPage.getByRole('heading', { level: 1, name: /Admin Work Queue/i }))
    .toBeVisible();

  // The queue holds every open item, so the disclosure is found through the
  // form belonging to this one rather than by position on the page.
  const card = adminPage.locator(`form[action="/admin/work-queue/${queueItemId}/ask-member"]`);
  await adminPage.locator('details.queue-ask-member', { has: card }).click();
  await expect(card).toBeVisible();

  await card.locator('select[name="expectedAnswerKind"]').selectOption('confirm_birth_date');
  await card.locator('input[name="subject"]').fill(QUESTION_SUBJECT);
  await card.locator('textarea[name="body"]').fill(QUESTION_BODY);
  await card.getByRole('button', { name: /Send Question/i }).click();

  await expect(cardFor(adminPage, queueItemId).getByText(/Waiting on the member since/i)).toBeVisible();

  // ── The nudge names nothing ───────────────────────────────────────────────
  {
    const check = openLiveDb();
    const mail = check.prepare(
      'SELECT subject, body_text FROM outbox_emails ORDER BY rowid DESC LIMIT 1',
    ).get() as { subject: string; body_text: string | null };
    const count =
      (check.prepare('SELECT COUNT(*) AS c FROM outbox_emails').get() as { c: number }).c;
    check.close();
    expect(count).toBe(outboxBefore + 1);
    const whole = `${mail.subject} ${mail.body_text ?? ''}`;
    expect(whole).not.toContain('date of birth we');
    expect(whole).not.toContain(STORED_DATE);
    expect(whole).not.toContain('http');
  }

  // ── The member answers ────────────────────────────────────────────────────
  const memberCtx = await createAuthenticatedContext(browser, baseURL!, member);
  const memberPage = await memberCtx.newPage();

  // Found from the profile, which is where the email tells them to look.
  await memberPage.goto(`/members/${member.slug}`);
  // The action block on the member's own profile is where an outstanding
  // question is offered. It names the administrator and carries no part of the
  // question itself; the words are read on the owner-only page it links to.
  await expect(memberPage.getByText(/An IFPA administrator has a question for you/i)).toBeVisible();
  const questionLink = memberPage.getByRole('link', { name: 'Answer', exact: true });
  await expect(questionLink).toBeVisible();
  await questionLink.click();

  await expect(memberPage.getByText(QUESTION_SUBJECT)).toBeVisible();
  await expect(memberPage.getByText(/correct it if it is wrong/i)).toBeVisible();

  await memberPage.getByRole('radio', { name: /My date of birth is/i }).check();
  await memberPage.locator('input[name="birthDay"]').fill(CORRECTED_DAY);
  await memberPage.locator('select[name="birthMonth"]').selectOption(CORRECTED_MONTH);
  await memberPage.locator('input[name="birthYear"]').fill(CORRECTED_YEAR);
  await memberPage.locator('textarea[name="note"]').fill('The old record is the right one.');
  await memberPage.getByRole('button', { name: /Send Answer/i }).click();

  await expect(memberPage.getByText(/Nothing is waiting for you/i)).toBeVisible();

  // ── The correction reached the record ─────────────────────────────────────
  {
    const check = openLiveDb();
    const row = check.prepare('SELECT birth_date FROM members WHERE id = ?')
      .get(member.memberId) as { birth_date: string };
    const item = check.prepare('SELECT status, detail_text FROM work_queue_items WHERE id = ?')
      .get(queueItemId) as { status: string; detail_text: string | null };
    check.close();
    expect(row.birth_date).toBe(CORRECTED_DATE);
    // The item stays the administrator's to close: answering the question is
    // not resolving the request it was asked from. The member's own edit never
    // rewrites the row either, so what was raised is still what it says.
    expect(item.status).toBe('open');
    expect(item.detail_text).toBe('The member could not find their record in the wizard.');
  }

  // ── The administrator sees the answer where they asked ────────────────────
  await adminPage.goto('/admin/work-queue');
  await expect(adminPage.getByText(/Corrected the date/i)).toBeVisible();
  await expect(adminPage.getByText('The old record is the right one.')).toBeVisible();
  await expect(cardFor(adminPage, queueItemId).getByText(/Waiting on the member since/i)).toHaveCount(0);

  await memberCtx.close();
  await adminCtx.close();
});

test('the question is readable only by the member it was sent to', async ({ browser, baseURL }) => {
  const db = openLiveDb();
  const admin = seedAdmin(db, { slug: `q_admin2_${rand()}` });
  const member = seedTier1Member(db, {
    slug: `q_member2_${rand()}`,
    overrides: { birth_date: STORED_DATE, city: 'Portland', region: 'OR', country: 'USA' },
  });
  const stranger = seedTier1Member(db, { slug: `q_stranger_${rand()}` });

  const queueItemId = `wq-e2e-${rand()}`;
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO work_queue_items
      (id, created_at, created_by, updated_at, updated_by, version,
       queue_category, task_type, entity_type, entity_id, status, priority,
       opened_at, reason_text, detail_text)
    VALUES (?, ?, 'system', ?, 'system', 1, 'membership', 'member_link_help_request',
            'member', ?, 'open', 5, ?, ?, NULL)
  `).run(queueItemId, nowIso, nowIso, member.memberId, nowIso, 'A link-help request was raised.');
  db.close();

  const adminCtx = await createAuthenticatedContext(browser, baseURL!, admin);
  const adminPage = await adminCtx.newPage();
  await adminPage.goto('/admin/work-queue');
  const card = adminPage.locator(`form[action="/admin/work-queue/${queueItemId}/ask-member"]`);
  await adminPage.locator('details.queue-ask-member', { has: card }).click();
  await card.locator('input[name="subject"]').fill(QUESTION_SUBJECT);
  await card.locator('textarea[name="body"]').fill(QUESTION_BODY);
  await card.getByRole('button', { name: /Send Question/i }).click();
  await expect(cardFor(adminPage, queueItemId).getByText(/Waiting on the member since/i)).toBeVisible();
  await adminCtx.close();

  // Another member asking for that member's question surface is answered as if
  // the page does not exist, so the route cannot be used to learn who has one.
  const strangerCtx = await createAuthenticatedContext(browser, baseURL!, stranger);
  const strangerPage = await strangerCtx.newPage();
  const res = await strangerPage.goto(`/members/${member.slug}/questions`);
  expect(res?.status()).toBe(404);
  expect(await strangerPage.content()).not.toContain(QUESTION_BODY);
  await strangerCtx.close();
});
