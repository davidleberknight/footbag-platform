/**
 * WorkQueueService -- the single path that adds an admin work-queue item.
 *
 * Owns: creating `work_queue_items` rows. Every insert goes through `enqueue`,
 * which writes the row AND fans out the `admin_queue_alert` email to the
 * admin-alerts mailing list in the same step, so a work item can never be
 * created without its admin notification (USER_STORIES global rule: when any
 * task is added to the admin work queue, the admins are notified, with task
 * type and entity id only). Direct `workQueue.insertItem` calls outside this
 * service are forbidden by the convention gate.
 *
 * Transaction discipline: `enqueue` performs only synchronous DB writes (the row
 * insert and the outbox enqueue) and never opens its own transaction. Call it
 * inside the caller's `transaction(...)` so the row, the caller's audit rows,
 * and the alert commit or roll back together.
 *
 * Persistence: writes `work_queue_items`; enqueues to `outbox_emails` via
 * emailService.
 *
 * Side effects: work-queue insert; admin-alerts outbox enqueue.
 *
 * Service shape: singleton object.
 */
import { randomUUID } from 'crypto';
import { workQueue } from '../db/db';
import { emailService } from './emailService';

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

export const workQueueService = {
  /** Insert one work-queue item and fan out its admin-alerts notification.
   *  Returns the generated work-item id for the caller's audit row / return. */
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
    emailService.sendToAdmins({
      template: 'admin_queue_alert',
      params: { taskType: input.taskType, entityId: input.entityId },
      idempotencyKeyPrefix: `admin-alerts:${input.taskType}:${id}`,
    });
    return { id };
  },
};
