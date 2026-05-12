/**
 * Integration tests for OperationsPlatformService.runBatchAutoLink — the
 * one-shot cutover job that scans Tier 0 unlinked members against the
 * legacy data and queues high-confidence matches for
 * A_Review_Auto_Link_Matches per MIGRATION_PLAN §6 / G24.
 *
 * Coverage:
 *  - Tier 1 classifier match queues a work_queue_items row with priority 10.
 *  - Tier 3 classifier outcome is skipped (admins handle via existing queue).
 *  - Already-linked members are filtered at the candidate query.
 *  - Idempotency: re-running with an existing open auto_link_match row
 *    does not double-queue.
 *  - system_job_runs row is recorded with the counter struct in details_json.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3095');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let ops: typeof import('../../src/services/operationsPlatformService');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  ops = await import('../../src/services/operationsPlatformService');
});

afterAll(() => cleanupTestDb(dbPath));

function workQueueRow(memberId: string): { task_type: string; priority: number; status: string } | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return db.prepare(`
      SELECT task_type, priority, status FROM work_queue_items
      WHERE entity_type = 'member' AND entity_id = ?
      ORDER BY opened_at DESC LIMIT 1
    `).get(memberId) as { task_type: string; priority: number; status: string } | undefined;
  } finally {
    db.close();
  }
}

function workQueueCount(memberId: string): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const r = db.prepare(`
      SELECT COUNT(*) AS n FROM work_queue_items
      WHERE entity_type = 'member' AND entity_id = ?
    `).get(memberId) as { n: number };
    return r.n;
  } finally {
    db.close();
  }
}

// Monotonic counter only (no Date.now): deterministic across runs and CI
// schedulers, satisfies the testing.md "no Date.now() in tests" rule.
let _seq = 0;
function nextEmail(): string {
  _seq += 1;
  return `bal-${_seq.toString().padStart(6, '0')}@example.com`;
}

describe('runBatchAutoLink — classifier-driven work-queue emission', () => {
  it('Tier 1 candidate (email + HP provenance + exact name) queues a high-priority work_queue_items row', async () => {
    const db = new BetterSqlite3(dbPath);
    const email = nextEmail();
    insertLegacyMember(db, {
      legacy_member_id: 'bal-tier1-leg',
      legacy_email:     email,
      real_name:        'Avery Tier One',
      display_name:     'Avery Tier One',
    });
    insertHistoricalPerson(db, {
      person_id:        'bal-tier1-hp',
      person_name:      'Avery Tier One',
      legacy_member_id: 'bal-tier1-leg',
    });
    const memberId = insertMember(db, {
      id: 'bal-tier1-mem',
      slug: 'bal_tier1_mem',
      login_email: email,
      real_name:   'Avery Tier One',
      display_name: 'Avery Tier One',
    });
    db.close();

    await ops.operationsPlatformService.runBatchAutoLink();

    const row = workQueueRow(memberId)!;
    expect(row.task_type).toBe('auto_link_match');
    expect(row.priority).toBe(10);
    expect(row.status).toBe('open');
  });

  it('Tier 3 candidate (name mismatch) is skipped — no work_queue row', async () => {
    const db = new BetterSqlite3(dbPath);
    const email = nextEmail();
    insertLegacyMember(db, {
      legacy_member_id: 'bal-tier3-leg',
      legacy_email:     email,
      real_name:        'Different Surname',
    });
    insertHistoricalPerson(db, {
      person_id:        'bal-tier3-hp',
      person_name:      'Some Other Person',
      legacy_member_id: 'bal-tier3-leg',
    });
    const memberId = insertMember(db, {
      id: 'bal-tier3-mem',
      slug: 'bal_tier3_mem',
      login_email: email,
      real_name: 'Different Surname',
      display_name: 'Different Surname',
    });
    db.close();

    await ops.operationsPlatformService.runBatchAutoLink();

    expect(workQueueCount(memberId)).toBe(0);
  });

  it('already-linked members are filtered out at the candidate query', async () => {
    const db = new BetterSqlite3(dbPath);
    insertLegacyMember(db, { legacy_member_id: 'bal-linked-leg', legacy_email: nextEmail() });
    const memberId = insertMember(db, {
      id: 'bal-linked-mem',
      slug: 'bal_linked_mem',
      login_email: nextEmail(),
      legacy_member_id: 'bal-linked-leg',
    });
    db.close();

    await ops.operationsPlatformService.runBatchAutoLink();

    expect(workQueueCount(memberId)).toBe(0);
  });

  it('idempotent: running twice does not double-queue an unchanged Tier 1 candidate', async () => {
    const db = new BetterSqlite3(dbPath);
    const email = nextEmail();
    insertLegacyMember(db, {
      legacy_member_id: 'bal-idem-leg',
      legacy_email:     email,
      real_name:        'Idem Tester',
    });
    insertHistoricalPerson(db, {
      person_id:        'bal-idem-hp',
      person_name:      'Idem Tester',
      legacy_member_id: 'bal-idem-leg',
    });
    const memberId = insertMember(db, {
      id: 'bal-idem-mem',
      slug: 'bal_idem_mem',
      login_email: email,
      real_name: 'Idem Tester',
      display_name: 'Idem Tester',
    });
    db.close();

    await ops.operationsPlatformService.runBatchAutoLink();
    await ops.operationsPlatformService.runBatchAutoLink();

    expect(workQueueCount(memberId)).toBe(1);
  });

  it('writes a system_job_runs row tagged SYS_Batch_Auto_Link with the counter struct', async () => {
    await ops.operationsPlatformService.runBatchAutoLink();

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(`
      SELECT status, details_json FROM system_job_runs
      WHERE job_name = 'SYS_Batch_Auto_Link'
      ORDER BY started_at DESC LIMIT 1
    `).get() as { status: string; details_json: string };
    db.close();

    expect(row.status).toBe('succeeded');
    const details = JSON.parse(row.details_json) as Record<string, number>;
    expect(details).toMatchObject({
      scanned:                expect.any(Number),
      queued_high:            expect.any(Number),
      queued_medium:          expect.any(Number),
      skipped_low:            expect.any(Number),
      skipped_already_queued: expect.any(Number),
      skipped_none:           expect.any(Number),
      skipped_error:          expect.any(Number),
    });
  });
});
