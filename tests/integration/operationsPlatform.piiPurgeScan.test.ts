/**
 * PII purge-eligibility scan contract: one daily pass fully purges
 * soft-deleted accounts whose grace window expired and contact-scrubs
 * deceased accounts whose (separate) grace window expired; accounts inside
 * either window, system accounts, and already-erased rows are untouched; an
 * account both deceased and soft-deleted gets the full purge; one failing
 * row is recorded as an operational error without aborting the pass; every
 * pass writes one system_job_runs row with per-branch counters; both grace
 * windows are read from runtime config on every pass; re-runs are no-ops.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';
import { expectLoggedError } from '../setup-env';

const { dbPath } = setTestEnv('3202');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let operationsPlatformService: typeof import('../../src/services/operationsPlatformService').operationsPlatformService;

// Fixed scan time. With the seeded 90-day deleted grace the cutoff is
// 2026-03-03T00:00:00.000Z; with the seeded 30-day deceased grace it is
// 2026-05-02T00:00:00.000Z.
const NOW = new Date('2026-06-01T00:00:00.000Z');

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Deleted branch: eligible exactly at the boundary, ineligible 1ms inside.
  insertMember(db, { id: 'm-del-old', slug: 'm_del_old', deleted_at: '2026-03-03T00:00:00.000Z' });
  insertMember(db, { id: 'm-del-fresh', slug: 'm_del_fresh', deleted_at: '2026-03-03T00:00:00.001Z' });

  // Deceased branch: same boundary pair against the 30-day window.
  insertMember(db, { id: 'm-dec-old', slug: 'm_dec_old', is_deceased: 1 });
  insertMember(db, { id: 'm-dec-fresh', slug: 'm_dec_fresh', is_deceased: 1 });
  db.prepare(`UPDATE members SET deceased_at = '2026-05-02T00:00:00.000Z' WHERE id = 'm-dec-old'`).run();
  db.prepare(`UPDATE members SET deceased_at = '2026-05-02T00:00:00.001Z' WHERE id = 'm-dec-fresh'`).run();

  // Deceased AND soft-deleted: the deleted branch owns it (full purge
  // supersedes the contact scrub).
  insertMember(db, { id: 'm-both', slug: 'm_both', is_deceased: 1, deleted_at: '2026-02-01T00:00:00.000Z' });
  db.prepare(`UPDATE members SET deceased_at = '2026-01-01T00:00:00.000Z' WHERE id = 'm-both'`).run();

  // System accounts never purge.
  insertMember(db, { id: 'm-sys', slug: 'm_sys', is_system: 1, deleted_at: '2026-01-01T00:00:00.000Z' });

  // Failure isolation: this row's purge throws (its anonymized slug is
  // already taken), and the pass must continue past it.
  insertMember(db, { id: 'm-err', slug: 'm_err', deleted_at: '2026-01-15T00:00:00.000Z' });
  insertMember(db, { id: 'm-err-collider', slug: 'removed_merr' });

  db.close();
  operationsPlatformService = (await import('../../src/services/operationsPlatformService')).operationsPlatformService;
});

afterAll(() => cleanupTestDb(dbPath));

function memberRow(id: string): Record<string, unknown> {
  const d = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return d.prepare('SELECT * FROM members WHERE id = ?').get(id) as Record<string, unknown>;
  } finally {
    d.close();
  }
}

function erasureKinds(id: string): string[] {
  const d = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return (d.prepare(`
      SELECT erasure_kind FROM erasure_log
      WHERE entity_type = 'member' AND entity_id = ?
      ORDER BY erasure_kind
    `).all(id) as Array<{ erasure_kind: string }>).map((r) => r.erasure_kind);
  } finally {
    d.close();
  }
}

describe('operationsPlatformService.runPiiPurgeScan', () => {
  it('purges grace-expired deleted accounts, scrubs grace-expired deceased accounts, isolates failures, and leaves the rest alone', async () => {
    expectLoggedError('audit: member.pii_erasure_failed');

    const result = await operationsPlatformService.runPiiPurgeScan({ now: NOW });

    expect(result.deleted.eligible).toBe(3);
    expect(result.deleted.purged).toBe(2);
    expect(result.deleted.honorsPreserved).toBe(0);
    expect(result.deleted.skipped).toBe(0);
    expect(result.deleted.errors).toHaveLength(1);
    expect(result.deleted.errors[0].memberId).toBe('m-err');

    expect(result.deceased.eligible).toBe(1);
    expect(result.deceased.scrubbed).toBe(1);
    expect(result.deceased.errors).toHaveLength(0);

    // Full purge applied to the grace-expired deleted account.
    const del = memberRow('m-del-old');
    expect(del.login_email).toBeNull();
    expect(del.display_name).toBe('Removed Member');
    expect(del.personal_data_purged_at).not.toBeNull();
    expect(erasureKinds('m-del-old')).toEqual(['account_pii_purge']);

    // Deceased + deleted got the full purge, not the scrub.
    expect(memberRow('m-both').display_name).toBe('Removed Member');
    expect(erasureKinds('m-both')).toEqual(['account_pii_purge']);

    // Contact scrub applied to the grace-expired deceased account: identity
    // preserved, credentials gone.
    const dec = memberRow('m-dec-old');
    expect(dec.login_email).toBeNull();
    expect(dec.display_name).toBe('Test User');
    expect(dec.personal_data_purged_at).not.toBeNull();
    expect(erasureKinds('m-dec-old')).toEqual(['deceased_contact_scrub']);

    // Inside-grace, system, and failed rows are untouched.
    for (const id of ['m-del-fresh', 'm-dec-fresh', 'm-err']) {
      expect(memberRow(id).personal_data_purged_at, id).toBeNull();
      expect(erasureKinds(id), id).toEqual([]);
    }
    expect(memberRow('m-sys').personal_data_purged_at).toBeNull();

    // One job-run row records the pass with the counter struct.
    const d = new BetterSqlite3(dbPath, { readonly: true });
    const runs = d.prepare(`
      SELECT status, details_json FROM system_job_runs
      WHERE job_name = 'SYS_Cleanup_Soft_Deleted_Records'
    `).all() as Array<{ status: string; details_json: string }>;
    d.close();
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('succeeded');
    const details = JSON.parse(runs[0].details_json) as typeof result;
    expect(details.deleted.purged).toBe(2);
    expect(details.deceased.scrubbed).toBe(1);
    expect(details.deleted.errors[0].memberId).toBe('m-err');
  });

  it('re-running is a no-op for already-erased rows, and a fixed row purges on the next pass', async () => {
    // Free the colliding slug; the previously failing row can now purge.
    const d = new BetterSqlite3(dbPath);
    d.prepare(`UPDATE members SET slug = 'merr_collider_moved' WHERE id = 'm-err-collider'`).run();
    d.close();

    const result = await operationsPlatformService.runPiiPurgeScan({ now: NOW });

    expect(result.deleted.eligible).toBe(1);
    expect(result.deleted.purged).toBe(1);
    expect(result.deleted.errors).toHaveLength(0);
    expect(result.deceased.eligible).toBe(0);
    expect(erasureKinds('m-err')).toEqual(['account_pii_purge']);

    // The first pass's erasures did not repeat: still one audit row each.
    const d2 = new BetterSqlite3(dbPath, { readonly: true });
    for (const id of ['m-del-old', 'm-both']) {
      const n = (d2.prepare(`
        SELECT COUNT(*) AS n FROM audit_entries
        WHERE entity_id = ? AND action_type = 'member.pii_purged'
      `).get(id) as { n: number }).n;
      expect(n, id).toBe(1);
    }
    d2.close();
  });

  it('reads both grace windows from runtime config on every pass', async () => {
    // Widen the deleted grace so nothing qualifies; tighten the deceased
    // grace so the previously inside-grace deceased account becomes due.
    const d = new BetterSqlite3(dbPath);
    d.prepare(`
      INSERT INTO system_config
        (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
      VALUES
        ('test-del-grace', '2026-05-30T00:00:00.000Z', 'member_cleanup_grace_days', '200', '2026-05-30T00:00:00.000Z', 'Test grace override', NULL),
        ('test-dec-grace', '2026-05-30T00:00:00.000Z', 'deceased_cleanup_grace_days', '1', '2026-05-30T00:00:00.000Z', 'Test grace override', NULL)
    `).run();
    d.close();

    const result = await operationsPlatformService.runPiiPurgeScan({ now: NOW });

    expect(result.deleted.eligible).toBe(0);
    expect(result.deceased.eligible).toBe(1);
    expect(result.deceased.scrubbed).toBe(1);
    expect(erasureKinds('m-dec-fresh')).toEqual(['deceased_contact_scrub']);
    // The wider deleted window kept the still-credentialed deleted account
    // untouched.
    expect(memberRow('m-del-fresh').personal_data_purged_at).toBeNull();
  });
});
