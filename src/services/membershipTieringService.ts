/**
 * MembershipTieringService -- membership tier ledger.
 *
 * Owns:
 *   - Membership-tier ledger writes (`member_tier_grants`)
 *   - HoF/BAP Tier 2 grants
 *   - Tier 3 governance set/remove
 *   - Admin tier corrections
 *   - Admin-role grant and revoke (story A_Manage_Admin_Role)
 *   - The administrator-loss recruitment alert: the revoke-time raise and the
 *     daily sweep that finds administrators who can no longer serve (story
 *     SYS_Detect_Admin_Loss)
 *   - `getTierStatus(memberId)` -- the sole authoritative membership-tier read path
 *   - `tierBadgeShort(tierStatus)` -- the one home for the row-level tier badge
 *     label, so the club roster, member search and media uploader credit cannot
 *     drift apart on what a tier is called in a list
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
 *   - At most one honor grant per member per honor: a repeat of the same honor
 *     throws `ConflictError` inside the grant transaction before any write, so no
 *     ledger row, audit row, or congrats email is produced. HoF and BAP are
 *     independent; a member may hold one of each.
 *   - Refund does not write a `revoke` row.
 *   - A legacy-claim grant never lowers the member's tier: a member's claimed
 *     bases are evaluated together, so a lower later source never discards a
 *     higher tier an earlier claimed source conferred (a floor guard mirroring
 *     the purchase grant). A marker row is still written for every claim.
 *   - Admin-role grant requires the target currently hold Tier 2 or Tier 3
 *     (checked at request time); it sets `is_admin=1`, appends an admin-actor
 *     audit row, and subscribes the member to `admin-alerts`, all in one
 *     transaction. No `member_tier_grants` row is written: the target already
 *     satisfies the admin Tier 2 prerequisite and tier predicates short-circuit
 *     on `is_admin`. Revoke is self-revoke-guarded (an admin cannot revoke their
 *     own role, so at least one admin always remains); it sets `is_admin=0`,
 *     audits, and unsubscribes the member from `admin-alerts` only, leaving
 *     other list subscriptions untouched. Both enqueue the affected-member
 *     notification after the transaction commits.
 *   - Every admin-provisioning path (steady-state grant plus the bootstrap and
 *     dev-repair callers of the Tier 2 invariant grant) subscribes the member to
 *     `admin-alerts`, so the work-queue fan-out reaches every admin.
 *   - The administrator-loss alert is idempotent per administrator: once an item
 *     names that member, a further raise is a no-op, which is what makes the
 *     daily sweep safe to re-run. Dismissing the item settles the loss and keeps
 *     it settled, since the states the sweep reads outlive the alert; only a
 *     sign-in after the dismissal makes that administrator alertable again. The
 *     revoke-time raise commits inside
 *     the revoke transaction so the role change and its alert cannot separate;
 *     the sweep raises each administrator in its own transaction so one failing
 *     row cannot abort the pass. The sweep reads and alerts only: it changes no
 *     `is_admin` value, because granting and revoking stay deliberate human acts.
 *   - Tier 0 Active Player ending on purchase or Tier 3 grant runs in the same
 *     transaction as the tier write (calls `ActivePlayerService.endOnTierUpgrade`
 *     or `endOnTier3Grant`).
 *
 * Persistence:
 *   member_tier_grants, member_tier_current, members (flag and role fields),
 *   audit_entries, outbox_emails, mailing_list_subscriptions, work_queue_items.
 *
 * Side effects:
 *   - audit_entries append
 *   - outbox_emails enqueue (tier change, congratulatory HoF/BAP, admin-role
 *     change, admin-alerts fan-out on an administrator-loss raise)
 *   - mailing_list_subscriptions upsert (admin-alerts subscribe on admin
 *     provisioning/grant; unsubscribe on revoke)
 *   - work_queue_items insert (administrator-loss recruitment alert)
 *   - operational-error audit + alarm on a failed sweep row
 *
 * Service shape: singleton object (no external adapters).
 */
import {
  adminRole,
  mailingListSubscriptions,
  memberTier,
  workQueue,
  transaction,
  type MemberTierCurrentRow,
  type MemberTierGrantLatestRow,
} from '../db/db';
import { appendAuditEntry, type AuditActorType } from './auditService';
import { emailService } from './emailService';
import { ConflictError, NotFoundError, ValidationError } from './serviceErrors';
import { endOnTier3Grant, endOnTierUpgrade } from './activePlayerService';
import { workQueueService, ADMIN_LOSS_TASK_TYPE } from './workQueueService';
import { readIntConfig } from './configReader';
import { recordOperationalError } from './operationalErrors';
import { uuidv7Hex } from './uuidv7';

const REASON_TEXT_MAX_LENGTH = 4000;

// The admin-only notification list every admin is subscribed to. Holding the
// admin role is the consent: the work-queue fan-out targets this list, so an
// admin who is not subscribed receives none of those operational alerts.
const ADMIN_ALERTS_LIST_SLUG = 'admin-alerts';
const ADMIN_ROLE_REASON_MAX = 500;

export type MemberTier = 'tier0' | 'tier1' | 'tier2' | 'tier3';
export type UnderlyingTier = 'tier1' | 'tier2';

// Concise tier badge for a row-level chip: a club roster entry, a member search
// result, a media uploader credit. Tier 0 carries no badge, so a row shows a
// badge only when the member holds a purchased or governance tier. The fuller
// label ("Tier 1 IFPA Member") belongs to the profile's own membership block,
// where there is room for it; this is the one home for the short form so the
// three row surfaces cannot drift apart.
export const TIER_BADGE_SHORT: Partial<Record<MemberTier, string>> = {
  tier1: 'Tier 1',
  tier2: 'Tier 2',
  tier3: 'Tier 3 Director',
};

/** The row-level tier badge, or null for Tier 0 and for an unknown value. */
export function tierBadgeShort(tierStatus: string | null | undefined): string | null {
  if (!tierStatus) return null;
  return TIER_BADGE_SHORT[tierStatus as MemberTier] ?? null;
}

export interface TierStatus {
  tier_status: MemberTier;
  underlying_tier_status: UnderlyingTier | null;
}

/** Legacy standings a claim grants from. Board / Tier 3 is a separate concern. */
export interface LegacyClaimStandings {
  hasHof: boolean;
  hasBap: boolean;
  everPaidTier2: boolean;
  everPaidTier1Lifetime: boolean;
  tier1AnnualActive: boolean;
}

// UUIDv7-suffixed ID so back-to-back grants (same wall-clock ms) sort in
// insertion order under the view's (created_at, id) tiebreaker, which
// member_tier_current relies on when created_at ties. The shared uuidv7Hex
// generator carries a 48-bit ms timestamp prefix (any two ids minted in
// different ms are lex-comparable) and, within one process, a monotonic
// counter in the same-ms slot so same-ms mints stay strictly increasing and
// resolve in insertion order. Two processes minting in the same ms order
// arbitrarily, which never bites: each grant is its own transaction and real
// tier changes for one member are seconds or more apart.
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

// Ordinal rank for downgrade guards. Tier 3 (governance) is the ceiling; a
// purchase never lowers a member from a higher tier.
const TIER_RANK: Record<MemberTier, number> = {
  tier0: 0,
  tier1: 1,
  tier2: 2,
  tier3: 3,
};

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

// Member notifications send AFTER the tier transaction commits, so a delivery
// problem never unwinds the committed grant; emailService.sendToMember skips a
// member with no deliverable recipient and keys idempotency on the grant id.
function enqueueHonorCongrats(
  memberId: string,
  honor: 'hof' | 'bap',
  staysTier3: boolean,
  grantId: string,
): void {
  emailService.sendToMember({
    memberId,
    template: 'honor_congratulation',
    params: { honor, staysTier3 },
    idempotencyKey: `honor_congrats:${grantId}`,
  });
}

function enqueueTierChangeNotice(
  memberId: string,
  newTier: MemberTier,
  reasonText: string,
  grantId: string,
): void {
  emailService.sendToMember({
    memberId,
    template: 'tier_change_notice',
    params: { newTier, reasonText },
    idempotencyKey: `tier_change_notice:${grantId}`,
  });
}

// Idempotent admin-alerts subscribe, run inside the admin-provisioning or grant
// transaction. A member with no row is inserted as subscribed; a previously
// unsubscribed/bounced row is flipped back. `source` records who/what drove the
// write on the subscription row.
function subscribeAdminAlertsInTx(memberId: string, now: string, source: string): void {
  mailingListSubscriptions.upsertSubscribed.run(
    `mls_${uuidv7Hex()}`, now, source, now, source,
    ADMIN_ALERTS_LIST_SLUG, memberId, now,
  );
}

// Unsubscribe from admin-alerts only, run inside the revoke transaction. Touches
// just this list's row, so the member's other subscriptions are unchanged; a
// member with no row is a harmless no-op.
function unsubscribeAdminAlertsInTx(memberId: string, now: string, source: string): void {
  mailingListSubscriptions.setUnsubscribed.run(
    now, now, source, ADMIN_ALERTS_LIST_SLUG, memberId,
  );
}

function requireAdminRoleReason(reason: string): string {
  const trimmed = (reason ?? '').trim();
  if (trimmed.length === 0) {
    throw new ValidationError('A reason is required.');
  }
  if (trimmed.length > ADMIN_ROLE_REASON_MAX) {
    throw new ValidationError(`Reason must be ${ADMIN_ROLE_REASON_MAX} characters or fewer.`);
  }
  return trimmed;
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
 * Refund preserves tier (the purchase write path is never invoked on refund);
 * this service is the only purchase write path.
 */
export function applyPurchaseGrant(
  actorId: string,
  memberId: string,
  paymentId: string,
  tier: 'tier1' | 'tier2',
): { ok: true } {
  return transaction(() => applyPurchaseGrantInTx(actorId, memberId, paymentId, tier));
}

/**
 * Same as `applyPurchaseGrant` but assumes the caller has already opened a
 * transaction. Use this when the tier grant must be atomic with another set of
 * writes (the webhook-success path commits payments.status='succeeded', the
 * payment_status_transitions row, and this grant in one transaction so a charged
 * member is never left without the tier). The caller owns the transaction().
 */
export function applyPurchaseGrantInTx(
  actorId: string,
  memberId: string,
  paymentId: string,
  tier: 'tier1' | 'tier2',
): { ok: true } {
  const now = new Date().toISOString();
  const current = getCurrent(memberId);

  // Never write a downgrade: a purchase grant only ever raises the tier. Guards
  // the initiation-to-webhook race (an admin tier change landing between
  // startMembershipPurchase eligibility and webhook processing). A charged
  // member already at or above the purchased tier keeps their tier; the
  // over-charge is a refund/credit concern handled elsewhere.
  if (TIER_RANK[tier] <= TIER_RANK[current.tier_status]) {
    return { ok: true as const };
  }

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
}

/**
 * Bring an admin member up to Tier 2, assuming the caller has already opened a
 * transaction. The platform admin role requires Tier 2+ as a prerequisite; this
 * enforces the invariant on the data side. Writes a standard 'grant' row plus a
 * system-actor audit entry (both greppable markers) and ensures the admin-alerts
 * subscription. Skips the grant silently when the member already holds Tier 2 or
 * higher. Use this when the grant must be atomic with other writes: the bootstrap
 * paths combine `is_admin=1` + audit + tier grant + tier audit in one
 * transaction, and the caller owns the transaction() wrapper.
 *
 * No environment gate; callers gate where required:
 *   - the dev/staging registration-allowlist bootstrap
 *     (src/dev-bootstrap/runtime.ts), reason_code
 *     'dev_admin_register_allowlist.admin_tier2', which keeps a distinctive
 *     action_type so an audit search partitions the dev/staging bootstrap events;
 *   - the production single-shot SSM-token bootstrap, reason_code
 *     'prod.admin_bootstrap_tier2', which falls through to the canonical
 *     admin.bootstrap_grant action_type.
 */
export function applyAdminTier2InvariantGrantInTx(
  memberId: string,
  reasonCode: string,
  auditMetadata: Record<string, unknown>,
): { applied: boolean } {
  const now = new Date().toISOString();
  // Provisioning an admin subscribes them to admin-alerts, so the work-queue
  // fan-out reaches every admin. Runs regardless of the tier-invariant branch
  // below: an admin who already holds Tier 2/3 returns early from the tier grant
  // but still needs the subscription ensured.
  subscribeAdminAlertsInTx(memberId, now, reasonCode);

  const current = getCurrent(memberId);
  if (current.tier_status === 'tier2' || current.tier_status === 'tier3') {
    return { applied: false };
  }
  if (current.tier_status === 'tier0') {
    endOnTierUpgrade(memberId, now);
  }
  const reasonText = 'Admin Tier 2 invariant grant (admin role requires Tier 2+).';
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
  // The dev/staging registration-allowlist bootstrap keeps a distinctive
  // action_type so an audit search partitions it from the production bootstrap;
  // every other reason_code (the production SSM-token bootstrap) falls through to
  // the canonical admin.bootstrap_grant.
  let actionType: string;
  let category: 'admin' | 'tier_change';
  if (reasonCode === 'dev_admin_register_allowlist.admin_tier2') {
    actionType = 'admin.dev_register_allowlist_grant';
    category = 'admin';
  } else {
    actionType = 'admin.bootstrap_grant';
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
 * Grant the platform admin role to a member (story A_Manage_Admin_Role). The
 * target must currently hold Tier 2 or Tier 3 (checked here at request time) and
 * not already be an admin. In one transaction this sets `is_admin=1`, appends an
 * admin-actor audit row carrying the mandatory reason, and subscribes the member
 * to admin-alerts. No `member_tier_grants` row is written: the target already
 * satisfies the admin Tier 2 prerequisite and tier predicates short-circuit on
 * `is_admin`. The affected-member email enqueues after commit.
 */
/**
 * Validate an admin-role grant without writing, throwing the same errors
 * grantAdminRole does: a reason is required, the target must exist and hold
 * Tier 2 or Tier 3, and must not already be an admin. Returns the trimmed reason
 * and the target's current tier so a confirmation step can name the change
 * before it commits. grantAdminRole calls this, so the grant rules have one home.
 */
export function assertGrantAdminRoleAllowed(
  targetMemberId: string,
  reason: string,
): { trimmedReason: string; tierStatus: string } {
  const trimmedReason = requireAdminRoleReason(reason);
  const current = getCurrent(targetMemberId); // NotFoundError when no such member
  if (current.tier_status !== 'tier2' && current.tier_status !== 'tier3') {
    throw new ValidationError(
      'The member must hold Tier 2 or Tier 3 status before being granted the admin role.',
    );
  }
  const roleRow = adminRole.getIsAdmin.get(targetMemberId) as { is_admin: number } | undefined;
  if (!roleRow) {
    throw new NotFoundError(`member ${targetMemberId} not found`);
  }
  if (roleRow.is_admin === 1) {
    throw new ConflictError('That member is already an administrator.');
  }
  return { trimmedReason, tierStatus: current.tier_status };
}

export function grantAdminRole(
  adminMemberId: string,
  targetMemberId: string,
  reason: string,
): { ok: true } {
  const { trimmedReason } = assertGrantAdminRoleAllowed(targetMemberId, reason);

  const now = new Date().toISOString();
  const eventId = `evt_${uuidv7Hex()}`;
  transaction(() => {
    adminRole.setAdminFlag.run(1, now, 'admin_role_grant', targetMemberId);
    subscribeAdminAlertsInTx(targetMemberId, now, 'admin_role_grant');
    audit({
      actionType: 'admin.role_granted',
      category: 'admin',
      actorType: 'admin',
      actorId: adminMemberId,
      memberId: targetMemberId,
      reasonText: trimmedReason,
      metadata: { event_id: eventId },
    });
  });

  emailService.sendToMember({
    memberId: targetMemberId,
    template: 'admin_role_change',
    params: { action: 'granted' },
    idempotencyKey: `admin_role_grant:${eventId}`,
  });

  return { ok: true };
}

/**
 * Validate an admin-role revoke without writing, throwing the same errors
 * revokeAdminRole does: a reason is required, an admin cannot revoke their own
 * role, and the target must exist and currently be an admin. Returns the trimmed
 * reason so a confirmation step can show it before committing. revokeAdminRole
 * calls this, so the revoke rules have one home.
 */
export function assertRevokeAdminRoleAllowed(
  adminMemberId: string,
  targetMemberId: string,
  reason: string,
): { trimmedReason: string } {
  const trimmedReason = requireAdminRoleReason(reason);
  if (targetMemberId === adminMemberId) {
    throw new ValidationError('You cannot revoke your own admin role.');
  }
  const roleRow = adminRole.getIsAdmin.get(targetMemberId) as { is_admin: number } | undefined;
  if (!roleRow) {
    throw new NotFoundError(`member ${targetMemberId} not found`);
  }
  if (roleRow.is_admin !== 1) {
    throw new ConflictError('That member is not an administrator.');
  }
  return { trimmedReason };
}

/** Why an administrator is no longer able to serve, as recorded on the queue
 *  card and in the raise's audit row. */
export type AdminLossReason = 'revoked' | 'deceased' | 'account_deleted' | 'inactive';

const ADMIN_LOSS_REASON_TEXT: Record<AdminLossReason, string> = {
  revoked:         'Admin role revoked; recruit a replacement admin volunteer.',
  deceased:        'Administrator marked deceased; recruit a replacement admin volunteer.',
  account_deleted: 'Administrator deleted their account; recruit a replacement admin volunteer.',
  inactive:        'Administrator has not signed in within the inactivity window; recruit a replacement admin volunteer.',
};

/** Whether a fresh alert is owed for an administrator who already has one on
 *  record. An open alert is the matter still queued; a closed one is an
 *  administrator's ruling that the loss was settled, which stands until that
 *  administrator signs in again and is lost a second time. A closed alert
 *  carrying no resolution timestamp cannot be dated against a sign-in, so it
 *  counts as settled rather than reopening on a missing value. Both timestamps
 *  are the same ISO form, so a string compare orders them. */
function isLossAlertReRaisable(prior: {
  status: string; resolved_at: string | null; last_login_at: string | null;
}): boolean {
  if (prior.status === 'open' || prior.resolved_at === null) return false;
  return prior.last_login_at !== null && prior.last_login_at > prior.resolved_at;
}

/**
 * Raise the administrator-loss recruitment alert for one lost administrator, so
 * the remaining administrators are prompted to recruit rather than letting the
 * team shrink unremarked (story SYS_Detect_Admin_Loss).
 *
 * Synchronous DB writes only, so a caller that already holds a transaction can
 * fold the raise into it and have the loss and its alert commit together. The
 * prior-alert guard makes the raise idempotent per administrator, which is what
 * lets the daily sweep re-run harmlessly: a second call is a no-op and no second
 * email goes out.
 *
 * The guard counts a closed alert, not only an open one. Three of the four loss
 * reasons describe a state that outlives the alert -- a deceased, deleted, or
 * lapsed administrator is still all three tomorrow -- so a guard that looked
 * only for an open item would raise the same alert every day forever and make
 * dismissing it meaningless. Dismissal is the administrator's ruling that the
 * loss is settled, and it sticks. A sign-in after that ruling is what starts the
 * clock again: an administrator who came back and then lapsed a second time has
 * been lost afresh, and is alerted afresh.
 */
function raiseAdminLossAlertInTx(
  lostMemberId: string,
  reason: AdminLossReason,
  actorId: string,
): { raised: boolean } {
  const prior = workQueue.findLatestMemberItemWithLastLogin.get(
    ADMIN_LOSS_TASK_TYPE, lostMemberId,
  ) as { status: string; resolved_at: string | null; last_login_at: string | null } | undefined;
  if (prior !== undefined && !isLossAlertReRaisable(prior)) return { raised: false };

  const { id } = workQueueService.enqueue({
    actorId,
    queueCategory: 'system',
    taskType:      ADMIN_LOSS_TASK_TYPE,
    entityType:    'member',
    entityId:      lostMemberId,
    priority:      5,
    reasonText:    ADMIN_LOSS_REASON_TEXT[reason],
    detailText:    null,
  });
  audit({
    actionType: 'admin.loss_alert_raised',
    category:   'admin',
    actorType:  actorId === 'system' ? 'system' : 'admin',
    actorId:    actorId === 'system' ? null : actorId,
    memberId:   lostMemberId,
    reasonText: ADMIN_LOSS_REASON_TEXT[reason],
    metadata:   { loss_reason: reason, work_queue_item_id: id },
  });
  return { raised: true };
}

interface LostAdministratorRow {
  id: string;
  deleted_at: string | null;
  is_deceased: number;
  last_login_at: string | null;
  created_at: string;
}

/** The inactivity window, in days, after which an administrator with no sign-in
 *  is surfaced for recruitment follow-up. */
export function adminInactivityAlertDays(): number {
  return readIntConfig('admin_inactivity_alert_days', 180);
}

/**
 * Daily pass: find every administrator who can no longer serve while still
 * holding the role, and raise the recruitment alert for each (story
 * SYS_Detect_Admin_Loss).
 *
 * The pass reads and alerts; the role itself is left exactly as it is, because
 * granting and revoking are deliberate human acts under A_Manage_Admin_Role and
 * an inactivity finding is a prompt for the remaining administrators, not a
 * verdict. Each administrator is raised in its own transaction so one bad row
 * cannot abort the pass, and the prior-alert guard inside the raise makes a
 * re-run produce nothing new, whether the earlier alert is still queued or has
 * already been dismissed.
 */
export function runAdminLossSweep(): { examined: number; raised: number; failed: number } {
  const cutoffIso = new Date(Date.now() - adminInactivityAlertDays() * 86_400_000).toISOString();
  const rows = adminRole.listLostAdministrators.all(cutoffIso) as LostAdministratorRow[];

  let raised = 0;
  let failed = 0;
  for (const row of rows) {
    // Ordered by severity of the signal, so an administrator who is both
    // deceased and lapsed is described by the fact that explains the lapse.
    const reason: AdminLossReason = row.deleted_at !== null
      ? 'account_deleted'
      : row.is_deceased === 1
        ? 'deceased'
        : 'inactive';
    try {
      const result = transaction(() => raiseAdminLossAlertInTx(row.id, reason, 'system'));
      if (result.raised) raised += 1;
    } catch (err) {
      failed += 1;
      recordOperationalError({
        actionType: 'admin.loss_alert_failed',
        category:   'admin',
        entityType: 'member',
        entityId:   row.id,
        reasonText: 'Administrator-loss recruitment alert could not be raised.',
        cause:      err,
        metadata:   { loss_reason: reason },
      });
    }
  }
  return { examined: rows.length, raised, failed };
}

/**
 * Revoke the platform admin role from a member (story A_Manage_Admin_Role). An
 * admin cannot revoke their own role, so at least one admin always remains. In
 * one transaction this sets `is_admin=0`, appends an admin-actor audit row with
 * the mandatory reason, unsubscribes the member from admin-alerts only, leaving
 * their other list subscriptions untouched, and raises the administrator-loss
 * recruitment alert so the shrinking admin team is prompted to recruit. The
 * affected-member email enqueues after commit.
 */
export function revokeAdminRole(
  adminMemberId: string,
  targetMemberId: string,
  reason: string,
): { ok: true } {
  const { trimmedReason } = assertRevokeAdminRoleAllowed(adminMemberId, targetMemberId, reason);

  const now = new Date().toISOString();
  const eventId = `evt_${uuidv7Hex()}`;
  transaction(() => {
    adminRole.setAdminFlag.run(0, now, 'admin_role_revoke', targetMemberId);
    unsubscribeAdminAlertsInTx(targetMemberId, now, 'admin_role_revoke');
    audit({
      actionType: 'admin.role_revoked',
      category: 'admin',
      actorType: 'admin',
      actorId: adminMemberId,
      memberId: targetMemberId,
      reasonText: trimmedReason,
      metadata: { event_id: eventId },
    });
    raiseAdminLossAlertInTx(targetMemberId, 'revoked', adminMemberId);
  });

  emailService.sendToMember({
    memberId: targetMemberId,
    template: 'admin_role_change',
    params: { action: 'revoked' },
    idempotencyKey: `admin_role_revoke:${eventId}`,
  });

  return { ok: true };
}

const HONOR_REASON_CODE: Record<'hof' | 'bap', string> = {
  hof: 'honor.hof_tier2_grant',
  bap: 'honor.bap_tier2_grant',
};

/**
 * True when the member already holds a tier grant for this exact honor. HoF and
 * BAP are independent, so a member may hold one of each. The admin honor-grant
 * surface calls this to block a duplicate before offering it; applyHonorGrant
 * re-checks the same condition inside its transaction as the authoritative guard.
 */
export function hasHonorGrant(memberId: string, honor: 'hof' | 'bap'): boolean {
  return memberTier.hasHonorGrant.get(memberId, HONOR_REASON_CODE[honor]) !== undefined;
}

/**
 * Apply a HoF or BAP induction Tier 2 grant.
 *
 * - Current Tier 0/1/2: writes a Tier 2 grant row. Tier 0 members with
 *   current AP have AP ended in the same transaction.
 * - Current Tier 3: writes a governance_set row preserving Tier 3 with
 *   new_underlying_tier_status='tier2' so that future governance removal
 *   reverts to Tier 2 instead of the prior underlying tier.
 * - Duplicate guard: a member holds at most one grant per honor. A repeat of the
 *   SAME honor throws ConflictError inside the transaction before any write, so no
 *   ledger row, audit row, or congrats email is produced (HoF and BAP stay
 *   independent). hasHonorGrant exposes the same check for a pre-commit preview.
 */
export function applyHonorGrant(
  actorId: string,
  memberId: string,
  honor: 'hof' | 'bap',
): { ok: true } {
  const reasonCode = HONOR_REASON_CODE[honor];

  const result = transaction(() => {
    if (memberTier.hasHonorGrant.get(memberId, reasonCode) !== undefined) {
      throw new ConflictError(
        `This member already holds a ${honor.toUpperCase()} honor grant; ` +
        `a second ${honor.toUpperCase()} grant is not written.`,
      );
    }
    const now = new Date().toISOString();
    const current = getCurrent(memberId);

    let newGrantRowId: string;
    if (current.tier_status === 'tier3') {
      newGrantRowId = insertGrant({
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
      newGrantRowId = insertGrant({
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

    return { grantId: newGrantRowId, staysTier3: current.tier_status === 'tier3' };
  });

  enqueueHonorCongrats(memberId, honor, result.staysTier3, result.grantId);
  return { ok: true as const };
}

/**
 * Apply the single tier grant produced by a legacy-claim merge.
 *
 * Writes one `member_tier_grants` row at claim time with
 * `reason_code = 'legacy.claim_tier_grant'`. No conditional "exceeds current"
 * logic: every claim produces a marker row even when the resulting tier does
 * not change.
 *
 * Maps this claim's legacy standing to a tier by precedence (first match wins):
 *   - HoF or BAP, or ever paid Tier 2 → `tier2`
 *   - bought Tier 1 Lifetime, or Tier 1 Annual active at cutover → `tier1`
 *   - none of these → `tier0`
 * An account with only honors grants on honors alone, one outcome of the same
 * mapping. Board / Tier 3 is a separate concern and is not granted here.
 *
 * A claim never lowers the member's tier. When a member claims more than one
 * source (e.g. a paid legacy account and, separately, their own competition
 * record with no back-link), the bases are evaluated together in precedence
 * order, so a later source that maps lower must not discard the higher tier an
 * earlier claimed source already conferred. The current tier already reflects
 * every prior claim grant (`member_tier_current` is last-write-wins), so the
 * granted tier is the higher of this claim's mapped tier and the current tier —
 * the same floor guard `applyPurchaseGrant` uses.
 *
 * Caller owns the transaction so the grant is atomic with the merge writes.
 * A marker row is written for every claim even when the resulting tier does not
 * change, so the ledger carries one row per claim. AP is ended only on an
 * actual upgrade out of Tier 0 (same rule as `applyPurchaseGrant`).
 */
export function applyLegacyClaimGrantInTx(
  actorMemberId: string,
  memberId: string,
  standings: LegacyClaimStandings,
  metadata: Record<string, unknown>,
): void {
  const now = new Date().toISOString();
  const current = getCurrent(memberId);
  const { hasHof, hasBap, everPaidTier2, everPaidTier1Lifetime, tier1AnnualActive } = standings;
  const claimBasisTier: MemberTier =
    (hasHof || hasBap || everPaidTier2) ? 'tier2'
      : (everPaidTier1Lifetime || tier1AnnualActive) ? 'tier1'
        : 'tier0';
  // Never write below the member's current tier: an earlier claimed source may
  // already entitle them to a higher tier this claim's basis alone would discard.
  const grantTier: MemberTier =
    TIER_RANK[claimBasisTier] > TIER_RANK[current.tier_status] ? claimBasisTier : current.tier_status;

  if (current.tier_status === 'tier0' && grantTier !== 'tier0') {
    endOnTierUpgrade(memberId, now);
  }

  insertGrant({
    actorId:          actorMemberId,
    memberId,
    changeType:       'grant',
    oldTier:          current.tier_status,
    newTier:          grantTier,
    oldUnderlying:    current.underlying_tier_status,
    newUnderlying:    grantTier === 'tier3' ? current.underlying_tier_status : null,
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
      from:                     current.tier_status,
      to:                       grantTier,
      claim_basis_tier:         claimBasisTier,
      has_hof:                  hasHof,
      has_bap:                  hasBap,
      ever_paid_tier2:          everPaidTier2,
      ever_paid_tier1_lifetime: everPaidTier1Lifetime,
      tier1_annual_active:      tier1AnnualActive,
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

  // member_tier_current is last-write-wins, so restore the tier the member
  // would hold with the legacy-claim grant removed: the most recent non-legacy
  // grant (paid purchase, honor, governance), else tier0. Preserves a paid or
  // governance-conferred tier; only HoF/BAP held purely from the legacy claim
  // is dropped. underlying_tier_status is carried only when that preserved row
  // is governance Tier 3.
  const prior = memberTier.getLatestNonLegacyClaimGrant.get(memberId) as
    | { new_tier_status: MemberTier; new_underlying_tier_status: UnderlyingTier | null }
    | undefined;
  const preservedTier: MemberTier = prior?.new_tier_status ?? 'tier0';
  const preservedUnderlying: UnderlyingTier | null = prior?.new_underlying_tier_status ?? null;

  insertGrant({
    actorId:          actorMemberId,
    memberId,
    changeType:       'revoke',
    oldTier:          current.tier_status,
    newTier:          preservedTier,
    oldUnderlying:    current.underlying_tier_status,
    newUnderlying:    preservedUnderlying,
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
      to:   preservedTier,
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

  const result = transaction(() => {
    const now = new Date().toISOString();
    const current = getCurrent(memberId);
    const tierChanged = current.tier_status !== newTier;

    const newGrantRowId = insertGrant({
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

    return { grantId: newGrantRowId, tierChanged };
  });

  // A same-tier correction (an admin re-recording the current tier with a new
  // reason) is not a status change, so it sends no notification.
  if (result.tierChanged) {
    enqueueTierChangeNotice(memberId, newTier, reasonText, result.grantId);
  }
  return { ok: true as const };
}

