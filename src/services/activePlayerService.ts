/**
 * ActivePlayerService -- Active Player lifecycle ledger.
 *
 * Active Player is a temporary status granted to Tier 0 members (via event
 * attendance, vouches by Tier 2/3, or a one-time club join). It does NOT change
 * membership tier; it grants Tier 1 benefits while current. Tier 1+ members
 * never have AP rows.
 *
 * Owns:
 *   - Active Player lifecycle ledger (`active_player_grants`)
 *   - Direct vouch action table (`active_player_vouches`)
 *   - `getStatus(memberId)` -- the sole authoritative Active Player read path
 *   - `correctExpiry` -- an administrator's exceptional correction of an expiry
 *
 * Does not own:
 *   - Membership-tier writes (MembershipTieringService)
 *   - Event registration (CompetitionParticipationService)
 *   - Club affiliations (ClubService)
 *   - Scheduling expiry passes (ActivePlayerExpiryService orchestrates; this
 *     service exposes `applyExpiry`, and `applyExpiryInTx` for an orchestrator
 *     that commits the expiry together with its day-of notice)
 *
 * Required patterns:
 *   - Append-only ledgers. UPDATE/DELETE blocked by DB triggers.
 *   - `getStatus` derives from `member_active_player_current` (the authoritative
 *     view).
 *   - Every `active_player_grants` row goes through the one insert helper,
 *     which stamps `created_at` strictly later than the member's newest existing
 *     row, read in the same write transaction. The view takes the latest-
 *     stamped row as the member's standing, so a wall clock stepping backward
 *     between two writes must not make the newer row read as older, and no tie
 *     is left for an id to break, since ids rise only within one process (the
 *     web app and the worker both write). Only the stamp moves:
 *     expiry dates, the vouch row and the audit row keep the true time.
 *   - Active Player applies to Tier 0 only. Tier 1+ vouches and attendances are
 *     no-ops that write nothing, the audit log included, because they change
 *     nothing.
 *   - No-shorten rule: an older event, vouch, or club-join must not shorten an
 *     existing later expiry. An administrator's `correctExpiry` is the single
 *     entry point exempt from it, because taking back a standing granted in
 *     error is exactly what the rule is not meant to prevent.
 *   - Idempotency:
 *       - `ux_active_player_grants_registration_once` (per registration)
 *       - `ux_active_player_grants_vouch_once` (per vouch)
 *       - `ux_active_player_club_join_once` (per member, lifetime)
 *   - Self-vouch rejected at both DB (CHECK) and APP (service guard).
 *   - A vouch or correction reason is cleaned with the shared text sanitizer
 *     before it is validated, so markup alone never passes as a reason.
 *   - Vouch rate limit throws `RateLimitedError`; bucket size and window read
 *     from `system_config_current`.
 *   - `endOnTierUpgrade` and `endOnTier3Grant` execute in the same transaction
 *     as the corresponding `member_tier_grants` write (caller-owned tx).
 *   - Multi-row writes (vouch row + AP grant row) wrap in `transaction()` to
 *     land atomically.
 *
 * Persistence:
 *   active_player_grants, active_player_vouches, member_active_player_current,
 *   member_membership_status_current, members, system_config_current,
 *   audit_entries, outbox_emails.
 *
 * Side effects:
 *   - audit_entries append
 *   - outbox_emails enqueue (vouch confirmations; the notice telling a member an
 *     administrator corrected their Active Player standing, queued best-effort
 *     inside the correction's transaction)
 *
 * Service shape: singleton object (no external adapters).
 */
import { randomUUID } from 'node:crypto';
import {
  account,
  activePlayer,
  activePlayerVouches,
  memberTier,
  transaction,
  type MemberActivePlayerCurrentRow,
  type ActivePlayerGrantLatestRow,
  type MemberTierCurrentRow,
} from '../db/db';
import { logger } from '../config/logger';
import { appendAuditEntry, type AuditActorType } from './auditService';
import { emailService } from './emailService';
import { readIntConfig } from './configReader';
import { RateLimitedError, ValidationError } from './serviceErrors';
import { uuidv7Hex } from './uuidv7';
import { laterStamp } from '../lib/ledgerStamp';
import { cleanUserText } from '../lib/textSanitizer';
import { formatDateDisplay } from './dateFormat';
import {
  navigateTo,
  pendingAction,
  urgentAction,
  type MemberActionContext,
  type MemberActionItem,
  type MemberActionSource,
} from './memberActionItem';

const REASON_TEXT_MAX_LENGTH = 4000;
const ACTIVE_PLAYER_DURATION_DAYS_DEFAULT = 730;
const VOUCH_RATE_LIMIT_MAX_DEFAULT = 5;
const VOUCH_RATE_LIMIT_WINDOW_MINUTES_DEFAULT = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// UUIDv7-suffixed id. The shared uuidv7Hex generator's 48-bit ms timestamp
// prefix plus its within-process monotonic same-ms counter give lex-ordered,
// insertion-order sort under the member_active_player_current view's
// (created_at, id) tiebreaker.
function newGrantId(): string {
  return `apg_${uuidv7Hex()}`;
}

interface InsertGrantArgs {
  id: string;
  now: string;
  memberId: string;
  actorId: string | null;
  changeType: 'grant' | 'extend' | 'expire' | 'end' | 'correct';
  oldExpiresAt: string | null;
  newExpiresAt: string | null;
  reasonCode: string;
  reasonText: string | null;
  relatedEventId?: string | null;
  relatedRegistrationId?: string | null;
  relatedClubId?: string | null;
  relatedClubAffiliationId?: string | null;
  relatedVouchId?: string | null;
}

// The one write of an Active Player ledger row. It stamps created_at with the
// later of `now` and the member's newest existing stamp: member_active_player_current
// takes the row with the latest created_at as the member's standing, and the
// host clock can step backward between two writes (a hypervisor time sync, an
// NTP correction, a resumed VM). A row stamped before the one it follows would
// read as older, leaving the superseded standing in force. A row that would not
// be later is stamped one millisecond after the newest (laterStamp). Every
// caller runs inside a write transaction, so no row lands between this read and
// the insert. Only the stamp moves: expiry dates are the caller's and are
// written as given.
function insertGrant(args: InsertGrantArgs): void {
  const stamp = laterStamp(readLatestGrant(args.memberId)?.created_at, args.now);
  activePlayer.insertGrant.run(
    args.id,
    stamp,
    args.memberId,
    args.actorId,
    args.changeType,
    args.oldExpiresAt,
    args.newExpiresAt,
    args.reasonCode,
    args.reasonText,
    args.relatedEventId ?? null,
    args.relatedRegistrationId ?? null,
    args.relatedClubId ?? null,
    args.relatedClubAffiliationId ?? null,
    args.relatedVouchId ?? null,
  );
}

function readCurrent(memberId: string): MemberActivePlayerCurrentRow | undefined {
  return activePlayer.getCurrent.get(memberId) as MemberActivePlayerCurrentRow | undefined;
}

interface EndContext {
  actorId: string | null;
  actorType: AuditActorType;
  memberId: string;
  reasonCode: 'membership_upgrade_ended_active_player' | 'tier3_grant_ended_active_player';
  reasonText: string | null;
  now: string;
}

function writeEndRow(ctx: EndContext): { ok: boolean; ended: boolean } {
  // IMPORTANT: callers must invoke this BEFORE writing the paired tier-grant
  // row. member_active_player_current gates is_active_player on
  // tier_status='tier0', so once the tier grant lands and the member is
  // tier1+, this view returns is_active_player=0 and the no-op branch fires
  // — silently swallowing the AP-end ledger row. End AP first, then upgrade.
  const current = readCurrent(ctx.memberId);
  if (!current || current.is_active_player !== 1) {
    return { ok: true, ended: false };
  }
  insertGrant({
    id: newGrantId(),
    now: ctx.now,
    memberId: ctx.memberId,
    actorId: ctx.actorId,
    changeType: 'end',
    oldExpiresAt: current.active_player_expires_at,
    newExpiresAt: null,
    reasonCode: ctx.reasonCode,
    reasonText: ctx.reasonText,
  });
  appendAuditEntry({
    actionType: 'active_player.end',
    actorType: ctx.actorType,
    actorMemberId: ctx.actorId,
    entityType: 'member',
    entityId: ctx.memberId,
    reasonText: ctx.reasonText,
    metadata: {
      reason_code: ctx.reasonCode,
      ended_expires_at: current.active_player_expires_at,
    },
  });
  return { ok: true, ended: true };
}

/**
 * End the member's current Active Player period because they reached Tier 1
 * or Tier 2. No-op if AP is not currently active. The caller must have
 * already opened a transaction that will also write the matching tier grant
 * row, so the pair lands atomically. Call this BEFORE writing the tier grant
 * (see writeEndRow comment).
 *
 * actor_member_id is set to the member themselves: a Tier 1/Tier 2 purchase
 * is the buyer's own action even when the originating signal arrives via the
 * Stripe webhook.
 */
export function endOnTierUpgrade(memberId: string, now: string): { ok: boolean; ended: boolean } {
  return writeEndRow({
    actorId: memberId,
    actorType: 'member',
    memberId,
    reasonCode: 'membership_upgrade_ended_active_player',
    reasonText: null,
    now,
  });
}

/**
 * End the member's current Active Player period because an admin granted
 * them Tier 3 governance status. No-op if AP is not currently active.
 * Caller must have already opened the transaction that also writes the
 * paired governance_set tier-grant row. Call this BEFORE writing the tier
 * grant.
 */
export function endOnTier3Grant(
  actorId: string,
  memberId: string,
  now: string,
): { ok: boolean; ended: boolean } {
  return writeEndRow({
    actorId,
    actorType: 'admin',
    memberId,
    reasonCode: 'tier3_grant_ended_active_player',
    reasonText: null,
    now,
  });
}

// ── Public surface ───────────────────────────────────────────────────────────

export interface ActivePlayerStatus {
  is_active_player: 0 | 1;
  active_player_expires_at: string | null;
  /**
   * The date the standing runs to, or ran to once it has lapsed. Set for a
   * lapsed member, where `active_player_expires_at` is null because the expiry
   * ledger row cleared it.
   *
   * Null in three cases, all of which read the same way to a member and should:
   * they have never been an Active Player; they are Tier 1 or above, where the
   * standing does not apply; or their standing was ended rather than allowed to
   * lapse, because they reached a paid tier. That last case leaves a future date
   * in the ledger which is the date the period would have run to, so it is
   * deliberately not reported as a date anything ran out on.
   */
  active_player_last_expires_at: string | null;
  latest_active_player_reason_code: string | null;
}

export type ApplyResult =
  | { status: 'granted'; expiresAt: string }
  | { status: 'extended'; expiresAt: string }
  | { status: 'noop'; reason: string }
  /** This voucher's own vouch already gave the standing a vouch now would:
   *  a repeat submit. `first` is what that vouch did, so it can be reported. */
  | { status: 'own_repeat'; first: 'granted' | 'extended' }
  /** The standing already reaches the day a vouch now would, from someone
   *  else's act. */
  | { status: 'already_held' };

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}

function readTier(memberId: string): MemberTierCurrentRow | undefined {
  return memberTier.getCurrent.get(memberId) as MemberTierCurrentRow | undefined;
}

function readLatestGrant(memberId: string): ActivePlayerGrantLatestRow | undefined {
  return activePlayer.getLatestGrant.get(memberId) as ActivePlayerGrantLatestRow | undefined;
}

// A person's reason, cleaned before the length check so the limit measures what
// the ledger and audit rows hold. Text that cleans to nothing comes back null,
// so a reason that was only markup reads as no reason at all.
function validateReasonText(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const reasonText = cleanUserText(raw, 'single_line', 'reason');
  if (reasonText.length > REASON_TEXT_MAX_LENGTH) {
    throw new ValidationError(
      `reason_text exceeds ${REASON_TEXT_MAX_LENGTH} characters`,
      { length: reasonText.length },
    );
  }
  return reasonText || null;
}

function durationDays(): number {
  return readIntConfig('active_player_duration_days', ACTIVE_PLAYER_DURATION_DAYS_DEFAULT);
}

function isoFromDateAddDays(anchor: Date, days: number): string {
  return new Date(anchor.getTime() + days * MS_PER_DAY).toISOString();
}

/**
 * Read the member's current Active Player state. Returns the snapshot from
 * member_active_player_current (which gates is_active_player on
 * tier_status='tier0'). Defaults to inactive when the member has no AP rows.
 */
export function getStatus(memberId: string): ActivePlayerStatus {
  const row = readCurrent(memberId);
  if (!row) {
    return {
      is_active_player: 0,
      active_player_expires_at: null,
      active_player_last_expires_at: null,
      latest_active_player_reason_code: null,
    };
  }
  return {
    is_active_player: row.is_active_player,
    active_player_expires_at: row.active_player_expires_at,
    active_player_last_expires_at: row.active_player_last_expires_at,
    latest_active_player_reason_code: row.latest_active_player_reason_code,
  };
}

/**
 * Mark a Tier 0 member as Active Player from event attendance.
 *
 * Tier 1+ members no-op and nothing is written; attendance does not extend their
 * already-Tier-1+ benefits. Tier 0 members get a `grant` (no prior AP rows)
 * or `extend` (prior rows exist) with the no-shorten rule: the new expiry
 * must be strictly later than the latest row's new_active_player_expires_at,
 * else the new row is suppressed.
 *
 * Per-registration idempotency is enforced by
 * ux_active_player_grants_registration_once. A second call for the same
 * registrationId returns noop without raising.
 */
export function applyAttendance(
  actorId: string,
  memberId: string,
  registrationId: string,
  eventEndDate: string,
): ApplyResult {
  // Look up registration to derive event_id and validate it belongs to memberId.
  const reg = activePlayer.getRegistrationEventId.get(registrationId) as
    | { event_id: string; member_id: string }
    | undefined;
  if (!reg) {
    throw new ValidationError(`registration ${registrationId} not found`);
  }
  if (reg.member_id !== memberId) {
    throw new ValidationError(
      `registration ${registrationId} does not belong to member ${memberId}`,
    );
  }

  const tier = readTier(memberId);
  if (!tier) {
    throw new ValidationError(`member ${memberId} not found`);
  }
  if (tier.tier_status !== 'tier0') {
    return { status: 'noop', reason: 'tier1_plus_no_op' };
  }

  const anchor = new Date(eventEndDate);
  if (Number.isNaN(anchor.getTime())) {
    throw new ValidationError(`invalid eventEndDate: ${eventEndDate}`);
  }
  const newExpiresAt = isoFromDateAddDays(anchor, durationDays());

  return transaction(() => {
    const now = new Date().toISOString();
    const latest = readLatestGrant(memberId);

    const isExtend = !!latest;
    const oldExpires = latest?.new_active_player_expires_at ?? null;

    // No-shorten rule: never write an AP row whose new_expires_at is earlier
    // than the latest row's. Returns noop without erroring (caller can retry
    // a later attendance later).
    if (oldExpires && newExpiresAt <= oldExpires) {
      return { status: 'noop' as const, reason: 'no_shorten' };
    }

    const id = newGrantId();
    try {
      insertGrant({
        id,
        now,
        memberId,
        actorId,
        changeType: isExtend ? 'extend' : 'grant',
        oldExpiresAt: oldExpires,
        newExpiresAt,
        reasonCode: 'official_event_attendance',
        reasonText: null,
        relatedEventId: reg.event_id,
        relatedRegistrationId: registrationId,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Idempotent retry for the same registration: return noop.
        return { status: 'noop' as const, reason: 'already_processed' };
      }
      throw err;
    }

    appendAuditEntry({
      actionType: isExtend ? 'active_player.extend' : 'active_player.grant',
      actorType: 'system',
      actorMemberId: actorId,
      entityType: 'member',
      entityId: memberId,
      reasonText: null,
      metadata: {
        reason_code: 'official_event_attendance',
        registration_id: registrationId,
        event_id: reg.event_id,
        old_expires_at: oldExpires,
        new_expires_at: newExpiresAt,
      },
    });

    return isExtend
      ? { status: 'extended' as const, expiresAt: newExpiresAt }
      : { status: 'granted' as const, expiresAt: newExpiresAt };
  });
}

/**
 * Tell the vouched member they now hold Active Player status. Runs after the
 * vouch transaction commits, so a failed enqueue is logged and never unwinds
 * the committed grant. The voucher's public display name personalizes the
 * notice; a missing recipient login email is skipped rather than raised.
 */
function enqueueVouchConfirmation(
  voucherId: string,
  targetId: string,
  expiresAt: string,
  grantId: string,
): void {
  const target = account.findNotificationContactById.get(targetId) as
    | { login_email: string | null }
    | undefined;
  if (!target?.login_email) {
    logger.warn('vouch confirmation skipped: no deliverable recipient', { targetId });
    return;
  }
  const voucher = account.findNotificationContactById.get(voucherId) as
    | { display_name: string }
    | undefined;
  try {
    emailService.send({
      template: 'vouch_confirmation',
      params: {
        voucherName: voucher?.display_name ?? 'another member',
        expiryDate: expiresAt.slice(0, 10),
      },
      recipientEmail: target.login_email,
      recipientMemberId: targetId,
      idempotencyKey: `vouch_confirmation:${grantId}`,
    });
  } catch (err) {
    logger.warn('vouch confirmation email enqueue failed', {
      err: err instanceof Error ? err.message : String(err),
      targetId,
    });
  }
}

/**
 * Whether a vouch given now would change nothing: the target's standing already
 * runs to the calendar day a vouch would set, or later. Compared by day because
 * a second submit seconds after the first computes an expiry milliseconds later,
 * and that is the same standing, not a longer one. Returns the repeat result,
 * naming whether it was this voucher's own vouch that set it, or null when the
 * vouch would extend the standing.
 */
function vouchAlreadyHolds(
  voucherId: string,
  targetId: string,
  now: Date,
): Extract<ApplyResult, { status: 'own_repeat' | 'already_held' }> | null {
  const latest = readLatestGrant(targetId);
  if (!latest?.new_active_player_expires_at) return null;
  const held = latest.new_active_player_expires_at;
  const wouldSet = isoFromDateAddDays(now, durationDays());
  if (held.slice(0, 10) < wouldSet.slice(0, 10)) return null;
  const ownVouch = latest.actor_member_id === voucherId
    && latest.reason_code === 'tier2_vouch_active_player'
    && (latest.change_type === 'grant' || latest.change_type === 'extend');
  return ownVouch
    ? { status: 'own_repeat', first: latest.change_type === 'grant' ? 'granted' : 'extended' }
    : { status: 'already_held' };
}

/**
 * Tier 2 / Tier 3 member vouches for a Tier 0 target to grant or extend AP.
 *
 * - Self-vouch is rejected (ValidationError; DB CHECK is the backstop).
 * - Target Tier 1+ is a no-op that writes nothing (no vouch row, no AP row, no audit row).
 * - Voucher must be Tier 2 or Tier 3; else ValidationError.
 * - Per-voucher rate limit (vouch_rate_limit_max_per_hour /
 *   vouch_rate_limit_window_minutes from system_config_current); exceeding
 *   throws RateLimitedError. The rate limit is consumed BEFORE the target-
 *   tier check is short-circuited only via the no-op path: target-tier check
 *   runs first, so no-op vouches do not consume the limit.
 * - On success writes the vouch row and a paired active_player_grants row
 *   with related_vouch_id (reason_code='tier2_vouch_active_player'),
 *   atomically.
 */
export function applyVouch(
  voucherId: string,
  targetId: string,
  reasonText: string | null,
): ApplyResult {
  if (voucherId === targetId) {
    throw new ValidationError('cannot vouch for yourself');
  }
  const validatedReason = validateReasonText(reasonText);

  const voucherTier = readTier(voucherId);
  if (!voucherTier) {
    throw new ValidationError(`voucher ${voucherId} not found`);
  }
  if (voucherTier.tier_status !== 'tier2' && voucherTier.tier_status !== 'tier3') {
    throw new ValidationError(
      `voucher must be Tier 2 or Tier 3 (got ${voucherTier.tier_status})`,
    );
  }

  const targetTier = readTier(targetId);
  if (!targetTier) {
    throw new ValidationError(`target ${targetId} not found`);
  }
  if (targetTier.tier_status !== 'tier0') {
    return { status: 'noop', reason: 'tier1_plus_no_op' };
  }

  // A vouch whose standing already holds changes nothing, so it writes nothing
  // and spends no rate-limit slot. Checked before the limit for that reason,
  // and again inside the transaction against a concurrent writer.
  const preHeld = vouchAlreadyHolds(voucherId, targetId, new Date());
  if (preHeld) return preHeld;

  // Rate limit per voucher.
  const max = readIntConfig('vouch_rate_limit_max_per_hour', VOUCH_RATE_LIMIT_MAX_DEFAULT);
  const windowMinutes = readIntConfig(
    'vouch_rate_limit_window_minutes',
    VOUCH_RATE_LIMIT_WINDOW_MINUTES_DEFAULT,
  );
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const countRow = activePlayerVouches.countByVoucherSince.get(voucherId, cutoff) as
    | { n: number }
    | undefined;
  const recentCount = countRow?.n ?? 0;
  if (recentCount >= max) {
    throw new RateLimitedError(
      `voucher exceeded ${max} vouches in ${windowMinutes} minutes`,
      windowMinutes * 60,
    );
  }

  const now = new Date();
  const newExpiresAt = isoFromDateAddDays(now, durationDays());

  let grantIdForEmail = '';
  const result = transaction(() => {
    const nowIso = now.toISOString();
    // Defensive re-check inside the transaction: the target's tier may have
    // upgraded between the read above and now (concurrent applyPurchaseGrant
    // from another worker, etc.). Without this check, a race window would
    // write a spurious AP grant for a tier1+ member, consume the voucher's
    // rate-limit slot, and leave an audit ghost.
    const targetTierInTx = readTier(targetId);
    if (!targetTierInTx || targetTierInTx.tier_status !== 'tier0') {
      return { status: 'noop' as const, reason: 'tier_upgraded_in_race' };
    }
    const heldInTx = vouchAlreadyHolds(voucherId, targetId, now);
    if (heldInTx) return heldInTx;
    const latest = readLatestGrant(targetId);
    const oldExpires = latest?.new_active_player_expires_at ?? null;

    if (oldExpires && newExpiresAt <= oldExpires) {
      return { status: 'noop' as const, reason: 'no_shorten' };
    }

    const vouchId = `apv_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    activePlayerVouches.insertVouch.run(
      vouchId,
      nowIso,
      voucherId,
      targetId,
      nowIso,
      validatedReason,
      oldExpires,
      newExpiresAt,
    );

    const isExtend = !!latest;
    const grantId = newGrantId();
    grantIdForEmail = grantId;
    insertGrant({
      id: grantId,
      now: nowIso,
      memberId: targetId,
      actorId: voucherId,
      changeType: isExtend ? 'extend' : 'grant',
      oldExpiresAt: oldExpires,
      newExpiresAt,
      reasonCode: 'tier2_vouch_active_player',
      reasonText: validatedReason,
      relatedVouchId: vouchId,
    });

    appendAuditEntry({
      actionType: isExtend ? 'active_player.extend' : 'active_player.grant',
      actorType: 'member',
      actorMemberId: voucherId,
      entityType: 'member',
      entityId: targetId,
      // The voucher's note is member-typed text; it lives on the vouch and
      // grant rows this names, not in the audit log, which outlives erasure.
      reasonText: null,
      metadata: {
        reason_code: 'tier2_vouch_active_player',
        vouch_id: vouchId,
        old_expires_at: oldExpires,
        new_expires_at: newExpiresAt,
      },
    });

    return isExtend
      ? { status: 'extended' as const, expiresAt: newExpiresAt }
      : { status: 'granted' as const, expiresAt: newExpiresAt };
  });

  if (result.status === 'granted' || result.status === 'extended') {
    enqueueVouchConfirmation(voucherId, targetId, result.expiresAt, grantIdForEmail);
  }
  return result;
}

/**
 * One-time club-join AP grant for a never-AP Tier 0 member.
 *
 * No-op unless BOTH:
 *   - target is currently Tier 0
 *   - no prior active_player_grants rows of any change_type exist
 *
 * The "any prior row" rule is broader than the schema unique index (which
 * only blocks duplicate club-join inserts); a member who has had AP via
 * attendance or vouch is no longer eligible for the one-time club grant.
 */
function applyClubJoinCore(
  actorId: string,
  memberId: string,
  clubAffiliationId: string,
): ApplyResult {
  const aff = activePlayer.getClubAffiliationClubId.get(clubAffiliationId) as
    | { club_id: string; member_id: string }
    | undefined;
  if (!aff) {
    throw new ValidationError(`affiliation ${clubAffiliationId} not found`);
  }
  if (aff.member_id !== memberId) {
    throw new ValidationError(
      `affiliation ${clubAffiliationId} does not belong to member ${memberId}`,
    );
  }

  const tier = readTier(memberId);
  if (!tier) {
    throw new ValidationError(`member ${memberId} not found`);
  }
  if (tier.tier_status !== 'tier0') {
    return { status: 'noop', reason: 'tier1_plus_no_op' };
  }

  const priorRow = activePlayer.hasAnyPriorGrant.get(memberId) as
    | { exists_flag: number }
    | undefined;
  if (priorRow && priorRow.exists_flag === 1) {
    return { status: 'noop', reason: 'already_active_player_history' };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const newExpiresAt = isoFromDateAddDays(now, durationDays());
  const id = newGrantId();
  try {
    insertGrant({
      id,
      now: nowIso,
      memberId,
      actorId,
      changeType: 'grant',
      oldExpiresAt: null,
      newExpiresAt,
      reasonCode: 'club_join_one_time_active_player_grant',
      reasonText: null,
      relatedClubId: aff.club_id,
      relatedClubAffiliationId: clubAffiliationId,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Concurrent caller won the unique-index race.
      return { status: 'noop' as const, reason: 'already_active_player_history' };
    }
    throw err;
  }

  appendAuditEntry({
    actionType: 'active_player.grant',
    actorType: 'system',
    actorMemberId: actorId,
    entityType: 'member',
    entityId: memberId,
    reasonText: null,
    metadata: {
      reason_code: 'club_join_one_time_active_player_grant',
      club_id: aff.club_id,
      club_affiliation_id: clubAffiliationId,
      new_expires_at: newExpiresAt,
    },
  });

  return { status: 'granted' as const, expiresAt: newExpiresAt };
}

export function applyClubJoinInTx(
  actorId: string,
  memberId: string,
  clubAffiliationId: string,
): ApplyResult {
  // In-transaction entry point: the caller already holds an open transaction,
  // so the one-time Active Player grant co-commits atomically with the club
  // affiliation or club row that triggered it. better-sqlite3 forbids nested
  // transactions, so this must not open its own.
  return applyClubJoinCore(actorId, memberId, clubAffiliationId);
}

/**
 * Internal helper for the periodic Active Player expiry check.
 * Writes an `expire` row when the latest AP row for a member has an expiry
 * in the past and is not already `expire` or `end`. Returns whether a row
 * was written. `now` defaults to wall-clock time; tests may inject a fixed
 * value to keep expiry decisions deterministic.
 */
export function applyExpiry(memberId: string, now?: Date): { ok: true; expired: boolean } {
  return transaction(() => applyExpiryInTx(memberId, now));
}

/**
 * The same expiry write for a caller that already holds an open transaction,
 * so the expire row, its audit entry and whatever the caller writes beside them
 * (the day-of notice) commit or roll back together. better-sqlite3 forbids
 * nested transactions, so this must not open its own.
 */
export function applyExpiryInTx(memberId: string, now?: Date): { ok: true; expired: boolean } {
  const latest = readLatestGrant(memberId);
  if (!latest) return { ok: true, expired: false };
  if (latest.change_type === 'expire' || latest.change_type === 'end') {
    return { ok: true, expired: false };
  }
  if (!latest.new_active_player_expires_at) return { ok: true, expired: false };

  const nowIso = (now ?? new Date()).toISOString();
  if (latest.new_active_player_expires_at > nowIso) {
    return { ok: true, expired: false };
  }

  const id = newGrantId();
  // Grant insert + audit entry land in the caller's one transaction. Without
  // it, a SIGKILL between the two statements left an expired AP grant with no
  // matching audit row, breaking traceability of who/when status changed.
  // Matches the applyVouch / applyAttendance patterns elsewhere in this file.
  insertGrant({
    id,
    now: nowIso,
    memberId,
    actorId: null,
    changeType: 'expire',
    oldExpiresAt: latest.new_active_player_expires_at,
    newExpiresAt: null,
    reasonCode: 'active_player_expired',
    reasonText: null,
  });
  appendAuditEntry({
    actionType: 'active_player.expire',
    actorType: 'system',
    actorMemberId: null,
    entityType: 'member',
    entityId: memberId,
    reasonText: null,
    metadata: {
      reason_code: 'active_player_expired',
      previous_expires_at: latest.new_active_player_expires_at,
    },
  });
  return { ok: true, expired: true };
}

/** The calendar day two stored expiry moments fall on, or both absent. */
function sameExpiryDate(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return a.slice(0, 10) === b.slice(0, 10);
}

export type CorrectExpiryResult =
  | { status: 'corrected'; expiresAt: string | null }
  | { status: 'unchanged' }
  | { status: 'not_applicable'; reason: 'tier1_plus' };

/**
 * An administrator's correction of a member's Active Player expiry, for the
 * exceptional remediation the ordinary pathways cannot express.
 *
 * This is the one entry point that may move an expiry earlier. Every other
 * pathway is held to the no-shorten rule, because an older event or vouch
 * arriving late must never cut short a standing already granted. A correction
 * is precisely the case that rule is not meant to cover: an administrator
 * fixing a standing that should not have been granted, or granted for too
 * long. It writes a `correct` ledger row, which the current-status view reads
 * as the latest word whichever direction it moves.
 *
 * Passing no date ends the standing outright, which is how a wrongly granted
 * one is taken back.
 *
 * Active Player is a Tier 0 status, so a correction on a Tier 1, 2 or 3 member
 * reports that rather than writing a row the status view would never surface.
 */
export function correctExpiry(
  actorId: string,
  memberId: string,
  newExpiresAt: string | null,
  reasonText: string,
): CorrectExpiryResult {
  const reason = validateReasonText(reasonText);
  if (!reason) {
    throw new ValidationError('Enter the reason for this correction.');
  }

  const tier = readTier(memberId);
  if (tier && tier.tier_status !== 'tier0') {
    return { status: 'not_applicable' as const, reason: 'tier1_plus' as const };
  }

  const latest = readLatestGrant(memberId);
  const oldExpiresAt = latest?.new_active_player_expires_at ?? null;
  // Compared as dates, not as moments. An organic grant stores the moment the
  // period runs out; the correction form offers a date, and converting that date
  // back lands on a different moment every time. Comparing moments would make an
  // untouched form a change, writing a ledger row and quietly moving the expiry
  // by part of a day.
  if (sameExpiryDate(oldExpiresAt, newExpiresAt)) return { status: 'unchanged' as const };

  const nowIso = new Date().toISOString();
  const id = newGrantId();
  transaction(() => {
    insertGrant({
      id,
      now: nowIso,
      memberId,
      actorId,
      changeType: 'correct',
      oldExpiresAt,
      newExpiresAt,
      reasonCode: 'admin_correction',
      reasonText: reason,
    });
    const auditId = appendAuditEntry({
      actionType:    'active_player.admin_correction',
      actorType:     'admin',
      actorMemberId: actorId,
      entityType:    'member',
      entityId:      memberId,
      reasonText:    reason,
      metadata: {
        reason_code:    'admin_correction',
        old_expires_at: oldExpiresAt,
        new_expires_at: newExpiresAt,
      },
    });
    // A correction is the one write permitted to move an expiry earlier, so it
    // is the one that can quietly take standing away; a member who loses it is
    // owed the reason. The membership-status change story requires this notice
    // by name.
    emailService.sendActNotice({
      template: 'member_record_corrected',
      params: {
        memberName: (account.findNotificationContactById.get(memberId) as
          | { display_name: string } | undefined)?.display_name ?? 'there',
        whatChanged: 'your Active Player standing',
        note: reason,
      },
      memberId,
      actId: auditId,
    });
  });
  return { status: 'corrected' as const, expiresAt: newExpiresAt };
}

// ── The member's Active Player obligation, as a dashboard action item ────────

// The window the item is shown in, past the expiry date. The design fixes it at
// thirty days: long enough that a member who signs in a few weeks late still
// sees what happened, short enough that a long-lapsed account is not nagged
// forever about a status it no longer expects.
const LAPSED_ITEM_VISIBLE_DAYS = 30;

// Whole UTC days from now until the given date; negative once it has passed.
// Computed here rather than imported from the expiry service, which imports
// this one.
function wholeDaysUntil(iso: string, nowIso: string): number {
  const target = Date.UTC(
    new Date(iso).getUTCFullYear(), new Date(iso).getUTCMonth(), new Date(iso).getUTCDate());
  const today = Date.UTC(
    new Date(nowIso).getUTCFullYear(), new Date(nowIso).getUTCMonth(), new Date(nowIso).getUTCDate());
  return Math.round((target - today) / MS_PER_DAY);
}

// The earliest pre-expiry reminder, which is when the member first hears about
// this by email, and therefore the earliest the item should appear: the block
// and the mail say the same thing from the same moment. The two keys are read
// here rather than through the expiry service for the same import reason above.
function firstReminderLeadDays(): number {
  return Math.max(
    readIntConfig('active_player_expiry_reminder_days_1', 30),
    readIntConfig('active_player_expiry_reminder_days_2', 7),
  );
}

/**
 * The routes back that the IFPA membership rules actually allow this member.
 *
 * Buying either paid tier removes the dependence on Active Player altogether,
 * since the rules say a Tier 1 or higher member has no need of the status.
 * Attending an event registered through the IFPA website grants or extends it.
 *
 * A vouch is the third route the rules allow, and it is deliberately not here.
 * The member cannot perform it: a Tier 2 or Tier 3 member gives a vouch, so
 * offering the member a control would promise them an action that is not theirs
 * to take. It is stated on the item's detail line instead.
 *
 * The one-time club-join grant is deliberately NOT offered. It reaches only a
 * Tier 0 member who has never previously been an Active Player, and every member
 * this item can appear for holds an expiry date and has therefore already been
 * one. Offering it would advertise a route the grant refuses. It belongs in the
 * Tier 0 benefits text a newcomer reads instead.
 *
 * The upgrade is a link rather than a purchase, because one control cannot buy
 * either tier; it points at the membership block on this same page, which sells
 * both and shows what each costs.
 */
function activePlayerOptions() {
  return [
    navigateTo('Upgrade to Tier 1 or Tier 2 Membership', '#membership'),
    navigateTo('Find an Event', '/events'),
  ];
}

/**
 * Active Player standing, as an obligation. Pending while the status still
 * stands and the first reminder has gone out; needs-attention-now once it has
 * lapsed, until the lapsed window closes.
 */
export const activePlayerActionSource: MemberActionSource = {
  sourceKey: 'active_player',

  itemsFor(ctx: MemberActionContext): MemberActionItem[] {
    const status = getStatus(ctx.memberId);
    // The date the standing runs to, or last ran to. Reading the plain expiry
    // would miss every member whose lapse the expiry job has processed, since
    // that row clears it, and those are the members this item is for.
    const expiresAt = status.active_player_last_expires_at;
    // No date at all means the member has never held the status, so there is
    // nothing approaching and nothing lost.
    if (!expiresAt) return [];

    const nowIso = new Date().toISOString();
    const days = wholeDaysUntil(expiresAt, nowIso);
    const on = formatDateDisplay(expiresAt, { style: 'long' });

    if (status.is_active_player === 1) {
      if (days > firstReminderLeadDays()) return [];
      // Headlines here are prompts, not status. The membership block further
      // down the same profile already states the standing and what is lost with
      // it; repeating that wording would say one thing twice on one page.
      return [pendingAction({
        kind: 'active_player_expiring',
        headline: 'Keep your Active Player status',
        // The vouch route is stated rather than offered: it is a Tier 2 or Tier
        // 3 member's action, not this member's, so it is not a control.
        detail: `It runs out on ${on}. A Tier 2 or Tier 3 member can also vouch for you to extend it.`,
        deadline: expiresAt,
        options: activePlayerOptions(),
      })];
    }

    if (days < -LAPSED_ITEM_VISIBLE_DAYS) return [];
    return [urgentAction({
      kind: 'active_player_lapsed',
      headline: 'Get your Active Player status back',
      detail: `It ran out on ${on}. A Tier 2 or Tier 3 member can also vouch for you to earn it back.`,
      deadline: expiresAt,
      options: activePlayerOptions(),
    })];
  },
};
