/**
 * The direct question an administrator puts to one member, and the answer.
 *
 * The contract these pin: the channel is anchored to the work-queue item that
 * raised the question and never changes its status; the private text is read in
 * the application and never leaves it; the member's surface is owner-only; and
 * an answer can be given once.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  insertWorkQueueItem,
  createTestSessionJwt,
} from '../fixtures/factories';
import { expectCsrfReject } from '../fixtures/expectCsrfReject';

const { dbPath } = setTestEnv('3164');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const ADMIN_ID   = 'q-admin-001';
const ADMIN_SLUG = 'q_admin';
const MEMBER_ID  = 'q-member-001';
const MEMBER_SLUG = 'q_member';
const OTHER_ID    = 'q-other-001';
const OTHER_SLUG  = 'q_other';
const PENDING_ID   = 'q-pending-001';
const PENDING_SLUG = 'q_pending';
const DECEASED_ID   = 'q-deceased-001';
const DECEASED_SLUG = 'q_deceased';
const LEGACY_ID  = 'q-legacy-001';

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}
function otherCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: OTHER_ID })}`;
}

function db(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}
function readDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath, { readonly: true });
}

function seedItemFor(memberId: string, taskType = 'member_link_help_request'): string {
  const conn = db();
  const id = insertWorkQueueItem(conn, {
    entity_id: memberId,
    task_type: taskType,
    reason_text: 'The member asked for help linking their old account.',
    detail_text: 'Original request text.',
  });
  conn.close();
  return id;
}

function seedItem(taskType = 'member_link_help_request'): string {
  return seedItemFor(MEMBER_ID, taskType);
}

function ask(queueItemId: string, over: Record<string, string> = {}): request.Test {
  return request(createApp())
    .post(`/admin/work-queue/${queueItemId}/ask-member`)
    .set('Cookie', adminCookie())
    .type('form')
    .send({
      expectedAnswerKind: 'confirm_birth_date',
      subject: 'Please check your date of birth',
      body: 'Our records disagree with the old site. Can you confirm the date we hold?',
      ...over,
    });
}

function messageRow(): Record<string, unknown> | undefined {
  const conn = readDb();
  const row = conn.prepare('SELECT * FROM member_messages ORDER BY sent_at DESC LIMIT 1')
    .get() as Record<string, unknown> | undefined;
  conn.close();
  return row;
}

function outboxRows(): Array<{ subject: string; body_text: string | null }> {
  const conn = readDb();
  const rows = conn.prepare('SELECT subject, body_text FROM outbox_emails').all() as
    Array<{ subject: string; body_text: string | null }>;
  conn.close();
  return rows;
}

beforeAll(async () => {
  const conn = createTestDb(dbPath);
  insertMember(conn, {
    id: ADMIN_ID, slug: ADMIN_SLUG, display_name: 'Q Admin',
    login_email: 'qadmin@example.com', is_admin: 1,
  });
  insertMember(conn, {
    id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'Q Member',
    login_email: 'qmember@example.com', birth_date: '1978-03-14',
    city: 'Portland', region: 'OR', country: 'USA',
  });
  insertMember(conn, {
    id: OTHER_ID, slug: OTHER_SLUG, display_name: 'Q Other',
    login_email: 'qother@example.com',
  });
  // Part-way through the wizard: a conflict can be raised against them, but
  // they cannot yet reach the page a question would be read on.
  insertMember(conn, {
    id: PENDING_ID, slug: PENDING_SLUG, display_name: 'Q Pending',
    login_email: 'qpending@example.com', onboarding: 'none',
  });
  // Marked deceased and not yet reached by the cleanup pass, which is the state
  // every deceased member passes through for at least the grace period.
  insertMember(conn, {
    id: DECEASED_ID, slug: DECEASED_SLUG, display_name: 'Q Deceased',
    login_email: 'qdeceased@example.com', is_deceased: 1,
  });
  conn.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  const conn = db();
  conn.prepare('DELETE FROM member_messages').run();
  conn.prepare('DELETE FROM work_queue_items').run();
  conn.prepare('DELETE FROM outbox_emails').run();
  conn.prepare('DELETE FROM legacy_members').run();
  conn.prepare('UPDATE members SET birth_date = ? WHERE id = ?').run('1978-03-14', MEMBER_ID);
  conn.close();
});

describe('an administrator asks the member a question', () => {
  it('records the question against the item that raised it', async () => {
    const itemId = seedItem();
    const res = await ask(itemId);
    expect(res.status).toBe(303);

    const row = messageRow()!;
    expect(row.recipient_member_id).toBe(MEMBER_ID);
    expect(row.sender_admin_member_id).toBe(ADMIN_ID);
    expect(row.work_queue_item_id).toBe(itemId);
    expect(row.status).toBe('sent');
    expect(row.outcome).toBeNull();
    expect(row.answered_at).toBeNull();
  });

  // The parked-status design was rejected because eight statements select on
  // 'open', two of them the de-duplication probe and the close paths.
  it('leaves the queue item open while it waits', async () => {
    const itemId = seedItem();
    await ask(itemId);
    const conn = readDb();
    const item = conn.prepare('SELECT status FROM work_queue_items WHERE id = ?')
      .get(itemId) as { status: string };
    conn.close();
    expect(item.status).toBe('open');
  });

  it('sends a nudge that carries neither the question nor a link', async () => {
    const itemId = seedItem();
    await ask(itemId, { body: 'Were you born on the fourteenth of March 1978?' });
    const mail = outboxRows();
    expect(mail).toHaveLength(1);
    const whole = `${mail[0].subject} ${mail[0].body_text ?? ''}`;
    expect(whole).not.toContain('fourteenth');
    expect(whole).not.toContain('1978');
    expect(whole).not.toContain('http');
  });

  it('keeps the question text out of the audit ledger', async () => {
    const itemId = seedItem();
    await ask(itemId, { body: 'Were you born on the fourteenth of March 1978?' });
    // The ledger is append-only, so rows from earlier cases in this file are
    // still here; pin the row this case wrote by the message it belongs to.
    const messageId = messageRow()!.id as string;
    const conn = readDb();
    const audit = conn.prepare(
      `SELECT metadata_json FROM audit_entries
       WHERE action_type = 'member_message.sent' AND metadata_json LIKE ?`,
    ).get(`%${messageId}%`) as { metadata_json: string };
    conn.close();
    expect(audit).toBeDefined();
    expect(audit.metadata_json).not.toContain('fourteenth');
    expect(audit.metadata_json).toContain('body_length');
  });

  it('refuses a second question while one is still waiting', async () => {
    const itemId = seedItem();
    await ask(itemId);
    const res = await ask(itemId, { subject: 'And another thing' });
    expect(res.status).toBe(422);
    const conn = readDb();
    const count = conn.prepare('SELECT COUNT(*) AS c FROM member_messages').get() as { c: number };
    conn.close();
    expect(count.c).toBe(1);
  });

  it('lets two matters about one member each carry their own question', async () => {
    // The limit is per matter, not per member. Scoping it per member would let
    // one administrator's unrelated question disable the control on another's
    // matter, with a refusal naming a reason that is not true of that item, and
    // nothing bounds how long that lasts.
    const first = seedItem();
    const second = seedItem('auto_link_match');
    expect((await ask(first)).status).toBe(303);
    expect((await ask(second, { subject: 'A different matter' })).status).toBe(303);
    const conn = readDb();
    const count = conn.prepare('SELECT COUNT(*) AS c FROM member_messages').get() as { c: number };
    conn.close();
    expect(count.c).toBe(2);
  });

  it('drafts the question for the matter, and opens the composer a deep link names', async () => {
    const itemId = seedItem();
    const res = await request(createApp())
      .get(`/admin/work-queue?ask=${itemId}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('About your old footbag.org records');
    expect(res.text).toContain('we match on your date of birth');
    // The draft picks the answer kind the matter actually needs.
    expect(res.text).toContain('value="confirm_birth_date" selected');
    expect(res.text).toContain('<details class="queue-ask-member" open>');
  });

  // A link-help request is raised inside the onboarding wizard, and the page a
  // question is read on is a member surface the wizard gate holds an unfinished
  // registrant out of.
  it('refuses to ask a member who has not finished signing up', async () => {
    const itemId = seedItemFor(PENDING_ID);
    const res = await ask(itemId);
    expect(res.status).toBe(422);
    expect(res.text).toContain('not finished signing up');

    const conn = readDb();
    const count = conn.prepare('SELECT COUNT(*) AS c FROM member_messages').get() as { c: number };
    conn.close();
    expect(count.c).toBe(0);
  });

  it('does not offer the control on the card for such a member', async () => {
    seedItemFor(PENDING_ID);
    const res = await request(createApp())
      .get('/admin/work-queue').set('Cookie', adminCookie());
    expect(res.text).not.toContain('ask-member');
    expect(res.text).toContain('not finished signing up');
  });

  // A member marked deceased keeps their account and their mailbox until the
  // cleanup pass reaches them, which is a grace period away, so nothing else
  // stops a question being put to them in the meantime.
  it('refuses to ask a member who has died', async () => {
    const itemId = seedItemFor(DECEASED_ID);
    const res = await ask(itemId);
    expect(res.status).not.toBe(303);

    const conn = readDb();
    const count = conn.prepare('SELECT COUNT(*) AS c FROM member_messages').get() as { c: number };
    const mail = conn.prepare(
      'SELECT COUNT(*) AS c FROM outbox_emails WHERE recipient_member_id = ?',
    ).get(DECEASED_ID) as { c: number };
    conn.close();
    expect(count.c).toBe(0);
    expect(mail.c).toBe(0);
  });

  it('does not offer the control on the card for a member who has died', async () => {
    seedItemFor(DECEASED_ID);
    const res = await request(createApp())
      .get('/admin/work-queue').set('Cookie', adminCookie());
    expect(res.text).not.toContain('ask-member');
  });

  it('carries a question on any matter naming this member, whatever raised it', async () => {
    // The rule is the person, not the matter: an item naming one signed-up
    // member names somebody who can answer, so a second kind of matter about the
    // same member works without anyone adding it to a list.
    const itemId = seedItem('auto_link_match');
    expect((await ask(itemId)).status).toBe(303);
  });

  it('refuses a matter that names no single member', async () => {
    // A payout names a Stripe transfer, not a person. There is nobody to ask,
    // and the refusal is structural rather than a task type left off a list.
    const conn = db();
    const itemId = insertWorkQueueItem(conn, {
      entity_type: 'stripe_payout',
      entity_id: 'po_test_nobody',
      task_type: 'payout_failed',
      queue_category: 'payments',
    });
    conn.close();
    expect((await ask(itemId)).status).toBe(404);
  });

  it('refuses a matter naming a member whose account is gone', async () => {
    const conn = db();
    const itemId = insertWorkQueueItem(conn, {
      entity_id: 'member-who-never-existed',
      task_type: 'member_link_help_request',
    });
    conn.close();
    expect((await ask(itemId)).status).toBe(404);
  });

  it('refuses an item that is already closed', async () => {
    const itemId = seedItem();
    const conn = db();
    conn.prepare(`UPDATE work_queue_items SET status = 'dismissed' WHERE id = ?`).run(itemId);
    conn.close();
    expect((await ask(itemId)).status).toBe(404);
  });

  it('requires a subject, a question and an answer kind', async () => {
    const itemId = seedItem();
    expect((await ask(itemId, { subject: '' })).status).toBe(422);
    expect((await ask(itemId, { body: '' })).status).toBe(422);
    expect((await ask(itemId, { expectedAnswerKind: 'whatever' })).status).toBe(422);
  });

  it('caps the question length', async () => {
    const itemId = seedItem();
    expect((await ask(itemId, { body: 'x'.repeat(2001) })).status).toBe(422);
    expect((await ask(itemId, { subject: 'x'.repeat(201) })).status).toBe(422);
  });

  it('is refused to a non-admin and to an unauthenticated caller', async () => {
    const itemId = seedItem();
    const asMember = await request(createApp())
      .post(`/admin/work-queue/${itemId}/ask-member`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ expectedAnswerKind: 'acknowledge', subject: 's', body: 'b' });
    expect(asMember.status).toBe(403);

    const anon = await request(createApp())
      .post(`/admin/work-queue/${itemId}/ask-member`)
      .type('form')
      .send({ expectedAnswerKind: 'acknowledge', subject: 's', body: 'b' });
    expect(anon.status).toBe(302);
  });

  it('rejects a request with no CSRF protection', async () => {
    const itemId = seedItem();
    await expectCsrfReject(createApp(), 'post', `/admin/work-queue/${itemId}/ask-member`, {
      cookie: adminCookie(),
      body: { expectedAnswerKind: 'acknowledge', subject: 's', body: 'b' },
    });
  });
});

describe('the member reads and answers', () => {
  it('shows the question on the member own surface', async () => {
    const itemId = seedItem();
    await ask(itemId, { subject: 'Please check your date of birth' });
    const res = await request(createApp())
      .get(`/members/${MEMBER_SLUG}/questions`)
      .set('Cookie', memberCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Please check your date of birth');
  });

  it('is not reachable by another member', async () => {
    const res = await request(createApp())
      .get(`/members/${MEMBER_SLUG}/questions`)
      .set('Cookie', otherCookie());
    expect(res.status).toBe(404);
  });

  it('redirects an unauthenticated visitor to sign in', async () => {
    const res = await request(createApp()).get(`/members/${MEMBER_SLUG}/questions`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('says so plainly when nothing is waiting', async () => {
    const res = await request(createApp())
      .get(`/members/${MEMBER_SLUG}/questions`)
      .set('Cookie', memberCookie());
    expect(res.text).toContain('Nothing is waiting for you');
  });

  it('points the member at the question from their own profile', async () => {
    const itemId = seedItem();
    await ask(itemId);
    const res = await request(createApp())
      .get(`/members/${MEMBER_SLUG}`)
      .set('Cookie', memberCookie());
    expect(res.text).toContain(`/members/${MEMBER_SLUG}/questions`);
  });

  // A park has no clock, so the member's answer is the one thing that can
  // genuinely un-stick the matter. It brings the item back by itself; otherwise
  // the answer arrives and the item sits unread in the parked listing.
  it('brings a parked item back to the working queue when the answer arrives', async () => {
    const itemId = seedItem();
    await ask(itemId);
    await request(createApp())
      .post(`/admin/work-queue/${itemId}/park`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ note: 'Waiting on their answer.' });

    const parked = readDb();
    expect((parked.prepare('SELECT parked_at FROM work_queue_items WHERE id = ?')
      .get(itemId) as { parked_at: string | null }).parked_at).toBeTruthy();
    parked.close();

    const messageId = messageRow()!.id as string;
    const res = await request(createApp())
      .post(`/members/${MEMBER_SLUG}/questions/${messageId}/answer`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ dateAnswer: 'confirm', note: 'That date is right.' });
    expect(res.status).toBe(303);

    const after = readDb();
    const row = after.prepare('SELECT parked_at, park_reason, status FROM work_queue_items WHERE id = ?')
      .get(itemId) as { parked_at: string | null; park_reason: string | null; status: string };
    after.close();
    expect(row.parked_at).toBeNull();
    expect(row.park_reason).toBeNull();
    expect(row.status).toBe('open');
  });

  it('confirming the date on file records the outcome and leaves it alone', async () => {
    const itemId = seedItem();
    await ask(itemId);
    const messageId = messageRow()!.id as string;
    const res = await request(createApp())
      .post(`/members/${MEMBER_SLUG}/questions/${messageId}/answer`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ dateAnswer: 'confirm', note: 'That date is right.' });
    expect(res.status).toBe(303);

    const row = messageRow()!;
    expect(row.status).toBe('answered');
    expect(row.outcome).toBe('confirmed');
    expect(row.note_text).toBe('That date is right.');
    expect(row.answered_at).not.toBeNull();

    const conn = readDb();
    const member = conn.prepare('SELECT birth_date FROM members WHERE id = ?')
      .get(MEMBER_ID) as { birth_date: string };
    conn.close();
    expect(member.birth_date).toBe('1978-03-14');
  });

  it('correcting the date writes it through and records the correction', async () => {
    const itemId = seedItem();
    await ask(itemId);
    const messageId = messageRow()!.id as string;
    const res = await request(createApp())
      .post(`/members/${MEMBER_SLUG}/questions/${messageId}/answer`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ dateAnswer: 'correct', birthDay: '9', birthMonth: '12', birthYear: '1974', note: '' });
    expect(res.status).toBe(303);

    expect(messageRow()!.outcome).toBe('corrected');
    const conn = readDb();
    const member = conn.prepare('SELECT birth_date FROM members WHERE id = ?')
      .get(MEMBER_ID) as { birth_date: string };
    conn.close();
    expect(member.birth_date).toBe('1974-12-09');
  });

  // A rejected date must leave the question outstanding, or the member is shut
  // out of answering a question their answer never actually reached.
  it('a date it cannot accept leaves the question open and stores nothing', async () => {
    const itemId = seedItem();
    await ask(itemId);
    const messageId = messageRow()!.id as string;
    const res = await request(createApp())
      .post(`/members/${MEMBER_SLUG}/questions/${messageId}/answer`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ dateAnswer: 'correct', birthDay: '30', birthMonth: '2', birthYear: '2023' });
    expect(res.status).toBe(422);
    expect(messageRow()!.status).toBe('sent');

    const conn = readDb();
    const member = conn.prepare('SELECT birth_date FROM members WHERE id = ?')
      .get(MEMBER_ID) as { birth_date: string };
    conn.close();
    expect(member.birth_date).toBe('1978-03-14');
  });

  // The member is answering a question on a possibly-fraudulent claim. Reading
  // a filled-in date as "the date on file is correct" would hand the reviewing
  // administrator the opposite of what the member meant, with no second chance.
  it('refuses an answer that says confirmed while also entering a date', async () => {
    const itemId = seedItem();
    await ask(itemId);
    const messageId = messageRow()!.id as string;
    const res = await request(createApp())
      .post(`/members/${MEMBER_SLUG}/questions/${messageId}/answer`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ dateAnswer: 'confirm', birthDay: '9', birthMonth: '12', birthYear: '1974' });
    expect(res.status).toBe(422);
    expect(messageRow()!.status).toBe('sent');

    const conn = readDb();
    const member = conn.prepare('SELECT birth_date FROM members WHERE id = ?')
      .get(MEMBER_ID) as { birth_date: string };
    conn.close();
    expect(member.birth_date).toBe('1978-03-14');
  });

  it('hands the member back what they typed when the answer is refused', async () => {
    const itemId = seedItem();
    await ask(itemId);
    const messageId = messageRow()!.id as string;
    const res = await request(createApp())
      .post(`/members/${MEMBER_SLUG}/questions/${messageId}/answer`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({
        dateAnswer: 'correct', birthDay: '32', birthMonth: '7', birthYear: '1981',
        note: 'the old record is right',
      });
    expect(res.status).toBe(422);
    expect(res.text).toContain('value="32"');
    expect(res.text).toContain('value="1981"');
    expect(res.text).toContain('<option value="7" selected>July</option>');
    expect(res.text).toContain('the old record is right');
  });

  it('refuses an answer that chooses neither option', async () => {
    const itemId = seedItem();
    await ask(itemId);
    const messageId = messageRow()!.id as string;
    const res = await request(createApp())
      .post(`/members/${MEMBER_SLUG}/questions/${messageId}/answer`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ note: 'I am not sure' });
    expect(res.status).toBe(422);
    expect(messageRow()!.status).toBe('sent');
  });

  // Re-entering the date already on file is a confirmation, whichever box it
  // arrived in, so the administrator is not told it was corrected.
  it('records a re-entry of the same date as a confirmation', async () => {
    const itemId = seedItem();
    await ask(itemId);
    const messageId = messageRow()!.id as string;
    const res = await request(createApp())
      .post(`/members/${MEMBER_SLUG}/questions/${messageId}/answer`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ dateAnswer: 'correct', birthDay: '14', birthMonth: '3', birthYear: '1978' });
    expect(res.status).toBe(303);
    expect(messageRow()!.outcome).toBe('confirmed');
  });

  it('tells the member their answer was received', async () => {
    const itemId = seedItem();
    await ask(itemId);
    const messageId = messageRow()!.id as string;
    const post = await request(createApp())
      .post(`/members/${MEMBER_SLUG}/questions/${messageId}/answer`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ dateAnswer: 'confirm' });
    // The confirmation rides a flash cookie across the redirect, so the
    // follow-up request has to carry it the way a browser would.
    const flash = ((post.headers['set-cookie'] as string[] | undefined) ?? [])
      .find((c) => c.startsWith('footbag_flash='))!.split(';')[0];
    const res = await request(createApp())
      .get(`/members/${MEMBER_SLUG}/questions`)
      .set('Cookie', `${memberCookie()}; ${flash}`);
    expect(res.text).toContain('Your answer has been sent');
  });

  it('cannot be answered twice', async () => {
    const itemId = seedItem();
    await ask(itemId);
    const messageId = messageRow()!.id as string;
    const send = (): request.Test => request(createApp())
      .post(`/members/${MEMBER_SLUG}/questions/${messageId}/answer`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ dateAnswer: 'confirm', note: 'first' });
    expect((await send()).status).toBe(303);
    expect((await send()).status).toBe(404);
    expect(messageRow()!.note_text).toBe('first');
  });

  it('cannot be answered by another member', async () => {
    const itemId = seedItem();
    await ask(itemId);
    const messageId = messageRow()!.id as string;
    const res = await request(createApp())
      .post(`/members/${OTHER_SLUG}/questions/${messageId}/answer`)
      .set('Cookie', otherCookie())
      .type('form')
      .send({ dateAnswer: 'confirm' });
    expect(res.status).toBe(404);
    expect(messageRow()!.status).toBe('sent');
  });

  it('caps the note length', async () => {
    const itemId = seedItem();
    await ask(itemId);
    const messageId = messageRow()!.id as string;
    const res = await request(createApp())
      .post(`/members/${MEMBER_SLUG}/questions/${messageId}/answer`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ dateAnswer: 'confirm', note: 'x'.repeat(2001) });
    expect(res.status).toBe(422);
    expect(messageRow()!.status).toBe('sent');
  });

  it('stores an adversarial note verbatim and escapes it on the admin surface', async () => {
    const itemId = seedItem();
    await ask(itemId);
    const messageId = messageRow()!.id as string;
    const payload = '<script>alert(1)</script>';
    await request(createApp())
      .post(`/members/${MEMBER_SLUG}/questions/${messageId}/answer`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ dateAnswer: 'confirm', note: payload });
    expect(messageRow()!.note_text).toBe(payload);

    const res = await request(createApp())
      .get('/admin/work-queue')
      .set('Cookie', adminCookie());
    expect(res.text).not.toContain(payload);
    expect(res.text).toContain('&lt;script&gt;');
  });
});

describe('the administrator sees the answer on the item they asked from', () => {
  it('shows the question as waiting, then the answer when it comes back', async () => {
    const itemId = seedItem();
    await ask(itemId);

    const waiting = await request(createApp())
      .get('/admin/work-queue').set('Cookie', adminCookie());
    expect(waiting.text).toContain('Waiting on the member since');

    const messageId = messageRow()!.id as string;
    await request(createApp())
      .post(`/members/${MEMBER_SLUG}/questions/${messageId}/answer`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ dateAnswer: 'confirm', note: 'Yes that is right.' });

    const answered = await request(createApp())
      .get('/admin/work-queue').set('Cookie', adminCookie());
    expect(answered.text).toContain('Confirmed the date on file is right');
    expect(answered.text).toContain('Yes that is right.');
    expect(answered.text).not.toContain('Waiting on the member since');
  });

  it('offers the ask control on any matter naming a signed-up member', async () => {
    seedItem('auto_link_match');
    const res = await request(createApp())
      .get('/admin/work-queue').set('Cookie', adminCookie());
    expect(res.text).toContain('ask-member');
  });

  it('offers no ask control on a matter that names no single member', async () => {
    // The card and the send path answer the same question by asking the same
    // code, so a control cannot render on a matter the send path then refuses.
    const conn = db();
    insertWorkQueueItem(conn, {
      entity_type: 'reconciliation_issue',
      entity_id: 'recon-nobody',
      task_type: 'reconciliation_discrepancy',
      queue_category: 'payments',
    });
    conn.close();
    const res = await request(createApp())
      .get('/admin/work-queue').set('Cookie', adminCookie());
    expect(res.text).toContain('recon-nobody');
    expect(res.text).not.toContain('/admin/work-queue/recon-nobody/ask-member');
  });
});

describe('erasure clears the words and keeps the rows', () => {
  function purgeFixture(): void {
    const conn = db();
    insertLegacyMember(conn, { legacy_member_id: LEGACY_ID });
    conn.close();
  }

  it('the account purge clears subject, question and note', async () => {
    purgeFixture();
    const itemId = seedItem();
    await ask(itemId);
    const messageId = messageRow()!.id as string;
    await request(createApp())
      .post(`/members/${MEMBER_SLUG}/questions/${messageId}/answer`)
      .set('Cookie', memberCookie())
      .type('form')
      .send({ dateAnswer: 'confirm', note: 'my private words' });

    const svc = (await import('../../src/services/memberService')).memberService;
    const conn = db();
    conn.prepare('UPDATE members SET deleted_at = ? WHERE id = ?')
      .run('2026-01-01T00:00:00.000Z', MEMBER_ID);
    conn.close();
    svc.purgeAccountPII(MEMBER_ID);

    const row = messageRow()!;
    expect(row.subject).toBeNull();
    expect(row.body_text).toBeNull();
    expect(row.note_text).toBeNull();
    // The row itself survives, so the queue item's trail keeps its shape.
    expect(row.id).toBe(messageId);
    expect(row.status).toBe('answered');
  });
});
