/**
 * Tier-status predicates composing getTierStatus and activePlayerService.getStatus.
 *
 * Admin short-circuit: any member with `is_admin = 1` satisfies all tier
 * predicates regardless of their member_tier_grants state. The operational
 * invariant (admins always hold Tier 2+) is a governance rule enforced
 * nowhere at the schema or service layer; this predicate gate
 * is the single point that makes the invariant true for callers.
 *
 * Unknown-member handling: predicates return `false` (no entitlement) when
 * `getTierStatus` throws `NotFoundError`. Callers always pass an
 * authenticated member id, so unknown ids are normally programmer errors,
 * but a member soft-deleted mid-session (rare; staging cleanup edge case)
 * is the one path where the throw can surface; treating it as "no
 * entitlement" keeps the HTTP layer's 403 path coherent rather than
 * leaking the NotFoundError to the 500 handler.
 */
import { account } from '../db/db';
import { getTierStatus } from './membershipTieringService';
import { getStatus as getActivePlayerStatus } from './activePlayerService';
import { NotFoundError } from './serviceErrors';

interface IsAdminRow {
  is_admin: number;
}

function isAdmin(memberId: string): boolean {
  const row = account.getIsAdmin.get(memberId) as IsAdminRow | undefined;
  return row?.is_admin === 1;
}

function safeTierStatus(memberId: string): string | null {
  try {
    return getTierStatus(memberId).tier_status;
  } catch (err) {
    if (err instanceof NotFoundError) return null;
    throw err;
  }
}

export function hasTier1Benefits(memberId: string): boolean {
  if (isAdmin(memberId)) return true;
  const tier = safeTierStatus(memberId);
  if (tier === null) return false;
  if (tier !== 'tier0') return true;
  return getActivePlayerStatus(memberId).is_active_player === 1;
}

export function isTier2Plus(memberId: string): boolean {
  if (isAdmin(memberId)) return true;
  const tier = safeTierStatus(memberId);
  return tier === 'tier2' || tier === 'tier3';
}

export function isTier3(memberId: string): boolean {
  if (isAdmin(memberId)) return true;
  return safeTierStatus(memberId) === 'tier3';
}
