/**
 * WorkQueueService -- the single path that adds an admin work-queue item, and
 * the owner of the item's claim state and its notification policy.
 *
 * Owns: creating `work_queue_items` rows (every insert goes through `enqueue`;
 * direct `workQueue.insertItem` calls outside this service are forbidden by the
 * convention gate), claiming an item, and the two scheduled notification passes
 * (per-administrator digest, one-time stale escalation).
 *
 * Notification policy (routing by urgency, never a per-event broadcast to every
 * administrator): a task type on the urgent allowlist emails the admin-alerts
 * mailing list immediately on enqueue; every other (routine) task type sends no
 * per-event email and is read on the work-queue dashboard, with a periodic
 * digest per administrator rolling up the open routine items. An administrator
 * who claims an item drops it from every other administrator's digest. An item
 * left open and unclaimed past the stale threshold escalates once with a single
 * email to admin-alerts. Every notification carries task type and entity id
 * only (no member personal data). The urgent allowlist is currently empty: no
 * shipped task type meets the same-day security-or-data-integrity bar, so a
 * future such task type opts in by joining the set.
 *
 * Transaction discipline: `enqueue` and `claim` perform only synchronous DB
 * writes and never open their own transaction; call them inside the caller's
 * `transaction(...)` so the row and the caller's audit rows commit or roll back
 * together. The digest and escalation passes are standalone scheduled reads
 * plus best-effort outbox enqueues, run outside any caller transaction.
 *
 * Persistence: writes `work_queue_items` (insert, claim); reads it for the
 * digest and escalation passes. Enqueues to `outbox_emails` via emailService.
 *
 * Side effects: work-queue insert; work-queue claim; admin-alerts outbox
 * enqueue (urgent per-event, and stale escalation); per-administrator digest
 * outbox enqueue.
 *
 * Service shape: singleton object.
 */
import { randomUUID } from 'crypto';
import { workQueue, mailingListSubscriptions } from '../db/db';
import { emailService } from './emailService';
import { readIntConfig } from './configReader';
import { config } from '../config/env';
import { logger } from '../config/logger';

export interface WorkQueueEnqueueInput {
  /** created_by / updated_by on the row; 'system' for automated producers. */
  actorId: string;
  queueCategory: string;
  taskType: string;
  entityType: string;
  /** The domain entity the task concerns (e.g. the member id); also the
   *  entity id carried in the admin-alerts notification. */
  entityId: string;
  priority: number;
  reasonText: string | null;
  detailText: string | null;
}

/**
 * Task types that email every administrator immediately on enqueue (a security
 * or data-integrity event needing same-day action). Empty today: every shipped
 * work-queue task type is routine and read on the dashboard plus the digest. A
 * future urgent task type joins this set to opt into the immediate broadcast.
 */
const URGENT_TASK_TYPES = new Set<string>([]);

function adminQueueUrl(): string {
  return `${config.publicBaseUrl}/admin/work-queue`;
}

interface DigestRow {
  id: string;
  queue_category: string;
  task_type: string;
  entity_id: string;
  opened_at: string;
  claimed_by_member_id: string | null;
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
  /** Insert one work-queue item. An urgent task type also fans its admin-alerts
   *  notification out in the same step; a routine task type sends no per-event
   *  email and is surfaced on the dashboard and the digest. Returns the
   *  generated work-item id for the caller's audit row / return. */
  enqueue(input: WorkQueueEnqueueInput): { id: string } {
    const id = `wq_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const nowIso = new Date().toISOString();
    workQueue.insertItem.run(
      id, nowIso, input.actorId, nowIso, input.actorId,
      input.queueCategory,
      input.taskType,
      input.entityType,
      input.entityId,
      input.priority,
      nowIso,
      input.reasonText,
      input.detailText,
    );
    if (URGENT_TASK_TYPES.has(input.taskType)) {
      emailService.sendToAdmins({
        template: 'admin_queue_alert',
        params: { taskType: input.taskType, entityId: input.entityId },
        idempotencyKeyPrefix: `admin-alerts:${input.taskType}:${id}`,
      });
    }
    return { id };
  },

  /** Claim an open, unclaimed item for the given administrator. A second claim
   *  of the same item (already claimed, or no longer open) is a no-op. */
  claim(input: { queueItemId: string; adminMemberId: string }): {
    status: 'claimed' | 'already_claimed_or_closed';
  } {
    const nowIso = new Date().toISOString();
    const res = workQueue.claimItem.run(
      input.adminMemberId, nowIso, nowIso, input.adminMemberId, input.queueItemId,
    );
    return { status: res.changes > 0 ? 'claimed' : 'already_claimed_or_closed' };
  },

  /** Scheduled pass: email each administrator a digest of the open routine
   *  work-queue items, excluding the items another administrator has claimed.
   *  Best-effort per administrator so one delivery problem never aborts the
   *  batch. Idempotent within a calendar day via a per-administrator key. */
  sendAdminQueueDigests(): { admins: number; sent: number; openRoutineItems: number } {
    const open = workQueue.listOpenForDigest.all() as DigestRow[];
    const routine = open.filter((i) => !URGENT_TASK_TYPES.has(i.task_type));
    if (routine.length === 0) return { admins: 0, sent: 0, openRoutineItems: 0 };

    const admins = mailingListSubscriptions.listActiveSubscribersBySlug.all('admin-alerts') as AdminSubscriberRow[];
    const queueUrl = adminQueueUrl();
    const dateStamp = new Date().toISOString().slice(0, 10);
    let sent = 0;
    for (const admin of admins) {
      // An item another administrator has claimed drops out of this
      // administrator's digest; unclaimed items and this administrator's own
      // claimed items stay.
      const forAdmin = routine.filter(
        (i) => i.claimed_by_member_id === null || i.claimed_by_member_id === admin.member_id,
      );
      if (forAdmin.length === 0) continue;
      const itemLines = forAdmin
        .map((i) => `Task type: ${i.task_type}, Entity ID: ${i.entity_id}`)
        .join('\n');
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
    return { admins: admins.length, sent, openRoutineItems: routine.length };
  },

  /** Scheduled pass: for each open, unclaimed routine item older than the stale
   *  threshold, escalate once with a single email to admin-alerts. The per-item
   *  outbox idempotency key makes each item escalate exactly once. */
  escalateStaleQueueItems(): { escalated: number } {
    const cutoffDays = readIntConfig('admin_queue_stale_escalation_days', 3);
    const cutoffIso = new Date(Date.now() - cutoffDays * 86_400_000).toISOString();
    const stale = workQueue.listStaleUnclaimedForEscalation.all(cutoffIso) as StaleRow[];
    const queueUrl = adminQueueUrl();
    let escalated = 0;
    for (const item of stale) {
      if (URGENT_TASK_TYPES.has(item.task_type)) continue;
      const ageDays = Math.max(1, Math.floor((Date.now() - Date.parse(item.opened_at)) / 86_400_000));
      const result = emailService.sendToAdmins({
        template: 'admin_queue_stale_escalation',
        params: { taskType: item.task_type, entityId: item.entity_id, ageDays, queueUrl },
        idempotencyKeyPrefix: `admin-queue-escalation:${item.id}`,
      });
      // Count only the first-time escalations; a re-run of the pass finds the
      // same still-open items but the idempotency key suppresses a second send.
      if (result.enqueued > 0) escalated += 1;
    }
    return { escalated };
  },
};
