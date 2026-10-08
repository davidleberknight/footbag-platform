/**
 * DeceasedMarkingService -- recording that a member has died, and reversing a
 * marking made in error.
 *
 * Owns:
 *   - The `members.is_deceased` write and its timestamp
 *   - The cascade to a linked `historical_persons` row
 *   - Withdrawal from events that have not yet happened
 *   - Withdrawal of the member's open suggested matches, which they can no
 *     longer answer (IdentityAccessService performs it, in this transaction)
 *   - The same flag on an unlinked historical record, set or unset
 *   - Deciding that the member's active recurring donations end at the close of
 *     their current period (PaymentService performs each cancellation, after
 *     the marking commits, attributed to the administrator)
 *   - Raising the needs-organizer work-queue item for each event the member
 *     was the last living organizer of, and closing those items again when the
 *     marking is reversed
 *
 * Does not own:
 *   - Clearing the member's contact data afterwards (MemberService owns the
 *     row-level scrub; OperationsPlatformService decides when it runs)
 *   - Membership tier, honours, media attribution or competition results, none
 *     of which this touches: the marking preserves a member's contributions and
 *     changes only what the platform will do on their behalf from now on
 *   - Page shaping for the surface it is reached from (AdminMemberService)
 *   - Clearing a flag this service cascaded onto a historical record when the
 *     claim that linked that record is later reverted (IdentityAccessService,
 *     inside the revert transaction): the record was never the member's, so the
 *     cascaded flag goes with the link
 *
 * Required patterns:
 *   - Every consumer of the flag already exists and reads it directly, so this
 *     service writes it and propagates nothing beyond the cascade, the
 *     withdrawals, the queued-mail dead-lettering, the needs-organizer items
 *     and the recurring-donation cancellations listed here. The organizer
 *     reads leave a deceased member out on their own; the work-queue item is
 *     the one thing they cannot produce, because it is a record of the moment
 *     the event lost its last organizer.
 *   - The member write, the cascade, the withdrawals and the work-queue items
 *     land in one transaction, so a record can never be half-marked.
 *   - Both writes are guarded on the flag's current value, which makes a repeat
 *     a no-op rather than a second audit row.
 *   - No free text is collected on any of these actions, and none reaches the
 *     audit row. Each has a single motive the action type already states, so a
 *     note would carry no fact the row does not, while a required box invites
 *     an administrator to type a cause of death or the name of whoever
 *     reported it. That is personal data about a named person, and the audit
 *     ledger is append-only and beyond the reach of both erasure paths, so it
 *     would outlive every erasure the platform can perform. The row records
 *     the actor, the subject, the moment, and the structured consequences,
 *     which is the whole of what makes the action reviewable.
 *   - Reversal is bounded by `deceased_cleanup_grace_days`, the same window the
 *     contact scrub waits out, because after the scrub there is nothing left to
 *     restore.
 *
 * Persistence: members, historical_persons, registrations, outbox_emails,
 * work_queue_items, audit_entries; event_organizers is read;
 * recurring_donation_subscriptions is read here and written by PaymentService.
 *
 * Side effects: audit_entries append; work-queue raise on marking and resolve
 * on reversal (`needs_organizer`); mail queued to the member is moved to
 * dead_letter in the marking transaction. No email: the platform sends nothing
 * to a member it has marked deceased, which the outbox enqueue gate enforces
 * for every audience. A reversal does not replay the dead-lettered mail. After
 * the marking commits, each active recurring donation is cancelled at period
 * end at the payment provider; a refusal leaves the marking in place, is logged
 * at error level, and is counted in the result for the administrator. A
 * reversal does not restore a cancelled donation.
 *
 * Service shape: singleton object; it reaches the payment provider only through
 * PaymentService, after its own transaction has committed.
 */
import {
  account, deceasedMarking, eventOrganizers, outbox, recurringDonationSubscriptions,
  transaction, workQueue,
} from '../db/db';
import { logger } from '../config/logger';
import { appendAuditEntry } from './auditService';
import { readIntConfig } from './configReader';
import { paymentService } from './paymentService';
import { ConflictError, NotFoundError } from './serviceErrors';
import { workQueueService } from './workQueueService';

const NEEDS_ORGANIZER_TASK = 'needs_organizer';

const DECEASED_GRACE_DAYS_DEFAULT = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type MarkDeceasedResult = {
  status: 'marked';
  cascadedToHistoricalPerson: boolean;
  registrationsWithdrawn: number;
  recurringDonationsCancelRequested: number;
  recurringDonationCancelFailures: number;
};

export type RevertDeceasedResult =
  | { status: 'reverted'; cascadedToHistoricalPerson: boolean }
  | { status: 'grace_elapsed'; graceDays: number };

export type HistoricalPersonDeceasedResult =
  | { status: 'changed'; personName: string; isDeceased: boolean }
  | { status: 'unchanged'; personName: string; isDeceased: boolean };

interface MemberRow {
  id: string;
  display_name: string;
  is_deceased: number;
  deceased_at: string | null;
  historical_person_id: string | null;
  personal_data_purged_at: string | null;
}

function readMember(memberId: string): MemberRow {
  const row = account.findMemberForAdminRecord.get(memberId) as MemberRow | undefined;
  if (!row) throw new NotFoundError('No member with that id.');
  return row;
}

function graceDays(): number {
  return readIntConfig('deceased_cleanup_grace_days', DECEASED_GRACE_DAYS_DEFAULT);
}

export const deceasedMarkingService = {
  /**
   * Record that a member has died.
   *
   * The linked historical record follows, so the member surfaces and the
   * historical ones cannot disagree about it, and the member is withdrawn from
   * events that have not happened yet, which is the one consumer effect no
   * existing exclusion predicate covers. Each active recurring donation is then
   * cancelled at the end of its current period, so no further charge falls on
   * the member's card and the gift already made is kept. Everything else the
   * member leaves behind stays exactly as it is.
   *
   * The provider call cannot sit inside the marking's transaction, so the
   * marking commits first and each cancellation follows it. A provider refusal
   * leaves the marking in place and is counted in the result for the
   * administrator to finish by hand, rather than undoing a marking that is
   * correct.
   */
  async markDeceased(actorId: string, memberId: string): Promise<MarkDeceasedResult> {
    const row = readMember(memberId);
    if (row.is_deceased === 1) {
      throw new ConflictError('This member is already marked deceased.');
    }
    // An erased account is an anonymized stub. Marking it deceased would assert
    // something about a person the record no longer identifies, and would leave
    // a permanent audit row pointing at them.
    if (row.personal_data_purged_at) {
      throw new ConflictError(
        "This account's personal data has been erased, so it cannot be marked.",
      );
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    const marked = transaction(() => {
      // Read before the flag flips, though the answer is the same after: it asks
      // only about the event's other organizers.
      const orphanedEvents = account.listEventsLosingLastOrganizer.all(memberId) as {
        event_id: string;
        event_title: string;
      }[];

      deceasedMarking.markMember.run(now, now, actorId, memberId);

      // An event whose last living organizer has died has nobody left who can
      // enter its results, which is the same matter as an account deletion
      // leaving it empty, so it reaches the administrator the same way. An event
      // already queued is the same matter twice and gets no second card.
      for (const event of orphanedEvents) {
        if (workQueue.findOpenByEntity.get(NEEDS_ORGANIZER_TASK, 'event', event.event_id)) continue;
        workQueueService.enqueue({
          taskType:      NEEDS_ORGANIZER_TASK,
          queueCategory: 'events',
          entityType:    'event',
          entityId:      event.event_id,
          priority:      0,
          actorId,
          reasonText:    `${event.event_title} has no organizer: the last one was marked deceased.`,
          detailText:    null,
        });
      }

      const cascaded = Boolean(row.historical_person_id);
      if (row.historical_person_id) {
        deceasedMarking.setHistoricalPersonDeceased.run(1, row.historical_person_id);
      }

      const withdrawn = deceasedMarking.cancelUpcomingRegistrations.run(
        'Member deceased', now, now, actorId, memberId, today,
      ).changes;

      // The enqueue gate stops new mail from now on; this stops what was
      // already waiting, which an operator pause could otherwise hold and
      // release to the family at any later moment.
      outbox.deadLetterQueuedForMember.run('recipient_deceased', now, memberId);

      // Read inside the marking so the audit row names exactly the donations
      // the cancellations below set out to end. Each successful cancellation
      // then writes its own row naming this administrator.
      const donations = recurringDonationSubscriptions.listActiveByMember.all(memberId) as {
        id: string;
        stripe_subscription_id: string;
      }[];

      appendAuditEntry({
        actionType:    'member.deceased_marked',
        category:      'member',
        actorType:     'admin',
        actorMemberId: actorId,
        entityType:    'member',
        entityId:      memberId,
        reasonText:    null,
        metadata: {
          cascaded_to_historical_person: cascaded,
          historical_person_id:          row.historical_person_id,
          registrations_withdrawn:       withdrawn,
          recurring_donations_to_cancel: donations.map((d) => d.id),
          events_needing_organizer:      orphanedEvents.length,
        },
      });

      return { cascaded, withdrawn, donations };
    });

    let requested = 0;
    let failures = 0;
    for (const donation of marked.donations) {
      try {
        await paymentService.cancelRecurringDonation(
          memberId,
          donation.stripe_subscription_id,
          { adminMemberId: actorId, reason: 'member_deceased' },
        );
        requested += 1;
      } catch (err) {
        // The card keeps being charged until someone ends the gift at the
        // provider, so this is a failure an operator must act on.
        failures += 1;
        logger.error('recurring donation could not be cancelled after the member was marked deceased', {
          memberId,
          subscriptionId: donation.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {
      status: 'marked' as const,
      cascadedToHistoricalPerson: marked.cascaded,
      registrationsWithdrawn: marked.withdrawn,
      recurringDonationsCancelRequested: requested,
      recurringDonationCancelFailures: failures,
    };
  },

  /**
   * Undo a marking made in error, inside the configured grace period.
   *
   * Past that window the contact scrub has already run and cleared what the
   * account carried, so there is nothing left for a reversal to restore and the
   * story leaves full account deletion as the only remaining path. The
   * withdrawn event registrations are not reinstated: an organizer's roster is
   * theirs, and a member returning to an event registers again.
   */
  revertDeceased(actorId: string, memberId: string): RevertDeceasedResult {
    const row = readMember(memberId);
    if (row.is_deceased !== 1) {
      throw new ConflictError('This member is not marked deceased.');
    }

    const days = graceDays();
    const markedAt = row.deceased_at ? Date.parse(row.deceased_at) : Number.NaN;
    const elapsedDays = Number.isNaN(markedAt)
      ? 0
      : (Date.now() - markedAt) / MS_PER_DAY;
    if (row.personal_data_purged_at || elapsedDays > days) {
      return { status: 'grace_elapsed' as const, graceDays: days };
    }

    const now = new Date().toISOString();
    return transaction(() => {
      deceasedMarking.revertMember.run(now, actorId, memberId);

      // The member is a living organizer again, so every event they organize
      // has someone running it, and a request the marking raised for one of
      // them is no longer true.
      const eventIds = eventOrganizers.listEventIdsForMember.all(memberId) as { event_id: string }[];
      for (const { event_id } of eventIds) {
        workQueue.resolveOpenByEntity.run(
          now, actorId, 'deceased_marking_reverted',
          'The organizer\'s deceased marking was reversed.',
          now, actorId,
          NEEDS_ORGANIZER_TASK, 'event', event_id,
        );
      }

      const cascaded = Boolean(row.historical_person_id);
      if (row.historical_person_id) {
        deceasedMarking.setHistoricalPersonDeceased.run(0, row.historical_person_id);
      }

      appendAuditEntry({
        actionType:    'member.deceased_reverted',
        category:      'member',
        actorType:     'admin',
        actorMemberId: actorId,
        entityType:    'member',
        entityId:      memberId,
        reasonText:    null,
        metadata: {
          cascaded_to_historical_person: cascaded,
          historical_person_id:          row.historical_person_id,
          marked_at:                     row.deceased_at,
        },
      });

      return { status: 'reverted' as const, cascadedToHistoricalPerson: cascaded };
    });
  },

  /**
   * The same flag on a historical record nobody has claimed.
   *
   * It is consumed only to suppress the direct claim affordance on that record,
   * so setting it says "this person is recognized as deceased" and nothing
   * more. It is reversible for the same reason the member marking is: it can be
   * set on the wrong person.
   */
  setHistoricalPersonDeceased(
    actorId: string,
    personId: string,
    isDeceased: boolean,
  ): HistoricalPersonDeceasedResult {
    const person = deceasedMarking.findHistoricalPerson.get(personId) as
      | {
          person_id: string;
          person_name: string;
          is_deceased: number;
          claimed_by_member_id: string | null;
          claimed_by_display_name: string | null;
        }
      | undefined;
    if (!person) throw new NotFoundError('No historical record with that id.');
    // Somebody holds this record, so the flag belongs to their member record
    // and is set there. Enforced here rather than only by hiding the control,
    // because hiding a control is not a rule: a request that arrives anyway
    // would leave the record marked and the living member's own row clear,
    // which is the disagreement having one home is meant to prevent.
    if (person.claimed_by_member_id) {
      throw new ConflictError(
        `${person.claimed_by_display_name ?? 'A member'} holds this record, so this is recorded `
        + 'on their member record rather than here.',
      );
    }

    const target = isDeceased ? 1 : 0;
    if (person.is_deceased === target) {
      return {
        status: 'unchanged' as const,
        personName: person.person_name,
        isDeceased,
      };
    }

    return transaction(() => {
      deceasedMarking.setHistoricalPersonDeceased.run(target, personId);
      appendAuditEntry({
        actionType:    isDeceased ? 'member.deceased_marked' : 'member.deceased_reverted',
        category:      'member',
        actorType:     'admin',
        actorMemberId: actorId,
        entityType:    'historical_person',
        entityId:      personId,
        reasonText:    null,
        metadata:      { unlinked_historical_record: true },
      });
      return {
        status: 'changed' as const,
        personName: person.person_name,
        isDeceased,
      };
    });
  },
};
