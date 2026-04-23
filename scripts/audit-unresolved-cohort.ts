/**
 * Dry-run classification of the two unresolved populations remaining
 * after the provenance apply (2026-04-23):
 *
 *   Cohort A — historical_persons with NO legacy_member_id (~3,100)
 *              (mirror-only identities + genuinely historical names)
 *   Cohort B — legacy_members with NO HP provenance back-link (~245)
 *              (mirror-derived roster members never tied to a results
 *               person; partner candidates for post-dump resolution)
 *
 * Produces a categorized forecast of how much the incoming legacy-site
 * data dump can absorb (via exact name match + variant-assisted name
 * match) vs. how much is genuinely unresolvable.
 *
 * Read-only. Writes two CSV audit artifacts to legacy_data/out/:
 *   - unresolved_hp_cohort.csv
 *   - unresolved_lm_cohort.csv
 *
 * Usage:
 *   npx tsx scripts/audit-unresolved-cohort.ts [--db path/to/footbag.db]
 */
import BetterSqlite3 from 'better-sqlite3';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

const DEFAULT_DB = path.resolve(__dirname, '..', 'database', 'footbag.db');
const OUT_DIR    = path.resolve(__dirname, '..', 'legacy_data', 'out');

function parseArgs(): { db: string } {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--db');
  return { db: i >= 0 ? argv[i + 1]! : DEFAULT_DB };
}

/** NFKC + lowercase + trim + collapse-internal-whitespace. Same rule as
 *  nameVariantsService.normalizeForMatch, kept inline for script parity. */
function normalizeForMatch(raw: string): string {
  const nfkc = (raw ?? '').normalize('NFKC').toLowerCase().trim();
  if (!nfkc) return '';
  return nfkc.split(/\s+/).filter(Boolean).join(' ');
}

interface HpRow {
  person_id: string;
  person_name: string;
  country: string | null;
  first_year: number | null;
  last_year: number | null;
  event_count: number | null;
  bap_member: number;
  hof_member: number;
}

interface LmRow {
  legacy_member_id: string;
  real_name: string | null;
  display_name: string | null;
  country: string | null;
  first_competition_year: number | null;
  is_hof: number;
  is_bap: number;
  legacy_is_admin: number;
}

type EraBucket =
  | 'recent_2020_plus'
  | 'modern_2000_2019'
  | 'mirror_1997_1999'
  | 'pre_mirror'
  | 'no_activity';

type NameOverlapBucket =
  | 'unique_name_matches_other'   // exactly one partner on the other side
  | 'ambiguous_multiple_matches'  // 2+ partners
  | 'no_name_match'               // no exact match
  | 'variant_assisted_match';     // no exact, but variant lookup resolves

function classifyEra(lastYear: number | null): EraBucket {
  if (lastYear == null) return 'no_activity';
  if (lastYear >= 2020) return 'recent_2020_plus';
  if (lastYear >= 2000) return 'modern_2000_2019';
  if (lastYear >= 1997) return 'mirror_1997_1999';
  return 'pre_mirror';
}

function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(filePath: string, headers: string[], rows: unknown[][]): void {
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(r.map(csvEscape).join(','));
  writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
}

function main(): void {
  const { db: dbPath } = parseArgs();
  if (!existsSync(dbPath)) {
    console.error(`DB not found: ${dbPath}`);
    process.exit(1);
  }
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const db = new BetterSqlite3(dbPath, { readonly: true });

  const hps = db.prepare(`
    SELECT person_id, person_name, country,
           first_year, last_year, event_count,
           bap_member, hof_member
    FROM historical_persons
    WHERE legacy_member_id IS NULL
  `).all() as HpRow[];

  const lms = db.prepare(`
    SELECT lm.legacy_member_id, lm.real_name, lm.display_name, lm.country,
           lm.first_competition_year, lm.is_hof, lm.is_bap, lm.legacy_is_admin
    FROM legacy_members lm
    WHERE NOT EXISTS (
      SELECT 1 FROM historical_persons hp
      WHERE hp.legacy_member_id = lm.legacy_member_id
    )
  `).all() as LmRow[];

  // Symmetric name-variant map: normalized form → set of other normalized forms.
  const variantMap = new Map<string, Set<string>>();
  const variantRows = db.prepare(`
    SELECT canonical_normalized, variant_normalized FROM name_variants
  `).all() as { canonical_normalized: string; variant_normalized: string }[];
  for (const v of variantRows) {
    for (const [a, b] of [
      [v.canonical_normalized, v.variant_normalized],
      [v.variant_normalized, v.canonical_normalized],
    ]) {
      if (!variantMap.has(a)) variantMap.set(a, new Set());
      variantMap.get(a)!.add(b);
    }
  }

  // Normalized-name indexes on both sides.
  const hpByNorm = new Map<string, string[]>();
  for (const hp of hps) {
    const k = normalizeForMatch(hp.person_name);
    if (!k) continue;
    if (!hpByNorm.has(k)) hpByNorm.set(k, []);
    hpByNorm.get(k)!.push(hp.person_id);
  }

  const lmByNorm = new Map<string, string[]>();
  for (const lm of lms) {
    for (const src of [lm.real_name, lm.display_name]) {
      const k = normalizeForMatch(src ?? '');
      if (!k) continue;
      if (!lmByNorm.has(k)) lmByNorm.set(k, []);
      if (!lmByNorm.get(k)!.includes(lm.legacy_member_id)) {
        lmByNorm.get(k)!.push(lm.legacy_member_id);
      }
    }
  }

  /** Resolve `name` to partners on the OTHER side via either exact or
   *  variant lookup. Returns the partner-id set + the match kind. */
  function resolvePartners(name: string, other: Map<string, string[]>): {
    ids: string[]; bucket: NameOverlapBucket;
  } {
    const key = normalizeForMatch(name);
    if (!key) return { ids: [], bucket: 'no_name_match' };

    const exact = other.get(key) ?? [];
    if (exact.length === 1) return { ids: exact,  bucket: 'unique_name_matches_other' };
    if (exact.length > 1)   return { ids: exact,  bucket: 'ambiguous_multiple_matches' };

    // Fall back to variant lookup.
    const variantIds = new Set<string>();
    for (const v of variantMap.get(key) ?? []) {
      for (const id of other.get(v) ?? []) variantIds.add(id);
    }
    if (variantIds.size >= 1) {
      return { ids: [...variantIds], bucket: 'variant_assisted_match' };
    }
    return { ids: [], bucket: 'no_name_match' };
  }

  // ── Classify HPs ───────────────────────────────────────────────────────────
  const hpClassified = hps.map(hp => {
    const era = classifyEra(hp.last_year);
    const honored = hp.bap_member === 1 || hp.hof_member === 1;
    const partner = resolvePartners(hp.person_name, lmByNorm);
    return { hp, era, honored, partner };
  });

  // ── Classify LMs ───────────────────────────────────────────────────────────
  const lmClassified = lms.map(lm => {
    const honored = lm.is_hof === 1 || lm.is_bap === 1;
    const name = lm.real_name ?? lm.display_name ?? '';
    const partner = resolvePartners(name, hpByNorm);
    return { lm, honored, partner };
  });

  // ── Cross-cohort forecast: dump-day auto-resolve candidates ────────────────
  // Pairs where an HP (no provenance) AND an LM (no provenance) exchange
  // a unique normalized name. These are the rows that will auto-link
  // when the dump attaches emails.
  const exactPairs = new Set<string>();
  const variantPairs = new Set<string>();
  for (const { hp, partner } of hpClassified) {
    if (partner.bucket === 'unique_name_matches_other') {
      const lmId = partner.ids[0]!;
      exactPairs.add(`${hp.person_id}::${lmId}`);
    } else if (partner.bucket === 'variant_assisted_match' && partner.ids.length === 1) {
      const lmId = partner.ids[0]!;
      variantPairs.add(`${hp.person_id}::${lmId}`);
    }
  }

  // ── Summary report ─────────────────────────────────────────────────────────
  const hpBuckets = countBy(hpClassified, c =>
    `${c.era}|${c.honored ? 'honored' : 'unhonored'}|${c.partner.bucket}`,
  );
  const lmBuckets = countBy(lmClassified, c =>
    `${c.honored ? 'honored' : 'unhonored'}|${c.partner.bucket}|${
      c.lm.first_competition_year != null ? 'has_first_yr' : 'no_first_yr'
    }`,
  );

  const hpByEra = countBy(hpClassified, c => c.era);
  const hpByHonor = countBy(hpClassified, c => c.honored ? 'honored' : 'unhonored');
  const hpByPartner = countBy(hpClassified, c => c.partner.bucket);
  const lmByPartner = countBy(lmClassified, c => c.partner.bucket);
  const lmByHonor = countBy(lmClassified, c => c.honored ? 'honored' : 'unhonored');
  const lmByFirstYr = countBy(lmClassified, c =>
    c.lm.first_competition_year != null ? 'has_first_competition_year' : 'no_first_competition_year',
  );

  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(  `║  UNRESOLVED-COHORT AUDIT                                   ║`);
  console.log(  `║  DB: ${dbPath.padEnd(54)}║`);
  console.log(  `╚════════════════════════════════════════════════════════════╝`);

  console.log(`\nCohort A — historical_persons WITHOUT legacy_member_id: ${hps.length}`);
  console.log('  By era:');
  for (const [k, v] of sortByCountDesc(hpByEra)) console.log(`    ${k.padEnd(26)} ${v}`);
  console.log('  By honor:');
  for (const [k, v] of sortByCountDesc(hpByHonor)) console.log(`    ${k.padEnd(26)} ${v}`);
  console.log('  By name-overlap with unresolved LMs:');
  for (const [k, v] of sortByCountDesc(hpByPartner)) console.log(`    ${k.padEnd(30)} ${v}`);

  console.log(`\nCohort B — legacy_members WITHOUT HP provenance: ${lms.length}`);
  console.log('  By honor:');
  for (const [k, v] of sortByCountDesc(lmByHonor)) console.log(`    ${k.padEnd(26)} ${v}`);
  console.log('  By first_competition_year:');
  for (const [k, v] of sortByCountDesc(lmByFirstYr)) console.log(`    ${k.padEnd(30)} ${v}`);
  console.log('  By name-overlap with unresolved HPs:');
  for (const [k, v] of sortByCountDesc(lmByPartner)) console.log(`    ${k.padEnd(30)} ${v}`);

  console.log(`\nDUMP-DAY FORECAST (exact + variant name-bridge, 1-to-1 pairs):`);
  console.log(`  Exact-name pairs (HP↔LM):    ${exactPairs.size}`);
  console.log(`  Variant-assisted pairs:      ${variantPairs.size}`);
  console.log(`  Total auto-resolve candidates: ${exactPairs.size + variantPairs.size}`);
  console.log(
    `  Residual HPs with no 1-to-1 partner: ${hps.length - exactPairs.size - variantPairs.size}` +
    `  (~${((1 - (exactPairs.size + variantPairs.size) / hps.length) * 100).toFixed(1)}% of cohort A)`,
  );

  // Most actionable cohorts
  console.log(`\nMOST ACTIONABLE DUMP-DAY COHORTS (ordered):`);
  const honoredUnique = hpClassified.filter(c =>
    c.honored && c.partner.bucket === 'unique_name_matches_other'
  ).length;
  const recentUnique = hpClassified.filter(c =>
    c.era === 'recent_2020_plus' && c.partner.bucket === 'unique_name_matches_other'
  ).length;
  const modernUnique = hpClassified.filter(c =>
    c.era === 'modern_2000_2019' && c.partner.bucket === 'unique_name_matches_other'
  ).length;
  console.log(`  Honored (BAP/HoF) + unique LM partner:       ${honoredUnique}`);
  console.log(`  Recent (2020+) + unique LM partner:          ${recentUnique}`);
  console.log(`  Modern (2000-2019) + unique LM partner:      ${modernUnique}`);

  const honoredLmsUniquePartner = lmClassified.filter(c =>
    c.honored && c.partner.bucket === 'unique_name_matches_other'
  ).length;
  const legacyAdmins = lmClassified.filter(c => c.lm.legacy_is_admin === 1).length;
  const activeLmsUniquePartner = lmClassified.filter(c =>
    c.lm.first_competition_year != null && c.partner.bucket === 'unique_name_matches_other'
  ).length;
  console.log(`  Honored LM (no HP) + unique HP partner:      ${honoredLmsUniquePartner}`);
  console.log(`  LM with first_competition_year + unique HP:  ${activeLmsUniquePartner}`);
  console.log(`  Legacy admins in the 245 cohort:             ${legacyAdmins}`);

  // ── CSV artifacts ──────────────────────────────────────────────────────────
  const hpCsv = path.join(OUT_DIR, 'unresolved_hp_cohort.csv');
  writeCsv(
    hpCsv,
    [
      'person_id', 'person_name', 'country',
      'first_year', 'last_year', 'event_count',
      'bap_member', 'hof_member',
      'era_bucket', 'honored', 'name_overlap_bucket',
      'partner_legacy_member_ids',
    ],
    hpClassified.map(c => [
      c.hp.person_id, c.hp.person_name, c.hp.country,
      c.hp.first_year, c.hp.last_year, c.hp.event_count,
      c.hp.bap_member, c.hp.hof_member,
      c.era, c.honored ? 1 : 0, c.partner.bucket,
      c.partner.ids.join('|'),
    ]),
  );

  const lmCsv = path.join(OUT_DIR, 'unresolved_lm_cohort.csv');
  writeCsv(
    lmCsv,
    [
      'legacy_member_id', 'real_name', 'display_name', 'country',
      'first_competition_year', 'is_hof', 'is_bap', 'legacy_is_admin',
      'honored', 'name_overlap_bucket',
      'partner_person_ids',
    ],
    lmClassified.map(c => [
      c.lm.legacy_member_id, c.lm.real_name, c.lm.display_name, c.lm.country,
      c.lm.first_competition_year, c.lm.is_hof, c.lm.is_bap, c.lm.legacy_is_admin,
      c.honored ? 1 : 0, c.partner.bucket,
      c.partner.ids.join('|'),
    ]),
  );

  console.log(`\nArtifacts written:`);
  console.log(`  ${hpCsv}`);
  console.log(`  ${lmCsv}`);

  db.close();
}

function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const k = key(it);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function sortByCountDesc(m: Record<string, number>): [string, number][] {
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

main();
