/**
 * Integration tests for identityAccessService.revertAutoLink.
 *
 * Verifies the atomic revert contract:
 *   - reverts a confirmed claim by its claim-audit id: clears members.legacy_member_id,
 *     legacy_members.claimed_by_member_id + claimed_at; writes
 *     member_tier_grants revoke row; enqueues work_queue_items;
 *     writes audit_entries row carrying original_claim_audit_id.
 *   - conditionally clears members.historical_person_id: cleared when the
 *     HP's legacy_member_id matches the cleared linkage; preserved when
 *     the HP was a direct claim (HP.legacy_member_id is NULL or different).
 *   - idempotent: a second revert against an already-reverted link returns
 *     status='already_reverted' without changing state.
 *   - unrecognized member returns status='not_found' (anti-enumeration).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson } from '../fixtures/factories';

const { dbPath } = setTestEnv('3094');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/identityAccessService').identityAccessService;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  const mod = await import('../../src/services/identityAccessService');
  svc = mod.identityAccessService;
});

afterAll(() => cleanupTestDb(dbPath));

function open(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

function memberRow(id: string): Record<string, unknown> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(`SELECT * FROM members WHERE id = ?`).get(id) as Record<string, unknown>;
  db.close();
  return row;
}

function legacyMemberRow(id: string): Record<string, unknown> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(
    `SELECT * FROM legacy_members WHERE legacy_member_id = ?`,
  ).get(id) as Record<string, unknown>;
  db.close();
  return row;
}

function listTierGrants(memberId: string): Array<Record<string, unknown>> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db.prepare(
    `SELECT change_type, reason_code, old_tier_status, new_tier_status
       FROM member_tier_grants
      WHERE member_id = ?
      ORDER BY created_at ASC, id ASC`,
  ).all(memberId) as Array<Record<string, unknown>>;
  db.close();
  return rows;
}

function listWorkQueue(memberId: string): Array<Record<string, unknown>> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db.prepare(
    `SELECT task_type, status, reason_text
       FROM work_queue_items
      WHERE entity_type = 'member' AND entity_id = ?
      ORDER BY created_at ASC, id ASC`,
  ).all(memberId) as Array<Record<string, unknown>>;
  db.close();
  return rows;
}

function listAuditEntries(memberId: string, actionType: string): Array<Record<string, unknown>> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db.prepare(
    `SELECT action_type, metadata_json
       FROM audit_entries
      WHERE entity_type = 'member'
        AND entity_id = ?
        AND action_type = ?
      ORDER BY created_at ASC, id ASC`,
  ).all(memberId, actionType) as Array<Record<string, unknown>>;
  db.close();
  return rows;
}

let _seq = 0;
function nextId(prefix: string): string {
  _seq += 1;
  return `${prefix}-revert-${_seq.toString().padStart(4, '0')}`;
}

interface ClaimedFixture {
  memberId: string;
  legacyId: string;
  hpId?: string;
}

function setupClaimed(opts: { withHpBackLink: boolean; hpHasMatchingLegacyId?: boolean } = { withHpBackLink: true }): ClaimedFixture {
  const memberId = nextId('mem');
  const legacyId = nextId('legmem');

  const db = open();
  insertMember(db, { id: memberId, login_email: `${memberId}@example.com` });
  insertLegacyMember(db, { legacy_member_id: legacyId, real_name: 'X Player' });

  let hpId: string | undefined;
  if (opts.withHpBackLink) {
    hpId = nextId('hp');
    const hpLegacyId = opts.hpHasMatchingLegacyId === false ? nextId('other-legmem') : legacyId;
    insertHistoricalPerson(db, {
      person_id: hpId,
      person_name: 'X Player',
      legacy_member_id: hpLegacyId,
    });
  }
  db.close();

  // Use the real claim path to set up state, so the revert exercises a
  // realistic post-claim member shape (linkage + tier grant + audit row).
  svc.claimLegacyAccount(memberId, legacyId);

  if (opts.withHpBackLink && opts.hpHasMatchingLegacyId === false) {
    // Override: replace the HP-back-link the claim set with a manual HP
    // whose legacy_member_id does NOT match. This simulates a member who
    // earlier did a direct-HP claim, then later auto-link claimed legacy.
    const db2 = open();
    db2.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(hpId!, memberId);
    db2.close();
  }

  return { memberId, legacyId, hpId };
}

describe('identityAccessService.revertAutoLink', () => {
  it('reverts state cleanly when member has a claim and HP back-link', () => {
    const { memberId, legacyId } = setupClaimed({ withHpBackLink: true });

    // Pre-condition checks: linkage is set, tier grant present.
    const before = memberRow(memberId);
    expect(before.legacy_member_id).toBe(legacyId);
    expect(before.historical_person_id).not.toBeNull();

    const result = svc.revertAutoLink(memberId, 'audit-original-1', {
      actorType: 'member',
      actorMemberId: memberId,
    });
    expect(result.status).toBe('reverted');

    const after = memberRow(memberId);
    expect(after.legacy_member_id).toBeNull();
    expect(after.historical_person_id).toBeNull();

    const lm = legacyMemberRow(legacyId);
    expect(lm.claimed_by_member_id).toBeNull();
    expect(lm.claimed_at).toBeNull();

    const grants = listTierGrants(memberId);
    expect(grants.length).toBeGreaterThanOrEqual(2);
    const revoke = grants[grants.length - 1];
    expect(revoke.change_type).toBe('revoke');
    expect(revoke.reason_code).toBe('legacy.auto_link_reported_incorrect');
    expect(revoke.new_tier_status).toBe('tier0');

    const workQueueRows = listWorkQueue(memberId);
    const reviewRow = workQueueRows.find(r => r.task_type === 'auto_link_revert_review');
    expect(reviewRow).toBeDefined();
    expect(reviewRow!.status).toBe('open');
    expect(String(reviewRow!.reason_text)).toContain('audit-original-1');

    const audits = listAuditEntries(memberId, 'legacy.auto_link_revert');
    expect(audits).toHaveLength(1);
    const meta = JSON.parse(String(audits[0].metadata_json)) as Record<string, unknown>;
    expect(meta.original_claim_audit_id).toBe('audit-original-1');
    expect(meta.legacy_member_id).toBe(legacyId);
    expect(meta.cleared_historical_person_id).toBe(true);
  });

  it('preserves historical_person_id when HP back-link is a direct claim (no matching legacy_member_id)', () => {
    const { memberId, legacyId, hpId } = setupClaimed({
      withHpBackLink: true,
      hpHasMatchingLegacyId: false,
    });

    expect(memberRow(memberId).historical_person_id).toBe(hpId);

    const result = svc.revertAutoLink(memberId, 'audit-original-direct', {
      actorType: 'member',
      actorMemberId: memberId,
    });
    expect(result.status).toBe('reverted');

    const after = memberRow(memberId);
    expect(after.legacy_member_id).toBeNull();
    expect(after.historical_person_id).toBe(hpId);

    const audits = listAuditEntries(memberId, 'legacy.auto_link_revert');
    const meta = JSON.parse(String(audits[0].metadata_json)) as Record<string, unknown>;
    expect(meta.cleared_historical_person_id).toBe(false);

    const lm = legacyMemberRow(legacyId);
    expect(lm.claimed_by_member_id).toBeNull();
  });

  it('returns already_reverted on second call against same member', () => {
    const { memberId } = setupClaimed({ withHpBackLink: true });

    const first = svc.revertAutoLink(memberId, 'audit-1', {
      actorType: 'member',
      actorMemberId: memberId,
    });
    expect(first.status).toBe('reverted');

    const second = svc.revertAutoLink(memberId, 'audit-1', {
      actorType: 'member',
      actorMemberId: memberId,
    });
    expect(second.status).toBe('already_reverted');

    const audits = listAuditEntries(memberId, 'legacy.auto_link_revert');
    expect(audits).toHaveLength(1);
  });

  it('returns not_found for an unknown memberId (anti-enumeration)', () => {
    const result = svc.revertAutoLink('does-not-exist', 'audit-x', {
      actorType: 'member',
      actorMemberId: 'does-not-exist',
    });
    expect(result.status).toBe('not_found');
  });
});

describe('identityAccessService.revertClaimForDispute (queue-item binding)', () => {
  const ADMIN_ID = 'admin-dispute-revert';
  let adminSeeded = false;

  function seedAdmin(): void {
    if (adminSeeded) return;
    const db = open();
    insertMember(db, { id: ADMIN_ID, login_email: `${ADMIN_ID}@example.com`, is_admin: 1 });
    db.close();
    adminSeeded = true;
  }

  function insertQueueItem(opts: { entityId: string; isDispute: boolean }): string {
    const id = nextId('wq');
    const now = '2026-01-01T00:00:00.000Z';
    const payload = JSON.stringify({
      statement: 'That record is mine, not theirs.',
      claimed_legacy_username: null,
      claimed_legacy_email: null,
      vouchers: null,
      is_dispute: opts.isDispute,
    });
    const db = open();
    db.prepare(`
      INSERT INTO work_queue_items (
        id, created_at, created_by, updated_at, updated_by, version,
        queue_category, task_type, entity_type, entity_id,
        status, priority, opened_at, reason_text
      ) VALUES (?, ?, 'system', ?, 'system', 1,
        'membership', 'member_link_help_request', 'member', ?,
        'open', 5, ?, ?)
    `).run(id, now, now, opts.entityId, now, payload);
    db.close();
    return id;
  }

  it('refuses a revert not bound to any open help-request queue item', () => {
    seedAdmin();
    const { memberId } = setupClaimed({ withHpBackLink: false });
    expect(() =>
      svc.revertClaimForDispute(ADMIN_ID, 'wq-does-not-exist', memberId, 'forged dispute'),
    ).toThrow(/not found or already resolved/i);
    // The holder's claim must be untouched.
    expect(memberRow(memberId).legacy_member_id).not.toBeNull();
  });

  it('refuses a revert bound to an open help-request item that is not a dispute', () => {
    seedAdmin();
    const { memberId } = setupClaimed({ withHpBackLink: false });
    const requesterId = nextId('req');
    const db = open();
    insertMember(db, { id: requesterId, login_email: `${requesterId}@example.com` });
    db.close();
    const itemId = insertQueueItem({ entityId: requesterId, isDispute: false });
    expect(() =>
      svc.revertClaimForDispute(ADMIN_ID, itemId, memberId, 'not actually disputed'),
    ).toThrow(/not a conflict dispute/i);
    expect(memberRow(memberId).legacy_member_id).not.toBeNull();
  });

  it('reverts when bound to an open dispute item and records the queue-item id in both forensic audit rows', () => {
    seedAdmin();
    const { memberId, legacyId } = setupClaimed({ withHpBackLink: false });
    const requesterId = nextId('req');
    const db = open();
    insertMember(db, { id: requesterId, login_email: `${requesterId}@example.com` });
    db.close();
    const itemId = insertQueueItem({ entityId: requesterId, isDispute: true });

    const result = svc.revertClaimForDispute(ADMIN_ID, itemId, memberId, 'dispute upheld');
    expect(result.status).toBe('reverted');

    expect(memberRow(memberId).legacy_member_id).toBeNull();
    expect(legacyMemberRow(legacyId).claimed_by_member_id).toBeNull();

    for (const actionType of ['claim.dispute_opened', 'claim.revert_applied']) {
      const rows = listAuditEntries(memberId, actionType);
      expect(rows).toHaveLength(1);
      const meta = JSON.parse(String(rows[0].metadata_json)) as Record<string, unknown>;
      expect(meta.work_queue_item_id).toBe(itemId);
    }
  });
});
