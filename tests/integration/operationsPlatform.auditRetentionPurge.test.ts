/**
 * The daily audit retention purge, and the delete trigger that bounds it.
 *
 * The contract: rows older than the retention window are deleted by the daily
 * job and by nothing else; the window is audit_retention_days but never less
 * than seven years, so lowering the setting cannot erase recent history; a row
 * an account token still points at is kept until the token goes; the job's
 * trail is its job-run row, never an audit row about itself; and the database
 * refuses a delete of any row inside the window, whoever asks.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertAuditEntry, insertAccountToken, insertSystemConfig } from '../fixtures/factories';
import { rowPin, snapshotIds, oneRowAddedSince } from '../fixtures/rowPinning';

const { dbPath } = setTestEnv('4191');

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

function auditAged(id: string, days: number): void {
  withDb((db) => insertAuditEntry(db, {
    id, action_type: 'member.profile_updated', entity_id: memberId, occurred_at: daysAgo(days),
  }));
}

function remainingIds(): string[] {
  return withDb((db) => (db.prepare('SELECT id FROM audit_entries ORDER BY id').all() as { id: string }[])
    .map((r) => r.id));
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  memberId = insertMember(db, { slug: 'retention_member' });
  db.close();
  ({ operationsPlatformService } = await import('../../src/services/operationsPlatformService'));
});

afterAll(() => cleanupTestDb(dbPath));

// Rows from earlier cases that survive are all inside the window, so each case
// seeds its own ids and asserts on those alone.
beforeEach(() => {
  withDb((db) => db.exec('DELETE FROM account_tokens'));
});

/** Sets the retention setting, effective a moment ago and later than any earlier setting. */
let settingSeq = 0;
function setRetention(days: string): void {
  settingSeq += 1;
  withDb((db) => insertSystemConfig(db, {
    config_key: 'audit_retention_days', value_json: days,
    effective_start_at: new Date(Date.now() - 60_000 + settingSeq * 1000).toISOString(),
  }));
}

describe('the audit retention purge', () => {
  it('deletes rows past seven years and keeps everything younger', async () => {
    auditAged('ret-old', 2600);
    auditAged('ret-edge', 2554);
    auditAged('ret-new', 3);

    const result = await operationsPlatformService.runAuditRetentionPurge();

    const left = remainingIds();
    expect(left).not.toContain('ret-old');
    expect(left).toEqual(expect.arrayContaining(['ret-edge', 'ret-new']));
    expect(result.deleted).toBe(1);
    expect(result.retentionDays).toBe(2555);
  });

  it('follows a longer setting, and never shortens the window below seven years however low the setting', async () => {
    try {
      setRetention('30');
      auditAged('ret-floor-young', 400);
      const low = await operationsPlatformService.runAuditRetentionPurge();
      expect(remainingIds()).toContain('ret-floor-young');
      expect(low.retentionDays).toBe(2555);

      setRetention('3000');
      auditAged('ret-long-kept', 2600);
      const long = await operationsPlatformService.runAuditRetentionPurge();
      expect(remainingIds()).toContain('ret-long-kept');
      expect(long.retentionDays).toBe(3000);
    } finally {
      setRetention('2555');
    }
  });

  it('keeps an old row an account token still points at', async () => {
    auditAged('ret-pinned', 2700);
    withDb((db) => insertAccountToken(db, memberId, { target_audit_entry_id: 'ret-pinned' }));

    await operationsPlatformService.runAuditRetentionPurge();

    expect(remainingIds()).toContain('ret-pinned');
  });

  it('leaves its trail on the job-run row and writes no audit row about itself', async () => {
    auditAged('ret-trail', 2600);
    const auditBefore = withDb((db) => (db.prepare('SELECT COUNT(*) AS n FROM audit_entries').get() as { n: number }).n);
    const runs = rowPin('system_job_runs', "job_name = 'SYS_Purge_Audit_Entries'");
    const runsBefore = withDb((db) => snapshotIds(db, runs));

    const result = await operationsPlatformService.runAuditRetentionPurge();

    const run = withDb((db) => oneRowAddedSince<{ status: string; details_json: string }>(db, runs, runsBefore));
    expect(run.status).toBe('succeeded');
    expect(JSON.parse(run.details_json).deleted).toBe(result.deleted);
    expect(withDb((db) => (db.prepare('SELECT COUNT(*) AS n FROM audit_entries').get() as { n: number }).n))
      .toBe(auditBefore - result.deleted);
  });
});

describe('the audit delete trigger', () => {
  it('refuses a delete of a row inside the window, and allows one past it', () => {
    auditAged('trg-young', 2000);
    auditAged('trg-old', 2600);
    withDb((db) => {
      // factory-cannot-express: the subject is the database refusing a delete.
      expect(() => db.prepare("DELETE FROM audit_entries WHERE id = 'trg-young'").run())
        .toThrow(/only rows past the retention window/);
      db.prepare("DELETE FROM audit_entries WHERE id = 'trg-old'").run();
    });
    const left = remainingIds();
    expect(left).toContain('trg-young');
    expect(left).not.toContain('trg-old');
  });

  it('keeps refusing an update of any row', () => {
    auditAged('trg-update', 2600);
    withDb((db) => {
      // factory-cannot-express: the subject is the database refusing an update.
      expect(() => db.prepare("UPDATE audit_entries SET reason_text = 'x' WHERE id = 'trg-update'").run())
        .toThrow(/immutable/);
    });
  });
});
