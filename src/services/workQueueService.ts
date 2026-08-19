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
 * mailing list immediately on enqueue, using the notification the allowlist
 * pairs with it; every other (routine) task type sends no per-event email and is
 * read on the work-queue dashboard, with a periodic digest per administrator
 * rolling up the open routine items. An administrator who claims an item drops
 * it from every other administrator's digest. An item left open and unclaimed
 * past the stale threshold escalates once with a single email to admin-alerts,
 * which an urgent type skips because it already broadcast on enqueue. Every
 * notification carries task type and entity id only (no member personal data).
 * The administrator-loss recruitment alert is the one shipped type on the
 * allowlist; a future task type meeting the same-day security, data-integrity,
 * or continuity bar opts in by joining it with its own notification.
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
 * The work-queue task type raised when the platform loses an administrator, so
 * the remaining administrators are prompted to recruit a replacement.
 */
export const ADMIN_LOSS_TASK_TYPE = 'admin_loss_recruitment';

function adminQueueUrl(): string {
  return `${config.publicBaseUrl}/admin/work-queue`;
}

/**
 * Task types that email every administrator immediately on enqueue (a security,
 * data-integrity, or administrative-continuity event needing same-day action),
 * each paired with the notification it sends. A task type outside this map is
 * routine: it sends no per-event email and is read on the dashboard plus the
 * digest. Losing an administrator is the one shipped type that meets the bar,
 * because the people who must act on it are exactly the shrinking set the loss
 * is about, and a digest entry days later is too late to be that prompt.
 */
const URGENT_TASK_EMAILS: ReadonlyMap<string, (entityId: string, idempotencyKeyPrefix: string) => void> = new Map([
  [ADMIN_LOSS_TASK_TYPE, (entityId: string, idempotencyKeyPrefix: string) => {
    emailService.sendToAdmins({
      template: 'admin_loss_recruitment',
      params: { entityId, queueUrl: adminQueueUrl() },
      idempotencyKeyPrefix,
    });
  }],
]);

interface DigestRow {
  id: string;
  queue_category: string;
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
    const sendUrgent = URGENT_TASK_EMAILS.get(input.taskType);
    if (sendUrgent) {
      sendUrgent(input.entityId, `admin-alerts:${input.taskType}:${id}`);
    }
    return { id };
  },

  /** Claim an open item for the given administrator. A second claim while
   *  another administrator's claim is still live (or the item is closed) is a
   *  no-op; an item whose claim has gone stale is claimable again. */
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
  sendAdminQueueDigests(): { admins: number; sent: number; openRoutineItems: number } {
    const open = workQueue.listOpenForDigest.all() as DigestRow[];
    const routine = open.filter((i) => !URGENT_TASK_EMAILS.has(i.task_type));
    if (routine.length === 0) return { admins: 0, sent: 0, openRoutineItems: 0 };

    const admins = mailingListSubscriptions.listActiveSubscribersBySlug.all('admin-alerts') as AdminSubscriberRow[];
    const queueUrl = adminQueueUrl();
    const dateStamp = new Date().toISOString().slice(0, 10);
    const staleCutoffIso = claimStaleCutoffIso();
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

  /** Scheduled pass: for each open routine item older than the stale threshold
   *  and not under a live claim, escalate once with a single email to
   *  admin-alerts. An item whose own claim has gone stale is eligible again, so
   *  a forgotten claim cannot suppress escalation forever. The per-item outbox
   *  idempotency key makes each item escalate exactly once. */
  escalateStaleQueueItems(): { escalated: number } {
    const cutoffDays = readIntConfig('admin_queue_stale_escalation_days', 3);
    const cutoffIso = new Date(Date.now() - cutoffDays * 86_400_000).toISOString();
    const stale = workQueue.listStaleForEscalation.all(cutoffIso, claimStaleCutoffIso()) as StaleRow[];
    const queueUrl = adminQueueUrl();
    let escalated = 0;
    for (const item of stale) {
      if (URGENT_TASK_EMAILS.has(item.task_type)) continue;
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
