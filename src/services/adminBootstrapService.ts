/**
 * AdminBootstrapService -- production first-admin bootstrap.
 *
 * Owns the single-shot SSM-token claim: a signed-in member submits the
 * operator-provisioned token; on a constant-time match the member receives
 * is_admin=1 plus the Tier 2 invariant grant plus the grant_admin_bootstrap
 * audit row in one transaction, and the SSM parameter is deleted so the
 * bootstrap closes. The parameter's absence closes the path; every failure
 * shape (absent, mismatch, malformed) returns the same non-revealing
 * result so the endpoint cannot be used to probe token state.
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
  transaction(() => {
    registration.setAdminFlagOnRegister.run(now, memberId);
    // The tier primitive writes both the Tier 2 ledger row and the
    // grant_admin_bootstrap audit row (its action-type routing treats every
    // non-dev reason code as the production bootstrap).
    applyAdminTier2InvariantGrantInTx(
      memberId,
      'admin_bootstrap.admin_tier2',
      { via: 'bootstrap_claim', env: config.footbagEnv ?? 'development' },
    );
  });

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
