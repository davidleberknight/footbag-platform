/**
 * Outbound-copy cleanup branch of the soft-deleted-records job: an outbox row
 * is one message to one recipient, holding that recipient's address and the
 * rendered body, and it is deleted once it ages past the outbound-copy
 * retention window. A delivered row ages from its send time; a dead-lettered
 * row ages from its last attempt, since a failure nobody reviewed in a full
 * window will not be reviewed later. Copies inside the window survive, and so
 * do rows the send worker still owns (pending, failed) and rows parked for
 * manual review, which are unresolved questions about whether a real person
 * received the message rather than history to age out.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertOutboxEmail, type OutboxEmailOverrides } from '../fixtures/factories';

const { dbPath } = setTestEnv('4073');

// Scan time; the seeded retention window is 90 days, so the cutoff is early
// March 2026. The January copies are past it, the May one is inside it.
const NOW = new Date('2026-06-01T00:00:00.000Z');

let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let operationsPlatformService: typeof import('../../src/services/operationsPlatformService').operationsPlatformService;

function insertOutboxRow(
  id: string,
  status: NonNullable<OutboxEmailOverrides['status']>,
  sentAt: string | null,
  opts: { lastAttemptAt?: string | null; createdAt?: string } = {},
): void {
  insertOutboxEmail(db, {
    id,
    created_at: opts.createdAt ?? '2026-01-01T00:00:00.000Z',
    recipient_email: `${id}@example.test`,
    subject: `Subject ${id}`,
    body_text: 'body',
    status,
    sent_at: sentAt,
    last_attempt_at: opts.lastAttemptAt ?? null,
  });
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertOutboxRow('ob-old-sent',    'sent',          '2026-01-05T00:00:00.000Z');
  insertOutboxRow('ob-older-sent',  'sent',          '2025-11-05T00:00:00.000Z');
  insertOutboxRow('ob-recent-sent', 'sent',          '2026-05-20T00:00:00.000Z');
  insertOutboxRow('ob-pending',     'pending',       null);
  insertOutboxRow('ob-failed',      'failed',        null);
  insertOutboxRow('ob-review',      'manual_review', null);
  // Dead-lettered and unreviewed since January: past the window.
  insertOutboxRow('ob-dead-old',    'dead_letter',   null, { lastAttemptAt: '2026-01-09T00:00:00.000Z' });
  // Dead-lettered last month: still inside the window.
  insertOutboxRow('ob-dead-recent', 'dead_letter',   null, { lastAttemptAt: '2026-05-09T00:00:00.000Z' });
  // Dead-lettered with no recorded attempt: ages on the row itself.
  insertOutboxRow('ob-dead-noattempt', 'dead_letter', null);
  // Either side of the cutoff by a second, which is what pins the boundary.
  // Seeded months away, an off-by-one day or a `<` that should be `<=` changes
  // nothing and the test still passes.
  insertOutboxRow('ob-sent-just-before',  'sent', '2026-03-02T23:59:59.000Z');
  insertOutboxRow('ob-sent-just-after',   'sent', '2026-03-03T00:00:01.000Z');
  insertOutboxRow('ob-dead-just-before',  'dead_letter', null, { lastAttemptAt: '2026-03-02T23:59:59.000Z' });
  insertOutboxRow('ob-dead-just-after',   'dead_letter', null, { lastAttemptAt: '2026-03-03T00:00:01.000Z' });
  db.close();
  operationsPlatformService = (await import('../../src/services/operationsPlatformService')).operationsPlatformService;
});

afterAll(() => cleanupTestDb(dbPath));

function remainingIds(): string[] {
  const probe = new BetterSqlite3(dbPath, { readonly: true });
  const rows = probe.prepare('SELECT id FROM outbox_emails ORDER BY id').all() as { id: string }[];
  probe.close();
  return rows.map((r) => r.id);
}

describe('outbound copy cleanup', () => {
  it('deletes aged delivered and dead-lettered copies, and counts them apart', async () => {
    const result = await operationsPlatformService.runPiiPurgeScan({ now: NOW });

    // Two aged deliveries plus the one a second the wrong side of the cutoff.
    expect(result.outboxCopies.deliveredDeleted).toBe(3);
    // The aged dead letter, the one with no recorded attempt, which falls back
    // to the row's own age, and the one a second past the cutoff.
    expect(result.outboxCopies.deadLetterDeleted).toBe(3);
    expect(result.outboxCopies.errors).toHaveLength(0);

    // What survives: the recent delivery and the recent dead letter, both
    // inside the window; the pair a second inside the cutoff; the two rows the
    // send worker still owns; and the manual-review row, whose delivery outcome
    // is still unknown.
    expect(remainingIds()).toEqual([
      'ob-dead-just-after', 'ob-dead-recent', 'ob-failed', 'ob-pending',
      'ob-recent-sent', 'ob-review', 'ob-sent-just-after',
    ]);
  });

  it('is idempotent: a second pass finds nothing left to delete', async () => {
    const result = await operationsPlatformService.runPiiPurgeScan({ now: NOW });
    expect(result.outboxCopies.deliveredDeleted).toBe(0);
    expect(result.outboxCopies.deadLetterDeleted).toBe(0);
    expect(remainingIds()).toHaveLength(7);
  });
});
