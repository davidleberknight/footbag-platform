/**
 * Registration-time admin bootstrap for development and staging: the
 * email-allowlist path. A member who registers with a normalized login email
 * on the operator allowlist is granted is_admin=1 + a Tier 2 ledger row + an
 * audit row atomically, and then completes the normal email-verification step
 * before logging in. The allowlist comes from FOOTBAG_DEV_INITIAL_ADMIN_EMAILS
 * (staging, injected by the deploy pipeline) or the gitignored
 * `.local/initial-admins.txt` file (local dev).
 *
 * This is the permanent dev/staging peer of the production first-admin
 * mechanism (the single-shot SSM-token claim at `/admin/bootstrap-claim`, owned
 * by adminBootstrapService); the two share no env vars and no code paths beyond
 * the tier-grant primitive. It is environment-isolated and kept out of the
 * production runtime image, like the persona harness. Production is protected by
 * three layers: the env-config boot fail-fast on FOOTBAG_DEV_INITIAL_ADMIN_EMAILS,
 * the deploy-pipeline refusal to write that var on a production host, and the
 * production image stub that makes applyDevStagingBootstrapAdmin a no-op.
 */
import { readFileSync } from 'node:fs';
import { registration, transaction } from '../db/db';
import { config } from '../config/env';
import { appendAuditEntry } from '../services/auditService';
import { applyAdminTier2InvariantGrantInTx } from '../services/membershipTieringService';


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

