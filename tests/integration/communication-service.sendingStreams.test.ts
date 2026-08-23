/**
 * Sending-stream attribution. Transactional and bulk mail carry opposite risk
 * -- a password reset that does not arrive locks a member out, while a
 * broadcast to many addresses of mixed freshness is where complaints come from
 * -- so each names its own SES configuration set and one stream's complaint
 * rate never lands on the other's reputation.
 *
 * The stream follows the audience, decided at enqueue and stored on the row:
 * bulk whenever the recipient has a subscription they could act on, which
 * covers the many-recipient audiences and equally a one-member send that
 * belongs to a list, such as a reminder a sweep delivers one member at a time.
 * A send carrying no list and no broadcast audience is transactional.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertMailingList,
  insertMailingListSubscription,
  insertOutboxEmail,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4074');

process.env.SES_CONFIGURATION_SET_TRANSACTIONAL = 'footbag-test-transactional';
process.env.SES_CONFIGURATION_SET_BULK          = 'footbag-test-bulk';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createCommunicationService: typeof import('../../src/services/communicationService').createCommunicationService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createStubSesAdapter: typeof import('../../src/adapters/sesAdapter').createStubSesAdapter;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let readUnsubscribeToken: typeof import('../../src/lib/unsubscribeToken').readUnsubscribeToken;

const SUBSCRIBER_ID = 'stream-subscriber';
const LONE_ID       = 'stream-lone';
const LIST_SLUG     = 'newsletter';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: SUBSCRIBER_ID, login_email: 'stream-subscriber@example.test' });
  insertMember(db, { id: LONE_ID, login_email: 'stream-lone@example.test' });
  insertMailingListSubscription(db, {
    id: 'sub-stream', list_slug: LIST_SLUG, member_id: SUBSCRIBER_ID, status: 'subscribed',
  });
  db.close();
  createCommunicationService = (await import('../../src/services/communicationService')).createCommunicationService;
  createStubSesAdapter = (await import('../../src/adapters/sesAdapter')).createStubSesAdapter;
  readUnsubscribeToken = (await import('../../src/lib/unsubscribeToken')).readUnsubscribeToken;
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare('DELETE FROM outbox_emails').run();
  db.close();
});

function storedStream(recipientEmail: string): string {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(
    'SELECT stream FROM outbox_emails WHERE recipient_email = ?',
  ).get(recipientEmail) as { stream: string };
  db.close();
  return row.stream;
}

describe('sending stream attribution', () => {
  it('charges a list audience to the bulk stream and a lone member to the transactional one', async () => {
    const adapter = createStubSesAdapter();
    const svc = createCommunicationService(adapter);

    const bulk = svc.enqueue({
      audience: { kind: 'list', slug: LIST_SLUG },
      subject: 'Newsletter',
      bodyText: 'body',
      idempotencyKey: 'stream-bulk',
    });
    const transactional = svc.enqueue({
      audience: { kind: 'address', email: 'stream-lone@example.test', memberId: LONE_ID },
      subject: 'Reset your password',
      bodyText: 'body',
      idempotencyKey: 'stream-transactional',
    });

    expect(bulk.stream).toBe('bulk');
    expect(transactional.stream).toBe('transactional');
    expect(storedStream('stream-subscriber@example.test')).toBe('bulk');
    expect(storedStream('stream-lone@example.test')).toBe('transactional');

    await svc.processSendQueue();
    const byTo = new Map(adapter.sentMessages.map((m) => [m.to, m]));
    expect(byTo.get('stream-subscriber@example.test')?.configurationSet).toBe('footbag-test-bulk');
    expect(byTo.get('stream-lone@example.test')?.configurationSet).toBe('footbag-test-transactional');
  });

  it('puts the one-click unsubscribe headers on bulk mail and none on transactional', async () => {
    const adapter = createStubSesAdapter();
    const svc = createCommunicationService(adapter);

    svc.enqueue({
      audience: { kind: 'list', slug: LIST_SLUG },
      subject: 'Newsletter',
      bodyText: 'body',
      idempotencyKey: 'unsub-bulk',
    });
    svc.enqueue({
      audience: { kind: 'address', email: 'stream-lone@example.test', memberId: LONE_ID },
      subject: 'Reset your password',
      bodyText: 'body',
      idempotencyKey: 'unsub-transactional',
    });
    await svc.processSendQueue();

    const byTo = new Map(adapter.sentMessages.map((m) => [m.to, m]));
    const bulkHeaders = byTo.get('stream-subscriber@example.test')?.headers;
    expect(bulkHeaders?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(bulkHeaders?.['List-Unsubscribe']).toMatch(/^<http.*\/email\/unsubscribe\?t=.+>$/);

    // A password reset is not something to unsubscribe from, and offering the
    // control would invite a member to switch off their own security mail.
    expect(byTo.get('stream-lone@example.test')?.headers).toBeUndefined();
  });

  it('offers no unsubscribe control on a list members are not allowed to manage', async () => {
    const db = new BetterSqlite3(dbPath);
    insertMailingListSubscription(db, {
      id: 'sub-alerts', list_slug: 'admin-alerts', member_id: SUBSCRIBER_ID, status: 'subscribed',
    });
    db.close();

    const adapter = createStubSesAdapter();
    const svc = createCommunicationService(adapter);
    svc.enqueue({
      audience: { kind: 'list', slug: 'admin-alerts' },
      subject: 'Urgent: work queue item',
      bodyText: 'body',
      idempotencyKey: 'unsub-alerts',
    });
    await svc.processSendQueue();

    // admin-alerts is seeded is_member_manageable = 0, so the platform offers
    // no way to leave it. A header here would hand an administrator a mail
    // client button that removes them from urgent operational alerts, which is
    // a capability the interface deliberately withholds.
    expect(adapter.sentMessages).toHaveLength(1);
    expect(adapter.sentMessages[0].headers).toBeUndefined();
  });

  it('offers no unsubscribe control on a group-backed list, whose recipients are a roster', async () => {
    const db = new BetterSqlite3(dbPath);
    insertMailingList(db, {
      slug: 'board-group',
      name: 'Board group list',
      recipient_source: 'group',
      source_group_id: 'group-board',
    });
    // Enqueued directly: resolving the group audience needs the roster the
    // groups build supplies, while the header rule is decided by the list's
    // recipient source and can be settled now.
    insertOutboxEmail(db, {
      id: 'ob-group',
      recipient_email: 'stream-subscriber@example.test',
      recipient_member_id: SUBSCRIBER_ID,
      mailing_list_id: 'board-group',
      stream: 'bulk',
      subject: 'Board business',
      body_text: 'body',
      status: 'pending',
    });
    db.close();

    const adapter = createStubSesAdapter();
    const svc = createCommunicationService(adapter);

    await svc.processSendQueue();

    // Membership of the group is what put them on it, so an unsubscribe would
    // either lie or quietly remove them from a committee. The message text
    // tells them how to leave the group instead.
    //
    // The list above is member-manageable, which is the schema default and so
    // what a group list created without special care would carry. That is
    // deliberate: it makes the recipient-source check the only thing standing
    // between a group roster and a one-click unsubscribe header, which is
    // exactly the guard being tested.
    expect(adapter.sentMessages).toHaveLength(1);
    expect(adapter.sentMessages[0].headers).toBeUndefined();
  });

  it('mints the unsubscribe token for the member and list the message actually names', async () => {
    // Asserting only that a token is present would pass just as well if the
    // arguments were swapped, and in production that means one member's click
    // unsubscribing somebody else.
    const adapter = createStubSesAdapter();
    const svc = createCommunicationService(adapter);
    svc.enqueue({
      audience: { kind: 'list', slug: LIST_SLUG },
      subject: 'Newsletter',
      bodyText: 'body',
      idempotencyKey: 'unsub-identity',
    });
    await svc.processSendQueue();

    const sent = adapter.sentMessages.find((m) => m.to === 'stream-subscriber@example.test');
    const header = sent?.headers?.['List-Unsubscribe'] ?? '';
    const token = new URL(header.replace(/^<|>$/g, '')).searchParams.get('t');
    expect(token).toBeTruthy();

    const read = readUnsubscribeToken(token!);
    expect(read?.memberId).toBe(SUBSCRIBER_ID);
    expect(read?.target.slug).toBe(LIST_SLUG);
  });

  it('charges a one-member send that belongs to a list to the bulk stream', async () => {
    const svc = createCommunicationService(createStubSesAdapter());

    // The shape a subscription-governed reminder takes: one member at a time,
    // but something the member can unsubscribe from, so it is bulk. Inferring
    // the stream from recipient count would have got this wrong.
    const outcome = svc.enqueue({
      audience: {
        kind: 'address',
        email: 'stream-lone@example.test',
        memberId: LONE_ID,
        listTag: LIST_SLUG,
      },
      subject: 'Your Active Player status expires soon',
      bodyText: 'body',
      idempotencyKey: 'stream-tagged',
    });

    expect(outcome.stream).toBe('bulk');
    expect(outcome.enqueued).toBe(1);
    expect(storedStream('stream-lone@example.test')).toBe('bulk');
  });
});
