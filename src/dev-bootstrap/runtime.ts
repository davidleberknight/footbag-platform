/**
 * Runtime logic for the dev shortcuts (dev + staging only). The whole
 * surface — this file, the seed script, the shared seedConfig — exists to
 * be removed at production cutover; every consumer is marked with
 * `// CUTOVER-REMOVE` at its callsite.
 *
 * Inventory of dev shortcuts the project supports:
 *   - FOOTBAG_DEV_INITIAL_ADMIN_EMAILS (env var; deploy script seeds it
 *     from workstation `.local/initial-admins.txt`). Dev + staging only.
 *       At registration time, members whose email matches this allowlist
 *       are atomically granted is_admin=1 + Tier 2 ledger row + audit row
 *       in one transaction. Production has a separate single-shot bootstrap
 *       path (SSM-token claim via `/admin/bootstrap-claim`, owned by
 *       adminBootstrapService).
 *   - FOOTBAG_DEV_ADMIN_GRANT_TIER2
 *       Backfill repair pass for legacy admin accounts that pre-date the
 *       unified bootstrap. Iterates is_admin=1 members and writes a Tier 2
 *       grant for any whose ledger lags. Dev only.
 *   - Dev-admin seed direct-insert via `./scripts/manage-dev-admin-seed.sh
 *     --seed-dev-admins` (separate explicit operator script in ./seed.ts;
 *     this module reports its presence in the boot banner but does not
 *     auto-run it). Dev + staging only.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { account, registration, transaction } from '../db/db';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { appendAuditEntry } from '../services/auditService';
import {
  applyAdminTier2InvariantGrant,
  applyAdminTier2InvariantGrantInTx,
} from '../services/membershipTieringService';


export interface InitialAdminEmailsOptions {
  footbagEnv?: string;
  filePath?: string;
  envEmails?: string;
}

/**
 * Read the operator-supplied initial-admin email allowlist and return a Set of
 * normalized emails. Two sources, in precedence order:
 *
 *   1. `FOOTBAG_DEV_INITIAL_ADMIN_EMAILS` env var (comma-separated). Populated
 *      by the deploy script on staging from `.local/initial-admins.txt`. When
 *      present and non-blank, this is the source.
 *   2. The file at `config.initialAdminFile` (default `.local/initial-admins.txt`).
 *      Plain text, one email per line. `#` introduces a line comment. Used on
 *      local dev where the file is reachable from process CWD.
 *
 * Both sources trim and lowercase emails to match `login_email_normalized`.
 * Read on every call: the operator may edit the source between registrations
 * and expect the next registration to pick up the change.
 *
 * Returns an empty Set unless `footbagEnv` is 'development' or 'staging'
 * (defense-in-depth; env.ts also fails fast on the env var in production).
 *
 * Exported for testability; production callers should use
 * `applyDevStagingBootstrapAdmin` instead of consulting this helper directly.
 */
export function getInitialAdminEmails(
  opts: InitialAdminEmailsOptions = {},
): Set<string> {
  const footbagEnv = opts.footbagEnv ?? config.footbagEnv;
  const filePath = opts.filePath ?? config.initialAdminFile;
  const envEmails =
    opts.envEmails ?? process.env.FOOTBAG_DEV_INITIAL_ADMIN_EMAILS;

  // Permit only when FOOTBAG_ENV is explicitly 'development' or 'staging'.
  // env.ts boot-fail-fasts when FOOTBAG_DEV_INITIAL_ADMIN_EMAILS is set
  // alongside FOOTBAG_ENV=production, so the env-var path is already
  // closed; this defense-in-depth backstop additionally refuses the
  // file-path fallback when FOOTBAG_ENV is unset or any value other than
  // dev/staging, closing the silent-failure mode where a misconfigured
  // deploy without an explicit FOOTBAG_ENV could read .local/initial-admins.txt.
  if (footbagEnv !== 'development' && footbagEnv !== 'staging') {
    return new Set();
  }

  if (envEmails && envEmails.trim()) {
    const emails = new Set<string>();
    for (const item of envEmails.split(',')) {
      const stripped = item.trim().toLowerCase();
      if (stripped) emails.add(stripped);
    }
    return emails;
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return new Set();
  }

  const emails = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const stripped = line.split('#', 1)[0]?.trim();
    if (!stripped) continue;
    emails.add(stripped.toLowerCase());
  }
  return emails;
}

interface ApplyDevStagingBootstrapAdminArgs {
  memberId: string;
  normalizedEmail: string;
  now: string;
}

/**
 * Dev/staging-only first-admin provisioning. Called from registerMember after
 * the new members row is inserted. When the registrant's email matches the
 * allowlist (via env var or `.local/initial-admins.txt`), atomically:
 *
 *   - sets `is_admin = 1` on the new member
 *   - writes a Tier 2 grant ledger row (admin role requires Tier 2+)
 *   - writes a single `audit_entries` row with
 *     action_type='admin.dev_register_allowlist_grant'
 *
 * Returns `{applied: false}` when not in dev/staging or when the email does
 * not match. Production has a separate single-shot bootstrap mechanism (SSM
 * token claim).
 *
 * The two writes (admin flag + Tier 2 grant) plus their audit rows live in one
 * transaction, so a fresh bootstrap-admin always satisfies the admin↔Tier 2
 * invariant immediately after registration.
 */
export function applyDevStagingBootstrapAdmin(
  args: ApplyDevStagingBootstrapAdminArgs,
): { applied: boolean } {
  // Same tightened guard as getInitialAdminEmails: permit only when
  // FOOTBAG_ENV is explicitly 'development' or 'staging'. Defense in depth
  // with the env.ts boot-fail-fast on FOOTBAG_DEV_INITIAL_ADMIN_EMAILS.
  if (
    config.footbagEnv !== 'development' &&
    config.footbagEnv !== 'staging'
  ) {
    return { applied: false };
  }
  const allowlist = getInitialAdminEmails();
  if (!allowlist.has(args.normalizedEmail)) {
    return { applied: false };
  }
  return transaction(() => {
    registration.setAdminFlagOnRegister.run(args.now, args.memberId);
    appendAuditEntry({
      actionType: 'admin.dev_register_allowlist_grant',
      category: 'admin',
      actorType: 'system',
      actorMemberId: null,
      entityType: 'member',
      entityId: args.memberId,
      reasonText: 'Initial-admin via dev/staging email-allowlist at registration',
      metadata: { via: 'register', env: config.footbagEnv },
    });
    applyAdminTier2InvariantGrantInTx(
      args.memberId,
      'dev_admin_register_allowlist.admin_tier2',
      { via: 'register', env: config.footbagEnv },
    );
    return { applied: true };
  });
}

interface AdminBelowTier2Row {
  id: string;
}

/**
 * Inserts a Tier 2 grant for every is_admin=1 member whose current
 * tier is below tier2. The platform admin role requires Tier 2+ as a
 * prerequisite; this brings dev workstations into compliance when the
 * legacy data dump or seed flow has not been run cleanly. Idempotent
 * (already-tier2+ members skipped).
 *
 * No-op unless FOOTBAG_ENV=development AND
 * FOOTBAG_DEV_ADMIN_GRANT_TIER2=1. The reason_code and audit
 * action_type are unique markers; pre-deploy grep should confirm zero
 * rows in any production database.
 */
export interface RepairAdminTier2InvariantOpts {
  /** Override for config.footbagEnv; exported for testability. */
  footbagEnv?: string;
  /** Override for config.devAdminGrantTier2; exported for testability. */
  devAdminGrantTier2?: boolean;
}

export function repairAdminTier2Invariant(
  opts: RepairAdminTier2InvariantOpts = {},
): {
  repaired: number;
  skipped: number;
} {
  const footbagEnv = opts.footbagEnv ?? config.footbagEnv;
  const devAdminGrantTier2 = opts.devAdminGrantTier2 ?? config.devAdminGrantTier2;
  if (footbagEnv !== 'development' || !devAdminGrantTier2) {
    return { repaired: 0, skipped: 0 };
  }

  const adminRows = account.listAdminMemberIds.all() as AdminBelowTier2Row[];
  let repaired = 0;
  let skipped = 0;

  for (const row of adminRows) {
    const result = applyAdminTier2InvariantGrant(
      row.id,
      'dev_admin_invariant_repair',
      { source: 'dev-shortcuts/runtime' },
    );
    if (result.applied) {
      repaired += 1;
    } else {
      skipped += 1;
    }
  }

  return { repaired, skipped };
}

/**
 * Boot orchestrator. Prints the consolidated dev-shortcuts banner
 * and runs the admin tier2 invariant repair when its flag is set. Safe
 * to call unconditionally; it short-circuits in non-development
 * environments.
 */
export function initDevShortcuts(): void {
  if (config.footbagEnv !== 'development') return;

  let repairSummary: { repaired: number; skipped: number } | null = null;
  if (config.devAdminGrantTier2) {
    try {
      repairSummary = repairAdminTier2Invariant();
    } catch (err) {
      logger.warn('dev admin tier2 invariant repair failed', { error: String(err) });
    }
  }

  // Lazy import: seedConfig throws at module load when FOOTBAG_ENV is not
  // 'development' or 'staging'. initDevShortcuts is only called from
  // server boot under FOOTBAG_ENV=development, so the import is normally
  // safe. Wrap in try/catch defensively.
  let seedFilePresent = false;
  try {
    const { DEV_ADMIN_SEED_DEV_FILE_PATH } = require('./seedConfig') as {
      DEV_ADMIN_SEED_DEV_FILE_PATH: string;
    };
    const seedFilePath = path.resolve(
      __dirname,
      '..',
      '..',
      DEV_ADMIN_SEED_DEV_FILE_PATH,
    );
    seedFilePresent = existsSync(seedFilePath);
  } catch (err) {
    logger.warn('dev-shortcuts: seedConfig import failed', { error: String(err) });
  }

  logger.info('dev shortcuts', {
    persona_switch: 'GET /dev/switch?as=<slug>',
    admin_tier2_repair: config.devAdminGrantTier2
      ? `yes (repaired=${repairSummary?.repaired ?? 0}, skipped=${repairSummary?.skipped ?? 0})`
      : 'no',
    dev_admin_seed_file: seedFilePresent ? 'present' : 'absent',
  });
}
