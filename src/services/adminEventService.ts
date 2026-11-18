/**
 * AdminEventService -- the administrator's event record: finding any event,
 * and the corrections and cancellations an organizer's own surfaces do not
 * reach.
 *
 * Owns:
 *   - The event lookup and the per-event record page
 *   - The preview and confirm pages of each correction and cancellation
 *
 * Does not own:
 *   - Any write. Every correction and cancellation is EventService's, which
 *     holds the rules, the audit row and the organizers' or registrants'
 *     notices for both doors, organizer and administrator.
 *   - Organizer assignment (AdminEventOrganizerService), a Board-awarded
 *     sanction (EventService through its own admin page), and published
 *     results (AdminEventResultService).
 *
 * Required patterns:
 *   - Every page sits behind the admin gate at the route.
 *   - Every correction previews before it writes and takes a reason; the
 *     preview writes nothing.
 *
 * Persistence: reads events, event_disciplines, event_organizers and
 *   registrations; writes nothing itself.
 */
import { eventOrganizers, eventRegistrations, eventWrites } from '../db/db';
import {
  eventService, emptyEventForm, type EventCorrection, type EventFormValues, type DivisionPartsStep,
} from './eventService';
import { NotFoundError } from './serviceErrors';
import { canonicalCountryName } from './countryUtils';
import { auditHistoryHref } from './auditLogService';
import { locationPickers } from './memberService';
import type { PageViewModel } from '../types/page';
import type { OutcomeNoticeView } from '../lib/outcomeNotice';

const LOOKUP_LIMIT = 50;

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Awaiting sanction decision',
  reg_open: 'Registration open',
  closed: 'Registration closed',
  completed: 'Completed',
  canceled: 'Canceled',
};

interface AdminEventRow {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  city: string;
  region: string | null;
  country: string;
  registration_deadline: string | null;
  is_tshirt_size_collected: number;
  is_attendee_registration_open: number;
  status: string;
  sanction_status: string;
  payment_enabled: number;
  currency: string;
  competitor_fee_cents: number | null;
  attendee_fee_cents: number | null;
  tag_normalized: string;
}

export interface AdminEventLookupContent {
  query: string;
  results: Array<{ title: string; recordHref: string; facts: string[]; statusLabel: string }>;
  hasResults: boolean;
  emptyMessage: string;
}

export interface AdminEventRecordContent {
  eventId: string;
  errorMessage: string | null;
  identifyingFacts: string[];
  statusLabel: string;
  publicHref: string | null;
  auditHistoryHref: string;
  organizersHref: string;
  organizers: Array<{ name: string; recordHref: string }>;
  hasOrganizers: boolean;
  detailsAction: string;
  values: EventFormValues;
  countryOptions: Array<{ value: string; label: string; selected: boolean }>;
  /** Offered once the event has opened: grant or revoke its sanction. */
  sanctionOptions: Array<{ value: string; label: string; selected: boolean }> | null;
  clearDescriptionAction: string | null;
  divisions: Array<{ name: string; entriesLabel: string; correctHref: string; removeAction: string }>;
  hasDivisions: boolean;
  registrations: Array<{
    name: string;
    statusLabel: string;
    /** The member's administrator record, where their Active Player standing is corrected. */
    memberRecordHref: string;
    cancelAction: string;
    attendedLabel: string | null;
    /** Marking or unmarking attendance, on a confirmed registration. */
    attendance: { action: string; setTo: 'yes' | 'no'; summary: string; buttonLabel: string } | null;
  }>;
  hasRegistrations: boolean;
  cancelEventAction: string | null;
}

export interface AdminEventDivisionContent {
  eventTitle: string;
  divisionName: string;
  step: DivisionPartsStep;
}

export interface AdminEventConfirmContent {
  eventTitle: string;
  caution: string | null;
  changes: EventCorrection['changes'];
  hasChanges: boolean;
  noChangeMessage: string | null;
  reason: string;
  summary: string;
  hiddenFields: Array<{ name: string; value: string }>;
  confirmAction: string;
  confirmLabel: string;
  cancelHref: string;
}

function readEvent(eventId: string): AdminEventRow {
  const row = eventWrites.findById.get(eventId) as AdminEventRow | undefined;
  if (!row) throw new NotFoundError('Event not found.');
  return row;
}

function recordHref(eventId: string): string {
  return `/admin/events/${encodeURIComponent(eventId)}`;
}

function centsInput(cents: number | null): string {
  if (cents === null) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

function formOf(row: AdminEventRow): EventFormValues {
  return {
    ...emptyEventForm(),
    title: row.title,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    city: row.city,
    region: row.region ?? '',
    country: row.country,
    registrationDeadline: row.registration_deadline ?? '',
    tshirtSizeCollected: row.is_tshirt_size_collected === 1,
    attendeeRegistrationOpen: row.is_attendee_registration_open === 1,
    competitorFee: centsInput(row.competitor_fee_cents),
    spectatorFee: centsInput(row.attendee_fee_cents),
  };
}

/** The submitted details as hidden fields, so the confirm step re-posts exactly what was previewed. */
export function detailsHiddenFields(values: EventFormValues, sanctionState: string, reason: string): Array<{ name: string; value: string }> {
  return [
    { name: 'title', value: values.title },
    { name: 'description', value: values.description },
    { name: 'start_date', value: values.startDate },
    { name: 'end_date', value: values.endDate },
    { name: 'city', value: values.city },
    { name: 'region', value: values.region },
    { name: 'country', value: values.country },
    { name: 'registration_deadline', value: values.registrationDeadline },
    { name: 'tshirt_size_collected', value: values.tshirtSizeCollected ? '1' : '0' },
    { name: 'attendee_registration_open', value: values.attendeeRegistrationOpen ? '1' : '0' },
    { name: 'competitor_fee', value: values.competitorFee },
    { name: 'spectator_fee', value: values.spectatorFee },
    { name: 'sanction_state', value: sanctionState },
    { name: 'reason', value: reason },
  ];
}

function confirmPage(title: string, content: AdminEventConfirmContent): PageViewModel<AdminEventConfirmContent> {
  return {
    seo: { title, noindex: true },
    page: {
      sectionKey: '',
      pageKey: 'admin_event_confirm',
      title,
      instructions: { what: 'Review this before it is written.' },
    },
    content,
  };
}

export const adminEventService = {
  /** Find any event, whatever its status, by part of its title or hashtag, or its id. */
  getEventLookupPage(query: string): PageViewModel<AdminEventLookupContent> {
    const q = query.trim();
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    // Like the club lookup, the page lists only what a search finds.
    const rows = (q ? eventWrites.searchForAdmin.all(like, like, q, LOOKUP_LIMIT) : []) as Array<{
      id: string; title: string; start_date: string; city: string; country: string; status: string; tag_normalized: string;
    }>;
    return {
      seo: { title: 'Event Records', noindex: true },
      page: {
        sectionKey: '',
        pageKey: 'admin_event_lookup',
        title: 'Event Records',
        instructions: {
          what: 'Find any event, in any status, to correct it or cancel it.',
          why: 'Organizers keep their own events; this covers what they cannot reach, and events nobody is left to run.',
          how: 'Search by part of the title or hashtag, or paste the event id, then open its record.',
        },
      },
      content: {
        query: q,
        results: rows.map((r) => ({
          title: r.title,
          recordHref: recordHref(r.id),
          facts: [r.start_date, `${r.city}, ${canonicalCountryName(r.country) ?? r.country}`, r.tag_normalized],
          statusLabel: STATUS_LABELS[r.status] ?? r.status,
        })),
        hasResults: rows.length > 0,
        emptyMessage: q ? 'No event matches that search.' : 'Search by part of an event\'s title or hashtag, or paste its id.',
      },
    };
  },

  /** One event's record and the corrections an administrator can make on it. */
  getEventRecordPage(
    eventId: string,
    opts: { notice?: OutcomeNoticeView | null; errorMessage?: string; values?: EventFormValues } = {},
  ): PageViewModel<AdminEventRecordContent> {
    const row = readEvent(eventId);
    const base = recordHref(row.id);
    const organizers = eventOrganizers.listForEvent.all(row.id) as Array<{ member_id: string; display_name: string }>;
    const divisions = eventWrites.listDivisions.all(row.id) as Array<{ id: string; name: string; confirmed_count: number }>;
    const registrations = eventRegistrations.listStandingForEvent.all(row.id) as Array<{
      id: string; member_id: string; status: string; display_name: string; attended_at: string | null;
    }>;
    const isOpen = ['reg_open', 'closed', 'completed'].includes(row.status);
    const isTerminal = row.status === 'completed' || row.status === 'canceled';
    const values = opts.values ?? formOf(row);
    return {
      seo: { title: row.title, noindex: true },
      page: {
        sectionKey: '',
        pageKey: 'admin_event_record',
        title: row.title,
        ...(opts.notice ? { notice: opts.notice.text, noticeTone: opts.notice.tone } : {}),
        instructions: {
          what: 'One event\'s record, and the corrections and cancellations an administrator can make on it.',
          why: 'An event\'s organizers keep their own event; this covers what they cannot reach, such as a division with confirmed entries, the sanction itself, or an event nobody is left to run.',
          how: 'Open a correction, change what is wrong, give a reason, and review it before it is written.',
          headsUp: [
            'Every correction is recorded with each value before and after, and the event\'s organizers are emailed with your reason.',
            'Canceling the event or a registration emails the people it affects, with your reason.',
            'Payments are not changed here: refunds go through the Treasurer.',
          ],
        },
      },
      navigation: { contextLinks: [{ label: 'Back to Event Records', href: '/admin/events' }] },
      content: {
        eventId: row.id,
        errorMessage: opts.errorMessage ?? null,
        identifyingFacts: [
          `${row.start_date} to ${row.end_date}`,
          [row.city, row.region, canonicalCountryName(row.country) ?? row.country].filter(Boolean).join(', '),
          row.tag_normalized,
          row.id,
        ],
        statusLabel: STATUS_LABELS[row.status] ?? row.status,
        publicHref: isOpen ? `/events/${encodeURIComponent(row.tag_normalized.slice(1))}` : null,
        auditHistoryHref: auditHistoryHref('event', row.id),
        organizersHref: `${base}/organizers`,
        organizers: organizers.map((o) => ({ name: o.display_name, recordHref: `/admin/members/${encodeURIComponent(o.member_id)}` })),
        hasOrganizers: organizers.length > 0,
        detailsAction: `${base}/details`,
        values,
        countryOptions: locationPickers(values.country, '').countryOptions,
        sanctionOptions: isOpen
          ? [
            { value: 'approved', label: 'Sanctioned by IFPA', selected: row.sanction_status === 'approved' },
            { value: 'none', label: 'Not sanctioned', selected: row.sanction_status !== 'approved' },
          ]
          : null,
        clearDescriptionAction: row.description !== '' ? `${base}/description/clear` : null,
        divisions: divisions.map((d) => ({
          name: d.name,
          entriesLabel: d.confirmed_count === 1 ? '1 confirmed entry' : `${d.confirmed_count} confirmed entries`,
          correctHref: `${base}/divisions/${encodeURIComponent(d.id)}`,
          removeAction: `${base}/divisions/${encodeURIComponent(d.id)}/remove`,
        })),
        hasDivisions: divisions.length > 0,
        registrations: registrations.map((r) => ({
          name: r.display_name,
          statusLabel: r.status === 'confirmed' ? 'Confirmed' : 'Awaiting payment',
          memberRecordHref: `/admin/members/${encodeURIComponent(r.member_id)}`,
          cancelAction: `${base}/registrations/${encodeURIComponent(r.id)}/cancel`,
          attendedLabel: r.attended_at ? 'Attended' : null,
          attendance: r.status === 'confirmed'
            ? {
              action: `${base}/registrations/${encodeURIComponent(r.id)}/attendance`,
              setTo: r.attended_at ? 'no' : 'yes',
              summary: r.attended_at ? 'Remove the Attendance Mark' : 'Mark Attended',
              buttonLabel: r.attended_at ? 'Review Removing the Attendance Mark' : 'Review Marking Attended',
            }
            : null,
        })),
        hasRegistrations: registrations.length > 0,
        cancelEventAction: isTerminal ? null : `${base}/cancel`,
      },
    };
  },

  /** The parts form for correcting one division. */
  getDivisionPage(eventId: string, divisionId: string): PageViewModel<AdminEventDivisionContent> {
    const found = eventService.getDivisionCorrectionStep(eventId, divisionId);
    const title = `Correct ${found.divisionName}`;
    return {
      seo: { title, noindex: true },
      page: {
        sectionKey: '',
        pageKey: 'admin_event_division',
        title,
        instructions: {
          what: `Correct the parts of a division of ${found.eventTitle}.`,
          why: 'An organizer cannot change a division once a registration in it is confirmed.',
          how: 'Choose the corrected parts, give a reason, and review the change before it is written.',
          headsUp: ['The division\'s name is generated from its parts, and every entry in it stays.'],
        },
      },
      navigation: { contextLinks: [{ label: `Back to ${found.eventTitle}`, href: recordHref(eventId) }] },
      content: { eventTitle: found.eventTitle, divisionName: found.divisionName, step: found.step },
    };
  },

  /** The preview of any correction, from what EventService says it would change. */
  correctionConfirmPage(opts: {
    eventId: string; title: string; correction: EventCorrection; reason: string; summary: string;
    hiddenFields: Array<{ name: string; value: string }>; confirmAction: string; confirmLabel: string;
  }): PageViewModel<AdminEventConfirmContent> {
    const row = readEvent(opts.eventId);
    return confirmPage(opts.title, {
      eventTitle: row.title,
      caution: null,
      changes: opts.correction.changes,
      hasChanges: opts.correction.changes.length > 0,
      noChangeMessage: opts.correction.changes.length > 0 ? null : 'That is what the event already holds. Nothing would change.',
      reason: opts.reason,
      summary: opts.summary,
      hiddenFields: opts.hiddenFields,
      confirmAction: opts.confirmAction,
      confirmLabel: opts.confirmLabel,
      cancelHref: recordHref(opts.eventId),
    });
  },

  /** The preview of a cancellation: who it tells, then the final button. */
  cancellationConfirmPage(opts: {
    eventId: string; title: string; caution: string; reason: string; confirmAction: string; confirmLabel: string;
  }): PageViewModel<AdminEventConfirmContent> {
    const row = readEvent(opts.eventId);
    return confirmPage(opts.title, {
      eventTitle: row.title,
      caution: opts.caution,
      changes: [],
      hasChanges: false,
      noChangeMessage: null,
      reason: opts.reason,
      summary: 'The people it affects are emailed with the reason you give here.',
      hiddenFields: [{ name: 'reason', value: opts.reason }, { name: 'confirmed', value: '1' }],
      confirmAction: opts.confirmAction,
      confirmLabel: opts.confirmLabel,
      cancelHref: recordHref(opts.eventId),
    });
  },
};
