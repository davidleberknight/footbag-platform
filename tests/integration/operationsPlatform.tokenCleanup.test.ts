/**
 * The daily sweep of account tokens.
 *
 * The contract: a token is deleted once it can no longer do anything and has
 * been that way for longer than the configured threshold, whatever its type; a
 * token that is still usable is never touched; one that went spent or expired
 * only recently is kept, so a member reporting that a link did not work can
 * still be answered from the row; and the job reports the age of the oldest row
 * it left, because a count alone cannot tell an operator the table is draining.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertAccountToken, type AccountTokenOverrides } from '../fixtures/factories';

const { dbPath } = setTestEnv('4186');

let operationsPlatformService: typeof import('../../src/services/operationsPlatformService').operationsPlatformService;
let memberId: string;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function daysAhead(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}

function insertToken(o: {
  id: string;
  tokenType: AccountTokenOverrides['token_type'];
  issuedAt: string;
  expiresAt: string;
  usedAt?: string | null;
}): void {
  withDb((db) => {
    insertAccountToken(db, memberId, {
      id:         o.id,
      token_type: o.tokenType,
      issued_at:  o.issuedAt,
      expires_at: o.expiresAt,
      used_at:    o.usedAt ?? null,
    });
  });
}

function remainingIds(): string[] {
  return withDb((db) => (db.prepare('SELECT id FROM account_tokens ORDER BY id').all() as { id: string }[])
    .map((r) => r.id));
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  memberId = insertMember(db, { slug: 'token_sweep_owner', login_email: 'token-sweep@example.com' });
  db.close();
  ({ operationsPlatformService } = await import('../../src/services/operationsPlatformService'));
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  withDb((db) => db.prepare('DELETE FROM account_tokens').run());
});

describe('what the sweep deletes', () => {
  it('deletes a token spent longer ago than the threshold', async () => {
    insertToken({ id: 'tok_spent_old', tokenType: 'password_reset', issuedAt: daysAgo(40), expiresAt: daysAgo(39), usedAt: daysAgo(30) });
    const result = await operationsPlatformService.runExpiredTokenCleanup();
    expect(result.deleted).toBe(1);
    expect(remainingIds()).toEqual([]);
  });

  it('deletes a token that expired unused longer ago than the threshold', async () => {
    insertToken({ id: 'tok_expired_old', tokenType: 'email_verify', issuedAt: daysAgo(40), expiresAt: daysAgo(30) });
    const result = await operationsPlatformService.runExpiredTokenCleanup();
    expect(result.deleted).toBe(1);
    expect(remainingIds()).toEqual([]);
  });

  it('covers every token type, not only the two the job was first written for', async () => {
    insertToken({ id: 'tok_a_export', tokenType: 'data_export', issuedAt: daysAgo(40), expiresAt: daysAgo(30) });
    insertToken({ id: 'tok_b_claim', tokenType: 'account_claim', issuedAt: daysAgo(40), expiresAt: daysAgo(30) });
    insertToken({ id: 'tok_c_mailbox', tokenType: 'mailbox_link', issuedAt: daysAgo(40), expiresAt: daysAgo(30) });
    const result = await operationsPlatformService.runExpiredTokenCleanup();
    expect(result.deleted).toBe(3);
    expect(remainingIds()).toEqual([]);
  });
});

describe('what the sweep keeps', () => {
  it('keeps a token that is still usable', async () => {
    insertToken({ id: 'tok_live', tokenType: 'data_export', issuedAt: daysAgo(1), expiresAt: daysAhead(2) });
    const result = await operationsPlatformService.runExpiredTokenCleanup();
    expect(result.deleted).toBe(0);
    expect(remainingIds()).toEqual(['tok_live']);
  });

  it('keeps a token spent only yesterday, so a member’s report can still be answered', async () => {
    insertToken({ id: 'tok_spent_recent', tokenType: 'password_reset', issuedAt: daysAgo(2), expiresAt: daysAgo(1), usedAt: daysAgo(1) });
    const result = await operationsPlatformService.runExpiredTokenCleanup();
    expect(result.deleted).toBe(0);
    expect(remainingIds()).toEqual(['tok_spent_recent']);
  });

  it('keeps a token that expired only yesterday', async () => {
    insertToken({ id: 'tok_expired_recent', tokenType: 'email_verify', issuedAt: daysAgo(2), expiresAt: daysAgo(1) });
    const result = await operationsPlatformService.runExpiredTokenCleanup();
    expect(result.deleted).toBe(0);
    expect(remainingIds()).toEqual(['tok_expired_recent']);
  });
});

describe('what the sweep reports', () => {
  it('reports the age of the oldest row it left behind', async () => {
    insertToken({ id: 'tok_gone', tokenType: 'email_verify', issuedAt: daysAgo(90), expiresAt: daysAgo(60) });
    insertToken({ id: 'tok_kept_old', tokenType: 'data_export', issuedAt: daysAgo(20), expiresAt: daysAhead(30) });
    insertToken({ id: 'tok_kept_new', tokenType: 'data_export', issuedAt: daysAgo(1), expiresAt: daysAhead(30) });

    const result = await operationsPlatformService.runExpiredTokenCleanup();
    expect(result.deleted).toBe(1);
    expect(result.oldestRemainingAgeDays).toBe(20);
  });

  it('reports no age at all when nothing is left', async () => {
    const result = await operationsPlatformService.runExpiredTokenCleanup();
    expect(result.deleted).toBe(0);
    expect(result.oldestRemainingAgeDays).toBeNull();
  });
});
