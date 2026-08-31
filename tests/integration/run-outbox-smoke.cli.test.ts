/**
 * Wiring test for the outbox send-path smoke entry point (gate G10): the
 * runner enqueues through the communication service, reports PASS only after
 * the worker drains the row, and reports the stuck status when nothing
 * drains. The drain logic itself is covered by the email-worker suite; this
 * asserts the entry point drives and observes it correctly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4145');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let runner: typeof import('../../src/runOutboxSmoke');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let ops: typeof import('../../src/services/operationsPlatformService');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  runner = await import('../../src/runOutboxSmoke');
  ops = await import('../../src/services/operationsPlatformService');
});

afterAll(() => cleanupTestDb(dbPath));

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function rowFor(recipient: string): { status: string } | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return db
      .prepare(
        `SELECT status FROM outbox_emails WHERE recipient_email = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(recipient) as { status: string } | undefined;
  } finally {
    db.close();
  }
}

describe('runOutboxSmoke (send-path smoke entry point)', () => {
  it('returns 0 once the worker drains the enqueued row to sent', async () => {
    const pending = runner.runOutboxSmoke({
      to: 'outbox-smoke-pass@example.com',
      timeoutSeconds: 10,
      pollMs: 25,
    });
    await sleep(60);
    const drained = await ops.operationsPlatformService.runEmailWorker();
    expect(drained.sent).toBeGreaterThanOrEqual(1);

    const code = await pending;
    expect(code).toBe(0);
    expect(rowFor('outbox-smoke-pass@example.com')?.status).toBe('sent');
  });

  it('returns 1 with the row still pending when nothing drains it', async () => {
    const code = await runner.runOutboxSmoke({
      to: 'outbox-smoke-stuck@example.com',
      timeoutSeconds: 0.2,
      pollMs: 25,
    });
    expect(code).toBe(1);
    expect(rowFor('outbox-smoke-stuck@example.com')?.status).toBe('pending');
  });
});
