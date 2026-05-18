/**
 * Integration tests for OperationsPlatformService.runBatchAutoLink — the
 * one-shot cutover job that scans Tier 0 unlinked members and applies
 * MIGRATION_PLAN §6 silent auto-link for high/medium classifier outcomes,
 * with low-confidence cases routing to the admin work queue.
 *
 * Coverage:
 *  - High classifier match silently claims (member.legacy_member_id +
 *    historical_person_id set; legacy_members.claimed_by_member_id set;
 *    member_tier_grants row written; legacy.auto_link_silent_claim audit
 *    row written; notification email enqueued; NO pending card).
 *  - Medium classifier match silently claims AND persists a first-login
 *    pending_auto_link_card_json payload alongside the notification email.
 *  - Low classifier outcome (no_hp / hp_mismatch / multiple_name_candidates)
 *    routes to work_queue_items with admin-alerts fan-out.
 *  - Already-linked members are filtered at the candidate query.
 *  - Idempotency: re-running does not double-claim, does not duplicate
 *    notification emails (auto_link_notification:<audit_id> idempotency
 *    key collapses), and does not duplicate low-confidence work queue rows.
 *  - system_job_runs row is recorded with the counter struct in
 *    details_json (new shape: claimed_high / claimed_medium / queued_low / ...).
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

function tierGrants(memberId: string): Array<Record<string, unknown>> {
  const db = openRO();
  try {
    return db.prepare(`
      SELECT change_type, reason_code, old_tier_status, new_tier_status
      FROM member_tier_grants WHERE member_id = ?
      ORDER BY created_at ASC, id ASC
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

function outboxRows(idempotencyKey: string): Array<Record<string, unknown>> {
  const db = openRO();
  try {
    return db.prepare(`
      SELECT id, recipient_email, recipient_member_id, subject, body_text
      FROM outbox_emails WHERE idempotency_key = ?
    `).all(idempotencyKey) as Array<Record<string, unknown>>;
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

describe('runBatchAutoLink — silent claim + notification + card surface', () => {
  it('high-confidence: silent claim writes linkage, tier grant, audit row, and notification email; no pending card', async () => {
    const db = new BetterSqlite3(dbPath);
    const email = `${nextId('high')}@example.com`;
    const legacyId = nextId('legmem-high');
    const personId = nextId('hp-high');
    const memberId = nextId('mem-high');
    insertLegacyMember(db, {
      legacy_member_id: legacyId, legacy_email: email,
      real_name: 'Alpha Bravo', display_name: 'Alpha Bravo',
    });
    insertHistoricalPerson(db, {
      person_id: personId, person_name: 'Alpha Bravo',
      legacy_member_id: legacyId,
    });
    insertMember(db, {
      id: memberId, slug: memberId.replace(/-/g, '_'),
      login_email: email, real_name: 'Alpha Bravo', display_name: 'Alpha Bravo',
    });
    db.close();

    await ops.operationsPlatformService.runBatchAutoLink();

    const mem = memberRow(memberId);
    expect(mem.legacy_member_id).toBe(legacyId);
    expect(mem.historical_person_id).toBe(personId);
    expect(mem.pending_auto_link_card_json).toBeNull();

    const lm = legacyRow(legacyId);
    expect(lm.claimed_by_member_id).toBe(memberId);

    const grants = tierGrants(memberId);
    expect(grants.length).toBeGreaterThanOrEqual(1);
    expect(grants[0].change_type).toBe('grant');
    expect(grants[0].reason_code).toBe('legacy.claim_tier_grant');

    const audits = auditRows(memberId, 'legacy.auto_link_silent_claim');
    expect(audits).toHaveLength(1);
    const meta = JSON.parse(String(audits[0].metadata_json)) as Record<string, unknown>;
    expect(meta.confidence).toBe('high');
    expect(meta.legacy_member_id).toBe(legacyId);
    expect(meta.transitive_hp_id).toBe(personId);

    const outbox = outboxRows(`auto_link_notification:${audits[0].id}`);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].recipient_email).toBe(email);
    expect(outbox[0].recipient_member_id).toBe(memberId);
    expect(String(outbox[0].subject)).toMatch(/IFPA/);
    expect(String(outbox[0].body_text)).toContain('Alpha Bravo');
    expect(String(outbox[0].body_text)).toContain('/auto-link/report-incorrect/');
  });

  it('medium-confidence: silent claim + notification + first-login pending card with all payload fields', async () => {
    const db = new BetterSqlite3(dbPath);
    // Seed a name variant pair so the classifier returns medium (variant match).
    db.prepare(`INSERT INTO name_variants (canonical_normalized, variant_normalized, source)
                VALUES (?, ?, 'admin_added')`).run('robert smith', 'bob smith');
    const email = `${nextId('med')}@example.com`;
    const legacyId = nextId('legmem-med');
    const personId = nextId('hp-med');
    const memberId = nextId('mem-med');
    insertLegacyMember(db, {
      legacy_member_id: legacyId, legacy_email: email,
      real_name: 'Robert Smith', display_name: 'Robert Smith',
    });
    insertHistoricalPerson(db, {
      person_id: personId, person_name: 'Robert Smith',
      legacy_member_id: legacyId,
    });
    insertMember(db, {
      id: memberId, slug: memberId.replace(/-/g, '_'),
      login_email: email, real_name: 'Bob Smith', display_name: 'Bob Smith',
    });
    db.close();

    await ops.operationsPlatformService.runBatchAutoLink();

    const mem = memberRow(memberId);
    expect(mem.legacy_member_id).toBe(legacyId);
    expect(mem.historical_person_id).toBe(personId);
    expect(mem.pending_auto_link_card_json).not.toBeNull();
    const cardPayload = JSON.parse(String(mem.pending_auto_link_card_json)) as Record<string, unknown>;
    expect(cardPayload.confidence).toBe('medium');
    expect(cardPayload.personId).toBe(personId);
    expect(cardPayload.legacyMemberId).toBe(legacyId);
    expect(cardPayload.legacyDisplayName).toBe('Robert Smith');
    expect(typeof cardPayload.claimAuditId).toBe('string');

    const audits = auditRows(memberId, 'legacy.auto_link_silent_claim');
    expect(audits).toHaveLength(1);
    const meta = JSON.parse(String(audits[0].metadata_json)) as Record<string, unknown>;
    expect(meta.confidence).toBe('medium');
    expect(meta.matched_variant_normalized).toBeTruthy();

    const outbox = outboxRows(`auto_link_notification:${audits[0].id}`);
    expect(outbox).toHaveLength(1);
  });

  it('low-confidence: routes to work_queue_items with admin-alerts fan-out', async () => {
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

    const email = `${nextId('low')}@example.com`;
    const legacyId = nextId('legmem-low');
    const personId = nextId('hp-low');
    const memberId = nextId('mem-low');
    insertLegacyMember(db, {
      legacy_member_id: legacyId, legacy_email: email,
      real_name: 'Charlie Delta',
    });
    insertHistoricalPerson(db, {
      person_id: personId, person_name: 'Echo Foxtrot',
      legacy_member_id: legacyId,
    });
    insertMember(db, {
      id: memberId, slug: memberId.replace(/-/g, '_'),
      login_email: email, real_name: 'Charlie Delta', display_name: 'Charlie Delta',
    });
    db.close();

    await ops.operationsPlatformService.runBatchAutoLink();

    // Low → no silent claim
    const mem = memberRow(memberId);
    expect(mem.legacy_member_id).toBeNull();
    expect(mem.historical_person_id).toBeNull();

    // Low → admin queue row
    expect(workQueueCount(memberId)).toBe(1);

    // Low → admin-alerts outbox row
    const adminOutbox = outboxRows(`admin-alerts:auto_link_match:${memberId}:${SUBSCRIBER_ID}`);
    expect(adminOutbox).toHaveLength(1);
    expect(String(adminOutbox[0].body_text)).toContain('auto_link_match');
    expect(String(adminOutbox[0].body_text)).toContain(memberId);
  });

  it('already-linked candidates are filtered at the candidate query (no claim, no email)', async () => {
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

    const audits = auditRows(memberId, 'legacy.auto_link_silent_claim');
    expect(audits).toHaveLength(0);
    expect(workQueueCount(memberId)).toBe(0);
  });

  it('idempotent: rerun does not double-claim, does not duplicate notification emails or work-queue rows', async () => {
    const db = new BetterSqlite3(dbPath);
    const email = `${nextId('idem')}@example.com`;
    const legacyId = nextId('legmem-idem');
    const personId = nextId('hp-idem');
    const memberId = nextId('mem-idem');
    insertLegacyMember(db, {
      legacy_member_id: legacyId, legacy_email: email,
      real_name: 'Idem Tester', display_name: 'Idem Tester',
    });
    insertHistoricalPerson(db, {
      person_id: personId, person_name: 'Idem Tester',
      legacy_member_id: legacyId,
    });
    insertMember(db, {
      id: memberId, slug: memberId.replace(/-/g, '_'),
      login_email: email, real_name: 'Idem Tester', display_name: 'Idem Tester',
    });
    db.close();

    await ops.operationsPlatformService.runBatchAutoLink();
    await ops.operationsPlatformService.runBatchAutoLink();

    const audits = auditRows(memberId, 'legacy.auto_link_silent_claim');
    expect(audits).toHaveLength(1);
    const outbox = outboxRows(`auto_link_notification:${audits[0].id}`);
    expect(outbox).toHaveLength(1);
  });

  it('writes a system_job_runs row tagged SYS_Batch_Auto_Link with the silent-claim counter struct', async () => {
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
      claimed_high:                     expect.any(Number),
      claimed_medium:                   expect.any(Number),
      queued_low:                       expect.any(Number),
      skipped_low_already_queued:       expect.any(Number),
      skipped_already_linked:           expect.any(Number),
      skipped_no_legacy_for_hp:         expect.any(Number),
      skipped_legacy_claimed_by_other:  expect.any(Number),
      skipped_no_email:                 expect.any(Number),
      skipped_none:                     expect.any(Number),
      skipped_error:                    expect.any(Number),
    });
  });
});
