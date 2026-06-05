/**
 * Integration tests for CommunicationService: outbox enqueue, drain, retry,
 * dead-letter, and admin pause.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { expectLoggedError } from '../setup-env';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3066');

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

/** Clear outbox_emails between tests so state doesn't leak. */
beforeEach(() => {
  const db = new BetterSqlite3(dbPath);
  db.prepare('DELETE FROM outbox_emails').run();
  db.close();
});

function readRow(id: string): Record<string, unknown> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM outbox_emails WHERE id = ?').get(id) as Record<string, unknown>;
  db.close();
  return row;
}

describe('enqueueEmail', () => {
  it('inserts a pending row', () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const { id, status } = svc.enqueueEmail({
      recipientEmail: 'to@example.com',
      subject: 'Hi',
      bodyText: 'hello',
    });
    expect(status).toBe('enqueued');
    const row = readRow(id);
    expect(row.status).toBe('pending');
    expect(row.recipient_email).toBe('to@example.com');
    expect(row.retry_count).toBe(0);
  });

  it('rejects duplicate idempotency_key as "duplicate"', () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const first = svc.enqueueEmail({
      recipientEmail: 'to@example.com', subject: 'A', bodyText: 'x',
      idempotencyKey: 'idem-1',
    });
    const second = svc.enqueueEmail({
      recipientEmail: 'to@example.com', subject: 'A', bodyText: 'x',
      idempotencyKey: 'idem-1',
    });
    expect(first.status).toBe('enqueued');
    expect(second.status).toBe('duplicate');
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const count = db.prepare('SELECT COUNT(*) AS n FROM outbox_emails WHERE idempotency_key=?')
      .get('idem-1') as { n: number };
    db.close();
    expect(count.n).toBe(1);
  });

  it('returns the original row id on idempotency-key retry', () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const first = svc.enqueueEmail({
      recipientEmail: 'to@example.com', subject: 'A', bodyText: 'x',
      idempotencyKey: 'idem-retry',
    });
    const second = svc.enqueueEmail({
      recipientEmail: 'to@example.com', subject: 'A', bodyText: 'x',
      idempotencyKey: 'idem-retry',
    });
    const third = svc.enqueueEmail({
      recipientEmail: 'to@example.com', subject: 'A', bodyText: 'x',
      idempotencyKey: 'idem-retry',
    });
    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
  });

  it('returns the original row id even when retry payload differs', () => {
    // Idempotency takes precedence over payload equality: once a key is
    // claimed, any later enqueue with that key returns the same id.
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const first = svc.enqueueEmail({
      recipientEmail: 'original@example.com', subject: 'Original', bodyText: 'first body',
      idempotencyKey: 'idem-diff',
    });
    const retry = svc.enqueueEmail({
      recipientEmail: 'different@example.com', subject: 'Different', bodyText: 'other body',
      idempotencyKey: 'idem-diff',
    });
    expect(retry.status).toBe('duplicate');
    expect(retry.id).toBe(first.id);
    const row = readRow(first.id);
    expect(row.recipient_email).toBe('original@example.com');
    expect(row.subject).toBe('Original');
  });

  it('different idempotency keys produce different ids', () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const a = svc.enqueueEmail({
      recipientEmail: 'to@example.com', subject: 'A', bodyText: 'x',
      idempotencyKey: 'idem-A',
    });
    const b = svc.enqueueEmail({
      recipientEmail: 'to@example.com', subject: 'B', bodyText: 'y',
      idempotencyKey: 'idem-B',
    });
    expect(a.status).toBe('enqueued');
    expect(b.status).toBe('enqueued');
    expect(a.id).not.toBe(b.id);
  });

  it('absent idempotency key allows multiple distinct rows', () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const a = svc.enqueueEmail({
      recipientEmail: 'to@example.com', subject: 'Hi', bodyText: 'x',
    });
    const b = svc.enqueueEmail({
      recipientEmail: 'to@example.com', subject: 'Hi', bodyText: 'x',
    });
    expect(a.status).toBe('enqueued');
    expect(b.status).toBe('enqueued');
    expect(a.id).not.toBe(b.id);
  });

  it('requires recipientEmail, subject, bodyText', () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    expect(() => svc.enqueueEmail({ recipientEmail: '', subject: 's', bodyText: 'b' })).toThrow();
    expect(() => svc.enqueueEmail({ recipientEmail: 'a@b.c', subject: '', bodyText: 'b' })).toThrow();
    expect(() => svc.enqueueEmail({ recipientEmail: 'a@b.c', subject: 's', bodyText: '' })).toThrow();
  });
});

describe('enqueueEmailOrFail', () => {
  it('delegates to enqueueEmail and returns the same EnqueueResult shape on success', async () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const result = svc.enqueueEmailOrFail({
      recipientEmail: 'must-succeed@example.com',
      subject: 'Hi',
      bodyText: 'hello',
    });
    expect(result.status).toBe('enqueued');
    expect(typeof result.id).toBe('string');
    const row = readRow(result.id);
    expect(row.status).toBe('pending');
  });

  it('re-throws ValidationError unchanged (preserves the 422 controller mapping)', async () => {
    const { ValidationError } = await import('../../src/services/serviceErrors');
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    expect(() => svc.enqueueEmailOrFail({
      recipientEmail: '',
      subject: 'Hi',
      bodyText: 'hello',
    })).toThrow(ValidationError);
  });

  it('wraps non-ServiceError throws as ServiceUnavailableError', async () => {
    expectLoggedError('enqueueEmailOrFail: outbox enqueue failed');
    const { ServiceUnavailableError } = await import('../../src/services/serviceErrors');
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    // Monkey-patch the underlying enqueue path so the helper's wrapping
    // branch is exercised. This stands in for a transport-layer surprise
    // (SQLite busy, schema mismatch, OOM) that the operational code path
    // would otherwise surface to the caller as a bare Error.
    svc.enqueueEmail = () => {
      throw new Error('synthetic outbox-insert failure');
    };
    expect(() => svc.enqueueEmailOrFail({
      recipientEmail: 'wrapped@example.com',
      subject: 'Hi',
      bodyText: 'hello',
    })).toThrow(ServiceUnavailableError);
  });
});

describe('processSendQueue', () => {
  it('drains pending → sent via adapter', async () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const { id } = svc.enqueueEmail({
      recipientEmail: 'a@example.com', subject: 'Hi', bodyText: 'b',
    });
    const res = await svc.processSendQueue();
    expect(res.sent).toBe(1);
    expect(res.claimed).toBe(1);
    expect(stub.sentMessages).toHaveLength(1);
    expect(stub.sentMessages[0].to).toBe('a@example.com');
    const row = readRow(id);
    expect(row.status).toBe('sent');
    expect(row.sent_at).not.toBeNull();
  });

  it('scrubs body_text to NULL after successful send (no token persistence in DB backups)', async () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const { id } = svc.enqueueEmail({
      recipientEmail: 'scrub@example.com',
      subject: 'Reset link',
      bodyText: 'Visit https://example.com/password/reset/raw-token-abc-123 to continue.',
    });
    // Pre-send: body_text intact for the worker to read.
    expect(readRow(id).body_text).toContain('raw-token-abc-123');
    await svc.processSendQueue();
    const row = readRow(id);
    expect(row.status).toBe('sent');
    expect(row.body_text).toBeNull();
    // Subject is preserved (no token in subject by design).
    expect(row.subject).toBe('Reset link');
  });

  it('reaps a crash-stranded sending row back to pending and delivers it on the same pass', async () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const { id } = svc.enqueueEmail({
      recipientEmail: 'stranded@example.com', subject: 'Hi', bodyText: 'b',
    });
    // Simulate a worker killed between markSending and markSent: the row sits
    // in 'sending' with a stale last_attempt_at, invisible to the pending batch.
    const db = new BetterSqlite3(dbPath);
    db.prepare(`
      UPDATE outbox_emails
      SET status = 'sending', last_attempt_at = '2020-01-01T00:00:00.000Z'
      WHERE id = ?
    `).run(id);
    db.close();

    const res = await svc.processSendQueue();
    expect(res.sent).toBe(1);
    const row = readRow(id);
    expect(row.status).toBe('sent');
    // The reap counts as a retry so a repeatedly-stranded row is visible.
    expect(row.retry_count).toBe(1);
  });

  it('does not reap a sending row inside its lease (an in-flight attempt keeps its claim)', async () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const { id } = svc.enqueueEmail({
      recipientEmail: 'inflight@example.com', subject: 'Hi', bodyText: 'b',
    });
    const db = new BetterSqlite3(dbPath);
    db.prepare(`
      UPDATE outbox_emails
      SET status = 'sending', last_attempt_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id);
    db.close();

    const res = await svc.processSendQueue();
    expect(res.sent).toBe(0);
    expect(readRow(id).status).toBe('sending');
  });

  it('transient failure stays pending, increments retry_count, records last_error', async () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const { id } = svc.enqueueEmail({
      recipientEmail: 'a@example.com', subject: 'Hi', bodyText: 'b',
    });
    stub.failNext(new Error('boom'));
    const res = await svc.processSendQueue();
    expect(res.failed).toBe(1);
    const row = readRow(id);
    expect(row.status).toBe('pending');
    expect(row.retry_count).toBe(1);
    expect(row.last_error).toBe('boom');
  });

  it('moves to dead_letter on last allowed retry', async () => {
    expectLoggedError('outbox dead-letter');
    // outbox_max_retry_attempts default is 5; fail 5 times in a row.
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const { id } = svc.enqueueEmail({
      recipientEmail: 'a@example.com', subject: 'Hi', bodyText: 'b',
    });
    for (let i = 0; i < 5; i++) {
      stub.failNext(new Error(`attempt-${i + 1}`));
      // eslint-disable-next-line no-await-in-loop
      await svc.processSendQueue();
    }
    const row = readRow(id);
    expect(row.status).toBe('dead_letter');
    expect(row.retry_count).toBe(5);
  });

  it('respects admin pause (email_outbox_paused=1)', async () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const { id } = svc.enqueueEmail({
      recipientEmail: 'a@example.com', subject: 'Hi', bodyText: 'b',
    });
    // Insert a later-effective system_config row setting paused=1.
    const db = new BetterSqlite3(dbPath);
    db.prepare(`
      INSERT INTO system_config
        (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
      VALUES (?, ?, 'email_outbox_paused', '1', ?, 'Test pause', NULL)
    `).run(
      'test-pause-row',
      '2026-04-17T00:00:00.000Z',
      '2026-04-17T00:00:00.000Z',
    );
    db.close();
    const res = await svc.processSendQueue();
    expect(res.paused).toBe(true);
    expect(res.sent).toBe(0);
    const row = readRow(id);
    expect(row.status).toBe('pending');
    // Undo pause so other tests are unaffected.
    const db2 = new BetterSqlite3(dbPath);
    db2.prepare(`
      INSERT INTO system_config
        (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
      VALUES (?, ?, 'email_outbox_paused', '0', ?, 'Test unpause', NULL)
    `).run(
      'test-unpause-row',
      '2026-04-17T00:00:01.000Z',
      '2026-04-17T00:00:01.000Z',
    );
    db2.close();
  });

  it('respects scheduled_for (future rows not claimed)', async () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { id } = svc.enqueueEmail({
      recipientEmail: 'a@example.com', subject: 'Hi', bodyText: 'b',
      scheduledFor: future,
    });
    const res = await svc.processSendQueue();
    expect(res.claimed).toBe(0);
    const row = readRow(id);
    expect(row.status).toBe('pending');
  });
});

describe('enqueueMailingListEmail', () => {
  /** Insert a test member + an admin-alerts subscription with the given status. */
  function seedSubscriber(opts: {
    memberId: string;
    emailVerifiedAt?: string | null;
    subStatus: 'subscribed' | 'unsubscribed' | 'bounced' | 'complained' | 'suppressed';
    deletedAt?: string | null;
  }): void {
    const db = new BetterSqlite3(dbPath);
    const memberOverrides: Parameters<typeof insertMember>[1] = {
      id:          opts.memberId,
      slug:        `slug_${opts.memberId}`,
      login_email: `${opts.memberId}@example.com`,
      deleted_at:  opts.deletedAt ?? null,
    };
    if (opts.emailVerifiedAt !== undefined) {
      memberOverrides.email_verified_at = opts.emailVerifiedAt;
    }
    insertMember(db, memberOverrides);
    db.prepare(`
      INSERT INTO mailing_list_subscriptions (
        id, created_at, created_by, updated_at, updated_by, version,
        mailing_list_id, member_id, status, status_updated_at
      ) VALUES (?, ?, 'system', ?, 'system', 1, 'admin-alerts', ?, ?, ?)
    `).run(
      `mls-${opts.memberId}`,
      '2025-01-01T00:00:00.000Z',
      '2025-01-01T00:00:00.000Z',
      opts.memberId,
      opts.subStatus,
      '2025-01-01T00:00:00.000Z',
    );
    db.close();
  }

  /** Clean test members + subscriptions inside this describe so the outer
   * beforeEach (which clears outbox_emails) plus this one give per-test isolation. */
  beforeEach(() => {
    const db = new BetterSqlite3(dbPath);
    db.prepare('DELETE FROM mailing_list_subscriptions').run();
    db.prepare("DELETE FROM members WHERE id LIKE 'mlmem-%'").run();
    db.close();
  });

  it('enqueues one outbox row per active subscriber', () => {
    seedSubscriber({ memberId: 'mlmem-a', subStatus: 'subscribed' });
    seedSubscriber({ memberId: 'mlmem-b', subStatus: 'subscribed' });
    seedSubscriber({ memberId: 'mlmem-c', subStatus: 'subscribed' });
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const result = svc.enqueueMailingListEmail({
      mailingListSlug:      'admin-alerts',
      subject:              'New admin queue item: test_task',
      bodyText:             'Task type: test_task\nEntity ID: entity-1',
      idempotencyKeyPrefix: 'admin-alerts:test_task:entity-1',
    });
    expect(result).toEqual({ enqueued: 3, duplicates: 0 });

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const rows = db.prepare(`
      SELECT recipient_email, recipient_member_id, mailing_list_id, subject
      FROM outbox_emails
      WHERE mailing_list_id = 'admin-alerts'
      ORDER BY recipient_member_id
    `).all() as Array<Record<string, unknown>>;
    db.close();
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.recipient_member_id)).toEqual(['mlmem-a', 'mlmem-b', 'mlmem-c']);
    expect(rows.every((r) => r.mailing_list_id === 'admin-alerts')).toBe(true);
    expect(rows[0].subject).toBe('New admin queue item: test_task');
  });

  it('filters bounced, complained, suppressed, and unsubscribed subscribers', () => {
    seedSubscriber({ memberId: 'mlmem-ok',         subStatus: 'subscribed' });
    seedSubscriber({ memberId: 'mlmem-bounced',    subStatus: 'bounced' });
    seedSubscriber({ memberId: 'mlmem-complained', subStatus: 'complained' });
    seedSubscriber({ memberId: 'mlmem-suppressed', subStatus: 'suppressed' });
    seedSubscriber({ memberId: 'mlmem-unsubbed',   subStatus: 'unsubscribed' });
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const result = svc.enqueueMailingListEmail({
      mailingListSlug:      'admin-alerts',
      subject:              'T',
      bodyText:             'B',
      idempotencyKeyPrefix: 'admin-alerts:filter-test:1',
    });
    expect(result).toEqual({ enqueued: 1, duplicates: 0 });
  });

  it('filters subscribed members whose address SES marked undeliverable (email_status != ok)', () => {
    seedSubscriber({ memberId: 'mlmem-deliverable',  subStatus: 'subscribed' });
    seedSubscriber({ memberId: 'mlmem-ses-bounced',  subStatus: 'subscribed' });
    seedSubscriber({ memberId: 'mlmem-ses-complain', subStatus: 'subscribed' });
    const db = new BetterSqlite3(dbPath);
    db.prepare(`UPDATE members SET email_status = 'bounced' WHERE id = 'mlmem-ses-bounced'`).run();
    db.prepare(`UPDATE members SET email_status = 'complained' WHERE id = 'mlmem-ses-complain'`).run();
    db.close();
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const result = svc.enqueueMailingListEmail({
      mailingListSlug:      'admin-alerts',
      subject:              'T',
      bodyText:             'B',
      idempotencyKeyPrefix: 'admin-alerts:email-status-test:1',
    });
    expect(result).toEqual({ enqueued: 1, duplicates: 0 });
  });

  it('filters members with email_verified_at IS NULL', () => {
    seedSubscriber({ memberId: 'mlmem-verified',   subStatus: 'subscribed' });
    seedSubscriber({
      memberId: 'mlmem-unverified', subStatus: 'subscribed', emailVerifiedAt: null,
    });
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const result = svc.enqueueMailingListEmail({
      mailingListSlug:      'admin-alerts',
      subject:              'T',
      bodyText:             'B',
      idempotencyKeyPrefix: 'admin-alerts:verify-test:1',
    });
    expect(result).toEqual({ enqueued: 1, duplicates: 0 });
  });

  it('filters soft-deleted members (members_active view)', () => {
    seedSubscriber({ memberId: 'mlmem-active',  subStatus: 'subscribed' });
    seedSubscriber({
      memberId: 'mlmem-deleted', subStatus: 'subscribed',
      deletedAt: '2025-06-01T00:00:00.000Z',
    });
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const result = svc.enqueueMailingListEmail({
      mailingListSlug:      'admin-alerts',
      subject:              'T',
      bodyText:             'B',
      idempotencyKeyPrefix: 'admin-alerts:soft-delete:1',
    });
    expect(result).toEqual({ enqueued: 1, duplicates: 0 });
  });

  it('returns { 0, 0 } when no subscribers match (no outbox rows written)', () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const result = svc.enqueueMailingListEmail({
      mailingListSlug:      'admin-alerts',
      subject:              'T',
      bodyText:             'B',
      idempotencyKeyPrefix: 'admin-alerts:empty:1',
    });
    expect(result).toEqual({ enqueued: 0, duplicates: 0 });
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const count = db.prepare('SELECT COUNT(*) AS n FROM outbox_emails').get() as { n: number };
    db.close();
    expect(count.n).toBe(0);
  });

  it('reports duplicates when re-run with the same idempotency prefix', () => {
    seedSubscriber({ memberId: 'mlmem-x', subStatus: 'subscribed' });
    seedSubscriber({ memberId: 'mlmem-y', subStatus: 'subscribed' });
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    const first = svc.enqueueMailingListEmail({
      mailingListSlug: 'admin-alerts', subject: 'T', bodyText: 'B',
      idempotencyKeyPrefix: 'admin-alerts:dupe:1',
    });
    const second = svc.enqueueMailingListEmail({
      mailingListSlug: 'admin-alerts', subject: 'T', bodyText: 'B',
      idempotencyKeyPrefix: 'admin-alerts:dupe:1',
    });
    expect(first).toEqual({ enqueued: 2, duplicates: 0 });
    expect(second).toEqual({ enqueued: 0, duplicates: 2 });
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const count = db.prepare(`
      SELECT COUNT(*) AS n FROM outbox_emails WHERE mailing_list_id = 'admin-alerts'
    `).get() as { n: number };
    db.close();
    expect(count.n).toBe(2);
  });

  it('rejects empty input fields with a thrown error', () => {
    const stub = createStubSesAdapter();
    const svc = createCommunicationService(stub);
    expect(() => svc.enqueueMailingListEmail({
      mailingListSlug: '', subject: 'A', bodyText: 'B', idempotencyKeyPrefix: 'x',
    })).toThrow();
    expect(() => svc.enqueueMailingListEmail({
      mailingListSlug: 'admin-alerts', subject: '', bodyText: 'B', idempotencyKeyPrefix: 'x',
    })).toThrow();
    expect(() => svc.enqueueMailingListEmail({
      mailingListSlug: 'admin-alerts', subject: 'A', bodyText: '', idempotencyKeyPrefix: 'x',
    })).toThrow();
    expect(() => svc.enqueueMailingListEmail({
      mailingListSlug: 'admin-alerts', subject: 'A', bodyText: 'B', idempotencyKeyPrefix: '',
    })).toThrow();
  });
});
