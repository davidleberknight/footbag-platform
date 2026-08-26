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

// A fixed stamp for seeded task rows; nothing under test compares against it.
const SEEDED_AT = '2026-01-01T00:00:00.000Z';

/**
 * Put the member's personal-details task into the completed state the revert
 * cases start from. The task row already exists by this point, created when the
 * member's onboarding list was started, so this moves it rather than making a
 * second one.
 */
function markPersonalDetailsCompleted(db: BetterSqlite3.Database, memberId: string): void {
  db.prepare(`
    UPDATE member_onboarding_tasks
       SET state = 'completed', completed_at = ?, updated_at = ?
     WHERE member_id = ? AND task_type = 'personal_details'
  `).run(SEEDED_AT, SEEDED_AT, memberId);
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

  it('decides each honor separately: an administrator grant survives while the claimed honor drops', () => {
    // The case a single combined decision gets wrong in both directions. The
    // member holds Big Add Posse because an administrator granted it, and Hall
    // of Fame only because of the legacy account now being reverted. One
    // decision covering both either strands the Hall of Fame flag on a member
    // who no longer holds it, or strips a grant that had nothing to do with the
    // claim.
    const memberId = nextId('mem');
    const legacyId = nextId('legmem');

    const db = open();
    insertMember(db, { id: memberId, login_email: `${memberId}@example.com`, real_name: 'Split Honors' });
    insertLegacyMember(db, { legacy_member_id: legacyId, real_name: 'Split Honors', is_hof: 1 });
    db.prepare('UPDATE members SET legacy_member_id = ?, is_hof = 1, is_bap = 1, bap_inducted_year = 2021 WHERE id = ?')
      .run(legacyId, memberId);
    db.prepare("UPDATE legacy_members SET claimed_by_member_id = ?, claimed_at = '2026-01-01T00:00:00.000Z' WHERE legacy_member_id = ?")
      .run(memberId, legacyId);
    // The administrator's own Big Add Posse grant, which stands on its own
    // ledger row rather than on the claim.
    db.prepare(`
      INSERT INTO member_tier_grants (
        id, created_at, created_by, member_id, actor_member_id, change_type,
        old_tier_status, new_tier_status, reason_code, reason_text
      ) VALUES (?, '2026-02-01T00:00:00.000Z', 'seed', ?, ?, 'grant',
                'tier0', 'tier2', 'honor.bap_tier2_grant', 'Big Add Posse induction, 2021')
    `).run(nextId('mtg'), memberId, memberId);
    db.close();

    const result = svc.revertAutoLink(memberId, 'audit-split-honors', {
      actorType: 'member',
      actorMemberId: memberId,
    });
    expect(result.status).toBe('reverted');

    const after = memberRow(memberId);
    expect(after.is_hof).toBe(0);                 // came from the reverted claim
    expect(after.is_bap).toBe(1);                 // the administrator's grant stands
    expect(after.bap_inducted_year).toBe(2021);   // and keeps its year

    const audits = listAuditEntries(memberId, 'legacy.auto_link_revert');
    const meta = JSON.parse(String(audits[audits.length - 1].metadata_json)) as Record<string, unknown>;
    expect(meta.cleared_derived_hof).toBe(true);
    expect(meta.cleared_derived_bap).toBe(false);
  });

  it('clears honor flags when the surviving historical-person link does not itself carry the honor', () => {
    const memberId = nextId('mem');
    const legacyId = nextId('legmem');
    const hpId = nextId('hp');

    const db = open();
    insertMember(db, { id: memberId, login_email: `${memberId}@example.com`, real_name: 'Cased Player' });
    // The honor comes from the legacy account being reverted.
    insertLegacyMember(db, { legacy_member_id: legacyId, real_name: 'Cased Player', is_hof: 1 });
    // An unrelated historical person claimed alongside the legacy account, with
    // no honor of its own: it survives the revert but must not keep the flag.
    insertHistoricalPerson(db, {
      person_id: hpId, person_name: 'Cased Player', legacy_member_id: null,
      hof_member: 0, bap_member: 0,
    });
    db.prepare('UPDATE members SET legacy_member_id = ?, historical_person_id = ?, is_hof = 1 WHERE id = ?')
      .run(legacyId, hpId, memberId);
    db.prepare("UPDATE legacy_members SET claimed_by_member_id = ?, claimed_at = '2026-01-01T00:00:00.000Z' WHERE legacy_member_id = ?")
      .run(memberId, legacyId);
    db.close();

    const result = svc.revertAutoLink(memberId, 'audit-strand-hof', {
      actorType: 'member',
      actorMemberId: memberId,
    });
    expect(result.status).toBe('reverted');

    const after = memberRow(memberId);
    expect(after.legacy_member_id).toBeNull();      // legacy claim reverted
    expect(after.historical_person_id).toBe(hpId);  // unrelated HP link preserved
    expect(after.is_hof).toBe(0);                   // baseless honor dropped

    const audits = listAuditEntries(memberId, 'legacy.auto_link_revert');
    const meta = JSON.parse(String(audits[audits.length - 1].metadata_json)) as Record<string, unknown>;
    expect(meta.cleared_derived_honors).toBe(true);
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

  function insertQueueItem(opts: {
    entityId: string;
    isDispute: boolean;
    /** The records the dispute names. The service refuses a revert on any
     *  record outside these lists, so a test reverting a record must name it. */
    disputedLegacyMemberIds?: string[];
    disputedHistoricalPersonIds?: string[];
    /** Who held each named record when the dispute was filed. The revert also
     *  refuses a record whose holder has changed since, so a test reverting a
     *  record must say who it was filed against. */
    disputedRecordHolders?: Record<string, string>;
  }): string {
    const id = nextId('wq');
    const now = '2026-01-01T00:00:00.000Z';
    const payload = JSON.stringify({
      statement: 'That record is mine, not theirs.',
      is_dispute: opts.isDispute,
      disputed_legacy_member_ids: opts.disputedLegacyMemberIds ?? [],
      disputed_historical_person_ids: opts.disputedHistoricalPersonIds ?? [],
    });
    const db = open();
    // Default to whoever holds each named record right now, which is what a
    // real filing records. A test can override to model a record that changed
    // hands after the dispute was filed.
    const holders: Record<string, string> = opts.disputedRecordHolders ?? {};
    if (!opts.disputedRecordHolders) {
      for (const legacyMemberId of opts.disputedLegacyMemberIds ?? []) {
        const row = db.prepare('SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?')
          .get(legacyMemberId) as { claimed_by_member_id: string | null } | undefined;
        if (row?.claimed_by_member_id) holders[legacyMemberId] = row.claimed_by_member_id;
      }
      for (const personId of opts.disputedHistoricalPersonIds ?? []) {
        const row = db.prepare('SELECT id FROM members WHERE historical_person_id = ?')
          .get(personId) as { id: string } | undefined;
        if (row?.id) holders[personId] = row.id;
      }
    }
    const payloadWithHolders = JSON.stringify({
      ...JSON.parse(payload) as Record<string, unknown>,
      disputed_record_holders: holders,
    });
    db.prepare(`
      INSERT INTO work_queue_items (
        id, created_at, created_by, updated_at, updated_by, version,
        queue_category, task_type, entity_type, entity_id,
        status, priority, opened_at, reason_text
      ) VALUES (?, ?, 'system', ?, 'system', 1,
        'membership', 'member_link_help_request', 'member', ?,
        'open', 5, ?, ?)
    `).run(id, now, now, opts.entityId, now, payloadWithHolders);
    db.close();
    return id;
  }

  it('refuses a revert not bound to any open help-request queue item', () => {
    seedAdmin();
    const { memberId, legacyId } = setupClaimed({ withHpBackLink: false });
    expect(() =>
      svc.revertClaimForDispute(ADMIN_ID, 'wq-does-not-exist', { legacyMemberId: legacyId }, 'forged dispute'),
    ).toThrow(/not found or already resolved/i);
    // The holder's claim must be untouched.
    expect(memberRow(memberId).legacy_member_id).not.toBeNull();
  });

  it('refuses a revert bound to an open help-request item that is not a dispute', () => {
    seedAdmin();
    const { memberId, legacyId } = setupClaimed({ withHpBackLink: false });
    const requesterId = nextId('req');
    const db = open();
    insertMember(db, { id: requesterId, login_email: `${requesterId}@example.com` });
    db.close();
    const itemId = insertQueueItem({ entityId: requesterId, isDispute: false });
    expect(() =>
      svc.revertClaimForDispute(ADMIN_ID, itemId, { legacyMemberId: legacyId }, 'not actually disputed'),
    ).toThrow(/not a conflict dispute/i);
    expect(memberRow(memberId).legacy_member_id).not.toBeNull();
  });

  // Once one dispute is upheld and its filer is linked onto the record, a second
  // dispute still naming that record would otherwise strip the freshly vetted
  // holder, who has no relationship to the second grievance. The dispute is
  // bound to the holder it was filed against, not to the record alone.
  it('refuses a dispute whose named record has changed hands since it was filed', () => {
    seedAdmin();
    const { memberId, legacyId } = setupClaimed({ withHpBackLink: false });
    const requesterId = nextId('req');
    const db = open();
    insertMember(db, { id: requesterId, login_email: `${requesterId}@example.com` });
    db.close();
    const itemId = insertQueueItem({
      entityId: requesterId, isDispute: true,
      disputedLegacyMemberIds: [legacyId],
      disputedRecordHolders: { [legacyId]: 'a-different-member' },
    });

    expect(() =>
      svc.revertClaimForDispute(ADMIN_ID, itemId, { legacyMemberId: legacyId }, 'stale dispute'),
    ).toThrow(/no longer held by the member this dispute was filed against/i);
    expect(memberRow(memberId).legacy_member_id).toBe(legacyId);
    expect(listAuditEntries(memberId, 'claim.revert_applied')).toHaveLength(0);
  });

  it('reverts when bound to an open dispute item and records the queue-item id in both forensic audit rows', () => {
    seedAdmin();
    const { memberId, legacyId } = setupClaimed({ withHpBackLink: false });
    const requesterId = nextId('req');
    const db = open();
    insertMember(db, { id: requesterId, login_email: `${requesterId}@example.com` });
    db.close();
    const itemId = insertQueueItem({
      entityId: requesterId, isDispute: true, disputedLegacyMemberIds: [legacyId],
    });

    const result = svc.revertClaimForDispute(ADMIN_ID, itemId, { legacyMemberId: legacyId }, 'dispute upheld');
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

  it('refuses a record the dispute does not name, leaving that holder untouched', () => {
    seedAdmin();
    // Two unrelated holders. The dispute names only the first one's record;
    // deriving the holder from the record does NOT on its own stop an admin
    // naming the second, which is what this asserts.
    const disputed = setupClaimed({ withHpBackLink: false });
    const bystander = setupClaimed({ withHpBackLink: false });
    const requesterId = nextId('req');
    const db = open();
    insertMember(db, { id: requesterId, login_email: `${requesterId}@example.com` });
    db.close();
    const itemId = insertQueueItem({
      entityId: requesterId, isDispute: true, disputedLegacyMemberIds: [disputed.legacyId],
    });

    expect(() =>
      svc.revertClaimForDispute(
        ADMIN_ID, itemId, { legacyMemberId: bystander.legacyId }, 'dispute upheld',
      ),
    ).toThrow(/not one of the records this dispute is about/i);

    expect(memberRow(bystander.memberId).legacy_member_id).toBe(bystander.legacyId);
    expect(legacyMemberRow(bystander.legacyId).claimed_by_member_id).toBe(bystander.memberId);
    expect(listAuditEntries(bystander.memberId, 'claim.revert_applied')).toHaveLength(0);
  });

  it('refuses every record on a dispute filed before the records were bound', () => {
    seedAdmin();
    const { memberId, legacyId } = setupClaimed({ withHpBackLink: false });
    const requesterId = nextId('req');
    const db = open();
    insertMember(db, { id: requesterId, login_email: `${requesterId}@example.com` });
    db.close();
    // No disputed-record lists at all: the shape of an item filed before the
    // binding existed. It must fail closed rather than fall back to the
    // unbounded behaviour the binding replaced.
    const itemId = insertQueueItem({ entityId: requesterId, isDispute: true });

    expect(() =>
      svc.revertClaimForDispute(ADMIN_ID, itemId, { legacyMemberId: legacyId }, 'dispute upheld'),
    ).toThrow(/not one of the records this dispute is about/i);
    expect(memberRow(memberId).legacy_member_id).toBe(legacyId);
  });

  it('scrubs copied legacy PII on dispute revert but preserves member-entered fields and honors', () => {
    seedAdmin();
    const memberId = nextId('mem');
    const legacyId = nextId('legmem');

    // The member left bio/region/birth_date/address empty (so the claim
    // copies them) while city='Testville' and country='US' are the member's
    // own values (so the claim's fill-if-empty leaves them, and the revert
    // must not clear them). Region and country are explicit because the
    // factory otherwise seeds a full legal location.
    const db = open();
    insertMember(db, {
      id: memberId, login_email: `${memberId}@example.com`, real_name: 'PII Player',
      region: null, country: 'US',
    });
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
    expect(claimed.region).toBe('ON');                 // copied
    expect(claimed.city).toBe('Testville');            // member value kept
    expect(claimed.country).toBe('US');                // member value kept
    expect(claimed.is_hof).toBe(1);
    // The claim no longer copies the address columns: nothing reads them off a
    // member row, so they stay in the archival snapshot instead.
    expect(claimed.street_address).toBeNull();
    expect(claimed.postal_code).toBeNull();

    // A row claimed before that change still carries both, and the revert must
    // still clear them, so the scrub is exercised against a row that has them.
    const dbSeed = open();
    dbSeed.prepare('UPDATE members SET street_address = ?, postal_code = ? WHERE id = ?')
      .run('1 Old Road', 'A1B2C3', memberId);
    dbSeed.close();

    const requesterId = nextId('req');
    const db2 = open();
    insertMember(db2, { id: requesterId, login_email: `${requesterId}@example.com` });
    db2.close();
    const itemId = insertQueueItem({
      entityId: requesterId, isDispute: true, disputedLegacyMemberIds: [legacyId],
    });

    const result = svc.revertClaimForDispute(ADMIN_ID, itemId, { legacyMemberId: legacyId }, 'dispute upheld');
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

  // The scrub clears every field still matching what the claim copied in, and
  // the personal-details step requires city, country and date of birth. A
  // member left short of one of those is a full member on paper carrying an
  // incomplete row, which the Official IFPA Roster shows as a blank cell, so
  // the step goes back in front of them rather than staying silently
  // completed.
  it('re-opens the personal-details step when the scrub clears a field that step requires', () => {
    const { memberId, legacyId } = setupClaimed({ withHpBackLink: false });

    const db = open();
    // The member typed the same city as their linked record, so the scrub's
    // equality test will clear it, and the step is complete before the revert.
    const legacyCity = db
      .prepare('SELECT city FROM legacy_members WHERE legacy_member_id = ?')
      .get(legacyId) as { city: string | null };
    db.prepare('UPDATE members SET city = ?, country = ?, birth_date = ? WHERE id = ?')
      .run(legacyCity.city, 'United States', '1990-01-01', memberId);
    markPersonalDetailsCompleted(db, memberId);
    db.close();

    svc.revertAutoLink(memberId, 'audit-reopen-1', {
      actorType: 'member',
      actorMemberId: memberId,
    });

    const db2 = open();
    const task = db2
      .prepare('SELECT state, completed_at FROM member_onboarding_tasks WHERE member_id = ? AND task_type = ?')
      .get(memberId, 'personal_details') as { state: string; completed_at: string | null };
    const after = db2.prepare('SELECT city FROM members WHERE id = ?').get(memberId) as { city: string | null };
    db2.close();

    expect(after.city).toBeNull();
    expect(task.state).toBe('pending');
    expect(task.completed_at).toBeNull();
  });

  it('leaves the personal-details step completed when the member keeps every required field', () => {
    const { memberId } = setupClaimed({ withHpBackLink: false });

    const db = open();
    // A city the member entered themselves, different from the linked record's,
    // so the scrub's equality test leaves it in place.
    db.prepare('UPDATE members SET city = ?, country = ?, birth_date = ? WHERE id = ?')
      .run('Somewhere Else', 'United States', '1990-01-01', memberId);
    markPersonalDetailsCompleted(db, memberId);
    db.close();

    svc.revertAutoLink(memberId, 'audit-reopen-2', {
      actorType: 'member',
      actorMemberId: memberId,
    });

    const db2 = open();
    const task = db2
      .prepare('SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = ?')
      .get(memberId, 'personal_details') as { state: string };
    db2.close();

    expect(task.state).toBe('completed');
  });
});
