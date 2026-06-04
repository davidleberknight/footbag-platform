/**
 * Tier-mapping dry-run report: a read-only preview of the member_tier_grants
 * outcome IF every currently-unclaimed legacy account were claimed today,
 * under the active mapping.
 *
 * The active mapping is detected from the schema: when the five legacy
 * tier-state columns exist on legacy_members (legacy_ever_paid_tier2,
 * legacy_ever_paid_tier1_lifetime, legacy_tier1_annual_active_at_cutover,
 * legacy_was_board_at_cutover, legacy_board_underlying_paid_tier), the full
 * precedence table applies (board > honors > ever-paid-tier2 >
 * tier1-lifetime > tier1-annual-active > tier0, with the board-underlying
 * derivation). Otherwise the honors-only fallback applies (HoF/BAP -> tier2,
 * everything else -> tier0). Honors mirror claim-time behavior: the legacy
 * row's flags OR the back-linked historical person's flags.
 *
 * Does NOT modify the DB. No member_tier_grants rows are written; actual
 * grants are written later, one per member-confirmed claim.
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

const TIER_FIELDS = [
  'legacy_ever_paid_tier2',
  'legacy_ever_paid_tier1_lifetime',
  'legacy_tier1_annual_active_at_cutover',
  'legacy_was_board_at_cutover',
  'legacy_board_underlying_paid_tier',
] as const;

const columns = new Set(
  (db.prepare(`PRAGMA table_info(legacy_members)`).all() as Array<{ name: string }>).map((c) => c.name),
);
const fieldsPresent = TIER_FIELDS.filter((f) => columns.has(f));
const fullMapping = fieldsPresent.length === TIER_FIELDS.length;

interface Row {
  legacy_member_id: string;
  is_hof: number;
  is_bap: number;
  hp_hof: number | null;
  hp_bap: number | null;
  legacy_ever_paid_tier2?: number;
  legacy_ever_paid_tier1_lifetime?: number;
  legacy_tier1_annual_active_at_cutover?: number;
  legacy_was_board_at_cutover?: number;
  legacy_board_underlying_paid_tier?: string | null;
}

const extraCols = fullMapping ? `, lm.${TIER_FIELDS.join(', lm.')}` : '';
const rows = db.prepare(`
  SELECT lm.legacy_member_id, lm.is_hof, lm.is_bap,
         hp.hof_member AS hp_hof, hp.bap_member AS hp_bap
         ${extraCols}
  FROM legacy_members lm
  LEFT JOIN historical_persons hp ON hp.legacy_member_id = lm.legacy_member_id
  WHERE lm.claimed_by_member_id IS NULL
`).all() as Row[];

const alreadyClaimed = (db.prepare(`
  SELECT COUNT(*) AS n FROM legacy_members WHERE claimed_by_member_id IS NOT NULL
`).get() as { n: number }).n;

interface Outcome {
  tier: 'tier0' | 'tier1' | 'tier2' | 'tier3';
  underlying: 'tier1' | 'tier2' | null;
  rule: string;
}

function mapRow(r: Row): Outcome {
  const honors = Boolean(r.is_hof) || Boolean(r.is_bap) || Boolean(r.hp_hof) || Boolean(r.hp_bap);
  if (!fullMapping) {
    return honors
      ? { tier: 'tier2', underlying: null, rule: 'honors_only_fallback' }
      : { tier: 'tier0', underlying: null, rule: 'honors_only_fallback_default' };
  }
  if (r.legacy_was_board_at_cutover) {
    const underlying =
      honors || r.legacy_board_underlying_paid_tier === 'tier2' ? 'tier2' : 'tier1';
    return { tier: 'tier3', underlying, rule: 'p1_board' };
  }
  if (honors) return { tier: 'tier2', underlying: null, rule: 'p2_honors' };
  if (r.legacy_ever_paid_tier2) return { tier: 'tier2', underlying: null, rule: 'p3_ever_paid_tier2' };
  if (r.legacy_ever_paid_tier1_lifetime) return { tier: 'tier1', underlying: null, rule: 'p4_tier1_lifetime' };
  if (r.legacy_tier1_annual_active_at_cutover) return { tier: 'tier1', underlying: null, rule: 'p5_tier1_annual_active' };
  return { tier: 'tier0', underlying: null, rule: 'p6_default' };
}

const byTier = new Map<string, string[]>();
const byRule = new Map<string, number>();
const underlyingBreakdown = new Map<string, number>();
for (const r of rows) {
  const o = mapRow(r);
  if (!byTier.has(o.tier)) byTier.set(o.tier, []);
  byTier.get(o.tier)!.push(r.legacy_member_id);
  byRule.set(o.rule, (byRule.get(o.rule) ?? 0) + 1);
  if (o.tier === 'tier3') {
    underlyingBreakdown.set(o.underlying!, (underlyingBreakdown.get(o.underlying!) ?? 0) + 1);
  }
}

console.log('tier-mapping dry-run (READ-ONLY; no grants written)');
console.log(`  database:                ${dbPath}`);
console.log(`  active mapping:          ${fullMapping ? 'full precedence (five tier fields present)' : 'honors-only fallback'}`);
if (!fullMapping && fieldsPresent.length > 0) {
  console.log(`  WARNING: only ${fieldsPresent.length}/5 tier fields present (${fieldsPresent.join(', ')}); the full mapping requires all five. Honors-only fallback applied.`);
}
console.log(`  unclaimed rows examined: ${rows.length}`);
console.log(`  already claimed (skipped; grants exist or existed): ${alreadyClaimed}`);
console.log('  grants if all claimed today:');
for (const tier of ['tier3', 'tier2', 'tier1', 'tier0'] as const) {
  const ids = byTier.get(tier) ?? [];
  const sample = ids.slice(0, 5).join(', ');
  console.log(`    ${tier}: ${ids.length}${sample ? `  (e.g. ${sample}${ids.length > 5 ? ', ...' : ''})` : ''}`);
}
if (underlyingBreakdown.size > 0) {
  console.log('  tier3 underlying derivation:');
  for (const [u, n] of underlyingBreakdown) console.log(`    ${u}: ${n}`);
}
console.log('  per-rule counts:');
for (const [rule, n] of [...byRule.entries()].sort()) console.log(`    ${rule}: ${n}`);

db.close();
