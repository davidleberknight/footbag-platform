/**
 * Dev-admin seed script. Direct-inserts admin members into the live DB
 * for dev/staging only. Migration-window-only on staging; removed at
 * production cutover (see ./README.md).
 *
 * Each entry becomes a Tier 2 member with `is_admin=1`. Tier 2 is
 * required because admin role gates on Tier 2+ throughout the platform
 * (e.g., assertTier1Benefits in curatorMediaService).
 *
 * Detection markers:
 *   - `member_tier_grants.reason_code = 'dev_admin_seed.admin_tier2'`
 *   - `audit_entries.action_type      = 'grant_admin_dev_seed'`
 *   - `member_tier_grants.created_by  = 'dev-shortcuts/seed'`
 * Grep all three to zero before any production deploy.
 *
 * Input source:
 *   1. If FOOTBAG_DEV_ADMIN_SEED_JSON env-var is set, parse it as a
 *      compact JSON array. This is the staging path: the deploy pipeline
 *      pipes .local/staging-admin-seed.json through `jq -c` into this
 *      env-var, and a docker compose exec inside the web container
 *      runs this script (compiled JS) with the env-var present.
 *   2. Otherwise, read .local/dev-admin-seed.json from the repo root
 *      (JSONC-tolerant: `//` line comments are stripped before parsing).
 *      This is the dev path: maintainer creates the file locally and
 *      runs `./scripts/manage-dev-admin-seed.sh --seed-dev-admins` (or
 *      `./run_dev.sh --seed-dev-admins`).
 *
 * Missing seed input is FATAL (exit 1). The operator explicitly opted
 * in by passing --seed-dev-admins; silent no-ops would mask a forgotten
 * .local/dev-admin-seed.json or an unset env-var on the staging path.
 *
 * Env guard: ./seedConfig throws on import unless FOOTBAG_ENV is
 * 'development' or 'staging'. Production is hard-blocked.
 *
 * Idempotent: re-running on an existing member whose latest tier grant
 * already carries the dev-admin-seed marker is a no-op. Members that
 * exist without the marker (e.g., real accounts colliding on
 * login_email) are reported as conflicts; this script does not modify
 * them.
 *
 * Exit codes:
 *   0 success (one or more entries seeded, or already-marked
 *     idempotent no-op rows)
 *   1 fatal (DB missing, JSON malformed, no seed input found, empty
 *     seed array)
 *   2 one or more conflicts (member exists without dev-admin-seed marker)
 *
 * Usage (dev, via tsx):
 *   FOOTBAG_ENV=development npx tsx src/dev-bootstrap/seed.ts
 *   FOOTBAG_ENV=development FOOTBAG_DB_PATH=./custom.db \
 *     npx tsx src/dev-bootstrap/seed.ts
 *
 * Usage (staging, compiled):
 *   FOOTBAG_ENV=staging FOOTBAG_DEV_ADMIN_SEED_JSON='[...]' \
 *     node dist/dev-bootstrap/seed.js
 */
import argon2 from 'argon2';
import BetterSqlite3 from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  DEV_ADMIN_SEED_PASSWORD_LITERAL,
  DEV_ADMIN_SEED_REASON_CODE,
  DEV_ADMIN_SEED_REASON_TEXT,
  DEV_ADMIN_SEED_AUDIT_ACTION_TYPE,
  DEV_ADMIN_SEED_CREATED_BY,
  DEV_ADMIN_SEED_ENV_VAR_NAME,
  DEV_ADMIN_SEED_DEV_FILE_PATH,
} from './seedConfig';
import { parseDbArg, stripJsonComments } from '../testkit/seedCli';

export interface SeedEntry {
  loginEmail: string;
  displayName: string;
  realName: string;
  /** Optional override; defaults to 'tier2' since admin requires Tier 2+. */
  tier?: 'tier2' | 'tier3';
}

function parseSeedJson(raw: string, sourceLabel: string): SeedEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(raw));
  } catch (err) {
    throw new Error(`${sourceLabel}: not valid JSON (${(err as Error).message})`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${sourceLabel}: top-level must be an array of entries`);
  }
  const out: SeedEntry[] = [];
  for (const [i, entry] of parsed.entries()) {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`${sourceLabel}[${i}]: must be an object`);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.loginEmail !== 'string' || e.loginEmail.length === 0) {
      throw new Error(`${sourceLabel}[${i}]: loginEmail must be a non-empty string`);
    }
    if (typeof e.displayName !== 'string' || e.displayName.length === 0) {
      throw new Error(`${sourceLabel}[${i}]: displayName must be a non-empty string`);
    }
    if (typeof e.realName !== 'string' || e.realName.length === 0) {
      throw new Error(`${sourceLabel}[${i}]: realName must be a non-empty string`);
    }
    const tier = e.tier;
    if (tier !== undefined && tier !== 'tier2' && tier !== 'tier3') {
      throw new Error(`${sourceLabel}[${i}]: tier must be 'tier2' or 'tier3' if present`);
    }
    out.push({
      loginEmail: e.loginEmail,
      displayName: e.displayName,
      realName: e.realName,
      ...(tier !== undefined ? { tier } : {}),
    });
  }
  return out;
}

interface SeedInput {
  entries: SeedEntry[];
  source: 'env' | 'file';
}

function readSeedInput(repoRoot: string): SeedInput | null {
  const envRaw = process.env[DEV_ADMIN_SEED_ENV_VAR_NAME];
  if (envRaw !== undefined && envRaw.length > 0) {
    return { entries: parseSeedJson(envRaw, `${DEV_ADMIN_SEED_ENV_VAR_NAME} env`), source: 'env' };
  }
  const fullPath = path.join(repoRoot, DEV_ADMIN_SEED_DEV_FILE_PATH);
  if (!existsSync(fullPath)) {
    return null;
  }
  const raw = readFileSync(fullPath, 'utf8');
  return { entries: parseSeedJson(raw, DEV_ADMIN_SEED_DEV_FILE_PATH), source: 'file' };
}

interface ExistingMemberRow {
  id: string;
  is_admin: number;
}

interface LatestTierGrantRow {
  reason_code: string;
}

export async function seedOne(
  db: BetterSqlite3.Database,
  entry: SeedEntry,
  passwordHash: string,
  now: string,
): Promise<'created' | 'noop' | 'conflict'> {
  const loginEmail = entry.loginEmail.trim();
  const loginEmailNormalized = loginEmail.toLowerCase();
  const displayNameNormalized = entry.displayName.trim().toLowerCase();
  const tier = entry.tier ?? 'tier2';

  const existing = db
    .prepare(
      `SELECT id, is_admin FROM members WHERE login_email_normalized = ?`,
    )
    .get(loginEmailNormalized) as ExistingMemberRow | undefined;

  if (existing) {
    const latest = db
      .prepare(
        `SELECT reason_code
         FROM member_tier_grants
         WHERE member_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
      )
      .get(existing.id) as LatestTierGrantRow | undefined;
    if (latest?.reason_code === DEV_ADMIN_SEED_REASON_CODE) {
      return 'noop';
    }
    return 'conflict';
  }

  const memberId = `member_devseed_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const slug = `devseed_${loginEmailNormalized.replace(/[^a-z0-9]+/g, '_').slice(0, 40)}`;
  const tierGrantId = `mtg_devseed_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const auditId = `audit_devseed_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO members (
         id, slug, created_at, created_by, updated_at, updated_by, version,
         login_email, login_email_normalized, email_verified_at, email_status,
         password_hash, password_hash_version, password_version, password_changed_at,
         real_name, display_name, display_name_normalized,
         is_admin, is_system, is_board, is_hof, is_bap, is_deceased
       ) VALUES (
         ?, ?, ?, ?, ?, ?, 1,
         ?, ?, ?, 'ok',
         ?, 1, 1, ?,
         ?, ?, ?,
         1, 0, 0, 0, 0, 0
       )`,
    ).run(
      memberId, slug, now, DEV_ADMIN_SEED_CREATED_BY, now, DEV_ADMIN_SEED_CREATED_BY,
      loginEmail, loginEmailNormalized, now,
      passwordHash, now,
      entry.realName, entry.displayName, displayNameNormalized,
    );

    db.prepare(
      `INSERT INTO member_tier_grants (
         id, created_at, created_by,
         member_id, actor_member_id,
         change_type,
         old_tier_status, new_tier_status,
         old_underlying_tier_status, new_underlying_tier_status,
         reason_code, reason_text,
         related_payment_id
       ) VALUES (?, ?, ?, ?, NULL, 'grant', 'tier0', ?, NULL, NULL, ?, ?, NULL)`,
    ).run(
      tierGrantId, now, DEV_ADMIN_SEED_CREATED_BY,
      memberId,
      tier,
      DEV_ADMIN_SEED_REASON_CODE, DEV_ADMIN_SEED_REASON_TEXT,
    );

    db.prepare(
      `INSERT INTO audit_entries (
         id, created_at, created_by,
         occurred_at, actor_type, actor_member_id,
         action_type, entity_type, entity_id,
         category, reason_text, metadata_json
       ) VALUES (?, ?, ?, ?, 'system', NULL, ?, 'member', ?, 'identity', ?, ?)`,
    ).run(
      auditId, now, DEV_ADMIN_SEED_CREATED_BY,
      now,
      DEV_ADMIN_SEED_AUDIT_ACTION_TYPE, memberId,
      DEV_ADMIN_SEED_REASON_TEXT,
      JSON.stringify({ tier, login_email: loginEmail, source: DEV_ADMIN_SEED_CREATED_BY }),
    );
  });
  tx();
  return 'created';
}

async function main(): Promise<number> {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const { dbPath } = parseDbArg(process.argv.slice(2));
  const env = process.env.FOOTBAG_ENV ?? '<unset>';

  const input = readSeedInput(repoRoot);
  if (input === null) {
    console.error(
      `[dev-admin-seed] FAIL: no seed input (env=${env}, ${DEV_ADMIN_SEED_ENV_VAR_NAME} unset, ${DEV_ADMIN_SEED_DEV_FILE_PATH} missing). Operator passed --seed-dev-admins with nothing to seed; refusing to silently no-op.`,
    );
    return 1;
  }
  console.log(`[dev-admin-seed] env=${env} source=${input.source} entries=${input.entries.length}`);
  if (input.entries.length === 0) {
    console.error(
      `[dev-admin-seed] FAIL: empty seed array in ${input.source === 'env' ? DEV_ADMIN_SEED_ENV_VAR_NAME : DEV_ADMIN_SEED_DEV_FILE_PATH}. Refusing to silently no-op.`,
    );
    return 1;
  }

  if (!existsSync(dbPath)) {
    console.error(`[dev-admin-seed] DB file not found: ${dbPath}`);
    return 1;
  }

  const passwordHash = await argon2.hash(DEV_ADMIN_SEED_PASSWORD_LITERAL);
  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  let created = 0;
  let noop = 0;
  let conflict = 0;
  try {
    for (const entry of input.entries) {
      const now = new Date().toISOString();
      const result = await seedOne(db, entry, passwordHash, now);
      if (result === 'created') {
        created += 1;
        console.log(`[dev-admin-seed] seeded admin: ${entry.loginEmail}`);
      } else if (result === 'noop') {
        noop += 1;
        console.log(`[dev-admin-seed] no-op (dev-admin-seed marker present): ${entry.loginEmail}`);
      } else {
        conflict += 1;
        console.warn(
          `[dev-admin-seed] CONFLICT (member exists without dev-admin-seed marker; not modifying): ${entry.loginEmail}`,
        );
      }
    }
  } finally {
    db.close();
  }

  console.log(
    `[dev-admin-seed] done. created=${created} noop=${noop} conflict=${conflict}`,
  );
  return conflict > 0 ? 2 : 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[dev-admin-seed] fatal:', err);
      process.exit(1);
    });
}
