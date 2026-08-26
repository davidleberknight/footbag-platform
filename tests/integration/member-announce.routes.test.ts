/**
 * The community announcement an organizer-tier member sends.
 *
 * Contract verified:
 *   - the surface is organizer-tier and owner-only: a signed-out visitor, a
 *     Tier 1 member, and a member reaching for someone else's path are all
 *     refused, the last as a 404 so the path cannot be used to discover slugs
 *   - the send rides the same path an administrator's list send takes: one
 *     outbox row per deliverable subscriber to the announce list, on the bulk
 *     stream, from the list's own address
 *   - the record says a member announced to the community, not that an
 *     administrator mailed a list: its own archive type, and the member as actor
 *   - the daily limit answers 429 with Retry-After and sends nothing
 *   - resubmitting the same rendered form sends once
 *   - the shortcut appears on an organizer's profile and not on a Tier 1 one
 *
 * The audit ledger is append-only and cannot be cleared between cases, so every
 * assertion about it is scoped to the announce list and counted as a delta.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMailingListSubscription,
  insertMemberTierGrant,
  insertSystemConfig,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3096');

const ORGANIZER   = 'an_org_001';
const ORG_SLUG    = 'an_organizer';
const PLAIN       = 'an_plain_001';
const PLAIN_SLUG  = 'an_plain';
const SUB_ONE     = 'an_sub_001';
const SUB_TWO     = 'an_sub_002';
const ADMIN       = 'an_admin_001';

const ANNOUNCE = `/members/${ORG_SLUG}/announce`;
/** Comfortably above what any single case sends, so the throttle case is the
 *  only one that meets it. */
const PER_DAY = 5;

let createApp: Awaited<ReturnType<typeof importApp>>;

function organizerCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ORGANIZER })}`;
}
function plainCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: PLAIN })}`;
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
  recipient_member_id: string | null;
  mailing_list_id: string | null;
  subject: string;
  stream: string;
  from_identity: string | null;
}

function outboxRows(): OutboxRow[] {
  return withDb((db) => db.prepare(`
    SELECT recipient_member_id, mailing_list_id, subject, stream, from_identity
    FROM outbox_emails ORDER BY recipient_member_id
  `).all() as OutboxRow[]);
}

interface ArchiveRow {
  archive_type: string;
  mailing_list_id: string | null;
  sender_member_id: string | null;
  from_identity: string | null;
  subject: string;
  recipient_count: number;
}

function archiveRows(): ArchiveRow[] {
  return withDb((db) => db.prepare(`
    SELECT archive_type, mailing_list_id, sender_member_id, from_identity, subject, recipient_count
    FROM email_archives ORDER BY sent_at, id
  `).all() as ArchiveRow[]);
}

/** Sends recorded against the announce list, which only grows. */
function announceAuditCount(): number {
  return withDb((db) => (db.prepare(
    `SELECT COUNT(*) AS c FROM audit_entries
     WHERE action_type = 'mailing_list.broadcast_sent' AND entity_id = 'announce'`,
  ).get() as { c: number }).c);
}

function memberActorCount(): number {
  return withDb((db) => (db.prepare(
    `SELECT COUNT(*) AS c FROM audit_entries
     WHERE action_type = 'mailing_list.broadcast_sent' AND entity_id = 'announce'
       AND actor_type = 'member' AND actor_member_id = ?`,
  ).get(ORGANIZER) as { c: number }).c);
}

/** The send token the rendered form carries. */
function tokenFrom(html: string): string {
  const m = html.match(/name="sendToken" value="([^"]+)"/);
  if (!m) throw new Error('announce form carried no send token');
  return m[1]!;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertSystemConfig(db, {
    config_key: 'announce_send_rate_limit_per_day',
    value_json: String(PER_DAY),
  });

  insertMember(db, { id: ORGANIZER, slug: ORG_SLUG,   login_email: 'an-org@example.com' });
  insertMember(db, { id: PLAIN,     slug: PLAIN_SLUG, login_email: 'an-plain@example.com' });
  // Tier is held in the append-only grant ledger the tier predicates read, not
  // on the member row.
  insertMemberTierGrant(db, {
    member_id: ORGANIZER, new_tier_status: 'tier2',
    new_underlying_tier_status: 'tier2', reason_code: 'purchase.tier2',
  });
  insertMemberTierGrant(db, {
    member_id: PLAIN, new_tier_status: 'tier1',
    new_underlying_tier_status: 'tier1', reason_code: 'purchase.tier1',
  });
  insertMember(db, { id: SUB_ONE,   slug: 'an_sub_one', login_email: 'an-one@example.com' });
  insertMember(db, { id: SUB_TWO,   slug: 'an_sub_two', login_email: 'an-two@example.com' });
  insertMember(db, { id: ADMIN,     slug: 'an_admin',   login_email: 'an-admin@example.com', is_admin: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  withDb((db) => {
    db.prepare('DELETE FROM outbox_emails').run();
    db.prepare('DELETE FROM email_archives').run();
    db.prepare('DELETE FROM mailing_list_subscriptions').run();
  });
});

function seedSubscribers(): void {
  withDb((db) => {
    insertMailingListSubscription(db, { member_id: SUB_ONE, list_slug: 'announce', status: 'subscribed' });
    insertMailingListSubscription(db, { member_id: SUB_TWO, list_slug: 'announce', status: 'subscribed' });
  });
}

async function formToken(): Promise<string> {
  const form = await request(createApp()).get(ANNOUNCE).set('Cookie', organizerCookie());
  return tokenFrom(form.text);
}

describe('who may send an announcement', () => {
  it('sends an unauthenticated visitor to sign in', async () => {
    const res = await request(createApp()).get(ANNOUNCE);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('refuses a member below organizer tier', async () => {
    const res = await request(createApp())
      .get(`/members/${PLAIN_SLUG}/announce`).set('Cookie', plainCookie());
    expect(res.status).toBe(403);
  });

  it('refuses a Tier 1 member posting an announcement, and sends nothing', async () => {
    seedSubscribers();
    const res = await request(createApp())
      .post(`/members/${PLAIN_SLUG}/announce`).set('Cookie', plainCookie()).type('form')
      .send({ subject: 'Not mine to send', bodyText: 'Body', sendToken: 'tok-plain' });

    expect(res.status).toBe(403);
    expect(outboxRows()).toHaveLength(0);
  });

  it('404s an organizer reaching for another member\'s announce form', async () => {
    const res = await request(createApp())
      .get(`/members/${PLAIN_SLUG}/announce`).set('Cookie', organizerCookie());
    expect(res.status).toBe(404);
  });
});

describe('the announce form', () => {
  it('names the list\'s own address and how many are subscribed', async () => {
    seedSubscribers();
    const res = await request(createApp()).get(ANNOUNCE).set('Cookie', organizerCookie());

    expect(res.status).toBe(200);
    expect(res.text).toContain('announce@footbag.org');
    expect(res.text).toMatch(/2 members currently receive these/);
  });

  it('warns when nobody is subscribed', async () => {
    const res = await request(createApp()).get(ANNOUNCE).set('Cookie', organizerCookie());
    expect(res.text).toMatch(/Nobody is subscribed to community announcements/);
  });

  it('posts to the member\'s own announce path', async () => {
    const res = await request(createApp()).get(ANNOUNCE).set('Cookie', organizerCookie());
    expect(res.text).toContain(`action="${ANNOUNCE}"`);
  });
});

describe('sending an announcement', () => {
  it('queues one message per subscriber, on the bulk stream, from the list address', async () => {
    seedSubscribers();
    const token = await formToken();

    const res = await request(createApp())
      .post(ANNOUNCE).set('Cookie', organizerCookie()).type('form')
      .send({ subject: 'Worlds is open', bodyText: 'Registration opens Monday.', sendToken: token });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`${ANNOUNCE}?notice=sent`);

    const rows = outboxRows();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.recipient_member_id).sort()).toEqual([SUB_ONE, SUB_TWO]);
    expect(rows[0]!.mailing_list_id).toBe('announce');
    expect(rows[0]!.stream).toBe('bulk');
    expect(rows[0]!.from_identity).toBe('announce@footbag.org');
    expect(rows[0]!.subject).toBe('Worlds is open');
  });

  it('records it as a community announcement made by the member', async () => {
    seedSubscribers();
    const before = announceAuditCount();
    const beforeMember = memberActorCount();

    await request(createApp())
      .post(ANNOUNCE).set('Cookie', organizerCookie()).type('form')
      .send({ subject: 'Recorded', bodyText: 'Body', sendToken: await formToken() });

    const archives = archiveRows();
    expect(archives).toHaveLength(1);
    // Its own archive type, so the record does not read as an administrator
    // mailing a list.
    expect(archives[0]!.archive_type).toBe('announce');
    expect(archives[0]!.mailing_list_id).toBe('announce');
    expect(archives[0]!.sender_member_id).toBe(ORGANIZER);
    expect(archives[0]!.recipient_count).toBe(2);

    expect(announceAuditCount()).toBe(before + 1);
    expect(memberActorCount()).toBe(beforeMember + 1);
  });

  it('appears in the admin broadcast archive as a community announcement', async () => {
    seedSubscribers();
    await request(createApp())
      .post(ANNOUNCE).set('Cookie', organizerCookie()).type('form')
      .send({ subject: 'Visible to admins', bodyText: 'Body', sendToken: await formToken() });

    const admin = `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN, role: 'admin' })}`;
    const res = await request(createApp()).get('/admin/broadcasts').set('Cookie', admin);

    expect(res.text).toContain('Visible to admins');
    expect(res.text).toContain('Community announcements');
  });

  it('sends once when the same form is submitted twice', async () => {
    seedSubscribers();
    const token = await formToken();
    const body = { subject: 'Once only', bodyText: 'Body', sendToken: token };

    await request(createApp()).post(ANNOUNCE).set('Cookie', organizerCookie()).type('form').send(body);
    const second = await request(createApp())
      .post(ANNOUNCE).set('Cookie', organizerCookie()).type('form').send(body);

    expect(second.headers.location).toBe(`${ANNOUNCE}?notice=already_sent`);
    expect(outboxRows()).toHaveLength(2);
    expect(archiveRows()).toHaveLength(1);
  });

  it('refuses a send with no subject and keeps the text', async () => {
    seedSubscribers();
    const res = await request(createApp())
      .post(ANNOUNCE).set('Cookie', organizerCookie()).type('form')
      .send({ subject: '', bodyText: 'Kept across the failure', sendToken: await formToken() });

    expect(res.status).toBe(422);
    expect(res.text).toMatch(/Subject: required/);
    expect(res.text).toContain('Kept across the failure');
    expect(outboxRows()).toHaveLength(0);
  });

  it('sends nothing when nobody is subscribed', async () => {
    const res = await request(createApp())
      .post(ANNOUNCE).set('Cookie', organizerCookie()).type('form')
      .send({ subject: 'Into the void', bodyText: 'Body', sendToken: await formToken() });

    expect(res.headers.location).toBe(`${ANNOUNCE}?notice=no_recipients`);
    expect(outboxRows()).toHaveLength(0);
    expect(archiveRows()).toHaveLength(0);
  });
});

describe('the daily limit', () => {
  it('refuses past the limit with Retry-After and sends nothing further', async () => {
    seedSubscribers();

    for (let i = 0; i < PER_DAY; i += 1) {
      const res = await request(createApp())
        .post(ANNOUNCE).set('Cookie', organizerCookie()).type('form')
        .send({ subject: `Announcement ${i}`, bodyText: 'Body', sendToken: await formToken() });
      expect(res.status, `send ${i} within the limit`).toBe(303);
    }
    const sentSoFar = outboxRows().length;

    const blocked = await request(createApp())
      .post(ANNOUNCE).set('Cookie', organizerCookie()).type('form')
      .send({ subject: 'One too many', bodyText: 'Body', sendToken: await formToken() });

    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(outboxRows()).toHaveLength(sentSoFar);
  });
});

describe('reaching the form', () => {
  it('is offered on an organizer\'s own profile', async () => {
    const res = await request(createApp())
      .get(`/members/${ORG_SLUG}`).set('Cookie', organizerCookie());
    expect(res.text).toContain(ANNOUNCE);
  });

  it('is not offered on a Tier 1 member\'s profile', async () => {
    const res = await request(createApp())
      .get(`/members/${PLAIN_SLUG}`).set('Cookie', plainCookie());
    expect(res.text).not.toContain('/announce');
  });
});
