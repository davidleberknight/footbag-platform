/**
 * Membership tier ledger service.
 *
 * Owns writes to member_tier_grants and reads of member_tier_current.
 * Lifetime membership tiers (tier0, tier1, tier2, tier3) never expire and
 * never decrement on refund. Tier 3 is governance-conferred and carries an
 * underlying tier (tier1 or tier2) the member returns to when governance ends.
 *
 * Phase A scope: every write path for the tier ledger except event-driven
 * payment-success (Phase B wires the Stripe webhook around applyPurchaseGrant).
 *
 * The ledger is append-only; UPDATE/DELETE are blocked at the DB layer.
 * Multi-row writes (tier grant + AP end) are wrapped in transaction() to land
 * atomically.
 */
import {
  memberTier,
  transaction,
  type MemberTierCurrentRow,
  type MemberTierGrantLatestRow,
} from '../db/db';
import { appendAuditEntry, type AuditActorType } from './auditService';
import { ConflictError, NotFoundError, ValidationError } from './serviceErrors';
import { endOnTier3Grant, endOnTierUpgrade } from './activePlayerService';
import { uuidv7Hex } from './uuidv7';

const REASON_TEXT_MAX_LENGTH = 4000;

export type MemberTier = 'tier0' | 'tier1' | 'tier2' | 'tier3';
export type UnderlyingTier = 'tier1' | 'tier2';

export interface TierStatus {
  tier_status: MemberTier;
  underlying_tier_status: UnderlyingTier | null;
}

// UUIDv7-suffixed ID so back-to-back grants (same wall-clock ms) sort in
// insertion order under the view's (created_at, id) tiebreaker. The view
// definition in member_tier_current relies on id-string comparison when
// created_at ties. UUIDv7 carries a 48-bit ms timestamp prefix that makes
// any two ids generated in different ms lex-comparable; same-ms ids resolve
// by the random tail (consistent across processes, no shared state needed).
// Replaces the prior per-process counter scheme that silently collided
// across the web/worker container boundary.
function newGrantId(): string {
  return `mtg_${uuidv7Hex()}`;
}

function getCurrent(memberId: string): TierStatus {
  const row = memberTier.getCurrent.get(memberId) as MemberTierCurrentRow | undefined;
  if (!row) {
    throw new NotFoundError(`member ${memberId} not found`);
  }
  return {
    tier_status: row.tier_status,
    underlying_tier_status: row.underlying_tier_status,
  };
}

function validateReasonText(reasonText: string | null | undefined): string | null {
  if (reasonText === null || reasonText === undefined) return null;
  if (reasonText.length > REASON_TEXT_MAX_LENGTH) {
    throw new ValidationError(
      `reason_text exceeds ${REASON_TEXT_MAX_LENGTH} characters`,
      { length: reasonText.length },
    );
  }
  return reasonText;
}

interface InsertGrantArgs {
  actorId: string | null;
  memberId: string;
  changeType: 'grant' | 'revoke' | 'correct' | 'governance_set' | 'governance_removed';
  oldTier: MemberTier | null;
  newTier: MemberTier;
  oldUnderlying: UnderlyingTier | null;
  newUnderlying: UnderlyingTier | null;
  reasonCode: string;
  reasonText: string | null;
  relatedPaymentId: string | null;
  now: string;
}

function insertGrant(args: InsertGrantArgs): string {
  const id = newGrantId();
  memberTier.insertGrant.run(
    id,
    args.now,
    args.memberId,
    args.actorId,
    args.changeType,
    args.oldTier,
    args.newTier,
    args.oldUnderlying,
    args.newUnderlying,
    args.reasonCode,
    args.reasonText,
    args.relatedPaymentId,
  );
  return id;
}

function audit(opts: {
  actionType: string;
  category: string;
  actorType: AuditActorType;
  actorId: string | null;
  memberId: string;
  reasonText: string | null;
  metadata: Record<string, unknown>;
}): void {
  appendAuditEntry({
    actionType: opts.actionType,
    category: opts.category,
    actorType: opts.actorType,
    actorMemberId: opts.actorId,
    entityType: 'member',
    entityId: opts.memberId,
    reasonText: opts.reasonText,
    metadata: opts.metadata,
  });
}

/**
 * Read the member's current lifetime tier and underlying tier (Tier 3 only).
 * Throws NotFoundError if the member id is not in the members table.
 */
export function getTierStatus(memberId: string): TierStatus {
  return getCurrent(memberId);
}

/**
 * Apply a Tier 1 or Tier 2 purchase grant.
 *
 * Tier 0 buyers with current Active Player have their AP ended in the same
 * transaction (membership_upgrade_ended_active_player).
 *
 * Phase B will call this inside the same transaction that updates
 * payments.status='succeeded'. APP-006 (refund preserves tier) is enforced
 * by Phase B not calling this on refund; this service is the only purchase
 * write path.
 */
export function applyPurchaseGrant(
  actorId: string,
  memberId: string,
  paymentId: string,
  tier: 'tier1' | 'tier2',
): { ok: true } {
  return transaction(() => {
    const now = new Date().toISOString();
    const current = getCurrent(memberId);

    // End AP BEFORE writing the tier grant: member_active_player_current
    // gates is_active_player on tier_status='tier0', so once the grant lands
    // and the view reports tier1+, the AP-end branch becomes a silent no-op.
    if (current.tier_status === 'tier0') {
      endOnTierUpgrade(memberId, now);
    }

    insertGrant({
      actorId,
      memberId,
      changeType: 'grant',
      oldTier: current.tier_status,
      newTier: tier,
      oldUnderlying: current.underlying_tier_status,
      newUnderlying: current.tier_status === 'tier3' ? current.underlying_tier_status : null,
      reasonCode: tier === 'tier1' ? 'purchase.tier1' : 'purchase.tier2',
      reasonText: null,
      relatedPaymentId: paymentId,
      now,
    });

    audit({
      actionType: 'tier.purchase_grant',
      category: 'tier_change',
      actorType: 'member',
      actorId,
      memberId,
      reasonText: null,
      metadata: {
        from: current.tier_status,
        to: tier,
        payment_id: paymentId,
      },
    });

    return { ok: true as const };
  });
}

/**
 * Bring an admin member up to Tier 2. The platform admin role requires Tier 2+
 * as a prerequisite; this method enforces the invariant on the data side.
 * Writes a standard 'grant' row plus a system-actor audit entry, both serving
 * as greppable markers. Skips silently when the member is already at Tier 2 or
 * higher.
 *
 * No environment gate; callers gate on FOOTBAG_ENV (or other appropriate
 * triggers like SSM-token presence) where required:
 *   - dev/staging registration bootstrap (src/dev-admin-shortcuts/runtime.ts) —
 *     passes reason_code='dev_admin_register_allowlist.admin_tier2'. CUTOVER-REMOVE.
 *   - dev-only backfill repair pass (src/dev-admin-shortcuts/runtime.ts) —
 *     passes reason_code='dev_admin_invariant_repair'. CUTOVER-REMOVE.
 *   - production single-shot bootstrap (deferred slice) — passes
 *     reason_code='prod.admin_bootstrap_tier2'
 *
 * The audit action_type is derived from reason_code. Each
 * dev-admin-shortcut caller keeps its distinctive action_type so a single
 * audit search by action_type catches the full bootstrap event
 * (admin-flag + tier grant rows, both written in the same transaction by
 * the caller). The production-bootstrap reason_code falls through to the
 * canonical `grant_admin_bootstrap` action_type.
 */
export function applyAdminTier2InvariantGrant(
  memberId: string,
  reasonCode: string,
  auditMetadata: Record<string, unknown>,
): { applied: boolean } {
  return transaction(() =>
    applyAdminTier2InvariantGrantInTx(memberId, reasonCode, auditMetadata),
  );
}

/**
 * Same as `applyAdminTier2InvariantGrant` but assumes the caller has already
 * opened a transaction. Use this when the admin grant must be atomic with
 * another set of writes (e.g. the dev/staging bootstrap that combines
 * `is_admin=1` + audit + tier grant + tier audit in one transaction). The
 * caller is responsible for the transaction() wrapper.
 */
export function applyAdminTier2InvariantGrantInTx(
  memberId: string,
  reasonCode: string,
  auditMetadata: Record<string, unknown>,
): { applied: boolean } {
  const current = getCurrent(memberId);
  if (current.tier_status === 'tier2' || current.tier_status === 'tier3') {
    return { applied: false };
  }
  const now = new Date().toISOString();
  if (current.tier_status === 'tier0') {
    endOnTierUpgrade(memberId, now);
  }
  const reasonText = reasonCode === 'dev_admin_invariant_repair'
    ? 'Dev-mode admin Tier 2 invariant repair (admin role requires Tier 2+).'
    : 'Admin Tier 2 invariant grant (admin role requires Tier 2+).';
  insertGrant({
    actorId: null,
    memberId,
    changeType: 'grant',
    oldTier: current.tier_status,
    newTier: 'tier2',
    oldUnderlying: null,
    newUnderlying: null,
    reasonCode,
    reasonText,
    relatedPaymentId: null,
    now,
  });
  // CUTOVER-REMOVE: dev-admin-shortcut reason_codes route to distinctive
  // action_types so the audit trail can be partitioned and zero-checked
  // before production deploy. The default branch is the production
  // single-shot bootstrap path.
  let actionType: string;
  let category: 'admin' | 'tier_change';
  if (reasonCode === 'dev_admin_invariant_repair') {
    actionType = 'dev_admin_invariant_repair';
    category = 'tier_change';
  } else if (reasonCode === 'dev_admin_register_allowlist.admin_tier2') {
    actionType = 'grant_admin_dev_register_allowlist';
    category = 'admin';
  } else {
    actionType = 'grant_admin_bootstrap';
    category = 'admin';
  }
  audit({
    actionType,
    category,
    actorType: 'system',
    actorId: null,
    memberId,
    reasonText,
    metadata: { from: current.tier_status, to: 'tier2', ...auditMetadata },
  });
  return { applied: true };
}

/**
 * Apply a HoF or BAP induction Tier 2 grant.
 *
 * - Current Tier 0/1/2: writes a Tier 2 grant row. Tier 0 members with
 *   current AP have AP ended in the same transaction.
 * - Current Tier 3: writes a governance_set row preserving Tier 3 with
 *   new_underlying_tier_status='tier2' so that future governance removal
 *   reverts to Tier 2 instead of the prior underlying tier.
 */
export function applyHonorGrant(
  actorId: string,
  memberId: string,
  honor: 'hof' | 'bap',
): { ok: true } {
  const reasonCode = honor === 'hof' ? 'honor.hof_tier2_grant' : 'honor.bap_tier2_grant';

  return transaction(() => {
    const now = new Date().toISOString();
    const current = getCurrent(memberId);

    if (current.tier_status === 'tier3') {
      insertGrant({
        actorId,
        memberId,
        changeType: 'governance_set',
        oldTier: 'tier3',
        newTier: 'tier3',
        oldUnderlying: current.underlying_tier_status,
        newUnderlying: 'tier2',
        reasonCode,
        reasonText: null,
        relatedPaymentId: null,
        now,
      });
    } else {
      // End AP first (see comment in applyPurchaseGrant).
      if (current.tier_status === 'tier0') {
        endOnTierUpgrade(memberId, now);
      }
      insertGrant({
        actorId,
        memberId,
        changeType: 'grant',
        oldTier: current.tier_status,
        newTier: 'tier2',
        oldUnderlying: null,
        newUnderlying: null,
        reasonCode,
        reasonText: null,
        relatedPaymentId: null,
        now,
      });
    }

    audit({
      actionType: honor === 'hof' ? 'tier.hof_grant' : 'tier.bap_grant',
      category: 'governance_change',
      actorType: 'admin',
      actorId,
      memberId,
      reasonText: null,
      metadata: {
        honor,
        from: current.tier_status,
        from_underlying: current.underlying_tier_status,
      },
    });

    return { ok: true as const };
  });
}

/**
 * Promote a member to Tier 3 (governance director).
 *
 * Underlying-tier mapping:
 *   Tier 0 source → underlying='tier1' (Tier 0 is never an underlying tier)
 *   Tier 1 source → underlying='tier1'
 *   Tier 2 source → underlying='tier2'
 *
 * Tier 0 members with current Active Player have AP ended in the same
 * transaction (tier3_grant_ended_active_player).
 *
 * Already-Tier-3 members are rejected with ConflictError.
 */
export function setGovernanceTier3(
  actorId: string,
  memberId: string,
): { ok: true } {
  return transaction(() => {
    const now = new Date().toISOString();
    const current = getCurrent(memberId);

    if (current.tier_status === 'tier3') {
      throw new ConflictError(`member ${memberId} is already Tier 3`);
    }

    const newUnderlying: UnderlyingTier =
      current.tier_status === 'tier2' ? 'tier2' : 'tier1';

    // End AP first (see comment in applyPurchaseGrant).
    if (current.tier_status === 'tier0') {
      endOnTier3Grant(actorId, memberId, now);
    }

    insertGrant({
      actorId,
      memberId,
      changeType: 'governance_set',
      oldTier: current.tier_status,
      newTier: 'tier3',
      oldUnderlying: null,
      newUnderlying,
      reasonCode: 'governance.tier3_set',
      reasonText: null,
      relatedPaymentId: null,
      now,
    });

    audit({
      actionType: 'tier.governance_set',
      category: 'governance_change',
      actorType: 'admin',
      actorId,
      memberId,
      reasonText: null,
      metadata: {
        from: current.tier_status,
        new_underlying: newUnderlying,
      },
    });

    return { ok: true as const };
  });
}

/**
 * Remove Tier 3 governance status. Reverts the member to the underlying tier
 * captured by the latest governance_set row.
 *
 * Rejected with ConflictError if the member is not currently Tier 3.
 */
export function removeGovernanceTier3(
  actorId: string,
  memberId: string,
): { ok: true } {
  return transaction(() => {
    const now = new Date().toISOString();
    const current = getCurrent(memberId);

    if (current.tier_status !== 'tier3') {
      throw new ConflictError(`member ${memberId} is not Tier 3`);
    }

    const latestGov = memberTier.getLatestGovernanceSet.get(memberId) as
      | MemberTierGrantLatestRow
      | undefined;
    if (!latestGov || !latestGov.new_underlying_tier_status) {
      // Defensive: a Tier 3 member should always have a governance_set row.
      throw new ConflictError(
        `member ${memberId} is Tier 3 but has no prior governance_set row`,
      );
    }
    const revertTo = latestGov.new_underlying_tier_status;

    insertGrant({
      actorId,
      memberId,
      changeType: 'governance_removed',
      oldTier: 'tier3',
      newTier: revertTo,
      oldUnderlying: revertTo,
      newUnderlying: null,
      reasonCode: 'governance.tier3_removed',
      reasonText: null,
      relatedPaymentId: null,
      now,
    });

    audit({
      actionType: 'tier.governance_removed',
      category: 'governance_change',
      actorType: 'admin',
      actorId,
      memberId,
      reasonText: null,
      metadata: {
        revert_to: revertTo,
      },
    });

    return { ok: true as const };
  });
}

/**
 * Admin manual tier override. Used for corrections of erroneous prior data
 * and for exceptional remediation. Reason text is mandatory per US
 * A_Override_Member_Data; callers must supply a non-empty string.
 *
 * Underlying tier on the new row mirrors the prior row when newTier is Tier 3
 * (admin can correct a Tier 3 member's tier without changing underlying);
 * for non-Tier-3 newTier, underlying is cleared.
 */
export function adminOverride(
  actorId: string,
  memberId: string,
  newTier: MemberTier,
  reasonText: string,
): { ok: true } {
  if (!reasonText || reasonText.trim() === '') {
    throw new ValidationError('reason_text is required for admin override');
  }
  const validatedReason = validateReasonText(reasonText);

  return transaction(() => {
    const now = new Date().toISOString();
    const current = getCurrent(memberId);

    insertGrant({
      actorId,
      memberId,
      changeType: 'correct',
      oldTier: current.tier_status,
      newTier,
      oldUnderlying: current.underlying_tier_status,
      newUnderlying: newTier === 'tier3' ? current.underlying_tier_status : null,
      reasonCode: 'admin.correction',
      reasonText: validatedReason,
      relatedPaymentId: null,
      now,
    });

    audit({
      actionType: 'tier.admin_override',
      category: 'tier_change',
      actorType: 'admin',
      actorId,
      memberId,
      reasonText: validatedReason,
      metadata: {
        from: current.tier_status,
        to: newTier,
      },
    });

    return { ok: true as const };
  });
}
