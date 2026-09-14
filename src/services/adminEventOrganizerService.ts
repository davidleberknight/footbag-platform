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
 *   - Raising the queue item when a member's own account deletion orphans an
 *     event: AccountDeletionService does that, because it is the act that causes
 *     it. This service is the other end, closing the item when the event has
 *     someone again.
 *
 * Required patterns:
 *   - An organizer row outlives the member's account, matching club leadership,
 *     so "has an organizer" is decided by joining members and filtering the
 *     deleted rather than by the row existing.
 *   - Both writes take a mandatory reason, as the sibling club-leadership
 *     surface does: an administrator changing who runs somebody else's event is
 *     reviewable only from a trail that says why.
 *   - Assignment and removal each keep the work-queue item honest in the same
 *     transaction as the change, so the queue can never disagree with the event.
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
import { appendAuditEntry } from './auditService';
import { workQueueService } from './workQueueService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';

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
  role: string;
  added_at: string;
  display_name: string;
  slug: string | null;
}

export interface EventOrganizerRowView {
  memberId: string;
  displayName: string;
  roleLabel: string;
  isPrimaryOrganizer: boolean;
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
  errorMessage: string | null;
}

function requireReason(reason: string): string {
  const trimmed = reason.trim();
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
    memberId:           r.member_id,
    displayName:        r.display_name,
    roleLabel:          r.role === 'organizer' ? 'Organizer' : 'Co-organizer',
    isPrimaryOrganizer: r.role === 'organizer',
    addedAt:            r.added_at,
    profileHref:        r.slug ? `/members/${r.slug}` : null,
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
    opts: { errorMessage?: string } = {},
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
        errorMessage:  opts.errorMessage ?? null,
      },
    };
  },

  /**
   * Give an event an organizer. The first live organizer also closes the
   * work-queue item that said it had none, in the same transaction, so the queue
   * cannot go on asking for something that has been done.
   */
  assignOrganizer(adminMemberId: string, eventId: string, memberKey: string, reason: string): void {
    const trimmedReason = requireReason(reason);
    const event = loadEvent(eventId);
    const key = memberKey.trim();
    const member = clubLeaders.findMemberByKeyForAdmin.get(key, key) as
      | { id: string; display_name: string; slug: string }
      | undefined;
    if (!member) throw new NotFoundError('No active member with that id or slug.');

    if (eventOrganizers.findRow.get(eventId, member.id)) {
      throw new ValidationError('That member already organizes this event.');
    }

    // One member holds the primary role per event, enforced by a unique index;
    // whoever is assigned to an event that currently has nobody becomes it, and
    // anyone joining an event that already has one co-organizes.
    const liveCount = (eventOrganizers.countLiveForEvent.get(eventId) as { c: number }).c;
    const role = liveCount === 0 ? 'organizer' : 'co-organizer';
    const now = new Date().toISOString();

    transaction(() => {
      eventOrganizers.insertRow.run(
        `eorg_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
        now, adminMemberId, now, adminMemberId,
        eventId, member.id, role, now,
      );
      if (liveCount === 0) {
        workQueue.resolveOpenByEntity.run(
          now, adminMemberId, 'assigned', `Organizer assigned: ${member.display_name}.`,
          now, adminMemberId,
          NEEDS_ORGANIZER_TASK, 'event', eventId,
        );
      }
      appendAuditEntry({
        actionType:    'event.organizer_assigned',
        category:      'event',
        actorType:     'admin',
        actorMemberId: adminMemberId,
        entityType:    'event',
        entityId:      eventId,
        reasonText:    trimmedReason,
        metadata:      { organizer_member_id: member.id, role, event_title: event.title },
      });
    });
  },

  /**
   * Take an organizer off an event. If that was the last one, the event is
   * queued for an administrator in the same transaction, because an event
   * silently left with nobody is the state this whole surface exists to prevent.
   */
  removeOrganizer(adminMemberId: string, eventId: string, memberId: string, reason: string): void {
    const trimmedReason = requireReason(reason);
    const event = loadEvent(eventId);
    const existing = eventOrganizers.findRow.get(eventId, memberId) as { id: string; role: string } | undefined;
    if (!existing) throw new NotFoundError('That member does not organize this event.');

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
        category:      'event',
        actorType:     'admin',
        actorMemberId: adminMemberId,
        entityType:    'event',
        entityId:      eventId,
        reasonText:    trimmedReason,
        metadata:      { organizer_member_id: memberId, role: existing.role, event_title: event.title },
      });
    });
  },
};
