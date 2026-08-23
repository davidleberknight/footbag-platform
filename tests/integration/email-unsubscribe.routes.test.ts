/**
 * One-click unsubscribe. A bulk message carries `List-Unsubscribe` and
 * `List-Unsubscribe-Post`, and the recipient's mail client posts the URL in
 * them with no session and no Origin header. The signed token is the whole of
 * the authority, so these cover what the token may do, what it may not, and the
 * uniform answer that stops the endpoint being used to probe membership.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertMailingListSubscription } from '../fixtures/factories';

const { dbPath } = setTestEnv('4077');

let createApp: Awaited<ReturnType<typeof importApp>>;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let mintUnsubscribeToken: typeof import('../../src/lib/unsubscribeToken').mintUnsubscribeToken;

const MEMBER_ID = 'unsub-member';
const OTHER_ID  = 'unsub-other';
const LIST      = 'newsletter';
const OTHER_LIST = 'board-announcements';

function subscribe(db: BetterSqlite3.Database, id: string, list: string, memberId: string): void {
  insertMailingListSubscription(db, {
    id, list_slug: list, member_id: memberId, status: 'subscribed',
  });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_ID, login_email: 'unsub-member@example.test' });
  insertMember(db, { id: OTHER_ID, login_email: 'unsub-other@example.test' });
  db.close();
  createApp = await importApp();
  mintUnsubscribeToken = (await import('../../src/lib/unsubscribeToken')).mintUnsubscribeToken;
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare('DELETE FROM mailing_list_subscriptions').run();
  subscribe(db, 'sub-a', LIST, MEMBER_ID);
  subscribe(db, 'sub-b', OTHER_LIST, MEMBER_ID);
  subscribe(db, 'sub-c', LIST, OTHER_ID);
  db.close();
});

function statusOf(list: string, memberId: string): string {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(
    'SELECT status FROM mailing_list_subscriptions WHERE mailing_list_id = ? AND member_id = ?',
  ).get(list, memberId) as { status: string };
  db.close();
  return row.status;
}

interface UnsubscribeAuditRow {
  actor_type: string;
  actor_member_id: string;
  entity_type: string;
  entity_id: string;
}

/** Every one-click-unsubscribe audit row so far, oldest first. */
function unsubscribeAuditRows(): UnsubscribeAuditRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db.prepare(
    `SELECT actor_type, actor_member_id, entity_type, entity_id
       FROM audit_entries WHERE action_type = 'email.unsubscribed_one_click'
      ORDER BY rowid`,
  ).all() as UnsubscribeAuditRow[];
  db.close();
  return rows;
}

describe('POST /email/unsubscribe', () => {
  it('withdraws exactly the one subscription the token names', async () => {
    const token = mintUnsubscribeToken(MEMBER_ID, { kind: 'list', slug: LIST });
    const res = await request(createApp()).post(`/email/unsubscribe?t=${encodeURIComponent(token)}`);

    expect(res.status).toBe(200);
    expect(statusOf(LIST, MEMBER_ID)).toBe('unsubscribed');
    // The same member's other list, and another member's row on the same list,
    // are untouched: one token, one row.
    expect(statusOf(OTHER_LIST, MEMBER_ID)).toBe('subscribed');
    expect(statusOf(LIST, OTHER_ID)).toBe('subscribed');
  });

  it('writes one audit row naming the member and the list, and none on a repeat', async () => {
    // The withdrawal is a governance-relevant change to a member's record, so
    // the ledger has to say who did it and to what. A repeat changes nothing
    // and must not turn a mail client's retry into ledger noise.
    // The ledger is append-only and shared across this file's cases, so the
    // assertion is on what this request added, not on the table's total.
    const before = unsubscribeAuditRows();
    const token = mintUnsubscribeToken(MEMBER_ID, { kind: 'list', slug: LIST });
    const url = `/email/unsubscribe?t=${encodeURIComponent(token)}`;
    await request(createApp()).post(url);
    await request(createApp()).post(url);

    const added = unsubscribeAuditRows().slice(before.length);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      // The member performed it; the token stands in for a session.
      actor_type:      'member',
      actor_member_id: MEMBER_ID,
      entity_type:     'mailing_list',
      entity_id:       LIST,
    });
  });

  it('writes no audit row when the token is rejected', async () => {
    const before = unsubscribeAuditRows().length;
    await request(createApp()).post('/email/unsubscribe?t=not-a-token');
    expect(unsubscribeAuditRows().length).toBe(before);
  });

  it('is idempotent, because a mail client may fire the header twice', async () => {
    const token = mintUnsubscribeToken(MEMBER_ID, { kind: 'list', slug: LIST });
    const url = `/email/unsubscribe?t=${encodeURIComponent(token)}`;
    await request(createApp()).post(url);
    const second = await request(createApp()).post(url);

    expect(second.status).toBe(200);
    expect(statusOf(LIST, MEMBER_ID)).toBe('unsubscribed');
  });

  it('changes nothing on a tampered token, and answers the same as a valid one', async () => {
    const token = mintUnsubscribeToken(MEMBER_ID, { kind: 'list', slug: LIST });
    const [, signature] = token.split('.');
    const forged = Buffer.from(`${OTHER_ID}|l:${LIST}`, 'utf8').toString('base64url');

    const res = await request(createApp())
      .post(`/email/unsubscribe?t=${encodeURIComponent(`${forged}.${signature}`)}`);

    expect(res.status).toBe(200);
    expect(statusOf(LIST, OTHER_ID)).toBe('subscribed');
    expect(statusOf(LIST, MEMBER_ID)).toBe('subscribed');
  });

  it('answers alike for a missing token, so it cannot be used to probe membership', async () => {
    const res = await request(createApp()).post('/email/unsubscribe');
    expect(res.status).toBe(200);
    expect(statusOf(LIST, MEMBER_ID)).toBe('subscribed');
  });

  it('accepts the request without an Origin header, as a mail client sends it', async () => {
    const token = mintUnsubscribeToken(MEMBER_ID, { kind: 'list', slug: LIST });
    const res = await request(createApp())
      .post(`/email/unsubscribe?t=${encodeURIComponent(token)}`)
      .send('List-Unsubscribe=One-Click');

    // Without the Origin-pin exemption this is a 403 and every unsubscribe in
    // the wild silently fails.
    expect(res.status).toBe(200);
    expect(statusOf(LIST, MEMBER_ID)).toBe('unsubscribed');
  });

  it('leaves a suppressed row in the state an operator or the provider set', async () => {
    const db = new BetterSqlite3(dbPath);
    db.prepare(
      "UPDATE mailing_list_subscriptions SET status = 'complained' WHERE mailing_list_id = ? AND member_id = ?",
    ).run(LIST, MEMBER_ID);
    db.close();

    const token = mintUnsubscribeToken(MEMBER_ID, { kind: 'list', slug: LIST });
    await request(createApp()).post(`/email/unsubscribe?t=${encodeURIComponent(token)}`);

    expect(statusOf(LIST, MEMBER_ID)).toBe('complained');
  });
});
