/**
 * Slice CL-1 — deterministic club-data hygiene fixes.
 *
 * Closes 11 high-confidence rows from the 2026-05-09 club-data audit:
 *   F1: 3 club names with double-spaces       → collapse runs of whitespace
 *   F2: 4 URLs starting with `http://https://` → strip leading `http://`
 *   F3: 4 placeholder/junk URLs                → set external_url = NULL
 *
 * Read-only by default; `--apply` writes inside a single transaction.
 * Always emits an audit CSV and a sibling rollback SQL with per-row
 * UPDATEs that restore the prior state.
 *
 * Per-row preconditions check that the column still holds the expected
 * pre-fix value; rows that have drifted are skipped with reason
 * `already_fixed` so the script is safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/cleanup-club-data-cl1.ts                     # dry-run
 *   npx tsx scripts/cleanup-club-data-cl1.ts --apply             # commit
 *   npx tsx scripts/cleanup-club-data-cl1.ts --db path/to.db
 *   npx tsx scripts/cleanup-club-data-cl1.ts --audit-dir path/   # default: ./out/cleanup
 */
import BetterSqlite3 from 'better-sqlite3';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

const DEFAULT_DB        = path.resolve(__dirname, '..', 'database', 'footbag.db');
const DEFAULT_AUDIT_DIR = path.resolve(__dirname, '..', 'out', 'cleanup');
const ACTOR             = 'system:cleanup-cl1';

interface NameFix {
  kind: 'name';
  id: string;
  current_name: string;
  new_name: string;
}

interface UrlFix {
  kind: 'url';
  id: string;
  current_url: string;
  new_url: string | null;
}

type Fix = NameFix | UrlFix;

// F1 — three names with internal double-space.
const NAME_FIXES: NameFix[] = [
  { kind: 'name', id: 'club_7708a9c255d1205ded153c47', current_name: 'Tu  Wat',                  new_name: 'Tu Wat' },
  { kind: 'name', id: 'club_a4e25f79b279c5a8f5c34ee1', current_name: 'NightXShadow  Footbag Club', new_name: 'NightXShadow Footbag Club' },
  { kind: 'name', id: 'club_0f2fe506ea83e9b35f7d222f', current_name: 'Marathon  Footbag Club',     new_name: 'Marathon Footbag Club' },
];

// F2 — `http://https://...` → strip the leading `http://` so the existing
// valid `https://...` URL surfaces.
const URL_PREFIX_FIXES: UrlFix[] = [
  { kind: 'url', id: 'club_626e4b84266bedca942e15d4', current_url: 'http://https://www.facebook.com/MANIACSportTeam',                       new_url: 'https://www.facebook.com/MANIACSportTeam' },
  { kind: 'url', id: 'club_8c645f63050d2b8102c55dd3', current_url: 'http://https://m.facebook.com/footbag.medellin',                         new_url: 'https://m.facebook.com/footbag.medellin' },
  { kind: 'url', id: 'club_ffe36e01d0ca7881e20d1f5c', current_url: 'http://https://www.facebook.com/groups/shredvan',                        new_url: 'https://www.facebook.com/groups/shredvan' },
  { kind: 'url', id: 'club_7ea35d812706d92138687490', current_url: 'http://https://www.facebook.com/groups/216661849514732/',               new_url: 'https://www.facebook.com/groups/216661849514732/' },
];

// F3 — placeholder/junk URLs that aren't navigable.
const URL_NULL_FIXES: UrlFix[] = [
  { kind: 'url', id: 'club_e3a32bc11e016e3369f0d4c8', current_url: 'http://-',           new_url: null },
  { kind: 'url', id: 'club_29d694a6b89083468c975f3d', current_url: 'http://Bienvenidos', new_url: null },
  { kind: 'url', id: 'club_32e2d136a68e0c1d47ba84dc', current_url: 'http://Coming',      new_url: null },
  { kind: 'url', id: 'club_e281326a16c36f817bad02a0', current_url: 'http://e-mail:',     new_url: null },
];

const ALL_FIXES: Fix[] = [...NAME_FIXES, ...URL_PREFIX_FIXES, ...URL_NULL_FIXES];

interface ApplyResult {
  applied: Array<{ id: string; kind: Fix['kind']; before: string; after: string | null }>;
  skipped: Array<{ id: string; kind: Fix['kind']; reason: string; detail: string }>;
}

interface CliOptions {
  db: string;
  apply: boolean;
  auditDir: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { db: DEFAULT_DB, apply: false, auditDir: DEFAULT_AUDIT_DIR };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') opts.apply = true;
    else if (a === '--db') opts.db = path.resolve(argv[++i]);
    else if (a === '--audit-dir') opts.auditDir = path.resolve(argv[++i]);
    else if (a === '--help' || a === '-h') {
      printHelpAndExit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      printHelpAndExit(2);
    }
  }
  return opts;
}

function printHelpAndExit(code: number): never {
  console.log(
    [
      'Usage: npx tsx scripts/cleanup-club-data-cl1.ts [--apply] [--db PATH] [--audit-dir DIR]',
      '',
      'Default is dry-run. Pass --apply to commit changes.',
    ].join('\n'),
  );
  process.exit(code);
}

export function planFixes(
  db: BetterSqlite3.Database,
): { applicable: Fix[]; result: ApplyResult } {
  const result: ApplyResult = { applied: [], skipped: [] };
  const applicable: Fix[] = [];
  const stmt = db.prepare<{ id: string }>(
    'SELECT id, name, external_url FROM clubs WHERE id = @id',
  );
  for (const fix of ALL_FIXES) {
    const row = stmt.get({ id: fix.id }) as
      | { id: string; name: string; external_url: string | null }
      | undefined;
    if (!row) {
      result.skipped.push({
        id: fix.id,
        kind: fix.kind,
        reason: 'club_not_found',
        detail: 'No row in clubs table',
      });
      continue;
    }
    if (fix.kind === 'name') {
      if (row.name !== fix.current_name) {
        result.skipped.push({
          id: fix.id,
          kind: 'name',
          reason: 'already_fixed',
          detail: `name is ${JSON.stringify(row.name)}, expected ${JSON.stringify(fix.current_name)}`,
        });
        continue;
      }
    } else {
      if (row.external_url !== fix.current_url) {
        result.skipped.push({
          id: fix.id,
          kind: 'url',
          reason: 'already_fixed',
          detail: `external_url is ${JSON.stringify(row.external_url)}, expected ${JSON.stringify(fix.current_url)}`,
        });
        continue;
      }
    }
    applicable.push(fix);
  }
  return { applicable, result };
}

export function applyFixes(
  db: BetterSqlite3.Database,
  fixes: Fix[],
  result: ApplyResult,
): void {
  const updateName = db.prepare(
    `UPDATE clubs
       SET name = @new_name,
           updated_at = datetime('now', 'subsec') || 'Z',
           updated_by = @actor,
           version    = version + 1
     WHERE id = @id`,
  );
  const updateUrl = db.prepare(
    `UPDATE clubs
       SET external_url = @new_url,
           external_url_validated_at = NULL,
           updated_at  = datetime('now', 'subsec') || 'Z',
           updated_by  = @actor,
           version     = version + 1
     WHERE id = @id`,
  );
  const txn = db.transaction((toApply: Fix[]) => {
    for (const fix of toApply) {
      if (fix.kind === 'name') {
        updateName.run({ id: fix.id, new_name: fix.new_name, actor: ACTOR });
        result.applied.push({ id: fix.id, kind: 'name', before: fix.current_name, after: fix.new_name });
      } else {
        updateUrl.run({ id: fix.id, new_url: fix.new_url, actor: ACTOR });
        result.applied.push({ id: fix.id, kind: 'url', before: fix.current_url, after: fix.new_url });
      }
    }
  });
  txn(fixes);
}

function csvEscape(value: string | null): string {
  if (value === null) return '';
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function writeAudit(
  auditDir: string,
  result: ApplyResult,
  applied: boolean,
): { auditPath: string; rollbackPath: string } {
  if (!existsSync(auditDir)) mkdirSync(auditDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = applied ? 'applied' : 'dry-run';
  const auditPath    = path.join(auditDir, `cleanup-club-data-cl1.${stamp}.${suffix}.csv`);
  const rollbackPath = path.join(auditDir, `cleanup-club-data-cl1.${stamp}.${suffix}.rollback.sql`);

  const auditLines = ['kind,id,status,before,after,detail'];
  for (const r of result.applied) {
    auditLines.push(
      [r.kind, r.id, applied ? 'applied' : 'planned', csvEscape(r.before), csvEscape(r.after), ''].join(','),
    );
  }
  for (const s of result.skipped) {
    auditLines.push([s.kind, s.id, 'skipped', '', '', csvEscape(`${s.reason}: ${s.detail}`)].join(','));
  }
  writeFileSync(auditPath, auditLines.join('\n') + '\n');

  // Rollback SQL — undo each applied/planned row. Safe to apply even if
  // the user has bumped version since; the WHERE matches by id only.
  const rb: string[] = [
    `-- Rollback for cleanup-club-data-cl1 ${stamp}`,
    `-- Restores the pre-fix value of name/external_url. Does NOT restore`,
    `-- the prior version number; running this re-bumps version on revert.`,
    `BEGIN TRANSACTION;`,
  ];
  for (const r of result.applied) {
    if (r.kind === 'name') {
      rb.push(
        `UPDATE clubs SET name = ${sqlString(r.before)}, updated_at = datetime('now', 'subsec') || 'Z', updated_by = '${ACTOR}-rollback', version = version + 1 WHERE id = '${r.id}';`,
      );
    } else {
      rb.push(
        `UPDATE clubs SET external_url = ${sqlString(r.before)}, external_url_validated_at = NULL, updated_at = datetime('now', 'subsec') || 'Z', updated_by = '${ACTOR}-rollback', version = version + 1 WHERE id = '${r.id}';`,
      );
    }
  }
  rb.push(`COMMIT;`);
  writeFileSync(rollbackPath, rb.join('\n') + '\n');
  return { auditPath, rollbackPath };
}

function sqlString(value: string | null): string {
  if (value === null) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

function printSummary(result: ApplyResult, applied: boolean): void {
  const verb = applied ? 'Applied' : 'Would apply';
  console.log(`\n${verb} ${result.applied.length} fixes; skipped ${result.skipped.length}:`);
  for (const r of result.applied) {
    const beforeStr = JSON.stringify(r.before);
    const afterStr  = r.after === null ? 'NULL' : JSON.stringify(r.after);
    console.log(`  [${r.kind}] ${r.id}  ${beforeStr} → ${afterStr}`);
  }
  for (const s of result.skipped) {
    console.log(`  SKIP [${s.kind}] ${s.id}  (${s.reason}) ${s.detail}`);
  }
}

function main(): number {
  const opts = parseArgs(process.argv.slice(2));
  if (!existsSync(opts.db)) {
    console.error(`ERROR: database not found at ${opts.db}`);
    return 1;
  }
  const db = new BetterSqlite3(opts.db);
  try {
    db.pragma('foreign_keys = ON');
    const { applicable, result } = planFixes(db);
    if (opts.apply) {
      applyFixes(db, applicable, result);
    } else {
      // Dry-run: pre-populate `applied` with the planned diffs (under the
      // 'planned' status) so the audit CSV and summary match the apply
      // shape exactly.
      for (const fix of applicable) {
        if (fix.kind === 'name') {
          result.applied.push({ id: fix.id, kind: 'name', before: fix.current_name, after: fix.new_name });
        } else {
          result.applied.push({ id: fix.id, kind: 'url',  before: fix.current_url,  after: fix.new_url });
        }
      }
    }
    printSummary(result, opts.apply);
    const { auditPath, rollbackPath } = writeAudit(opts.auditDir, result, opts.apply);
    console.log(`\nAudit:    ${auditPath}`);
    console.log(`Rollback: ${rollbackPath}`);
    if (!opts.apply) {
      console.log('\n(dry-run; pass --apply to commit)');
    }
    return 0;
  } finally {
    db.close();
  }
}

if (require.main === module) {
  process.exit(main());
}
