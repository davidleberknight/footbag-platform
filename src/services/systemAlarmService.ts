/**
 * SystemAlarmService -- platform alarm intake and acknowledgment.
 *
 * Owns: the whole lifecycle of a platform alarm inside the application. It
 * records each alarm state change delivered by the monitoring service's
 * notification topic, clears an alarm when the monitored condition returns to
 * normal, lets an administrator acknowledge one with a note, and shapes the
 * admin alarm page. Does not own: raising alarms (the monitoring service
 * decides what an alarm is and when it fires), nor the transport
 * authentication on the webhook, which is the controller's concern.
 *
 * Required patterns:
 *   - Ingest is idempotent per notification: the message identifier is claimed
 *     in `sns_alarm_events` inside the same transaction as the alarm write, so
 *     a redelivery leaves the record exactly as it stands. The notification
 *     service redelivers whenever it does not see a timely success, so this is
 *     the difference between one alarm row and a dozen.
 *   - State changes apply in the monitoring service's own order, never the
 *     order they arrive: the queue does not keep order, so a return to normal
 *     can arrive before the alarm it ends. Each claim records the state and its
 *     change time, and a change older than one already claimed for that alarm
 *     is recorded and changes nothing. On an exact tie a return to normal wins.
 *     A return to normal with nothing open keeps its claim, which is what marks
 *     the late raise as stale. Every message is therefore final once handled;
 *     none relies on being delivered again.
 *   - A clear applies to the newest uncleared alarm of that name, whether it
 *     was acknowledged or not: acknowledging records that an administrator is
 *     handling the incident, and the monitored condition is what ends it.
 *   - Acknowledgment is one-shot, enforced in the UPDATE's WHERE clause, so a
 *     resubmitted form cannot overwrite the first administrator's name or note.
 *   - The acknowledgment note is cleaned with the shared write-time sanitizer
 *     before it is cut to length and stored.
 *   - Severity is derived from the notification state, because the monitoring
 *     service's payload carries no severity of its own: a firing alarm is
 *     critical and a monitor that has lost its data is a warning.
 *
 * Persistence: system_alarm_events (insert and update), sns_alarm_events
 * (idempotency claim, and the per-alarm order read), members (read, to name the
 * acknowledging admin).
 *
 * Side effects:
 *   - audit_entries append (alarm.acknowledged only: a raise and a clear are
 *     recorded on system_alarm_events, which already holds when each happened)
 *   - logger.warn when the notification service asks for a subscription to be
 *     confirmed, carrying the one-time confirmation URL, which is a bearer
 *     token. The log ships to CloudWatch and is retained,
 *     so this chooses which surface holds the token rather than avoiding
 *     writing it down; the token is single-use and expires. The confirmation
 *     URL is logged only when it is an HTTPS SNS endpoint within a length
 *     bound, and is never auto-fetched.
 *
 * Service shape: object-literal singleton (`systemAlarmService`); no adapters.
 */
import { randomUUID } from 'node:crypto';
import { systemAlarms, transaction } from '../db/db';
import { runSqliteRead } from './sqliteRetry';
import { appendAuditEntry } from './auditService';
import { NotFoundError } from './serviceErrors';
import { cleanUserText } from '../lib/textSanitizer';
import { logger } from '../config/logger';
import { safeSubscribeUrlForLog } from '../lib/snsSignature';
import type { PageViewModel } from '../types/page';

const RECENT_ALARM_LIMIT = 100;
/** The alarms page's default span, ending now; an active alarm shows whatever its age. */
const ALARM_WINDOW_DAYS = 30;

export type AlarmIngestResult =
  | { status: 'processed'; kind: 'raised' | 'cleared'; alarmType: string }
  | { status: 'duplicate' }
  | { status: 'subscription_pending' }
  | {
      status: 'ignored';
      reason: 'malformed' | 'unknown_type' | 'unknown_state' | 'nothing_to_clear' | 'stale';
    };

export type AlarmAcknowledgeResult =
  | { status: 'acknowledged'; alarmType: string }
  | { status: 'noop'; reason: 'already_settled' };

interface AlarmRowViewModel {
  id: string;
  alarmLabel: string;
  severityLabel: string;
  isCritical: boolean;
  statusLabel: string;
  isActive: boolean;
  raisedAtDisplay: string;
  clearedAtDisplay: string | null;
  reasonText: string | null;
  acknowledgedSummary: string | null;
  acknowledgmentNote: string | null;
  canAcknowledge: boolean;
  acknowledgeHref: string;
  submittedNote: string;
  noteError: string | null;
}

/** A refused acknowledgement, carried back to the alarm's own form. */
export interface RejectedAcknowledgement {
  alarmId: string;
  note: string;
  message: string;
}

export interface AlarmsPageOptions {
  acknowledgedFlag?: boolean;
  alreadySettledFlag?: boolean;
  page?: number;
  rejected?: RejectedAcknowledgement;
}

export interface AlarmsContent {
  alarms: AlarmRowViewModel[];
  hasAlarms: boolean;
  resultSummary: string;
  activeCount: number;
  showAcknowledgedNotice: boolean;
  showAlreadySettledNotice: boolean;
  /** Paging exists because acknowledging is reachable only from a rendered row:
   *  an older alarm that is still active but off the end of the list would be
   *  counted by the dashboard badge and impossible to act on. */
  prevPageHref: string | null;
  nextPageHref: string | null;
}

interface AlarmListRow {
  id: string;
  alarm_type: string;
  severity: string;
  raised_at: string;
  cleared_at: string | null;
  status: string;
  acknowledged_at: string | null;
  acknowledgment_note: string | null;
  details_json: string;
  acknowledged_by_name: string | null;
  acknowledged_by_slug: string | null;
}

interface UnclearedAlarmRow {
  id: string;
  alarm_type: string;
  severity: string;
  raised_at: string;
  status: string;
}

/** A monitoring timestamp normalized to the platform's ISO form, or the current
 *  time when the payload carries nothing parseable. The notification service
 *  formats its state-change time with a numeric offset rather than a trailing
 *  Z, which would not sort against the timestamps every other row in this
 *  database carries. */
function normalizeTimestamp(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

// Stored timestamps are UTC. This page is read while an incident is being
// reconstructed, so the zone is on the face of the figure rather than assumed.
function tsDisplay(iso: string | null): string | null {
  return iso ? `${iso.slice(0, 19).replace('T', ' ')} UTC` : null;
}

/** The alarm name as a person reads it: the deploy prefixes every alarm with
 *  the environment, and the remaining words are hyphenated. */
function alarmLabel(alarmType: string): string {
  const words = alarmType.split('-').filter(Boolean);
  const label = words.join(' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function detailReason(detailsJson: string): string | null {
  try {
    const parsed = JSON.parse(detailsJson) as Record<string, unknown>;
    const reason = parsed.reason;
    return typeof reason === 'string' && reason.trim() ? reason : null;
  } catch {
    return null;
  }
}

function shapeAlarmRow(row: AlarmListRow, rejected?: RejectedAcknowledgement): AlarmRowViewModel {
  const isRejected = rejected !== undefined && rejected.alarmId === row.id;
  const acknowledgedAt = tsDisplay(row.acknowledged_at);
  const who = row.acknowledged_by_name ?? row.acknowledged_by_slug;
  return {
    id: row.id,
    alarmLabel: alarmLabel(row.alarm_type),
    severityLabel: row.severity.charAt(0).toUpperCase() + row.severity.slice(1),
    isCritical: row.severity === 'critical',
    statusLabel: row.status.charAt(0).toUpperCase() + row.status.slice(1),
    isActive: row.status === 'active',
    raisedAtDisplay: tsDisplay(row.raised_at) ?? row.raised_at,
    clearedAtDisplay: tsDisplay(row.cleared_at),
    reasonText: detailReason(row.details_json),
    acknowledgedSummary: acknowledgedAt
      ? `Acknowledged by ${who ?? 'an administrator'} on ${acknowledgedAt}`
      : null,
    acknowledgmentNote: row.acknowledgment_note,
    canAcknowledge: row.status === 'active',
    acknowledgeHref: `/admin/alarms/${row.id}/acknowledge`,
    submittedNote: isRejected ? rejected.note : '',
    noteError: isRejected ? rejected.message : null,
  };
}

type AlarmState = 'ALARM' | 'INSUFFICIENT_DATA' | 'OK';

/**
 * Claims a notification and places it in the alarm's own order, inside the
 * caller's transaction. The claim is written first, recording the state and the
 * monitoring service's change time, so a redelivery is a duplicate and a later
 * arrival can be judged against it. A change is stale when a change for the same
 * alarm with a later change time was already claimed: the queue does not keep
 * order, so a return to normal can arrive before the alarm it ends. On an exact
 * tie a return to normal outranks a raise, so a pair the monitoring service
 * recorded in the same instant ends cleared. A notification without an
 * identifier cannot be claimed or deduplicated; it is still judged against what
 * was claimed, and processed if current, because losing a real alarm is worse
 * than recording one twice.
 */
function claimInOrder(
  messageId: string | null,
  alarmName: string,
  state: AlarmState,
  changedAt: string,
  now: string,
): 'duplicate' | 'stale' | 'current' {
  if (messageId) {
    const claim = systemAlarms.claimMessageOrIgnore.run(
      messageId, now, alarmName, now, state, changedAt,
    );
    if (claim.changes === 0) return 'duplicate';
  }
  const newest = systemAlarms.findNewestApplied.get(alarmName, messageId ?? '') as
    | { alarm_state: AlarmState | null; state_changed_at: string }
    | undefined;
  if (!newest) return 'current';
  if (changedAt > newest.state_changed_at) return 'current';
  if (changedAt < newest.state_changed_at) return 'stale';
  return state === 'OK' && newest.alarm_state !== 'OK' ? 'current' : 'stale';
}

/** The alarms page at a given page number; page one carries no parameter. */
function alarmsPageHref(page: number): string {
  return page > 1 ? `/admin/alarms?page=${page}` : '/admin/alarms';
}

/** Record one alarm state change. Returns the ingest outcome; the caller turns
 *  it into an HTTP response and a log line. */
function applyStateChange(
  messageId: string | null,
  alarmName: string,
  state: 'ALARM' | 'INSUFFICIENT_DATA',
  severity: 'critical' | 'warning',
  raisedAt: string,
  details: Record<string, unknown>,
): AlarmIngestResult {
  const now = new Date().toISOString();
  let outcome: AlarmIngestResult = { status: 'processed', kind: 'raised', alarmType: alarmName };
  transaction(() => {
    // Claim first, so the alarm row is written exactly once, and judge the
    // change against what the alarm already reported: a raise older than a
    // claimed change of the same alarm is late, and opening or refreshing a row
    // for it would show an alarm the monitoring service has already ended.
    const order = claimInOrder(messageId, alarmName, state, raisedAt, now);
    if (order === 'duplicate') {
      outcome = { status: 'duplicate' };
      return;
    }
    if (order === 'stale') {
      outcome = { status: 'ignored', reason: 'stale' };
      return;
    }
    // The monitoring source is a state machine with one state per alarm, so at
    // most one uncleared row per name exists. A name that fires again before it
    // clears -- alarm, then lost-data, then back to normal -- refreshes that row
    // rather than adding a second: a return to normal clears one row, and no
    // further notification is ever sent for the other, so the extra row would
    // stay active forever and hold the dashboard badge up with it.
    const existing = systemAlarms.findLatestUncleared.get(alarmName) as
      | UnclearedAlarmRow
      | undefined;
    const id = existing?.id
      ?? `alarm_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    if (existing) {
      systemAlarms.refreshUncleared.run(
        severity, raisedAt, JSON.stringify(details), now, existing.id,
      );
    } else {
      systemAlarms.insertAlarm.run(
        id, now, now, alarmName, severity, raisedAt, JSON.stringify(details),
      );
    }
  });
  return outcome;
}

function applyClear(
  messageId: string | null,
  alarmName: string,
  clearedAt: string,
): AlarmIngestResult {
  const now = new Date().toISOString();
  let outcome: AlarmIngestResult = { status: 'processed', kind: 'cleared', alarmType: alarmName };
  transaction(() => {
    const order = claimInOrder(messageId, alarmName, 'OK', clearedAt, now);
    if (order === 'duplicate') {
      outcome = { status: 'duplicate' };
      return;
    }
    if (order === 'stale') {
      outcome = { status: 'ignored', reason: 'stale' };
      return;
    }
    const prior = systemAlarms.findLatestUncleared.get(alarmName) as UnclearedAlarmRow | undefined;
    if (prior === undefined) {
      // A return to normal for an alarm with no open record: it fired before
      // the feed existed, it has already been cleared, it is the first report of
      // a newly created alarm, or it has overtaken its own raise in delivery. The
      // claim stays committed either way: it is the record that this alarm is
      // back to normal as of this change time, so the raise that arrives late is
      // judged stale against it rather than opening an alarm nothing will clear.
      outcome = { status: 'ignored', reason: 'nothing_to_clear' };
      return;
    }
    systemAlarms.markCleared.run(clearedAt, now, prior.id);
  });
  return outcome;
}

function processSnsMessage(rawBody: string): AlarmIngestResult {
  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { status: 'ignored', reason: 'malformed' };
  }

  if (envelope.Type === 'SubscriptionConfirmation') {
    // Claim the message id first, exactly as the notification path does, so a
    // repeat of one confirmation logs nothing a second time.
    const confirmationId = typeof envelope.MessageId === 'string' ? envelope.MessageId : null;
    const seenAt = new Date().toISOString();
    let outcome: AlarmIngestResult = { status: 'subscription_pending' };
    transaction(() => {
      if (confirmationId) {
        const claim = systemAlarms.claimMessageOrIgnore.run(
          confirmationId, seenAt, 'subscription_confirmation', seenAt, null, null,
        );
        if (claim.changes === 0) {
          outcome = { status: 'duplicate' };
          return;
        }
      }
      // A pending subscription changes nothing on the platform, so it writes no
      // audit row; this operator line is its whole trail. The one-time
      // confirmation URL is a bearer token. The confirmation URL is logged only
      // when it is an HTTPS SNS endpoint within a length bound, and is never
      // auto-fetched.
      logger.warn('alarm_feed.subscription_confirmation_pending', {
        topicArn:     envelope.TopicArn,
        subscribeUrl: safeSubscribeUrlForLog(envelope.SubscribeURL),
      });
    });
    return outcome;
  }

  if (envelope.Type !== 'Notification' || typeof envelope.Message !== 'string') {
    return { status: 'ignored', reason: 'unknown_type' };
  }

  const messageId = typeof envelope.MessageId === 'string' ? envelope.MessageId : null;

  let message: Record<string, unknown>;
  try {
    message = JSON.parse(envelope.Message) as Record<string, unknown>;
  } catch {
    return { status: 'ignored', reason: 'malformed' };
  }

  const alarmName = typeof message.AlarmName === 'string' ? message.AlarmName.trim() : '';
  const state = typeof message.NewStateValue === 'string' ? message.NewStateValue : '';
  if (!alarmName) return { status: 'ignored', reason: 'unknown_type' };

  const now = new Date().toISOString();
  const stateChangedAt = normalizeTimestamp(message.StateChangeTime, now);
  const details = {
    reason:      typeof message.NewStateReason === 'string' ? message.NewStateReason : null,
    description: typeof message.AlarmDescription === 'string' ? message.AlarmDescription : null,
    region:      typeof message.Region === 'string' ? message.Region : null,
  };

  if (state === 'ALARM') {
    return applyStateChange(messageId, alarmName, 'ALARM', 'critical', stateChangedAt, details);
  }
  if (state === 'INSUFFICIENT_DATA') {
    return applyStateChange(messageId, alarmName, 'INSUFFICIENT_DATA', 'warning', stateChangedAt, details);
  }
  if (state === 'OK') {
    return applyClear(messageId, alarmName, stateChangedAt);
  }
  return { status: 'ignored', reason: 'unknown_state' };
}

export const systemAlarmService = {
  processSnsMessage,

  /** Count of alarms nobody has picked up yet, for the dashboard badge. */
  countActiveUnacknowledged(): number {
    return (systemAlarms.countActiveUnacknowledged.get() as { n: number }).n;
  },

  acknowledge(input: {
    alarmId: string;
    adminMemberId: string;
    note: string | null;
  }): AlarmAcknowledgeResult {
    const existing = systemAlarms.findById.get(input.alarmId) as
      | { id: string; alarm_type: string; status: string }
      | undefined;
    if (existing === undefined) {
      throw new NotFoundError('Alarm not found');
    }
    // Cleaned before the length cut, so the cut counts what is stored and a
    // note of markup alone is no note at all.
    const cleaned = input.note ? cleanUserText(input.note, 'multi_line', 'note') : '';
    const note = cleaned ? cleaned.slice(0, 500) : null;
    const now = new Date().toISOString();
    let changed = 0;
    transaction(() => {
      const res = systemAlarms.markAcknowledged.run(
        input.adminMemberId, now, note, now, input.adminMemberId, input.alarmId,
      );
      changed = res.changes;
      if (changed === 0) return;
      appendAuditEntry({
        actionType:    'alarm.acknowledged',
        actorType:     'admin',
        actorMemberId: input.adminMemberId,
        entityType:    'system_alarm',
        entityId:      input.alarmId,
        reasonText:    note,
        metadata:      { alarm_type: existing.alarm_type },
      });
    });
    return changed === 0
      ? { status: 'noop', reason: 'already_settled' }
      : { status: 'acknowledged', alarmType: existing.alarm_type };
  },

  getAlarmsPage(
    opts: AlarmsPageOptions = {},
  ): PageViewModel<AlarmsContent> {
    // A contended database renders the standard temporarily-unavailable page
    // rather than falling to the generic handler, which shows the same page
    // under a 500.
    return runSqliteRead('admin alarms page', () => this.readAlarmsPage(opts));
  },

  readAlarmsPage(
    opts: AlarmsPageOptions = {},
  ): PageViewModel<AlarmsContent> {
    const page = opts.page && opts.page > 0 ? Math.floor(opts.page) : 1;
    const offset = (page - 1) * RECENT_ALARM_LIMIT;
    // The last 30 days ending now, plus every alarm still active however old,
    // so a long-running condition never sinks out of view.
    const cutoff = new Date(Date.now() - ALARM_WINDOW_DAYS * 86_400_000).toISOString();
    const rows = systemAlarms.listRecent.all(cutoff, RECENT_ALARM_LIMIT, offset) as AlarmListRow[];
    const total = (systemAlarms.countRecent.get(cutoff) as { n: number }).n;
    const activeCount = this.countActiveUnacknowledged();
    const firstShown = total === 0 ? 0 : offset + 1;
    const lastShown = offset + rows.length;
    return {
      seo: { title: 'Platform Alarms', noindex: true },
      page: {
        sectionKey: 'admin', pageKey: 'admin_alarms', title: 'Platform Alarms',
        instructions: {
          what: 'Lists the alarms the monitoring service has reported.',
          why: 'So the team knows each alarm has someone handling it.',
          how: 'Acknowledge an alarm to record that you are handling it, with an optional note on what you did.',
          headsUp: [
            'Acknowledging does not clear an alarm. It clears by itself when the monitored condition returns to normal.',
            'Each acknowledgment is recorded in the audit log.',
          ],
        },
      },
      content: {
        alarms: rows.map((row) => shapeAlarmRow(row, opts.rejected)),
        hasAlarms: rows.length > 0,
        resultSummary: total === 0
          ? `No alarms in the last ${ALARM_WINDOW_DAYS} days.`
          : `Showing ${firstShown} to ${lastShown} of ${total} alarm${total === 1 ? '' : 's'}.`,
        activeCount,
        showAcknowledgedNotice: opts.acknowledgedFlag === true,
        showAlreadySettledNotice: opts.alreadySettledFlag === true,
        prevPageHref: page > 1 ? alarmsPageHref(page - 1) : null,
        nextPageHref: lastShown < total ? alarmsPageHref(page + 1) : null,
      },
    };
  },
};
