/**
 * Integration tests for the HP-field carry-forward path in
 * identityAccessService.claimLegacyAccount.
 *
 * When a legacy claim back-links to a historical_persons row, the
 * authoritative honor and country data lives on the HP, not on
 * legacy_members. The claim transaction must merge HP fields onto the
 * member row so search / hero / profile surfaces reflect the HP's
 * country, HoF/BAP status, and induction years.
 *
 * Coverage:
 *   - HP-only source: member.country is empty, legacy.country is null,
 *     HP.country='New Zealand' → member.country='New Zealand'.
 *   - HP honor flags propagate: HP.hof_member=1 OR'd onto member.is_hof.
 *   - HP induction year propagates to member.hof_inducted_year.
 *   - HP first_year fills member.first_competition_year when null.
 *   - Fill-if-empty: member already has country set → HP does not overwrite.
 *   - OR semantics: legacy.is_hof=1 wins even if HP.hof_member=0.
 *   - No HP linked: claim is idempotent for the member's HP-derived fields.
 *   - Re-running a claim against an already-claimed legacy row throws (no
 *     double-merge possible).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson } from '../fixtures/factories';

const { dbPath } = setTestEnv('3092');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/identityAccessService').identityAccessService;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  const mod = await import('../../src/services/identityAccessService');
  svc = mod.identityAccessService;
});

afterAll(() => cleanupTestDb(dbPath));

function memberRow(id: string): Record<string, unknown> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(`SELECT * FROM members WHERE id = ?`).get(id) as Record<string, unknown>;
  db.close();
  return row;
}

let _seq = 0;
function nextId(prefix: string): string {
  _seq += 1;
  return `${prefix}-${_seq.toString().padStart(4, '0')}`;
}

interface ScenarioFixture {
  memberId: string;
  legacyId: string;
  hpId: string;
}

interface ScenarioOpts {
  memberCountry?: string | null;
  memberIsHof?: 0 | 1;
  memberIsBap?: 0 | 1;
  memberHofInductedYear?: number | null;
  memberFirstCompYear?: number | null;
  legacyCountry?: string | null;
  legacyIsHof?: 0 | 1;
  legacyIsBap?: 0 | 1;
  hpCountry?: string | null;
  hpHofMember?: 0 | 1;
  hpBapMember?: 0 | 1;
  hpHofInductionYear?: number | null;
  hpFirstYear?: number | null;
}

function setupScenario(opts: ScenarioOpts): ScenarioFixture {
  const memberId = nextId('mem');
  const legacyId = nextId('legmem');
  const hpId     = nextId('hp');

  const db = new BetterSqlite3(dbPath);
  insertMember(db, {
    id: memberId,
    slug: `slug_${memberId}`,
    login_email: `${memberId}@example.com`,
    country: opts.memberCountry === undefined ? null : opts.memberCountry,
    is_hof: opts.memberIsHof ?? 0,
    is_bap: opts.memberIsBap ?? 0,
    first_competition_year: opts.memberFirstCompYear ?? null,
  });
  if (opts.memberHofInductedYear !== undefined) {
    db.prepare('UPDATE members SET hof_inducted_year = ? WHERE id = ?')
      .run(opts.memberHofInductedYear, memberId);
  }

  insertHistoricalPerson(db, {
    person_id: hpId,
    person_name: 'Test HP',
    legacy_member_id: legacyId,
    country: opts.hpCountry === undefined ? 'US' : opts.hpCountry,
    hof_member: opts.hpHofMember ?? 0,
    bap_member: opts.hpBapMember ?? 0,
    hof_induction_year: opts.hpHofInductionYear ?? null,
    first_year: opts.hpFirstYear ?? null,
  });
  // The HP factory auto-creates a stub legacy_members row when given
  // legacy_member_id; reset that row to the test's exact values.
  db.prepare(`
    UPDATE legacy_members
    SET country = ?, is_hof = ?, is_bap = ?
    WHERE legacy_member_id = ?
  `).run(
    opts.legacyCountry === undefined ? null : opts.legacyCountry,
    opts.legacyIsHof ?? 0,
    opts.legacyIsBap ?? 0,
    legacyId,
  );
  db.close();

  return { memberId, legacyId, hpId };
}

describe('claimLegacyAccount — HP-field carry-forward', () => {
  it('HP.country fills member.country when both member and legacy are empty', () => {
    const { memberId, legacyId } = setupScenario({
      memberCountry: null,
      legacyCountry: null,
      hpCountry: 'New Zealand',
    });

    svc.claimLegacyAccount(memberId, legacyId);

    expect(memberRow(memberId).country).toBe('New Zealand');
  });

  it('HP.hof_member=1 propagates to member.is_hof when legacy.is_hof=0', () => {
    const { memberId, legacyId } = setupScenario({
      memberIsHof: 0,
      legacyIsHof: 0,
      hpHofMember: 1,
    });

    svc.claimLegacyAccount(memberId, legacyId);

    expect(memberRow(memberId).is_hof).toBe(1);
  });

  it('HP.bap_member=1 propagates to member.is_bap', () => {
    const { memberId, legacyId } = setupScenario({
      memberIsBap: 0,
      legacyIsBap: 0,
      hpBapMember: 1,
    });

    svc.claimLegacyAccount(memberId, legacyId);

    expect(memberRow(memberId).is_bap).toBe(1);
  });

  it('HP.hof_induction_year propagates to member.hof_inducted_year (denormalized for hero partial)', () => {
    const { memberId, legacyId } = setupScenario({
      hpHofMember: 1,
      hpHofInductionYear: 2010,
    });

    svc.claimLegacyAccount(memberId, legacyId);

    expect(memberRow(memberId).hof_inducted_year).toBe(2010);
  });

  it('HP.first_year fills member.first_competition_year when null', () => {
    const { memberId, legacyId } = setupScenario({
      memberFirstCompYear: null,
      hpFirstYear: 1995,
    });

    svc.claimLegacyAccount(memberId, legacyId);

    expect(memberRow(memberId).first_competition_year).toBe(1995);
  });

  it('member already has country set → HP does not overwrite (fill-if-empty)', () => {
    const { memberId, legacyId } = setupScenario({
      memberCountry: 'Canada',
      hpCountry: 'New Zealand',
    });

    svc.claimLegacyAccount(memberId, legacyId);

    expect(memberRow(memberId).country).toBe('Canada');
  });

  it('legacy.is_hof=1 wins even when HP.hof_member=0 (OR semantics across both sources)', () => {
    const { memberId, legacyId } = setupScenario({
      legacyIsHof: 1,
      hpHofMember: 0,
    });

    svc.claimLegacyAccount(memberId, legacyId);

    expect(memberRow(memberId).is_hof).toBe(1);
  });

  it('no linked HP → no HP-source change to member fields (idempotent for scenario C)', () => {
    const memberId = nextId('mem');
    const legacyId = nextId('legmem');
    const db = new BetterSqlite3(dbPath);
    insertMember(db, {
      id: memberId,
      slug: `slug_${memberId}`,
      login_email: `${memberId}@example.com`,
      country: null,
      is_hof: 0,
      is_bap: 0,
    });
    // Legacy has no HP back-link; insertLegacyMember without hp creates standalone row.
    insertLegacyMember(db, { legacy_member_id: legacyId, real_name: 'Standalone Legacy', country: null });
    db.close();

    svc.claimLegacyAccount(memberId, legacyId);

    const m = memberRow(memberId);
    expect(m.historical_person_id).toBeNull();
    // Legacy has no HoF/BAP and no country, so member fields stay at defaults.
    expect(m.is_hof).toBe(0);
    expect(m.is_bap).toBe(0);
    expect(m.country).toBeNull();
  });

  it('successful claim writes an audit_entries row (audit-trail invariant)', () => {
    const { memberId, legacyId } = setupScenario({
      hpCountry: 'New Zealand',
    });

    svc.claimLegacyAccount(memberId, legacyId);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(`
      SELECT action_type, actor_member_id, entity_type, entity_id, metadata_json
      FROM audit_entries
      WHERE actor_member_id = ? AND action_type = 'claim.legacy_account'
      ORDER BY occurred_at DESC LIMIT 1
    `).get(memberId) as Record<string, unknown> | undefined;
    db.close();
    expect(row).toBeDefined();
    expect(row!.entity_type).toBe('member');
    expect(row!.entity_id).toBe(memberId);
    const meta = JSON.parse(row!.metadata_json as string) as Record<string, unknown>;
    expect(meta.legacy_member_id).toBe(legacyId);
  });
});

// ─── Tier grant invariant (DD §2551 / SC §LegacyClaim / MIGRATION_PLAN §3) ───
//
// Every successful legacy-claim merge writes one `member_tier_grants` row
// with `reason_code = 'legacy.claim_tier_grant'`. Honors-only fallback today:
// HoF or BAP → tier2, else tier0. Must land in the same transaction as the
// merge writes (no partial-success window).

describe('claimLegacyAccount — single tier grant per claim', () => {
  function readTierGrant(memberId: string): Record<string, unknown> | undefined {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(`
      SELECT change_type, old_tier_status, new_tier_status, reason_code
      FROM member_tier_grants
      WHERE member_id = ? AND reason_code = 'legacy.claim_tier_grant'
      ORDER BY created_at DESC LIMIT 1
    `).get(memberId) as Record<string, unknown> | undefined;
    db.close();
    return row;
  }

  it('HP.hof_member=1 → tier2 grant with reason_code legacy.claim_tier_grant', () => {
    const { memberId, legacyId } = setupScenario({ hpHofMember: 1 });
    svc.claimLegacyAccount(memberId, legacyId);
    const grant = readTierGrant(memberId);
    expect(grant).toBeDefined();
    expect(grant!.new_tier_status).toBe('tier2');
    expect(grant!.old_tier_status).toBe('tier0');
    expect(grant!.reason_code).toBe('legacy.claim_tier_grant');
  });

  it('HP.bap_member=1 → tier2 grant', () => {
    const { memberId, legacyId } = setupScenario({ hpBapMember: 1 });
    svc.claimLegacyAccount(memberId, legacyId);
    const grant = readTierGrant(memberId);
    expect(grant!.new_tier_status).toBe('tier2');
    expect(grant!.reason_code).toBe('legacy.claim_tier_grant');
  });

  it('legacy.is_hof=1 → tier2 grant even with HP.hof_member=0', () => {
    const { memberId, legacyId } = setupScenario({ legacyIsHof: 1, hpHofMember: 0 });
    svc.claimLegacyAccount(memberId, legacyId);
    const grant = readTierGrant(memberId);
    expect(grant!.new_tier_status).toBe('tier2');
  });

  it('no honor on either side → tier0 grant (still recorded as ledger marker)', () => {
    const { memberId, legacyId } = setupScenario({
      legacyIsHof: 0, legacyIsBap: 0, hpHofMember: 0, hpBapMember: 0,
    });
    svc.claimLegacyAccount(memberId, legacyId);
    const grant = readTierGrant(memberId);
    expect(grant).toBeDefined();
    expect(grant!.new_tier_status).toBe('tier0');
    expect(grant!.old_tier_status).toBe('tier0');
    expect(grant!.reason_code).toBe('legacy.claim_tier_grant');
  });
});

// ─── Token atomicity (C1 regression) ─────────────────────────────────────────
//
// Two-step claim: consumeAndClaimLegacy must consume the token AND run the
// merge in ONE transaction. If the merge throws, the token consume must roll
// back so the user can retry the same email link rather than re-initiating.
//
// Pre-fix (consumeToken commits before claimLegacyAccount opens its
// transaction): a failed merge burns the token permanently with no recovery.
// Post-fix: `used_at` stays NULL after a failed merge.

describe('consumeAndClaimLegacy — token-consume atomicity with merge', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let tokenSvc: typeof import('../../src/services/accountTokenService');

  beforeAll(async () => {
    tokenSvc = await import('../../src/services/accountTokenService');
  });

  it('failed merge un-consumes the token (used_at stays NULL via rollback)', async () => {
    // Setup: a member with an existing legacy link, plus a legacy row with
    // a token issued to claim it. The merge will throw "already linked"
    // because the requesting member already has a legacy_member_id.
    const memberId = nextId('mem');
    const legacyId = nextId('legmem');
    const existingLegacyId = nextId('legmem');

    const db = new BetterSqlite3(dbPath);
    insertMember(db, {
      id: memberId,
      slug: `slug_${memberId}`,
      login_email: `${memberId}@example.com`,
    });
    insertLegacyMember(db, { legacy_member_id: legacyId, real_name: 'Target' });
    insertLegacyMember(db, { legacy_member_id: existingLegacyId, real_name: 'Existing' });
    // Pre-link the member to an unrelated legacy row so claimLegacyAccount
    // throws ValidationError('Your account is already linked...').
    db.prepare(`UPDATE members SET legacy_member_id = ? WHERE id = ?`)
      .run(existingLegacyId, memberId);
    db.close();

    const issued = tokenSvc.accountTokenService.issueToken({
      memberId,
      tokenType: 'account_claim',
      ttlHours: 24,
      targetLegacyMemberId: legacyId,
    });

    // The merge should throw, and the token row's used_at should still be
    // NULL because the throw rolled back the transaction.
    expect(() => svc.consumeAndClaimLegacy(memberId, issued.rawToken))
      .toThrow();

    const checkDb = new BetterSqlite3(dbPath, { readonly: true });
    const tokenRow = checkDb.prepare(
      `SELECT used_at FROM account_tokens WHERE id = ?`,
    ).get(issued.tokenRowId) as { used_at: string | null };
    checkDb.close();
    expect(tokenRow.used_at).toBeNull();
  });
});
