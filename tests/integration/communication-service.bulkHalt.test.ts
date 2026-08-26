/**
 * The bulk feedback halt: bulk mail stops between passes when the recent bounce
 * or complaint rate is above threshold, and transactional mail keeps going.
 *
 * This is the half of a staged send that makes the staging worth doing. Pacing
 * a run only buys time; what the time is for is noticing that the list is
 * turning out worse than expected and stopping before the rest of it goes out.
 * The rates are windowed rather than per batch, because nothing links a bounce
 * back to the message that caused it.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertOutboxEmail, insertSesEvent, insertSystemConfig } from '../fixtures/factories';
import { isoHoursAgo } from '../fixtures/clock';

const { dbPath } = setTestEnv('3093');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createCommunicationService: typeof import('../../src/services/communicationService').createCommunicationService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let evaluateBulkFeedbackHalt: typeof import('../../src/services/communicationService').evaluateBulkFeedbackHalt;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createStubSesAdapter: typeof import('../../src/adapters/sesAdapter').createStubSesAdapter;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  const commsMod = await import('../../src/services/communicationService');
  const sesMod = await import('../../src/adapters/sesAdapter');
  createCommunicationService = commsMod.createCommunicationService;
  evaluateBulkFeedbackHalt = commsMod.evaluateBulkFeedbackHalt;
  createStubSesAdapter = sesMod.createStubSesAdapter;
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare('DELETE FROM outbox_emails').run();
  db.prepare('DELETE FROM ses_events').run();
  db.close();
  // system_config is append-only, so the switch is returned to its shipped
  // default by superseding it rather than by deleting what a test wrote.
  setConfig('bulk_send_paused', '0');
});

/**
 * `count` messages already delivered inside the health window. These are the
 * denominator: the halt compares feedback against what actually went out, so
 * without them there is nothing to be a rate of.
 */
function sentInWindow(count: number): void {
  const db = new BetterSqlite3(dbPath);
  for (let i = 0; i < count; i += 1) {
    insertOutboxEmail(db, {
      status: 'sent',
      sent_at: isoHoursAgo(1),
      recipient_email: `sent-${i}@example.test`,
      subject: `sent-${i}`,
    });
  }
  db.close();
}

/** Feedback notifications inside the window, as the provider reports them. */
function feedback(type: 'bounce' | 'complaint', count: number): void {
  const db = new BetterSqlite3(dbPath);
  for (let i = 0; i < count; i += 1) {
    insertSesEvent(db, { event_type: type, created_at: isoHoursAgo(1) });
  }
  db.close();
}

function queueBulk(count: number): void {
  const db = new BetterSqlite3(dbPath);
  for (let i = 0; i < count; i += 1) {
    insertOutboxEmail(db, {
      stream: 'bulk',
      recipient_email: `bulk-${i}@example.test`,
      subject: `bulk-${String(i).padStart(3, '0')}`,
      created_at: `2025-03-01T00:${String(i).padStart(2, '0')}:00.000Z`,
    });
  }
  db.close();
}

function queueTransactional(count: number): void {
  const db = new BetterSqlite3(dbPath);
  for (let i = 0; i < count; i += 1) {
    insertOutboxEmail(db, {
      stream: 'transactional',
      recipient_email: `txn-${i}@example.test`,
      subject: `txn-${String(i).padStart(3, '0')}`,
      created_at: `2025-03-01T01:${String(i).padStart(2, '0')}:00.000Z`,
    });
  }
  db.close();
}

let configWrites = 0;
function setConfig(key: string, value: string): void {
  configWrites += 1;
  const db = new BetterSqlite3(dbPath);
  insertSystemConfig(db, {
    config_key: key,
    value_json: value,
    // system_config is append-only, so a later effective_start_at is the only
    // way one test's value supersedes another's.
    effective_start_at: new Date(Date.UTC(2025, 6, 1, 0, 0, configWrites)).toISOString(),
  });
  db.close();
}

function sentSubjects(stub: { sentMessages: readonly { subject: string }[] }): string[] {
  return stub.sentMessages.map((m) => m.subject);
}

describe('evaluateBulkFeedbackHalt', () => {
  it('does not judge the rates until enough has been sent to make them mean anything', () => {
    // One bounce against two sent messages is fifty per cent, and would stop a
    // run that has barely begun. A newly armed production is exactly here.
    sentInWindow(2);
    feedback('bounce', 1);

    const halt = evaluateBulkFeedbackHalt();

    expect(halt.halted).toBe(false);
    expect(halt.reason).toBeNull();
    expect(halt.sentInWindow).toBe(2);
    expect(halt.bouncePer10k).toBe(5000);
  });

  it('halts once the bounce rate reaches the threshold over a real sample', () => {
    sentInWindow(100);
    feedback('bounce', 5);

    const halt = evaluateBulkFeedbackHalt();

    expect(halt.halted).toBe(true);
    expect(halt.reason).toBe('bounce_rate');
    expect(halt.bouncePer10k).toBe(500);
  });

  it('does not halt just below the bounce threshold', () => {
    sentInWindow(100);
    feedback('bounce', 4);

    expect(evaluateBulkFeedbackHalt().halted).toBe(false);
  });

  it('halts on complaints at a far lower rate than bounces', () => {
    sentInWindow(400);
    feedback('complaint', 1);

    const halt = evaluateBulkFeedbackHalt();

    expect(halt.halted).toBe(true);
    expect(halt.reason).toBe('complaint_rate');
    expect(halt.complaintPer10k).toBe(25);
  });

  it('names complaints as the reason when both rates are over', () => {
    sentInWindow(100);
    feedback('bounce', 20);
    feedback('complaint', 20);

    expect(evaluateBulkFeedbackHalt().reason).toBe('complaint_rate');
  });

  it('ignores feedback and sends from outside the window', () => {
    const db = new BetterSqlite3(dbPath);
    insertOutboxEmail(db, { status: 'sent', sent_at: isoHoursAgo(200), subject: 'old' });
    insertSesEvent(db, { event_type: 'bounce', created_at: isoHoursAgo(200) });
    db.close();

    const halt = evaluateBulkFeedbackHalt();

    expect(halt.sentInWindow).toBe(0);
    expect(halt.bounceCount).toBe(0);
    expect(halt.halted).toBe(false);
  });

  it('counts a multi-recipient notification by the addresses it named', () => {
    sentInWindow(100);
    const db = new BetterSqlite3(dbPath);
    insertSesEvent(db, { event_type: 'bounce', created_at: isoHoursAgo(1), recipient_count: 5 });
    db.close();

    const halt = evaluateBulkFeedbackHalt();

    expect(halt.bounceCount).toBe(5);
    expect(halt.halted).toBe(true);
  });

  it('reads both thresholds and the sample floor from configuration', () => {
    setConfig('bulk_halt_min_sent_in_window', '10');
    setConfig('bounce_rate_alarm_threshold_per_10k', '100');
    sentInWindow(20);
    feedback('bounce', 1);

    // Five hundred per ten thousand against a threshold of one hundred, over a
    // sample the default floor would have refused to judge.
    const halt = evaluateBulkFeedbackHalt();

    expect(halt.halted).toBe(true);
    expect(halt.reason).toBe('bounce_rate');
  });
});

describe('the drain under a bulk halt', () => {
  it('withholds bulk mail and keeps sending transactional mail', async () => {
    sentInWindow(100);
    feedback('complaint', 1);
    queueBulk(5);
    queueTransactional(2);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    const result = await svc.processSendQueue();

    expect(result.bulkHalted).toBe(true);
    expect(result.sent).toBe(2);
    expect(sentSubjects(stub).every((s) => s.startsWith('txn'))).toBe(true);
  });

  it('leaves the withheld bulk rows pending rather than failing them', async () => {
    sentInWindow(100);
    feedback('complaint', 1);
    queueBulk(5);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    await svc.processSendQueue();

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM outbox_emails WHERE stream = 'bulk' AND status = 'pending'")
      .get() as { n: number };
    db.close();
    expect(row.n).toBe(5);
  });

  it('resumes bulk sending once the feedback falls back inside the window', async () => {
    sentInWindow(100);
    feedback('complaint', 1);
    queueBulk(3);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    const halted = await svc.processSendQueue();
    expect(halted.bulkHalted).toBe(true);

    // The window rolls; the complaint ages out and nothing new arrives.
    const db = new BetterSqlite3(dbPath);
    db.prepare('DELETE FROM ses_events').run();
    db.close();

    const resumed = await svc.processSendQueue();
    expect(resumed.bulkHalted).toBe(false);
    expect(resumed.sent).toBe(3);
  });

  it('stops the bulk stream on the operator switch, with transactional mail unaffected', async () => {
    setConfig('bulk_send_paused', '1');
    queueBulk(4);
    queueTransactional(2);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    const result = await svc.processSendQueue();

    expect(result.bulkPaused).toBe(true);
    expect(result.sent).toBe(2);
    expect(sentSubjects(stub).every((s) => s.startsWith('txn'))).toBe(true);
  });

  it('keeps the operator switch distinct from the feedback halt', async () => {
    // Clean feedback, so nothing the platform judges would stop the stream:
    // whatever stopped it here was a person.
    sentInWindow(100);
    setConfig('bulk_send_paused', '1');
    queueBulk(3);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    const result = await svc.processSendQueue();

    expect(result.bulkPaused).toBe(true);
    expect(result.bulkHalted).toBe(false);
  });

  it('releases the held bulk mail when the operator switch is cleared', async () => {
    setConfig('bulk_send_paused', '1');
    queueBulk(3);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    const stopped = await svc.processSendQueue();
    expect(stopped.sent).toBe(0);

    setConfig('bulk_send_paused', '0');
    const released = await svc.processSendQueue();

    expect(released.bulkPaused).toBe(false);
    expect(released.sent).toBe(3);
  });

  it('reports no halt when the feedback is clean', async () => {
    sentInWindow(100);
    queueBulk(3);
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);

    const result = await svc.processSendQueue();

    expect(result.bulkHalted).toBe(false);
    expect(result.sent).toBe(3);
  });
});
