/**
 * WorkQueueService -- the single path that adds an admin work-queue item, and
 * the owner of the item's claim state and its notification policy.
 *
 * Owns: creating `work_queue_items` rows (every insert goes through `enqueue`;
 * direct `workQueue.insertItem` calls outside this service are forbidden by the
 * convention gate), claiming an item, and the two scheduled notification passes
 * (per-administrator digest, one-time stale escalation).
 *
 * Required pattern: a task type with no entry in the task-type table cannot be
 * enqueued. `enqueue` asserts the declaration exists before it writes, so a type
 * nobody declared is refused at the point of creation rather than becoming a card
 * an administrator can read and never close.
 *
 * Notification policy (routing by kind, never a per-event broadcast to every
 * administrator): a task type declared a Team Alert emails the admin-alerts
 * mailing list immediately on enqueue with the alert template it names; every
 * routine type (Someone Is Waiting or Housekeeping) sends no per-event email and
 * is read on the work queue, with a periodic digest per administrator rolling up
 * the open routine items. An administrator who claims an item drops it from
 * every other administrator's digest. An item left open and unclaimed past the
 * stale threshold escalates once with a single email to admin-alerts, which a
 * Team Alert skips because it already broadcast on enqueue. Every notification
 * names the task type and links to the item, and carries no entity id and no
 * member personal data: the item's page is where the subject is named, behind
 * the admin gate. The
 * administrator-loss recruitment alert is the one shipped Team Alert; a future
 * task type meeting the same-day security, data-integrity, or continuity bar
 * opts in by declaring that kind and naming its own alert in the table. Area
 * routing adds to this and changes none of it: each area (routing topic) whose
 * runtime switch is on also receives, in the digest pass, one digest at its
 * group address listing the area's open routine items under no live claim. With
 * every switch off the pass sends exactly the per-administrator digests. An area
 * address receives only that digest; a type needing same-day action is a Team
 * Alert instead.
 *
 * Transaction discipline: `enqueue` and `claim` perform only synchronous DB
 * writes and never open their own transaction; call them inside the caller's
 * `transaction(...)` so the row and the caller's audit rows commit or roll back
 * together. The digest and escalation passes are standalone scheduled reads
 * plus best-effort outbox enqueues, run outside any caller transaction.
 *
 * Persistence: writes `work_queue_items` (insert, claim); reads it for the
 * digest and escalation passes; reads `system_config_current` for each area's
 * switch. Enqueues to `outbox_emails` via emailService.
 *
 * Side effects: work-queue insert; work-queue claim; admin-alerts outbox
 * enqueue (Team Alert per-event, and stale escalation); per-administrator digest
 * outbox enqueue; per-area digest outbox enqueue to the area's group address.
 *
 * Service shape: singleton object.
 */
import { randomUUID } from 'crypto';
import { workQueue, mailingListSubscriptions } from '../db/db';
import { emailService } from './emailService';
import {
  requireWorkQueueDescriptor,
  workQueueDescriptorFor,
  workQueueKindDescriptor,
  kindOf,
  WORK_QUEUE_KINDS,
  WORK_QUEUE_TOPICS,
  WORK_QUEUE_TOPIC_KEYS,
  topicRouteConfigKey,
  type WorkQueueTopic,
} from './workQueueTaskTypes';
import { readIntConfig } from './configReader';
import { config } from '../config/env';
import { logger } from '../config/logger';

export interface WorkQueueEnqueueInput {
  /** created_by / updated_by on the row; 'system' for automated producers. */
  actorId: string;
  taskType: string;
  entityType: string;
  /** The domain entity the task concerns (e.g. the member id). */
  entityId: string;
  reasonText: string | null;
  detailText: string | null;
}

/**
 * The work-queue task type raised when the platform loses an administrator, so
 * the remaining administrators are prompted to recruit a replacement.
 */
export const ADMIN_LOSS_TASK_TYPE = 'admin_loss_recruitment';

function adminQueueUrl(): string {
  return `${config.publicBaseUrl}/admin/work-queue`;
}

/** One item's own page, where an administrator reads it and acts on it. */
function itemUrl(id: string): string {
  return `${config.publicBaseUrl}/admin/work-queue/${encodeURIComponent(id)}`;
}

/** Whole days an item has waited, counting a day begun as one. */
function daysWaiting(openedAtIso: string, nowMs: number): number {
  return Math.max(1, Math.floor((nowMs - Date.parse(openedAtIso)) / 86_400_000));
}

/** A type withdrawn since its item was raised is listed as Housekeeping, as the queue lists it. */
function kindLabelFor(taskType: string): string {
  return workQueueKindDescriptor(kindOf(taskType) ?? 'housekeeping').label;
}

/**
 * The digest's item list: one heading per routine kind, in the order the queue
 * shows them, then one line per item naming its task, its area or Shared, and
 * how long it has waited, with a link to its page. The line names no entity:
 * an id identifies nothing an administrator can act on from an email, and the
 * item's page names the subject behind the admin gate.
 */
function digestLines(items: DigestRow[], nowMs: number): string {
  return WORK_QUEUE_KINDS
    .filter((k) => k.kind !== 'team_alert')
    .map((k) => {
      const ofKind = items.filter((i) => (kindOf(i.task_type) ?? 'housekeeping') === k.kind);
      if (ofKind.length === 0) return null;
      const lines = ofKind.map((i) => {
        const descriptor = workQueueDescriptorFor(i.task_type);
        const area = descriptor?.routeTopic ? WORK_QUEUE_TOPICS[descriptor.routeTopic].label : 'Shared';
        const days = daysWaiting(i.opened_at, nowMs);
        return `${descriptor?.label ?? i.task_type} (${area}), waiting ${days} day${days === 1 ? '' : 's'}: ${itemUrl(i.id)}`;
      });
      return `${k.label}:\n${lines.join('\n')}`;
    })
    .filter((group): group is string => group !== null)
    .join('\n\n');
}

/**
 * Whether a task type emails every administrator the moment an item is raised.
 * The task-type table decides it: a Team Alert broadcasts on enqueue, and every
 * other kind is routine, read on the queue and rolled up in the periodic digest.
 * An unknown type is treated as routine here rather than crashing the digest
 * pass, because a scheduled read must survive a row whose type has since been
 * withdrawn; the enqueue path is where a type without a declaration is refused.
 */
function isTeamAlertTaskType(taskType: string): boolean {
  return kindOf(taskType) === 'team_alert';
}

interface DigestRow {
  id: string;
  task_type: string;
  entity_id: string;
  opened_at: string;
  claimed_by_member_id: string | null;
  claimed_at: string | null;
}

/**
 * The moment before which a claim no longer counts as held. A claim is a
 * coordination signal saying someone is on it, not a lock: it drops the item
 * from every other administrator's digest and out of the escalation sweep, so
 * a claim that outlives the administrator's attention would silence the item
 * for everyone permanently. It expires on the same measure the queue already
 * uses for an item going stale, so there is one notion of staleness rather
 * than two.
 */
export function claimStaleCutoffIso(nowMs: number = Date.now()): string {
  const days = readIntConfig('admin_queue_stale_escalation_days', 3);
  return new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString();
}

/** A claim counts only while it is younger than the staleness cutoff. */
export function claimIsLive(claimedAt: string | null, staleCutoffIso: string): boolean {
  return claimedAt !== null && claimedAt >= staleCutoffIso;
}

export interface AdminQueueDigestResult {
  admins: number;
  sent: number;
  openRoutineItems: number;
  /** Per area whose switch is on and had something to list: the items sent. */
  topicDigests: Partial<Record<WorkQueueTopic, number>>;
}

interface AdminSubscriberRow {
  member_id: string;
  login_email: string;
}

interface StaleRow {
  id: string;
  task_type: string;
  entity_id: string;
  opened_at: string;
}

export const workQueueService = {
  /** Insert one work-queue item. A Team Alert also fans its admin-alerts
   *  notification out in the same step; a routine task type sends no per-event
   *  email and is surfaced on the dashboard and the digest. Returns the
   *  generated work-item id for the caller's audit row / return. */
  enqueue(input: WorkQueueEnqueueInput): { id: string } {
    // A type with no declaration would render a card carrying no action, which
    // an administrator can read and never close. Refusing the row here is what
    // makes that state unrepresentable rather than merely fixed once.
    const descriptor = requireWorkQueueDescriptor(input.taskType);
    const id = `wq_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const nowIso = new Date().toISOString();
    workQueue.insertItem.run(
      id, nowIso, input.actorId, nowIso, input.actorId,
      input.taskType,
      input.entityType,
      input.entityId,
      nowIso,
      input.reasonText,
      input.detailText,
    );
    if (descriptor.kind === 'team_alert' && descriptor.alertTemplate) {
      emailService.sendToAdmins({
        template: descriptor.alertTemplate,
        params:   { itemUrl: itemUrl(id) },
        idempotencyKeyPrefix: `admin-alerts:${input.taskType}:${id}`,
      });
    }
    return { id };
  },

  /** Claim an open item for the given administrator. A second claim while
   *  another administrator's claim is still live (or the item is closed) is a
   *  no-op; an item whose claim has gone stale is claimable again.
   *
   *  No audit row is written, deliberately, as on the sibling club-cleanup
   *  queue: a claim is a coordination hint, not a resolution. The row it
   *  mutates already records who holds it and since when, the claim expires on
   *  its own so it can never silence an item, and the act it precedes writes its
   *  own audit row. */
  claim(input: { queueItemId: string; adminMemberId: string }): {
    status: 'claimed' | 'already_claimed_or_closed';
  } {
    const nowIso = new Date().toISOString();
    const res = workQueue.claimItem.run(
      input.adminMemberId, nowIso, nowIso, input.adminMemberId, input.queueItemId,
      claimStaleCutoffIso(),
    );
    return { status: res.changes > 0 ? 'claimed' : 'already_claimed_or_closed' };
  },

  /** Scheduled pass: email each administrator a digest of the open routine
   *  work-queue items, excluding the items another administrator has claimed.
   *  Best-effort per administrator so one delivery problem never aborts the
   *  batch. Idempotent within a calendar day via a per-administrator key. */
  sendAdminQueueDigests(): AdminQueueDigestResult {
    const open = workQueue.listOpenForDigest.all() as DigestRow[];
    const routine = open.filter((i) => !isTeamAlertTaskType(i.task_type));
    if (routine.length === 0) return { admins: 0, sent: 0, openRoutineItems: 0, topicDigests: {} };

    const admins = mailingListSubscriptions.listActiveSubscribersBySlug.all('admin-alerts') as AdminSubscriberRow[];
    const queueUrl = adminQueueUrl();
    const nowMs = Date.now();
    const dateStamp = new Date(nowMs).toISOString().slice(0, 10);
    const staleCutoffIso = claimStaleCutoffIso(nowMs);
    let sent = 0;
    for (const admin of admins) {
      // An item under another administrator's live claim drops out of this
      // administrator's digest; unclaimed items, this administrator's own
      // claimed items, and items whose claim has gone stale all stay, so a
      // forgotten claim cannot hide an item from everyone indefinitely.
      const forAdmin = routine.filter(
        (i) => !claimIsLive(i.claimed_at, staleCutoffIso)
          || i.claimed_by_member_id === admin.member_id,
      );
      if (forAdmin.length === 0) continue;
      const itemLines = digestLines(forAdmin, nowMs);
      try {
        emailService.send({
          template: 'admin_queue_digest',
          params: { openCount: forAdmin.length, itemLines, queueUrl },
          recipientEmail: admin.login_email,
          recipientMemberId: admin.member_id,
          idempotencyKey: `admin-queue-digest:${dateStamp}:${admin.member_id}`,
        });
        sent += 1;
      } catch (err) {
        logger.warn('admin_queue_digest enqueue failed for one administrator', {
          memberId: admin.member_id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // The area pass: additive, and silent unless an area's switch is on, so with
    // every switch off the outbox holds exactly the per-administrator digests
    // above. Each area that is on gets one digest at its group address listing
    // the area's routine items nobody holds a live claim on; parked items never
    // reached this list. The group decides who reads it, so the send names no
    // member and the outbox's member suppression does not apply to it.
    const topicDigests: Partial<Record<WorkQueueTopic, number>> = {};
    for (const topic of WORK_QUEUE_TOPIC_KEYS) {
      if (readIntConfig(topicRouteConfigKey(topic), 0) !== 1) continue;
      const forTopic = routine.filter(
        (i) => workQueueDescriptorFor(i.task_type)?.routeTopic === topic
          && !claimIsLive(i.claimed_at, staleCutoffIso),
      );
      if (forTopic.length === 0) continue;
      const area = WORK_QUEUE_TOPICS[topic];
      try {
        emailService.send({
          template: 'admin_queue_topic_digest',
          params: {
            areaLabel: area.label,
            openCount: forTopic.length,
            itemLines: digestLines(forTopic, nowMs),
            queueUrl: `${queueUrl}?topic=${topic}`,
          },
          recipientEmail: area.address,
          recipientMemberId: null,
          idempotencyKey: `admin-queue-topic-digest:${dateStamp}:${topic}`,
        });
        topicDigests[topic] = forTopic.length;
      } catch (err) {
        logger.warn('admin_queue_topic_digest enqueue failed for one area', {
          topic,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { admins: admins.length, sent, openRoutineItems: routine.length, topicDigests };
  },

  /** Scheduled pass: for each open routine item older than the stale threshold
   *  and not under a live claim, escalate once with a single email to
   *  admin-alerts. An item whose own claim has gone stale is eligible again, so
   *  a forgotten claim cannot suppress escalation forever. The per-item outbox
   *  idempotency key makes each item escalate exactly once. */
  escalateStaleQueueItems(): { escalated: number } {
    const cutoffDays = readIntConfig('admin_queue_stale_escalation_days', 3);
    const cutoffIso = new Date(Date.now() - cutoffDays * 86_400_000).toISOString();
    const stale = workQueue.listStaleForEscalation.all(cutoffIso, claimStaleCutoffIso()) as StaleRow[];
    const nowMs = Date.now();
    let escalated = 0;
    for (const item of stale) {
      if (isTeamAlertTaskType(item.task_type)) continue;
      const result = emailService.sendToAdmins({
        template: 'admin_queue_stale_escalation',
        params: {
          taskLabel: workQueueDescriptorFor(item.task_type)?.label ?? item.task_type,
          kindLabel: kindLabelFor(item.task_type),
          ageDays:   daysWaiting(item.opened_at, nowMs),
          itemUrl:   itemUrl(item.id),
        },
        idempotencyKeyPrefix: `admin-queue-escalation:${item.id}`,
      });
      // Count only the first-time escalations; a re-run of the pass finds the
      // same still-open items but the idempotency key suppresses a second send.
      if (result.enqueued > 0) escalated += 1;
    }
    return { escalated };
  },
};
