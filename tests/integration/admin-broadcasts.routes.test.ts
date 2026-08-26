/**
 * Composing a message to a mailing list, and the record of what was sent.
 *
 * Contract verified:
 *   - the compose form and the archive sit behind the admin gate
 *   - a send hands the audience to the one enqueue path: one outbox row per
 *     deliverable subscriber, carrying the bulk stream and the list's own
 *     from-address, and the composer enumerates nobody itself
 *   - the list's subject prefix is applied once, in front, and the archive
 *     records the subject that actually went out
 *   - the send, its archive row and its audit row land together
 *   - resubmitting the same rendered form sends once: the send token is the
 *     idempotency key, so the second submission collapses onto the first and
 *     writes no second archive row
 *   - an archived list and a group-backed list are both refused before anything
 *     is enqueued, with a message rather than a failure from the resolver
 *   - a list with no deliverable subscriber sends nothing and records nothing
 *   - the archive names no recipient
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMailingList,
  insertMailingListSubscription,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3094');

const ADMIN_ID  = 'bc_admin_001';
const SUB_ONE   = 'bc_sub_001';
const SUB_TWO   = 'bc_sub_002';
const BOUNCED   = 'bc_bounced_001';

const SEEDED_LISTS = [
  'admin-alerts', 'all-members', 'newsletter', 'board-announcements',
  'event-notifications', 'technical-updates', 'active-player-reminders',
];

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: SUB_ONE })}`;
}

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

interface OutboxRow {
  recipient_email: string;
  recipient_member_id: string | null;
  mailing_list_id: string | null;
  subject: string;
  body_text: string | null;
  stream: string;
  from_identity: string | null;
}

function outboxRows(): OutboxRow[] {
  return withDb((db) => db.prepare(`
    SELECT recipient_email, recipient_member_id, mailing_list_id, subject, body_text,
           stream, from_identity
    FROM outbox_emails ORDER BY recipient_email
  `).all() as OutboxRow[]);
}

interface ArchiveRow {
  id: string;
  archive_type: string;
  mailing_list_id: string | null;
  sender_member_id: string | null;
  from_identity: string | null;
  subject: string;
  body_text: string;
  recipient_count: number;
}

function archiveRows(): ArchiveRow[] {
  return withDb((db) => db.prepare(`
    SELECT id, archive_type, mailing_list_id, sender_member_id, from_identity,
           subject, body_text, recipient_count
    FROM email_archives ORDER BY sent_at, id
  `).all() as ArchiveRow[]);
}

/** The audit ledger is append-only and survives every case, so a count is only
 *  meaningful when it is scoped to the list the case sent to. */
function sendAuditCount(slug: string): number {
  return withDb((db) => (db.prepare(
    `SELECT COUNT(*) AS c FROM audit_entries
     WHERE action_type = 'mailing_list.broadcast_sent' AND entity_id = ?`,
  ).get(slug) as { c: number }).c);
}

/** The send token the rendered compose form carries. */
function tokenFrom(html: string): string {
  const m = html.match(/name="sendToken" value="([^"]+)"/);
  if (!m) throw new Error('compose form carried no send token');
  return m[1]!;
}

/** A list with two deliverable subscribers and one whose address bounced. */
function seedListWithSubscribers(slug: string, overrides: Record<string, unknown> = {}): void {
  withDb((db) => {
    insertMailingList(db, { slug, name: slug, ...overrides });
    insertMailingListSubscription(db, { member_id: SUB_ONE, list_slug: slug, status: 'subscribed' });
    insertMailingListSubscription(db, { member_id: SUB_TWO, list_slug: slug, status: 'subscribed' });
    insertMailingListSubscription(db, { member_id: BOUNCED, list_slug: slug, status: 'bounced' });
  });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'bc_admin', login_email: 'bc-admin@example.com', is_admin: 1 });
  insertMember(db, { id: SUB_ONE,  slug: 'bc_sub_one', login_email: 'bc-one@example.com' });
  insertMember(db, { id: SUB_TWO,  slug: 'bc_sub_two', login_email: 'bc-two@example.com' });
  insertMember(db, { id: BOUNCED,  slug: 'bc_bounced', login_email: 'bc-bounced@example.com' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  withDb((db) => {
    db.prepare('DELETE FROM outbox_emails').run();
    db.prepare('DELETE FROM email_archives').run();
    db.prepare('DELETE FROM mailing_list_subscriptions').run();
    db.prepare(
      `DELETE FROM mailing_lists WHERE slug NOT IN (${SEEDED_LISTS.map(() => '?').join(',')})`,
    ).run(...SEEDED_LISTS);
  });
});

describe('the admin gate on the compose and archive surfaces', () => {
  it('sends an unauthenticated visitor to sign in', async () => {
    const res = await request(createApp()).get('/admin/broadcasts');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('refuses a signed-in non-admin', async () => {
    const res = await request(createApp()).get('/admin/broadcasts').set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });
});

describe('the compose form', () => {
  it('states the list, its sender and how many are subscribed', async () => {
    seedListWithSubscribers('news-list', { name: 'News List', from_identity: 'news@footbag.org' });

    const res = await request(createApp())
      .get('/admin/mailing-lists/news-list/compose').set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    expect(res.text).toContain('News List');
    expect(res.text).toContain('news@footbag.org');
    expect(res.text).toMatch(/2 members are subscribed/);
  });

  it('warns when the list has nobody on it', async () => {
    withDb((db) => insertMailingList(db, { slug: 'nobody-list', name: 'Nobody List' }));

    const res = await request(createApp())
      .get('/admin/mailing-lists/nobody-list/compose').set('Cookie', adminCookie());

    expect(res.text).toMatch(/Nobody is subscribed/);
  });

  it('says where the subject prefix will appear', async () => {
    withDb((db) => insertMailingList(db, { slug: 'prefixed', name: 'Prefixed', subject_prefix: 'IFPA' }));

    const res = await request(createApp())
      .get('/admin/mailing-lists/prefixed/compose').set('Cookie', adminCookie());

    expect(res.text).toContain('[IFPA]');
  });

  it('404s an unknown list', async () => {
    const res = await request(createApp())
      .get('/admin/mailing-lists/no-such-list/compose').set('Cookie', adminCookie());
    expect(res.status).toBe(404);
  });
});

describe('sending to a list', () => {
  it('queues one message per deliverable subscriber and records the send', async () => {
    seedListWithSubscribers('send-list', { name: 'Send List', from_identity: 'news@footbag.org' });
    const form = await request(createApp())
      .get('/admin/mailing-lists/send-list/compose').set('Cookie', adminCookie());

    const res = await request(createApp())
      .post('/admin/mailing-lists/send-list/compose')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ subject: 'Spring news', bodyText: 'The season opens.', sendToken: tokenFrom(form.text) });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/mailing-lists/send-list?notice=sent');

    // The bounced subscriber is left out: the audience resolver applies the
    // deliverability filter, and the composer never enumerates anyone itself.
    const rows = outboxRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.recipient_member_id).sort()).toEqual([SUB_ONE, SUB_TWO]);
    expect(rows[0]!.mailing_list_id).toBe('send-list');
    expect(rows[0]!.from_identity).toBe('news@footbag.org');
    expect(rows[0]!.body_text).toBe('The season opens.');

    const archives = archiveRows();
    expect(archives).toHaveLength(1);
    expect(archives[0]!.archive_type).toBe('mailing_list');
    expect(archives[0]!.mailing_list_id).toBe('send-list');
    expect(archives[0]!.sender_member_id).toBe(ADMIN_ID);
    expect(archives[0]!.subject).toBe('Spring news');
    expect(archives[0]!.recipient_count).toBe(2);
    expect(sendAuditCount('send-list')).toBe(1);
  });

  it('charges the send to the bulk stream on a list members may leave', async () => {
    seedListWithSubscribers('bulk-list', { name: 'Bulk List', is_member_manageable: 1 });
    const form = await request(createApp())
      .get('/admin/mailing-lists/bulk-list/compose').set('Cookie', adminCookie());

    await request(createApp())
      .post('/admin/mailing-lists/bulk-list/compose')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ subject: 'Bulk', bodyText: 'Body', sendToken: tokenFrom(form.text) });

    expect(outboxRows()[0]!.stream).toBe('bulk');
  });

  it('puts the list\'s prefix in front of the subject that goes out and is recorded', async () => {
    seedListWithSubscribers('pref-send', { name: 'Pref Send', subject_prefix: 'IFPA' });
    const form = await request(createApp())
      .get('/admin/mailing-lists/pref-send/compose').set('Cookie', adminCookie());

    await request(createApp())
      .post('/admin/mailing-lists/pref-send/compose')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ subject: 'Board notes', bodyText: 'Body', sendToken: tokenFrom(form.text) });

    expect(outboxRows()[0]!.subject).toBe('[IFPA] Board notes');
    expect(archiveRows()[0]!.subject).toBe('[IFPA] Board notes');
  });

  it('sends once when the same form is submitted twice', async () => {
    seedListWithSubscribers('twice-list', { name: 'Twice List' });
    const form = await request(createApp())
      .get('/admin/mailing-lists/twice-list/compose').set('Cookie', adminCookie());
    const token = tokenFrom(form.text);
    const body = { subject: 'Once only', bodyText: 'Body', sendToken: token };

    await request(createApp())
      .post('/admin/mailing-lists/twice-list/compose')
      .set('Cookie', adminCookie()).type('form').send(body);
    const second = await request(createApp())
      .post('/admin/mailing-lists/twice-list/compose')
      .set('Cookie', adminCookie()).type('form').send(body);

    expect(second.headers.location).toBe('/admin/mailing-lists/twice-list?notice=already_sent');
    expect(outboxRows()).toHaveLength(2);
    expect(archiveRows()).toHaveLength(1);
    expect(sendAuditCount('twice-list')).toBe(1);
  });

  it('sends nothing and records nothing when the list resolves to nobody', async () => {
    withDb((db) => insertMailingList(db, { slug: 'empty-send', name: 'Empty Send' }));
    const form = await request(createApp())
      .get('/admin/mailing-lists/empty-send/compose').set('Cookie', adminCookie());

    const res = await request(createApp())
      .post('/admin/mailing-lists/empty-send/compose')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ subject: 'Into the void', bodyText: 'Body', sendToken: tokenFrom(form.text) });

    expect(res.headers.location).toBe('/admin/mailing-lists/empty-send?notice=no_recipients');
    expect(outboxRows()).toHaveLength(0);
    expect(archiveRows()).toHaveLength(0);
    expect(sendAuditCount('empty-send')).toBe(0);
  });

  it('re-renders the form with the text and the same token when the subject is missing', async () => {
    seedListWithSubscribers('needs-subject', { name: 'Needs Subject' });
    const form = await request(createApp())
      .get('/admin/mailing-lists/needs-subject/compose').set('Cookie', adminCookie());
    const token = tokenFrom(form.text);

    const res = await request(createApp())
      .post('/admin/mailing-lists/needs-subject/compose')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ subject: '', bodyText: 'Kept across the failure', sendToken: token });

    expect(res.status).toBe(422);
    expect(res.text).toMatch(/Subject: required/);
    expect(res.text).toContain('Kept across the failure');
    expect(tokenFrom(res.text)).toBe(token);
    expect(outboxRows()).toHaveLength(0);
  });

  it('refuses a send with no message', async () => {
    seedListWithSubscribers('needs-body', { name: 'Needs Body' });
    const form = await request(createApp())
      .get('/admin/mailing-lists/needs-body/compose').set('Cookie', adminCookie());

    const res = await request(createApp())
      .post('/admin/mailing-lists/needs-body/compose')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ subject: 'No body', bodyText: '   ', sendToken: tokenFrom(form.text) });

    expect(res.status).toBe(422);
    expect(res.text).toMatch(/Message: required/);
    expect(outboxRows()).toHaveLength(0);
  });

  it('refuses a send carrying no token, which would mail the list twice on a retry', async () => {
    seedListWithSubscribers('no-token', { name: 'No Token' });

    const res = await request(createApp())
      .post('/admin/mailing-lists/no-token/compose')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ subject: 'Untokened', bodyText: 'Body' });

    expect(res.status).toBe(422);
    expect(outboxRows()).toHaveLength(0);
  });

  it('refuses to send to an archived list', async () => {
    seedListWithSubscribers('closed-list', { name: 'Closed List', status: 'archived' });

    const res = await request(createApp())
      .post('/admin/mailing-lists/closed-list/compose')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ subject: 'Too late', bodyText: 'Body', sendToken: 'tok-archived' });

    expect(res.status).toBe(422);
    expect(res.text).toMatch(/archived/);
    expect(outboxRows()).toHaveLength(0);
  });

  it('refuses to send to a group-backed list rather than failing in the resolver', async () => {
    withDb((db) => insertMailingList(db, {
      slug: 'committee-send', name: 'Committee Send',
      recipient_source: 'group', source_group_id: 'group_1',
    }));

    const res = await request(createApp())
      .post('/admin/mailing-lists/committee-send/compose')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ subject: 'To the group', bodyText: 'Body', sendToken: 'tok-group' });

    expect(res.status).toBe(422);
    expect(res.text).toMatch(/group roster/);
    expect(outboxRows()).toHaveLength(0);
  });

  it('404s an unknown list', async () => {
    const res = await request(createApp())
      .post('/admin/mailing-lists/no-such-list/compose')
      .set('Cookie', adminCookie())
      .type('form')
      .send({ subject: 'Nowhere', bodyText: 'Body', sendToken: 'tok-missing' });
    expect(res.status).toBe(404);
  });

  it('offers no compose control on an archived list', async () => {
    withDb((db) => insertMailingList(db, { slug: 'shut-list', name: 'Shut List', status: 'archived' }));

    const res = await request(createApp())
      .get('/admin/mailing-lists/shut-list').set('Cookie', adminCookie());

    expect(res.text).not.toContain('Compose a Message');
  });
});

describe('the broadcast archive', () => {
  it('lists a send and links to it, naming no recipient', async () => {
    seedListWithSubscribers('archived-send', { name: 'Archived Send' });
    const form = await request(createApp())
      .get('/admin/mailing-lists/archived-send/compose').set('Cookie', adminCookie());
    await request(createApp())
      .post('/admin/mailing-lists/archived-send/compose')
      .set('Cookie', adminCookie()).type('form')
      .send({ subject: 'Listed subject', bodyText: 'Body', sendToken: tokenFrom(form.text) });

    const res = await request(createApp()).get('/admin/broadcasts').set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    expect(res.text).toContain('Listed subject');
    expect(res.text).toContain('Archived Send');
    expect(res.text).not.toContain('bc-one@example.com');
    expect(res.text).not.toContain('bc-two@example.com');
  });

  it('shows the message exactly as it was sent', async () => {
    seedListWithSubscribers('detail-send', { name: 'Detail Send' });
    const form = await request(createApp())
      .get('/admin/mailing-lists/detail-send/compose').set('Cookie', adminCookie());
    await request(createApp())
      .post('/admin/mailing-lists/detail-send/compose')
      .set('Cookie', adminCookie()).type('form')
      .send({ subject: 'Detail subject', bodyText: 'First line.\nSecond line.', sendToken: tokenFrom(form.text) });

    const id = archiveRows()[0]!.id;
    const res = await request(createApp()).get(`/admin/broadcasts/${id}`).set('Cookie', adminCookie());

    expect(res.status).toBe(200);
    expect(res.text).toContain('Detail subject');
    expect(res.text).toContain('First line.\nSecond line.');
    expect(res.text).not.toContain('bc-one@example.com');
  });

  it('says so when nothing has been sent', async () => {
    const res = await request(createApp()).get('/admin/broadcasts').set('Cookie', adminCookie());
    expect(res.text).toMatch(/Nothing has been sent yet/);
  });

  it('404s an unknown send', async () => {
    const res = await request(createApp()).get('/admin/broadcasts/no-such-id').set('Cookie', adminCookie());
    expect(res.status).toBe(404);
  });
});
