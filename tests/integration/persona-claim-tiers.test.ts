/**
 * The tier a claim of each claim persona's old account grants: the paid and
 * Board standing the catalog seeds on the account, read back from the seeded
 * row, put through the claim-time tier grants the claim itself calls.
 *
 * Real SQLite through the application's database singleton, which the grants
 * write through.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { refreshAllPersonas } from '../../src/testkit/personaRefreshRunner';
import { insertMember } from '../../src/testkit/personaRowBuilders';

const { dbPath } = setTestEnv('3473');

interface StandingRow {
  is_hof: number;
  is_bap: number;
  legacy_ever_paid_tier2: number;
  legacy_ever_paid_tier1_lifetime: number;
  legacy_tier1_annual_active_at_cutover: number;
  legacy_was_board_at_cutover: number;
}

let tierAfterClaim: Record<string, string | undefined>;

beforeAll(async () => {
  const seedDb = createTestDb(dbPath);
  refreshAllPersonas(seedDb);
  const claimants: Record<string, { memberId: string; row: StandingRow }> = {};
  for (const slug of ['claim_email_pair', 'claim_dob_only', 'claim_last_attempt', 'claim_married_name']) {
    const row = seedDb.prepare(
      `SELECT is_hof, is_bap, legacy_ever_paid_tier2, legacy_ever_paid_tier1_lifetime,
              legacy_tier1_annual_active_at_cutover, legacy_was_board_at_cutover
         FROM legacy_members WHERE legacy_member_id = ?`,
    ).get(`legmem_persona_${slug}`) as StandingRow;
    // A fresh Tier 0 member standing in for the persona at the moment of claim.
    claimants[slug] = { memberId: insertMember(seedDb, { slug: `claimant_${slug}` }), row };
  }
  seedDb.close();

  const { applyLegacyClaimGrantInTx, applyLegacyClaimBoardGrantInTx } =
    await import('../../src/services/membershipTieringService');
  const { transaction } = await import('../../src/db/db');
  tierAfterClaim = {};
  for (const [slug, { memberId, row }] of Object.entries(claimants)) {
    // The claim's own two steps, in its order, inside one transaction.
    transaction(() => {
      applyLegacyClaimGrantInTx(memberId, memberId, {
        hasHof: Boolean(row.is_hof),
        hasBap: Boolean(row.is_bap),
        everPaidTier2: Boolean(row.legacy_ever_paid_tier2),
        everPaidTier1Lifetime: Boolean(row.legacy_ever_paid_tier1_lifetime),
        tier1AnnualActive: Boolean(row.legacy_tier1_annual_active_at_cutover),
      }, { source: 'legacy_claim' });
      if (row.legacy_was_board_at_cutover) {
        applyLegacyClaimBoardGrantInTx({ type: 'member', id: memberId }, memberId, { source: 'legacy_claim' });
      }
    });
    const db = new BetterSqlite3(dbPath, { readonly: true });
    tierAfterClaim[slug] = (db.prepare(`SELECT tier_status FROM member_tier_current WHERE member_id = ?`)
      .get(memberId) as { tier_status: string } | undefined)?.tier_status;
    db.close();
  }
});

afterAll(() => cleanupTestDb(dbPath));

describe('claim personas: the tier the claim grants', () => {
  // Defect caught: a card promises a tier after the claim that the standing
  // seeded on the old account does not earn, so the tester files a false bug
  // or misses a real one in the claim-time tier rules.
  it('grants the tier each card promises', () => {
    expect(tierAfterClaim).toEqual({
      claim_email_pair: 'tier2',
      claim_dob_only: 'tier1',
      claim_last_attempt: 'tier0',
      claim_married_name: 'tier3',
    });
  });
});
