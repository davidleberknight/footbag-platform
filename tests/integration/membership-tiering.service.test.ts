/**
 * Integration tests for membershipTieringService.
 *
 * Covers tiering service edge cases:
 *   - Tier 0 buys Tier 1 / Tier 2 ends current Active Player
 *   - Tier 0 / Tier 1 / Tier 2 → Tier 3 governance with correct underlying
 *   - Tier 0 with AP → Tier 3 ends AP (paired ledger writes in one transaction)
 *   - HoF / BAP induction on Tier 0/1/2 grants Tier 2; on Tier 3 updates underlying
 *   - governance_removed reverts to underlying from latest governance_set
 *   - DB CHECK rejection when governance rows omit underlying tier columns
 *   - Admin override writes a correct row with mandatory reason text
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertActivePlayerGrant,
  insertMemberTierGrant,
  insertPayment,
} from '../fixtures/factories';
import { renderSidecarTemplate } from '../fixtures/testDb';
import { uuidv7Hex } from '../../src/services/uuidv7';

const { dbPath } = setTestEnv('3091');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let mts: typeof import('../../src/services/membershipTieringService');

const ADMIN_ID = 'member-admin';
const FUTURE_AP = '2099-01-01T00:00:00.000Z';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'tier_admin', is_admin: 1 });
  db.close();
  mts = await import('../../src/services/membershipTieringService');
});

afterAll(() => cleanupTestDb(dbPath));

let memberCounter = 0;
function freshMember(overrides: Partial<Parameters<typeof insertMember>[1]> = {}): string {
  const db = new BetterSqlite3(dbPath);
  memberCounter += 1;
  const id = `member-tier-${memberCounter}`;
  insertMember(db, { id, slug: `tier_${memberCounter}`, ...overrides });
  db.close();
  return id;
}

let paymentCounter = 0;
function freshPayment(memberId: string, tier: 'tier1' | 'tier2'): string {
  const db = new BetterSqlite3(dbPath);
  paymentCounter += 1;
  const id = `pay-test-mt-${paymentCounter}`;
  insertPayment(db, {
    id,
    member_id: memberId,
    payment_type: 'membership',
    purchased_tier_status: tier,
    status: 'succeeded',
  });
  db.close();
  return id;
}

interface TierGrantRow {
  id: string;
  change_type: string;
  old_tier_status: string | null;
  new_tier_status: string;
  old_underlying_tier_status: string | null;
  new_underlying_tier_status: string | null;
  reason_code: string;
  reason_text: string | null;
  related_payment_id: string | null;
  actor_member_id: string | null;
  created_at: string;
}

interface ApGrantRow {
  id: string;
  change_type: string;
  old_active_player_expires_at: string | null;
  new_active_player_expires_at: string | null;
  reason_code: string;
  actor_member_id: string | null;
  created_at: string;
}

function tierGrants(memberId: string): TierGrantRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT id, change_type, old_tier_status, new_tier_status,
              old_underlying_tier_status, new_underlying_tier_status,
              reason_code, reason_text, related_payment_id,
              actor_member_id, created_at
       FROM member_tier_grants
       WHERE member_id = ?
       ORDER BY created_at, id`,
    )
    .all(memberId) as TierGrantRow[];
  db.close();
  return rows;
}

function apGrants(memberId: string): ApGrantRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT id, change_type,
              old_active_player_expires_at, new_active_player_expires_at,
              reason_code, actor_member_id, created_at
       FROM active_player_grants
       WHERE member_id = ?
       ORDER BY created_at, id`,
    )
    .all(memberId) as ApGrantRow[];
  db.close();
  return rows;
}

function seedActivePlayer(memberId: string, expiresAt = FUTURE_AP): void {
  const db = new BetterSqlite3(dbPath);
  insertActivePlayerGrant(db, {
    member_id: memberId,
    change_type: 'grant',
    new_active_player_expires_at: expiresAt,
    reason_code: 'official_event_attendance',
  });
  db.close();
}

function outboxFor(memberId: string): Array<{
  recipient_email: string | null;
  subject: string;
  body_text: string | null;
  idempotency_key: string | null;
}> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare(
      `SELECT recipient_email, subject, body_text, idempotency_key
       FROM outbox_emails
       WHERE recipient_member_id = ?
       ORDER BY created_at, id`,
    )
    .all(memberId) as Array<{
      recipient_email: string | null;
      subject: string;
      body_text: string | null;
      idempotency_key: string | null;
    }>;
  db.close();
  return rows;
}

describe('getTierStatus', () => {
  it('returns tier0 with null underlying for a member with no ledger entry', () => {
    const id = freshMember();
    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier0',
      underlying_tier_status: null,
    });
  });

  it('throws NotFoundError for an unknown member id', () => {
    expect(() => mts.getTierStatus('does-not-exist')).toThrow(/not found/i);
  });
});

describe('applyPurchaseGrant', () => {
  it('Tier 0 buys Tier 1: ends current AP and writes both ledger rows', () => {
    const id = freshMember();
    seedActivePlayer(id);
    expect(mts.getTierStatus(id).tier_status).toBe('tier0');

    const paymentId = freshPayment(id, 'tier1');
    mts.applyPurchaseGrant(id, id, paymentId, 'tier1');

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier1',
      underlying_tier_status: null,
    });
    const tg = tierGrants(id);
    expect(tg).toHaveLength(1);
    expect(tg[0]).toMatchObject({
      change_type: 'grant',
      old_tier_status: 'tier0',
      new_tier_status: 'tier1',
      reason_code: 'purchase.tier1',
      related_payment_id: paymentId,
      actor_member_id: id,
    });
    const ap = apGrants(id);
    expect(ap).toHaveLength(2);
    expect(ap[1]).toMatchObject({
      change_type: 'end',
      old_active_player_expires_at: FUTURE_AP,
      new_active_player_expires_at: null,
      reason_code: 'membership_upgrade_ended_active_player',
      actor_member_id: id,
    });
  });

  it('Tier 0 buys Tier 2: ends current AP and writes both ledger rows', () => {
    const id = freshMember();
    seedActivePlayer(id);

    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier2'), 'tier2');

    expect(mts.getTierStatus(id).tier_status).toBe('tier2');
    const tg = tierGrants(id);
    expect(tg[0]).toMatchObject({
      change_type: 'grant',
      old_tier_status: 'tier0',
      new_tier_status: 'tier2',
      reason_code: 'purchase.tier2',
    });
    const ap = apGrants(id);
    expect(ap.find((r) => r.change_type === 'end')).toBeDefined();
  });

  it('Tier 0 without AP: writes the tier grant only (no AP end row)', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier1'), 'tier1');
    expect(tierGrants(id)).toHaveLength(1);
    expect(apGrants(id)).toHaveLength(0);
  });
});

describe('applyHonorGrant', () => {
  it('Tier 0 → HoF: writes Tier 2 grant and ends current AP', () => {
    const id = freshMember();
    seedActivePlayer(id);

    mts.applyHonorGrant(ADMIN_ID, id, 'hof');

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier2',
      underlying_tier_status: null,
    });
    const tg = tierGrants(id);
    expect(tg[0]).toMatchObject({
      change_type: 'grant',
      old_tier_status: 'tier0',
      new_tier_status: 'tier2',
      reason_code: 'honor.hof_tier2_grant',
      actor_member_id: ADMIN_ID,
    });
    expect(apGrants(id).some((r) => r.change_type === 'end')).toBe(true);
  });

  it('Tier 1 → BAP: writes Tier 2 grant; no AP rows', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier1'), 'tier1');

    mts.applyHonorGrant(ADMIN_ID, id, 'bap');

    expect(mts.getTierStatus(id).tier_status).toBe('tier2');
    const latest = tierGrants(id).at(-1)!;
    expect(latest).toMatchObject({
      change_type: 'grant',
      old_tier_status: 'tier1',
      new_tier_status: 'tier2',
      reason_code: 'honor.bap_tier2_grant',
    });
    expect(apGrants(id)).toHaveLength(0);
  });

  it('Tier 3 (underlying tier1) → HoF: writes governance_set updating underlying to tier2', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier1'), 'tier1');
    mts.setGovernanceTier3(ADMIN_ID, id);
    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier3',
      underlying_tier_status: 'tier1',
    });

    mts.applyHonorGrant(ADMIN_ID, id, 'hof');

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier3',
      underlying_tier_status: 'tier2',
    });
    const latest = tierGrants(id).at(-1)!;
    expect(latest).toMatchObject({
      change_type: 'governance_set',
      old_tier_status: 'tier3',
      new_tier_status: 'tier3',
      old_underlying_tier_status: 'tier1',
      new_underlying_tier_status: 'tier2',
      reason_code: 'honor.hof_tier2_grant',
    });
  });

  it('HoF grant enqueues a congratulatory email to the member', () => {
    const id = freshMember({ login_email: 'hof-winner@example.com' });

    mts.applyHonorGrant(ADMIN_ID, id, 'hof');

    const expected = renderSidecarTemplate('honor_congratulation_hof');
    const mail = outboxFor(id);
    expect(mail).toHaveLength(1);
    expect(mail[0].recipient_email).toBe('hof-winner@example.com');
    expect(mail[0].subject).toBe(expected.subject);
    expect(mail[0].body_text).toBe(expected.bodyText);
    expect(mail[0].idempotency_key).toMatch(/^honor_congrats:/);
  });

  it('BAP grant enqueues a congratulatory email naming the Big Add Posse', () => {
    const id = freshMember();

    mts.applyHonorGrant(ADMIN_ID, id, 'bap');

    const expected = renderSidecarTemplate('honor_congratulation_bap');
    expect(outboxFor(id)[0].body_text).toBe(expected.bodyText);
  });

  it('HoF grant on a Tier 3 member words the honor as setting the underlying tier', () => {
    // A Tier 3 member is the only precondition this asserts; reach it with one
    // governance grant.
    const id = freshMember();
    mts.setGovernanceTier3(ADMIN_ID, id);

    mts.applyHonorGrant(ADMIN_ID, id, 'hof');

    const expected = renderSidecarTemplate('honor_congratulation_hof_tier3');
    const mail = outboxFor(id);
    expect(mail).toHaveLength(1);
    expect(mail[0].body_text).toBe(expected.bodyText);
    // The Tier 3 variant must not claim Tier 2 is the member's current tier.
    expect(mail[0].body_text).toContain('underlying');
  });

  it('honor grant for a member with no deliverable email still grants and enqueues nothing', () => {
    const id = freshMember({ personal_data_purged_at: '2025-01-01T00:00:00.000Z' });

    mts.applyHonorGrant(ADMIN_ID, id, 'hof');

    expect(mts.getTierStatus(id).tier_status).toBe('tier2');
    expect(outboxFor(id)).toHaveLength(0);
  });

  it('posthumous honor grant for a deceased member enqueues no email', () => {
    const id = freshMember({ is_deceased: 1, deceased_at: '2025-01-01T00:00:00.000Z' });

    mts.applyHonorGrant(ADMIN_ID, id, 'hof');

    expect(mts.getTierStatus(id).tier_status).toBe('tier2');
    expect(outboxFor(id)).toHaveLength(0);
  });
});

describe('setGovernanceTier3', () => {
  it('Tier 0 → Tier 3: underlying=tier1; ends AP; both rows written', () => {
    const id = freshMember();
    seedActivePlayer(id);

    mts.setGovernanceTier3(ADMIN_ID, id);

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier3',
      underlying_tier_status: 'tier1',
    });
    const tg = tierGrants(id);
    expect(tg[0]).toMatchObject({
      change_type: 'governance_set',
      old_tier_status: 'tier0',
      new_tier_status: 'tier3',
      new_underlying_tier_status: 'tier1',
      reason_code: 'governance.tier3_set',
    });
    const apEnd = apGrants(id).find((r) => r.change_type === 'end');
    expect(apEnd).toMatchObject({
      reason_code: 'tier3_grant_ended_active_player',
      actor_member_id: ADMIN_ID,
      new_active_player_expires_at: null,
    });
  });

  it('Tier 1 → Tier 3: underlying=tier1', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier1'), 'tier1');

    mts.setGovernanceTier3(ADMIN_ID, id);

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier3',
      underlying_tier_status: 'tier1',
    });
  });

  it('Tier 2 → Tier 3: underlying=tier2', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier2'), 'tier2');

    mts.setGovernanceTier3(ADMIN_ID, id);

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier3',
      underlying_tier_status: 'tier2',
    });
  });

  it('rejects re-grant to a member who is already Tier 3', () => {
    const id = freshMember();
    mts.setGovernanceTier3(ADMIN_ID, id);

    expect(() => mts.setGovernanceTier3(ADMIN_ID, id)).toThrow(/already Tier 3/);
  });

  it('writes both the tier-grant and AP-end rows in the same transaction (atomicity)', () => {
    const id = freshMember();
    seedActivePlayer(id);

    mts.setGovernanceTier3(ADMIN_ID, id);

    const tg = tierGrants(id);
    const ap = apGrants(id);
    const tierTs = tg.find((r) => r.change_type === 'governance_set')!.created_at;
    const apTs = ap.find((r) => r.change_type === 'end')!.created_at;
    expect(tierTs).toBe(apTs);
  });
});

describe('removeGovernanceTier3', () => {
  it('reverts to the underlying tier captured by the latest governance_set row', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier2'), 'tier2');
    mts.setGovernanceTier3(ADMIN_ID, id);
    expect(mts.getTierStatus(id).underlying_tier_status).toBe('tier2');

    mts.removeGovernanceTier3(ADMIN_ID, id);

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier2',
      underlying_tier_status: null,
    });
    const latest = tierGrants(id).at(-1)!;
    expect(latest).toMatchObject({
      change_type: 'governance_removed',
      old_tier_status: 'tier3',
      new_tier_status: 'tier2',
      old_underlying_tier_status: 'tier2',
      new_underlying_tier_status: null,
      reason_code: 'governance.tier3_removed',
    });
  });

  it('reverts to tier1 when the prior path was Tier 0 → Tier 3', () => {
    const id = freshMember();
    mts.setGovernanceTier3(ADMIN_ID, id);

    mts.removeGovernanceTier3(ADMIN_ID, id);

    expect(mts.getTierStatus(id).tier_status).toBe('tier1');
  });

  it('rejects when the member is not currently Tier 3', () => {
    const id = freshMember();
    expect(() => mts.removeGovernanceTier3(ADMIN_ID, id)).toThrow(/not Tier 3/);
  });

  it('after a HoF-on-Tier3 governance_set, removal reverts to the updated underlying (tier2)', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier1'), 'tier1');
    mts.setGovernanceTier3(ADMIN_ID, id);
    mts.applyHonorGrant(ADMIN_ID, id, 'hof');
    expect(mts.getTierStatus(id).underlying_tier_status).toBe('tier2');

    mts.removeGovernanceTier3(ADMIN_ID, id);

    expect(mts.getTierStatus(id).tier_status).toBe('tier2');
  });
});

describe('applyAutoLinkRevertGrantInTx', () => {
  it('preserves a paid tier when reverting a legacy-claim grant', () => {
    const id = freshMember();
    // Paid Tier 1, then a legacy-claim grant (HoF honors) that lifted to Tier 2.
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier1'), 'tier1');
    mts.applyLegacyClaimGrantInTx(id, id, { hasHof: true, hasBap: false, everPaidTier2: false, everPaidTier1Lifetime: false, tier1AnnualActive: false }, {});
    expect(mts.getTierStatus(id).tier_status).toBe('tier2');

    mts.applyAutoLinkRevertGrantInTx(id, id, {});

    // Reverts to the paid Tier 1, not Tier 0.
    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier1',
      underlying_tier_status: null,
    });
    expect(tierGrants(id).at(-1)).toMatchObject({
      change_type: 'revoke',
      old_tier_status: 'tier2',
      new_tier_status: 'tier1',
      reason_code: 'legacy.auto_link_reported_incorrect',
    });
  });

  it('falls back to tier0 when the member held no non-legacy upgrade', () => {
    const id = freshMember();
    mts.applyLegacyClaimGrantInTx(id, id, { hasHof: true, hasBap: false, everPaidTier2: false, everPaidTier1Lifetime: false, tier1AnnualActive: false }, {}); // tier0 -> tier2 via honors
    expect(mts.getTierStatus(id).tier_status).toBe('tier2');

    mts.applyAutoLinkRevertGrantInTx(id, id, {});

    expect(mts.getTierStatus(id).tier_status).toBe('tier0');
    expect(tierGrants(id).at(-1)).toMatchObject({
      change_type: 'revoke',
      new_tier_status: 'tier0',
    });
  });

  it('preserves governance Tier 3 and its underlying when reverting a legacy claim', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier2'), 'tier2');
    mts.setGovernanceTier3(ADMIN_ID, id); // tier3, underlying tier2
    mts.applyLegacyClaimGrantInTx(id, id, { hasHof: true, hasBap: false, everPaidTier2: false, everPaidTier1Lifetime: false, tier1AnnualActive: false }, {});

    mts.applyAutoLinkRevertGrantInTx(id, id, {});

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier3',
      underlying_tier_status: 'tier2',
    });
  });
});

describe('applyLegacyClaimGrantInTx tier floor guard', () => {
  it('a second lower-basis claim does not lower a tier an earlier claim conferred', () => {
    const id = freshMember();
    // First source: a paid Tier 2 legacy account.
    mts.applyLegacyClaimGrantInTx(id, id, { hasHof: false, hasBap: false, everPaidTier2: true, everPaidTier1Lifetime: false, tier1AnnualActive: false }, {});
    expect(mts.getTierStatus(id).tier_status).toBe('tier2');

    // Second source: the member's own competition record with no legacy
    // back-link, so its standings map to tier0. The union of claimed bases is
    // still Tier 2; the lower later source must not discard it.
    mts.applyLegacyClaimGrantInTx(id, id, { hasHof: false, hasBap: false, everPaidTier2: false, everPaidTier1Lifetime: false, tier1AnnualActive: false }, {});

    expect(mts.getTierStatus(id).tier_status).toBe('tier2');
    // The marker row is still written every claim, floored to the current tier.
    expect(tierGrants(id).at(-1)).toMatchObject({
      change_type: 'grant',
      old_tier_status: 'tier2',
      new_tier_status: 'tier2',
      reason_code: 'legacy.claim_tier_grant',
    });
  });

  it('still applies a genuine upgrade (a Tier 0 member claims a Tier 2 basis)', () => {
    const id = freshMember();
    mts.applyLegacyClaimGrantInTx(id, id, { hasHof: false, hasBap: false, everPaidTier2: true, everPaidTier1Lifetime: false, tier1AnnualActive: false }, {});
    expect(mts.getTierStatus(id).tier_status).toBe('tier2');
    expect(tierGrants(id).at(-1)).toMatchObject({
      change_type: 'grant',
      old_tier_status: 'tier0',
      new_tier_status: 'tier2',
      reason_code: 'legacy.claim_tier_grant',
    });
  });
});

describe('applyPurchaseGrantInTx downgrade guard', () => {
  it('does not downgrade a Tier 3 member when a lower-tier purchase lands', () => {
    const id = freshMember();
    mts.setGovernanceTier3(ADMIN_ID, id); // tier3, underlying tier1
    const before = tierGrants(id).length;

    mts.applyPurchaseGrantInTx(id, id, freshPayment(id, 'tier1'), 'tier1');

    expect(mts.getTierStatus(id)).toEqual({
      tier_status: 'tier3',
      underlying_tier_status: 'tier1',
    });
    expect(tierGrants(id)).toHaveLength(before);
  });

  it('does not write a lower-tier purchase grant for a Tier 2 member', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier2'), 'tier2');
    const before = tierGrants(id).length;

    mts.applyPurchaseGrantInTx(id, id, freshPayment(id, 'tier1'), 'tier1');

    expect(mts.getTierStatus(id).tier_status).toBe('tier2');
    expect(tierGrants(id)).toHaveLength(before);
  });

  it('still applies a genuine upgrade (Tier 1 member buys Tier 2)', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier1'), 'tier1');

    mts.applyPurchaseGrantInTx(id, id, freshPayment(id, 'tier2'), 'tier2');

    expect(mts.getTierStatus(id).tier_status).toBe('tier2');
    expect(tierGrants(id).at(-1)).toMatchObject({
      change_type: 'grant',
      new_tier_status: 'tier2',
      reason_code: 'purchase.tier2',
    });
  });
});

describe('adminOverride', () => {
  it('writes a correct row with the mandatory reason text', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier1'), 'tier1');

    mts.adminOverride(ADMIN_ID, id, 'tier0', 'erroneous earlier grant');

    expect(mts.getTierStatus(id).tier_status).toBe('tier0');
    const latest = tierGrants(id).at(-1)!;
    expect(latest).toMatchObject({
      change_type: 'correct',
      old_tier_status: 'tier1',
      new_tier_status: 'tier0',
      reason_code: 'admin.correction',
      reason_text: 'erroneous earlier grant',
      actor_member_id: ADMIN_ID,
    });
  });

  it('rejects an empty reason text', () => {
    const id = freshMember();
    expect(() => mts.adminOverride(ADMIN_ID, id, 'tier1', '')).toThrow(/required/);
    expect(() => mts.adminOverride(ADMIN_ID, id, 'tier1', '   ')).toThrow(/required/);
  });

  it('rejects an oversized reason text (1MB)', () => {
    const id = freshMember();
    const huge = 'x'.repeat(1_000_000);
    expect(() => mts.adminOverride(ADMIN_ID, id, 'tier1', huge)).toThrow(/exceeds/);
    // No row should have been written.
    expect(tierGrants(id)).toHaveLength(0);
  });

  it('preserves unicode mischief verbatim in reason_text', () => {
    const id = freshMember();
    const sneaky = 'a‮‍b‬ right-to-left override + zero-width joiner';

    mts.adminOverride(ADMIN_ID, id, 'tier1', sneaky);

    const latest = tierGrants(id).at(-1)!;
    expect(latest.reason_text).toBe(sneaky);
  });

  it('enqueues a status-change email to the member with the new tier and reason', () => {
    const id = freshMember({ login_email: 'overridden@example.com' });

    mts.adminOverride(ADMIN_ID, id, 'tier2', 'complimentary access');

    const expected = renderSidecarTemplate('tier_change_notice', {
      tierLabel: 'Tier 2 (IFPA Organizer Member)',
      reasonText: 'complimentary access',
    });
    const mail = outboxFor(id);
    expect(mail).toHaveLength(1);
    expect(mail[0].recipient_email).toBe('overridden@example.com');
    expect(mail[0].subject).toBe(expected.subject);
    expect(mail[0].body_text).toBe(expected.bodyText);
    expect(mail[0].idempotency_key).toMatch(/^tier_change_notice:/);
  });

  it('a same-tier correction records the grant but sends no status-change email', () => {
    const id = freshMember();
    mts.applyPurchaseGrant(id, id, freshPayment(id, 'tier1'), 'tier1');

    // Re-record the current tier with a reason; the tier does not change.
    mts.adminOverride(ADMIN_ID, id, 'tier1', 'note: confirmed by phone');

    expect(tierGrants(id).at(-1)).toMatchObject({ change_type: 'correct', new_tier_status: 'tier1' });
    expect(outboxFor(id)).toHaveLength(0);
  });
});

describe('DB-level governance integrity guards', () => {
  // These assert the schema CHECK constraints fire when the service contract
  // is bypassed. They are pinned explicitly so they cannot regress out of the
  // schema without a test failure.

  it('rejects a governance_set row missing new_underlying_tier_status', () => {
    const id = freshMember();
    const db = new BetterSqlite3(dbPath);
    expect(() =>
      db
        .prepare(
          `INSERT INTO member_tier_grants (
             id, created_at, created_by,
             member_id, actor_member_id,
             change_type,
             old_tier_status, new_tier_status,
             old_underlying_tier_status, new_underlying_tier_status,
             reason_code
           ) VALUES (?, ?, 'system', ?, ?, 'governance_set', 'tier1', 'tier3', NULL, NULL, 'test')`,
        )
        .run('mtg-bad-1', '2026-01-01T00:00:00.000Z', id, ADMIN_ID),
    ).toThrow(/CHECK/i);
    db.close();
  });

  it('rejects a governance_removed row missing old_underlying_tier_status', () => {
    const id = freshMember();
    const db = new BetterSqlite3(dbPath);
    expect(() =>
      db
        .prepare(
          `INSERT INTO member_tier_grants (
             id, created_at, created_by,
             member_id, actor_member_id,
             change_type,
             old_tier_status, new_tier_status,
             old_underlying_tier_status, new_underlying_tier_status,
             reason_code
           ) VALUES (?, ?, 'system', ?, ?, 'governance_removed', 'tier3', 'tier1', NULL, NULL, 'test')`,
        )
        .run('mtg-bad-2', '2026-01-01T00:00:00.000Z', id, ADMIN_ID),
    ).toThrow(/CHECK/i);
    db.close();
  });
});

describe('audit log', () => {
  it('writes a tier_change audit entry on adminOverride', () => {
    const id = freshMember();
    mts.adminOverride(ADMIN_ID, id, 'tier1', 'manual fix');

    const dbh = new BetterSqlite3(dbPath, { readonly: true });
    const rows = dbh
      .prepare(
        `SELECT action_type, category, actor_type, actor_member_id, entity_id, reason_text
         FROM audit_entries
         WHERE entity_id = ? AND action_type = 'tier.admin_override'`,
      )
      .all(id) as Array<{
        action_type: string;
        category: string;
        actor_type: string;
        actor_member_id: string;
        entity_id: string;
        reason_text: string;
      }>;
    dbh.close();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action_type: 'tier.admin_override',
      category: 'tier_change',
      actor_type: 'admin',
      actor_member_id: ADMIN_ID,
      entity_id: id,
      reason_text: 'manual fix',
    });
  });

  it('writes a governance_change audit entry on setGovernanceTier3', () => {
    const id = freshMember();
    mts.setGovernanceTier3(ADMIN_ID, id);

    const dbh = new BetterSqlite3(dbPath, { readonly: true });
    const rows = dbh
      .prepare(
        `SELECT category, action_type FROM audit_entries
         WHERE entity_id = ? AND action_type = 'tier.governance_set'`,
      )
      .all(id) as Array<{ category: string; action_type: string }>;
    dbh.close();
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('governance_change');
  });
});

// Ensure each describe block's tests are self-contained: there is no shared
// member id across blocks, but beforeEach is a useful safety net to flag any
// future drift away from the freshMember pattern.
beforeEach(() => {
  // Intentionally empty: every test calls freshMember() to get an isolated
  // member id. Kept to surface intent in case future edits add per-test setup.
});

describe('member_tier_current — same-millisecond grant resolution', () => {
  it('resolves two grants sharing a created_at for one member to the later-minted row', () => {
    const memberId = freshMember();

    // Two ids minted back-to-back: the shared generator's within-process
    // monotonic same-millisecond counter makes the second strictly greater, so
    // when created_at ties the (created_at, id) tiebreak in member_tier_current
    // must resolve to the later-minted grant rather than order at random.
    const first = `mtg_${uuidv7Hex()}`;
    const second = `mtg_${uuidv7Hex()}`;
    expect(second > first).toBe(true);

    const sameInstant = '2024-06-01T00:00:00.000Z';
    const db = new BetterSqlite3(dbPath);
    insertMemberTierGrant(db, {
      id: first, member_id: memberId, new_tier_status: 'tier1', created_at: sameInstant,
    });
    insertMemberTierGrant(db, {
      id: second, member_id: memberId, new_tier_status: 'tier2', created_at: sameInstant,
    });
    db.close();

    expect(mts.getTierStatus(memberId).tier_status).toBe('tier2');
  });
});
