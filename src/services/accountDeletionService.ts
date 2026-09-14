/**
 * AccountDeletionService -- the member-facing entry point that puts an account
 * into the grace-period deleted state.
 *
 * Owns:
 *   - The deletion request itself: the administrator refusal, the recurring-gift
 *     decision, the hard deletion of the member's media and galleries, the
 *     withdrawal from upcoming events, the stopping of queued mail, the
 *     work-queue item for an event left with no organizer, the soft-delete write
 *     and its audit row, and the one message that tells the member the restore
 *     window exists.
 *
 * Does not own:
 *   - Row-level PII clearing after the grace period (MemberService owns
 *     `purgeAccountPII`; this service never erases, it only marks).
 *   - Purge eligibility (OperationsPlatformService decides who has aged out).
 *   - The confirmation and result pages (MemberService shapes every
 *     `/members/*` page).
 *   - Restoring an account inside the window (IdentityAccessService, which owns
 *     the credential path the restore branch hangs off).
 *
 * Required patterns:
 *   - Storage is removed before the row that points at it, item by item, and the
 *     whole request stops at the first refusal. The account survives a storage
 *     failure and whatever survives with it still resolves to real objects.
 *   - The irreversible provider call happens before anything else, because it is
 *     the only step that cannot be reconsidered.
 *   - The account-level writes are one transaction, so an account is never half
 *     deleted.
 *
 * Persistence:
 *   members (soft-delete columns), media_items, media_tags, member_galleries,
 *   registrations, outbox_emails, work_queue_items, audit_entries.
 *
 * Side effects:
 *   - audit_entries append (`auth.account_deleted`)
 *   - outbox enqueue (the deletion confirmation)
 *   - work-queue insert (an event left without an organizer)
 *   - object-storage deletes (the member's media)
 *
 * Service shape: factory function, because the media deletion needs the storage
 * adapter and its failure path is the contract. `getDefaultAccountDeletionService()`
 * is the accessor controllers use.
 */
import {
  account,
  deceasedMarking,
  media,
  mediaTags,
  outbox,
  recurringDonationSubscriptions,
  tagStats,
  workQueue,
  transaction,
} from '../db/db';
import { logger } from '../config/logger';
import { readIntConfig } from './configReader';
import { appendAuditEntry } from './auditService';
import { emailService } from './emailService';
import { paymentService } from './paymentService';
import { workQueueService } from './workQueueService';
import { hashtagDiscoveryService } from './hashtagDiscoveryService';
import { getMediaStorageAdapter, MediaStorageAdapter } from '../adapters/mediaStorageAdapter';

/** What the member chose to do with a recurring gift they are still giving. */
export type RecurringDonationChoice = 'keep' | 'cancel';

export type RequestAccountDeletionResult =
  | {
      status: 'deleted';
      graceDays: number;
      graceExpiresAt: string;
      mediaDeleted: number;
      galleriesDeleted: number;
      registrationsWithdrawn: number;
      eventsNeedingOrganizer: number;
      recurringDonationCanceled: boolean;
    }
  | { status: 'already_deleted' }
  | { status: 'administrator' }
  | {
      /** Every object removed before the failure took its row with it, so what
       *  survives still resolves. The account is untouched and may try again. */
      status: 'storage_failed';
      mediaDeleted: number;
      recurringDonationCanceled: boolean;
    }
  | { status: 'not_found' };

interface DeletionMediaRow {
  id: string;
  s3_key_thumb: string | null;
  s3_key_display: string | null;
}

interface DeletionMemberRow {
  id: string;
  display_name: string;
  login_email: string | null;
  is_admin: number;
  is_system: number;
  is_hof: number;
  is_bap: number;
  deleted_at: string | null;
}

interface OrphanedEventRow {
  event_id: string;
  event_title: string;
}

export interface AccountDeletionServiceDeps {
  storage: MediaStorageAdapter;
}

export function createAccountDeletionService(deps: AccountDeletionServiceDeps) {
  const { storage } = deps;

  return {
    /**
     * A member deleting their own account.
     *
     * The order below is the whole of the design and none of it is arbitrary.
     *
     * The provider call goes first because it is the one step nothing can undo
     * or compensate: if the gift is cancelled and the rest then fails, the
     * member keeps an account and is told plainly that the gift ended, which
     * they can start again. The reverse order risks a deleted account still
     * being charged.
     *
     * Media goes next, one item at a time, each item's objects removed from
     * storage before its own row is deleted. The whole request stops at the
     * first storage refusal. Removing every object first and only then touching
     * the database would, on a failure part-way through, leave a living account
     * holding rows that point at bytes that are gone, which is a broken gallery
     * the member cannot repair. Item at a time means whatever survives a failure
     * still resolves, and a second attempt simply carries on.
     *
     * The account-level writes are last and are one transaction, so an account
     * is never half-left: either the row is marked deleted with its queued mail
     * stopped, its registrations withdrawn and its orphaned events raised, or
     * none of it happened.
     *
     * Tag statistics are decremented after the commit, the way every other media
     * delete does it, because the counts are a derived cache rather than part of
     * the account's own state.
     */
    async requestAccountDeletion(input: {
      memberId: string;
      recurringDonationChoice: RecurringDonationChoice;
    }): Promise<RequestAccountDeletionResult> {
      const row = account.readForDeletionRequest.get(input.memberId) as DeletionMemberRow | undefined;
      if (!row) return { status: 'not_found' };
      if (row.deleted_at !== null) return { status: 'already_deleted' };
      // An administrator cannot drop their own role, so an administrator who
      // deleted their account would leave the role attached to a row no screen
      // offers any more. They hand the role to someone else first.
      if (row.is_admin === 1) return { status: 'administrator' };

      const graceDays = readIntConfig('member_cleanup_grace_days', 90);

      let recurringDonationCanceled = false;
      if (input.recurringDonationChoice === 'cancel') {
        const subs = recurringDonationSubscriptions.listActiveByMember.all(input.memberId) as {
          stripe_subscription_id: string;
        }[];
        for (const sub of subs) {
          await paymentService.cancelRecurringDonation(input.memberId, sub.stripe_subscription_id);
          recurringDonationCanceled = true;
        }
      }

      const mediaRows = account.listOwnedMediaForDeletion.all(input.memberId) as DeletionMediaRow[];
      const deletedTagIds: string[] = [];
      let mediaDeleted = 0;
      for (const item of mediaRows) {
        const keys = [item.s3_key_thumb, item.s3_key_display].filter((k): k is string => Boolean(k));
        try {
          for (const key of keys) {
            await storage.delete(key);
          }
        } catch (err) {
          logger.warn('accountDeletionService: storage delete failed, account left intact', {
            memberId: input.memberId,
            mediaId:  item.id,
            error:    (err as Error).message,
          });
          return { status: 'storage_failed', mediaDeleted, recurringDonationCanceled };
        }
        const tagIds = (tagStats.listTagIdsByMediaId.all(item.id) as { tag_id: string }[])
          .map((t) => t.tag_id);
        transaction(() => {
          mediaTags.deleteMediaTagsByMediaId.run(item.id);
          media.deleteMediaItem.run(item.id);
        });
        deletedTagIds.push(...tagIds);
        mediaDeleted += 1;
      }

      const galleryIds = (account.listOwnedGalleryIdsForDeletion.all(input.memberId) as { id: string }[])
        .map((g) => g.id);
      const orphanedEvents = account.listEventsLosingLastOrganizer.all(input.memberId) as OrphanedEventRow[];

      const now = new Date();
      const nowIso = now.toISOString();
      const graceExpiresAt = new Date(now.getTime() + graceDays * 86_400_000).toISOString();

      const committed = transaction(() => {
        const res = account.softDeleteMember.run(
          nowIso, input.memberId, nowIso, graceExpiresAt, nowIso, input.memberId,
        );
        if (res.changes === 0) return null;

        for (const galleryId of galleryIds) {
          media.deleteMemberGalleryById.run(galleryId);
        }
        const withdrawn = deceasedMarking.cancelUpcomingRegistrations.run(
          'Account deleted', nowIso, nowIso, input.memberId, input.memberId, nowIso.slice(0, 10),
        );
        outbox.deadLetterQueuedForMember.run(nowIso, input.memberId);
        // Enqueued after the dead-letter sweep above, or it would be caught by
        // it, and addressed by the literal address read before the soft delete,
        // because the member-resolving send path reads the active view and would
        // find nothing here. This is the deliberate exception to the rule that a
        // soft-deleted member is enqueued nothing: it is the message telling
        // them the restore window exists, and it is the last one they get.
        if (row.login_email) {
          emailService.send({
            template: 'account_deletion_requested',
            params:   { memberName: row.display_name, graceDays },
            recipientEmail:    row.login_email,
            recipientMemberId: input.memberId,
            idempotencyKey:    `account-deletion:${input.memberId}:${nowIso}`,
          });
        }
        for (const event of orphanedEvents) {
          // An event can already be queued if a previous organizer left it
          // without one; a second card for the same event is the same matter
          // twice.
          if (workQueue.findOpenByEntity.get('needs_organizer', 'event', event.event_id)) continue;
          workQueueService.enqueue({
            taskType:      'needs_organizer',
            queueCategory: 'events',
            entityType:    'event',
            entityId:      event.event_id,
            priority:      0,
            actorId:       'system',
            reasonText:    `${event.event_title} has no organizer: the last one deleted their account.`,
            detailText:    null,
          });
        }
        appendAuditEntry({
          actionType:    'auth.account_deleted',
          category:      'member',
          actorType:     'member',
          actorMemberId: input.memberId,
          entityType:    'member',
          entityId:      input.memberId,
          reasonText:    null,
          metadata: {
            grace_days:                  graceDays,
            media_deleted:               mediaDeleted,
            galleries_deleted:           galleryIds.length,
            registrations_withdrawn:     withdrawn.changes,
            events_needing_organizer:    orphanedEvents.length,
            recurring_donation_canceled: recurringDonationCanceled,
            honors_preserved:            row.is_hof === 1 || row.is_bap === 1,
          },
        });
        return { registrationsWithdrawn: withdrawn.changes };
      });

      if (committed === null) return { status: 'already_deleted' };

      hashtagDiscoveryService.decrementTagStats(deletedTagIds);

      return {
        status:                 'deleted',
        graceDays,
        graceExpiresAt,
        mediaDeleted,
        galleriesDeleted:       galleryIds.length,
        registrationsWithdrawn: committed.registrationsWithdrawn,
        eventsNeedingOrganizer: orphanedEvents.length,
        recurringDonationCanceled,
      };
    },
  };
}

// Default instance for controllers. Tests that need a storage adapter which
// refuses a delete build the service through `createAccountDeletionService(deps)`.
export function getDefaultAccountDeletionService(): ReturnType<typeof createAccountDeletionService> {
  return createAccountDeletionService({ storage: getMediaStorageAdapter() });
}
