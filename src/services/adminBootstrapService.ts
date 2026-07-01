/**
 * AdminBootstrapService -- production first-admin bootstrap.
 *
 * Owns the single-shot SSM-token claim: a signed-in member submits the
 * operator-provisioned token; on a constant-time match the member receives
 * is_admin=1 plus the Tier 2 invariant grant plus the admin.bootstrap_grant
 * audit row in one transaction. The grant is single-shot because it fires only
 * while no admin exists, so a concurrent or later claim that finds an admin
 * already present grants nothing and returns the same non-revealing result;
 * the in-database invariant, not the timing of the token deletion, is what
 * closes the path. The SSM parameter is deleted after a successful grant as
 * cleanup. Every failure shape (absent, mismatch, malformed, already-closed)
 * returns the same non-revealing result so the endpoint cannot be used to
 * probe token state.
 *
 * The claim is rate-limited per IP and per member over a configurable window
 * (config keys bootstrap_claim_rate_limit_max_per_ip / _per_member, default 5;
 * bootstrap_claim_rate_limit_window_minutes, default 60). Both limits throw
 * RateLimitedError, which the controller maps to HTTP 429 with Retry-After and
 * the same non-revealing body as every other failure shape.
 *
 * Does not own: steady-state admin grants (A_Manage_Admin_Role) or the
 * dev/staging allowlist bootstrap (src/dev-bootstrap/runtime.ts).
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { registration, transaction } from '../db/db';
import { config } from '../config/env';
import { getSecretsAdapter } from '../adapters/secretsAdapter';
import { applyAdminTier2InvariantGrantInTx } from './membershipTieringService';
import { recordOperationalError } from './operationalErrors';
import { hit as rateLimitHit } from './rateLimitService';
import { readIntConfig } from './configReader';
import { RateLimitedError } from './serviceErrors';

function tokenParameterName(): string {
  // footbagEnv is unset on workstations (no AWS prefix); the development
  // name keeps the flow exercisable locally against the stub adapter.
  return `/footbag/${config.footbagEnv ?? 'development'}/app/bootstrap/admin_token`;
}

function constantTimeMatch(a: string, b: string): boolean {
  // Hash both sides so the comparison length never depends on the inputs.
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export type BootstrapClaimResult = { status: 'granted' } | { status: 'invalid' };

async function claimBootstrapAdmin(
  memberId: string,
  submittedToken: string,
  ip: string,
): Promise<BootstrapClaimResult> {
  const windowMinutes = readIntConfig('bootstrap_claim_rate_limit_window_minutes', 60);
  const ipRl = rateLimitHit(`bootstrap-claim-ip:${ip}`, readIntConfig('bootstrap_claim_rate_limit_max_per_ip', 5), windowMinutes);
  if (!ipRl.allowed) {
    throw new RateLimitedError('Too many attempts. Please try again later.', ipRl.retryAfterSeconds);
  }
  const memberRl = rateLimitHit(`bootstrap-claim:${memberId}`, readIntConfig('bootstrap_claim_rate_limit_max_per_member', 5), windowMinutes);
  if (!memberRl.allowed) {
    throw new RateLimitedError('Too many attempts. Please try again later.', memberRl.retryAfterSeconds);
  }

  const token = submittedToken.trim();
  if (!token) return { status: 'invalid' };

  const stored = await getSecretsAdapter().getAbsolute(tokenParameterName());
  if (stored === undefined) return { status: 'invalid' };
  if (!constantTimeMatch(token, stored)) return { status: 'invalid' };

  const now = new Date().toISOString();
  let granted = false;
  transaction(() => {
    // The grant fires only while no admin exists. A concurrent second claim
    // runs its synchronous transaction after this one commits, finds an admin
    // present, changes zero rows, and skips the tier grant below. This holds
    // the single-admin-creation invariant in the database rather than relying
    // on the external SSM-token deletion winning the race.
    if (registration.grantFirstAdmin.run(now, memberId).changes === 0) return;
    // The tier primitive writes both the Tier 2 ledger row and the
    // admin.bootstrap_grant audit row (its action-type routing treats every
    // non-dev reason code as the production bootstrap).
    applyAdminTier2InvariantGrantInTx(
      memberId,
      'admin_bootstrap.admin_tier2',
      { via: 'bootstrap_claim', env: config.footbagEnv ?? 'development' },
    );
    granted = true;
  });

  // An admin already existed, so the bootstrap is closed. Return the same
  // non-revealing shape every other failure path returns; leave the token for
  // the operator since the DB invariant, not its deletion, closes the path.
  if (!granted) return { status: 'invalid' };

  // Consume the single shot. Deletion failure leaves the grant in place
  // (it committed) but the token open: loud operational signal so the
  // operator deletes the parameter by hand.
  try {
    await getSecretsAdapter().deleteAbsolute(tokenParameterName());
  } catch (err) {
    recordOperationalError({
      actionType: 'admin.bootstrap_token_delete_failed',
      category:   'admin',
      entityType: 'member',
      entityId:   memberId,
      reasonText: 'Bootstrap admin granted but the SSM token parameter could not be deleted; delete it manually.',
      cause:      err,
      metadata:   { parameter: tokenParameterName() },
    });
  }

  return { status: 'granted' };
}

export const adminBootstrapService = { claimBootstrapAdmin };
