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
 *   - A clear applies to the newest uncleared alarm of that name, whether it
 *     was acknowledged or not: acknowledging records that an administrator is
 *     handling the incident, and the monitored condition is what ends it.
 *   - Acknowledgment is one-shot, enforced in the UPDATE's WHERE clause, so a
 *     resubmitted form cannot overwrite the first administrator's name or note.
 *   - Severity is derived from the notification state, because the monitoring
 *     service's payload carries no severity of its own: a firing alarm is
 *     critical and a monitor that has lost its data is a warning.
 *
 * Persistence: system_alarm_events (insert and update), sns_alarm_events
 * (idempotency claim), members (read, to name the acknowledging admin).
 *
 * Side effects:
 *   - audit_entries append (alarm.raised, alarm.cleared, alarm.acknowledged, and
 *     alarm.subscription_pending when the notification service asks for a
 *     subscription to be confirmed)
 *   - logger.warn carrying the one-time confirmation URL, which is a bearer
 *     token and so is deliberately kept out of the admin-exportable,
 *     erasure-exempt audit trail. The log ships to CloudWatch and is retained,
 *     so this chooses which surface holds the token rather than avoiding
 *     writing it down; the token is single-use and expires. It is logged only
 *     when it is genuinely an HTTPS SNS endpoint and within a length bound,
 *     because a forged confirmation makes that URL attacker-chosen.
 *
 * Service shape: object-literal singleton (`systemAlarmService`); no adapters.
 */
import { randomUUID } from 'node:crypto';
import { systemAlarms, transaction } from '../db/db';
import { runSqliteRead } from './sqliteRetry';
import { appendAuditEntry } from './auditService';
import { NotFoundError } from './serviceErrors';
import { logger } from '../config/logger';
import { safeSubscribeUrlForLog } from '../lib/snsSignature';
import type { PageViewModel } from '../types/page';

const RECENT_ALARM_LIMIT = 100;

export type AlarmIngestResult =
  | { status: 'processed'; kind: 'raised' | 'cleared'; alarmType: string }
  | { status: 'duplicate' }
  | { status: 'subscription_pending' }
  | {
      status: 'ignored';
      reason: 'malformed' | 'unknown_type' | 'unknown_state' | 'nothing_to_clear';
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

function shapeAlarmRow(row: AlarmListRow): AlarmRowViewModel {
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
  };
}

/**
 * Internal signal that a clear found no open alarm to apply to. It exists to
 * roll the surrounding transaction back, releasing the notification's message-id
 * claim, and never escapes this module.
 */
class NothingToClearSignal extends Error {}

/** The alarms page at a given page number; page one carries no parameter. */
function alarmsPageHref(page: number): string {
  return page > 1 ? `/admin/alarms?page=${page}` : '/admin/alarms';
}

/** Record one alarm state change. Returns the ingest outcome; the caller turns
 *  it into an HTTP response and a log line. */
function applyStateChange(
  messageId: string | null,
  alarmName: string,
  severity: 'critical' | 'warning',
  raisedAt: string,
  details: Record<string, unknown>,
): AlarmIngestResult {
  const now = new Date().toISOString();
  let outcome: AlarmIngestResult = { status: 'processed', kind: 'raised', alarmType: alarmName };
  transaction(() => {
    // Claim the notification identifier first. A redelivery whose id is already
    // recorded reports no change, so the alarm row and its audit entry are
    // written exactly once. A notification arriving without an identifier cannot
    // be deduplicated and is processed anyway: losing a real alarm is worse than
    // recording one twice.
    if (messageId) {
      const claim = systemAlarms.claimMessageOrIgnore.run(messageId, now, alarmName, now);
      if (claim.changes === 0) {
        outcome = { status: 'duplicate' };
        return;
      }
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
    appendAuditEntry({
      actionType:    'alarm.raised',
      category:      'system',
      actorType:     'system',
      actorMemberId: null,
      entityType:    'system_alarm',
      entityId:      id,
      reasonText:    null,
      metadata:      { alarm_type: alarmName, severity },
    });
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
  try {
    transaction(() => {
      if (messageId) {
        const claim = systemAlarms.claimMessageOrIgnore.run(messageId, now, alarmName, now);
        if (claim.changes === 0) {
          outcome = { status: 'duplicate' };
          return;
        }
      }
      const prior = systemAlarms.findLatestUncleared.get(alarmName) as UnclearedAlarmRow | undefined;
      if (prior === undefined) {
        // A recovery notification for an alarm this platform has no open record
        // of: it fired before the feed existed, it has already been cleared, or
        // this clear has overtaken its own raise in delivery.
        //
        // Throwing rolls the transaction back, which gives the message-id claim
        // back. Returning normally would commit it -- the database wrapper
        // commits whatever the callback did unless it throws -- and a claimed id
        // is dismissed as a duplicate forever, so a redelivery arriving after the
        // raise finally lands could never clear it.
        throw new NothingToClearSignal();
      }
      systemAlarms.markCleared.run(clearedAt, now, prior.id);
      appendAuditEntry({
        actionType:    'alarm.cleared',
        category:      'system',
        actorType:     'system',
        actorMemberId: null,
        entityType:    'system_alarm',
        entityId:      prior.id,
        reasonText:    null,
        metadata:      { alarm_type: alarmName },
      });
    });
  } catch (err) {
    if (!(err instanceof NothingToClearSignal)) throw err;
    return { status: 'ignored', reason: 'nothing_to_clear' };
  }
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
    // Claim the message id first, exactly as the notification path does. Without
    // it every repeat of one confirmation writes another row into an
    // append-only ledger that nothing can prune, which is a flooding primitive
    // for anyone able to reach this endpoint.
    const confirmationId = typeof envelope.MessageId === 'string' ? envelope.MessageId : null;
    const seenAt = new Date().toISOString();
    let outcome: AlarmIngestResult = { status: 'subscription_pending' };
    transaction(() => {
      if (confirmationId) {
        const claim = systemAlarms.claimMessageOrIgnore.run(
          confirmationId, seenAt, 'subscription_confirmation', seenAt,
        );
        if (claim.changes === 0) {
          outcome = { status: 'duplicate' };
          return;
        }
      }
      // The one-time confirmation URL is a bearer token, so it stays out of the
      // durable audit trail and appears only on this transient operator line for
      // immediate out-of-band confirmation. It is also attacker-chosen on a
      // forged confirmation, so it is logged only when it is genuinely an SNS
      // endpoint.
      logger.warn('alarm_feed.subscription_confirmation_pending', {
        topicArn:     envelope.TopicArn,
        subscribeUrl: safeSubscribeUrlForLog(envelope.SubscribeURL),
      });
      appendAuditEntry({
        actionType:    'alarm.subscription_pending',
        category:      'system',
        actorType:     'system',
        actorMemberId: null,
        entityType:    'system',
        entityId:      'alarm_feed',
        reasonText:    'Alarm-topic subscription confirmation received; operator confirms out-of-band.',
        metadata:      { topic_arn: typeof envelope.TopicArn === 'string' ? envelope.TopicArn : null },
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
    return applyStateChange(messageId, alarmName, 'critical', stateChangedAt, details);
  }
  if (state === 'INSUFFICIENT_DATA') {
    return applyStateChange(messageId, alarmName, 'warning', stateChangedAt, details);
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
    const note = input.note && input.note.trim() ? input.note.trim().slice(0, 500) : null;
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
        category:      'system',
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
    opts: { acknowledgedFlag?: boolean; alreadySettledFlag?: boolean; page?: number } = {},
  ): PageViewModel<AlarmsContent> {
    // A contended database renders the standard temporarily-unavailable page
    // rather than falling to the generic handler, which shows the same page
    // under a 500.
    return runSqliteRead('admin alarms page', () => this.readAlarmsPage(opts));
  },

  readAlarmsPage(
    opts: { acknowledgedFlag?: boolean; alreadySettledFlag?: boolean; page?: number } = {},
  ): PageViewModel<AlarmsContent> {
    const page = opts.page && opts.page > 0 ? Math.floor(opts.page) : 1;
    const offset = (page - 1) * RECENT_ALARM_LIMIT;
    const rows = systemAlarms.listRecent.all(RECENT_ALARM_LIMIT, offset) as AlarmListRow[];
    const total = (systemAlarms.countAll.get() as { n: number }).n;
    const activeCount = this.countActiveUnacknowledged();
    const firstShown = total === 0 ? 0 : offset + 1;
    const lastShown = offset + rows.length;
    return {
      seo: { title: 'Platform Alarms', noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_alarms', title: 'Platform Alarms' },
      content: {
        alarms: rows.map(shapeAlarmRow),
        hasAlarms: rows.length > 0,
        resultSummary: total === 0
          ? 'No alarms have been recorded.'
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
