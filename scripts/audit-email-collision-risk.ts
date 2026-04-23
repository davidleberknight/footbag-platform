/**
 * Email-collision risk audit for `legacy_members`.
 *
 * Read-only. Scans `legacy_members.legacy_email`, normalizes with
 * trim + lowercase + whitespace collapse, and reports groups of 2+ rows
 * sharing a normalized email.
 *
 * Schema note: `legacy_members` carries a partial UNIQUE index on
 * `legacy_email WHERE legacy_email IS NOT NULL`, so same-column email
 * duplicates cannot persist — an import attempting to land duplicates
 * will fail at INSERT time. This audit therefore serves two roles:
 *
 *   1. Pre-import pre-flight: run against a staging copy of the dump
 *      BEFORE loading into the production schema, so operators can
 *      detect duplicates and clean them up without a failed import.
 *   2. Invariant watchdog: if the UNIQUE index is ever relaxed, this
 *      script catches the regression.
 *
 * Runtime ambiguity from within the app is possible via cross-column
 * collisions (same string appearing in `legacy_email` on one row and
 * `legacy_user_id` on another); that path is covered by the
 * `ambiguous_email` branch in `lookupLegacyAccount`, not by this audit.
 *
 * Usage:
 *   npx tsx scripts/audit-email-collision-risk.ts [--db path]
 */
import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

const DEFAULT_DB = path.resolve(__dirname, '..', 'database', 'footbag.db');

function parseArgs(): { db: string; topN: number } {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--db');
  const t = argv.indexOf('--top');
  return {
    db: i >= 0 ? argv[i + 1] : DEFAULT_DB,
    topN: t >= 0 ? Number(argv[t + 1]) : 10,
  };
}

function normalizeEmail(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.split(/\s+/).filter(Boolean).join('');
}

interface Row {
  legacy_member_id: string;
  legacy_email: string | null;
  display_name: string | null;
  real_name: string | null;
}

function hrule() { console.log('─'.repeat(78)); }

function main(): number {
  const { db: dbPath, topN } = parseArgs();
  if (!existsSync(dbPath)) {
    console.error(`ERROR: DB not found at ${dbPath}`);
    return 1;
  }

  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db.prepare(
    `SELECT legacy_member_id, legacy_email, display_name, real_name
       FROM legacy_members`,
  ).all() as Row[];
  db.close();

  const withEmail = rows.filter((r) => r.legacy_email && r.legacy_email.trim().length > 0);
  const groups = new Map<string, Row[]>();
  for (const r of withEmail) {
    const key = normalizeEmail(r.legacy_email);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const collisionGroups = [...groups.entries()].filter(([, list]) => list.length > 1);
  const totalRowsInCollisions = collisionGroups.reduce((sum, [, list]) => sum + list.length, 0);
  collisionGroups.sort((a, b) => (b[1].length - a[1].length) || (a[0] < b[0] ? -1 : 1));

  console.log();
  console.log('  Email-collision risk audit');
  console.log(`  DB: ${dbPath}`);
  hrule();
  console.log(`  legacy_members rows total:                ${rows.length}`);
  console.log(`  legacy_members with non-empty email:      ${withEmail.length}`);
  console.log(`  unique normalized emails:                 ${groups.size}`);
  console.log(`  email collision groups (size ≥ 2):        ${collisionGroups.length}`);
  console.log(`  rows involved in collisions:              ${totalRowsInCollisions}`);
  hrule();

  if (collisionGroups.length === 0) {
    console.log('  No email collisions. Safe.');
    hrule();
    console.log();
    return 0;
  }

  console.log(`  Top ${Math.min(topN, collisionGroups.length)} collision groups (normalized email → rows):`);
  for (let i = 0; i < Math.min(topN, collisionGroups.length); i++) {
    const [normalized, list] = collisionGroups[i]!;
    console.log(`    ${normalized}   (${list.length} rows)`);
    for (const r of list) {
      const name = (r.real_name && r.real_name.trim()) || r.display_name || '(no name)';
      console.log(`      · ${r.legacy_member_id.padEnd(16, ' ')} ${name}`);
    }
  }
  hrule();
  console.log();
  return 0;
}

process.exit(main());
