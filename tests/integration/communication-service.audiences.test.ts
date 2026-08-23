/**
 * Audience resolution on the single enqueue path. Every kind of send names an
 * audience, and the path resolves it to recipients before writing one outbox
 * row each. The branches filter differently on purpose: a broadcast audience
 * reaches only a verified, deliverable mailbox, while the single-recipient
 * kinds reach a mailbox the platform cannot yet vouch for, because that is what
 * verification mail is for. Suppression applies to all of them at insert time.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertEvent, insertRegistration } from '../fixtures/factories';

const { dbPath } = setTestEnv('4075');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createCommunicationService: typeof import('../../src/services/communicationService').createCommunicationService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createStubSesAdapter: typeof import('../../src/adapters/sesAdapter').createStubSesAdapter;

const CONFIRMED_ID = 'aud-confirmed';
const PENDING_ID   = 'aud-pending';
const BOUNCED_ID   = 'aud-bounced';
const LONE_ID      = 'aud-lone';
let eventId: string;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: CONFIRMED_ID, login_email: 'aud-confirmed@example.test' });
  insertMember(db, { id: PENDING_ID,   login_email: 'aud-pending@example.test' });
  insertMember(db, { id: BOUNCED_ID,   login_email: 'aud-bounced@example.test', email_status: 'bounced' });
  insertMember(db, { id: LONE_ID,      login_email: 'aud-lone@example.test' });
  eventId = insertEvent(db);
  insertRegistration(db, eventId, CONFIRMED_ID, { status: 'confirmed' });
  insertRegistration(db, eventId, PENDING_ID,   { status: 'pending' });
  insertRegistration(db, eventId, BOUNCED_ID,   { status: 'confirmed' });
  db.close();
  createCommunicationService = (await import('../../src/services/communicationService')).createCommunicationService;
  createStubSesAdapter = (await import('../../src/adapters/sesAdapter')).createStubSesAdapter;
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare('DELETE FROM outbox_emails').run();
  db.close();
});

function recipientsOf(): string[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db.prepare(
    'SELECT recipient_email FROM outbox_emails ORDER BY recipient_email',
  ).all() as { recipient_email: string }[];
  db.close();
  return rows.map((r) => r.recipient_email);
}

describe('fan-out sends must carry an idempotency key', () => {
  // Without a key every recipient row is written with a NULL idempotency_key,
  // and the unique index skips NULLs, so nothing dedupes and re-running the
  // send mails the whole audience a second time. The refusal is what makes a
  // broadcast safe to retry.
  it('refuses an event send with no key, and writes nothing', () => {
    const svc = createCommunicationService(createStubSesAdapter());
    expect(() => svc.enqueue({
      audience: { kind: 'event', eventId },
      subject: 'Schedule change',
      bodyText: 'body',
    })).toThrow(/idempotency key/i);
    expect(recipientsOf()).toEqual([]);
  });

  it('refuses an empty-string key, which the type permits and dedupes no better', () => {
    const svc = createCommunicationService(createStubSesAdapter());
    expect(() => svc.enqueue({
      audience: { kind: 'event', eventId },
      subject: 'Schedule change',
      bodyText: 'body',
      idempotencyKey: '',
    })).toThrow(/idempotency key/i);
    expect(recipientsOf()).toEqual([]);
  });

  it('still allows a single-recipient send to go unkeyed', () => {
    // There is no fan-out to halve, so the caller may reasonably omit it.
    const svc = createCommunicationService(createStubSesAdapter());
    const outcome = svc.enqueue({
      audience: { kind: 'address', email: 'aud-lone@example.test', memberId: LONE_ID },
      subject: 'Verify your email',
      bodyText: 'body',
    });
    expect(outcome.enqueued).toBe(1);
  });
});

describe('event-participant audience', () => {
  it('reaches confirmed participants only, and skips an undeliverable mailbox among them', () => {
    const svc = createCommunicationService(createStubSesAdapter());
    const outcome = svc.enqueue({
      audience: { kind: 'event', eventId },
      subject: 'Schedule change',
      bodyText: 'body',
      idempotencyKey: `event-mail:${eventId}`,
    });

    // The pending registrant is not a participant; the bounced mailbox is a
    // participant the send cannot reach. Neither is an error.
    expect(outcome.recipients).toBe(1);
    expect(outcome.enqueued).toBe(1);
    expect(recipientsOf()).toEqual(['aud-confirmed@example.test']);
  });

  it('is charged to the bulk stream even though it carries no mailing list', () => {
    const svc = createCommunicationService(createStubSesAdapter());
    const outcome = svc.enqueue({
      audience: { kind: 'event', eventId },
      subject: 'Schedule change',
      bodyText: 'body',
      idempotencyKey: `event-stream:${eventId}`,
    });
    expect(outcome.stream).toBe('bulk');
  });

  it('carries no unsubscribe header, because entering the event is what put the member on it', async () => {
    const adapter = createStubSesAdapter();
    const svc = createCommunicationService(adapter);
    svc.enqueue({
      audience: { kind: 'event', eventId },
      subject: 'Schedule change',
      bodyText: 'body',
      idempotencyKey: `event-headers:${eventId}`,
    });
    await svc.processSendQueue();

    // Bulk, but with no standing subscription behind it: the thing to withdraw
    // from is the event, not a mailing preference, so offering an unsubscribe
    // control here would promise something it cannot do.
    expect(adapter.sentMessages).toHaveLength(1);
    expect(adapter.sentMessages[0].headers).toBeUndefined();
  });
});

describe('member audience', () => {
  it('resolves the member current notification mailbox', () => {
    const svc = createCommunicationService(createStubSesAdapter());
    const outcome = svc.enqueue({
      audience: { kind: 'member', memberId: LONE_ID },
      subject: 'Hello',
      bodyText: 'body',
      idempotencyKey: 'member-audience',
    });
    expect(outcome.enqueued).toBe(1);
    expect(recipientsOf()).toEqual(['aud-lone@example.test']);
  });

  it('resolves to nobody for a member the platform must not notify, without failing the caller', () => {
    const db = new BetterSqlite3(dbPath);
    insertMember(db, { id: 'aud-deceased', login_email: 'aud-deceased@example.test', is_deceased: 1 });
    db.close();

    const svc = createCommunicationService(createStubSesAdapter());
    const outcome = svc.enqueue({
      audience: { kind: 'member', memberId: 'aud-deceased' },
      subject: 'Hello',
      bodyText: 'body',
    });
    // A caller enqueueing a routine notification should not have to know the
    // member died; the audience simply names nobody and the send is a no-op.
    expect(outcome.recipients).toBe(0);
    expect(outcome.enqueued).toBe(0);
    expect(recipientsOf()).toEqual([]);
  });
});

describe('idempotency across audience sizes', () => {
  it('keeps the caller key exact for one recipient and extends it per member when it fans out', () => {
    const svc = createCommunicationService(createStubSesAdapter());
    svc.enqueue({
      audience: { kind: 'member', memberId: LONE_ID },
      subject: 'Hello',
      bodyText: 'body',
      idempotencyKey: 'shared-key',
    });
    svc.enqueue({
      audience: { kind: 'event', eventId },
      subject: 'Schedule change',
      bodyText: 'body',
      idempotencyKey: 'shared-key',
    });

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const keys = db.prepare(
      'SELECT idempotency_key FROM outbox_emails ORDER BY idempotency_key',
    ).all() as { idempotency_key: string }[];
    db.close();

    // Both sends used the same caller key. The single send keeps it verbatim so
    // a retry still dedupes; the fan-out extends it per member so one
    // recipient's duplicate cannot mask another's first attempt.
    expect(keys.map((k) => k.idempotency_key)).toEqual([
      'shared-key',
      `shared-key:${CONFIRMED_ID}`,
    ]);
  });
});
