/**
 * AdminEventOrganizerService -- an administrator deciding who runs an event.
 *
 * Owns:
 *   - The list of events with nobody running them, and the per-event screen that
 *     assigns or removes an organizer.
 *   - The audit rows for both writes, and closing or raising the work-queue item
 *     that tells an administrator the event needs attention.
 *
 * Does not own:
 *   - Creating or editing the event itself.
 *   - Raising the queue item when a member's account deletion or deceased
 *     marking orphans an event: AccountDeletionService and
 *     DeceasedMarkingService do that, because each is the act that causes it.
 *     This service is the other end, closing the item when the event has
 *     someone again.
 *
 * Required patterns:
 *   - Organizers are a flat set of equals with no primary, matching club
 *     leadership, so every assignment writes the same role and nothing an
 *     earlier organizer's row holds can block a new one.
 *   - An organizer row outlives the member, matching club leadership, so "has
 *     an organizer" is decided by the current-organizer view, which leaves out
 *     deleted and deceased members, rather than by the row existing.
 *   - Both writes take a mandatory reason, as the sibling club-leadership
 *     surface does: an administrator changing who runs somebody else's event is
 *     reviewable only from a trail that says why.
 *   - The reason is cleaned with the shared text sanitizer before it is
 *     validated, so the length checks measure what is stored.
 *   - Assignment and removal each keep the work-queue item honest in the same
 *     transaction as the change, so the queue can never disagree with the event.
 *   - Assigning someone who already organizes the event, or removing someone
 *     who no longer does, is a repeat and writes nothing: this admin's own
 *     standing act ends as the first submit did, and a state someone else left
 *     ends informational. Both writes return their ending and its sentence.
 *
 * Persistence: event_organizers, work_queue_items, audit_entries.
 *
 * Side effects:
 *   - audit_entries append (`event.organizer_assigned`, `event.organizer_removed`)
 *   - work-queue resolve, and raise when a removal leaves an event with nobody
 *
 * Service shape: singleton object literal; it reaches no adapter.
 */
import { randomUUID } from 'crypto';
import { eventOrganizers, clubLeaders, workQueue, transaction } from '../db/db';
import { appendAuditEntry, findStandingOwnAct } from './auditService';
import { workQueueService } from './workQueueService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';
import { cleanUserText } from '../lib/textSanitizer';
import type { OutcomeNoticeView } from '../lib/outcomeNotice';
import type { ActionEnding } from '../lib/actionOutcome';

const NEEDS_ORGANIZER_TASK = 'needs_organizer';
const REASON_MIN = 3;
const REASON_MAX = 500;

interface EventRow {
  id: string;
  title: string;
  start_date: string;
  status: string;
}

interface OrganizerRow {
  member_id: string;
  added_at: string;
  display_name: string;
  slug: string | null;
}

export interface EventOrganizerRowView {
  memberId: string;
  displayName: string;
  addedAt: string;
  profileHref: string | null;
}

export interface AdminEventOrganizerQueueContent {
  events: Array<{ eventId: string; title: string; startDate: string; manageHref: string }>;
  hasEvents: boolean;
  emptyMessage: string;
}

export interface AdminEventOrganizerDetailContent {
  eventId: string;
  eventTitle: string;
  startDate: string;
  organizers: EventOrganizerRowView[];
  hasOrganizers: boolean;
  needsOrganizer: boolean;
  assignHref: string;
  removeHref: string;
  queueHref: string;
  /** The result of the last assign or remove, carried across its redirect. */
  notice: OutcomeNoticeView | null;
  errorMessage: string | null;
}

/** How an assign or a remove ended, and the sentence that reports it. */
export interface OrganizerChangeOutcome {
  ending: Exclude<ActionEnding, 'refused'>;
  text: string;
}

const ASSIGNED_NOTICE = 'Organizer added.';
const ALREADY_ORGANIZES_NOTICE = 'That member already organizes this event.';
const REMOVED_NOTICE = 'Organizer removed.';
const NOT_ORGANIZER_NOTICE = 'That member does not organize this event.';

/** This admin's own standing act on this organizer of this event, if any. */
function ownStandingAct(
  adminMemberId: string, eventId: string, memberId: string,
  act: 'event.organizer_assigned' | 'event.organizer_removed',
): boolean {
  const reversal = act === 'event.organizer_assigned' ? 'event.organizer_removed' : 'event.organizer_assigned';
  return findStandingOwnAct(
    adminMemberId, act, reversal, 'event', eventId,
    { metadataKey: 'organizer_member_id', id: memberId },
  ) !== null;
}

function requireReason(reason: string): string {
  // Cleaned before the checks, so a reason that is only markup is too short and
  // the limit measures what the audit row will hold.
  const trimmed = cleanUserText(reason, 'single_line', 'reason');
  if (trimmed.length < REASON_MIN) {
    throw new ValidationError('Give a reason for this change; it is kept on the record.');
  }
  if (trimmed.length > REASON_MAX) {
    throw new ValidationError(`Keep the reason under ${REASON_MAX} characters.`);
  }
  return trimmed;
}

function loadEvent(eventId: string): EventRow {
  const row = eventOrganizers.findEvent.get(eventId) as EventRow | undefined;
  if (!row) throw new NotFoundError(`event ${eventId} not found`);
  return row;
}

function shapeOrganizers(eventId: string): EventOrganizerRowView[] {
  return (eventOrganizers.listForEvent.all(eventId) as OrganizerRow[]).map((r) => ({
    memberId:    r.member_id,
    displayName: r.display_name,
    addedAt:     r.added_at,
    profileHref: r.slug ? `/members/${r.slug}` : null,
  }));
}

export const adminEventOrganizerService = {
  getOrganizerQueuePage(): PageViewModel<AdminEventOrganizerQueueContent> {
    const rows = eventOrganizers.listEventsNeedingOrganizer.all() as EventRow[];
    return {
      seo:  { title: 'Events Needing an Organizer', noindex: true },
      page: {
        sectionKey: 'admin',
        pageKey:    'admin_event_organizers',
        title:      'Events Needing an Organizer',
      },
      content: {
        events: rows.map((e) => ({
          eventId:     e.id,
          title:       e.title,
          startDate:   e.start_date,
          manageHref:  `/admin/events/${e.id}/organizers`,
        })),
        hasEvents:    rows.length > 0,
        emptyMessage: 'Every event has someone running it.',
      },
    };
  },

  getEventOrganizersPage(
    eventId: string,
    opts: { notice?: OutcomeNoticeView | null; errorMessage?: string } = {},
  ): PageViewModel<AdminEventOrganizerDetailContent> {
    const event = loadEvent(eventId);
    const organizers = shapeOrganizers(eventId);
    return {
      seo:  { title: 'Event Organizers', noindex: true },
      page: {
        sectionKey: 'admin',
        pageKey:    'admin_event_organizer_detail',
        title:      'Event Organizers',
        eyebrow:    event.title,
      },
      navigation: {
        contextLinks: [{ label: 'Back to Events Needing an Organizer', href: '/admin/events/organizers' }],
      },
      content: {
        eventId:       event.id,
        eventTitle:    event.title,
        startDate:     event.start_date,
        organizers,
        hasOrganizers: organizers.length > 0,
        needsOrganizer: organizers.length === 0,
        assignHref:    `/admin/events/${event.id}/organizers/assign`,
        removeHref:    `/admin/events/${event.id}/organizers/remove`,
        queueHref:     '/admin/events/organizers',
        notice:        opts.notice ?? null,
        errorMessage:  opts.errorMessage ?? null,
      },
    };
  },

  /**
   * Give an event an organizer. Any open work-queue item saying it had none is
   * closed in the same transaction, so the queue cannot go on asking for
   * something that has been done.
   *
   * A member who already organizes the event is a repeat and writes nothing:
   * this admin's own standing assignment reports the first submit's success,
   * and one someone else made reports that nothing changed.
   */
  assignOrganizer(adminMemberId: string, eventId: string, memberKey: string, reason: string): OrganizerChangeOutcome {
    const trimmedReason = requireReason(reason);
    const event = loadEvent(eventId);
    const key = memberKey.trim();
    const member = clubLeaders.findMemberByKeyForAdmin.get(key, key) as
      | { id: string; display_name: string; slug: string }
      | undefined;
    if (!member) throw new NotFoundError('No active member with that id or slug.');

    if (eventOrganizers.findRow.get(eventId, member.id)) {
      return ownStandingAct(adminMemberId, eventId, member.id, 'event.organizer_assigned')
        ? { ending: 'own_repeat', text: ASSIGNED_NOTICE }
        : { ending: 'already_held', text: ALREADY_ORGANIZES_NOTICE };
    }

    const now = new Date().toISOString();

    transaction(() => {
      eventOrganizers.insertRow.run(
        `eorg_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
        now, adminMemberId, now, adminMemberId,
        eventId, member.id, 'organizer', now,
      );
      workQueue.resolveOpenByEntity.run(
        now, adminMemberId, 'assigned', `Organizer assigned: ${member.display_name}.`,
        now, adminMemberId,
        NEEDS_ORGANIZER_TASK, 'event', eventId,
      );
      appendAuditEntry({
        actionType:    'event.organizer_assigned',
        actorType:     'admin',
        actorMemberId: adminMemberId,
        entityType:    'event',
        entityId:      eventId,
        reasonText:    trimmedReason,
        metadata:      { organizer_member_id: member.id, event_title: event.title },
      });
    });
    return { ending: 'advance', text: ASSIGNED_NOTICE };
  },

  /**
   * Take an organizer off an event. If that was the last one, the event is
   * queued for an administrator in the same transaction, because an event
   * silently left with nobody is the state this whole surface exists to prevent.
   *
   * A member who no longer organizes the event is a repeat and writes nothing,
   * reported the same way as a repeated assignment.
   */
  removeOrganizer(adminMemberId: string, eventId: string, memberId: string, reason: string): OrganizerChangeOutcome {
    const trimmedReason = requireReason(reason);
    const event = loadEvent(eventId);
    const existing = eventOrganizers.findRow.get(eventId, memberId) as { id: string } | undefined;
    if (!existing) {
      return ownStandingAct(adminMemberId, eventId, memberId, 'event.organizer_removed')
        ? { ending: 'own_repeat', text: REMOVED_NOTICE }
        : { ending: 'already_held', text: NOT_ORGANIZER_NOTICE };
    }

    transaction(() => {
      eventOrganizers.deleteRow.run(eventId, memberId);
      const remaining = (eventOrganizers.countLiveForEvent.get(eventId) as { c: number }).c;
      if (remaining === 0 && !workQueue.findOpenByEntity.get(NEEDS_ORGANIZER_TASK, 'event', eventId)) {
        workQueueService.enqueue({
          taskType:      NEEDS_ORGANIZER_TASK,
          queueCategory: 'events',
          entityType:    'event',
          entityId:      eventId,
          priority:      0,
          actorId:       adminMemberId,
          reasonText:    `${event.title} has no organizer.`,
          detailText:    null,
        });
      }
      appendAuditEntry({
        actionType:    'event.organizer_removed',
        actorType:     'admin',
        actorMemberId: adminMemberId,
        entityType:    'event',
        entityId:      eventId,
        reasonText:    trimmedReason,
        metadata:      { organizer_member_id: memberId, event_title: event.title },
      });
    });
    return { ending: 'advance', text: REMOVED_NOTICE };
  },
};
