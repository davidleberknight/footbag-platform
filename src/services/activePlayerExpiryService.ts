/**
 * SYS_Check_Active_Player_Expiry daily worker service.
 *
 * Scans Tier 0 members whose latest Active Player grant carries a still-active
 * `new_active_player_expires_at`, enqueues a reminder email at each
 * administrator-configured pre-expiry offset (default 30 and 7 days) plus a
 * built-in T+0 day-of reminder, and invokes `applyExpiry` for any grant whose
 * expiry has lapsed and has no `expire`/`end` ledger row yet.
 *
 * Idempotency: a per-(member, expires_at, offset) row in
 * active_player_reminder_sent prevents duplicate sends when the worker runs
 * multiple times in a single day or across days within the same offset window.
 * A renewal writes a fresh AP grant with a later expires_at, which generates
 * a fresh reminder cycle because the dedup key has not been used yet.
 *
 * Tier reminders: tier1+ members never receive AP reminders. The candidate
 * query filters on tier_status='tier0'; a re-check after offset resolution
 * catches a mid-window upgrade (tier change after the candidate snapshot).
 *
 * Email gating: the worker honors mailing_list_subscriptions for the
 * 'active-player-reminders' list (absence treated as subscribed by default;
 * explicit 'unsubscribed'/'bounced'/'complained'/'suppressed' blocks send)
 * and skips members whose login_email is null or whose email_status is not
 * 'ok'.
 */

import { randomUUID } from 'node:crypto';
import {
  activePlayerExpiry,
  mailingListSubscriptions,
  transaction,
  type ActivePlayerExpiryCandidateRow,
} from '../db/db';
import { applyExpiry } from './activePlayerService';
import { getTierStatus } from './membershipTieringService';
import { getCommunicationService } from './communicationService';
import { readIntConfig } from './configReader';
import { logger } from '../config/logger';
import { formatDateDisplay } from './dateFormat';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAILING_LIST_SLUG = 'active-player-reminders';

export type OffsetLabel = 'days_1' | 'days_2' | 'day_of';

export interface OffsetSpec {
  label: OffsetLabel;
  days: number;
}

export interface RunDailyPassResult {
  candidates_scanned:        number;
  reminders_enqueued:        number;
  expiry_rows_applied:       number;
  skipped_outside_window:    number;
  skipped_non_tier0:         number;
  skipped_unsubscribed:      number;
  skipped_email_suppressed:  number;
  skipped_already_sent:      number;
  skipped_missing_email:     number;
}

export interface RunOpts {
  /** Override "now" for tests; defaults to current wall-clock time. */
  now?: Date;
}

/**
 * Pure date math: full calendar-days between two UTC dates, computed on the
 * date floor (so 23:59 today and 00:01 tomorrow are 1 day apart, not 0).
 * Returns a positive integer when expires is in the future, 0 when it falls
 * on the same UTC day, and a negative integer when it has passed.
 */
export function daysUntilUtcDay(expiresAtIso: string, nowIso: string): number {
  const exp = new Date(expiresAtIso);
  const now = new Date(nowIso);
  if (Number.isNaN(exp.getTime()) || Number.isNaN(now.getTime())) {
    throw new Error(
      `daysUntilUtcDay: invalid ISO date (expires=${expiresAtIso} now=${nowIso})`,
    );
  }
  const expDay = Date.UTC(exp.getUTCFullYear(), exp.getUTCMonth(), exp.getUTCDate());
  const nowDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((expDay - nowDay) / MS_PER_DAY);
}

/**
 * Decide which reminder offset (if any) is due today for the given expiry.
 * T+0 day-of is built-in; pre-expiry offsets come from system_config.
 * Returns null when today does not match any offset's window.
 */
export function decideReminderDue(
  expiresAtIso: string,
  nowIso: string,
  offsets: OffsetSpec[],
): OffsetSpec | null {
  const days = daysUntilUtcDay(expiresAtIso, nowIso);
  if (days === 0) {
    return { label: 'day_of', days: 0 };
  }
  for (const o of offsets) {
    if (days === o.days) return o;
  }
  return null;
}

function readConfiguredOffsets(): OffsetSpec[] {
  const days1 = readIntConfig('active_player_expiry_reminder_days_1', 30);
  const days2 = readIntConfig('active_player_expiry_reminder_days_2', 7);
  return [
    { label: 'days_1', days: days1 },
    { label: 'days_2', days: days2 },
  ];
}

function formatExpiryDate(isoDate: string): string {
  return formatDateDisplay(isoDate, { style: 'long' });
}

function buildReminderEmail(expiresAtIso: string, offsetLabel: OffsetLabel): {
  subject: string;
  bodyText: string;
} {
  const displayDate = formatExpiryDate(expiresAtIso);
  const subject = offsetLabel === 'day_of'
    ? 'Your IFPA Active Player status expires today'
    : 'Your IFPA Active Player status is about to expire';
  const bodyText =
    `Hello,\n\n` +
    `Your Active Player status expires on ${displayDate}. Active Player ` +
    `status grants Tier 1 benefits (including inclusion on the Official IFPA ` +
    `Roster) to Tier 0 Registered Members. Your membership tier itself is ` +
    `for life and does not expire.\n\n` +
    `You can regain or extend Active Player status by any of the following:\n` +
    `  - Attending a qualifying IFPA-sanctioned event.\n` +
    `  - Being vouched for by a Tier 2 IFPA Organizer Member or Tier 3 Director.\n` +
    `  - Joining your first club, if you have not previously used this one-time grant.\n\n` +
    `--\nInternational Footbag Players Association\n`;
  return { subject, bodyText };
}

function isSubscribed(memberId: string): boolean {
  // Absence of a row = subscribed by default (opt-out semantics matching the
  // mailing list's `is_member_manageable=1` configuration; members may
  // unsubscribe to suppress future sends).
  const row = mailingListSubscriptions.findStatus.get(MAILING_LIST_SLUG, memberId) as
    | { status: string }
    | undefined;
  if (!row) return true;
  return row.status === 'subscribed';
}

function tryRecordReminderSent(
  memberId: string,
  expiresAtIso: string,
  offsetLabel: OffsetLabel,
  nowIso: string,
): boolean {
  try {
    activePlayerExpiry.insertReminderSent.run(
      `apr_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      nowIso,
      nowIso,
      memberId,
      expiresAtIso,
      offsetLabel,
      nowIso,
    );
    return true;
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
    ) {
      return false;
    }
    throw err;
  }
}

/**
 * Execute one daily pass: applyExpiry for lapsed grants, then per-offset
 * reminder enqueue with full dedup. Returns counters for observability.
 *
 * The reminder enqueue + dedup row write are wrapped in a transaction so a
 * later enqueue failure rolls back the dedup row, leaving the next pass free
 * to retry.
 */
export function runDailyPass(opts: RunOpts = {}): RunDailyPassResult {
  const now    = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const offsets = readConfiguredOffsets();
  const maxDays = Math.max(...offsets.map((o) => o.days), 0);
  // Pull candidates up to maxDays in the future (plus one day for boundary
  // safety on the T-days_1 window).
  const upperBoundIso = new Date(now.getTime() + (maxDays + 1) * MS_PER_DAY).toISOString();

  const result: RunDailyPassResult = {
    candidates_scanned:       0,
    reminders_enqueued:       0,
    expiry_rows_applied:      0,
    skipped_outside_window:   0,
    skipped_non_tier0:        0,
    skipped_unsubscribed:     0,
    skipped_email_suppressed: 0,
    skipped_already_sent:     0,
    skipped_missing_email:    0,
  };

  const candidates = activePlayerExpiry.listCandidates.all(upperBoundIso) as
    ActivePlayerExpiryCandidateRow[];
  result.candidates_scanned = candidates.length;

  const comm = getCommunicationService();

  for (const c of candidates) {
    // Step 1: lapsed grants get an expire ledger row written. applyExpiry is
    // idempotent (no-op when the latest row is already expire/end). Pass the
    // worker's `now` through so the expiry decision aligns with the run.
    //
    // When expiry was applied, this candidate's reminder window has already
    // closed (the grant just expired today or earlier). Skip the reminder-
    // eligibility check entirely to keep the counter buckets disjoint:
    // expiry_rows_applied counts "we wrote an expire row" and
    // skipped_outside_window counts "we did NOT write expiry AND did NOT
    // enqueue a reminder." Counting one candidate in both was a reporting
    // bug; per-bucket totals must be independently meaningful for ops to
    // read details_json correctly.
    if (c.expires_at < nowIso) {
      const r = applyExpiry(c.member_id, now);
      if (r.expired) result.expiry_rows_applied += 1;
      continue;
    }

    // Step 2: reminder eligibility.
    const offset = decideReminderDue(c.expires_at, nowIso, offsets);
    if (!offset) {
      result.skipped_outside_window += 1;
      continue;
    }

    // Re-confirm tier. The candidate snapshot used tier_status='tier0'; an
    // in-flight upgrade between the query and now must suppress the send.
    const tier = getTierStatus(c.member_id);
    if (tier.tier_status !== 'tier0') {
      result.skipped_non_tier0 += 1;
      continue;
    }

    if (!c.login_email) {
      result.skipped_missing_email += 1;
      continue;
    }
    if (c.email_status !== 'ok') {
      result.skipped_email_suppressed += 1;
      continue;
    }
    if (!isSubscribed(c.member_id)) {
      result.skipped_unsubscribed += 1;
      continue;
    }

    const sent = transaction(() => {
      const recorded = tryRecordReminderSent(c.member_id, c.expires_at, offset.label, nowIso);
      if (!recorded) return false;
      const { subject, bodyText } = buildReminderEmail(c.expires_at, offset.label);
      comm.enqueueEmail({
        recipientEmail:    c.login_email!,
        recipientMemberId: c.member_id,
        subject,
        bodyText,
        mailingListId:     MAILING_LIST_SLUG,
        idempotencyKey:    `ap-reminder:${c.member_id}:${c.expires_at}:${offset.label}`,
      });
      return true;
    }) as boolean;

    if (sent) {
      result.reminders_enqueued += 1;
    } else {
      result.skipped_already_sent += 1;
    }
  }

  logger.info('SYS_Check_Active_Player_Expiry run', {
    nowIso,
    ...result,
  });

  return result;
}
