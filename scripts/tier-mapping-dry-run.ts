/**
 * Tier-mapping dry-run report: a read-only preview of the member_tier_grants
 * outcome IF every currently-unclaimed legacy account were claimed today, under
 * the honors + paid-history mapping.
 *
 * The mapping (board / Tier 3 is a separate concern, not previewed here):
 * honors (HoF/BAP, from the legacy row or the back-linked historical person) or
 * ever-paid Tier 2 -> tier2; bought Tier 1 Lifetime or active Tier 1 Annual ->
 * tier1; otherwise tier0. An account with only honors lands on tier2 as one
 * outcome of the same mapping.
 *
 * Does NOT modify the DB. No member_tier_grants rows are written; actual grants
 * are written later, one per member-confirmed claim.
 *
 * Usage:
 *   npx tsx scripts/tier-mapping-dry-run.ts [--db path/to/footbag.db]
 */
import BetterSqlite3 from 'better-sqlite3';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const dbPath = arg('--db', process.env.FOOTBAG_DB_PATH ?? 'database/footbag.db');
const db = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });

interface Row {
  legacy_member_id: string;
  is_hof: number;
  is_bap: number;
  hp_hof: number | null;
  hp_bap: number | null;
  legacy_ever_paid_tier2: number;
  legacy_ever_paid_tier1_lifetime: number;
  legacy_tier1_annual_active_at_cutover: number;
}

const rows = db.prepare(`
  SELECT lm.legacy_member_id, lm.is_hof, lm.is_bap,
         hp.hof_member AS hp_hof, hp.bap_member AS hp_bap,
         lm.legacy_ever_paid_tier2,
         lm.legacy_ever_paid_tier1_lifetime,
         lm.legacy_tier1_annual_active_at_cutover
  FROM legacy_members lm
  LEFT JOIN historical_persons hp ON hp.legacy_member_id = lm.legacy_member_id
  WHERE lm.claimed_by_member_id IS NULL
`).all() as Row[];

const alreadyClaimed = (db.prepare(`
  SELECT COUNT(*) AS n FROM legacy_members WHERE claimed_by_member_id IS NOT NULL
`).get() as { n: number }).n;

interface Outcome {
  tier: 'tier0' | 'tier1' | 'tier2';
  rule: string;
}

function mapRow(r: Row): Outcome {
  const honors = Boolean(r.is_hof) || Boolean(r.is_bap) || Boolean(r.hp_hof) || Boolean(r.hp_bap);
  if (honors) return { tier: 'tier2', rule: 'p_honors' };
  if (r.legacy_ever_paid_tier2) return { tier: 'tier2', rule: 'p_ever_paid_tier2' };
  if (r.legacy_ever_paid_tier1_lifetime) return { tier: 'tier1', rule: 'p_tier1_lifetime' };
  if (r.legacy_tier1_annual_active_at_cutover) return { tier: 'tier1', rule: 'p_tier1_annual_active' };
  return { tier: 'tier0', rule: 'p_default' };
}

const byTier = new Map<string, string[]>();
const byRule = new Map<string, number>();
for (const r of rows) {
  const o = mapRow(r);
  if (!byTier.has(o.tier)) byTier.set(o.tier, []);
  byTier.get(o.tier)!.push(r.legacy_member_id);
  byRule.set(o.rule, (byRule.get(o.rule) ?? 0) + 1);
}

console.log('tier-mapping dry-run (READ-ONLY; no grants written)');
console.log(`  database:                ${dbPath}`);
console.log('  mapping:                 honors + paid-history (board / Tier 3 not previewed)');
console.log(`  unclaimed rows examined: ${rows.length}`);
console.log(`  already claimed (skipped; grants exist or existed): ${alreadyClaimed}`);
console.log('  grants if all claimed today:');
for (const tier of ['tier2', 'tier1', 'tier0'] as const) {
  const ids = byTier.get(tier) ?? [];
  const sample = ids.slice(0, 5).join(', ');
  console.log(`    ${tier}: ${ids.length}${sample ? `  (e.g. ${sample}${ids.length > 5 ? ', ...' : ''})` : ''}`);
}
console.log('  per-rule counts:');
for (const [rule, n] of [...byRule.entries()].sort()) console.log(`    ${rule}: ${n}`);

db.close();
