/**
 * How one drain pass is filled: the pass limit, the order within a stream, and
 * the priority between the two streams.
 *
 * Transactional and bulk mail share one queue but carry opposite risk. A
 * transactional message answers something the member just did, and a password
 * reset that arrives late locks them out for as long as it takes; a bulk run is
 * hundreds of rows that nobody is waiting on. The drain sends one row at a time,
 * so a single created_at ordering would let one bulk run sit in front of every
 * transactional message enqueued after it and delay each one by the length of
 * the run. These tests pin the two properties that stop that: transactional rows
 * fill a pass first, and bulk takes only what is left, itself capped.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertOutboxEmail, insertSystemConfig } from '../fixtures/factories';

const { dbPath } = setTestEnv('3092');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createCommunicationService: typeof import('../../src/services/communicationService').createCommunicationService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createStubSesAdapter: typeof import('../../src/adapters/sesAdapter').createStubSesAdapter;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  const commsMod = await import('../../src/services/communicationService');
  const sesMod = await import('../../src/adapters/sesAdapter');
  createCommunicationService = commsMod.createCommunicationService;
  createStubSesAdapter = sesMod.createStubSesAdapter;
});

afterAll(() => cleanupTestDb(dbPath));

// system_config is append-only: a value written by one test cannot be deleted,
// only superseded by a row with a later effective_start_at. Every write in this
// suite therefore takes the next timestamp from this counter, and each test
// starts by superseding both pacing keys back to their shipped defaults, so a
// test that overrides one cannot leak into the next.
const PASS_LIMIT_DEFAULT = '10';
const BULK_LIMIT_DEFAULT = '5';
let configWrites = 0;

function nextEffectiveAt(): string {
  configWrites += 1;
  return new Date(Date.UTC(2025, 5, 1, 0, 0, configWrites)).toISOString();
}

beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare('DELETE FROM outbox_emails').run();
  db.close();
  setConfig('outbox_batch_limit', PASS_LIMIT_DEFAULT);
  setConfig('outbox_bulk_batch_limit', BULK_LIMIT_DEFAULT);
});

/**
 * Queues `count` rows on one stream, oldest first, with a distinct created_at
 * per row so the drain's ordering is observable rather than a tie. The subject
 * carries the position, which is what the assertions read back off the stub.
 */
function queue(stream: 'transactional' | 'bulk', count: number, startMinute = 0): void {
  const db = new BetterSqlite3(dbPath);
  for (let i = 0; i < count; i += 1) {
    const minute = String(startMinute + i).padStart(2, '0');
    insertOutboxEmail(db, {
      stream,
      subject: `${stream}-${String(i).padStart(3, '0')}`,
      recipient_email: `${stream}-${i}@example.test`,
      created_at: `2025-03-01T00:${minute}:00.000Z`,
    });
  }
  db.close();
}

function setConfig(key: string, value: string): void {
  const db = new BetterSqlite3(dbPath);
  insertSystemConfig(db, {
    config_key: key,
    value_json: value,
    effective_start_at: nextEffectiveAt(),
  });
  db.close();
}

function pendingCount(): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM outbox_emails WHERE status = 'pending'")
    .get() as { n: number };
  db.close();
  return row.n;
}

/** The subjects the stub was handed, in the order the drain sent them. */
function sentSubjects(stub: { sentMessages: readonly { subject: string }[] }): string[] {
  return stub.sentMessages.map((m) => m.subject);
}

describe('drain pass: size and order', () => {
  it('sends one pass worth and leaves the remainder pending for the next pass', async () => {
    queue('transactional', 11);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    const first = await svc.processSendQueue();
    expect(first.sent).toBe(10);
    expect(pendingCount()).toBe(1);

    const second = await svc.processSendQueue();
    expect(second.sent).toBe(1);
    expect(pendingCount()).toBe(0);
  });

  it('sends the oldest queued message first within a stream', async () => {
    queue('transactional', 3);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    await svc.processSendQueue();

    expect(sentSubjects(stub)).toEqual([
      'transactional-000',
      'transactional-001',
      'transactional-002',
    ]);
  });

  it('reads the pass limit from configuration rather than a fixed number', async () => {
    setConfig('outbox_batch_limit', '3');
    queue('transactional', 5);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    const result = await svc.processSendQueue();

    expect(result.sent).toBe(3);
    expect(pendingCount()).toBe(2);
  });
});

describe('drain pass: priority between the streams', () => {
  it('sends a transactional message queued behind a large bulk run in the very next pass', async () => {
    // The shape that matters: a bulk run is already queued, and a member then
    // asks for a password reset. Under a single created_at ordering their
    // message would be row 51 and wait for fifty sends; here it goes first.
    queue('bulk', 50);
    queue('transactional', 1, 100);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    await svc.processSendQueue();

    expect(sentSubjects(stub)[0]).toBe('transactional-000');
  });

  it('caps how much of one pass bulk mail may take', async () => {
    queue('bulk', 20);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    const result = await svc.processSendQueue();

    // Five, not the pass limit of ten: the rest of the pass stays free for
    // transactional mail that may be enqueued while the run drains.
    expect(result.sent).toBe(5);
    expect(pendingCount()).toBe(15);
  });

  it('gives bulk only the slots transactional leaves unused', async () => {
    queue('transactional', 8);
    queue('bulk', 10, 100);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    const result = await svc.processSendQueue();

    expect(result.sent).toBe(10);
    const subjects = sentSubjects(stub);
    expect(subjects.filter((s) => s.startsWith('transactional')).length).toBe(8);
    expect(subjects.filter((s) => s.startsWith('bulk')).length).toBe(2);
  });

  it('gives bulk nothing when transactional mail fills the pass', async () => {
    queue('transactional', 12);
    queue('bulk', 5, 100);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    const result = await svc.processSendQueue();

    expect(result.sent).toBe(10);
    expect(sentSubjects(stub).every((s) => s.startsWith('transactional'))).toBe(true);
  });

  it('takes the pass size from the argument when one is given', async () => {
    queue('transactional', 6);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    const result = await svc.processSendQueue({ limit: 2 });

    expect(result.sent).toBe(2);
    expect(pendingCount()).toBe(4);
  });

  it('takes the bulk cap from the argument when one is given', async () => {
    queue('bulk', 6);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    const result = await svc.processSendQueue({ bulkLimit: 1 });

    expect(result.sent).toBe(1);
  });

  it('treats a negative pass size as nothing rather than as everything', async () => {
    // The arguments bypass the configuration reader's positive-only guard, and
    // SQLite reads a negative LIMIT as unlimited, so an unfloored negative
    // would drain the whole queue in a single pass.
    queue('transactional', 5);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    const result = await svc.processSendQueue({ limit: -1 });

    expect(result.sent).toBe(0);
    expect(pendingCount()).toBe(5);
  });

  it('reads the bulk cap from configuration', async () => {
    setConfig('outbox_bulk_batch_limit', '2');
    queue('bulk', 10);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    const result = await svc.processSendQueue();

    expect(result.sent).toBe(2);
  });

  it('drains a bulk backlog across passes without ever blocking transactional mail', async () => {
    queue('bulk', 12);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    await svc.processSendQueue();
    queue('transactional', 1, 200);
    await svc.processSendQueue();

    // Pass one: five bulk. Pass two: the transactional row first, then bulk
    // fills the rest of that pass.
    expect(sentSubjects(stub)[5]).toBe('transactional-000');
    expect(pendingCount()).toBe(2);
  });
});
