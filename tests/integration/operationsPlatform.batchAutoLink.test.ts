/**
 * Integration tests for OperationsPlatformService.runBatchAutoLink — the
 * one-shot cutover job that scans Tier 0 unlinked members and STAGES
 * candidates for high/medium classifier outcomes (stage-and-confirm), with
 * low-confidence cases routing to the admin work queue.
 *
 * Coverage:
 *  - High classifier match stages a candidate row: NO live-table mutation,
 *    NO tier grant, NO email; one staged audit event with the proposed
 *    email-anchored evidence tier.
 *  - Medium classifier match stages with the asserted-identity floor tier
 *    and the matched name variant in the audit metadata.
 *  - Low classifier outcome routes to work_queue_items with admin-alerts
 *    fan-out (unchanged by the staging rework).
 *  - Already-linked members are filtered at the candidate query.
 *  - Idempotency: re-running stages nothing new (unique open-pair index),
 *    counts skipped_already_staged, and does not duplicate work-queue rows.
 *  - A pair the member declined is never re-staged.
 *  - The expiry sweep marks aged open candidates expired with one audit
 *    event each, and re-sweeping is a no-op.
 *  - system_job_runs row records the staging counter struct.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { expectLoggedError } from '../setup-env';
import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3095');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let ops: typeof import('../../src/services/operationsPlatformService');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let identity: typeof import('../../src/services/identityAccessService');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  ops = await import('../../src/services/operationsPlatformService');
  identity = await import('../../src/services/identityAccessService');
});

afterEach(() => vi.restoreAllMocks());

afterAll(() => cleanupTestDb(dbPath));

function openRO(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath, { readonly: true });
}

function memberRow(id: string): Record<string, unknown> {
  const db = openRO();
  try {
    return db.prepare(`SELECT * FROM members WHERE id = ?`).get(id) as Record<string, unknown>;
  } finally { db.close(); }
}

function legacyRow(id: string): Record<string, unknown> {
  const db = openRO();
  try {
    return db.prepare(`SELECT * FROM legacy_members WHERE legacy_member_id = ?`).get(id) as Record<string, unknown>;
  } finally { db.close(); }
}

function stagedRows(memberId: string): Array<Record<string, unknown>> {
  const db = openRO();
  try {
    return db.prepare(`
      SELECT * FROM auto_link_staged_candidates WHERE member_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(memberId) as Array<Record<string, unknown>>;
  } finally { db.close(); }
}

function tierGrants(memberId: string): Array<Record<string, unknown>> {
  const db = openRO();
  try {
    return db.prepare(`
      SELECT change_type, reason_code FROM member_tier_grants WHERE member_id = ?
    `).all(memberId) as Array<Record<string, unknown>>;
  } finally { db.close(); }
}

function auditRows(memberId: string, actionType: string): Array<Record<string, unknown>> {
  const db = openRO();
  try {
    return db.prepare(`
      SELECT id, action_type, metadata_json
      FROM audit_entries WHERE entity_type = 'member' AND entity_id = ? AND action_type = ?
      ORDER BY created_at ASC, id ASC
    `).all(memberId, actionType) as Array<Record<string, unknown>>;
  } finally { db.close(); }
}

function outboxCount(memberId: string): number {
  const db = openRO();
  try {
    const r = db.prepare(`
      SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_member_id = ?
    `).get(memberId) as { n: number };
    return r.n;
  } finally { db.close(); }
}

function workQueueCount(memberId: string): number {
  const db = openRO();
  try {
    const r = db.prepare(`
      SELECT COUNT(*) AS n FROM work_queue_items
      WHERE entity_type = 'member' AND entity_id = ?
    `).get(memberId) as { n: number };
    return r.n;
  } finally { db.close(); }
}

let _seq = 0;
function nextId(prefix: string): string {
  _seq += 1;
  return `${prefix}-${_seq.toString().padStart(4, '0')}`;
}

function seedTriple(opts: {
  prefix: string;
  memberRealName: string;
  hpName: string;
  legacyRealName?: string;
}): { memberId: string; legacyId: string; personId: string; email: string } {
  const db = new BetterSqlite3(dbPath);
  const email = `${nextId(opts.prefix)}@example.com`;
  const legacyId = nextId(`legmem-${opts.prefix}`);
  const personId = nextId(`hp-${opts.prefix}`);
  const memberId = nextId(`mem-${opts.prefix}`);
  insertLegacyMember(db, {
    legacy_member_id: legacyId, legacy_email: email,
    real_name: opts.legacyRealName ?? opts.hpName, display_name: opts.legacyRealName ?? opts.hpName,
  });
  insertHistoricalPerson(db, {
    person_id: personId, person_name: opts.hpName,
    legacy_member_id: legacyId,
  });
  insertMember(db, {
    id: memberId, slug: memberId.replace(/-/g, '_'),
    login_email: email, real_name: opts.memberRealName, display_name: opts.memberRealName,
  });
  db.close();
  return { memberId, legacyId, personId, email };
}

describe('runBatchAutoLink — stage-and-confirm', () => {
  it('high-confidence: stages a candidate; no live-table mutation, no tier grant, no email', async () => {
    const t = seedTriple({ prefix: 'high', memberRealName: 'Alpha Bravo', hpName: 'Alpha Bravo' });

    const result = await ops.operationsPlatformService.runBatchAutoLink();
    expect(result.staged_high).toBeGreaterThanOrEqual(1);

    // No live-table mutation of any kind.
    const mem = memberRow(t.memberId);
    expect(mem.legacy_member_id).toBeNull();
    expect(mem.historical_person_id).toBeNull();
    const lm = legacyRow(t.legacyId);
    expect(lm.claimed_by_member_id).toBeNull();
    expect(tierGrants(t.memberId)).toHaveLength(0);
    expect(outboxCount(t.memberId)).toBe(0);

    // One open staged row with the email-anchored evidence tier.
    const rows = stagedRows(t.memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('staged');
    expect(rows[0].confidence).toBe('high');
    expect(rows[0].legacy_member_id).toBe(t.legacyId);
    expect(rows[0].historical_person_id).toBe(t.personId);
    expect(rows[0].proposed_evidence_strength).toBe('currently_controls_modern_email_matching_legacy');
    expect(rows[0].source_pass).toBe('batch');
    expect(rows[0].expires_at).not.toBeNull();

    // One staged audit event carrying the candidate id.
    const audits = auditRows(t.memberId, 'legacy.auto_link_candidate_staged');
    expect(audits).toHaveLength(1);
    const meta = JSON.parse(String(audits[0].metadata_json)) as Record<string, unknown>;
    expect(meta.candidate_id).toBe(rows[0].id);
    expect(meta.confidence).toBe('high');
    expect(meta.legacy_member_id).toBe(t.legacyId);
    expect(meta.person_id).toBe(t.personId);
  });

  it('medium-confidence: stages with the asserted-identity floor tier and records the matched variant', async () => {
    const db = new BetterSqlite3(dbPath);
    db.prepare(`INSERT INTO name_variants (canonical_normalized, variant_normalized, source)
                VALUES (?, ?, 'admin_added')`).run('robert smith', 'bob smith');
    db.close();
    const t = seedTriple({ prefix: 'med', memberRealName: 'Bob Smith', hpName: 'Robert Smith' });

    const result = await ops.operationsPlatformService.runBatchAutoLink();
    expect(result.staged_medium).toBeGreaterThanOrEqual(1);

    const rows = stagedRows(t.memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].confidence).toBe('medium');
    expect(rows[0].proposed_evidence_strength).toBe('declared_anchor_only');

    const audits = auditRows(t.memberId, 'legacy.auto_link_candidate_staged');
    expect(audits).toHaveLength(1);
    const meta = JSON.parse(String(audits[0].metadata_json)) as Record<string, unknown>;
    expect(meta.matched_variant_normalized).toBeTruthy();
  });

  it('low-confidence: routes to work_queue_items with admin-alerts fan-out; nothing staged', async () => {
    const SUBSCRIBER_ID = nextId('admin-sub');
    const db = new BetterSqlite3(dbPath);
    insertMember(db, {
      id: SUBSCRIBER_ID, slug: SUBSCRIBER_ID.replace(/-/g, '_'),
      display_name: 'Alerts Subscriber', login_email: `${SUBSCRIBER_ID}@example.com`,
      is_admin: 1,
    });
    db.prepare(`
      INSERT INTO mailing_list_subscriptions (
        id, created_at, created_by, updated_at, updated_by, version,
        mailing_list_id, member_id, status, status_updated_at
      ) VALUES (?, '2025-01-01T00:00:00.000Z', 'system', '2025-01-01T00:00:00.000Z', 'system', 1,
                'admin-alerts', ?, 'subscribed', '2025-01-01T00:00:00.000Z')
    `).run(`mls-${SUBSCRIBER_ID}`, SUBSCRIBER_ID);
    db.close();
    const t = seedTriple({
      prefix: 'low', memberRealName: 'Charlie Delta', hpName: 'Echo Foxtrot',
      legacyRealName: 'Charlie Delta',
    });

    await ops.operationsPlatformService.runBatchAutoLink();

    expect(stagedRows(t.memberId)).toHaveLength(0);
    const mem = memberRow(t.memberId);
    expect(mem.legacy_member_id).toBeNull();
    expect(workQueueCount(t.memberId)).toBe(1);
  });

  it('already-linked candidates are filtered at the candidate query (nothing staged)', async () => {
    const db = new BetterSqlite3(dbPath);
    const legacyId = nextId('legmem-skip');
    insertLegacyMember(db, { legacy_member_id: legacyId, legacy_email: `${nextId('skip')}@example.com` });
    const memberId = nextId('mem-skip');
    insertMember(db, {
      id: memberId, slug: memberId.replace(/-/g, '_'),
      login_email: `${nextId('skip')}@example.com`,
      legacy_member_id: legacyId,
    });
    db.close();

    await ops.operationsPlatformService.runBatchAutoLink();

    expect(stagedRows(memberId)).toHaveLength(0);
    expect(auditRows(memberId, 'legacy.auto_link_candidate_staged')).toHaveLength(0);
    expect(workQueueCount(memberId)).toBe(0);
  });

  it('idempotent: rerun stages nothing new and counts skipped_already_staged', async () => {
    const t = seedTriple({ prefix: 'idem', memberRealName: 'Idem Tester', hpName: 'Idem Tester' });

    await ops.operationsPlatformService.runBatchAutoLink();
    const second = await ops.operationsPlatformService.runBatchAutoLink();

    expect(second.skipped_already_staged).toBeGreaterThanOrEqual(1);
    expect(stagedRows(t.memberId)).toHaveLength(1);
    expect(auditRows(t.memberId, 'legacy.auto_link_candidate_staged')).toHaveLength(1);
  });

  it('a declined pair is never re-staged', async () => {
    const t = seedTriple({ prefix: 'decl', memberRealName: 'Decline Tester', hpName: 'Decline Tester' });

    await ops.operationsPlatformService.runBatchAutoLink();
    const open = stagedRows(t.memberId);
    expect(open).toHaveLength(1);

    const declined = identity.identityAccessService.declineStagedCandidate(
      t.memberId,
      String(open[0].id),
    );
    expect(declined.status).toBe('declined');
    expect(auditRows(t.memberId, 'legacy.auto_link_candidate_declined')).toHaveLength(1);

    const rerun = await ops.operationsPlatformService.runBatchAutoLink();
    expect(rerun.skipped_previously_declined).toBeGreaterThanOrEqual(1);
    const rows = stagedRows(t.memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('declined');
  });

  it('expiry sweep marks aged open candidates expired with one audit event each; re-sweep is a no-op', async () => {
    const t = seedTriple({ prefix: 'exp', memberRealName: 'Expiry Tester', hpName: 'Expiry Tester' });

    await ops.operationsPlatformService.runBatchAutoLink();
    const open = stagedRows(t.memberId);
    expect(open).toHaveLength(1);

    // Back-date the expiry window so the sweep sees the row as aged out.
    const db = new BetterSqlite3(dbPath);
    db.prepare(`UPDATE auto_link_staged_candidates SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?`)
      .run(open[0].id);
    db.close();

    const first = identity.identityAccessService.expireStagedCandidates();
    expect(first.expired).toBeGreaterThanOrEqual(1);
    const rows = stagedRows(t.memberId);
    expect(rows[0].status).toBe('expired');
    expect(rows[0].resolved_at).not.toBeNull();
    expect(auditRows(t.memberId, 'legacy.auto_link_candidate_expired')).toHaveLength(1);

    const second = identity.identityAccessService.expireStagedCandidates();
    expect(second.expired).toBe(0);
    expect(auditRows(t.memberId, 'legacy.auto_link_candidate_expired')).toHaveLength(1);
  });

  it('writes a system_job_runs row tagged SYS_Batch_Auto_Link with the staging counter struct', async () => {
    await ops.operationsPlatformService.runBatchAutoLink();

    const db = openRO();
    const row = db.prepare(`
      SELECT status, details_json FROM system_job_runs
      WHERE job_name = 'SYS_Batch_Auto_Link'
      ORDER BY started_at DESC LIMIT 1
    `).get() as { status: string; details_json: string };
    db.close();

    expect(row.status).toBe('succeeded');
    const details = JSON.parse(row.details_json) as Record<string, number>;
    expect(details).toMatchObject({
      scanned:                          expect.any(Number),
      staged_high:                      expect.any(Number),
      staged_medium:                    expect.any(Number),
      queued_low:                       expect.any(Number),
      skipped_low_already_queued:       expect.any(Number),
      skipped_already_staged:           expect.any(Number),
      skipped_previously_declined:      expect.any(Number),
      skipped_already_linked:           expect.any(Number),
      skipped_no_legacy_for_hp:         expect.any(Number),
      skipped_legacy_claimed_by_other:  expect.any(Number),
      skipped_none:                     expect.any(Number),
      skipped_error:                    expect.any(Number),
    });
  });

  it('a per-candidate classification throw records an operational error and the batch continues', async () => {
    const t = seedTriple({ prefix: 'clserr', memberRealName: 'Classify Error', hpName: 'Classify Error' });

    expectLoggedError(/legacy\.auto_link_candidate_failed/);
    const orig = identity.identityAccessService.getAutoLinkClassificationForMember;
    vi.spyOn(identity.identityAccessService, 'getAutoLinkClassificationForMember')
      .mockImplementation((memberId) => {
        if (memberId === t.memberId) throw new Error('synthetic classification failure');
        return orig.call(identity.identityAccessService, memberId);
      });

    const result = await ops.operationsPlatformService.runBatchAutoLink();

    // The bad candidate is counted, nothing is staged for it, and the loop
    // still finishes the rest of the batch.
    expect(result.skipped_error).toBeGreaterThanOrEqual(1);
    expect(stagedRows(t.memberId)).toHaveLength(0);

    // The failure is now an alarmable operational error, not a silent skip.
    expect(auditRows(t.memberId, 'legacy.auto_link_candidate_failed')).toHaveLength(1);

    // The job still records succeeded; one bad candidate does not abort it.
    const db = openRO();
    const row = db.prepare(`
      SELECT status FROM system_job_runs
      WHERE job_name = 'SYS_Batch_Auto_Link'
      ORDER BY started_at DESC LIMIT 1
    `).get() as { status: string };
    db.close();
    expect(row.status).toBe('succeeded');
  });

  it('a per-candidate staging throw records an operational error and the batch continues', async () => {
    const t = seedTriple({ prefix: 'stgerr', memberRealName: 'Stage Error', hpName: 'Stage Error' });

    expectLoggedError(/legacy\.auto_link_candidate_failed/);
    const orig = identity.identityAccessService.stageAutoLinkCandidate;
    vi.spyOn(identity.identityAccessService, 'stageAutoLinkCandidate')
      .mockImplementation((memberId, evidence, sourcePass) => {
        if (memberId === t.memberId) throw new Error('synthetic staging failure');
        return orig.call(identity.identityAccessService, memberId, evidence, sourcePass);
      });

    const result = await ops.operationsPlatformService.runBatchAutoLink();

    expect(result.skipped_error).toBeGreaterThanOrEqual(1);
    expect(stagedRows(t.memberId)).toHaveLength(0);
    expect(auditRows(t.memberId, 'legacy.auto_link_candidate_failed')).toHaveLength(1);
  });
});
