/**
 * Integration tests for OperationsPlatformService.runEmailWorker — the
 * delegation surface the worker.ts polling loop calls.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { AccountSendingPausedException, MessageRejected } from '@aws-sdk/client-ses';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertSystemConfig } from '../fixtures/factories';
import { expectLoggedError } from '../setup-env';

const { dbPath } = setTestEnv('3067');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let operationsPlatformService: typeof import('../../src/services/operationsPlatformService').operationsPlatformService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let getStubSesAdapterForTests: typeof import('../../src/adapters/sesAdapter').getStubSesAdapterForTests;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let resetCommunicationServiceForTests: typeof import('../../src/services/communicationService').resetCommunicationServiceForTests;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let resetSesAdapterForTests: typeof import('../../src/adapters/sesAdapter').resetSesAdapterForTests;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let getCommunicationService: typeof import('../../src/services/communicationService').getCommunicationService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let logger: typeof import('../../src/config/logger').logger;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Seed members referenced by outbox recipient_member_id in the logging tests.
  // The FK outbox_emails.recipient_member_id → members.id requires real rows.
  insertMember(db, { id: 'member-log-sent',  slug: 'log_sent_user',  login_email: 'log-sent@example.com'  });
  insertMember(db, { id: 'member-log-retry', slug: 'log_retry_user', login_email: 'log-retry@example.com' });
  insertMember(db, { id: 'member-log-dead',  slug: 'log_dead_user',  login_email: 'log-dead@example.com'  });
  db.close();
  const opsMod = await import('../../src/services/operationsPlatformService');
  operationsPlatformService = opsMod.operationsPlatformService;
  const commsMod = await import('../../src/services/communicationService');
  const sesMod = await import('../../src/adapters/sesAdapter');
  getStubSesAdapterForTests = sesMod.getStubSesAdapterForTests;
  resetSesAdapterForTests = sesMod.resetSesAdapterForTests;
  resetCommunicationServiceForTests = commsMod.resetCommunicationServiceForTests;
  getCommunicationService = commsMod.getCommunicationService;
  const logMod = await import('../../src/config/logger');
  logger = logMod.logger;
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare('DELETE FROM outbox_emails').run();
  db.close();
  resetCommunicationServiceForTests();
  resetSesAdapterForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** One transactional message to one member: an audience of one, in the shape these drain tests need. */
function enqueueOne(
  comms: { enqueue: (i: never) => unknown },
  input: { recipientEmail: string; recipientMemberId: string; subject: string; bodyText: string },
) {
  return comms.enqueue({
    audience: { kind: 'address', email: input.recipientEmail, memberId: input.recipientMemberId },
    subject: input.subject,
    bodyText: input.bodyText,
  } as never);
}

describe('OperationsPlatformService.runEmailWorker', () => {
  it('drains pending rows via the stub SES adapter', async () => {
    const comms = getCommunicationService();
    enqueueOne(comms, {
      recipientEmail: 'worker-test@example.com',
      recipientMemberId: 'member-log-sent',
      subject: 'Hello',
      bodyText: 'body',
    });

    const result = await operationsPlatformService.runEmailWorker();
    expect(result.paused).toBe(false);
    expect(result.sent).toBe(1);

    const stub = getStubSesAdapterForTests();
    expect(stub).not.toBeNull();
    expect(stub!.sentMessages).toHaveLength(1);
    expect(stub!.sentMessages[0].to).toBe('worker-test@example.com');
  });

  it('reports paused when email_outbox_paused=1 (no rows claimed)', async () => {
    const comms = getCommunicationService();
    enqueueOne(comms, {
      recipientEmail: 'paused@example.com',
      recipientMemberId: 'member-log-sent',
      subject: 'Hi',
      bodyText: 'x',
    });

    const db = new BetterSqlite3(dbPath);
    insertSystemConfig(db, {
      config_key: 'email_outbox_paused',
      value_json: '1',
      created_at: '2026-04-17T00:00:00.000Z',
      reason_text: 'Test pause',
    });
    db.close();

    const result = await operationsPlatformService.runEmailWorker();
    expect(result.paused).toBe(true);
    expect(result.claimed).toBe(0);

    // Restore default for subsequent tests in this file.
    const db2 = new BetterSqlite3(dbPath);
    insertSystemConfig(db2, {
      config_key: 'email_outbox_paused',
      value_json: '0',
      created_at: '2026-04-17T00:00:01.000Z',
      reason_text: 'Test unpause',
    });
    db2.close();
  });

  it('getOutboxPollIntervalMs respects seed and clamps to >=1 second', () => {
    const ms = operationsPlatformService.getOutboxPollIntervalMs();
    expect(ms).toBeGreaterThanOrEqual(1000);
    // seed-outbox-poll-interval-seconds = 30 → 30_000
    expect(ms).toBe(30 * 1000);
  });

  // Outbox worker per-email observability.
  // PII allowlist for log output: outboxId, memberId, deliveryResult,
  // attemptCount, errorClass. Forbidden: recipientEmail, bodyText, subject,
  // raw err.message.
  //
  // These assertions close the exact gap that made the first staging
  // registration impossible to diagnose without hand-reading the database.

  const ALLOWED_META_KEYS_SUCCESS = new Set(['outboxId', 'memberId', 'deliveryResult']);
  // The retrying line additionally carries its computed backoff delay; the
  // dead-letter line has no next attempt to describe.
  const ALLOWED_META_KEYS_RETRYING = new Set(['outboxId', 'memberId', 'deliveryResult', 'attemptCount', 'errorClass', 'retryDelaySeconds']);
  const ALLOWED_META_KEYS_FAILURE = new Set(['outboxId', 'memberId', 'deliveryResult', 'attemptCount', 'errorClass']);

  it('logs outbox sent with allowlisted metadata on success', async () => {
    const infoSpy = vi.spyOn(logger, 'info');
    const comms = getCommunicationService();
    enqueueOne(comms, {
      recipientEmail: 'log-sent@example.com',
      recipientMemberId: 'member-log-sent',
      subject: 'Hi',
      bodyText: 'x',
    });

    await operationsPlatformService.runEmailWorker();

    const sentCalls = infoSpy.mock.calls.filter(([msg]) => msg === 'outbox sent');
    expect(sentCalls).toHaveLength(1);
    const [, meta] = sentCalls[0];
    expect(meta).toBeDefined();
    const m = meta as Record<string, unknown>;
    expect(m.memberId).toBe('member-log-sent');
    expect(typeof m.outboxId).toBe('string');
    expect(m.deliveryResult).toBe('sent');
    // PII allowlist: no extra keys permitted (esp. recipientEmail, bodyText).
    expect(new Set(Object.keys(m))).toEqual(ALLOWED_META_KEYS_SUCCESS);
  });

  it('logs outbox retrying with allowlisted metadata and errorClass on transient SES failure', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');
    const comms = getCommunicationService();
    enqueueOne(comms, {
      recipientEmail: 'log-retry@example.com',
      recipientMemberId: 'member-log-retry',
      subject: 'Hi',
      bodyText: 'x',
    });

    class TransientSendError extends Error {}
    const stub = getStubSesAdapterForTests();
    expect(stub).not.toBeNull();
    stub!.failNext(new TransientSendError('downstream flap'));

    await operationsPlatformService.runEmailWorker();

    const retryCalls = warnSpy.mock.calls.filter(([msg]) => msg === 'outbox retrying');
    expect(retryCalls).toHaveLength(1);
    const [, meta] = retryCalls[0];
    const m = meta as Record<string, unknown>;
    expect(m.memberId).toBe('member-log-retry');
    expect(typeof m.outboxId).toBe('string');
    expect(m.deliveryResult).toBe('retrying');
    expect(m.attemptCount).toBe(1);
    expect(m.errorClass).toBe('TransientSendError');
    expect(new Set(Object.keys(m))).toEqual(ALLOWED_META_KEYS_RETRYING);
  });

  it('logs outbox dead-letter with allowlisted metadata when retries exhausted', async () => {
    // Force max-retries=1 so the first failure trips dead-letter.
    const db = new BetterSqlite3(dbPath);
    insertSystemConfig(db, {
      config_key: 'outbox_max_retry_attempts',
      value_json: '1',
      created_at: '2026-04-20T00:00:00.000Z',
      reason_text: 'Force dead-letter',
    });
    db.close();

    const errorSpy = vi.spyOn(logger, 'error');
    const comms = getCommunicationService();
    enqueueOne(comms, {
      recipientEmail: 'log-dead@example.com',
      recipientMemberId: 'member-log-dead',
      subject: 'Hi',
      bodyText: 'x',
    });

    class PermanentSendError extends Error {}
    const stub = getStubSesAdapterForTests();
    stub!.failNext(new PermanentSendError('address rejected'));

    await operationsPlatformService.runEmailWorker();

    // Restore default max-retries via a later-effective config row.
    const db2 = new BetterSqlite3(dbPath);
    insertSystemConfig(db2, {
      config_key: 'outbox_max_retry_attempts',
      value_json: '5',
      created_at: '2026-04-20T00:00:01.000Z',
      reason_text: 'Restore default',
    });
    db2.close();

    const deadCalls = errorSpy.mock.calls.filter(([msg]) => msg === 'outbox dead-letter');
    expect(deadCalls).toHaveLength(1);
    const [, meta] = deadCalls[0];
    const m = meta as Record<string, unknown>;
    expect(m.memberId).toBe('member-log-dead');
    expect(typeof m.outboxId).toBe('string');
    expect(m.deliveryResult).toBe('dead_letter');
    expect(m.attemptCount).toBe(1);
    expect(m.errorClass).toBe('PermanentSendError');
    expect(new Set(Object.keys(m))).toEqual(ALLOWED_META_KEYS_FAILURE);
  });
});

describe('outbox drain: provider refusals and retry spacing', () => {
  function outboxRow(recipientEmail: string): { status: string; retry_count: number } {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      return db
        .prepare('SELECT status, retry_count FROM outbox_emails WHERE recipient_email = ?')
        .get(recipientEmail) as { status: string; retry_count: number };
    } finally {
      db.close();
    }
  }

  it('dead-letters a message SES refuses outright on the first refusal, with attempts left', async () => {
    // Defect caught: a message SES has refused (a malformed or unverified
    // recipient) is resent four more times, each refused the same way.
    expectLoggedError('outbox dead-letter');
    const errorSpy = vi.spyOn(logger, 'error');
    enqueueOne(getCommunicationService(), {
      recipientEmail: 'refused@example.com',
      recipientMemberId: 'member-log-dead',
      subject: 'Hi',
      bodyText: 'x',
    });
    getStubSesAdapterForTests()!.failNext(
      new MessageRejected({ message: 'Email address is not verified.', $metadata: {} }),
    );

    const result = await operationsPlatformService.runEmailWorker();

    expect(result.deadLettered).toBe(1);
    expect(outboxRow('refused@example.com').status).toBe('dead_letter');
    const deadCalls = errorSpy.mock.calls.filter(([msg]) => msg === 'outbox dead-letter');
    expect(deadCalls).toHaveLength(1);
    const m = deadCalls[0][1] as Record<string, unknown>;
    expect(m.attemptCount).toBe(1);
    expect(m.errorClass).toBe('MessageRejected');
  });

  it('keeps retrying when SES has paused the account, which is no verdict on the message', async () => {
    // Defect caught: a paused account dead-letters every queued email at once,
    // password resets included, instead of waiting out the pause.
    enqueueOne(getCommunicationService(), {
      recipientEmail: 'paused-account@example.com',
      recipientMemberId: 'member-log-retry',
      subject: 'Hi',
      bodyText: 'x',
    });
    getStubSesAdapterForTests()!.failNext(
      new AccountSendingPausedException({ message: 'Account sending paused.', $metadata: {} }),
    );

    await operationsPlatformService.runEmailWorker();

    expect(outboxRow('paused-account@example.com')).toEqual({ status: 'pending', retry_count: 1 });
  });

  it('spreads the first retry between half and all of the base delay', async () => {
    // Defect caught: rows that failed together retry in one burst (no jitter),
    // or jitter shortens a delay below half its step and spends the attempt
    // budget in minutes.
    const seen: number[] = [];
    for (const [i, draw] of [0, 0.999999].entries()) {
      resetSesAdapterForTests();
      resetCommunicationServiceForTests();
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(draw);
      const warnSpy = vi.spyOn(logger, 'warn');
      enqueueOne(getCommunicationService(), {
        recipientEmail: `jitter-${i}@example.com`,
        recipientMemberId: 'member-log-retry',
        subject: 'Hi',
        bodyText: 'x',
      });
      getStubSesAdapterForTests()!.failNext(new Error('downstream flap'));
      await operationsPlatformService.runEmailWorker();
      const retry = warnSpy.mock.calls.find(([msg]) => msg === 'outbox retrying');
      seen.push((retry![1] as { retryDelaySeconds: number }).retryDelaySeconds);
      randomSpy.mockRestore();
      warnSpy.mockRestore();
    }
    // The seeded base delay is 60 seconds.
    expect(seen).toEqual([30, 60]);
  });

  it('jitters within the one-hour ceiling, not beyond it', async () => {
    // Defect caught: an email is held back for hours once the exponential
    // step outgrows the one-hour cap, because the cap is dropped or applied
    // after the random part instead of before it.
    const db = new BetterSqlite3(dbPath);
    insertSystemConfig(db, {
      config_key: 'outbox_retry_base_seconds',
      value_json: '7200',
      created_at: '2026-04-21T00:00:00.000Z',
      reason_text: 'Base delay above the cap',
    });
    db.close();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const warnSpy = vi.spyOn(logger, 'warn');
    enqueueOne(getCommunicationService(), {
      recipientEmail: 'jitter-cap@example.com',
      recipientMemberId: 'member-log-retry',
      subject: 'Hi',
      bodyText: 'x',
    });
    getStubSesAdapterForTests()!.failNext(new Error('downstream flap'));

    try {
      await operationsPlatformService.runEmailWorker();
    } finally {
      const restore = new BetterSqlite3(dbPath);
      insertSystemConfig(restore, {
        config_key: 'outbox_retry_base_seconds',
        value_json: '60',
        created_at: '2026-04-21T00:00:01.000Z',
        reason_text: 'Restore default',
      });
      restore.close();
    }

    const retry = warnSpy.mock.calls.find(([msg]) => msg === 'outbox retrying');
    // Half the 3600-second cap is the floor of the jittered range.
    expect((retry![1] as { retryDelaySeconds: number }).retryDelaySeconds).toBe(1800);
  });
});
