/**
 * How the site lists an event. Every page that lists events, upcoming or
 * completed, shapes each one as the same dated item, so an event carries the
 * same fields on the events landing page, a year page and a member's own
 * profile; an upcoming event is drawn as a card, a completed one as an archive
 * row.
 *
 * Also the registration cutoff and the registration status every event surface
 * shows. An event whose status is still `reg_open` but whose cutoff has passed,
 * or whose organizer has paused registration, refuses a registration, so its
 * badge says registration is closed rather than promising what the form will
 * refuse.
 *
 * Pure shaping over flat rows, with no database access, so the member service
 * and the event service both use it without importing each other.
 */
import { formatDateRange } from '../lib/handlebarsHelpers';
import { personLocation } from './countryUtils';
import type { DatedItemMeta, DatedItemView } from '../types/datedItem';

export const EVENT_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  reg_open: 'Registration open',
  closed: 'Registration closed',
  completed: 'Completed',
  canceled: 'Canceled',
};

const EVENT_STATUS_BADGE_CLASSES: Record<string, string> = {
  reg_open: 'badge-reg_open',
  closed: 'badge-closed',
  completed: 'badge-completed',
};

/** The last day online registration is accepted: the deadline, else the start date. */
export function registrationCutoff(event: { registration_deadline: string | null; start_date: string }): string {
  return event.registration_deadline ?? event.start_date;
}

export function isRegistrationOpen(
  event: { status: string; registration_status: string; registration_deadline: string | null; start_date: string },
  todayIso: string,
): boolean {
  return event.status === 'reg_open'
    && event.registration_status === 'open'
    && todayIso.slice(0, 10) <= registrationCutoff(event);
}

export interface EventStatusRow {
  status: string;
  registration_status: string;
  registration_deadline: string | null;
  start_date: string;
}

/**
 * The status badge for an event. An open event past its cutoff or paused reads
 * as closed, the same as an event an organizer or the deadline job closed.
 */
export function eventStatusBadge(row: EventStatusRow, todayIso: string): { text: string; cssClass: string } {
  const status = row.status === 'reg_open' && !isRegistrationOpen(row, todayIso) ? 'closed' : row.status;
  return {
    text: EVENT_STATUS_LABELS[status] ?? status,
    cssClass: EVENT_STATUS_BADGE_CLASSES[status] ?? 'badge-muted',
  };
}

/** A date or a two-date range in the shortest unambiguous form. */
export function eventDateRange(startDate: string, endDate: string): string {
  return formatDateRange(startDate === endDate ? startDate : `${startDate}/${endDate}`);
}

export interface EventListingRow extends EventStatusRow {
  title: string;
  description: string | null;
  end_date: string;
  city: string | null;
  region: string | null;
  country: string | null;
  host_club: string | null;
  tag_normalized: string;
  tag_display: string | null;
}

export interface EventListingOptions {
  todayIso: string;
  /**
   * The event's media gallery, set only when media carries its hashtag: the
   * hashtag token then links to it, and a Gallery meta link agrees with it.
   */
  galleryHref?: string | null;
  /** The thumbnail of the event's honoured cover photo, when it has one. */
  thumbUrl?: string | null;
}

/**
 * One event as a dated item. An upcoming event carries its registration status
 * as the label; a completed event carries none, since its page says whether
 * results exist. Every event shows its hashtag as the shared token.
 */
export function toEventDatedItem(row: EventListingRow, opts: EventListingOptions): DatedItemView {
  const eventKey = row.tag_normalized.startsWith('#') ? row.tag_normalized.slice(1) : row.tag_normalized;
  const isCompleted = row.status === 'completed';
  const meta: DatedItemMeta[] = [];
  const location = personLocation(row.city, row.region, row.country);
  if (location) meta.push({ text: location.text });
  if (row.host_club) meta.push({ text: row.host_club });
  if (row.tag_display) {
    meta.push(opts.galleryHref
      ? { text: row.tag_display, href: opts.galleryHref, isHashtag: true }
      : { text: row.tag_display, isHashtag: true });
  }
  if (opts.galleryHref) meta.push({ text: 'Gallery', href: opts.galleryHref });
  return {
    date: eventDateRange(row.start_date, row.end_date),
    title: row.title,
    href: `/events/${eventKey}`,
    label: isCompleted ? null : eventStatusBadge(row, opts.todayIso),
    meta,
    excerpt: row.description && row.description.trim() !== '' ? row.description : null,
    image: opts.thumbUrl ? { thumbUrl: opts.thumbUrl } : null,
  };
}
