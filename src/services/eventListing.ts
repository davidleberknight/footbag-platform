/**
 * How the site lists an event. Every page that lists events, upcoming or
 * completed, shapes each one as the same dated item, so an event carries the
 * same fields on the events landing page, a year page and a member's own
 * profile; an upcoming event is drawn as a card, a completed one as an archive
 * row.
 *
 * Also the registration cutoff and the registration status every event surface
 * shows. An event whose status is still `reg_open` but whose cutoff has passed,
 * whose organizer has paused registration, or which offers no registration type
 * a member could take, refuses a registration, so its badge says registration
 * is closed rather than promising what the form will refuse.
 *
 * Also the year navigation between archive years, which the news year pages
 * share with the event year pages.
 *
 * Pure shaping over flat rows, with no database access, so the member, event
 * and news services all use it without importing each other.
 */
import { formatDateRange } from '../lib/handlebarsHelpers';
import { personLocation } from './countryUtils';
import type { DatedItemMeta, DatedItemView } from '../types/datedItem';
import type { RegistrationType } from './eventRegistrationSettlement';

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

/**
 * Resolve sibling-archive-year navigation for a given year.
 *
 * `previousYear` is the year immediately older than `year`; `nextYear` is
 * the year immediately newer. The helper sorts its input DESC internally
 * so the result is independent of the caller's ordering.
 */
export function getAdjacentArchiveYears(
  archiveYears: number[],
  year: number,
): { previousYear: number | null; nextYear: number | null } {
  const sorted = [...archiveYears].sort((a, b) => b - a);
  const index = sorted.indexOf(year);

  if (index === -1) {
    return {
      previousYear: null,
      nextYear: null,
    };
  }

  return {
    previousYear: index < sorted.length - 1 ? sorted[index + 1] : null,
    nextYear: index > 0 ? sorted[index - 1] : null,
  };
}

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

/**
 * The registration types a member can choose: competitor always, and attendee
 * or supporter when the organizers accept it. A type carrying a fee is offered
 * only once the event's sanction approval has enabled payment, so no fee is
 * ever taken for an event IFPA has not sanctioned.
 */
export function offeredRegistrationTypes(event: {
  is_attendee_registration_open: number; competitor_fee_cents: number | null; attendee_fee_cents: number | null;
  payment_enabled: number;
}): RegistrationType[] {
  const payable = (fee: number | null): boolean => fee === null || event.payment_enabled === 1;
  const types: RegistrationType[] = [];
  if (payable(event.competitor_fee_cents)) types.push('competitor');
  if (event.is_attendee_registration_open === 1 && payable(event.attendee_fee_cents)) types.push('attendee_supporter');
  return types;
}

export interface EventStatusRow {
  status: string;
  registration_status: string;
  registration_deadline: string | null;
  start_date: string;
  is_attendee_registration_open: number;
  competitor_fee_cents: number | null;
  attendee_fee_cents: number | null;
  payment_enabled: number;
  /** 1 when the event has a division a competitor can enter (not only aggregate standings). */
  has_enterable_division: number;
}

/**
 * Whether a member with no registration yet could register for the event now:
 * registration is open and before its cutoff, and at least one registration
 * type is on offer, a competitor needing a division to enter. The badge and
 * the event page's register button both follow this, so a badge never says
 * registration is open while the page offers no way to register.
 */
export function isRegistrationOffered(row: EventStatusRow, todayIso: string): boolean {
  if (!isRegistrationOpen(row, todayIso)) return false;
  return offeredRegistrationTypes(row)
    .some((t) => t !== 'competitor' || row.has_enterable_division === 1);
}

/**
 * The status badge for an event. An open event that no one could register for
 * now (past its cutoff, paused, or offering no type a member could take) reads
 * as closed, the same as an event an organizer or the deadline job closed.
 */
export function eventStatusBadge(row: EventStatusRow, todayIso: string): { text: string; cssClass: string } {
  const status = row.status === 'reg_open' && !isRegistrationOffered(row, todayIso) ? 'closed' : row.status;
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
