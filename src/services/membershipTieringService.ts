/**
 * MembershipTieringService -- membership tier ledger.
 *
 * Owns:
 *   - Membership-tier ledger writes (`member_tier_grants`)
 *   - HoF/BAP Tier 2 grants
 *   - Tier 3 governance set/remove
 *   - Admin tier corrections
 *   - Admin-role grants
 *   - `getTierStatus(memberId)` -- the sole authoritative membership-tier read path
 *
 * Does not own:
 *   - Payment row writes and Stripe webhook processing (PaymentService).
 *     This service exposes `applyPurchaseGrant` which PaymentService invokes
 *     inside its webhook-success branch to write the tier-grant ledger row.
 *   - Registration (CompetitionParticipationService)
 *   - Active Player lifecycle (ActivePlayerService -- this service calls
 *     `endOnTierUpgrade` / `endOnTier3Grant` in the same transaction as the tier
 *     write, but does not own the AP ledger)
 *   - Official roster reads (OfficialRosterService)
 *
 * Required patterns:
 *   - Append-only ledger. UPDATE/DELETE blocked by DB triggers.
 *   - `getTierStatus` derives from `member_tier_current` (the authoritative view).
 *   - Lifetime tier semantics: tier0/tier1/tier2/tier3 never expire, never decrement
 *     on refund. Tier 3 is governance-conferred and carries an underlying tier
 *     (tier1 or tier2) the member returns to when governance ends.
 *   - Source-linkage discipline: tier grants link only to `related_payment_id`,
 *     admin overrides, HoF/BAP grants, Tier 3 governance changes, or legacy
 *     migration; no event/vouch/club source FK.
 *   - `governance_set` requires non-null `new_underlying_tier_status`;
 *     `governance_removed` requires non-null `old_underlying_tier_status`.
 *   - HoF/BAP grant on a Tier 3 member writes `governance_set` updating
 *     `new_underlying_tier_status = tier2`; otherwise writes a plain Tier 2 grant.
 *   - Refund does not write a `revoke` row.
 *   - Admin-role prerequisites: target must be Tier 2 or Tier 3; anti-lockout (last
 *     admin cannot be revoked); `admin-alerts` mailing-list subscription updated
 *     atomically with the `is_admin` change.
 *   - Tier 0 Active Player ending on purchase or Tier 3 grant runs in the same
 *     transaction as the tier write (calls `ActivePlayerService.endOnTierUpgrade`
 *     or `endOnTier3Grant`).
 *   - News items emitted via `NewsService.emitNewsItem` only.
 *
 * Persistence:
 *   member_tier_grants, member_tier_current, members (flag and role fields),
 *   mailing_list_subscriptions, news_items, audit_entries, outbox_emails.
 *
 * Side effects:
 *   - audit_entries append
 *   - outbox_emails enqueue (tier change, congratulatory HoF/BAP)
 *   - news_items emission via NewsService (`member_honor`)
 *
 * Service shape: singleton object (no external adapters).
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
// by the random tail, which is consistent across processes without shared
// state (the web and worker containers can mint ids independently and
// preserve sort order under merge).
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
 *   - dev/staging registration bootstrap (src/dev-shortcuts/runtime.ts),
 *     reason_code='dev_admin_register_allowlist.admin_tier2'.
 *     Current: active in dev/staging only; env-config guard blocks in
 *       production.
 *     Target: remove the caller and this bullet at production go-live.
 *   - dev-only backfill repair pass (src/dev-shortcuts/runtime.ts),
 *     reason_code='dev_admin_invariant_repair'.
 *     Current: active in dev/staging only.
 *     Target: remove the caller and this bullet at production go-live.
 *   - production single-shot bootstrap, reason_code='prod.admin_bootstrap_tier2'
 *     (the permanent post-cutover caller).
 *
 * The audit action_type is derived from reason_code. Each
 * dev-shortcut caller keeps its distinctive action_type so a single
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
  // CUTOVER-REMOVE: dev-admin reason_code routing.
  // Current: dev_admin_invariant_repair and dev_admin_register_allowlist.admin_tier2
  //   route to distinctive action_types so the audit trail can be partitioned
  //   and zero-checked before production deploy.
  // Target: remove both branches at production go-live; only the production
  //   bootstrap path (grant_admin_bootstrap action_type) remains.
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
 * Apply the single tier grant produced by a legacy-claim merge.
 *
 * Writes one `member_tier_grants` row at claim time with
 * `reason_code = 'legacy.claim_tier_grant'`. No conditional "exceeds current"
 * logic: every claim produces a marker row even when the resulting tier does
 * not change.
 *
 * Current fallback (honors-only, all that is wired today):
 *   - HoF or BAP → `tier2`
 *   - else        → `tier0`
 * Target precedence table: needs deferred legacy-state columns on
 * `legacy_members` before it can be expanded. (MIGRATION_PLAN §3, DD §2551)
 *
 * Caller owns the transaction so the grant is atomic with the merge writes.
 * Tier 0 grants are written even when current is already Tier 0, so the
 * ledger carries a marker row for every claim. AP is ended only on an
 * actual upgrade out of Tier 0 (same rule as `applyPurchaseGrant`).
 */
export function applyLegacyClaimGrantInTx(
  actorMemberId: string,
  memberId: string,
  hasHof: boolean,
  hasBap: boolean,
  metadata: Record<string, unknown>,
): void {
  const now = new Date().toISOString();
  const current = getCurrent(memberId);
  const targetTier: MemberTier = (hasHof || hasBap) ? 'tier2' : 'tier0';

  if (current.tier_status === 'tier0' && targetTier !== 'tier0') {
    endOnTierUpgrade(memberId, now);
  }

  insertGrant({
    actorId:          actorMemberId,
    memberId,
    changeType:       'grant',
    oldTier:          current.tier_status,
    newTier:          targetTier,
    oldUnderlying:    null,
    newUnderlying:    null,
    reasonCode:       'legacy.claim_tier_grant',
    reasonText:       null,
    relatedPaymentId: null,
    now,
  });

  audit({
    actionType: 'tier.legacy_claim_grant',
    category:   'tier_change',
    actorType:  'member',
    actorId:    actorMemberId,
    memberId,
    reasonText: null,
    metadata: {
      ...metadata,
      from:    current.tier_status,
      to:      targetTier,
      has_hof: hasHof,
      has_bap: hasBap,
    },
  });
}

/**
 * Reverse a prior legacy-claim tier grant when the member reports the
 * auto-link as incorrect.
 *
 * Writes one `member_tier_grants` row with `change_type = 'revoke'` and
 * `reason_code = 'legacy.auto_link_reported_incorrect'`. The target tier
 * is computed by replaying the honors-only fallback against the member
 * *without* the legacy honors: any HoF or BAP held purely from the legacy
 * claim is gone, so a revert generally falls back to `tier0` unless the
 * member already held a non-legacy upgrade (paid tier1, governance, etc.).
 *
 * Caller owns the transaction so the revoke is atomic with the linkage
 * clear and audit writes.
 */
export function applyAutoLinkRevertGrantInTx(
  actorMemberId: string,
  memberId: string,
  metadata: Record<string, unknown>,
): void {
  const now = new Date().toISOString();
  const current = getCurrent(memberId);

  insertGrant({
    actorId:          actorMemberId,
    memberId,
    changeType:       'revoke',
    oldTier:          current.tier_status,
    newTier:          'tier0',
    oldUnderlying:    null,
    newUnderlying:    null,
    reasonCode:       'legacy.auto_link_reported_incorrect',
    reasonText:       null,
    relatedPaymentId: null,
    now,
  });

  audit({
    actionType: 'tier.auto_link_revert',
    category:   'tier_change',
    actorType:  'member',
    actorId:    actorMemberId,
    memberId,
    reasonText: null,
    metadata: {
      ...metadata,
      from: current.tier_status,
      to:   'tier0',
    },
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

