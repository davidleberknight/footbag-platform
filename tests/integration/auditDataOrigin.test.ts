/**
 * Every audit row records whether it came from real business or a rehearsal.
 *
 * Production is proven before it goes live: the cutover rehearsal, the
 * payment-provider exercise and the operator bootstrap all write into the
 * production database. The ledger is append-only and retained for years, so a
 * row that leaves this stamp wrong can never be corrected. These tests pin the
 * direction the stamp must fail in, which is always away from "real".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3134');

let db: BetterSqlite3.Database;
let appendAuditEntry: typeof import('../../src/services/auditService').appendAuditEntry;
let dataOrigin: typeof import('../../src/services/dataOriginService');

function lastOrigin(): string {
  const row = db
    .prepare('SELECT data_origin FROM audit_entries ORDER BY rowid DESC LIMIT 1')
    .get() as { data_origin: string } | undefined;
  return row?.data_origin ?? '(no row)';
}

function append(actionType: string): void {
  appendAuditEntry({
    actionType,
    category: 'general',
    actorType: 'system',
    actorMemberId: null,
    entityType: 'audit_log',
    entityId: 'audit_log',
  });
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  await importApp();
  appendAuditEntry = (await import('../../src/services/auditService')).appendAuditEntry;
  dataOrigin = await import('../../src/services/dataOriginService');
});

afterAll(() => {
  cleanupTestDb(db, dbPath);
});

describe('audit ledger data-origin stamp', () => {
  it('stamps a row written while the platform is proving itself as test data', () => {
    dataOrigin.__setDataOriginForTests('test');
    append('audit.viewed');
    expect(lastOrigin()).toBe('test');
  });

  it('stamps a row written after go-live as live', () => {
    dataOrigin.__setDataOriginForTests('live');
    append('audit.viewed');
    expect(lastOrigin()).toBe('live');
  });

  it('never stamps a row live when the go-live marker was never resolved', () => {
    // A process that skipped the boot resolution, or whose parameter-store read
    // failed, must not have its rows read later as real member activity.
    dataOrigin.__setDataOriginForTests(undefined);
    append('audit.viewed');
    expect(lastOrigin()).toBe('unknown');
  });

  it('refuses a stamp outside the recorded vocabulary', () => {
    // The column is the only thing standing between a rehearsal and the real
    // ledger, so a value nobody has a rendering rule for must not persist.
    expect(() =>
      db
        .prepare(
          `INSERT INTO audit_entries (
             id, created_at, created_by, occurred_at, actor_type, actor_member_id,
             action_type, entity_type, entity_id, category, reason_text,
             metadata_json, data_origin
           ) VALUES ('a1','t','system','t','system',NULL,'x.y','audit_log','audit_log',
                     'general',NULL,'{}','probably_real')`,
        )
        .run(),
    ).toThrow();
  });

  it('keeps the stamp immutable once written', () => {
    dataOrigin.__setDataOriginForTests('test');
    append('audit.viewed');
    expect(() =>
      db.prepare("UPDATE audit_entries SET data_origin = 'live'").run(),
    ).toThrow();
    expect(lastOrigin()).toBe('test');
  });
});

describe('data-origin resolution', () => {
  it('treats every environment below production as test data', async () => {
    dataOrigin.__setDataOriginForTests(undefined);
    await expect(dataOrigin.initDataOrigin()).resolves.toBe('test');
  });

  it('answers unknown rather than live before the boot resolution has run', () => {
    dataOrigin.__setDataOriginForTests(undefined);
    expect(dataOrigin.currentDataOrigin()).toBe('unknown');
  });
});
