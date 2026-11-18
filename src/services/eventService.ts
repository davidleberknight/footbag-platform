/**
 * EventService -- event lifecycle and public event reads.
 *
 * Owns:
 *   - Event lifecycle (create through completion or cancellation)
 *   - Management of the event's categories and divisions (event_disciplines rows)
 *   - Co-organizer management
 *   - Sanction requests
 *   - Results upload
 *   - Public event browse and detail page reads
 *
 * Does not own:
 *   - Registration payments (PaymentService): the checkout, the payment row and
 *     its settlement. A paid registration's pending row is written inside the
 *     payment's opening transaction, and confirmed or canceled inside its
 *     webhook's, through eventRegistrationSettlement.
 *   - Competition participation records (CompetitionParticipationService)
 *
 * Required patterns:
 *   - Public eventKey parsing and validation live in this service. Public form
 *     `event_{year}_{event_slug}` maps to stored standard-tag `#event_{year}_{event_slug}`
 *     before DB lookup; no aliasing, no fuzzy match.
 *   - Status state machine: `draft -> pending_approval -> reg_open -> closed ->
 *     completed | canceled`; a rejected sanction request returns `pending_approval ->
 *     draft`. `completed` and `canceled` are terminal. The status names the
 *     registration lifecycle; results publication is a separate concern.
 *   - Public detail visibility limited to `reg_open`, `closed`, `completed`. Other
 *     statuses resolve through standard not-found behavior.
 *   - HD guard: events with public result rows are preserved permanently. Draft and
 *     canceled events HD immediately. Cannot delete an event with confirmed registrations.
 *   - Creating a free event takes Tier 1 benefits and opens it at once
 *     (`draft -> reg_open` in the creating transaction, emailing its organizers).
 *     Choosing the sanctioned path, and with it any registration fee, takes Tier 2
 *     or Tier 3; such an event stays `draft` until its sanction request is approved.
 *     Free or sanctioned is fixed at creation; editing never changes it, and fees
 *     change only while the event is still a draft.
 *   - Sanction request and approval require the requesting organizer's Tier 2 or
 *     Tier 3 at each of those two moments only.
 *   - Sanction request: any current organizer of a sanctioned-path draft submits
 *     the attestation and the request's answers, which moves the event to
 *     `pending_approval` and raises a routine `sanction_request` item in the
 *     sanctioning area of the admin work queue; the Sanctioning Director is an
 *     administrator and is reached by the queue's own digest. A rejected request
 *     returns the event to draft and may be revised and resubmitted.
 *   - Sanction decision: one administrator approves (sanctioned, `reg_open`,
 *     payment enabled where a fee is set) or rejects with a reason. An
 *     administrator who organizes the event cannot decide it. A Board-awarded
 *     World Championships is sanctioned by an administrator recording the
 *     Board's decision on the draft, with no request.
 *   - Every organizer surface resolves the event by its key and refuses, as
 *     not-found, a member who is not a current organizer of it.
 *   - Max 5 organizers per event, all equal with no primary, counted on the current
 *     view inside the write's transaction. The sole organizer cannot remove
 *     themselves or step down.
 *   - Standard tag (`#event_{year}_{slug}`), lowercase and permanent (not HD). Event
 *     creation writes it in the creating transaction, the year from the start date
 *     and the slug folded by the one rule; a typed slug the rule changes is shown
 *     back before anything is saved. It never changes after, even when the dates
 *     move to another year.
 *   - A division's name is generated from its parts (class, gender, entry size,
 *     game), offering only what its game admits in `discipline_games`. A division
 *     with a confirmed registration is not changed or removed here.
 *   - An organizer's edit of the event or a division records each changed field
 *     before and after: the event is a record its organizers all edit.
 *   - Public archive year derives from `events.start_date`; year archives are not paginated.
 *   - `participantHref` set via `personHref(participant_member_slug,
 *     participant_historical_person_id)`; templates render plain name when null.
 *   - SQLite busy/locked failures translate to temporary-unavailable for controller-level
 *     safe handling.
 *   - The canonical public event page is one route and one template; render emphasis is
 *     expressed through page-model fields (e.g. `primarySection`), not alternate URLs.
 *   - The public event page names the current organizers to everyone and shows their
 *     email to signed-in members only: holding the role makes it member-visible. The
 *     email is absent from the view model for a signed-out visitor.
 *   - Registration: any signed-in member registers themselves, one row per member
 *     per event, reused when they register again after withdrawing. It is open while
 *     the event is `reg_open`, its organizers have not stopped online registration
 *     (`registration_status`), and the day is on or before the cutoff: the
 *     registration deadline, or the start date when none is set. A free
 *     registration is `confirmed` at once. A type carrying a fee is offered only
 *     once sanction approval has enabled payment; registering for it writes a
 *     `pending` registration and sends the member to checkout, and only the
 *     webhook-confirmed payment confirms it. Submitting the same registration
 *     again returns to its open checkout; a changed one releases that checkout
 *     and opens another. A member who withdrew a registration they paid for, and
 *     was not refunded, registers again as the same type with no new charge.
 *     A competitor enters at least one division; a doubles entry names
 *     its partner, a member or a typed name. Gender eligibility is checked between
 *     member profiles; a typed partner's is the organizer's to check at check-in.
 *   - Withdrawal: the member cancels their own registration up to the same cutoff;
 *     the canceled row keeps its entries, and every current organizer is emailed.
 *     A registration waiting at checkout ends that checkout first.
 *   - The event page shows every visitor how many confirmed registrations each
 *     division has. A signed-in member also sees who is registered (confirmed
 *     registrations only, no contact details) and their own registration.
 *   - Removing a division takes with it the entries no confirmed registration holds.
 *
 * Persistence:
 *   events, event_disciplines, discipline_games (read), event_organizers, event_results_uploads,
 *   event_result_entries, event_result_entry_participants, tags, registrations,
 *   registration_discipline_selections, audit_entries, outbox_emails, work_queue_items.
 *
 * Side effects:
 *   - audit_entries append (event.created, event.details_edited,
 *     event.division_added / _changed / _removed, event.organizer_assigned,
 *     event.organizer_removed, event.organizer_stepped_down,
 *     event.registration_withdrawn, event.registration_status_changed,
 *     event.sanction_requested, event.sanction_approved, event.sanction_rejected,
 *     event.sanction_awarded)
 *   - outbox_emails enqueue (organizer confirmations, participant notices, sanction
 *     request and decisions), inside the act's transaction
 *   - work_queue_items insert (`sanction_request`, routine: read on the queue and
 *     rolled up in the administrators' digest) and resolve on its decision
 *
 * Service shape: singleton object. It reaches the payment provider only through
 * PaymentService, never an adapter of its own.
 */
import { randomUUID } from 'crypto';
import {
  PublicCompletedEventSummaryRow,
  PublicEventDetailRow,
  PublicEventDisciplineRow,
  PublicEventResultRow,
  PublicEventSummaryRow,
  eventOrganizers,
  eventRegistrations,
  eventWrites,
  mediaTags,
  publicEvents,
  transaction,
  workQueue,
} from '../db/db';
import { config } from '../config/env';
import { workQueueService } from './workQueueService';
import { enforceWorkQueueResolveLimit } from './identityAccessService';
import {
  mediaService,
  type EntityHashtag,
  type EntityMediaBlock,
} from './mediaService';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from './serviceErrors';
import { appendAuditEntry, findOwnLatestAudit, findStandingOwnAct } from './auditService';
import { hasTier1Benefits, isTier2Plus } from './tierPredicates';
import { checkTypedSlug } from './typedTokenRules';
import { slugifyForTag } from './slugify';
import { INVALID_TEXT_ENCODING_MESSAGE, sanitizeUserText } from '../lib/textSanitizer';
import { canonicalCountryName } from './countryUtils';
import { COUNTRY_CHOICE_MESSAGE } from './memberLocationRules';
import { emailService } from './emailService';
import { locationPickers } from './memberService';
import { paymentService } from './paymentService';
import {
  REGISTRATION_TYPE_LABELS,
  eventDatesPhrase,
  registrationSummary,
  toEntryView,
  type RegistrationEntryView,
  type RegistrationType,
} from './eventRegistrationSettlement';
import type { OutcomeNoticeView } from '../lib/outcomeNotice';
import { personHref } from './personLink';
import { runSqliteRead } from './sqliteRetry';
import { PageViewModel } from '../types/page';
import { loadSitePhotoUrl } from './siteMediaService';

const PUBLIC_EVENT_KEY_PATTERN = /^event_\d{4}_[a-z0-9_]+$/;

export interface PublicEventSummary {
  eventId: string;
  eventKey: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  city: string;
  region: string | null;
  country: string;
  hostClub: string | null;
  externalUrl: string | null;
  registrationDeadline: string | null;
  status: string;
  // Pre-shaped status presentation so templates never branch on or print
  // the raw enum: a new status value renders with a readable label and a
  // styled fallback class instead of a bare code and an undefined class.
  statusLabel: string;
  statusCssClass: string;
  registrationStatus: string;
  regOpenedAt: string | null;
  hashtagTagId: string;
  standardTagNormalized: string;
  standardTagDisplay: string;
}

export interface PublicCompletedEventSummary extends PublicEventSummary {
  hasResults: boolean;
}

export interface PublicEventDiscipline {
  disciplineId: string;
  eventId: string;
  name: string;
  /** null only on an aggregate standing that spans several disciplines. */
  disciplineCategory: string | null;
  teamType: string;
  teamTypeLabel: string | null;
  sortOrder: number;
  isAggregateStanding: boolean;
  /** "N registered" on an event still taking or past registration; null otherwise. */
  registeredLabel: string | null;
}

export interface PublicEventResultParticipant {
  participantDisplayName: string;
  participantOrder: number;
  participantHref: string | null;
}

export interface PublicResultPlacement {
  placement: number;
  scoreText: string | null;
  participants: PublicEventResultParticipant[];
}

export interface PublicResultSection {
  disciplineId: string | null;
  disciplineName: string | null;
  disciplineCategory: string | null;
  teamType: string | null;
  isAggregateStanding: boolean;
  placements: PublicResultPlacement[];
}

export interface PublicEvent extends PublicEventSummary {
  isAttendeeRegistrationOpen: boolean;
  isTshirtSizeCollected: boolean;
  sanctionStatus: string;
  /** The event holds an approved IFPA sanction. */
  isSanctioned: boolean;
  paymentEnabled: boolean;
  currency: string;
  competitorFeeCents: number | null;
  attendeeFeeCents: number | null;
}

export interface PublicEventPage {
  event: PublicEvent;
  disciplines: PublicEventDiscipline[];
  hasResults: boolean;
  isSparse: boolean;
  primarySection: 'details' | 'results';
  resultSections: PublicResultSection[];
  // The event's hashtag for the page's media line, linked to its gallery when
  // media carries it, so a visitor sees exactly what to tag their own media with.
  hashtag: EntityHashtag;
  // The newest media carrying the event's hashtag and the button to its whole
  // gallery; null when none does, which hides the block.
  media: EntityMediaBlock | null;
}

export interface FeaturedPromoCard {
  title: string;
  href: string;
  ctaLabel: string;
  description?: string;
  startDate: string;
  endDate: string;
  city: string;
  region?: string | null;
  country: string;
  external?: boolean;
  imageUrl?: string;
  imageAlt?: string;
}

export interface EventsLandingContent {
  featuredPromo?: FeaturedPromoCard;
  upcomingEvents: PublicEventSummary[];
  archiveYears: number[];
  /** Where an organizer arriving cold reads what sanctioning takes and who may apply. */
  organizerLinks: { guidelinesHref: string };
}

export interface EventsYearContent {
  year: number;
  events: PublicCompletedEventSummary[];
}

export interface EventDetailContent {
  event: PublicEvent;
  disciplines: PublicEventDiscipline[];
  hasResults: boolean;
  isSparse: boolean;
  primarySection: 'details' | 'results';
  resultSections: PublicResultSection[];
  hashtag: EntityHashtag;
  media: EntityMediaBlock | null;
  organizers: EventOrganizerView[];
  /** Registration on an upcoming event, for a signed-in member; null otherwise. */
  registration: EventRegistrationBlock | null;
  /** The outcome of the member's last registration action. */
  notice: OutcomeNoticeView | null;
}

/** One division a registration entered, with its partner and Amateur choice. */
export type { RegistrationEntryView };

/** The viewer's own registration on the event page. */
export interface OwnRegistrationView {
  typeLabel: string;
  /** Set while the registration waits for payment. */
  statusLabel: string | null;
  entries: RegistrationEntryView[];
  tshirtSize: string | null;
  /** The withdraw form's action while withdrawal is open; null after the cutoff. */
  withdrawAction: string | null;
  /** The register page, to return to checkout, while the registration waits for payment. */
  completePaymentHref: string | null;
}

/** One confirmed registrant on the member-visible list. */
export interface RegistrantViewModel {
  name: string;
  profileHref: string;
  typeLabel: string;
  entries: RegistrationEntryView[];
}

export interface EventRegistrationBlock {
  /** The register page, while the viewer can register; null otherwise. */
  registerHref: string | null;
  /** Shown when the viewer is not registered and cannot register now. */
  closedNote: string | null;
  mine: OwnRegistrationView | null;
  registrants: RegistrantViewModel[];
  registrantsHeading: string;
}

/** One current organizer on the public event page. */
export interface EventOrganizerView {
  name: string;
  /** Present only for a signed-in member viewer: holding the role makes it member-visible. */
  contactEmail?: string;
}

function assertArchiveYear(year: number): void {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new ValidationError('year must be a four-digit integer.', {
      field: 'year',
      value: year,
    });
  }
}

function normalizePublicEventKeyToStoredTag(eventKey: string): string {
  if (!PUBLIC_EVENT_KEY_PATTERN.test(eventKey)) {
    throw new ValidationError('eventKey must match pattern event_{year}_{event_slug}.', {
      field: 'eventKey',
      value: eventKey,
    });
  }

  return `#${eventKey.toLowerCase()}`;
}

// Closed label/class set for the event-status badge. Statuses with no badge
// class in style.css fall back to the neutral badge so an unmapped value can
// never render unstyled raw-code text.
const EVENT_STATUS_LABELS: Record<string, string> = {
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

function toPublicEventSummary(row: PublicEventSummaryRow): PublicEventSummary {
  return {
    eventId: row.event_id,
    eventKey: row.tag_normalized.startsWith('#') ? row.tag_normalized.slice(1) : row.tag_normalized,
    title: row.title,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    city: row.city,
    region: row.region,
    country: row.country,
    hostClub: row.host_club,
    externalUrl: row.external_url,
    registrationDeadline: row.registration_deadline,
    status: row.status,
    statusLabel: EVENT_STATUS_LABELS[row.status] ?? row.status,
    statusCssClass: EVENT_STATUS_BADGE_CLASSES[row.status] ?? 'badge-muted',
    registrationStatus: row.registration_status,
    regOpenedAt: row.reg_opened_at,
    hashtagTagId: row.hashtag_tag_id,
    standardTagNormalized: row.tag_normalized,
    standardTagDisplay: row.tag_display,
  };
}

function toPublicCompletedEventSummary(row: PublicCompletedEventSummaryRow): PublicCompletedEventSummary {
  return {
    ...toPublicEventSummary(row),
    hasResults: row.has_results === 1,
  };
}

/** Mixed doubles is the doubles entry size with mixed gender eligibility. */
export function toTeamTypeLabel(teamType: string, genderEligibility: string | null): string | null {
  if (teamType !== 'doubles') return null;
  return genderEligibility === 'mixed' ? 'Mixed Doubles' : 'Doubles';
}

function toPublicEventDiscipline(row: PublicEventDisciplineRow): PublicEventDiscipline {
  return {
    disciplineId: row.discipline_id,
    eventId: row.event_id,
    name: row.name,
    disciplineCategory: row.discipline_category,
    teamType: row.team_type,
    // A structured division's generated name already says its entry size.
    teamTypeLabel: row.is_structured === 1 ? null : toTeamTypeLabel(row.team_type, row.gender_eligibility),
    sortOrder: row.sort_order,
    isAggregateStanding: row.is_aggregate_standing === 1,
    registeredLabel: null,
  };
}

function toPublicEvent(eventRow: PublicEventDetailRow): PublicEvent {
  return {
    ...toPublicEventSummary(eventRow),
    isAttendeeRegistrationOpen: eventRow.is_attendee_registration_open === 1,
    isTshirtSizeCollected: eventRow.is_tshirt_size_collected === 1,
    sanctionStatus: eventRow.sanction_status,
    isSanctioned: eventRow.sanction_status === 'approved',
    paymentEnabled: eventRow.payment_enabled === 1,
    currency: eventRow.currency,
    competitorFeeCents: eventRow.competitor_fee_cents,
    attendeeFeeCents: eventRow.attendee_fee_cents,
  };
}

const DISCIPLINE_CATEGORY_PRIORITY: Record<string, number> = {
  net: 1,
  freestyle: 2,
  golf: 3,
  sideline: 4,
};

// Priority 1: Open / Pro (word boundary for 'pro' to avoid "impromptu", "program")
// Priority 2: Men unqualified (top-level men's division)
// Priority 3: Women unqualified (top-level women's division)
// Priority 4: Masters
// Priority 5: names containing Advanced / Amateur / Ultra (legacy brackets)
// Priority 6: Intermediate (many spelling variants and abbreviations)
// Priority 7: Novice / Beginner / Junior
// Priority 8: Unmatched (last)
const DIVISION_PRIORITY_RULES: Array<{ patterns: Array<string | RegExp>; priority: number }> = [
  { patterns: ['open', /\bpro\b/], priority: 1 },
  { patterns: ['master'], priority: 4 },
  { patterns: ['advanc', 'amateur', 'ultra'], priority: 5 },
  { patterns: ['interm', 'inter ', 'int '], priority: 6 },
  { patterns: ['novice', 'beginner', 'junior', 'novato'], priority: 7 },
];

// Women must be checked before men: 'wo-MEN' contains the men markers as a substring.
// Gendered names with no division qualifier are the top-level division for that gender.
const WOMEN_MARKERS = ['women', 'woman', 'ladies', 'girl'];
const MEN_MARKERS = ["men's", 'mens', ' men', "man's", 'gents'];

// An aggregate standing ranks competitors over the event's contests, so it follows
// every contested event_disciplines row, including one whose discipline is unrecognised (5).
const AGGREGATE_STANDING_PRIORITY = 6;

function disciplineSortKey(category: string | null, name: string | null, isAggregateStanding: boolean): [number, number, string] {
  const catPriority = isAggregateStanding
    ? AGGREGATE_STANDING_PRIORITY
    : DISCIPLINE_CATEGORY_PRIORITY[category ?? ''] ?? 5;
  const lower = (name ?? '').toLowerCase();
  let divPriority = 8; // unmatched = last
  for (const rule of DIVISION_PRIORITY_RULES) {
    if (rule.patterns.some((p) => (typeof p === 'string' ? lower.includes(p) : p.test(lower)))) {
      divPriority = rule.priority;
      break;
    }
  }
  if (divPriority === 8) {
    if (WOMEN_MARKERS.some((m) => lower.includes(m))) divPriority = 3;
    else if (MEN_MARKERS.some((m) => lower.includes(m))) divPriority = 2;
  }
  return [catPriority, divPriority, name ?? ''];
}

function groupPublicResultRows(resultRows: PublicEventResultRow[]): PublicResultSection[] {
  type MutablePlacement = {
    placement: number;
    scoreText: string | null;
    participants: PublicEventResultParticipant[];
  };

  type MutableSection = {
    disciplineId: string | null;
    disciplineName: string | null;
    disciplineCategory: string | null;
    teamType: string | null;
    isAggregateStanding: boolean;
    placements: MutablePlacement[];
    placementsByResultEntryId: Map<string, MutablePlacement>;
  };

  const sections: MutableSection[] = [];
  const sectionsByKey = new Map<string, MutableSection>();

  for (const row of resultRows) {
    const sectionKey = [
      row.discipline_id ?? '',
      row.discipline_name ?? '',
      row.discipline_category ?? '',
      row.team_type ?? '',
    ].join('|');

    let section = sectionsByKey.get(sectionKey);
    if (!section) {
      section = {
        disciplineId: row.discipline_id,
        disciplineName: row.discipline_name,
        disciplineCategory: row.discipline_category,
        teamType: row.team_type,
        isAggregateStanding: row.discipline_is_aggregate_standing === 1,
        placements: [],
        placementsByResultEntryId: new Map<string, MutablePlacement>(),
      };
      sectionsByKey.set(sectionKey, section);
      sections.push(section);
    }

    let placement = section.placementsByResultEntryId.get(row.result_entry_id);
    if (!placement) {
      placement = {
        placement: row.placement,
        scoreText: row.score_text,
        participants: [],
      };
      section.placementsByResultEntryId.set(row.result_entry_id, placement);
      section.placements.push(placement);
    }

    const participantHref = personHref(
      row.participant_member_slug,
      row.participant_historical_person_id,
    );

    placement.participants.push({
      participantDisplayName: row.participant_display_name,
      participantOrder: row.participant_order,
      participantHref,
    });
  }

  const mapped = sections.map((section) => ({
    disciplineId: section.disciplineId,
    disciplineName: section.disciplineName,
    disciplineCategory: section.disciplineCategory,
    teamType: section.teamType,
    isAggregateStanding: section.isAggregateStanding,
    placements: section.placements,
  }));

  mapped.sort((a, b) => {
    const [aCat, aDiv, aName] = disciplineSortKey(a.disciplineCategory, a.disciplineName, a.isAggregateStanding);
    const [bCat, bDiv, bName] = disciplineSortKey(b.disciplineCategory, b.disciplineName, b.isAggregateStanding);
    return aCat - bCat || aDiv - bDiv || aName.localeCompare(bName);
  });

  return mapped;
}

/**
 * Whether the featured event card still describes something ahead of, or
 * currently happening on, the given day. Exported for unit testing.
 *
 * The card is hand-authored ahead of its event and reads in the future tense,
 * which stops being true the day after the event ends. Comparing calendar days
 * rather than instants puts the boundary on the end date itself, so an event
 * still features on its final day and stops the following morning.
 */
export function isFeaturedPromoCurrent(endDate: string, nowIso: string): boolean {
  return nowIso.slice(0, 10) <= endDate;
}

/**
 * Resolve sibling-archive-year navigation for a given year. Exported for
 * unit testing.
 *
 * `previousYear` is the year immediately older than `year`; `nextYear` is
 * the year immediately newer. The helper sorts its input DESC internally
 * so the result is independent of the caller's ordering. The current
 * production caller is `listPublicArchiveYears()` which returns DESC, but
 * a future change to ASC would otherwise silently invert previous/next.
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

function toPublicEventPage(
  eventRow: PublicEventDetailRow,
  disciplineRows: PublicEventDisciplineRow[],
  resultRows: PublicEventResultRow[],
  media: EntityMediaBlock | null,
): PublicEventPage {
  const resultSections = groupPublicResultRows(resultRows);
  const hasResults = resultSections.length > 0;
  const placementCount = resultSections.reduce(
    (sum, section) => sum + section.placements.length,
    0,
  );
  const isSparse = hasResults && (disciplineRows.length < 3 || placementCount < 10);

  return {
    event: toPublicEvent(eventRow),
    disciplines: disciplineRows.map(toPublicEventDiscipline).sort((a, b) => {
      const [aCat, aDiv, aName] = disciplineSortKey(a.disciplineCategory, a.name, a.isAggregateStanding);
      const [bCat, bDiv, bName] = disciplineSortKey(b.disciplineCategory, b.name, b.isAggregateStanding);
      return aCat - bCat || aDiv - bDiv || aName.localeCompare(bName);
    }),
    hasResults,
    isSparse,
    primarySection: hasResults ? 'results' : 'details',
    resultSections,
    hashtag: {
      display: eventRow.tag_display,
      galleryHref: media ? media.galleryHref : null,
    },
    media,
  };
}

// ── Organizer surfaces: shapes and rules ────────────────────────────────────

const ORGANIZER_CAP = 5;
const EVENT_TITLE_MAX = 150;
const EVENT_DESCRIPTION_MAX = 5000;

function newId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 24);
}

/** The event form as typed: every field a string, as the browser sends it. */
export interface EventFormValues {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  city: string;
  region: string;
  country: string;
  registrationDeadline: string;
  tshirtSizeCollected: boolean;
  attendeeRegistrationOpen: boolean;
  /** Creation only: the hashtag's slug, after `#event_{year}_`. */
  slug: string;
  /** Creation only: 'free' or 'sanctioned'. */
  eventType: string;
  competitorFee: string;
  spectatorFee: string;
}

export function emptyEventForm(): EventFormValues {
  return {
    title: '', description: '', startDate: '', endDate: '', city: '', region: '', country: '',
    registrationDeadline: '', tshirtSizeCollected: false, attendeeRegistrationOpen: false,
    slug: '', eventType: 'free',
    competitorFee: '', spectatorFee: '',
  };
}

interface SelectOption { value: string; label: string; selected: boolean }

export interface CreateEventContent {
  formAction: string;
  cancelHref: string;
  values: EventFormValues;
  fieldErrors: Record<string, string>;
  errorMessage: string | null;
  errorTone: 'no' | 'info';
  canChooseSanctioned: boolean;
  isSanctioned: boolean;
  countryOptions: SelectOption[];
  guidelinesHref: string;
}

export type CreateEventResult =
  | { branch: 'created'; eventKey: string; isOpen: boolean }
  | { branch: 'own_repeat'; eventKey: string }
  | { branch: 'tag_conflict'; tagNormalized: string; suggestion: string | null }
  /** The typed slug folds to a different token; nothing is created. */
  | { branch: 'slug_folded'; slug: string };

export interface DivisionInput {
  /** Set when changing an existing division; its game is kept. */
  divisionId?: string;
  gameId: string;
  customName: string;
  customDiscipline: string;
  teamType: string;
  gender: string;
  divisionClass: string;
  offersPrizeMoney: boolean;
}

interface ChoiceView { value: string; label: string; checked: boolean }

export interface DivisionPartsStep {
  action: string;
  cancelHref: string;
  gameName: string;
  divisionId: string | null;
  gameId: string;
  customName: string;
  customDiscipline: string;
  teamTypes: ChoiceView[];
  genders: ChoiceView[];
  classes: ChoiceView[];
  offersPrizeMoney: boolean;
  submitLabel: string;
}

export interface ManageEventContent {
  notice: OutcomeNoticeView | null;
  eventTitle: string;
  statusLabel: string;
  typeLabel: string;
  hashtag: string;
  publicHref: string | null;
  detailsAction: string;
  detailsMessage: string | null;
  fieldErrors: Record<string, string>;
  values: EventFormValues;
  countryOptions: SelectOption[];
  showFees: boolean;
  canEditFees: boolean;
  divisions: Array<{
    id: string; name: string; prizeLabel: string | null; isLocked: boolean;
    editHref: string; removeAction: string;
  }>;
  gameGroups: Array<{ label: string; options: SelectOption[] }>;
  chooseGameAction: string;
  customGameName: string;
  disciplineOptions: SelectOption[];
  partsStep: DivisionPartsStep | null;
  organizers: Array<{
    name: string; memberId: string; profileHref: string; addedOn: string;
    isSelf: boolean; canRemove: boolean; removeAction: string;
  }>;
  canAddOrganizer: boolean;
  organizerCap: number;
  addOrganizerAction: string;
  stepDownAction: string | null;
  /** The online-registration switch, while the event is open for registration. */
  onlineRegistration: {
    statusLabel: string;
    action: string;
    /** The value the button posts: 'closed' to stop, 'open' to resume. */
    setTo: 'open' | 'closed';
    buttonLabel: string;
  } | null;
  /** The sanction section, on an event created on the sanctioned path. */
  sanction: {
    statusLine: string;
    /** The request form, while the event is a draft whose request is not in. */
    requestHref: string | null;
    /** Said instead of the button to an organizer below Tier 2. */
    tierNote: string | null;
  } | null;
}

/** The sanction request form as typed: every field a string, as the browser sends it. */
export interface SanctionFormValues {
  attest: boolean;
  deviates: string;
  deviations: string;
  prizeMoney: string;
  prizeTotal: string;
  prizeCurrency: string;
  entryFeeIncludes: string;
  frequency: string;
  yearsHeld: string;
  expectedPlayers: string;
  expectedSpectators: string;
  permits: string;
  insurance: string;
  justification: string;
}

export interface SanctionRequestContent {
  eventTitle: string;
  formAction: string;
  cancelHref: string;
  guidelinesHref: string;
  values: SanctionFormValues;
  fieldErrors: Record<string, string>;
  errorMessage: string | null;
  /** The reason the last request was rejected, shown while revising it. */
  rejectionReason: string | null;
  divisions: Array<{ name: string; prizeLabel: string | null }>;
  /** The missing Women's or Intermediate divisions, warned of before submitting. */
  divisionWarning: string | null;
  showJustification: boolean;
  deviatesOptions: ChoiceView[];
  prizeOptions: ChoiceView[];
  frequencyOptions: ChoiceView[];
  permitOptions: ChoiceView[];
  insuranceOptions: ChoiceView[];
}

export type SanctionRequestPageResult =
  | { branch: 'form'; page: PageViewModel<SanctionRequestContent> }
  /** Nothing to request: the event's request is in or decided. */
  | { branch: 'closed'; text: string };

export type SanctionSubmitResult =
  | { branch: 'submitted' }
  /** This organizer's own request, submitted again with the same answers. */
  | { branch: 'own_repeat' }
  /** The request is already in, or the event is already sanctioned. */
  | { branch: 'already_held'; text: string };

export type SanctionDecisionResult =
  | { status: 'approved' | 'rejected' }
  /** This administrator's own decision, submitted again. */
  | { status: 'own_repeat' }
  /** Another decision already settled it. */
  | { status: 'already_held' };

/** The full request as the reviewing administrator reads it on the queue item. */
export interface SanctionReviewEvidence {
  eventTitle: string;
  facts: Array<{ label: string; value: string }>;
  organizers: Array<{ name: string; profileHref: string; email: string | null }>;
  deviations: string | null;
  divisions: Array<{ name: string; parts: string; prizeLabel: string | null }>;
  hasDivisions: boolean;
  divisionFlag: string | null;
}

export interface SanctionAwardContent {
  events: Array<{ eventId: string; title: string; dates: string; location: string; action: string }>;
  hasEvents: boolean;
  emptyMessage: string;
  notice: OutcomeNoticeView | null;
  errorMessage: string | null;
}

export interface EventConfirmContent {
  caution: string;
  action: string;
  buttonLabel: string;
  cancelHref: string;
  hiddenMemberId: string | null;
}

interface EventRow {
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
  registration_status: string;
  sanction_status: string;
  payment_enabled: number;
  currency: string;
  competitor_fee_cents: number | null;
  attendee_fee_cents: number | null;
  sanction_requested_by_member_id: string | null;
  sanction_decision_reason: string | null;
  sanction_justification: string | null;
  sanction_deviations: string | null;
  sanction_entry_fee_includes: string | null;
  sanction_event_frequency: string | null;
  sanction_years_held: string | null;
  sanction_expected_players: number | null;
  sanction_expected_spectators: number | null;
  sanction_permits: string | null;
  sanction_insurance: string | null;
  prize_money_total_cents: number | null;
  prize_money_currency: string | null;
  tag_normalized: string;
}

interface DivisionRow {
  id: string;
  name: string;
  discipline_category: string | null;
  game_id: string | null;
  custom_game_name: string | null;
  team_type: string;
  gender_eligibility: string | null;
  division_class: string | null;
  offers_prize_money: number;
  sort_order: number;
  confirmed_count: number;
}

interface GameRow {
  id: string;
  discipline_category: string;
  name: string;
  allows_singles: number;
  allows_doubles: number;
  allows_open: number;
  allows_women: number;
  allows_mixed: number;
  allows_novice: number;
  allows_intermediate: number;
  allows_open_class: number;
  allows_masters: number;
}

const DISCIPLINE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'net', label: 'Net' },
  { value: 'freestyle', label: 'Freestyle' },
  { value: 'golf', label: 'Golf' },
  { value: 'consecutives', label: 'Consecutives' },
  { value: 'x_square', label: 'X-Square' },
];

const TEAM_TYPES = [
  { value: 'singles', label: 'Singles', flag: 'allows_singles' },
  { value: 'doubles', label: 'Doubles', flag: 'allows_doubles' },
] as const;

const GENDERS = [
  { value: 'open', label: 'Open', flag: 'allows_open' },
  { value: 'women', label: "Women's", flag: 'allows_women' },
  { value: 'mixed', label: 'Mixed (doubles only)', flag: 'allows_mixed' },
] as const;

const CLASSES = [
  { value: 'open', label: 'Open', flag: 'allows_open_class' },
  { value: 'intermediate', label: 'Intermediate', flag: 'allows_intermediate' },
  { value: 'novice', label: 'Novice', flag: 'allows_novice' },
  { value: 'masters', label: 'Masters', flag: 'allows_masters' },
] as const;

type PartFlag = typeof TEAM_TYPES[number]['flag'] | typeof GENDERS[number]['flag'] | typeof CLASSES[number]['flag'];

/**
 * A division's display name from its parts: class, then gender (left out when
 * open), then entry size, then game, as in "Intermediate Women's Singles
 * Footbag Net". Exported for unit testing.
 */
export function divisionName(divisionClass: string, gender: string, teamType: string, gameName: string): string {
  const classLabel = CLASSES.find((c) => c.value === divisionClass)?.label ?? divisionClass;
  const genderLabel = gender === 'women' ? "Women's" : gender === 'mixed' ? 'Mixed' : '';
  const sizeLabel = teamType === 'doubles' ? 'Doubles' : 'Singles';
  return [classLabel, genderLabel, sizeLabel, gameName].filter((p) => p !== '').join(' ');
}

/**
 * The hashtag slug suggested from an event's title: folded by the one rule, with
 * a standalone year equal to the event's own dropped, since the hashtag already
 * carries it. Exported for unit testing.
 */
export function suggestEventSlug(title: string, year: string): string {
  return slugifyForTag(title)
    .split('_')
    .filter((part) => part !== '' && part !== year)
    .join('_');
}

function collisionSuggestion(year: string, slug: string, city: string): string | null {
  const citySlug = slugifyForTag(city);
  if (!citySlug || slug.endsWith(`_${citySlug}`)) return null;
  const candidate = `#event_${year}_${slug}_${citySlug}`;
  return candidate.length <= 100 ? candidate : null;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function centsToInput(cents: number | null): string {
  if (cents === null) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** A free event never has a sanction; it opened when it was created. */
function isFreeEvent(event: { status: string; sanction_status: string }): boolean {
  return event.sanction_status === 'none' && event.status !== 'draft' && event.status !== 'pending_approval';
}

// Completed and canceled are terminal: nothing about them changes here.
function assertManageable(event: { status: string }): void {
  if (event.status === 'completed' || event.status === 'canceled') {
    throw new ValidationError(`This event is ${event.status === 'completed' ? 'completed' : 'canceled'}, so it can no longer be changed.`);
  }
}

function eventRowToForm(event: EventRow): EventFormValues {
  return {
    title: event.title,
    description: event.description,
    startDate: event.start_date,
    endDate: event.end_date,
    city: event.city,
    region: event.region ?? '',
    country: event.country,
    registrationDeadline: event.registration_deadline ?? '',
    tshirtSizeCollected: event.is_tshirt_size_collected === 1,
    attendeeRegistrationOpen: event.is_attendee_registration_open === 1,
    slug: '',
    eventType: isFreeEvent(event) ? 'free' : 'sanctioned',
    competitorFee: centsToInput(event.competitor_fee_cents),
    spectatorFee: centsToInput(event.attendee_fee_cents),
  };
}

interface EventDetails {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  city: string;
  region: string | null;
  country: string;
  registrationDeadline: string | null;
  tshirtSizeCollected: boolean;
  attendeeRegistrationOpen: boolean;
  competitorFeeCents: number | null;
  attendeeFeeCents: number | null;
}

function cleanText(raw: string, shape: 'single_line' | 'multi_line', field: string, fieldErrors: Record<string, string>): string {
  const result = sanitizeUserText(raw, shape);
  if (result.status === 'invalid_encoding') {
    fieldErrors[field] = INVALID_TEXT_ENCODING_MESSAGE;
    return '';
  }
  return result.text;
}

// A fee is typed in the event's currency, whole or with cents; blank is none.
function readFee(raw: string, field: string, fieldErrors: Record<string, string>): number | null {
  const typed = raw.trim();
  if (typed === '') return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(typed)) {
    fieldErrors[field] = 'Enter an amount such as 25 or 25.50, or leave it blank.';
    return null;
  }
  const cents = Math.round(Number(typed) * 100);
  if (cents <= 0) {
    fieldErrors[field] = 'Leave the fee blank when there is none.';
    return null;
  }
  return cents;
}

/** Clean and check the shared event fields, recording each refusal by field. */
function readEventDetails(values: EventFormValues, isSanctioned: boolean, fieldErrors: Record<string, string>): EventDetails {
  const title = cleanText(values.title, 'single_line', 'title', fieldErrors);
  const description = cleanText(values.description, 'multi_line', 'description', fieldErrors);
  const city = cleanText(values.city, 'single_line', 'city', fieldErrors);
  const region = cleanText(values.region, 'single_line', 'region', fieldErrors);
  const submittedCountry = values.country.trim();
  const country = canonicalCountryName(submittedCountry) ?? '';

  if (!fieldErrors.title) {
    if (!title) fieldErrors.title = 'Event title is required.';
    else if (title.length > EVENT_TITLE_MAX) fieldErrors.title = `Event title must be ${EVENT_TITLE_MAX} characters or fewer.`;
  }
  if (!fieldErrors.description && description.length > EVENT_DESCRIPTION_MAX) {
    fieldErrors.description = `Description must be ${EVENT_DESCRIPTION_MAX} characters or fewer.`;
  }
  if (!fieldErrors.city && !city) fieldErrors.city = 'City is required.';
  if (!submittedCountry) fieldErrors.country = 'Country is required.';
  else if (!country) fieldErrors.country = COUNTRY_CHOICE_MESSAGE;

  const startDate = values.startDate.trim();
  const endDate = values.endDate.trim() || startDate;
  const deadline = values.registrationDeadline.trim();
  if (!isIsoDate(startDate)) fieldErrors.start_date = 'Enter the first day of the event.';
  if (!isIsoDate(endDate)) fieldErrors.end_date = 'Enter the last day of the event.';
  else if (isIsoDate(startDate) && endDate < startDate) fieldErrors.end_date = 'The last day cannot be before the first day.';
  if (deadline && !isIsoDate(deadline)) fieldErrors.registration_deadline = 'Enter a date, or leave it blank.';
  else if (deadline && isIsoDate(endDate) && deadline > endDate) {
    fieldErrors.registration_deadline = 'Registration has to close by the last day of the event.';
  }

  // Taking any fee through the platform is what sanctioning is for, so a free
  // event carries none.
  const competitorFeeCents = isSanctioned ? readFee(values.competitorFee, 'competitor_fee', fieldErrors) : null;
  const attendeeFeeCents = isSanctioned ? readFee(values.spectatorFee, 'spectator_fee', fieldErrors) : null;

  return {
    title, description, startDate, endDate, city,
    region: region || null,
    country,
    registrationDeadline: deadline || null,
    tshirtSizeCollected: values.tshirtSizeCollected,
    attendeeRegistrationOpen: values.attendeeRegistrationOpen,
    competitorFeeCents,
    attendeeFeeCents,
  };
}

function gameOptionGroups(games: GameRow[], selected: string | null): Array<{ label: string; options: SelectOption[] }> {
  return DISCIPLINE_OPTIONS.map((d) => ({
    label: d.label,
    options: games
      .filter((g) => g.discipline_category === d.value)
      .map((g) => ({ value: g.id, label: g.name, selected: g.id === selected })),
  })).filter((group) => group.options.length > 0);
}

interface ResolvedGame {
  gameId: string | null;
  customName: string | null;
  discipline: string;
  gameName: string;
  /** null for a game the list does not carry, which admits every standard part. */
  game: GameRow | null;
}

function resolveDivisionGame(source: { gameId: string | null; customName: string | null; customDiscipline: string | null }): ResolvedGame {
  if (source.gameId) {
    const game = eventWrites.findGame.get(source.gameId) as GameRow | undefined;
    if (!game) throw new ValidationError('Choose a game from the list.');
    return { gameId: game.id, customName: null, discipline: game.discipline_category, gameName: game.name, game };
  }
  const result = sanitizeUserText(source.customName ?? '', 'single_line');
  const customName = result.status === 'ok' ? result.text : '';
  if (!customName) throw new ValidationError('Name the game, or choose one from the list.');
  if (customName.length > 60) throw new ValidationError('The game name must be 60 characters or fewer.');
  const discipline = DISCIPLINE_OPTIONS.find((d) => d.value === source.customDiscipline)?.value;
  if (!discipline) throw new ValidationError('Choose the discipline the game belongs to.');
  return { gameId: null, customName, discipline, gameName: customName, game: null };
}

function admits(game: GameRow | null, flag: PartFlag): boolean {
  return game === null || game[flag] === 1;
}

function validateDivisionParts(resolved: ResolvedGame, input: DivisionInput): {
  teamType: string; gender: string; divisionClass: string; offersPrizeMoney: boolean;
} {
  const teamType = TEAM_TYPES.find((t) => t.value === input.teamType);
  const gender = GENDERS.find((g) => g.value === input.gender);
  const divisionClass = CLASSES.find((c) => c.value === input.divisionClass);
  if (!teamType || !admits(resolved.game, teamType.flag)) {
    throw new ValidationError(`Choose an entry size ${resolved.gameName} is played in.`);
  }
  if (!gender || !admits(resolved.game, gender.flag)) {
    throw new ValidationError(`Choose who may enter, from what ${resolved.gameName} offers.`);
  }
  if (gender.value === 'mixed' && teamType.value !== 'doubles') {
    throw new ValidationError('A mixed division is played in doubles.');
  }
  if (!divisionClass || !admits(resolved.game, divisionClass.flag)) {
    throw new ValidationError(`Choose a class ${resolved.gameName} offers.`);
  }
  return {
    teamType: teamType.value, gender: gender.value, divisionClass: divisionClass.value,
    offersPrizeMoney: input.offersPrizeMoney,
  };
}

// The division form's second step: the parts the chosen game admits, preset to
// an existing division's own when it is being changed.
function divisionPartsStep(
  base: string,
  games: GameRow[],
  source: { gameId: string | null; customName: string | null; customDiscipline: string | null },
  existing: DivisionRow | null,
): DivisionPartsStep | null {
  const game = source.gameId ? games.find((g) => g.id === source.gameId) ?? null : null;
  if (source.gameId && !game) return null;
  const gameName = game ? game.name : (source.customName ?? '');
  if (!game && !gameName) return null;
  const choose = <T extends { value: string; label: string; flag: PartFlag }>(
    list: readonly T[], current: string | null,
  ): ChoiceView[] => {
    const allowed = list.filter((p) => admits(game, p.flag));
    return allowed.map((p, i) => ({
      value: p.value,
      label: p.label,
      checked: current ? p.value === current : i === 0,
    }));
  };
  return {
    action: `${base}/divisions`,
    cancelHref: `${base}/manage`,
    gameName,
    divisionId: existing?.id ?? null,
    gameId: game?.id ?? '',
    customName: game ? '' : gameName,
    customDiscipline: game ? '' : (source.customDiscipline ?? ''),
    teamTypes: choose(TEAM_TYPES, existing?.team_type ?? null),
    genders: choose(GENDERS, existing?.gender_eligibility ?? null),
    classes: choose(CLASSES, existing?.division_class ?? null),
    offersPrizeMoney: existing?.offers_prize_money === 1,
    submitLabel: existing ? 'Save Division' : 'Add Division',
  };
}

// ── Registration: shapes and rules ──────────────────────────────────────────

const REGISTRATION_NOT_OPEN = 'Online registration is not open for this event.';
// Stored on a registration the member withdrew themselves, which is how a second
// submit of the withdrawal knows the first one landed.
const WITHDRAWN_BY_MEMBER = 'Withdrawn by the member';
const EVENT_CHECKOUT_UNSETTLED =
  'We are still confirming your last registration payment. Please try again in a few minutes.';
const REGISTRATION_AWAITS_PAYMENT =
  'Your registration is waiting for payment. Submit it again to return to checkout, or change it to start a new checkout.';
const TSHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const PARTNER_NAME_MAX = 100;

interface MemberRow { id: string; display_name: string; slug: string; gender: string | null }

interface OwnRegistrationRow {
  id: string;
  status: string;
  registration_type: RegistrationType;
  tshirt_size: string | null;
  registered_at: string;
  canceled_at: string | null;
  cancel_reason: string | null;
  payment_id: string | null;
  payment_status: string | null;
}

/** The fee a registration type carries on this event, or null when it is free. */
function registrationFeeCents(
  event: { competitor_fee_cents: number | null; attendee_fee_cents: number | null },
  type: RegistrationType,
): number | null {
  return type === 'competitor' ? event.competitor_fee_cents : event.attendee_fee_cents;
}

/**
 * The type a member already paid for on this row and has not been refunded, or
 * null. Registering again after withdrawing that registration charges nothing,
 * so it is the only type offered then.
 */
function paidTypeHeld(own: OwnRegistrationRow | undefined): RegistrationType | null {
  return own && own.status === 'canceled' && own.payment_status === 'succeeded' ? own.registration_type : null;
}

/**
 * Whether the registration is waiting on a checkout the member may still
 * complete. A pending registration holding a payment is always waiting on that
 * payment's open checkout: every settlement or close moves the two together.
 */
function awaitsCheckout(own: OwnRegistrationRow | undefined): own is OwnRegistrationRow & { payment_id: string } {
  return own !== undefined && own.status === 'pending' && own.payment_id !== null;
}

function formatFee(cents: number, currency: string): string {
  return `$${(cents / 100).toFixed(2)} ${currency}`;
}

/**
 * Whether a submitted registration asks for exactly what the held one says:
 * the same type, t-shirt size and entries, each with the same partner and
 * Amateur choice. Only then does it return to the held one's open checkout.
 */
function sameRegistration(
  own: OwnRegistrationRow,
  type: RegistrationType,
  entries: Array<{ division: { id: string }; partnerMemberId: string | null; partnerName: string | null; amateur: boolean }>,
  tshirtSize: string | null,
): boolean {
  if (own.registration_type !== type || own.tshirt_size !== tshirtSize) return false;
  const held = eventRegistrations.listSelectionsForRegistration.all(own.id) as SelectionRow[];
  if (held.length !== entries.length) return false;
  return entries.every((e) => held.some((s) => s.discipline_id === e.division.id
    && s.partner_member_id === e.partnerMemberId
    && (s.partner_member_id !== null || s.partner_display_name === e.partnerName)
    && (s.enters_as_amateur === 1) === e.amateur));
}

// The registration form as the member submitted the registration they hold.
function heldRegistrationInput(own: OwnRegistrationRow): RegistrationInput {
  const held = eventRegistrations.listSelectionsForRegistration.all(own.id) as SelectionRow[];
  return {
    type: own.registration_type,
    divisionIds: held.map((s) => s.discipline_id),
    amateurIds: held.filter((s) => s.enters_as_amateur === 1).map((s) => s.discipline_id),
    partners: held
      .filter((s) => s.partner_member_id !== null || s.partner_display_name !== null)
      .map((s) => ({
        divisionId: s.discipline_id,
        key: s.partner_member_slug ?? '',
        name: s.partner_member_id === null ? s.partner_display_name ?? '' : '',
      })),
    tshirtSize: own.tshirt_size ?? '',
  };
}

interface SelectionRow {
  discipline_id: string;
  division_name: string;
  partner_member_id: string | null;
  partner_display_name: string | null;
  enters_as_amateur: number;
  partner_member_name: string | null;
  partner_member_slug: string | null;
}

/** What the registration form posts, every field as typed. */
export interface RegistrationInput {
  type: string;
  divisionIds: string[];
  amateurIds: string[];
  /** One entry per doubles division the form showed, in the form's order. */
  partners: Array<{ divisionId: string; key: string; name: string }>;
  tshirtSize: string;
}

export interface RegisterDivisionView {
  id: string;
  name: string;
  checked: boolean;
  isDoubles: boolean;
  partnerKey: string;
  partnerName: string;
  offersPrizeMoney: boolean;
  amateur: boolean;
  /** Shown beside a gender-gated division when the viewer has not declared a gender. */
  genderWarning: string | null;
  profileHref: string | null;
}

export interface RegisterEventContent {
  formAction: string;
  cancelHref: string;
  eventDates: string;
  /** Null when only one type is offered; `impliedTypeLabel` names it then. */
  typeChoices: ChoiceView[] | null;
  impliedTypeLabel: string | null;
  impliedType: string | null;
  showDivisions: boolean;
  divisions: RegisterDivisionView[];
  tshirtOptions: SelectOption[] | null;
  errorMessage: string | null;
  /** Set while the member's registration waits for payment at an open checkout. */
  pendingNote: string | null;
  submitLabel: string;
}

export type RegisterResult =
  | { branch: 'registered' | 'own_repeat'; eventTitle: string }
  | { branch: 'checkout'; redirectUrl: string; eventTitle: string };

export type RegisterPageResult =
  | { branch: 'form'; page: PageViewModel<RegisterEventContent> }
  | { branch: 'already_registered' | 'not_open'; message: string };

/**
 * The last day a member can register or withdraw: the registration deadline,
 * or the start date when none is set. Exported for unit testing.
 */
export function registrationCutoff(event: { registration_deadline: string | null; start_date: string }): string {
  return event.registration_deadline ?? event.start_date;
}

/** Whether a member can register for the event on the given day. Exported for unit testing. */
export function isRegistrationOpen(
  event: { status: string; registration_status: string; registration_deadline: string | null; start_date: string },
  todayIso: string,
): boolean {
  return event.status === 'reg_open'
    && event.registration_status === 'open'
    && todayIso.slice(0, 10) <= registrationCutoff(event);
}

/**
 * The registration types a member can choose here: competitor always, and
 * attendee or supporter when the organizers accept it. A type carrying a fee is
 * offered only once the event's sanction approval has enabled payment, so no
 * fee is ever taken for an event IFPA has not sanctioned. Exported for unit
 * testing.
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

type DeclaredGender = 'male' | 'female' | null;
function declaredGender(gender: string | null): DeclaredGender {
  return gender === 'male' || gender === 'female' ? gender : null;
}

const GENDER_NEEDED = 'This division needs a declared gender. Set your gender on your profile to enter it.';

/**
 * Whether an entry may play a division, by the division's gender part. Gender is
 * checked only between member profiles; a typed partner's eligibility is the
 * organizer's to check at check-in. Returns the refusal, or null when the entry
 * is eligible. Exported for unit testing.
 */
export function checkDivisionEligibility(
  division: { name: string; gender_eligibility: string | null },
  selfGender: string | null,
  partner: { kind: 'member'; gender: string | null } | { kind: 'named' } | null,
): string | null {
  const rule = division.gender_eligibility;
  if (rule !== 'women' && rule !== 'mixed') return null;
  const self = declaredGender(selfGender);
  if (self === null) return GENDER_NEEDED;
  if (rule === 'women' && self !== 'female') return `${division.name} is for women.`;
  if (partner?.kind === 'member') {
    const other = declaredGender(partner.gender);
    if (rule === 'women' && other !== 'female') {
      return `${division.name} needs a partner who has declared female on their profile.`;
    }
    if (rule === 'mixed' && (other === null || other === self)) {
      return `${division.name} needs one male and one female partner, as declared on your profiles.`;
    }
  }
  return null;
}

// A member typed by id or by profile URL, as the organizer and partner fields take it.
function memberKeyFrom(typed: string): string {
  return typed.trim().replace(/^.*\/members\//, '').replace(/\/+$/, '');
}

function findMemberByTypedKey(typed: string): MemberRow | null {
  const key = memberKeyFrom(typed);
  if (!key) return null;
  return (eventRegistrations.findMemberByKey.get(key, key) as MemberRow | undefined) ?? null;
}

// ── Sanction request and decision ─────────────────────────────────────────

const SANCTION_TASK_TYPE = 'sanction_request';
const SANCTION_GUIDELINES_PATH = '/ifpa/sanctioning-guidelines';
const SANCTION_LONG_TEXT_MAX = 2000;
const SANCTION_SHORT_TEXT_MAX = 500;
const SANCTION_DECISION_TEXT_MAX = 500;
const SANCTION_TIER_NOTE = 'Requesting sanction takes a Tier 2 or Tier 3 membership.';
const SANCTION_SELF_DECIDE =
  'You organize this event, so you cannot decide its sanction request. Another administrator must decide.';
const SANCTION_TIER_LAPSED =
  'The organizer who sent this request no longer holds Tier 2 or Tier 3, so it cannot be approved. Reject it with a reason.';
const SANCTION_ALREADY_IN = 'This event\'s sanction request is already waiting for review.';
const SANCTION_ALREADY_GRANTED = 'This event is already sanctioned.';

const YES_NO = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;
const FREQUENCIES = [
  { value: 'first_time', label: 'First time' },
  { value: 'annual', label: 'Annually' },
  { value: 'occasional', label: 'Occasionally' },
] as const;
const IN_PLACE = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'not_needed', label: 'Not needed' },
] as const;

function choices(options: ReadonlyArray<{ value: string; label: string }>, selected: string): ChoiceView[] {
  return options.map((o) => ({ value: o.value, label: o.label, checked: o.value === selected }));
}

function labelOf(options: ReadonlyArray<{ value: string; label: string }>, value: string | null): string {
  return options.find((o) => o.value === value)?.label ?? 'Not answered';
}

export function emptySanctionForm(): SanctionFormValues {
  return {
    attest: false, deviates: '', deviations: '', prizeMoney: '', prizeTotal: '', prizeCurrency: 'USD',
    entryFeeIncludes: '', frequency: '', yearsHeld: '', expectedPlayers: '', expectedSpectators: '',
    permits: '', insurance: '', justification: '',
  };
}

// A revised request starts from what the organizer sent last time.
function sanctionRowToForm(event: EventRow): SanctionFormValues {
  if (event.sanction_status !== 'rejected') return emptySanctionForm();
  return {
    attest: false,
    deviates: event.sanction_deviations ? 'yes' : 'no',
    deviations: event.sanction_deviations ?? '',
    prizeMoney: event.prize_money_total_cents !== null ? 'yes' : 'no',
    prizeTotal: centsToInput(event.prize_money_total_cents),
    prizeCurrency: event.prize_money_currency ?? 'USD',
    entryFeeIncludes: event.sanction_entry_fee_includes ?? '',
    frequency: event.sanction_event_frequency ?? '',
    yearsHeld: event.sanction_years_held ?? '',
    expectedPlayers: event.sanction_expected_players === null ? '' : String(event.sanction_expected_players),
    expectedSpectators: event.sanction_expected_spectators === null ? '' : String(event.sanction_expected_spectators),
    permits: event.sanction_permits ?? '',
    insurance: event.sanction_insurance ?? '',
    justification: event.sanction_justification ?? '',
  };
}

interface SanctionAnswers {
  justification: string | null;
  deviations: string | null;
  entryFeeIncludes: string | null;
  frequency: string;
  yearsHeld: string | null;
  expectedPlayers: number;
  expectedSpectators: number | null;
  permits: string;
  insurance: string;
  prizeTotalCents: number | null;
  prizeCurrency: string | null;
}

function hasFees(event: { competitor_fee_cents: number | null; attendee_fee_cents: number | null }): boolean {
  return event.competitor_fee_cents !== null || event.attendee_fee_cents !== null;
}

function readCount(raw: string, field: string, required: boolean, fieldErrors: Record<string, string>): number | null {
  const typed = raw.trim();
  if (typed === '') {
    if (required) fieldErrors[field] = 'Enter a whole number, such as 40.';
    return null;
  }
  if (!/^\d{1,6}$/.test(typed)) {
    fieldErrors[field] = 'Enter a whole number, such as 40.';
    return null;
  }
  return Number(typed);
}

function boundedText(
  raw: string, shape: 'single_line' | 'multi_line', field: string, max: number,
  fieldErrors: Record<string, string>,
): string {
  const text = cleanText(raw, shape, field, fieldErrors);
  if (text.length > max) fieldErrors[field] = `Keep this under ${max} characters.`;
  return text;
}

/**
 * Check the request form against the event and its divisions, recording each
 * refusal by field. Prize money is consistent with the divisions: a yes needs a
 * division that offers it, and a no is refused while one does.
 */
function readSanctionForm(
  values: SanctionFormValues,
  event: EventRow,
  divisions: DivisionRow[],
  fieldErrors: Record<string, string>,
): SanctionAnswers {
  if (!values.attest) fieldErrors.attest = 'Tick the box to agree to the sanctioning attestation.';

  let deviations: string | null = null;
  if (values.deviates !== 'yes' && values.deviates !== 'no') {
    fieldErrors.deviates = 'Say whether the event differs from the official formats and judging systems.';
  } else if (values.deviates === 'yes') {
    deviations = boundedText(values.deviations, 'multi_line', 'deviations', SANCTION_LONG_TEXT_MAX, fieldErrors);
    if (!deviations && !fieldErrors.deviations) fieldErrors.deviations = 'Say where the event differs.';
  }

  const prizeDivisions = divisions.filter((d) => d.offers_prize_money === 1).length;
  let prizeTotalCents: number | null = null;
  let prizeCurrency: string | null = null;
  if (values.prizeMoney !== 'yes' && values.prizeMoney !== 'no') {
    fieldErrors.prize_money = 'Say whether the event offers prize money.';
  } else if (values.prizeMoney === 'yes') {
    prizeTotalCents = readFee(values.prizeTotal, 'prize_total', fieldErrors);
    if (prizeTotalCents === null && !fieldErrors.prize_total) fieldErrors.prize_total = 'Enter the total prize money.';
    const currency = values.prizeCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) fieldErrors.prize_currency = 'Enter a three-letter currency code, such as USD.';
    else prizeCurrency = currency;
    if (prizeDivisions === 0) {
      fieldErrors.prize_money = 'Mark at least one division as offering prize money on the manage page.';
    }
  } else if (prizeDivisions > 0) {
    fieldErrors.prize_money = 'A division offers prize money. Choose yes, or change that division on the manage page.';
  }

  const entryFeeIncludes = boundedText(values.entryFeeIncludes, 'single_line', 'entry_fee_includes', SANCTION_SHORT_TEXT_MAX, fieldErrors);

  let yearsHeld: string | null = null;
  if (!FREQUENCIES.some((f) => f.value === values.frequency)) {
    fieldErrors.frequency = 'Say how often the event is held.';
  } else if (values.frequency === 'annual') {
    yearsHeld = boundedText(values.yearsHeld, 'single_line', 'years_held', SANCTION_SHORT_TEXT_MAX, fieldErrors);
    if (!yearsHeld && !fieldErrors.years_held) fieldErrors.years_held = 'List the years the event has been held.';
  }

  const expectedPlayers = readCount(values.expectedPlayers, 'expected_players', true, fieldErrors);
  const expectedSpectators = readCount(values.expectedSpectators, 'expected_spectators', false, fieldErrors);

  if (!IN_PLACE.some((o) => o.value === values.permits)) fieldErrors.permits = 'Say whether permits are in place.';
  if (!IN_PLACE.some((o) => o.value === values.insurance)) fieldErrors.insurance = 'Say whether insurance is in place.';

  let justification: string | null = null;
  if (hasFees(event)) {
    justification = boundedText(values.justification, 'multi_line', 'justification', SANCTION_LONG_TEXT_MAX, fieldErrors);
    if (!justification && !fieldErrors.justification) {
      fieldErrors.justification = 'Explain the registration fees you have set.';
    }
  }

  return {
    justification: justification || null,
    deviations: deviations || null,
    entryFeeIncludes: entryFeeIncludes || null,
    frequency: values.frequency,
    yearsHeld: yearsHeld || null,
    expectedPlayers: expectedPlayers ?? 0,
    expectedSpectators,
    permits: values.permits,
    insurance: values.insurance,
    prizeTotalCents,
    prizeCurrency,
  };
}

function sameSanctionAnswers(event: EventRow, a: SanctionAnswers): boolean {
  return event.sanction_justification === a.justification
    && event.sanction_deviations === a.deviations
    && event.sanction_entry_fee_includes === a.entryFeeIncludes
    && event.sanction_event_frequency === a.frequency
    && event.sanction_years_held === a.yearsHeld
    && event.sanction_expected_players === a.expectedPlayers
    && event.sanction_expected_spectators === a.expectedSpectators
    && event.sanction_permits === a.permits
    && event.sanction_insurance === a.insurance
    && event.prize_money_total_cents === a.prizeTotalCents
    && event.prize_money_currency === a.prizeCurrency;
}

function divisionGameName(d: DivisionRow, games: GameRow[]): string {
  return d.game_id ? games.find((g) => g.id === d.game_id)?.name ?? d.name : d.custom_game_name ?? d.name;
}

/**
 * Each competition category (a game at one entry size) that lacks a Women's or
 * an Intermediate division, worded as the organizer and the administrator read
 * it, or an empty list. A historical division with no stated parts belongs to no
 * category. Exported for unit testing.
 */
export function missingSanctionDivisions(
  divisions: Array<Pick<DivisionRow, 'game_id' | 'custom_game_name' | 'discipline_category' | 'team_type' | 'gender_eligibility' | 'division_class' | 'name'>>,
  gameName: (d: Pick<DivisionRow, 'game_id' | 'custom_game_name' | 'name'>) => string,
): string[] {
  const categories = new Map<string, { label: string; women: boolean; intermediate: boolean }>();
  for (const d of divisions) {
    if (!d.gender_eligibility || !d.division_class) continue;
    const key = `${d.game_id ?? `custom:${d.discipline_category}:${(d.custom_game_name ?? '').toLowerCase()}`}|${d.team_type}`;
    const label = `${d.team_type === 'doubles' ? 'Doubles' : 'Singles'} ${gameName(d)}`;
    const entry = categories.get(key) ?? { label, women: false, intermediate: false };
    if (d.gender_eligibility === 'women') entry.women = true;
    if (d.division_class === 'intermediate') entry.intermediate = true;
    categories.set(key, entry);
  }
  const missing: string[] = [];
  for (const c of categories.values()) {
    if (!c.women) missing.push(`Women's in ${c.label}`);
    if (!c.intermediate) missing.push(`Intermediate in ${c.label}`);
  }
  return missing;
}

function sanctionDivisionWarning(missing: string[]): string | null {
  if (missing.length === 0) return null;
  return `Sanctioned tournaments must offer a Women's and an Intermediate division in every competition category. Missing: ${missing.join('; ')}. You can still submit; an administrator decides.`;
}

// A reason is shown inside a sentence that supplies its own full stop.
function withoutClosingStop(text: string): string {
  return text.replace(/[.\s]+$/, '');
}

function sanctionStatusLine(event: EventRow): string {
  switch (event.sanction_status) {
    case 'pending': return 'Pending review by IFPA.';
    case 'approved': return 'Approved.';
    case 'rejected':
      return `Rejected: ${withoutClosingStop(event.sanction_decision_reason ?? '')}. Revise and resubmit when ready.`;
    default: return 'Not requested yet.';
  }
}

function decisionText(raw: string, required: boolean, missingMessage: string): string {
  const cleaned = sanitizeUserText(raw ?? '', 'multi_line');
  if (cleaned.status === 'invalid_encoding') throw new ValidationError(INVALID_TEXT_ENCODING_MESSAGE);
  const text = cleaned.text;
  if (required && text.length < 3) throw new ValidationError(missingMessage);
  if (text.length > SANCTION_DECISION_TEXT_MAX) {
    throw new ValidationError(`Keep it under ${SANCTION_DECISION_TEXT_MAX} characters.`);
  }
  return text;
}

function absoluteUrl(path: string): string {
  return `${config.publicBaseUrl.replace(/\/+$/, '')}${path}`;
}

export class EventService {
  listPublicUpcomingEvents(nowIso: string): PublicEventSummary[] {
    return runSqliteRead('listPublicUpcomingEvents', () => {
      const rows = publicEvents.listUpcoming.all(nowIso) as PublicEventSummaryRow[];
      return rows.map(toPublicEventSummary);
    });
  }

  listPublicArchiveYears(): number[] {
    return runSqliteRead('listPublicArchiveYears', () => {
      const rows = publicEvents.listArchiveYears.all() as Array<{ archive_year: number }>;
      return rows.map((row) => row.archive_year);
    });
  }

  listPublicCompletedEventsByYear(year: number): PublicCompletedEventSummary[] {
    assertArchiveYear(year);

    return runSqliteRead('listPublicCompletedEventsByYear', () => {
      const rows = publicEvents.listCompletedByYear.all(year) as PublicCompletedEventSummaryRow[];
      return rows.map(toPublicCompletedEventSummary);
    });
  }

  getPublicEventDetail(eventKey: string): PublicEventPage {
    const normalizedStoredTag = normalizePublicEventKeyToStoredTag(eventKey);
    const rows = runSqliteRead('getPublicEventDetail', () => {
      const eventRow = publicEvents.getByStandardTag.get(normalizedStoredTag) as PublicEventDetailRow | undefined;

      if (!eventRow) {
        throw new NotFoundError('Public event not found.', {
          field: 'eventKey',
          value: eventKey,
        });
      }

      const disciplineRows = publicEvents.listDisciplinesByEventId.all(eventRow.event_id) as PublicEventDisciplineRow[];
      const resultRows = publicEvents.listPublicResultRowsByEventId.all(eventRow.event_id) as PublicEventResultRow[];
      return { eventRow, disciplineRows, resultRows };
    });

    // The media block shows only when media carries the event's hashtag.
    const galleryHref = mediaService.getEntityGalleryHref(normalizedStoredTag);
    const media = galleryHref ? { galleryHref, buttonLabel: 'View Event Gallery' } : null;
    return toPublicEventPage(rows.eventRow, rows.disciplineRows, rows.resultRows, media);
  }

  /** The hand-authored featured card, or null once its event has finished.
   *
   *  The card's copy is written ahead of the event and reads in the future
   *  tense, so it is only true up to the day the event ends. Nothing about the
   *  card knows that on its own: it is a literal, and a literal cannot age. The
   *  dates it already carries are what decide, compared against the request's
   *  own day, so the card stops featuring the morning after the event without
   *  anyone editing this file. An event still running features on its last day.
   *
   *  This is only about when the card renders. Retiring a finished event from
   *  the page is not the same as archiving it: an event reaches the year
   *  archive by being an ordinary event row, which a promo for an external
   *  event is not. */
  private getFeaturedPromo(nowIso: string): FeaturedPromoCard | null {
    const promo = this.featuredPromoCard();
    return isFeaturedPromoCurrent(promo.endDate, nowIso) ? promo : null;
  }

  private featuredPromoCard(): FeaturedPromoCard {
    return {
      title: '45th IFPA World Footbag Championships 2026',
      href: 'https://www.footbag.jp/FootbagWorlds2026',
      ctaLabel: 'Official Website',
      description: "Asia's first World Footbag Championship will be in Japan in August!",
      startDate: '2026-08-10',
      endDate: '2026-08-15',
      city: 'Tsukuba',
      region: 'Ibaraki',
      country: 'Japan',
      external: true,
      imageUrl: loadSitePhotoUrl('japan_worlds_promo'),
      imageAlt: '45th IFPA World Footbag Championships 2026, Tsukuba, Japan official poster',
    };
  }

  getPublicEventsLandingPage(nowIso: string): PageViewModel<EventsLandingContent> {
    return {
      seo: { title: 'Events' },
      page: {
        sectionKey: 'events',
        pageKey: 'events_index',
        title: 'Footbag Events',
        intro: 'Tournaments, competitions, and gatherings from around the world.',
      },
      content: {
        featuredPromo: this.getFeaturedPromo(nowIso) ?? undefined,
        upcomingEvents: this.listPublicUpcomingEvents(nowIso),
        archiveYears: this.listPublicArchiveYears(),
        organizerLinks: { guidelinesHref: SANCTION_GUIDELINES_PATH },
      },
    };
  }

  getPublicEventsYearPage(year: number): PageViewModel<EventsYearContent> {
    const archiveYears = this.listPublicArchiveYears();
    const { previousYear, nextYear } = getAdjacentArchiveYears(archiveYears, year);

    return {
      seo: { title: `${year} Events` },
      page: {
        sectionKey: 'events',
        pageKey: 'events_year_archive',
        title: `Completed Events From ${year}`,
        intro: `Public events from ${year} that have already taken place. For events still to come, see upcoming events.`,
      },
      navigation: {
        siblings: {
          previous: previousYear !== null ? { label: String(previousYear), href: `/events/year/${previousYear}` } : undefined,
          next: nextYear !== null ? { label: String(nextYear), href: `/events/year/${nextYear}` } : undefined,
        },
      },
      content: {
        year,
        events: this.listPublicCompletedEventsByYear(year),
      },
    };
  }

  /**
   * The canonical event page. `viewer` is who is looking: a signed-in member also
   * sees each organizer's email, who is registered, and their own registration.
   */
  getPublicEventPage(
    eventKey: string,
    viewer: { isMember: boolean; memberId?: string } = { isMember: false },
    opts: { notice?: OutcomeNoticeView | null } = {},
  ): PageViewModel<EventDetailContent> {
    const detail = this.getPublicEventDetail(eventKey);
    const isUpcoming = detail.event.status === 'reg_open' || detail.event.status === 'closed';
    if (isUpcoming) {
      const counts = new Map(
        (runSqliteRead('countEventRegistrations', () =>
          eventRegistrations.countConfirmedByDivision.all(detail.event.eventId)) as Array<{ discipline_id: string; registered: number }>)
          .map((r) => [r.discipline_id, r.registered]),
      );
      for (const d of detail.disciplines) {
        if (!d.isAggregateStanding) d.registeredLabel = `${counts.get(d.disciplineId) ?? 0} registered`;
      }
    }
    const registration = isUpcoming && viewer.isMember && viewer.memberId
      ? this.registrationBlock(eventKey, viewer.memberId)
      : null;
    const organizerRows = runSqliteRead('listEventPageOrganizers', () =>
      eventOrganizers.listForEventPage.all(detail.event.eventId) as Array<{
        member_id: string; display_name: string; login_email: string | null;
      }>);
    const organizers: EventOrganizerView[] = organizerRows.map((r) => (
      viewer.isMember && r.login_email
        ? { name: r.display_name, contactEmail: r.login_email }
        : { name: r.display_name }
    ));
    const year = detail.event.startDate.slice(0, 4);
    // The back link names the page that lists this event: a year page lists
    // completed events only, so an event still to come belongs to the events landing.
    const backLink = detail.event.status === 'completed'
      ? { label: `Back to Completed Events From ${year}`, href: `/events/year/${year}` }
      : { label: 'Back to Footbag Events', href: '/events' };
    return {
      seo: {
        title: detail.event.standardTagDisplay,
        // Composed from the event's own facts, so a search result names what,
        // when and where whether or not the organizer wrote a description.
        description: `${detail.event.title}, ${eventDatesPhrase(detail.event.startDate, detail.event.endDate)}, `
          + `${[detail.event.city, detail.event.region, detail.event.country].filter((p) => p).join(', ')}.`,
      },
      page: { sectionKey: 'events', pageKey: 'event_detail', title: detail.event.title },
      navigation: {
        contextLinks: [backLink],
      },
      content: { ...detail, organizers, registration, notice: opts.notice ?? null },
    };
  }

  // The event page's registration section for a signed-in member.
  private registrationBlock(eventKey: string, memberId: string): EventRegistrationBlock {
    const event = this.findEventByKey(eventKey) as EventRow;
    const base = `/events/${encodeURIComponent(eventKey)}`;
    const today = new Date().toISOString();
    const own = eventRegistrations.findForMember.get(event.id, memberId) as OwnRegistrationRow | undefined;
    const holds = own && own.status !== 'canceled';
    const open = isRegistrationOpen(event, today) && offeredRegistrationTypes(event).length > 0;
    const canRegister = !holds && open;

    const registrants = eventRegistrations.listConfirmedForEvent.all(event.id) as Array<{
      id: string; registration_type: RegistrationType; display_name: string; slug: string;
    }>;
    const entriesByRegistration = new Map<string, RegistrationEntryView[]>();
    for (const row of eventRegistrations.listConfirmedSelectionsForEvent.all(event.id) as Array<
      SelectionRow & { registration_id: string }
    >) {
      const list = entriesByRegistration.get(row.registration_id) ?? [];
      list.push(toEntryView({ ...row, enters_as_amateur: 0 }));
      entriesByRegistration.set(row.registration_id, list);
    }

    let mine: OwnRegistrationView | null = null;
    if (own && holds) {
      const selections = eventRegistrations.listSelectionsForRegistration.all(own.id) as SelectionRow[];
      mine = {
        typeLabel: REGISTRATION_TYPE_LABELS[own.registration_type],
        statusLabel: own.status === 'pending' ? 'Waiting for payment' : null,
        entries: selections.map(toEntryView),
        tshirtSize: own.tshirt_size,
        withdrawAction: today.slice(0, 10) <= registrationCutoff(event) ? `${base}/withdraw` : null,
        completePaymentHref: awaitsCheckout(own) && open ? `${base}/register` : null,
      };
    }

    return {
      registerHref: canRegister ? `${base}/register` : null,
      closedNote: !holds && !canRegister ? REGISTRATION_NOT_OPEN : null,
      mine,
      registrants: registrants.map((r) => ({
        name: r.display_name,
        profileHref: `/members/${encodeURIComponent(r.slug)}`,
        typeLabel: REGISTRATION_TYPE_LABELS[r.registration_type],
        entries: entriesByRegistration.get(r.id) ?? [],
      })),
      registrantsHeading: `Registered Members (${registrants.length})`,
    };
  }

  /**
   * The registration form for a signed-in member, or why it is not on offer:
   * they already hold a registration, or the event is not taking them now.
   */
  getRegisterPage(
    eventKey: string,
    memberId: string,
    form?: { input: RegistrationInput; message: string },
  ): RegisterPageResult {
    const event = this.requirePublicEvent(eventKey);
    const own = eventRegistrations.findForMember.get(event.id, memberId) as OwnRegistrationRow | undefined;
    const pending = awaitsCheckout(own);
    if (own && own.status !== 'canceled' && !pending) {
      return { branch: 'already_registered', message: `You are already registered for ${event.title}.` };
    }
    const types = this.typesFor(event, own);
    if (!isRegistrationOpen(event, new Date().toISOString()) || types.length === 0) {
      return { branch: 'not_open', message: REGISTRATION_NOT_OPEN };
    }
    const self = eventRegistrations.findMemberByKey.get(memberId, memberId) as MemberRow | undefined;
    const base = `/events/${encodeURIComponent(eventKey)}`;
    // A registration waiting at checkout comes back as it was submitted, so
    // submitting it unchanged returns to that checkout.
    const input = form?.input ?? (pending ? heldRegistrationInput(own) : undefined);
    const charged = types.filter((t) => this.chargeFor(event, own, t) !== null);
    const typeLabel = (t: RegistrationType): string => {
      const fee = this.chargeFor(event, own, t);
      return fee === null ? REGISTRATION_TYPE_LABELS[t] : `${REGISTRATION_TYPE_LABELS[t]} (${formatFee(fee, event.currency)})`;
    };
    const divisions = (eventWrites.listDivisions.all(event.id) as DivisionRow[]);
    const chosenType = input?.type ?? types[0];
    const tshirt = input?.tshirtSize ?? '';
    const page: PageViewModel<RegisterEventContent> = {
      seo: { title: `Register for ${event.title}`, noindex: true },
      page: { sectionKey: 'events', pageKey: 'event_register', title: `Register for ${event.title}` },
      navigation: { contextLinks: [{ label: `Back to ${event.title}`, href: base }] },
      content: {
        formAction: `${base}/register`,
        cancelHref: base,
        eventDates: eventDatesPhrase(event.start_date, event.end_date),
        typeChoices: types.length > 1
          ? types.map((t) => ({ value: t, label: typeLabel(t), checked: t === chosenType }))
          : null,
        impliedTypeLabel: types.length === 1 ? typeLabel(types[0]) : null,
        impliedType: types.length === 1 ? types[0] : null,
        showDivisions: types.includes('competitor') && divisions.length > 0,
        divisions: divisions.map((d) => {
          const partner = input?.partners.find((p) => p.divisionId === d.id);
          const gated = d.gender_eligibility === 'women' || d.gender_eligibility === 'mixed';
          return {
            id: d.id,
            name: d.name,
            checked: input?.divisionIds.includes(d.id) ?? false,
            isDoubles: d.team_type === 'doubles',
            partnerKey: partner?.key ?? '',
            partnerName: partner?.name ?? '',
            offersPrizeMoney: d.offers_prize_money === 1,
            amateur: input?.amateurIds.includes(d.id) ?? false,
            genderWarning: gated && declaredGender(self?.gender ?? null) === null ? GENDER_NEEDED : null,
            profileHref: gated && self ? `/members/${encodeURIComponent(self.slug)}` : null,
          };
        }),
        tshirtOptions: event.is_tshirt_size_collected === 1
          ? [{ value: '', label: 'Choose a size', selected: tshirt === '' },
            ...TSHIRT_SIZES.map((s) => ({ value: s, label: s, selected: s === tshirt }))]
          : null,
        errorMessage: form?.message ?? null,
        pendingNote: pending ? REGISTRATION_AWAITS_PAYMENT : null,
        // Every offered type is paid at checkout, so the button says where it goes.
        submitLabel: charged.length === types.length ? 'Continue to Payment' : 'Register',
      },
    };
    return { branch: 'form', page };
  }

  // The types offered to this member: all the event offers, or only the type
  // they already paid for when they register again after withdrawing it.
  private typesFor(event: EventRow, own: OwnRegistrationRow | undefined): RegistrationType[] {
    const paid = paidTypeHeld(own);
    return offeredRegistrationTypes(event).filter((t) => paid === null || t === paid);
  }

  // What registering as this type charges now: its fee, unless already paid.
  private chargeFor(event: EventRow, own: OwnRegistrationRow | undefined, type: RegistrationType): number | null {
    return paidTypeHeld(own) === type ? null : registrationFeeCents(event, type);
  }

  /**
   * Register the member for the event, or register them again after a
   * withdrawal. A free registration is confirmed at once and the member is
   * emailed its details. A paid one is written pending and the member is sent
   * to checkout; its payment's webhook confirms it.
   */
  async register(memberId: string, eventKey: string, input: RegistrationInput): Promise<RegisterResult> {
    const event = this.requirePublicEvent(eventKey);
    const own = eventRegistrations.findForMember.get(event.id, memberId) as OwnRegistrationRow | undefined;
    const types = this.typesFor(event, own);
    const pending = awaitsCheckout(own);
    if (own && own.status !== 'canceled' && !pending) {
      // Only the member registers themselves, so a held registration is their own
      // first submit when it says what this one says.
      const submittedType = types.length === 1 ? types[0] : input.type;
      const held = eventRegistrations.listSelectionsForRegistration.all(own.id) as SelectionRow[];
      const submittedDivisions = submittedType === 'competitor' ? new Set(input.divisionIds) : new Set<string>();
      const same = own.registration_type === submittedType
        && held.length === submittedDivisions.size
        && held.every((s) => submittedDivisions.has(s.discipline_id));
      if (same) return { branch: 'own_repeat', eventTitle: event.title };
      throw new ValidationError(`You are already registered for ${event.title}. To change your entries, withdraw and register again.`);
    }
    const now = new Date().toISOString();
    if (!isRegistrationOpen(event, now) || types.length === 0) throw new ValidationError(REGISTRATION_NOT_OPEN);

    const type = (types.length === 1 ? types[0] : types.find((t) => t === input.type)) as RegistrationType | undefined;
    if (!type) throw new ValidationError('Choose how you are registering.');
    let tshirtSize: string | null = null;
    if (event.is_tshirt_size_collected === 1 && input.tshirtSize !== '') {
      if (!TSHIRT_SIZES.includes(input.tshirtSize)) throw new ValidationError('Choose a t-shirt size from the list.');
      tshirtSize = input.tshirtSize;
    }

    const self = eventRegistrations.findMemberByKey.get(memberId, memberId) as MemberRow | undefined;
    if (!self) throw new NotFoundError('Member not found.');
    const entries: Array<{ division: DivisionRow; partnerMemberId: string | null; partnerName: string | null; amateur: boolean; view: RegistrationEntryView }> = [];
    if (type === 'competitor') {
      const divisions = eventWrites.listDivisions.all(event.id) as DivisionRow[];
      const chosen = divisions.filter((d) => input.divisionIds.includes(d.id));
      if (chosen.length === 0) throw new ValidationError('Choose at least one division to enter.');
      for (const division of chosen) {
        let partner: Parameters<typeof checkDivisionEligibility>[2] = null;
        let partnerMember: MemberRow | null = null;
        let partnerName: string | null = null;
        if (division.team_type === 'doubles') {
          const typed = input.partners.find((p) => p.divisionId === division.id) ?? { key: '', name: '' };
          const hasKey = typed.key.trim() !== '';
          const cleanName = sanitizeUserText(typed.name, 'single_line');
          const name = cleanName.status === 'ok' ? cleanName.text : '';
          if (hasKey === (name !== '')) {
            throw new ValidationError(`${division.name} is played in doubles: enter your partner's member id or profile URL, or their name if they are not a member.`);
          }
          if (hasKey) {
            partnerMember = findMemberByTypedKey(typed.key);
            if (!partnerMember) throw new ValidationError(`No member has the id or profile URL you gave as your ${division.name} partner.`);
            if (partnerMember.id === memberId) throw new ValidationError(`Your ${division.name} partner has to be someone else.`);
            partner = { kind: 'member', gender: partnerMember.gender };
          } else {
            if (name.length > PARTNER_NAME_MAX) throw new ValidationError(`Your partner's name must be ${PARTNER_NAME_MAX} characters or fewer.`);
            partnerName = name;
            partner = { kind: 'named' };
          }
        }
        const refusal = checkDivisionEligibility(division, self.gender, partner);
        if (refusal) throw new ValidationError(refusal);
        const amateur = division.offers_prize_money === 1 && input.amateurIds.includes(division.id);
        entries.push({
          division,
          partnerMemberId: partnerMember?.id ?? null,
          partnerName,
          amateur,
          view: {
            divisionName: division.name,
            partnerName: partnerMember?.display_name ?? partnerName,
            partnerHref: null,
            isAmateur: amateur,
          },
        });
      }
    }

    const fee = this.chargeFor(event, own, type);
    if (fee !== null) {
      const writeEntries = (registrationId: string, at: string): void => {
        for (const e of entries) {
          eventRegistrations.insertSelection.run(
            `rsel_${newId()}`, at, memberId, at, memberId,
            registrationId, e.division.id, e.partnerMemberId, e.partnerName, e.amateur ? 1 : 0,
          );
        }
      };
      const checkout = await paymentService.startEventRegistrationPayment({
        memberId,
        amountCents: fee,
        currency: event.currency,
        descriptor: `Event Registration: ${event.title} (${REGISTRATION_TYPE_LABELS[type]})`,
        returnTo: `/events/${encodeURIComponent(eventKey)}`,
        openPaymentId: pending ? own.payment_id : null,
        samePurchase: pending && sameRegistration(own, type, entries, tshirtSize),
        writeRegistration: (paymentId, at) => {
          // Read again inside the transaction: the release of an earlier
          // checkout, or an overlapping submit, may have moved the row.
          const row = eventRegistrations.findForMember.get(event.id, memberId) as OwnRegistrationRow | undefined;
          if (row) {
            if (eventRegistrations.reactivateWithPayment.run(type, tshirtSize, at, paymentId, at, memberId, row.id).changes === 0) {
              return false;
            }
            eventRegistrations.deleteSelections.run(row.id);
            writeEntries(row.id, at);
          } else {
            const registrationId = `reg_${newId()}`;
            eventRegistrations.insertWithPayment.run(
              registrationId, at, memberId, at, memberId,
              event.id, memberId, at, type, tshirtSize, paymentId,
            );
            writeEntries(registrationId, at);
          }
          return true;
        },
        findOpenPaymentId: () => {
          const row = eventRegistrations.findForMember.get(event.id, memberId) as OwnRegistrationRow | undefined;
          return awaitsCheckout(row) ? row.payment_id : null;
        },
      });
      return { branch: 'checkout', redirectUrl: checkout.redirectUrl, eventTitle: event.title };
    }

    // A free type chosen in place of a registration waiting at checkout
    // releases that checkout first, as any changed registration does.
    if (pending) {
      if (!await paymentService.closeEventRegistrationCheckout(own.payment_id)) {
        throw new ConflictError(EVENT_CHECKOUT_UNSETTLED);
      }
    }

    const registrationId = own?.id ?? `reg_${newId()}`;
    transaction(() => {
      if (pending) {
        paymentService.releaseEventRegistrationCheckoutInTx(own.payment_id, memberId);
      }
      if (own) {
        eventRegistrations.reactivate.run(type, 'confirmed', tshirtSize, now, now, memberId, own.id);
        eventRegistrations.deleteSelections.run(own.id);
      } else {
        eventRegistrations.insert.run(
          registrationId, now, memberId, now, memberId,
          event.id, memberId, now, type, 'confirmed', tshirtSize,
        );
      }
      for (const e of entries) {
        eventRegistrations.insertSelection.run(
          `rsel_${newId()}`, now, memberId, now, memberId,
          registrationId, e.division.id, e.partnerMemberId, e.partnerName, e.amateur ? 1 : 0,
        );
      }
      emailService.sendToMember({
        template: 'event_registration_confirmed',
        params: {
          eventTitle: event.title,
          eventDates: eventDatesPhrase(event.start_date, event.end_date),
          registrationSummary: registrationSummary(type, entries.map((e) => e.view), tshirtSize),
        },
        memberId,
        idempotencyKey: `event-registration:${registrationId}:${now}`,
      });
    });
    return { branch: 'registered', eventTitle: event.title };
  }

  /**
   * Withdraw the member's own registration, after confirmation, up to the
   * registration cutoff. Every current organizer is told.
   */
  async withdrawRegistration(
    memberId: string, eventKey: string, confirmed: boolean,
  ): Promise<{ branch: 'needs_confirmation'; eventTitle: string; isPaid: boolean }
    | { branch: 'withdrawn' | 'own_repeat' | 'not_registered'; eventTitle: string }> {
    const event = this.requirePublicEvent(eventKey);
    const own = eventRegistrations.findForMember.get(event.id, memberId) as OwnRegistrationRow | undefined;
    if (!own || own.status === 'canceled') {
      // The row itself says whether the member's own withdrawal is what left it canceled.
      const repeat = own?.cancel_reason === WITHDRAWN_BY_MEMBER;
      return { branch: repeat ? 'own_repeat' : 'not_registered', eventTitle: event.title };
    }
    const now = new Date().toISOString();
    if (now.slice(0, 10) > registrationCutoff(event)) {
      throw new ValidationError('Registration has closed. To withdraw now, contact an organizer.');
    }
    if (!confirmed) {
      return { branch: 'needs_confirmation', eventTitle: event.title, isPaid: own.payment_status === 'succeeded' };
    }

    // A registration waiting at checkout ends that checkout first. Once the
    // provider holds it expired, its payment closes with the withdrawal; a
    // checkout the member paid meanwhile stands and settles by its webhook,
    // leaving this registration withdrawn.
    const releasePayment = awaitsCheckout(own) && await paymentService.closeEventRegistrationCheckout(own.payment_id);

    const self = eventRegistrations.findMemberByKey.get(memberId, memberId) as MemberRow | undefined;
    const organizers = eventOrganizers.listForEvent.all(event.id) as Array<{ member_id: string }>;
    transaction(() => {
      eventRegistrations.cancelOwn.run(WITHDRAWN_BY_MEMBER, now, now, memberId, own.id);
      if (releasePayment && own.payment_id) {
        paymentService.releaseEventRegistrationCheckoutInTx(own.payment_id, memberId);
      }
      appendAuditEntry({
        actionType: 'event.registration_withdrawn',
        actorType: 'member',
        actorMemberId: memberId,
        entityType: 'event',
        entityId: event.id,
        metadata: { registration_id: own.id },
      });
      for (const o of organizers) {
        emailService.sendToMember({
          template: 'event_registration_withdrawn',
          params: {
            memberName: self?.display_name ?? 'A member',
            eventTitle: event.title,
            eventDates: eventDatesPhrase(event.start_date, event.end_date),
          },
          memberId: o.member_id,
          idempotencyKey: `event-withdrawal:${own.id}:${now}:${o.member_id}`,
        });
      }
    });
    return { branch: 'withdrawn', eventTitle: event.title };
  }

  /** Stop or resume online registration, without moving the event's status. */
  setRegistrationStatus(actorMemberId: string, eventKey: string, open: boolean): { branch: 'changed' | 'own_repeat' | 'already_held'; isOpen: boolean } {
    const event = this.requireOrganizedEvent(eventKey, actorMemberId);
    if (event.status !== 'reg_open') {
      throw new ValidationError('Online registration can be stopped or resumed only while the event is open for registration.');
    }
    const after = open ? 'open' : 'closed';
    if (event.registration_status === after) {
      const own = findStandingOwnAct(
        actorMemberId, 'event.registration_status_changed', 'event.registration_status_changed', 'event', event.id,
      );
      return { branch: own ? 'own_repeat' : 'already_held', isOpen: open };
    }
    const now = new Date().toISOString();
    transaction(() => {
      eventWrites.setRegistrationStatus.run(after, now, actorMemberId, event.id);
      appendAuditEntry({
        actionType: 'event.registration_status_changed',
        actorType: 'member',
        actorMemberId,
        entityType: 'event',
        entityId: event.id,
        metadata: { before: event.registration_status, after },
      });
    });
    return { branch: 'changed', isOpen: open };
  }

  // ── Organizer surfaces ─────────────────────────────────────────────────────

  /** The creation form, empty or carrying what was typed. */
  getCreateEventPage(
    actorMemberId: string,
    actorSlug: string,
    form?: { values: EventFormValues; fieldErrors?: Record<string, string>; message?: string; tone?: 'no' | 'info' },
  ): PageViewModel<CreateEventContent> {
    const values = form?.values ?? emptyEventForm();
    return {
      seo: { title: 'Create an Event', noindex: true },
      page: { sectionKey: 'events', pageKey: 'events_create', title: 'Create an Event' },
      content: {
        formAction: '/events/create',
        cancelHref: `/members/${encodeURIComponent(actorSlug)}`,
        values,
        fieldErrors: form?.fieldErrors ?? {},
        errorMessage: form?.message ?? null,
        errorTone: form?.tone ?? 'no',
        canChooseSanctioned: isTier2Plus(actorMemberId),
        isSanctioned: values.eventType === 'sanctioned',
        countryOptions: locationPickers(values.country, '').countryOptions,
        guidelinesHref: SANCTION_GUIDELINES_PATH,
      },
    };
  }

  /**
   * Create an event, its permanent hashtag and the creator's organizer row in
   * one transaction. A free event opens for registration at once and emails its
   * organizers; a sanctioned one waits in draft for its sanction request.
   */
  createEvent(actorMemberId: string, values: EventFormValues): CreateEventResult {
    if (!hasTier1Benefits(actorMemberId)) {
      throw new ForbiddenError('Creating an event is a Tier 1 benefit.');
    }
    const fieldErrors: Record<string, string> = {};
    const isSanctioned = values.eventType === 'sanctioned';
    if (values.eventType !== 'free' && values.eventType !== 'sanctioned') {
      fieldErrors.event_type = 'Choose a free event or a sanctioned event.';
    } else if (isSanctioned && !isTier2Plus(actorMemberId)) {
      fieldErrors.event_type = 'A sanctioned event, and any registration fee, takes a Tier 2 or Tier 3 membership.';
    }
    const details = readEventDetails(values, isSanctioned, fieldErrors);

    // A typed hashtag folds by the one rule; left blank, it is made from the
    // title, without the event's own year, which the hashtag already carries.
    const year = details.startDate.slice(0, 4);
    const typedSlug = values.slug.trim();
    const typedCheck = typedSlug ? checkTypedSlug(typedSlug, 'event') : null;
    let slug = '';
    if (typedCheck) {
      if (typedCheck.ok) slug = typedCheck.slug;
      else fieldErrors.slug = typedCheck.message;
    } else {
      slug = suggestEventSlug(details.title, year);
      const madeCheck = slug ? checkTypedSlug(slug, 'event') : null;
      if (!madeCheck || !madeCheck.ok) {
        slug = '';
        if (!fieldErrors.title) fieldErrors.slug = 'We could not make a hashtag from the title. Please enter one.';
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Please fix the errors below.', { fieldErrors });
    }

    const tagNormalized = `#event_${year}_${slug}`;
    const eventKey = tagNormalized.slice(1);

    const existing = mediaTags.findTagByNormalized.get(tagNormalized) as { id: string } | undefined;
    if (existing) {
      // The creator's own first submit made this event: report it rather than a
      // collision. Any field that differs makes it a different event.
      const own = eventWrites.findByStandardTag.get(tagNormalized) as EventRow | undefined;
      if (
        own
        && eventOrganizers.isCurrentOrganizer.get(own.id, actorMemberId)
        && findOwnLatestAudit(actorMemberId, 'event.created', 'event', own.id)
        && own.title === details.title
        && own.start_date === details.startDate
        && own.end_date === details.endDate
      ) {
        return { branch: 'own_repeat', eventKey };
      }
      return { branch: 'tag_conflict', tagNormalized, suggestion: collisionSuggestion(year, slug, details.city) };
    }

    // Last before creating, so the creator is never asked to confirm a hashtag
    // the next submit would refuse. Capitals alone are lowered silently.
    if (typedSlug && slug !== typedSlug.toLowerCase()) {
      return { branch: 'slug_folded', slug };
    }

    const now = new Date().toISOString();
    const tagId = `tag_${newId()}`;
    const eventId = `evt_${newId()}`;
    const status = isSanctioned ? 'draft' : 'reg_open';
    try {
      transaction(() => {
        mediaTags.insertStandardTag.run(
          tagId, now, actorMemberId, now, actorMemberId,
          tagNormalized, tagNormalized, 'event',
        );
        eventWrites.insertEvent.run(
          eventId, now, actorMemberId, now, actorMemberId,
          details.title, details.description, details.startDate, details.endDate,
          details.city, details.region, details.country,
          details.registrationDeadline, details.tshirtSizeCollected ? 1 : 0,
          details.attendeeRegistrationOpen ? 1 : 0,
          status, isSanctioned ? null : now, 'USD',
          details.competitorFeeCents, details.attendeeFeeCents,
          tagId,
        );
        eventOrganizers.insertRow.run(
          `eorg_${newId()}`, now, actorMemberId, now, actorMemberId,
          eventId, actorMemberId, 'organizer', now,
        );
        appendAuditEntry({
          actionType: 'event.created',
          actorType: 'member',
          actorMemberId,
          entityType: 'event',
          entityId: eventId,
          metadata: { tag_normalized: tagNormalized, status, sanctioned_path: isSanctioned },
        });
        // A free event is open the moment it exists, so its organizers are told
        // now; a sanctioned one is announced when its sanction is approved.
        if (!isSanctioned) {
          emailService.sendToMember({
            template: 'event_created_confirmation',
            params: { eventTitle: details.title, eventDates: eventDatesPhrase(details.startDate, details.endDate) },
            memberId: actorMemberId,
            idempotencyKey: `event-created:${eventId}:${actorMemberId}`,
          });
        }
      });
    } catch (err) {
      if ((err as { code?: string })?.code === 'SQLITE_CONSTRAINT_UNIQUE'
        && mediaTags.findTagByNormalized.get(tagNormalized)) {
        return { branch: 'tag_conflict', tagNormalized, suggestion: collisionSuggestion(year, slug, details.city) };
      }
      throw err;
    }
    return { branch: 'created', eventKey, isOpen: !isSanctioned };
  }

  /**
   * The organizers' page for one event: its details form, its divisions with the
   * division form, and its organizers. `query` carries the division form's
   * chosen game, or the division being edited, since choosing a game is what
   * decides which parts the form offers.
   */
  getManageEventPage(
    eventKey: string,
    viewerMemberId: string,
    query: { game?: string; customName?: string; customDiscipline?: string; editDivision?: string } = {},
    opts: { notice?: OutcomeNoticeView | null; detailsForm?: { values: EventFormValues; fieldErrors: Record<string, string>; message: string } } = {},
  ): PageViewModel<ManageEventContent> {
    const event = this.requireOrganizedEvent(eventKey, viewerMemberId);
    const base = `/events/${encodeURIComponent(event.tag_normalized.slice(1))}`;
    const divisions = eventWrites.listDivisions.all(event.id) as DivisionRow[];
    const games = eventWrites.listGames.all() as GameRow[];
    const organizers = eventOrganizers.listForEvent.all(event.id) as Array<{
      member_id: string; added_at: string; display_name: string; slug: string;
    }>;
    const isSole = organizers.length <= 1;
    const isDraft = event.status === 'draft';
    const isPublic = event.status === 'reg_open' || event.status === 'closed' || event.status === 'completed';

    const editing = query.editDivision
      ? divisions.find((d) => d.id === query.editDivision) ?? null
      : null;
    const partsStep = editing
      ? divisionPartsStep(base, games, { gameId: editing.game_id, customName: editing.custom_game_name, customDiscipline: editing.discipline_category }, editing)
      : query.game
        ? divisionPartsStep(base, games, {
          gameId: query.game === 'custom' ? null : query.game,
          customName: query.game === 'custom' ? (query.customName ?? '').trim() : null,
          customDiscipline: query.game === 'custom' ? (query.customDiscipline ?? '') : null,
        }, null)
        : null;

    const values = opts.detailsForm?.values ?? eventRowToForm(event);
    return {
      seo: { title: `Manage ${event.title}`, noindex: true },
      page: {
        sectionKey: 'events',
        pageKey: 'event_manage',
        title: `Manage ${event.title}`,
        intro: 'Every organizer of this event can change its details, its divisions and its organizers.',
      },
      navigation: { contextLinks: [{ label: 'Back to My Profile', href: `/members/${encodeURIComponent(this.slugFor(organizers, viewerMemberId))}` }] },
      content: {
        notice: opts.notice ?? null,
        eventTitle: event.title,
        statusLabel: EVENT_STATUS_LABELS[event.status] ?? event.status,
        typeLabel: isFreeEvent(event) ? 'Free event' : 'Sanctioned event',
        hashtag: event.tag_normalized,
        publicHref: isPublic ? base : null,
        detailsAction: `${base}/edit`,
        detailsMessage: opts.detailsForm?.message ?? null,
        fieldErrors: opts.detailsForm?.fieldErrors ?? {},
        values,
        countryOptions: locationPickers(values.country, '').countryOptions,
        showFees: !isFreeEvent(event),
        canEditFees: !isFreeEvent(event) && isDraft,
        divisions: divisions.map((d) => ({
          id: d.id,
          name: d.name,
          prizeLabel: d.offers_prize_money === 1 ? 'Offers prize money' : null,
          isLocked: d.confirmed_count > 0,
          editHref: `${base}/manage?editDivision=${encodeURIComponent(d.id)}#division-form`,
          removeAction: `${base}/divisions/${encodeURIComponent(d.id)}/remove`,
        })),
        gameGroups: gameOptionGroups(games, query.game ?? null),
        chooseGameAction: `${base}/manage`,
        customGameName: query.game === 'custom' ? query.customName ?? '' : '',
        disciplineOptions: DISCIPLINE_OPTIONS.map((o) => ({ ...o, selected: o.value === query.customDiscipline })),
        partsStep,
        organizers: organizers.map((o) => ({
          name: o.display_name,
          memberId: o.member_id,
          profileHref: `/members/${encodeURIComponent(o.slug)}`,
          addedOn: o.added_at.slice(0, 10),
          isSelf: o.member_id === viewerMemberId,
          // The viewer leaves by stepping down, which the sole organizer cannot.
          canRemove: o.member_id !== viewerMemberId,
          removeAction: `${base}/organizers/remove`,
        })),
        canAddOrganizer: organizers.length < ORGANIZER_CAP,
        organizerCap: ORGANIZER_CAP,
        addOrganizerAction: `${base}/organizers`,
        stepDownAction: isSole ? null : `${base}/step-down`,
        onlineRegistration: event.status === 'reg_open'
          ? event.registration_status === 'open'
            ? { statusLabel: 'Open', action: `${base}/registration-status`, setTo: 'closed', buttonLabel: 'Stop Taking Registrations' }
            : { statusLabel: 'Stopped', action: `${base}/registration-status`, setTo: 'open', buttonLabel: 'Resume Registrations' }
          : null,
        sanction: isFreeEvent(event)
          ? null
          : (() => {
            const canRequest = this.sanctionClosedText(event) === null;
            const tierOk = isTier2Plus(viewerMemberId);
            return {
              statusLine: sanctionStatusLine(event),
              requestHref: canRequest && tierOk ? `${base}/sanction` : null,
              tierNote: canRequest && !tierOk ? SANCTION_TIER_NOTE : null,
            };
          })(),
      },
    };
  }

  /** Save the details form. A submission that changes nothing writes nothing. */
  updateEventDetails(actorMemberId: string, eventKey: string, values: EventFormValues): { branch: 'updated' | 'unchanged' } {
    const event = this.requireOrganizedEvent(eventKey, actorMemberId);
    assertManageable(event);
    const isSanctioned = !isFreeEvent(event);
    const fieldErrors: Record<string, string> = {};
    // Fees are fixed once the sanction request is in: the approval decides them.
    const feesEditable = isSanctioned && event.status === 'draft';
    const details = readEventDetails(
      feesEditable ? values : { ...values, competitorFee: centsToInput(event.competitor_fee_cents), spectatorFee: centsToInput(event.attendee_fee_cents) },
      isSanctioned,
      fieldErrors,
    );
    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Please fix the errors below.', { fieldErrors });
    }

    const changes: Record<string, { before: unknown; after: unknown }> = {};
    const note = (field: string, before: unknown, after: unknown): void => {
      if (before !== after) changes[field] = { before, after };
    };
    note('title', event.title, details.title);
    note('description', event.description, details.description);
    note('start_date', event.start_date, details.startDate);
    note('end_date', event.end_date, details.endDate);
    note('city', event.city, details.city);
    note('region', event.region, details.region);
    note('country', event.country, details.country);
    note('registration_deadline', event.registration_deadline, details.registrationDeadline);
    note('is_tshirt_size_collected', event.is_tshirt_size_collected, details.tshirtSizeCollected ? 1 : 0);
    note('is_attendee_registration_open', event.is_attendee_registration_open, details.attendeeRegistrationOpen ? 1 : 0);
    note('competitor_fee_cents', event.competitor_fee_cents, details.competitorFeeCents);
    note('attendee_fee_cents', event.attendee_fee_cents, details.attendeeFeeCents);
    if (Object.keys(changes).length === 0) return { branch: 'unchanged' };

    const now = new Date().toISOString();
    transaction(() => {
      eventWrites.updateEventDetails.run(
        details.title, details.description, details.startDate, details.endDate,
        details.city, details.region, details.country, details.registrationDeadline,
        details.tshirtSizeCollected ? 1 : 0, details.attendeeRegistrationOpen ? 1 : 0,
        details.competitorFeeCents, details.attendeeFeeCents,
        now, actorMemberId, event.id,
      );
      appendAuditEntry({
        actionType: 'event.details_edited',
        actorType: 'member',
        actorMemberId,
        entityType: 'event',
        entityId: event.id,
        metadata: { changes },
      });
    });
    return { branch: 'updated' };
  }

  /** Add a division, or change an existing one's parts. */
  saveDivision(actorMemberId: string, eventKey: string, input: DivisionInput): { branch: 'added' | 'changed' | 'unchanged' } {
    const event = this.requireOrganizedEvent(eventKey, actorMemberId);
    assertManageable(event);
    const divisions = eventWrites.listDivisions.all(event.id) as DivisionRow[];
    const existing = input.divisionId ? divisions.find((d) => d.id === input.divisionId) : undefined;
    if (input.divisionId && !existing) throw new ValidationError('That division is no longer on this event.');
    if (existing && existing.confirmed_count > 0) {
      throw new ValidationError(`${existing.name} has a confirmed registration, so it can no longer be changed here.`);
    }

    // An existing division keeps its game; only its parts change.
    const gameSource = existing
      ? { gameId: existing.game_id, customName: existing.custom_game_name, customDiscipline: existing.discipline_category }
      : { gameId: input.gameId || null, customName: input.gameId ? null : input.customName, customDiscipline: input.gameId ? null : input.customDiscipline };
    const resolved = resolveDivisionGame(gameSource);
    const parts = validateDivisionParts(resolved, input);
    const name = divisionName(parts.divisionClass, parts.gender, parts.teamType, resolved.gameName);

    const clash = divisions.find((d) => d.name.toLowerCase() === name.toLowerCase() && d.id !== existing?.id);
    if (clash) {
      // The same division submitted twice is the first submit's success.
      if (!existing && clash.offers_prize_money === (parts.offersPrizeMoney ? 1 : 0)
        && findOwnLatestAudit(actorMemberId, 'event.division_added', 'event', event.id)) {
        return { branch: 'added' };
      }
      throw new ValidationError(`This event already has a division named ${clash.name}.`);
    }

    const now = new Date().toISOString();
    if (existing) {
      const changes: Record<string, { before: unknown; after: unknown }> = {};
      const note = (field: string, before: unknown, after: unknown): void => {
        if (before !== after) changes[field] = { before, after };
      };
      note('name', existing.name, name);
      note('team_type', existing.team_type, parts.teamType);
      note('gender_eligibility', existing.gender_eligibility, parts.gender);
      note('division_class', existing.division_class, parts.divisionClass);
      note('offers_prize_money', existing.offers_prize_money, parts.offersPrizeMoney ? 1 : 0);
      if (Object.keys(changes).length === 0) return { branch: 'unchanged' };
      transaction(() => {
        eventWrites.updateDivision.run(
          name, parts.teamType, parts.gender, parts.divisionClass, parts.offersPrizeMoney ? 1 : 0,
          now, actorMemberId, existing.id, event.id,
        );
        appendAuditEntry({
          actionType: 'event.division_changed',
          actorType: 'member',
          actorMemberId,
          entityType: 'event',
          entityId: event.id,
          metadata: { division_id: existing.id, changes },
        });
      });
      return { branch: 'changed' };
    }

    const divisionId = `edisc_${newId()}`;
    transaction(() => {
      const next = (eventWrites.nextDivisionSortOrder.get(event.id) as { next: number }).next;
      eventWrites.insertDivision.run(
        divisionId, now, actorMemberId, now, actorMemberId,
        event.id, name, resolved.discipline, resolved.gameId, resolved.customName,
        parts.teamType, parts.gender, parts.divisionClass, parts.offersPrizeMoney ? 1 : 0, next,
      );
      appendAuditEntry({
        actionType: 'event.division_added',
        actorType: 'member',
        actorMemberId,
        entityType: 'event',
        entityId: event.id,
        metadata: { division_id: divisionId, name, offers_prize_money: parts.offersPrizeMoney },
      });
    });
    return { branch: 'added' };
  }

  /** Remove a division, after the organizer has confirmed it. */
  removeDivision(
    actorMemberId: string, eventKey: string, divisionId: string, confirmed: boolean,
  ): { branch: 'needs_confirmation'; eventTitle: string; divisionName: string } | { branch: 'removed' | 'own_repeat' | 'already_held' } {
    const event = this.requireOrganizedEvent(eventKey, actorMemberId);
    assertManageable(event);
    const divisions = eventWrites.listDivisions.all(event.id) as DivisionRow[];
    const division = divisions.find((d) => d.id === divisionId);
    if (!division) {
      const own = findOwnLatestAudit(actorMemberId, 'event.division_removed', 'event', event.id);
      return { branch: own ? 'own_repeat' : 'already_held' };
    }
    if (division.confirmed_count > 0) {
      throw new ValidationError(`${division.name} has a confirmed registration, so it can no longer be removed here.`);
    }
    if (!confirmed) return { branch: 'needs_confirmation', eventTitle: event.title, divisionName: division.name };
    transaction(() => {
      eventRegistrations.deleteUnconfirmedSelectionsForDivision.run(division.id);
      eventWrites.deleteDivision.run(division.id, event.id);
      appendAuditEntry({
        actionType: 'event.division_removed',
        actorType: 'member',
        actorMemberId,
        entityType: 'event',
        entityId: event.id,
        metadata: { division_id: division.id, name: division.name },
      });
    });
    return { branch: 'removed' };
  }

  /** Add a member as an organizer, by member id or profile URL. */
  addOrganizer(actorMemberId: string, eventKey: string, memberKey: string): { branch: 'added' | 'own_repeat' | 'already_held'; name: string } {
    const event = this.requireOrganizedEvent(eventKey, actorMemberId);
    assertManageable(event);
    if (!memberKeyFrom(memberKey)) throw new ValidationError('Enter the member id or profile URL of the member to add.');
    const member = findMemberByTypedKey(memberKey);
    if (!member) throw new ValidationError('No member has that id or profile URL.');

    if (eventOrganizers.findRow.get(event.id, member.id)) {
      const own = findStandingOwnAct(
        actorMemberId, 'event.organizer_assigned', 'event.organizer_removed', 'event', event.id,
        { metadataKey: 'organizer_member_id', id: member.id },
      );
      return { branch: own ? 'own_repeat' : 'already_held', name: member.display_name };
    }

    const now = new Date().toISOString();
    const rowId = `eorg_${newId()}`;
    const actorName = (eventOrganizers.listForEvent.all(event.id) as Array<{ member_id: string; display_name: string }>)
      .find((o) => o.member_id === actorMemberId)?.display_name ?? 'An organizer';
    transaction(() => {
      const count = (eventOrganizers.countLiveForEvent.get(event.id) as { c: number }).c;
      if (count >= ORGANIZER_CAP) {
        throw new ValidationError(`This event already has ${ORGANIZER_CAP} organizers, the most an event can have.`);
      }
      eventOrganizers.insertRow.run(
        rowId, now, actorMemberId, now, actorMemberId,
        event.id, member.id, 'organizer', now,
      );
      appendAuditEntry({
        actionType: 'event.organizer_assigned',
        actorType: 'member',
        actorMemberId,
        entityType: 'event',
        entityId: event.id,
        metadata: { organizer_member_id: member.id },
      });
      emailService.sendToMember({
        template: 'event_organizer_added',
        params: { actorName, eventTitle: event.title, eventDates: eventDatesPhrase(event.start_date, event.end_date) },
        memberId: member.id,
        idempotencyKey: `event-organizer-added:${rowId}`,
      });
    });
    return { branch: 'added', name: member.display_name };
  }

  /**
   * Remove another organizer, after confirmation. An organizer leaves an event
   * themselves by stepping down, never through this.
   */
  removeOrganizer(
    actorMemberId: string, eventKey: string, memberId: string, confirmed: boolean,
  ): { branch: 'needs_confirmation'; eventTitle: string; name: string } | { branch: 'removed' | 'own_repeat' | 'already_held' } {
    const event = this.requireOrganizedEvent(eventKey, actorMemberId);
    assertManageable(event);
    if (memberId === actorMemberId) {
      throw new ValidationError('To leave this event yourself, use Step Down as Organizer.');
    }
    const organizers = eventOrganizers.listForEvent.all(event.id) as Array<{ member_id: string; display_name: string }>;
    const target = organizers.find((o) => o.member_id === memberId);
    if (!target || !eventOrganizers.findRow.get(event.id, memberId)) {
      const own = findStandingOwnAct(
        actorMemberId, 'event.organizer_removed', 'event.organizer_assigned', 'event', event.id,
        { metadataKey: 'organizer_member_id', id: memberId },
      );
      return { branch: own ? 'own_repeat' : 'already_held' };
    }
    if (!confirmed) return { branch: 'needs_confirmation', eventTitle: event.title, name: target.display_name };
    transaction(() => {
      eventOrganizers.deleteRow.run(event.id, memberId);
      appendAuditEntry({
        actionType: 'event.organizer_removed',
        actorType: 'member',
        actorMemberId,
        entityType: 'event',
        entityId: event.id,
        metadata: { organizer_member_id: memberId },
      });
    });
    return { branch: 'removed' };
  }

  /** Step down as one of an event's organizers, after confirmation. */
  stepDownAsOrganizer(
    actorMemberId: string, eventKey: string, confirmed: boolean,
  ): { branch: 'needs_confirmation'; eventTitle: string } | { branch: 'stepped_down' | 'own_repeat' | 'not_organizer' } {
    const event = this.findEventByKey(eventKey);
    if (!event || !eventOrganizers.isCurrentOrganizer.get(event.id, actorMemberId)) {
      const own = event && findStandingOwnAct(
        actorMemberId, 'event.organizer_stepped_down', 'event.organizer_assigned', 'event', event.id,
        { metadataKey: 'organizer_member_id', id: actorMemberId },
      );
      return { branch: own ? 'own_repeat' : 'not_organizer' };
    }
    assertManageable(event);
    const count = (eventOrganizers.countLiveForEvent.get(event.id) as { c: number }).c;
    if (count <= 1) {
      throw new ValidationError('You are the only organizer of this event. Add another organizer before you step down.');
    }
    if (!confirmed) return { branch: 'needs_confirmation', eventTitle: event.title };
    transaction(() => {
      eventOrganizers.deleteRow.run(event.id, actorMemberId);
      appendAuditEntry({
        actionType: 'event.organizer_stepped_down',
        actorType: 'member',
        actorMemberId,
        entityType: 'event',
        entityId: event.id,
        metadata: { organizer_member_id: actorMemberId },
      });
    });
    return { branch: 'stepped_down' };
  }

  /**
   * The sanction request form for an event its organizer created on the
   * sanctioned path, while it is a draft whose request is not in. A request
   * already in or decided has no form: the caller says so on the manage page.
   */
  getSanctionRequestPage(
    eventKey: string,
    memberId: string,
    form?: { values: SanctionFormValues; fieldErrors: Record<string, string>; message: string },
  ): SanctionRequestPageResult {
    const event = this.requireOrganizedEvent(eventKey, memberId);
    if (isFreeEvent(event)) throw new NotFoundError('Event not found.');
    const closed = this.sanctionClosedText(event);
    if (closed) return { branch: 'closed', text: closed };
    if (!isTier2Plus(memberId)) throw new ForbiddenError(SANCTION_TIER_NOTE);

    const base = `/events/${encodeURIComponent(event.tag_normalized.slice(1))}`;
    const divisions = eventWrites.listDivisions.all(event.id) as DivisionRow[];
    const games = eventWrites.listGames.all() as GameRow[];
    const values = form?.values ?? sanctionRowToForm(event);
    return {
      branch: 'form',
      page: {
        seo: { title: 'Request IFPA Sanction', noindex: true },
        page: {
          sectionKey: 'events',
          pageKey: 'event_sanction_request',
          title: 'Request IFPA Sanction',
          eyebrow: event.title,
        },
        navigation: { contextLinks: [{ label: `Back to Manage ${event.title}`, href: `${base}/manage` }] },
        content: {
          eventTitle: event.title,
          formAction: `${base}/sanction`,
          cancelHref: `${base}/manage`,
          guidelinesHref: SANCTION_GUIDELINES_PATH,
          values,
          fieldErrors: form?.fieldErrors ?? {},
          errorMessage: form?.message ?? null,
          rejectionReason: event.sanction_status === 'rejected' ? event.sanction_decision_reason : null,
          divisions: divisions.map((d) => ({
            name: d.name,
            prizeLabel: d.offers_prize_money === 1 ? 'Offers prize money' : null,
          })),
          divisionWarning: sanctionDivisionWarning(missingSanctionDivisions(divisions, (d) => divisionGameName(d as DivisionRow, games))),
          showJustification: hasFees(event),
          deviatesOptions: choices(YES_NO, values.deviates),
          prizeOptions: choices(YES_NO, values.prizeMoney),
          frequencyOptions: choices(FREQUENCIES, values.frequency),
          permitOptions: choices(IN_PLACE, values.permits),
          insuranceOptions: choices(IN_PLACE, values.insurance),
        },
      },
    };
  }

  /**
   * Submit the sanction request: the answers, the move to `pending_approval`,
   * the sanctioning-area queue item, the audit row and the organizers' notice,
   * in one transaction. The submitting organizer's Tier 2 or Tier 3 is checked
   * here and again at approval.
   */
  submitSanctionRequest(memberId: string, eventKey: string, values: SanctionFormValues): SanctionSubmitResult {
    const event = this.requireOrganizedEvent(eventKey, memberId);
    if (isFreeEvent(event)) throw new NotFoundError('Event not found.');
    const divisions = eventWrites.listDivisions.all(event.id) as DivisionRow[];
    const fieldErrors: Record<string, string> = {};
    const answers = readSanctionForm(values, event, divisions, fieldErrors);

    if (event.sanction_status === 'pending') {
      const own = findStandingOwnAct(memberId, 'event.sanction_requested', 'event.sanction_rejected', 'event', event.id);
      if (own && Object.keys(fieldErrors).length === 0 && sameSanctionAnswers(event, answers)) {
        return { branch: 'own_repeat' };
      }
    }
    const closed = this.sanctionClosedText(event);
    if (closed) return { branch: 'already_held', text: closed };
    if (!isTier2Plus(memberId)) throw new ForbiddenError(SANCTION_TIER_NOTE);
    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Please fix the errors below.', { fieldErrors });
    }

    const organizers = eventOrganizers.listForEvent.all(event.id) as Array<{ member_id: string }>;
    const now = new Date().toISOString();
    let result: SanctionSubmitResult = { branch: 'submitted' };
    transaction(() => {
      const changed = eventWrites.submitSanctionRequest.run(
        now, memberId,
        answers.justification, answers.deviations, answers.entryFeeIncludes,
        answers.frequency, answers.yearsHeld,
        answers.expectedPlayers, answers.expectedSpectators,
        answers.permits, answers.insurance,
        answers.prizeTotalCents, answers.prizeCurrency,
        now, memberId, event.id,
      ).changes;
      // Another organizer's submit landed between the read and this write.
      if (changed !== 1) {
        result = { branch: 'already_held', text: SANCTION_ALREADY_IN };
        return;
      }
      const item = workQueueService.enqueue({
        actorId: memberId,
        taskType: SANCTION_TASK_TYPE,
        entityType: 'event',
        entityId: event.id,
        reasonText: null,
        detailText: null,
      });
      appendAuditEntry({
        actionType: 'event.sanction_requested',
        actorType: 'member',
        actorMemberId: memberId,
        entityType: 'event',
        entityId: event.id,
        metadata: { work_queue_item_id: item.id, resubmission: event.sanction_status === 'rejected' },
      });
      for (const o of organizers) {
        emailService.sendToMember({
          template: 'event_sanction_requested',
          params: { eventTitle: event.title, eventDates: eventDatesPhrase(event.start_date, event.end_date) },
          memberId: o.member_id,
          idempotencyKey: `event-sanction-requested:${item.id}:${o.member_id}`,
        });
      }
    });
    return result;
  }

  /**
   * An administrator approves a pending request: the event is sanctioned and
   * opens for registration, taking payment where it set a fee. The submitting
   * organizer must still hold Tier 2 or Tier 3, and an administrator who
   * organizes the event cannot decide it.
   */
  approveSanction(input: { queueItemId: string; adminMemberId: string; note: string }): SanctionDecisionResult {
    const note = decisionText(input.note, false, '');
    const { item, event } = this.loadSanctionReview(input.queueItemId);
    const settled = this.settledSanctionDecision(event, input.adminMemberId, 'event.sanction_approved', note);
    if (settled) return settled;

    enforceWorkQueueResolveLimit(input.adminMemberId);
    if (eventOrganizers.isCurrentOrganizer.get(event.id, input.adminMemberId)) {
      throw new ValidationError(SANCTION_SELF_DECIDE);
    }
    const submitter = event.sanction_requested_by_member_id;
    if (!submitter || !isTier2Plus(submitter)) throw new ValidationError(SANCTION_TIER_LAPSED);

    transaction(() => {
      this.grantSanctionInTx(event, input.adminMemberId, note || null, 'event.sanction_approved', item.id);
    });
    return { status: 'approved' };
  }

  /**
   * An administrator rejects a pending request with a reason the organizers
   * are sent. The event returns to draft for them to revise and resubmit.
   */
  rejectSanction(input: { queueItemId: string; adminMemberId: string; reason: string }): SanctionDecisionResult {
    const reason = decisionText(input.reason, true, 'Give the reason; the organizers are sent it.');
    const { item, event } = this.loadSanctionReview(input.queueItemId);
    const settled = this.settledSanctionDecision(event, input.adminMemberId, 'event.sanction_rejected', reason);
    if (settled) return settled;

    enforceWorkQueueResolveLimit(input.adminMemberId);
    if (eventOrganizers.isCurrentOrganizer.get(event.id, input.adminMemberId)) {
      throw new ValidationError(SANCTION_SELF_DECIDE);
    }
    const organizers = eventOrganizers.listForEvent.all(event.id) as Array<{ member_id: string }>;
    const base = `/events/${encodeURIComponent(event.tag_normalized.slice(1))}`;
    transaction(() => {
      const now = new Date().toISOString();
      if (eventWrites.rejectSanction.run(
        now, input.adminMemberId, reason, now, input.adminMemberId, event.id,
      ).changes !== 1) {
        throw new Error(`event ${event.id} left pending between its read and its rejection`);
      }
      workQueue.resolve.run(now, input.adminMemberId, 'rejected', null, now, input.adminMemberId, item.id);
      const auditId = appendAuditEntry({
        actionType: 'event.sanction_rejected',
        actorType: 'admin',
        actorMemberId: input.adminMemberId,
        entityType: 'event',
        entityId: event.id,
        reasonText: reason,
        metadata: { work_queue_item_id: item.id },
      });
      for (const o of organizers) {
        emailService.sendActNotice({
          template: 'event_sanction_rejected',
          params: {
            eventTitle: event.title,
            reason: withoutClosingStop(reason),
            manageUrl: absoluteUrl(`${base}/manage`),
          },
          memberId: o.member_id,
          actId: auditId,
        });
      }
    });
    return { status: 'rejected' };
  }

  /**
   * The administrator's list of drafts a Board-awarded sanction can be recorded
   * on: a World Championships the IFPA Board granted is sanctioned by that grant
   * and makes no request.
   */
  getSanctionAwardPage(opts: { notice?: OutcomeNoticeView | null; errorMessage?: string } = {}): PageViewModel<SanctionAwardContent> {
    const rows = eventWrites.listSanctionAwardCandidates.all() as Array<{
      id: string; title: string; start_date: string; end_date: string; city: string; country: string;
    }>;
    return {
      seo: { title: 'Record a Board-awarded Sanction', noindex: true },
      page: {
        sectionKey: 'admin',
        pageKey: 'admin_event_sanction_award',
        title: 'Record a Board-awarded Sanction',
        instructions: {
          what: 'Records the sanction of a World Footbag Championships whose host bid the IFPA Board granted.',
          why: 'A Board-awarded World Championships is sanctioned by the award, so its organizers make no sanction request.',
          how: 'Find the event among the drafts below and cite the Board decision that awarded it.',
          headsUp: [
            'The event opens for registration at once and its organizers are emailed.',
            'The Board decision you cite is kept on the record.',
          ],
        },
      },
      content: {
        events: rows.map((r) => ({
          eventId: r.id,
          title: r.title,
          dates: eventDatesPhrase(r.start_date, r.end_date),
          location: `${r.city}, ${r.country}`,
          action: `/admin/events/${encodeURIComponent(r.id)}/sanction-award`,
        })),
        hasEvents: rows.length > 0,
        emptyMessage: 'No event is waiting as a draft.',
        notice: opts.notice ?? null,
        errorMessage: opts.errorMessage ?? null,
      },
    };
  }

  /** Record a Board-awarded sanction on a draft, citing the Board's decision. */
  recordBoardAward(adminMemberId: string, eventId: string, citation: string): { ending: 'advance' | 'own_repeat' | 'already_held'; text: string } {
    const reason = decisionText(citation, true, 'Cite the Board decision that awarded this event.');
    const event = eventWrites.findById.get(eventId) as EventRow | undefined;
    if (!event) throw new NotFoundError('Event not found.');
    if (event.sanction_status === 'approved') {
      const own = findStandingOwnAct(adminMemberId, 'event.sanction_awarded', 'event.sanction_requested', 'event', event.id);
      return own && event.sanction_decision_reason === reason
        ? { ending: 'own_repeat', text: 'Sanction recorded.' }
        : { ending: 'already_held', text: SANCTION_ALREADY_GRANTED };
    }
    if (event.status !== 'draft') {
      throw new ValidationError('This event has a sanction request waiting. Decide it in the work queue.');
    }
    transaction(() => {
      this.grantSanctionInTx(event, adminMemberId, reason, 'event.sanction_awarded', null);
    });
    return { ending: 'advance', text: 'Sanction recorded.' };
  }

  /**
   * The full request as the reviewing administrator reads it on the queue item.
   * Null when the event has gone.
   */
  getSanctionReviewEvidence(eventId: string): SanctionReviewEvidence | null {
    const event = eventWrites.findById.get(eventId) as EventRow | undefined;
    if (!event) return null;
    const divisions = eventWrites.listDivisions.all(event.id) as DivisionRow[];
    const games = eventWrites.listGames.all() as GameRow[];
    const organizers = eventOrganizers.listForEventPage.all(event.id) as Array<{
      member_id: string; display_name: string; slug: string; login_email: string | null;
    }>;
    const submitter = event.sanction_requested_by_member_id;
    const submitterName = organizers.find((o) => o.member_id === submitter)?.display_name ?? 'No longer an organizer';
    const money = (cents: number | null, currency: string): string =>
      cents === null ? 'None' : `${centsToInput(cents)} ${currency}`;
    const facts: Array<{ label: string; value: string }> = [
      { label: 'Dates', value: eventDatesPhrase(event.start_date, event.end_date) },
      { label: 'Location', value: [event.city, event.region, event.country].filter((p) => p).join(', ') },
      { label: 'Requested by', value: submitterName },
      { label: 'Requester holds Tier 2 or Tier 3', value: submitter && isTier2Plus(submitter) ? 'Yes' : 'No' },
      { label: 'Competitor fee', value: money(event.competitor_fee_cents, event.currency) },
      { label: 'Spectator fee', value: money(event.attendee_fee_cents, event.currency) },
      { label: 'Fee justification', value: event.sanction_justification ?? 'None given' },
      { label: 'What the entry fee includes', value: event.sanction_entry_fee_includes ?? 'Not stated' },
      { label: 'Prize money', value: event.prize_money_total_cents === null ? 'None' : money(event.prize_money_total_cents, event.prize_money_currency ?? '') },
      { label: 'How often it is held', value: labelOf(FREQUENCIES, event.sanction_event_frequency) },
      { label: 'Years held', value: event.sanction_years_held ?? 'Not stated' },
      { label: 'Expected players', value: event.sanction_expected_players === null ? 'Not stated' : String(event.sanction_expected_players) },
      { label: 'Expected spectators', value: event.sanction_expected_spectators === null ? 'Not stated' : String(event.sanction_expected_spectators) },
      { label: 'Permits in place', value: labelOf(IN_PLACE, event.sanction_permits) },
      { label: 'Insurance in place', value: labelOf(IN_PLACE, event.sanction_insurance) },
      { label: 'Attestation', value: event.sanction_status === 'none' ? 'Not given' : 'Affirmed on submission' },
    ];
    const classLabel = (v: string | null): string => CLASSES.find((c) => c.value === v)?.label ?? 'Not stated';
    const genderLabel = (v: string | null): string => GENDERS.find((g) => g.value === v)?.label ?? 'Not stated';
    const missing = missingSanctionDivisions(divisions, (d) => divisionGameName(d as DivisionRow, games));
    return {
      eventTitle: event.title,
      facts,
      organizers: organizers.map((o) => ({
        name: o.display_name,
        profileHref: `/members/${encodeURIComponent(o.slug)}`,
        email: o.login_email,
      })),
      deviations: event.sanction_deviations,
      divisions: divisions.map((d) => ({
        name: d.name,
        parts: [
          `Game: ${divisionGameName(d, games)}`,
          `Entry: ${d.team_type === 'doubles' ? 'Doubles' : 'Singles'}`,
          `Gender: ${genderLabel(d.gender_eligibility)}`,
          `Class: ${classLabel(d.division_class)}`,
        ].join(' · '),
        prizeLabel: d.offers_prize_money === 1 ? 'Offers prize money' : null,
      })),
      hasDivisions: divisions.length > 0,
      divisionFlag: missing.length > 0 ? `Missing divisions: ${missing.join('; ')}.` : null,
    };
  }

  /** The organizer who sent the event's sanction request, or null. */
  sanctionRequesterId(eventId: string): string | null {
    const event = eventWrites.findById.get(eventId) as EventRow | undefined;
    return event?.sanction_requested_by_member_id ?? null;
  }

  // The decision every grant shares, approved request or Board award: the event
  // is sanctioned and opens, the queue item (if any) resolves, the act is
  // audited, and every organizer is emailed.
  private grantSanctionInTx(
    event: EventRow, adminMemberId: string, reason: string | null,
    actionType: 'event.sanction_approved' | 'event.sanction_awarded', queueItemId: string | null,
  ): void {
    const now = new Date().toISOString();
    const paymentEnabled = hasFees(event) ? 1 : 0;
    if (eventWrites.grantSanction.run(
      now, paymentEnabled, now, adminMemberId, reason, now, adminMemberId, event.id,
    ).changes !== 1) {
      throw new Error(`event ${event.id} changed between its read and its sanction`);
    }
    if (queueItemId) {
      workQueue.resolve.run(now, adminMemberId, 'approved', null, now, adminMemberId, queueItemId);
    }
    const auditId = appendAuditEntry({
      actionType,
      actorType: 'admin',
      actorMemberId: adminMemberId,
      entityType: 'event',
      entityId: event.id,
      reasonText: reason,
      metadata: { work_queue_item_id: queueItemId, payment_enabled: paymentEnabled === 1 },
    });
    const organizers = eventOrganizers.listForEvent.all(event.id) as Array<{ member_id: string }>;
    for (const o of organizers) {
      emailService.sendActNotice({
        template: 'event_sanctioned',
        params: { eventTitle: event.title, guidelinesUrl: absoluteUrl(SANCTION_GUIDELINES_PATH), note: reason },
        memberId: o.member_id,
        actId: auditId,
      });
    }
  }

  // The review item and the event it names. Anything else is not found: no
  // sanction action applies to it.
  private loadSanctionReview(queueItemId: string): { item: { id: string; status: string }; event: EventRow } {
    const item = workQueue.findById.get(queueItemId) as
      | { id: string; task_type: string; entity_id: string; status: string }
      | undefined;
    if (!item || item.task_type !== SANCTION_TASK_TYPE) {
      throw new NotFoundError('That queue item is no longer open.');
    }
    const event = eventWrites.findById.get(item.entity_id) as EventRow | undefined;
    if (!event) throw new NotFoundError('That queue item is no longer open.');
    return { item, event };
  }

  // What a decision on a request no longer pending reports: this administrator's
  // own standing decision with the same words is their first success; anything
  // else already settled it.
  private settledSanctionDecision(
    event: EventRow, adminMemberId: string,
    actionType: 'event.sanction_approved' | 'event.sanction_rejected', text: string,
  ): SanctionDecisionResult | null {
    if (event.sanction_status === 'pending') return null;
    const own = findStandingOwnAct(adminMemberId, actionType, 'event.sanction_requested', 'event', event.id);
    const sameText = (event.sanction_decision_reason ?? '') === text;
    return own && sameText ? { status: 'own_repeat' } : { status: 'already_held' };
  }

  // Why an event has no request to make, or null while it can make one.
  private sanctionClosedText(event: EventRow): string | null {
    if (event.sanction_status === 'pending') return SANCTION_ALREADY_IN;
    if (event.sanction_status === 'approved') return SANCTION_ALREADY_GRANTED;
    if (event.status !== 'draft') return 'This event can no longer request sanction.';
    return null;
  }

  /** The confirm step every removal on an organizer surface passes through. */
  getConfirmPage(opts: {
    title: string; caution: string; action: string; buttonLabel: string; cancelHref: string;
    hiddenMemberId?: string;
  }): PageViewModel<EventConfirmContent> {
    return {
      seo: { title: opts.title, noindex: true },
      page: { sectionKey: 'events', pageKey: 'event_confirm', title: opts.title },
      content: {
        caution: opts.caution,
        action: opts.action,
        buttonLabel: opts.buttonLabel,
        cancelHref: opts.cancelHref,
        hiddenMemberId: opts.hiddenMemberId ?? null,
      },
    };
  }

  private findEventByKey(eventKey: string): EventRow | null {
    if (!PUBLIC_EVENT_KEY_PATTERN.test(eventKey)) return null;
    return (eventWrites.findByStandardTag.get(`#${eventKey}`) as EventRow | undefined) ?? null;
  }

  // An event whose page the public sees, or not-found: a draft or canceled event
  // takes no registrations and says nothing about itself.
  private requirePublicEvent(eventKey: string): EventRow {
    const event = this.findEventByKey(eventKey);
    if (!event || !['reg_open', 'closed', 'completed'].includes(event.status)) {
      throw new NotFoundError('Event not found.');
    }
    return event;
  }

  // An event the viewer organizes, or not-found: a member who is not one of its
  // organizers learns nothing about a draft by asking for its page.
  private requireOrganizedEvent(eventKey: string, memberId: string): EventRow {
    const event = this.findEventByKey(eventKey);
    if (!event || !eventOrganizers.isCurrentOrganizer.get(event.id, memberId)) {
      throw new NotFoundError('Event not found.');
    }
    return event;
  }

  private slugFor(organizers: Array<{ member_id: string; slug: string }>, memberId: string): string {
    return organizers.find((o) => o.member_id === memberId)?.slug ?? '';
  }
}

export const eventService = new EventService();
