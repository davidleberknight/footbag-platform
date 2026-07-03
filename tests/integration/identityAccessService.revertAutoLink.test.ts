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

    // The revert deliberately creates no admin work-queue task: the audit row
    // below is its durable trail, and admins review claims on demand rather than
    // per revert.
    const workQueueRows = listWorkQueue(memberId);
    expect(workQueueRows.find(r => r.task_type === 'auto_link_revert_review')).toBeUndefined();

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

  it('preserves honor flags when a separate historical-person link survives the revert', () => {
    const memberId = nextId('mem');
    const legacyId = nextId('legmem');
    const hpId = nextId('hp');

    const db = open();
    insertMember(db, { id: memberId, login_email: `${memberId}@example.com`, real_name: 'Honored Player' });
    insertLegacyMember(db, { legacy_member_id: legacyId, real_name: 'Honored Player' });
    // A direct-HP link to an honored record NOT tied to the legacy row: it must
    // outlive the legacy-claim revert and keep backing the member's honor.
    insertHistoricalPerson(db, {
      person_id: hpId, person_name: 'Honored Player', legacy_member_id: null, hof_member: 1,
    });
    // The member holds both a legacy claim and the surviving honored HP link.
    db.prepare('UPDATE members SET legacy_member_id = ?, historical_person_id = ?, is_hof = 1 WHERE id = ?')
      .run(legacyId, hpId, memberId);
    db.prepare("UPDATE legacy_members SET claimed_by_member_id = ?, claimed_at = '2026-01-01T00:00:00.000Z' WHERE legacy_member_id = ?")
      .run(memberId, legacyId);
    db.close();

    const result = svc.revertAutoLink(memberId, 'audit-preserve-hof', {
      actorType: 'member',
      actorMemberId: memberId,
    });
    expect(result.status).toBe('reverted');

    const after = memberRow(memberId);
    expect(after.legacy_member_id).toBeNull();      // legacy claim reverted
    expect(after.historical_person_id).toBe(hpId);  // direct-HP link preserved
    expect(after.is_hof).toBe(1);                   // honor from the surviving HP kept

    const audits = listAuditEntries(memberId, 'legacy.auto_link_revert');
    const meta = JSON.parse(String(audits[audits.length - 1].metadata_json)) as Record<string, unknown>;
    expect(meta.cleared_derived_honors).toBe(false);
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

  it('scrubs copied legacy PII on dispute revert but preserves member-entered fields and honors', () => {
    seedAdmin();
    const memberId = nextId('mem');
    const legacyId = nextId('legmem');

    // Member defaults leave bio/region/birth_date/address empty (so the claim
    // copies them) but city='Testville' and country='US' are the member's own
    // values (so the claim's fill-if-empty leaves them, and the revert must
    // not clear them).
    const db = open();
    insertMember(db, { id: memberId, login_email: `${memberId}@example.com`, real_name: 'PII Player' });
    insertLegacyMember(db, {
      legacy_member_id: legacyId,
      real_name: 'PII Player',
      legacy_user_id: 'legacy-user-pii',
      legacy_email: 'pii@oldsite.test',
      bio: 'legacy bio text',
      birth_date: '1980-05-15',
      street_address: '1 Old Road',
      postal_code: 'A1B2C3',
      city: 'Oldtown',
      region: 'ON',
      country: 'CA',
      ifpa_join_date: '2001-01-01',
      first_competition_year: 1999,
      is_hof: 1,
      is_bap: 1,
    });
    db.close();

    // Real claim path fills the empty member fields from the legacy row.
    svc.claimLegacyAccount(memberId, legacyId);
    const claimed = memberRow(memberId);
    expect(claimed.bio).toBe('legacy bio text');       // copied (was empty)
    expect(claimed.birth_date).toBe('1980-05-15');     // copied
    expect(claimed.street_address).toBe('1 Old Road'); // copied
    expect(claimed.region).toBe('ON');                 // copied
    expect(claimed.city).toBe('Testville');            // member value kept
    expect(claimed.country).toBe('US');                // member value kept
    expect(claimed.is_hof).toBe(1);

    const requesterId = nextId('req');
    const db2 = open();
    insertMember(db2, { id: requesterId, login_email: `${requesterId}@example.com` });
    db2.close();
    const itemId = insertQueueItem({ entityId: requesterId, isDispute: true });

    const result = svc.revertClaimForDispute(ADMIN_ID, itemId, memberId, 'dispute upheld');
    expect(result.status).toBe('reverted');

    const after = memberRow(memberId);
    // Copied legacy PII is scrubbed.
    expect(after.legacy_member_id).toBeNull();
    expect(after.legacy_user_id).toBeNull();
    expect(after.legacy_email).toBeNull();
    expect(after.bio).toBe('');
    expect(after.birth_date).toBeNull();
    expect(after.street_address).toBeNull();
    expect(after.postal_code).toBeNull();
    expect(after.region).toBeNull();
    expect(after.ifpa_join_date).toBeNull();
    expect(after.first_competition_year).toBeNull();
    // Member-entered values survive.
    expect(after.city).toBe('Testville');
    expect(after.country).toBe('US');
    // Honor flags came from the reverted claim (no other honored link remains),
    // so they are dropped -- the disputed record's HoF/BAP status must not
    // linger on this member (and keep their profile publicly visible).
    expect(after.is_hof).toBe(0);
    expect(after.is_bap).toBe(0);

    const audits = listAuditEntries(memberId, 'legacy.auto_link_revert');
    const meta = JSON.parse(String(audits[audits.length - 1].metadata_json)) as Record<string, unknown>;
    expect(meta.scrubbed_legacy_fields).toBe(true);
    expect(meta.cleared_derived_honors).toBe(true);
  });
});
