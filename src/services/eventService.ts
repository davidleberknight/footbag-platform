/**
 * EventService -- event lifecycle and public event reads.
 *
 * Owns:
 *   - Event lifecycle (create through completion or cancellation)
 *   - Management of the event's categories and divisions (event_disciplines rows)
 *   - Co-organizer management
 *   - Sanction requests
 *   - Cancellation, closing and deletion of events, and cancellation of registrations
 *   - The organizers' participant list, exports, check-in sheet and participant email
 *   - Corrections at the event: Add Entrant and Edit Entry, by an organizer or
 *     an administrator
 *   - The writes of an administrator's event corrections (AdminEventService shapes
 *     their pages)
 *   - Results upload
 *   - Public event browse and detail page reads. Every list of events (the
 *     landing page's upcoming events, a year page) draws each
 *     event as the same dated item through eventListing, which also shapes the
 *     status badge: an open event past its cutoff or paused reads as closed.
 *     The badge and the register button share one rule, so an event offering
 *     no registration type a member could take reads as closed too. A
 *     non-member on an upcoming event's page is told what registering takes:
 *     a visitor that it needs membership, with log-in back to the form; a
 *     registrant still onboarding, to finish it (membershipPrompt).
 *   - The deadline job's pass (SYS_Close_Event_Registration): closing
 *     registration on every open event whose cutoff has passed, as the system
 *   - The event's cover photo pointer (`events.cover_media_id`): who may set or
 *     clear it, and where it shows. The photo itself is an ordinary member
 *     photo, uploaded through entityCoverPhoto and CuratorMediaService.
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
 *     draft`. `completed` and `canceled` are terminal. The first committed results
 *     upload moves an event to `completed`, from `reg_open` or `closed`.
 *   - Public detail visibility limited to `reg_open`, `closed`, `completed`. Other
 *     statuses resolve through standard not-found behavior.
 *   - HD guard: an event is hard-deleted only if it never took a registration, has no
 *     result rows and sent no participant email, and is not pending_approval or completed.
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
 *     themselves or step down. A co-organizer is added by choosing a live,
 *     onboarded member from the member search on the manage page.
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
 *     A competitor enters at least one division; a doubles entry names its
 *     partner, a live onboarded member other than the registrant, chosen by
 *     name from the member search and posted by member id. Gender eligibility
 *     is checked between the two member profiles.
 *   - Withdrawal: the member cancels their own registration up to the same cutoff;
 *     the canceled row keeps its entries, and every current organizer is emailed.
 *     A registration waiting at checkout ends that checkout first.
 *   - The event page shows every visitor how many confirmed registrations each
 *     division has. A signed-in member also sees who is registered (confirmed
 *     registrations only, no contact details) and their own registration.
 *   - Removing a division takes with it the entries no confirmed registration holds.
 *   - Cancellation of an event or a registration is one method each with two doors:
 *     an organizer on an event they organize, found by key, and an administrator
 *     on any event, found by id. Both take a reason, which goes into the audit row
 *     and the notice. Canceling an event keeps its confirmed registrations as the
 *     record of who entered, ends the open checkouts, cancels the pending ones,
 *     closes its open sanction item, and emails every registrant and organizer.
 *     Canceling a registration emails its member. A paid registrant is told that
 *     the Treasurer arranges any refund outside the platform.
 *   - Closing registration (`reg_open -> closed`) is irreversible; the
 *     online-registration switch is the reversible pause.
 *   - Corrections at the event: an organizer adds any member the member search
 *     offers as a competitor, or changes a confirmed competitor entry's
 *     divisions, doubles partners and whether its fee was paid at the event.
 *     They are open from the start of registration until any result is
 *     recorded, whatever the deadline or the online-registration switch says.
 *     Partners and gender eligibility are checked as the member's own
 *     registration checks them; a doubles entry may be left with no partner,
 *     and a partner an entry stops naming keeps their own entry naming nobody,
 *     both flagged on the participant list. A registration made here is
 *     confirmed at once and never opens checkout; a fee paid at the table is
 *     recorded on the registration with no payment row and no amount. A
 *     member already registered is edited, not added again. Removing an entry
 *     is the registration's cancellation. Each save is audited with the
 *     entry's ids before and after and emails the member, and any old partner
 *     whose entry it left with no partner, naming who made the change. An
 *     administrator does the same on any event through the same rules, giving
 *     a reason, which the emails carry, and confirming a preview first.
 *   - A confirmed registration whose type carries a fee reads to its
 *     organizers as not paid until a payment succeeds or the fee is marked
 *     paid at the event.
 *   - The participant list groups the confirmed entries by division, each with
 *     its count, above the full list of standing registrations.
 *   - The participant list, its CSV export, the registration summary, the
 *     check-in sheet and participant email are for the event's organizers only.
 *     The export, the sheet and the email reach confirmed registrations only. A
 *     participant's email shows only where they made it visible to members.
 *     Participant email goes to the event audience through the outbox, plain
 *     text with a sender line, archived, one per event in any 24 hours.
 *   - Administrator corrections reach any field of any event, its sanction once
 *     it has opened, divisions with confirmed entries, and a registration's
 *     attendance. Each takes a reason, previews before it writes, writes nothing
 *     when nothing changes, records each changed value before and after, and
 *     emails the current organizers. Taking an attendance mark back leaves the
 *     Active Player grant it caused, which is corrected on the member record.
 *   - Results upload: an organizer uploads a CSV file from the event's last day
 *     onward, on an event that opened. The file is read into a preview that
 *     writes nothing; the preview's text travels in the form, so nothing is held
 *     between the steps, and the commit reads it again with the organizer's
 *     decisions (declared ties, unadvertised divisions confirmed as contested).
 *     A malformed file, a cell a spreadsheet would run as a formula, an
 *     undeclared repeated place, a division that already has results and a
 *     name that matches no single confirmed registration of the event are
 *     refused, the last naming each such row, as is a doubles row placing an
 *     entry whose registration names no partner; no result is ever saved as a
 *     name without its member. The commit writes the upload, its entries and
 *     competitors, any unadvertised division, the event's completion and the
 *     attendance of every placing member with a confirmed registration, in one
 *     transaction. Published results are corrected by an administrator
 *     (AdminEventResultService), never by a second upload.
 *   - Attendance: from the event's last day, organizers mark confirmed
 *     registrations attended, once each. Each mark grants or extends a Tier 0
 *     member's Active Player standing (ActivePlayerService.applyAttendanceInTx,
 *     in the mark's transaction) and emails a member whose standing changed.
 *   - After-event obligations: an event that has ended owes its results; a
 *     sanctioned one also owes its after-event summary, an approved announcement
 *     marked as its summary. Both are due within twenty days of the last day. A
 *     sanctioned event past that with no results shows its organizers
 *     "Sanctioning requirements not met" on its manage page and its upload page,
 *     never on the public event page, and every current organizer has a
 *     dashboard item (eventActionSource) until what is owed is done.
 *   - Cover photo: the organizer creating the event, and later any current
 *     organizer from the manage page, may upload a cover photo. It goes through
 *     the Share Media photo path and its Tier 1 benefits gate, owned by the
 *     uploader and tagged with the event's hashtag, so it is also in the
 *     event's gallery. The event is created in its own transaction first and the
 *     photo uploaded after, outside any transaction; a refused photo leaves the
 *     event created. Setting the cover only moves the pointer, so a replaced
 *     photo stays in the gallery; removing it clears the pointer and deletes
 *     nothing. Both are audited, and a repeat (the pointer already on the
 *     photo, or already clear) is recognised before acting. A canceled event
 *     takes no cover change. The cover is honoured on read only while it is an
 *     active, non-avatar photo still carrying the event's hashtag, with no
 *     other photo standing in; it shows at the top of the event page as its
 *     share image, and as a thumbnail on the event's listed card, every list
 *     resolving its covers in one statement.
 *
 * Persistence:
 *   events, event_disciplines, discipline_games (read), event_organizers, event_results_uploads,
 *   event_result_entries, event_result_entry_participants, tags, registrations,
 *   registration_discipline_selections, email_archives, audit_entries, outbox_emails,
 *   work_queue_items, active_player_grants (through ActivePlayerService),
 *   member_announcements (read: whether an after-event summary was sent),
 *   media_items and media_tags (read for the cover; a cover upload writes them
 *   through CuratorMediaService).
 *
 * Side effects:
 *   - audit_entries append (event.created, event.details_edited,
 *     event.division_added / _changed / _removed, event.organizer_assigned,
 *     event.organizer_removed, event.organizer_stepped_down,
 *     event.registration_withdrawn, event.registration_status_changed,
 *     event.registration_closed (by an organizer, or by the deadline job as the
 *     system with the cutoff it passed), event.registration_canceled,
 *     event.registration_added, event.registration_corrected, event.canceled,
 *     event.deleted, event.participants_emailed, event.corrected,
 *     event.description_cleared, event.division_corrected,
 *     event.sanction_requested, event.sanction_approved, event.sanction_rejected,
 *     event.sanction_awarded, event.results_uploaded, event.attendance_marked,
 *     event.attendance_corrected, event.cover_photo_set,
 *     event.cover_photo_removed; active_player.grant and _extend through
 *     ActivePlayerService; media.member_uploaded through CuratorMediaService)
 *   - object storage put of a cover photo's renditions, through
 *     CuratorMediaService's storage adapter
 *   - outbox_emails enqueue (organizer confirmations, participant notices, sanction
 *     request and decisions, cancellations, correction notices, the member's
 *     notice of an entry an organizer or administrator added or changed, participant
 *     email, the Active Player notice an attendance grant sends), inside the
 *     act's transaction
 *   - work_queue_items insert (`sanction_request`, routine: read on the queue and
 *     rolled up in the administrators' digest), resolved on its decision and
 *     dismissed when the event is canceled
 *
 * Service shape: singleton object. It reaches the payment provider only through
 * PaymentService, the outbox only through EmailService and the
 * communication service's event audience, and media storage only through
 * entityCoverPhoto, never an adapter of its own.
 */
import { createHash, randomUUID } from 'crypto';
import {
  PublicCompletedEventSummaryRow,
  PublicEventDetailRow,
  PublicEventDisciplineRow,
  PublicEventResultRow,
  PublicEventSummaryRow,
  emailArchives,
  eventOrganizers,
  eventRegistrations,
  eventResults,
  eventWrites,
  mediaTags,
  outbox,
  publicEvents,
  transaction,
  workQueue,
} from '../db/db';
import { getCommunicationService } from './communicationService';
import { tierBadgeShort, TIER_NAMES } from './membershipTieringService';
import { csvRow } from '../lib/csv';
import { downloadFilename } from '../lib/downloadFilename';
import type { PrintColumn, PrintRow, PrintableDocument } from '../lib/printableDocument';
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
import { canonicalCountryName, personLocation } from './countryUtils';
import {
  EVENT_STATUS_LABELS, eventDateRange, eventStatusBadge, isRegistrationOffered, isRegistrationOpen,
  offeredRegistrationTypes, registrationCutoff, toEventDatedItem,
} from './eventListing';
import type { DatedItemView } from '../types/datedItem';
import { CURRENT_SPORTS, sportLabel, sportOptions } from './sportCategories';
import { medalClass } from './playerShaping';
import { COUNTRY_CHOICE_MESSAGE } from './memberLocationRules';
import { emailService } from './emailService';
import { locationPickers, memberService } from './memberService';
import {
  PICKER_LIMIT, buildMemberPicker, pickerSearchOutcome,
  type MemberPickerView, type PickIntent, type PickerMember, type PickerSearchOutcome,
} from './memberPicker';
import { paymentService } from './paymentService';
import { applyAttendanceInTx } from './activePlayerService';
import { formatDateDisplay } from './dateFormat';
import {
  navigateTo, pendingAction, urgentAction,
  type MemberActionContext, type MemberActionItem, type MemberActionSource,
} from './memberActionItem';
import {
  RESULTS_FILE_MAX_BYTES, RESULTS_FILE_MAX_ROWS, readResultsFile, resultsFileTemplate, type ResultsPreview,
} from './eventResultsFile';
import {
  REGISTRATION_TYPE_LABELS,
  eventDatesPhrase,
  registrationSummary,
  toEntryView,
  type RegistrationEntryView,
  type RegistrationType,
} from './eventRegistrationSettlement';
import type { OutcomeNoticeView } from '../lib/outcomeNotice';
import {
  onboardingMembershipPrompt, visitorMembershipPrompt, type MembershipPromptView,
} from './membershipPrompt';
import { personHref } from './personLink';
import { runSqliteRead } from './sqliteRetry';
import { PageViewModel } from '../types/page';
import { loadSitePhotoUrl } from './siteMediaService';
import {
  coverPhotoImage, eventCoverPhotos, isCoverCandidate, refusedCoverChange, uploadCoverPhoto as uploadEntityCoverPhoto,
  type CoverPhotoChange, type CoverPhotoFile, type CoverPhotoImage, type CoverPhotoSection, type CoverPhotoUploader,
} from './entityCoverPhoto';

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
  /** "Amateur" for an entrant who entered this prize-money division as one; null otherwise. */
  amateurLabel: string | null;
}

export interface PublicResultPlacement {
  placement: number;
  /** The placing's medal colour class, or empty. */
  medalClass: string;
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
  /** Upcoming public events, each drawn as every listed event is. */
  upcomingEvents: DatedItemView[];
  /** Every year with a completed public event, the current year included, each a button to its year page. */
  archiveYears: number[];
  /** Where an organizer arriving cold reads what sanctioning takes and who may apply. */
  organizerLinks: { guidelinesHref: string };
}

/** What the deadline job's pass closed, recorded on its job-run row. */
export interface CloseDueRegistrationsResult {
  closedEventIds: string[];
}

// The actor stamped on an event row a scheduled job changes.
const SYSTEM_ACTOR = 'system';

export interface EventsYearContent {
  year: number;
  events: DatedItemView[];
}

/** One competition category's divisions on the event page, in their own order. */
export interface PublicDisciplineGroup {
  /** The category's name; null for standings that span several categories. */
  label: string | null;
  disciplines: PublicEventDiscipline[];
}

export interface EventDetailContent {
  event: PublicEvent;
  disciplines: PublicEventDiscipline[];
  /** The divisions grouped by competition category, with each division's count. */
  disciplineGroups?: PublicDisciplineGroup[];
  /** The event's dates as one range. */
  dateRange?: string;
  /** Results belong to an event that has taken place; an upcoming one shows none. */
  showResults?: boolean;
  hasResults: boolean;
  isSparse: boolean;
  primarySection: 'details' | 'results';
  resultSections: PublicResultSection[];
  hashtag: EntityHashtag;
  media: EntityMediaBlock | null;
  organizers: EventOrganizerView[];
  /** Registration on an upcoming event, for a signed-in member; null otherwise. */
  registration: EventRegistrationBlock | null;
  /**
   * What a non-member sees where a member would register, on an upcoming
   * event: membership is required and how to get it, or, when no one could
   * register now, that online registration is not open. Null for a member.
   */
  registrationPrompt: MembershipPromptView | null;
  /** The outcome of the member's last registration action. */
  notice: OutcomeNoticeView | null;
  /** The event's cover photo at the top of the page; null when it has none. */
  coverPhoto: CoverPhotoImage | null;
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


function toPublicEventSummary(row: PublicEventSummaryRow, todayIso: string = new Date().toISOString()): PublicEventSummary {
  const badge = eventStatusBadge(row, todayIso);
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
    statusLabel: badge.text,
    statusCssClass: badge.cssClass,
    registrationStatus: row.registration_status,
    regOpenedAt: row.reg_opened_at,
    hashtagTagId: row.hashtag_tag_id,
    standardTagNormalized: row.tag_normalized,
    standardTagDisplay: row.tag_display,
  };
}

function toPublicCompletedEventSummary(row: PublicCompletedEventSummaryRow): PublicCompletedEventSummary {
  return {
    ...toPublicEventSummary(row, ''),
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
    medalClass: string;
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
        medalClass: medalClass(row.placement),
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
      amateurLabel: row.participant_is_amateur === 1 ? 'Amateur' : null,
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
  organizerCap: number;
  addOrganizerAction: string;
  addOrganizerFormId: string;
  /** The picker whose row button adds the member; null once the event has its most organizers. */
  organizerPicker: MemberPickerView | null;
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
  /** Results and attendance, once the event has opened for registration. */
  results: {
    statusLine: string;
    badge: string | null;
    /** The upload page, from the event's last day. */
    uploadHref: string | null;
    attendanceHref: string | null;
    /** For a sanctioned event that has ended and not yet sent its after-event summary. */
    summaryLine: string | null;
    summaryHref: string | null;
  } | null;
  /** The participant tools, once the event has opened for registration. */
  participants: {
    participantsHref: string;
    summaryHref: string;
    emailHref: string;
    checkInHref: string;
  } | null;
  /** The irreversible close, while registration is open. */
  closeRegistrationAction: string | null;
  /** Cancel or delete, offered only where the act is allowed. */
  cancelEventAction: string | null;
  deleteEventAction: string | null;
  /** Why the event takes no further changes, on a canceled or completed event. */
  terminalNote: string | null;
  /** The event's cover photo and its controls. */
  coverPhoto: CoverPhotoSection;
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
  organizers: Array<{
    name: string; profileHref: string; email: string | null;
    /** Every other event this organizer runs or ran, newest first. */
    history: Array<{ title: string; dates: string; statusLabel: string; sanctionedLabel: string | null }>;
  }>;
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
  /** The typed reason an act whose motive the audit trail needs asks for. */
  reasonField: { label: string; value: string; error: string | null } | null;
}

/** Who cancels: one of the event's organizers, or an administrator on any event. */
export type EventActor = { kind: 'organizer' | 'admin'; memberId: string };

export type CancelEventResult =
  | { branch: 'needs_confirmation'; eventTitle: string; registrantCount: number; hasPaid: boolean }
  | { branch: 'canceled' | 'own_repeat' | 'already_held'; eventTitle: string; notified: number };

export type CancelRegistrationResult =
  | { branch: 'needs_confirmation'; eventTitle: string; memberName: string; isPaid: boolean }
  | { branch: 'canceled' | 'own_repeat' | 'already_held'; eventTitle: string; memberName: string };

export type DeleteEventResult =
  | { branch: 'needs_confirmation'; eventTitle: string }
  | { branch: 'deleted' | 'already_held' };

export interface ParticipantEntryView {
  divisionName: string;
  partner: string | null;
  amateurLabel: string | null;
}

export interface ParticipantRowView {
  registrationId: string;
  name: string;
  profileHref: string;
  registeredOn: string;
  statusLabel: string;
  typeLabel: string;
  tierLabel: string;
  activePlayerLabel: string;
  location: string;
  email: string | null;
  paymentLabel: string | null;
  tshirtSize: string | null;
  entries: ParticipantEntryView[];
  cancelAction: string | null;
  /** "Attended" once marked; null until then. */
  attendedLabel: string | null;
  /** True for a confirmed registration the organizers can still mark attended. */
  canMarkAttended: boolean;
}

/** One confirmed entry in a division group of the participant list. */
export interface DivisionEntryRowView {
  registrationId: string;
  entrantName: string;
  entrantHref: string;
  partnerName: string | null;
  /** A doubles entry naming no partner, which the results upload refuses. */
  noPartner: boolean;
  paymentLabel: string;
  /** The entry's edit page while corrections are open; null after. */
  editHref: string | null;
}

/** A division's confirmed entries, with their count. */
export interface DivisionGroupView {
  name: string;
  confirmedCount: number;
  isDoubles: boolean;
  rows: DivisionEntryRowView[];
}

/** What an Add Entrant or Edit Entry form posts, every field as typed. */
export interface EntryInput {
  /** The entrant chosen from the member search; read on Add Entrant only. */
  memberId: string;
  divisionIds: string[];
  /** The partner chosen for each doubles division, by member id; empty while none is. */
  partners: Array<{ divisionId: string; memberId: string }>;
  paidAtEvent: boolean;
}

export interface EntryDivisionView {
  id: string;
  name: string;
  checked: boolean;
  partnerPicker: MemberPickerView | null;
}

/** The Add Entrant and Edit Entry form, for an organizer or an administrator. */
export interface EntryFormContent {
  formId: string;
  formAction: string;
  cancelHref: string;
  eventTitle: string;
  eventDates: string;
  /** The entrant search, on Add Entrant; null on Edit Entry, which names the entrant. */
  entrantPicker: MemberPickerView | null;
  entrantName: string | null;
  divisions: EntryDivisionView[];
  hasDivisions: boolean;
  /** Offered only when the event has fees. */
  paidAtEvent: { checked: boolean } | null;
  /** An administrator's reason, carrying what was typed; null for an organizer. */
  reasonField: { value: string } | null;
  errorMessage: string | null;
  /** The held entry's edit page, beside a refusal to add a member already registered. */
  errorLink: { label: string; href: string } | null;
  submitLabel: string;
  /** Removing the entry goes through the registration's cancellation; organizers only. */
  cancelRegistrationAction: string | null;
}

/** An Add Entrant or Edit Entry form, as the controller hands it back after a refusal or a picker step. */
export interface EntryFormState {
  input: EntryInput;
  message: string | null;
  link?: { label: string; href: string } | null;
  reason?: string;
}

type EntryChanges = Array<{ label: string; before: string; after: string }>;

export type AddEntrantResult =
  | { branch: 'needs_confirmation'; memberName: string; eventTitle: string; changes: EntryChanges }
  | { branch: 'added' | 'own_repeat' | 'already_held'; memberName: string; registrationId: string; divisionNames: string[] }
  | { branch: 'already_registered'; memberName: string; registrationId: string; editHref: string };

export type CorrectEntryResult =
  | { branch: 'needs_confirmation'; memberName: string; eventTitle: string; changes: EntryChanges }
  | { branch: 'corrected' | 'own_repeat' | 'already_held'; memberName: string; registrationId: string; whatChanged: string };

export interface ParticipantsContent {
  notice: OutcomeNoticeView | null;
  /** The entry the notice reports on, as an Edit Entry link beside it; null otherwise. */
  noticeEditHref: string | null;
  /** Add Entrant, while corrections are open; null after. */
  addEntrantHref: string | null;
  divisionGroups: DivisionGroupView[];
  hasDivisionGroups: boolean;
  eventTitle: string;
  confirmedCount: number;
  pendingCount: number;
  /** The form action marking attendance, once the event's last day has come; null before. */
  attendanceAction: string | null;
  showPayment: boolean;
  showTshirt: boolean;
  sortLinks: Array<{ label: string; href: string; isActive: boolean }>;
  rows: ParticipantRowView[];
  hasRows: boolean;
  csvHref: string;
  checkInByNameHref: string;
  checkInByTypeHref: string;
  summaryHref: string;
  emailHref: string;
  manageHref: string;
}

/** What an event owes after it ends, and whether the badge shows. */
export interface EventObligations {
  /** The day after the event's last day has come. */
  ended: boolean;
  isSanctioned: boolean;
  resultsOwed: boolean;
  summaryOwed: boolean;
  /** The last day of the twenty days after the event's last day. */
  deadline: string;
  /** Past the deadline: the twentieth day after the last day has gone by. */
  overdue: boolean;
  /** "Sanctioning requirements not met", shown to its organizers only: a sanctioned event past its deadline with no results. */
  showBadge: boolean;
}

export interface ResultsPreviewView {
  /** The file's text, carried to the next step so nothing is stored between them. */
  text: string;
  filename: string;
  fileErrors: string[];
  problems: string[];
  hasProblems: boolean;
  groups: Array<{
    name: string;
    /** "Not advertised: Net", for a division the event did not carry. */
    newLabel: string | null;
    rows: Array<{
      place: number;
      tieLabel: string | null;
      competitors: Array<{ name: string; matchLabel: string; isMatched: boolean }>;
      score: string | null;
    }>;
  }>;
  ties: Array<{ field: string; value: string; label: string; checked: boolean }>;
  contested: Array<{ field: string; value: string; label: string; checked: boolean }>;
  missingDivisionsText: string | null;
  rowCount: number;
  committable: boolean;
}

export interface ResultsUploadContent {
  notice: OutcomeNoticeView | null;
  errorMessage: string | null;
  eventTitle: string;
  badge: string | null;
  /** Why results cannot be uploaded yet; null once they can. */
  notYetText: string | null;
  canUpload: boolean;
  hasResults: boolean;
  previewAction: string;
  commitAction: string;
  templateHref: string;
  eventHref: string;
  attendanceHref: string;
  maxSizeText: string;
  preview: ResultsPreviewView | null;
}

export interface AttendanceContent {
  notice: OutcomeNoticeView | null;
  eventTitle: string;
  markAction: string;
  /** Confirmed registrations not yet marked attended, to tick. */
  unmarked: Array<{ registrationId: string; name: string; field: string; tierLabel: string }>;
  marked: Array<{ name: string; markedOn: string }>;
  hasUnmarked: boolean;
  hasMarked: boolean;
  participantsHref: string;
}

export interface RegistrationSummaryContent {
  eventTitle: string;
  confirmedCount: number;
  pendingCount: number;
  byType: Array<{ label: string; count: number }>;
  /** Confirmed registrations entering each competition category. */
  byCategory: Array<{ label: string; count: number }>;
  byDivision: Array<{ name: string; count: number }>;
  hasDivisions: boolean;
  payments: Array<{ label: string; count: number; amount: string }>;
  hasPayments: boolean;
  timeline: Array<{ day: string; count: number }>;
  hasTimeline: boolean;
  tshirts: Array<{ size: string; count: number }> | null;
  /** The organizers' participant list; null on the administrator's view. */
  participantsHref: string | null;
}

export interface EmailParticipantsContent {
  notice: OutcomeNoticeView | null;
  eventTitle: string;
  formAction: string;
  values: { subject: string; bodyText: string; sendToken: string };
  fieldErrors: Record<string, string>;
  errorMessage: string | null;
  recipientCount: number;
  /** Set once the organizer asks to preview: the message as it will go out. */
  preview: { subject: string; bodyText: string } | null;
  /** Why no email can be sent today, in place of the form's send button. */
  sendBlockedText: string | null;
  sent: Array<{ subject: string; bodyText: string; sentOn: string; senderName: string; recipientCount: number }>;
  hasSent: boolean;
  participantsHref: string;
}

export type EmailParticipantsResult =
  | { branch: 'sent' | 'own_repeat'; recipients: number }
  | { branch: 'no_recipients' };

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
  cancel_reason: string | null;
  /** When the event first opened for registration, if it has. */
  reg_opened_at: string | null;
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

const DISCIPLINE_OPTIONS: Array<{ value: string; label: string }> = sportOptions(CURRENT_SPORTS);

// The event page names every category a division can carry, a past event's
// sideline divisions included, which the division form does not offer.

/**
 * The event's divisions grouped by competition category, each group in the
 * order its first division appears, so a visitor reads how many are entered
 * in each category and division. Standings, which rank over the contests,
 * form one unnamed group after every contest, whatever category they carry.
 */
export function groupDisciplinesByCategory(disciplines: PublicEventDiscipline[]): PublicDisciplineGroup[] {
  const groups = new Map<string, PublicDisciplineGroup>();
  const standings: PublicEventDiscipline[] = [];
  for (const d of disciplines) {
    if (d.isAggregateStanding) { standings.push(d); continue; }
    const key = d.disciplineCategory ?? '';
    let group = groups.get(key);
    if (!group) {
      group = { label: d.disciplineCategory ? sportLabel(d.disciplineCategory) : null, disciplines: [] };
      groups.set(key, group);
    }
    group.disciplines.push(d);
  }
  const ordered = [...groups.values()];
  if (standings.length > 0) ordered.push({ label: null, disciplines: standings });
  return ordered;
}

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
 * open), then entry size, then game, as in "Intermediate Women's Singles Net".
 * The game prints without the word "Footbag" ("Footbag Net" is "Net", "Footbag
 * Golf" is "Golf"), so a new division carries the same name as the historical
 * category of that competition. Exported for unit testing.
 */
export function divisionName(divisionClass: string, gender: string, teamType: string, gameName: string): string {
  const classLabel = CLASSES.find((c) => c.value === divisionClass)?.label ?? divisionClass;
  const genderLabel = gender === 'women' ? "Women's" : gender === 'mixed' ? 'Mixed' : '';
  const sizeLabel = teamType === 'doubles' ? 'Doubles' : 'Singles';
  const gameLabel = gameName.replace(/^Footbag\s+/, '');
  return [classLabel, genderLabel, sizeLabel, gameLabel].filter((p) => p !== '').join(' ');
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
  if (!discipline) throw new ValidationError('Choose the sport the game belongs to.');
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
    throw new ValidationError(`Choose singles or doubles, as ${resolved.gameName} is played.`);
  }
  if (!gender || !admits(resolved.game, gender.flag)) {
    throw new ValidationError(`Choose who may enter, from what ${resolved.gameName} offers.`);
  }
  if (gender.value === 'mixed' && teamType.value !== 'doubles') {
    throw new ValidationError('A mixed competition is played in doubles.');
  }
  if (!divisionClass || !admits(resolved.game, divisionClass.flag)) {
    throw new ValidationError(`Choose a skill level ${resolved.gameName} offers.`);
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
    submitLabel: existing ? 'Save Competition' : 'Add Competition',
  };
}

// ── Registration: shapes and rules ──────────────────────────────────────────

const REGISTRATION_NOT_OPEN = 'Online registration is not open for this event.';
const REGISTER_NEEDS_MEMBERSHIP = 'You must be an IFPA member to register for this event. Membership is free.';
const REGISTER_NEEDS_ONBOARDING = 'Finish setting up your membership to register for this event.';
// Stored on a registration the member withdrew themselves, which is how a second
// submit of the withdrawal knows the first one landed.
const WITHDRAWN_BY_MEMBER = 'Withdrawn by the member';
const EVENT_CHECKOUT_UNSETTLED =
  'We are still confirming your last registration payment. Please try again in a few minutes.';
const REGISTRATION_AWAITS_PAYMENT =
  'Your registration is awaiting payment. Submit it again to return to checkout, or change it to start a new checkout.';
const TSHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
// The registration form's id, which its partner pickers' buttons submit.
const REGISTER_FORM_ID = 'event-register-form';
// The manage page's add-organizer form, which its organizer picker submits.
const ADD_ORGANIZER_FORM_ID = 'add-organizer-form';

interface MemberRow {
  id: string; display_name: string; slug: string; gender: string | null;
  city: string | null; region: string | null; country: string | null;
}

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
  paid_at_event_at: string | null;
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
  entries: Array<{ division: { id: string }; partnerMemberId: string | null; amateur: boolean }>,
  tshirtSize: string | null,
): boolean {
  if (own.registration_type !== type || own.tshirt_size !== tshirtSize) return false;
  const held = eventRegistrations.listSelectionsForRegistration.all(own.id) as SelectionRow[];
  if (held.length !== entries.length) return false;
  return entries.every((e) => held.some((s) => s.discipline_id === e.division.id
    && s.partner_member_id === e.partnerMemberId
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
      .filter((s) => s.partner_member_id !== null)
      .map((s) => ({ divisionId: s.discipline_id, memberId: s.partner_member_id ?? '' })),
    tshirtSize: own.tshirt_size ?? '',
  };
}

interface SelectionRow {
  discipline_id: string;
  division_name: string;
  partner_member_id: string | null;
  enters_as_amateur: number;
  partner_member_name: string | null;
  partner_member_slug: string | null;
}

/** What the registration form posts, every field as typed. */
export interface RegistrationInput {
  type: string;
  divisionIds: string[];
  amateurIds: string[];
  /**
   * The member chosen as partner for each doubles division, by member id; a
   * division with no partner chosen yet carries an empty id.
   */
  partners: Array<{ divisionId: string; memberId: string }>;
  tshirtSize: string;
}

export interface RegisterDivisionView {
  id: string;
  name: string;
  checked: boolean;
  /** The partner picker of a doubles division; null for a singles one. */
  partnerPicker: MemberPickerView | null;
  offersPrizeMoney: boolean;
  amateur: boolean;
  /** Shown beside a gender-gated division when the viewer has not declared a gender. */
  genderWarning: string | null;
  profileHref: string | null;
}

export interface RegisterEventContent {
  formId: string;
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

// The cutoff, the open check and the offered types live with the event listing
// shaping, which the member profile shares, so every badge and the register
// button follow one rule; re-exported here for the registration code and its tests.
export { registrationCutoff, isRegistrationOpen, offeredRegistrationTypes };

type DeclaredGender = 'male' | 'female' | null;
function declaredGender(gender: string | null): DeclaredGender {
  return gender === 'male' || gender === 'female' ? gender : null;
}

const GENDER_NEEDED = 'To enter this competition, set your gender on your profile.';

/**
 * Whether an entry may play a division, by the division's gender part, checked
 * between the registrant's profile and the partner member's (null for a
 * singles entry). Returns the refusal, or null when the entry is eligible.
 * `entrantName` is given when an organizer or administrator enters someone
 * else, so the refusal names that member instead of addressing the reader
 * as the one whose profile needs changing. Exported for unit testing.
 */
export function checkDivisionEligibility(
  division: { name: string; gender_eligibility: string | null },
  selfGender: string | null,
  partner: { gender: string | null } | null,
  entrantName: string | null = null,
): string | null {
  const rule = division.gender_eligibility;
  if (rule !== 'women' && rule !== 'mixed') return null;
  const self = declaredGender(selfGender);
  if (self === null) {
    return entrantName === null
      ? `To enter ${division.name}, set your gender on your profile.`
      : `To enter ${division.name}, ${entrantName} needs to set their gender on their profile.`;
  }
  if (rule === 'women' && self !== 'female') return `${division.name} is for women.`;
  if (partner) {
    const other = declaredGender(partner.gender);
    if (rule === 'women' && other !== 'female') {
      return `${division.name} is for women, so the partner's profile must say female.`;
    }
    if (rule === 'mixed' && (other === null || other === self)) {
      return entrantName === null
        ? `${division.name} is for one man and one woman, going by the gender on your profiles.`
        : `${division.name} is for one man and one woman, going by the gender on their profiles.`;
    }
  }
  return null;
}

// A member the member search can offer, by id, as a picker's Choose posts it:
// a doubles partner or a co-organizer. A member search does not list is
// refused, so nobody is chosen whom the form could not have offered.
function findSearchableMember(memberId: string): MemberRow | null {
  const id = memberId.trim();
  if (!id) return null;
  return (eventRegistrations.findSearchableMemberById.get(id) as MemberRow | undefined) ?? null;
}

function toPickerMember(m: MemberRow): PickerMember {
  return { memberId: m.id, displayName: m.display_name, location: personLocation(m.city, m.region, m.country)?.text ?? null };
}

/** What a picker control of a form asked for, with its search text and the caller's address. */
export interface PickerRequest {
  intent: PickIntent | null;
  query: string;
  ip: string;
}

// The member search a picker runs, only when its intent is that picker's search.
function runPickerSearch(
  picker: PickerRequest | undefined, key: string, actorMemberId: string, excludeMemberIds: readonly string[],
): PickerSearchOutcome | null {
  if (!picker || picker.intent?.kind !== 'search' || picker.intent.key !== key) return null;
  return pickerSearchOutcome(memberService.searchMembers(
    picker.query, { actorMemberId, ip: picker.ip },
    { limit: PICKER_LIMIT, includeHistorical: false, excludeMemberIds, fullLocation: true },
  ));
}

// ── Sanction request and decision ─────────────────────────────────────────

const SANCTION_TASK_TYPE = 'sanction_request';
const SANCTION_GUIDELINES_PATH = '/ifpa/sanctioning-guidelines';
const SANCTION_LONG_TEXT_MAX = 2000;
const SANCTION_SHORT_TEXT_MAX = 500;
const SANCTION_DECISION_TEXT_MAX = 500;
const SANCTION_TIER_NOTE = 'Requesting sanction takes Tier 2 (IFPA Organizer Member) or Tier 3 (IFPA Director).';
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
      fieldErrors.prize_money = 'Mark at least one competition as offering prize money on the manage page.';
    }
  } else if (prizeDivisions > 0) {
    fieldErrors.prize_money = 'A competition offers prize money. Choose yes, or change that competition on the manage page.';
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
  return `Sanctioned tournaments must offer a Women's and an Intermediate division in each format, such as Singles Net and Doubles Net. Missing: ${missing.join('; ')}. You can still submit; an administrator decides.`;
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

// ── Organizer management helpers ──────────────────────────────────────────────

/** Stored on a pending registration the event's cancellation ends. */
const EVENT_CANCELED = 'Event canceled';
const REASON_MAX = 500;
const DELETE_HAS_REGISTRATIONS =
  'This event has taken registrations, so it is kept as a record and cannot be deleted. You can cancel it instead.';
const PARTICIPANT_EMAIL_DAILY =
  'An email already went to this event\'s participants in the last 24 hours. The next one can go 24 hours after it.';
const PARTICIPANT_SUBJECT_MAX = 200;
const PARTICIPANT_BODY_MAX = 10000;

interface StandingRegistrationRow {
  id: string;
  member_id: string;
  status: 'pending' | 'confirmed';
  payment_id: string | null;
  payment_status: string | null;
  display_name: string;
}

interface EventRegistrationRow {
  id: string;
  member_id: string;
  status: string;
  registration_type: RegistrationType;
  cancel_reason: string | null;
  payment_id: string | null;
  payment_status: string | null;
  paid_at_event_at: string | null;
  tshirt_size: string | null;
  display_name: string;
}

interface ParticipantRow {
  id: string;
  member_id: string;
  status: 'pending' | 'confirmed';
  registration_type: RegistrationType;
  registered_at: string;
  tshirt_size: string | null;
  attended_at: string | null;
  display_name: string;
  slug: string;
  city: string | null;
  region: string | null;
  country: string | null;
  email_visibility: string;
  login_email: string | null;
  tier_status: string | null;
  is_active_player: number | null;
  payment_status: string | null;
  paid_at_event_at: string | null;
  entries: ParticipantEntryView[];
}

/** A typed reason, cleaned; empty when nothing usable was typed. */
function cleanReason(raw: string): string {
  const cleaned = sanitizeUserText(raw ?? '', 'single_line');
  return cleaned.status === 'ok' ? cleaned.text : '';
}

/** The reason an act whose motive the audit trail needs must carry. */
function requireReason(raw: string): string {
  const cleaned = sanitizeUserText(raw ?? '', 'single_line');
  if (cleaned.status !== 'ok') {
    throw new ValidationError(INVALID_TEXT_ENCODING_MESSAGE, { fieldErrors: { reason: INVALID_TEXT_ENCODING_MESSAGE } });
  }
  if (cleaned.text === '') {
    throw new ValidationError('Enter a reason.', { fieldErrors: { reason: 'Enter a reason.' } });
  }
  if (cleaned.text.length > REASON_MAX) {
    const message = `The reason can be at most ${REASON_MAX} characters.`;
    throw new ValidationError(message, { fieldErrors: { reason: message } });
  }
  return cleaned.text;
}

const PAID_AT_EVENT = 'Paid at the event';

const NOT_PAID = 'Not paid';

/**
 * How a registration's payment reads to its organizers. A fee collected at
 * the event's table reads as such unless an online payment also succeeded. A
 * confirmed registration whose type carries a fee, with no payment and no
 * such mark, has not paid; "No fee" is only for a type that charges none.
 */
function feeOwed(
  event: { competitor_fee_cents: number | null; attendee_fee_cents: number | null },
  r: { status: string; registration_type: RegistrationType },
): boolean {
  return r.status === 'confirmed' && registrationFeeCents(event, r.registration_type) !== null;
}

function paymentLabel(status: string | null, paidAtEventAt: string | null = null, feeOwed = false): string {
  if (paidAtEventAt !== null && status !== 'succeeded') return PAID_AT_EVENT;
  if (status === null && feeOwed) return NOT_PAID;
  switch (status) {
    case null: return 'No fee';
    case 'succeeded': return 'Paid';
    case 'pending': return 'Awaiting payment';
    case 'failed': return 'Failed';
    case 'canceled': return 'Canceled';
    case 'refunded': return 'Refunded';
    default: return status;
  }
}

// The payment statuses every charging event's summary lists, zero or not.
const SUMMARY_PAYMENT_STATUSES = ['succeeded', 'pending', 'failed'];

/**
 * Confirmed registrations for every day from registration opening to today,
 * a day without one shown as zero. With no opening date on record the first
 * registration's day starts it; with neither there is nothing to show.
 * Exported for unit testing.
 */
export function registrationTimeline(
  days: Array<{ day: string; registered: number }>, regOpenedAt: string | null, now: Date,
): Array<{ day: string; count: number }> {
  const start = regOpenedAt?.slice(0, 10) ?? days[0]?.day;
  if (!start) return [];
  const today = now.toISOString().slice(0, 10);
  const last = days.length > 0 && days[days.length - 1].day > today ? days[days.length - 1].day : today;
  const counts = new Map(days.map((d) => [d.day, d.registered]));
  const out: Array<{ day: string; count: number }> = [];
  for (let d = new Date(`${start}T00:00:00.000Z`); d.toISOString().slice(0, 10) <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    out.push({ day, count: counts.get(day) ?? 0 });
  }
  return out;
}

function eventBasePath(event: { tag_normalized: string }): string {
  return `/events/${encodeURIComponent(event.tag_normalized.slice(1))}`;
}

// ── Corrections at the event: Add Entrant and Edit Entry ───────────────────

const PARTICIPANT_ADD_FORM_ID = 'participant-add-form';
const PARTICIPANT_EDIT_FORM_ID = 'participant-edit-form';
const CORRECTIONS_CLOSED = 'Corrections close once results are uploaded.';
const ENTRANT_NEEDED = 'Search for the entrant by name and choose them.';
const WALK_UP_HINT = 'A walk-up creates a free account on their phone and finishes signing up, then appears here.';

/**
 * An entry as its audit row records it: the divisions entered, the partner
 * each doubles division names (member ids), and whether a fee was collected
 * at the event. Ids only, so the trail names nobody.
 */
interface EntrySnapshot {
  division_ids: string[];
  partners: Record<string, string | null>;
  paid_at_event: boolean;
}

interface ResolvedEntry {
  division: DivisionRow;
  partner: MemberRow | null;
  amateur: boolean;
}

function snapshotOf(
  entries: ReadonlyArray<{ divisionId: string; partnerId: string | null }>, paidAtEvent: boolean,
): EntrySnapshot {
  const sorted = [...entries].sort((a, b) => a.divisionId.localeCompare(b.divisionId));
  return {
    division_ids: sorted.map((e) => e.divisionId),
    partners: Object.fromEntries(sorted.map((e) => [e.divisionId, e.partnerId])),
    paid_at_event: paidAtEvent,
  };
}

function heldSnapshot(held: readonly SelectionRow[], paidAtEventAt: string | null): EntrySnapshot {
  return snapshotOf(held.map((s) => ({ divisionId: s.discipline_id, partnerId: s.partner_member_id })), paidAtEventAt !== null);
}

function resolvedSnapshot(entries: readonly ResolvedEntry[], paidAtEvent: boolean): EntrySnapshot {
  return snapshotOf(entries.map((e) => ({ divisionId: e.division.id, partnerId: e.partner?.id ?? null })), paidAtEvent);
}

function sameSnapshot(a: EntrySnapshot, b: EntrySnapshot): boolean {
  return a.paid_at_event === b.paid_at_event
    && a.division_ids.length === b.division_ids.length
    && a.division_ids.every((id, i) => id === b.division_ids[i] && (a.partners[id] ?? null) === (b.partners[id] ?? null));
}

// The entry as the member's own registration summary reads it, for the
// confirm page's before and after.
function entriesText(s: EntrySnapshot, divisionName: (id: string) => string, memberName: (id: string) => string): string {
  if (s.division_ids.length === 0) return '(none)';
  return s.division_ids.map((id) => {
    const partner = s.partners[id];
    return partner ? `${divisionName(id)} with ${memberName(partner)}` : divisionName(id);
  }).join(', ');
}

/** What a correction changed, in words, for the outcome line and the member's email. */
function entryChangePhrase(
  before: EntrySnapshot, after: EntrySnapshot, divisionName: (id: string) => string, memberName: (id: string) => string,
): string {
  const parts: string[] = [];
  for (const id of after.division_ids) {
    if (!before.division_ids.includes(id)) parts.push(`${divisionName(id)} added`);
  }
  for (const id of before.division_ids) {
    if (!after.division_ids.includes(id)) parts.push(`${divisionName(id)} removed`);
  }
  for (const id of after.division_ids) {
    if (!before.division_ids.includes(id)) continue;
    const was = before.partners[id] ?? null;
    const now = after.partners[id] ?? null;
    if (was === now) continue;
    parts.push(now ? `${divisionName(id)} partner ${memberName(now)}` : `${divisionName(id)} partner removed`);
  }
  if (!before.paid_at_event && after.paid_at_event) parts.push('paid at the event');
  if (before.paid_at_event && !after.paid_at_event) parts.push('paid at the event taken back');
  return parts.join(', ');
}

// ── Results and attendance helpers ─────────────────────────────────────────

/** Days a sanctioned event has after its last day to meet its after-event requirements. */
export const RESULTS_DEADLINE_DAYS = 20;
const SANCTION_BADGE_TEXT = 'Sanctioning requirements not met';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * What an event owes once it has ended. Results are owed by every event that
 * has ended; a sanctioned event also owes its after-event summary. Both are
 * due within twenty days of the event's last day, and a sanctioned event
 * with no results by then shows the badge until they are uploaded; a summary
 * not yet sent keeps the work item open without the badge. Exported for unit
 * testing.
 */
export function eventObligations(
  event: { end_date: string; sanction_status: string },
  hasResults: boolean,
  summarySent: boolean,
  today: string,
): EventObligations {
  const ended = event.end_date < today;
  const isSanctioned = event.sanction_status === 'approved';
  const deadline = addDays(event.end_date, RESULTS_DEADLINE_DAYS);
  const overdue = today > deadline;
  return {
    ended,
    isSanctioned,
    resultsOwed: ended && !hasResults,
    summaryOwed: ended && isSanctioned && !summarySent,
    deadline,
    overdue,
    showBadge: isSanctioned && !hasResults && overdue,
  };
}

/** True once an event's last day has come, from when results and attendance can be recorded. */
function lastDayHasCome(event: { end_date: string }): boolean {
  return event.end_date <= todayUtc();
}

interface AttendanceCandidateRow {
  id: string;
  member_id: string;
  registration_type: RegistrationType;
  attended_at: string | null;
  attended_marked_by_member_id: string | null;
  display_name: string;
  historical_person_id: string | null;
  tier_status: string | null;
}

/** The organizer's preview decisions, as the form sends them. */
export interface ResultsUploadInput {
  text: string;
  filename: string;
  ties: string[];
  contested: string[];
}

export type CommitResultsResult = {
  branch: 'committed' | 'own_repeat';
  rowCount: number;
  attendedCount: number;
};

export type MarkAttendedResult = { branch: 'marked' | 'own_repeat' | 'already_held'; marked: number };

/** Statuses of an event that ran: results and attendance can be recorded once its last day comes. */
const ATTENDANCE_STATUSES = ['reg_open', 'closed', 'completed'];

const CONTEST_FIELD = 'contested';
const TIE_FIELD = 'tie';

/** The preview as the page shows it, with the form fields its decisions post back as. */
function toResultsPreviewView(input: ResultsUploadInput, result: ResultsPreview, isSanctioned: boolean): ResultsPreviewView {
  const ties: ResultsPreviewView['ties'] = [];
  const contested: ResultsPreviewView['contested'] = [];
  for (const g of result.groups) {
    for (const r of g.repeatedPlaces) {
      ties.push({
        field: `${TIE_FIELD}:${ties.length}`, value: r.tieKey, checked: r.declared,
        label: `${g.name}: place ${r.place} is a tie`,
      });
    }
  }
  for (const u of result.unknownDivisions) {
    contested.push({
      field: `${CONTEST_FIELD}:${contested.length}`, value: u.key, checked: u.confirmed,
      label: `${u.name} was contested at this event`,
    });
  }
  return {
    text: input.text,
    filename: input.filename,
    fileErrors: result.fileErrors,
    problems: result.problems,
    hasProblems: result.fileErrors.length + result.problems.length > 0,
    groups: result.groups.map((g) => ({
      name: g.name,
      newLabel: g.divisionId === null ? `Not advertised${g.categoryLabel ? `: ${g.categoryLabel}` : ''}` : null,
      rows: g.placements.map((p) => ({
        place: p.place,
        tieLabel: p.isTie ? 'Tie' : null,
        competitors: p.competitors.map((c) => ({
          name: c.name,
          isMatched: c.match !== null,
          matchLabel: c.match ? 'Registered' : 'No registration found',
        })),
        score: p.score,
      })),
    })),
    ties,
    contested,
    // Only sanctioning makes every division's results owed, so only a
    // sanctioned event is told so.
    missingDivisionsText: result.missingDivisions.length > 0
      ? `No results for: ${result.missingDivisions.join(', ')}. `
        + (isSanctioned
          ? 'A sanctioned event owes results for every competition it ran; leave out only a competition that did not run.'
          : 'Leave out only a competition that did not run.')
      : null,
    rowCount: result.rowCount,
    committable: result.committable,
  };
}

/**
 * The form's decision fields back into the organizer's decisions: each tie
 * and each contested division posts under its own numbered field, because
 * the upload form is multipart and keeps one value per field name.
 */
export function resultsDecisionsFromFields(fields: Record<string, string>): { ties: string[]; contested: string[] } {
  const ties: string[] = [];
  const contested: string[] = [];
  for (const [name, value] of Object.entries(fields)) {
    if (name.startsWith(`${TIE_FIELD}:`)) ties.push(value);
    if (name.startsWith(`${CONTEST_FIELD}:`)) contested.push(value);
  }
  return { ties, contested };
}

/** Statuses whose sanction an administrator may grant or revoke by correction. */
const SANCTION_CORRECTABLE_STATUSES = ['reg_open', 'closed', 'completed'];

/** What an administrator's correction changed, or would change. */
export interface EventCorrection {
  /** 'preview' before confirming; 'unchanged' when the submission changes nothing. */
  outcome: 'preview' | 'corrected' | 'unchanged';
  changes: Array<{ label: string; before: string; after: string }>;
}

// Each stored field's name in words, as a sentence names it: field, label.
const CORRECTION_LABELS: Record<string, string> = Object.fromEntries([
  ['title', 'title'],
  ['description', 'description'],
  ['start_date', 'first day'],
  ['end_date', 'last day'],
  ['city', 'city'],
  ['region', 'region'],
  ['country', 'country'],
  ['registration_deadline', 'registration deadline'],
  ['is_tshirt_size_collected', 'collecting t-shirt sizes'],
  ['is_attendee_registration_open', 'letting spectators register'],
  ['competitor_fee_cents', 'competitor fee'],
  ['attendee_fee_cents', 'spectator fee'],
  ['sanction_status', 'IFPA sanction'],
  ['payment_enabled', 'online payment'],
  ['division_name', 'competition name'],
  ['team_type', 'singles or doubles'],
  ['gender_eligibility', 'who may enter'],
  ['division_class', 'skill level'],
  ['offers_prize_money', 'prize money'],
  ['division', 'competition'],
  ['division_entries', 'entries in the competition'],
]);

const FLAG_FIELDS = new Set(['is_tshirt_size_collected', 'is_attendee_registration_open', 'payment_enabled', 'offers_prize_money']);
const FEE_FIELDS = new Set(['competitor_fee_cents', 'attendee_fee_cents']);

// Collects the fields a correction changes, with their stored values for the
// audit row and readable values for the preview.
class CorrectionChanges {
  private readonly stored: Record<string, { before: unknown; after: unknown }> = {};
  constructor(private readonly currency: string) {}

  note(field: string, before: unknown, after: unknown): void {
    if (before !== after) this.stored[field] = { before, after };
  }

  isEmpty(): boolean {
    return Object.keys(this.stored).length === 0;
  }

  forAudit(): Record<string, { before: unknown; after: unknown }> {
    return this.stored;
  }

  /** "title, city and competitor fee": the changed fields in words, for the organizers' notice. */
  phrase(): string {
    const labels = Object.keys(this.stored).map((f) => CORRECTION_LABELS[f] ?? f);
    return labels.length <= 1 ? labels.join('') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  }

  result(preview: boolean): EventCorrection {
    return {
      outcome: preview ? 'preview' : this.isEmpty() ? 'unchanged' : 'corrected',
      changes: Object.entries(this.stored).map(([field, v]) => {
        const label = CORRECTION_LABELS[field] ?? field;
        return {
          label: label.charAt(0).toUpperCase() + label.slice(1),
          before: this.show(field, v.before),
          after: this.show(field, v.after),
        };
      }),
    };
  }

  private show(field: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return '(none)';
    if (FLAG_FIELDS.has(field)) return value === 1 ? 'Yes' : 'No';
    if (FEE_FIELDS.has(field)) return formatFee(value as number, this.currency);
    if (field === 'sanction_status') return value === 'approved' ? 'Sanctioned' : value === 'none' ? 'Not sanctioned' : String(value);
    return String(value);
  }
}

/** The participant email as typed, checked and cleaned. */
function readParticipantEmail(input: { subject: string; bodyText: string; sendToken: string }): {
  subject: string; bodyText: string; sendToken: string;
} {
  const subject = sanitizeUserText(input.subject ?? '', 'single_line');
  const body = sanitizeUserText(input.bodyText ?? '', 'multi_line');
  const fieldErrors: Record<string, string> = {};
  if (subject.status !== 'ok') fieldErrors.subject = INVALID_TEXT_ENCODING_MESSAGE;
  else if (subject.text === '') fieldErrors.subject = 'Enter a subject.';
  else if (subject.text.length > PARTICIPANT_SUBJECT_MAX) fieldErrors.subject = `The subject can be at most ${PARTICIPANT_SUBJECT_MAX} characters.`;
  if (body.status !== 'ok') fieldErrors.bodyText = INVALID_TEXT_ENCODING_MESSAGE;
  else if (body.text === '') fieldErrors.bodyText = 'Enter a message.';
  else if (body.text.length > PARTICIPANT_BODY_MAX) fieldErrors.bodyText = `The message can be at most ${PARTICIPANT_BODY_MAX} characters.`;
  const sendToken = (input.sendToken ?? '').trim();
  // Without it the send has no key, and the same form submitted twice would
  // mail every participant twice.
  if (!sendToken) fieldErrors.bodyText = 'This form has expired. Open the email page again and resend.';
  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('Please fix the errors below.', { fieldErrors });
  }
  return {
    subject: subject.status === 'ok' ? subject.text : '',
    bodyText: body.status === 'ok' ? body.text : '',
    sendToken,
  };
}

/** The outbox key of one send: the form's token and what it says. */
function participantEmailKey(eventId: string, senderId: string, compose: { subject: string; bodyText: string; sendToken: string }): string {
  const fingerprint = createHash('sha256')
    .update(JSON.stringify([senderId, compose.subject, compose.bodyText]))
    .digest('hex')
    .slice(0, 16);
  return `event-email:${eventId}:${compose.sendToken}:${fingerprint}`;
}

/** The message as participants receive it: the organizer's words, then who sent it and why. */
function participantEmailBody(body: string, eventTitle: string, senderName?: string): string {
  const sender = senderName ? `${senderName}, an organizer of ${eventTitle},` : `An organizer of ${eventTitle}`;
  return `${body}\n\n--\n${sender} sent this to the event's confirmed participants through footbag.org. You received it because you registered for the event.`;
}

export class EventService {
  listPublicUpcomingEvents(nowIso: string): PublicEventSummary[] {
    return runSqliteRead('listPublicUpcomingEvents', () => {
      const rows = publicEvents.listUpcoming.all(nowIso) as PublicEventSummaryRow[];
      return rows.map((row) => toPublicEventSummary(row, nowIso));
    });
  }

  /** Upcoming public events as listed items, sorted by start date. */
  listUpcomingEventItems(nowIso: string): DatedItemView[] {
    return runSqliteRead('listUpcomingEventItems', () => {
      const rows = publicEvents.listUpcoming.all(nowIso) as PublicEventSummaryRow[];
      const covers = eventCoverPhotos(rows.map((row) => row.event_id));
      return rows.map((row) => toEventDatedItem(row, {
        todayIso: nowIso,
        galleryHref: mediaService.getEntityGalleryHref(row.tag_normalized),
        thumbUrl: covers.get(row.event_id)?.thumbUrl ?? null,
      }));
    });
  }

  /** One year's completed public events as listed items, sorted by start date. */
  listCompletedEventItemsByYear(year: number): DatedItemView[] {
    assertArchiveYear(year);
    return runSqliteRead('listCompletedEventItemsByYear', () => {
      const rows = publicEvents.listCompletedByYear.all(year) as PublicCompletedEventSummaryRow[];
      const covers = eventCoverPhotos(rows.map((row) => row.event_id));
      return rows.map((row) => toEventDatedItem(row, {
        todayIso: '',
        galleryHref: mediaService.getEntityGalleryHref(row.tag_normalized),
        thumbUrl: covers.get(row.event_id)?.thumbUrl ?? null,
      }));
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
        upcomingEvents: this.listUpcomingEventItems(nowIso),
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
        contextLinks: [{ label: 'Back to Footbag Events', href: '/events' }],
      },
      content: {
        year,
        events: this.listCompletedEventItemsByYear(year),
      },
    };
  }

  /**
   * The canonical event page. `viewer` is who is looking: a signed-in member also
   * sees each organizer's email, who is registered, and their own registration.
   * A visitor, or a signed-in registrant still onboarding (`onboardingMemberId`),
   * sees instead what registering takes: membership, then log-in or onboarding.
   */
  getPublicEventPage(
    eventKey: string,
    viewer: { isMember: boolean; memberId?: string; onboardingMemberId?: string } = { isMember: false },
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
    const registrationPrompt = isUpcoming && !viewer.isMember
      ? this.registrationPromptFor(eventKey, viewer.onboardingMemberId)
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
    // The cover is the page's share image too, absolute because a social
    // preview is fetched from outside the site.
    const cover = runSqliteRead('eventCoverPhoto', () => eventCoverPhotos([detail.event.eventId]))
      .get(detail.event.eventId) ?? null;
    return {
      seo: {
        title: detail.event.standardTagDisplay,
        // Composed from the event's own facts, so a search result names what,
        // when and where whether or not the organizer wrote a description.
        description: `${detail.event.title}, ${eventDatesPhrase(detail.event.startDate, detail.event.endDate)}, `
          + `${[detail.event.city, detail.event.region, detail.event.country].filter((p) => p).join(', ')}.`,
        ...(cover ? { imageUrl: cover.absoluteDisplayUrl } : {}),
      },
      page: { sectionKey: 'events', pageKey: 'event_detail', title: detail.event.title },
      navigation: {
        contextLinks: [backLink],
      },
      content: {
        ...detail,
        disciplineGroups: groupDisciplinesByCategory(detail.disciplines),
        dateRange: eventDateRange(detail.event.startDate, detail.event.endDate),
        showResults: !isUpcoming,
        organizers,
        registration,
        registrationPrompt,
        notice: opts.notice ?? null,
        coverPhoto: cover ? coverPhotoImage(cover, detail.event.title) : null,
      },
    };
  }

  // What a non-member sees where a member would register. The register form is
  // member-only, so log-in returns a visitor straight to it.
  private registrationPromptFor(eventKey: string, onboardingMemberId: string | undefined): MembershipPromptView {
    const event = this.findEventByKey(eventKey) as EventRow;
    const offered = isRegistrationOffered(
      { ...event, has_enterable_division: this.hasEnterableDivision(event.id) ? 1 : 0 },
      new Date().toISOString(),
    );
    if (!offered) return { text: REGISTRATION_NOT_OPEN, actions: [] };
    if (onboardingMemberId) {
      return onboardingMembershipPrompt(REGISTER_NEEDS_ONBOARDING, onboardingMemberId);
    }
    return visitorMembershipPrompt(
      REGISTER_NEEDS_MEMBERSHIP, 'Log In to Register', `/events/${encodeURIComponent(eventKey)}/register`,
    );
  }

  // The event page's registration section for a signed-in member.
  private registrationBlock(eventKey: string, memberId: string): EventRegistrationBlock {
    const event = this.findEventByKey(eventKey) as EventRow;
    const base = `/events/${encodeURIComponent(eventKey)}`;
    const today = new Date().toISOString();
    const own = eventRegistrations.findForMember.get(event.id, memberId) as OwnRegistrationRow | undefined;
    const holds = own && own.status !== 'canceled';
    const open = isRegistrationOpen(event, today) && this.typesFor(event, own).length > 0;
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
        statusLabel: own.status === 'pending' ? 'Awaiting payment' : null,
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
   * `form` is what the member submitted, shown again with the refusal, or
   * with no message when a partner picker control asked for the form again;
   * `picker` is that control's request. Nothing is written, though a search
   * spends a member-search slot.
   */
  getRegisterPage(
    eventKey: string,
    memberId: string,
    form?: { input: RegistrationInput; message: string | null },
    picker?: PickerRequest,
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
    const self = eventRegistrations.findMemberById.get(memberId) as MemberRow | undefined;
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
    const formAction = `${base}/register`;
    const intent = picker?.intent ?? null;
    // Each doubles division's partner: the member a Choose just named, else the
    // one the form carried. An id the search could not offer is dropped, so
    // the form never shows or posts back a partner the registration refuses.
    const partnerPicker = (d: DivisionRow): MemberPickerView => {
      const key = `partner-${d.id}`;
      const chosenId = intent?.kind === 'choose' && intent.key === key
        ? intent.memberId
        : input?.partners.find((p) => p.divisionId === d.id)?.memberId ?? '';
      const partner = chosenId !== '' ? findSearchableMember(chosenId) : null;
      return buildMemberPicker({
        formId: REGISTER_FORM_ID,
        formAction,
        fieldName: 'partner',
        fieldKey: key,
        label: 'Partner',
        searchLabel: "Partner's name",
        openLabel: 'Choose Partner',
        rowAction: { label: 'Choose', completes: false, ariaLabel: (name) => `Choose ${name} as partner for ${d.name}` },
        chosen: partner && partner.id !== memberId ? toPickerMember(partner) : null,
        intent,
        openOnLoad: false,
        query: picker?.query ?? '',
        search: runPickerSearch(picker, key, memberId, [memberId]),
        notFoundHint: 'Your partner needs a footbag.org account and must appear in member search.',
      });
    };
    const page: PageViewModel<RegisterEventContent> = {
      seo: { title: `Register for ${event.title}`, noindex: true },
      page: { sectionKey: 'events', pageKey: 'event_register', title: `Register for ${event.title}` },
      navigation: { contextLinks: [{ label: `Back to ${event.title}`, href: base }] },
      content: {
        formId: REGISTER_FORM_ID,
        formAction,
        cancelHref: base,
        eventDates: eventDatesPhrase(event.start_date, event.end_date),
        typeChoices: types.length > 1
          ? types.map((t) => ({ value: t, label: typeLabel(t), checked: t === chosenType }))
          : null,
        impliedTypeLabel: types.length === 1 ? typeLabel(types[0]) : null,
        impliedType: types.length === 1 ? types[0] : null,
        showDivisions: types.includes('competitor') && divisions.length > 0,
        divisions: divisions.map((d) => {
          const gated = d.gender_eligibility === 'women' || d.gender_eligibility === 'mixed';
          return {
            id: d.id,
            name: d.name,
            checked: input?.divisionIds.includes(d.id) ?? false,
            partnerPicker: d.team_type === 'doubles' ? partnerPicker(d) : null,
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
  // A competitor is offered only when the event has a division to enter, so
  // an event with none says registration is not open rather than offering a
  // form that refuses every competitor.
  private typesFor(event: EventRow, own: OwnRegistrationRow | undefined): RegistrationType[] {
    const paid = paidTypeHeld(own);
    const enterable = this.hasEnterableDivision(event.id);
    return offeredRegistrationTypes(event)
      .filter((t) => paid === null || t === paid)
      .filter((t) => t !== 'competitor' || enterable);
  }

  private hasEnterableDivision(eventId: string): boolean {
    const rows = publicEvents.listDisciplinesByEventId.all(eventId) as Array<{ is_aggregate_standing: number }>;
    return rows.some((d) => d.is_aggregate_standing !== 1);
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

    const self = eventRegistrations.findMemberById.get(memberId) as MemberRow | undefined;
    if (!self) throw new NotFoundError('Member not found.');
    const entries: Array<{ division: DivisionRow; partnerMemberId: string | null; amateur: boolean; view: RegistrationEntryView }> = [];
    if (type === 'competitor') {
      const divisions = eventWrites.listDivisions.all(event.id) as DivisionRow[];
      const chosen = divisions.filter((d) => input.divisionIds.includes(d.id));
      if (chosen.length === 0) throw new ValidationError('Choose at least one competition to enter.');
      for (const division of chosen) {
        let partnerMember: MemberRow | null = null;
        if (division.team_type === 'doubles') {
          const chosenId = input.partners.find((p) => p.divisionId === division.id)?.memberId ?? '';
          if (chosenId.trim() === '') {
            throw new ValidationError(`${division.name} is played in doubles: search for your partner by name and choose them.`);
          }
          if (chosenId.trim() === memberId) throw new ValidationError(`Your ${division.name} partner has to be someone else.`);
          // Only a member the partner search can offer is a partner; any other
          // id the form carries is refused as if no member had been chosen.
          partnerMember = findSearchableMember(chosenId);
          if (!partnerMember) {
            throw new ValidationError(`Your ${division.name} partner must be a footbag.org member. Search for them by name and choose them.`);
          }
        }
        const refusal = checkDivisionEligibility(division, self.gender, partnerMember && { gender: partnerMember.gender });
        if (refusal) throw new ValidationError(refusal);
        const amateur = division.offers_prize_money === 1 && input.amateurIds.includes(division.id);
        entries.push({
          division,
          partnerMemberId: partnerMember?.id ?? null,
          amateur,
          view: {
            divisionName: division.name,
            partnerName: partnerMember?.display_name ?? null,
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
            registrationId, e.division.id, e.partnerMemberId, e.amateur ? 1 : 0,
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
          registrationId, e.division.id, e.partnerMemberId, e.amateur ? 1 : 0,
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

    const self = eventRegistrations.findMemberById.get(memberId) as MemberRow | undefined;
    const organizers = eventOrganizers.listForEvent.all(event.id) as Array<{ member_id: string }>;
    transaction(() => {
      eventRegistrations.cancel.run(WITHDRAWN_BY_MEMBER, now, now, memberId, own.id);
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
      throw new ForbiddenError('Creating an event is a Tier 1 (IFPA Member) benefit.');
    }
    const fieldErrors: Record<string, string> = {};
    const isSanctioned = values.eventType === 'sanctioned';
    if (values.eventType !== 'free' && values.eventType !== 'sanctioned') {
      fieldErrors.event_type = 'Choose a free event or a sanctioned event.';
    } else if (isSanctioned && !isTier2Plus(actorMemberId)) {
      fieldErrors.event_type = 'A sanctioned event, and any registration fee, takes Tier 2 (IFPA Organizer Member) or Tier 3 (IFPA Director).';
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
    opts: {
      notice?: OutcomeNoticeView | null;
      detailsForm?: { values: EventFormValues; fieldErrors: Record<string, string>; message: string };
      /** A control of the organizer picker, drawing the page again with nothing saved. */
      organizerPicker?: PickerRequest;
    } = {},
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
        intro: 'Every organizer of this event can change its details, its competitions and its organizers.',
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
        organizerCap: ORGANIZER_CAP,
        addOrganizerAction: `${base}/organizers`,
        addOrganizerFormId: ADD_ORGANIZER_FORM_ID,
        organizerPicker: organizers.length < ORGANIZER_CAP
          ? buildMemberPicker({
            formId: ADD_ORGANIZER_FORM_ID,
            formAction: `${base}/organizers`,
            fieldName: 'member_id',
            fieldKey: 'organizer',
            label: 'Organizer',
            searchLabel: "New organizer's name",
            openLabel: 'Add Organizer',
            rowAction: { label: 'Add Organizer', completes: true, ariaLabel: (name) => `Add Organizer: ${name}` },
            chosen: null,
            intent: opts.organizerPicker?.intent ?? null,
            openOnLoad: true,
            query: opts.organizerPicker?.query ?? '',
            search: runPickerSearch(opts.organizerPicker, 'organizer', viewerMemberId, organizers.map((o) => o.member_id)),
            notFoundHint: null,
          })
          : null,
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
        results: ATTENDANCE_STATUSES.includes(event.status)
          ? (() => {
            const obligations = this.getEventObligations(event);
            const open = lastDayHasCome(event);
            const hasResults = (eventResults.countEntries.get(event.id) as { n: number }).n > 0;
            return {
              statusLine: !open
                ? `Results can be uploaded from the event's last day, ${event.end_date}.`
                : hasResults
                  ? 'Results are published on the event page. You can upload results for a competition that has none yet, and confirm who attended.'
                  : `Upload the results, then confirm who attended. Results are due by ${obligations.deadline}.`,
              badge: obligations.showBadge ? SANCTION_BADGE_TEXT : null,
              uploadHref: open ? `${base}/results` : null,
              attendanceHref: open ? `${base}/attendance` : null,
              summaryLine: obligations.summaryOwed
                ? `Send a short summary of the event to the IFPA announce list by ${obligations.deadline}, marked as this event's summary on the Send Announcement form.`
                : null,
              summaryHref: obligations.summaryOwed && isTier2Plus(viewerMemberId)
                ? `/members/${encodeURIComponent(this.slugFor(organizers, viewerMemberId))}/announce`
                : null,
            };
          })()
          : null,
        participants: isPublic
          ? {
            participantsHref: `${base}/participants`,
            summaryHref: `${base}/summary`,
            emailHref: `${base}/email`,
            checkInHref: `${base}/check-in-sheet`,
          }
          : null,
        closeRegistrationAction: event.status === 'reg_open' ? `${base}/close-registration` : null,
        cancelEventAction: event.status === 'completed' || event.status === 'canceled' ? null : `${base}/cancel`,
        deleteEventAction: this.deletionBlockedText(event) === null ? `${base}/delete` : null,
        terminalNote: event.status === 'canceled'
          ? 'This event was canceled. Its record is kept, and it takes no further changes.'
          : event.status === 'completed' ? 'This event\'s results are published, so it can no longer be canceled or deleted.' : null,
        coverPhoto: this.coverPhotoSection(event, base, viewerMemberId),
      },
    };
  }

  // The manage page's Cover Photo section. The controls follow the Share Media
  // gate, Tier 1 benefits, and a canceled event takes no changes.
  private coverPhotoSection(event: EventRow, base: string, viewerMemberId: string): CoverPhotoSection {
    const cover = eventCoverPhotos([event.id]).get(event.id) ?? null;
    const mayChange = event.status !== 'canceled' && hasTier1Benefits(viewerMemberId);
    return {
      thumbUrl: cover?.thumbUrl ?? null,
      thumbAlt: cover ? coverPhotoImage(cover, event.title).alt : '',
      uploadAction: mayChange ? `${base}/cover-photo` : null,
      removeAction: mayChange && cover ? `${base}/cover-photo/remove` : null,
    };
  }

  /**
   * Upload a photo and make it the event's cover. The photo is the organizer's
   * own, tagged with the event's hashtag, through the Share Media photo path;
   * the upload runs before, and outside, the transaction that moves the
   * pointer. The earlier cover photo, if any, stays in the gallery. The same
   * file submitted again is the first submit's success.
   */
  async uploadCoverPhoto(uploader: CoverPhotoUploader, eventKey: string, file: CoverPhotoFile): Promise<CoverPhotoChange> {
    const event = this.requireOrganizedEvent(eventKey, uploader.memberId);
    if (event.status === 'canceled') {
      return { branch: 'refused', message: 'This event is canceled, so it can no longer be changed.', httpStatus: 422 };
    }
    const upload = await uploadEntityCoverPhoto(uploader, event.tag_normalized, file);
    if (upload.status === 'refused') return refusedCoverChange(upload);
    return this.pointCoverAt(uploader.memberId, eventKey, upload.mediaId);
  }

  // Move the event's cover pointer to a photo that carries its hashtag. A
  // pointer already there is this organizer's own standing act, or a state
  // another act left.
  private pointCoverAt(actorMemberId: string, eventKey: string, mediaId: string): CoverPhotoChange {
    return transaction((): CoverPhotoChange => {
      const event = this.requireOrganizedEvent(eventKey, actorMemberId);
      const current = (eventWrites.findCoverMediaId.get(event.id) as { cover_media_id: string | null }).cover_media_id;
      if (current === mediaId) {
        const own = findStandingOwnAct(
          actorMemberId, 'event.cover_photo_set', 'event.cover_photo_removed', 'event', event.id,
          { metadataKey: 'media_id', id: mediaId },
        );
        return { branch: own ? 'own_repeat' : 'already_held' };
      }
      if (!isCoverCandidate(mediaId, event.tag_normalized)) {
        return { branch: 'refused', message: 'That photo does not carry the event\'s hashtag.', httpStatus: 422 };
      }
      const now = new Date().toISOString();
      eventWrites.setCoverMedia.run(mediaId, now, actorMemberId, event.id);
      appendAuditEntry({
        actionType: 'event.cover_photo_set',
        actorType: 'member',
        actorMemberId,
        entityType: 'event',
        entityId: event.id,
        metadata: { media_id: mediaId, previous_media_id: current },
      });
      return { branch: 'changed' };
    });
  }

  /**
   * Clear the event's cover pointer. The photo itself is not deleted; it stays
   * in the gallery. Removing a cover already gone repeats cleanly.
   */
  removeCoverPhoto(actorMemberId: string, eventKey: string): CoverPhotoChange {
    const event = this.requireOrganizedEvent(eventKey, actorMemberId);
    if (!hasTier1Benefits(actorMemberId)) {
      throw new ForbiddenError('Tier 1 benefits required to manage member-owned media.');
    }
    if (event.status === 'canceled') {
      return { branch: 'refused', message: 'This event is canceled, so it can no longer be changed.', httpStatus: 422 };
    }
    return transaction((): CoverPhotoChange => {
      const current = (eventWrites.findCoverMediaId.get(event.id) as { cover_media_id: string | null }).cover_media_id;
      if (current === null) {
        const own = findStandingOwnAct(actorMemberId, 'event.cover_photo_removed', 'event.cover_photo_set', 'event', event.id);
        return { branch: own ? 'own_repeat' : 'already_held' };
      }
      const now = new Date().toISOString();
      eventWrites.setCoverMedia.run(null, now, actorMemberId, event.id);
      appendAuditEntry({
        actionType: 'event.cover_photo_removed',
        actorType: 'member',
        actorMemberId,
        entityType: 'event',
        entityId: event.id,
        metadata: { previous_media_id: current },
      });
      return { branch: 'changed' };
    });
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
    if (input.divisionId && !existing) throw new ValidationError('That competition is no longer on this event.');
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
      throw new ValidationError(`This event already has a competition named ${clash.name}.`);
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

  /** Add a member as an organizer: a member the organizer picker's search can offer, by id. */
  addOrganizer(actorMemberId: string, eventKey: string, memberId: string): { branch: 'added' | 'own_repeat' | 'already_held'; name: string } {
    const event = this.requireOrganizedEvent(eventKey, actorMemberId);
    assertManageable(event);
    if (memberId.trim() === '') throw new ValidationError('Search for the member by name, then press Add Organizer.');
    const member = findSearchableMember(memberId);
    if (!member) throw new ValidationError('Only a footbag.org member listed in member search can be added as an organizer.');

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
      { label: 'Requester holds Tier 2 (IFPA Organizer Member) or Tier 3 (IFPA Director)', value: submitter && isTier2Plus(submitter) ? 'Yes' : 'No' },
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
        history: (eventOrganizers.listHistoryForMember.all(o.member_id, event.id) as Array<{
          id: string; title: string; start_date: string; end_date: string; status: string; sanction_status: string;
        }>).map((h) => ({
          title: h.title,
          dates: eventDatesPhrase(h.start_date, h.end_date),
          statusLabel: EVENT_STATUS_LABELS[h.status] ?? h.status,
          sanctionedLabel: h.sanction_status === 'approved' ? 'IFPA-sanctioned' : null,
        })),
      })),
      deviations: event.sanction_deviations,
      divisions: divisions.map((d) => ({
        name: d.name,
        parts: [
          `What is played: ${divisionGameName(d, games)}`,
          d.team_type === 'doubles' ? 'Doubles' : 'Singles',
          `Gender: ${genderLabel(d.gender_eligibility)}`,
          `Skill level: ${classLabel(d.division_class)}`,
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

  // ── Organizer management: cancel, close, delete ────────────────────────────
  //
  // Each cancellation is one method with two doors: an organizer acts on an
  // event they organize, found by its key, and an administrator on any event,
  // found by its id. Only who may act and how the event is found differ; the
  // reason, the notices, the status move and the audit row are the same.

  /** An organizer cancels their event, after confirming with a reason. */
  cancelEvent(memberId: string, eventKey: string, rawReason: string, confirmed: boolean): Promise<CancelEventResult> {
    const event = this.requireOrganizedEvent(eventKey, memberId);
    return this.cancelEventAs({ kind: 'organizer', memberId }, event, rawReason, confirmed);
  }

  /** An administrator cancels any event, with the organizer's own notices and trail. */
  adminCancelEvent(adminMemberId: string, eventId: string, rawReason: string, confirmed: boolean): Promise<CancelEventResult> {
    return this.cancelEventAs({ kind: 'admin', memberId: adminMemberId }, this.requireEventById(eventId), rawReason, confirmed);
  }

  /** An organizer cancels one registration in their event. */
  cancelRegistration(
    memberId: string, eventKey: string, registrationId: string, rawReason: string, confirmed: boolean,
  ): Promise<CancelRegistrationResult> {
    const event = this.requireOrganizedEvent(eventKey, memberId);
    return this.cancelRegistrationAs({ kind: 'organizer', memberId }, event, registrationId, rawReason, confirmed);
  }

  /** An administrator cancels any registration, as an organizer would. */
  adminCancelRegistration(
    adminMemberId: string, eventId: string, registrationId: string, rawReason: string, confirmed: boolean,
  ): Promise<CancelRegistrationResult> {
    return this.cancelRegistrationAs(
      { kind: 'admin', memberId: adminMemberId }, this.requireEventById(eventId), registrationId, rawReason, confirmed,
    );
  }

  /**
   * Close the registration window for good: the event moves from `reg_open`
   * to `closed`. The online-registration switch is the reversible pause.
   */
  /**
   * The deadline job's pass: closes registration on every open event whose
   * cutoff (the deadline, or the start date when none is set) is before
   * today, the same transition an organizer's close makes, with no mail. A
   * repeat changes nothing, since only an event still open is touched. Each
   * transition is audited as the system's act with the cutoff it passed.
   */
  closeDueRegistrations(now: Date): CloseDueRegistrationsResult {
    const nowIso = now.toISOString();
    const due = eventWrites.listDueToCloseRegistration.all(nowIso) as Array<{
      id: string; registration_deadline: string | null; start_date: string;
    }>;
    const closedEventIds: string[] = [];
    for (const event of due) {
      transaction(() => {
        if (eventWrites.closeRegistration.run(nowIso, SYSTEM_ACTOR, event.id).changes !== 1) return;
        appendAuditEntry({
          actionType: 'event.registration_closed',
          actorType: 'system',
          actorMemberId: null,
          entityType: 'event',
          entityId: event.id,
          metadata: { before: 'reg_open', after: 'closed', cutoff: registrationCutoff(event) },
        });
        closedEventIds.push(event.id);
      });
    }
    return { closedEventIds };
  }

  closeRegistration(
    memberId: string, eventKey: string, confirmed: boolean,
  ): { branch: 'needs_confirmation' | 'closed' | 'own_repeat' | 'already_held'; eventTitle: string } {
    const event = this.requireOrganizedEvent(eventKey, memberId);
    if (event.status === 'closed') {
      const own = findStandingOwnAct(memberId, 'event.registration_closed', 'event.registration_closed', 'event', event.id);
      return { branch: own ? 'own_repeat' : 'already_held', eventTitle: event.title };
    }
    if (event.status !== 'reg_open') {
      throw new ValidationError('Registration can be closed only while the event is open for registration.');
    }
    if (!confirmed) return { branch: 'needs_confirmation', eventTitle: event.title };
    const now = new Date().toISOString();
    let closed = false;
    transaction(() => {
      closed = eventWrites.closeRegistration.run(now, memberId, event.id).changes === 1;
      if (!closed) return;
      appendAuditEntry({
        actionType: 'event.registration_closed',
        actorType: 'member',
        actorMemberId: memberId,
        entityType: 'event',
        entityId: event.id,
        metadata: { before: 'reg_open', after: 'closed' },
      });
    });
    return { branch: closed ? 'closed' : 'already_held', eventTitle: event.title };
  }

  /**
   * Delete an event that never took a registration, carries no results, granted
   * no attendance and sent no participant email, in any status but awaiting
   * sanction approval or completed. Anything else is canceled instead, so its
   * record and its registrants' history survive. Nobody is emailed: an event
   * that never took a registration has no registrant to tell.
   */
  deleteEvent(memberId: string, eventKey: string, rawReason: string, confirmed: boolean): DeleteEventResult {
    const event = this.findEventByKey(eventKey);
    if (!event) {
      // The event row is gone: this organizer's own deletion is the first
      // submit's success, and anything else is the standard not-found.
      if (PUBLIC_EVENT_KEY_PATTERN.test(eventKey) && eventWrites.findOwnDeletionByTag.get(memberId, `#${eventKey}`)) {
        return { branch: 'deleted' };
      }
      throw new NotFoundError('Event not found.');
    }
    if (!eventOrganizers.isCurrentOrganizer.get(event.id, memberId)) throw new NotFoundError('Event not found.');
    const blocked = this.deletionBlockedText(event);
    if (blocked) throw new ValidationError(blocked);
    if (!confirmed) return { branch: 'needs_confirmation', eventTitle: event.title };
    const reason = requireReason(rawReason);
    let deleted = false;
    transaction(() => {
      // Read again inside the transaction: a registration that landed since
      // the check above keeps the event.
      if (this.deletionBlockedText(event)) return;
      eventWrites.deleteDivisionsForEvent.run(event.id);
      eventWrites.deleteOrganizersForEvent.run(event.id);
      deleted = eventWrites.deleteEvent.run(event.id).changes === 1;
      if (!deleted) throw new Error(`event ${event.id} changed between its read and its deletion`);
      appendAuditEntry({
        actionType: 'event.deleted',
        actorType: 'member',
        actorMemberId: memberId,
        entityType: 'event',
        entityId: event.id,
        reasonText: reason,
        metadata: { tag_normalized: event.tag_normalized, title: event.title, before_status: event.status },
      });
    });
    if (!deleted) throw new ValidationError(DELETE_HAS_REGISTRATIONS);
    return { branch: 'deleted' };
  }

  private deletionBlockedText(event: EventRow): string | null {
    if (event.status === 'pending_approval') {
      return 'This event is waiting for its sanction decision, so it cannot be deleted now. You can cancel it instead.';
    }
    if (event.status === 'completed') return 'A completed event is kept as a permanent record and cannot be deleted.';
    const b = eventWrites.deletionBlockers.get(event.id, event.id, event.id, event.id, event.id) as {
      registrations: number; results: number; attendance_grants: number; participant_emails: number;
    };
    if (b.registrations > 0) return DELETE_HAS_REGISTRATIONS;
    if (b.results > 0 || b.attendance_grants > 0) return 'This event has results, so it is kept as a permanent record and cannot be deleted.';
    if (b.participant_emails > 0) return 'This event has emailed its participants, so it is kept and cannot be deleted. You can cancel it instead.';
    return null;
  }

  private async cancelEventAs(
    actor: EventActor, event: EventRow, rawReason: string, confirmed: boolean,
  ): Promise<CancelEventResult> {
    if (event.status === 'canceled') {
      const own = findStandingOwnAct(actor.memberId, 'event.canceled', 'event.canceled', 'event', event.id);
      const same = cleanReason(rawReason) === (event.cancel_reason ?? '');
      return { branch: own && same ? 'own_repeat' : 'already_held', eventTitle: event.title, notified: 0 };
    }
    if (event.status === 'completed') throw new ValidationError('A completed event cannot be canceled.');
    const standing = eventRegistrations.listStandingForEvent.all(event.id) as StandingRegistrationRow[];
    // An administrator gives the reason on the record before the confirm
    // page; an organizer gives it on the confirm page itself.
    if (!confirmed && actor.kind === 'admin') requireReason(rawReason);
    if (!confirmed) {
      return {
        branch: 'needs_confirmation',
        eventTitle: event.title,
        registrantCount: standing.length,
        hasPaid: standing.some((r) => r.payment_status === 'succeeded'),
      };
    }
    const reason = requireReason(rawReason);

    // A registration waiting at checkout ends its checkout first, as a
    // withdrawal does; one paid meanwhile settles by its webhook and is told
    // of the cancellation with everyone else.
    const released = new Set<string>();
    for (const r of standing) {
      if (r.status === 'pending' && r.payment_id && await paymentService.closeEventRegistrationCheckout(r.payment_id)) {
        released.add(r.payment_id);
      }
    }

    const actorType = actor.kind === 'admin' ? 'admin' : 'member';
    const organizers = eventOrganizers.listForEvent.all(event.id) as Array<{ member_id: string; display_name: string }>;
    const eventDates = eventDatesPhrase(event.start_date, event.end_date);
    const now = new Date().toISOString();
    let canceled = false;
    let notified = 0;
    transaction(() => {
      canceled = eventWrites.cancelEvent.run(now, reason, actor.memberId, now, actor.memberId, event.id).changes === 1;
      if (!canceled) return;
      let pendingCanceled = 0;
      for (const r of standing) {
        if (r.status !== 'pending') continue;
        pendingCanceled += eventRegistrations.cancel.run(EVENT_CANCELED, now, now, actor.memberId, r.id).changes;
        if (r.payment_id && released.has(r.payment_id)) {
          paymentService.releaseEventRegistrationCheckoutInTx(r.payment_id, actor.memberId, 'released by the event being canceled', actorType);
        }
      }
      const item = workQueue.findOpenByEntity.get(SANCTION_TASK_TYPE, 'event', event.id) as { id: string } | undefined;
      if (item) workQueue.closeReview.run(now, actor.memberId, 'The event was canceled.', now, actor.memberId, item.id);

      // Every registrant and every organizer, once each.
      const recipients = new Map<string, { name: string; paid: boolean }>();
      for (const r of standing) recipients.set(r.member_id, { name: r.display_name, paid: r.payment_status === 'succeeded' });
      for (const o of organizers) {
        if (!recipients.has(o.member_id)) recipients.set(o.member_id, { name: o.display_name, paid: false });
      }
      const auditId = appendAuditEntry({
        actionType: 'event.canceled',
        actorType,
        actorMemberId: actor.memberId,
        entityType: 'event',
        entityId: event.id,
        reasonText: reason,
        metadata: {
          before_status: event.status,
          registrants: standing.length,
          pending_canceled: pendingCanceled,
          work_queue_item_id: item?.id ?? null,
        },
      });
      for (const [memberId, r] of recipients) {
        const sent = emailService.sendActNotice({
          template: 'event_canceled',
          params: {
            memberName: r.name, eventTitle: event.title, eventDates,
            byAdministrator: actor.kind === 'admin', reason, paid: r.paid,
          },
          memberId,
          actId: auditId,
        });
        if (sent) notified += 1;
      }
    });
    return { branch: canceled ? 'canceled' : 'already_held', eventTitle: event.title, notified };
  }

  private async cancelRegistrationAs(
    actor: EventActor, event: EventRow, registrationId: string, rawReason: string, confirmed: boolean,
  ): Promise<CancelRegistrationResult> {
    const reg = eventRegistrations.findForEventById.get(registrationId, event.id) as EventRegistrationRow | undefined;
    if (!reg) throw new NotFoundError('Registration not found.');
    if (reg.status === 'canceled') {
      const own = findStandingOwnAct(
        actor.memberId, 'event.registration_canceled', 'event.registration_canceled', 'event', event.id,
        { metadataKey: 'registration_id', id: reg.id },
      );
      const same = cleanReason(rawReason) === (reg.cancel_reason ?? '');
      return { branch: own && same ? 'own_repeat' : 'already_held', eventTitle: event.title, memberName: reg.display_name };
    }
    assertManageable(event);
    const isPaid = reg.payment_status === 'succeeded';
    if (!confirmed && actor.kind === 'admin') requireReason(rawReason);
    if (!confirmed) return { branch: 'needs_confirmation', eventTitle: event.title, memberName: reg.display_name, isPaid };
    const reason = requireReason(rawReason);
    const release = reg.status === 'pending' && reg.payment_id !== null
      && await paymentService.closeEventRegistrationCheckout(reg.payment_id);
    const actorType = actor.kind === 'admin' ? 'admin' : 'member';
    const now = new Date().toISOString();
    let canceled = false;
    transaction(() => {
      canceled = eventRegistrations.cancel.run(reason, now, now, actor.memberId, reg.id).changes === 1;
      if (!canceled) return;
      if (release && reg.payment_id) {
        paymentService.releaseEventRegistrationCheckoutInTx(
          reg.payment_id, actor.memberId, 'released by the registration being canceled', actorType,
        );
      }
      const auditId = appendAuditEntry({
        actionType: 'event.registration_canceled',
        actorType,
        actorMemberId: actor.memberId,
        entityType: 'event',
        entityId: event.id,
        reasonText: reason,
        metadata: { registration_id: reg.id, member_id: reg.member_id, before_status: reg.status },
      });
      emailService.sendActNotice({
        template: 'event_registration_canceled',
        params: {
          memberName: reg.display_name,
          eventTitle: event.title,
          eventDates: eventDatesPhrase(event.start_date, event.end_date),
          byAdministrator: actor.kind === 'admin',
          reason,
          paid: isPaid,
        },
        memberId: reg.member_id,
        actId: auditId,
      });
    });
    return { branch: canceled ? 'canceled' : 'already_held', eventTitle: event.title, memberName: reg.display_name };
  }

  // ── Corrections at the event: Add Entrant and Edit Entry ───────────────────
  //
  // An organizer corrects the registrations to match who actually competed:
  // adding a walk-up, swapping a partner, moving a competitor between
  // divisions, recording a fee paid at the table. Each is one method with two
  // doors, as cancellation is: an organizer on an event they organize, found
  // by key, who saves at once; and an administrator on any event, found by id,
  // who gives a reason and confirms a preview first. Corrections are open from
  // the start of registration until results are uploaded, whatever the
  // deadline or the online-registration switch says. A registration made here
  // is confirmed at once and never sent to checkout.

  /** The Add Entrant form: the entrant search open, the divisions, and Paid at the event where a fee applies. */
  getAddEntrantPage(
    eventKey: string, organizerId: string, form?: EntryFormState, picker?: PickerRequest,
  ): PageViewModel<EntryFormContent> {
    const event = this.requireOrganizedEvent(eventKey, organizerId);
    this.assertCorrectionsOpen(event);
    const base = eventBasePath(event);
    return {
      seo: { title: `Add Entrant: ${event.title}`, noindex: true },
      page: { sectionKey: 'events', pageKey: 'event_participant_add', title: 'Add Entrant' },
      navigation: { contextLinks: [{ label: 'Back to Participants', href: `${base}/participants` }] },
      content: this.entryFormContent(event, organizerId, null, form, picker, {
        formId: PARTICIPANT_ADD_FORM_ID,
        formAction: `${base}/participants/add`,
        cancelHref: `${base}/participants`,
        submitLabel: 'Add Entrant',
        withReason: false,
        cancelRegistrationAction: null,
      }),
    };
  }

  /** The Edit Entry form: the entrant named, their divisions and partners, and Paid at the event where a fee applies. */
  getEditEntryPage(
    eventKey: string, organizerId: string, registrationId: string, form?: EntryFormState, picker?: PickerRequest,
  ): PageViewModel<EntryFormContent> {
    const event = this.requireOrganizedEvent(eventKey, organizerId);
    const entry = this.requireEditableEntry(event, registrationId);
    this.assertCorrectionsOpen(event);
    const base = eventBasePath(event);
    return {
      seo: { title: `Edit Entry: ${event.title}`, noindex: true },
      page: { sectionKey: 'events', pageKey: 'event_participant_edit', title: 'Edit Entry' },
      navigation: { contextLinks: [{ label: 'Back to Participants', href: `${base}/participants` }] },
      content: this.entryFormContent(event, organizerId, entry, form, picker, {
        formId: PARTICIPANT_EDIT_FORM_ID,
        formAction: `${base}/participants/${encodeURIComponent(entry.reg.id)}/edit`,
        cancelHref: `${base}/participants`,
        submitLabel: 'Save Entry',
        withReason: false,
        cancelRegistrationAction: `${base}/registrations/${encodeURIComponent(entry.reg.id)}/cancel`,
      }),
    };
  }

  /**
   * The administrator's Add Entrant or Edit Entry form content on any event,
   * for AdminEventService to frame. `registrationId` null is Add Entrant.
   */
  getAdminEntryForm(
    adminMemberId: string, eventId: string, registrationId: string | null, form?: EntryFormState, picker?: PickerRequest,
  ): { eventTitle: string; content: EntryFormContent } {
    const event = this.requireEventById(eventId);
    const entry = registrationId === null ? null : this.requireEditableEntry(event, registrationId);
    this.assertCorrectionsOpen(event);
    const base = `/admin/events/${encodeURIComponent(event.id)}`;
    return {
      eventTitle: event.title,
      content: this.entryFormContent(event, adminMemberId, entry, form, picker, {
        formId: entry ? PARTICIPANT_EDIT_FORM_ID : PARTICIPANT_ADD_FORM_ID,
        formAction: entry ? `${base}/registrations/${encodeURIComponent(entry.reg.id)}/edit` : `${base}/registrations/add`,
        cancelHref: base,
        // The administrator's form previews before it writes, so its button
        // names the review, as every administrator correction does.
        submitLabel: entry ? 'Review the Entry Change' : 'Review Adding the Entrant',
        withReason: true,
        cancelRegistrationAction: null,
      }),
    };
  }

  /** An organizer adds a member as a competitor, confirmed at once. */
  addEntrant(organizerId: string, eventKey: string, input: EntryInput): Exclude<AddEntrantResult, { branch: 'needs_confirmation' }> {
    const event = this.requireOrganizedEvent(eventKey, organizerId);
    const result = this.addEntrantAs({ kind: 'organizer', memberId: organizerId }, event, input, '', true);
    if (result.branch === 'needs_confirmation') throw new Error('an organizer\'s Add Entrant never stops at a preview');
    return result;
  }

  /** An administrator adds a member to any event, with a reason, after a preview. */
  adminAddEntrant(adminMemberId: string, eventId: string, input: EntryInput, rawReason: string, confirmed: boolean): AddEntrantResult {
    return this.addEntrantAs({ kind: 'admin', memberId: adminMemberId }, this.requireEventById(eventId), input, rawReason, confirmed);
  }

  /** An organizer changes an entry's divisions, partners or payment at the event. */
  correctEntry(
    organizerId: string, eventKey: string, registrationId: string, input: EntryInput,
  ): Exclude<CorrectEntryResult, { branch: 'needs_confirmation' }> {
    const event = this.requireOrganizedEvent(eventKey, organizerId);
    const result = this.correctEntryAs({ kind: 'organizer', memberId: organizerId }, event, registrationId, input, '', true);
    if (result.branch === 'needs_confirmation') throw new Error('an organizer\'s Edit Entry never stops at a preview');
    return result;
  }

  /** An administrator changes any entry, with a reason, after a preview. */
  adminCorrectEntry(
    adminMemberId: string, eventId: string, registrationId: string, input: EntryInput, rawReason: string, confirmed: boolean,
  ): CorrectEntryResult {
    return this.correctEntryAs(
      { kind: 'admin', memberId: adminMemberId }, this.requireEventById(eventId), registrationId, input, rawReason, confirmed,
    );
  }

  /** Whether an event's entries can be corrected now, for the administrator's record page. */
  correctionsOpenById(eventId: string): boolean {
    return this.correctionsClosedText(this.requireEventById(eventId)) === null;
  }

  // Why corrections are closed on this event, or null while they are open:
  // from the start of registration until any result is recorded.
  private correctionsClosedText(event: EventRow): string | null {
    if (event.status === 'draft' || event.status === 'pending_approval') return REGISTRATION_NOT_OPEN;
    if (event.status === 'canceled') return 'This event is canceled, so it can no longer be changed.';
    if ((eventResults.countEntries.get(event.id) as { n: number }).n > 0) return CORRECTIONS_CLOSED;
    return null;
  }

  private assertCorrectionsOpen(event: EventRow): void {
    const closed = this.correctionsClosedText(event);
    if (closed) throw new ValidationError(closed);
  }

  // A confirmed competitor registration of the event, with its member and
  // entries: the only kind an entry edit reaches. Anything else is not found.
  private requireEditableEntry(event: EventRow, registrationId: string): {
    reg: EventRegistrationRow; entrant: MemberRow; held: SelectionRow[];
  } {
    const reg = eventRegistrations.findForEventById.get(registrationId, event.id) as EventRegistrationRow | undefined;
    if (!reg || reg.status !== 'confirmed' || reg.registration_type !== 'competitor') {
      throw new NotFoundError('Registration not found.');
    }
    const entrant =eventRegistrations.findMemberById.get(reg.member_id) as MemberRow | undefined;
    if (!entrant) throw new NotFoundError('Registration not found.');
    return { reg, entrant, held: eventRegistrations.listSelectionsForRegistration.all(reg.id) as SelectionRow[] };
  }

  // Where an entry is edited, through the door the actor came in by.
  private entryEditHref(actor: EventActor, event: EventRow, registrationId: string): string {
    return actor.kind === 'admin'
      ? `/admin/events/${encodeURIComponent(event.id)}/registrations/${encodeURIComponent(registrationId)}/edit`
      : `${eventBasePath(event)}/participants/${encodeURIComponent(registrationId)}/edit`;
  }

  // The divisions and partners an entry names, checked as the member's own
  // registration checks them: at least one division, and for a doubles one a
  // partner who is a member the search offers, never the entrant, eligible by
  // gender with the entrant. A doubles division may be left with no partner,
  // which the participant list flags. An Amateur choice the entrant made
  // stays with the divisions they keep.
  private resolveEntry(event: EventRow, entrant: MemberRow, input: EntryInput, held: readonly SelectionRow[]): ResolvedEntry[] {
    const divisions = eventWrites.listDivisions.all(event.id) as DivisionRow[];
    const chosen = divisions.filter((d) => input.divisionIds.includes(d.id));
    if (chosen.length === 0) throw new ValidationError('Choose at least one competition to enter.');
    return chosen.map((division) => {
      let partner: MemberRow | null = null;
      if (division.team_type === 'doubles') {
        const chosenId = (input.partners.find((p) => p.divisionId === division.id)?.memberId ?? '').trim();
        if (chosenId !== '') {
          if (chosenId === entrant.id) {
            throw new ValidationError(`${entrant.display_name}'s ${division.name} partner has to be someone else.`);
          }
          partner = findSearchableMember(chosenId);
          if (!partner) {
            throw new ValidationError(`The ${division.name} partner must be a footbag.org member. Search for them by name and choose them.`);
          }
        }
      }
      const refusal = checkDivisionEligibility(division, entrant.gender, partner && { gender: partner.gender }, entrant.display_name);
      if (refusal) throw new ValidationError(refusal);
      const amateur = division.offers_prize_money === 1
        && held.some((s) => s.discipline_id === division.id && s.enters_as_amateur === 1);
      return { division, partner, amateur };
    });
  }

  // Names for an entry's ids, for the preview and the change line.
  private entryNamers(event: EventRow): { divisionName: (id: string) => string; memberName: (id: string) => string } {
    const divisions = new Map((eventWrites.listDivisions.all(event.id) as DivisionRow[]).map((d) => [d.id, d.name]));
    return {
      divisionName: (id) => divisions.get(id) ?? 'A removed competition',
      memberName: (id) => (eventRegistrations.findMemberById.get(id) as MemberRow | undefined)?.display_name ?? 'A member',
    };
  }

  private entryChanges(event: EventRow, before: EntrySnapshot | null, after: EntrySnapshot): EntryChanges {
    const { divisionName, memberName } = this.entryNamers(event);
    const changes: EntryChanges = [{
      label: 'Competitions',
      before: before ? entriesText(before, divisionName, memberName) : '(none)',
      after: entriesText(after, divisionName, memberName),
    }];
    if (hasFees(event)) {
      changes.push({
        label: 'Payment',
        before: before?.paid_at_event ? PAID_AT_EVENT : '(none)',
        after: after.paid_at_event ? PAID_AT_EVENT : '(none)',
      });
    }
    return changes;
  }

  private writeEntriesInTx(registrationId: string, entries: readonly ResolvedEntry[], actorId: string, now: string): void {
    eventRegistrations.deleteSelections.run(registrationId);
    for (const e of entries) {
      eventRegistrations.insertSelection.run(
        `rsel_${newId()}`, now, actorId, now, actorId,
        registrationId, e.division.id, e.partner?.id ?? null, e.amateur ? 1 : 0,
      );
    }
  }

  private addEntrantAs(
    actor: EventActor, event: EventRow, input: EntryInput, rawReason: string, confirmed: boolean,
  ): AddEntrantResult {
    const entrant = findSearchableMember(input.memberId);
    if (!entrant) throw new ValidationError(ENTRANT_NEEDED);
    const own = eventRegistrations.findForMember.get(event.id, entrant.id) as OwnRegistrationRow | undefined;
    if (own && own.status !== 'canceled') {
      // A member already registered is edited, never added twice. The same
      // entry submitted again is the first submit's success when this actor's
      // add is what stands, and a state found in place otherwise.
      const held = eventRegistrations.listSelectionsForRegistration.all(own.id) as SelectionRow[];
      const entries = this.resolveEntry(event, entrant, input, held);
      const paid = hasFees(event) ? input.paidAtEvent : false;
      if (own.status === 'confirmed' && own.registration_type === 'competitor'
        && sameSnapshot(heldSnapshot(held, own.paid_at_event_at), resolvedSnapshot(entries, paid))) {
        const ownAct = findStandingOwnAct(
          actor.memberId, 'event.registration_added', 'event.registration_canceled', 'event', event.id,
          { metadataKey: 'registration_id', id: own.id },
        );
        return {
          branch: ownAct ? 'own_repeat' : 'already_held',
          memberName: entrant.display_name,
          registrationId: own.id,
          divisionNames: held.map((s) => s.division_name),
        };
      }
      return {
        branch: 'already_registered',
        memberName: entrant.display_name,
        registrationId: own.id,
        editHref: this.entryEditHref(actor, event, own.id),
      };
    }
    this.assertCorrectionsOpen(event);
    const entries = this.resolveEntry(event, entrant, input, []);
    const paid = hasFees(event) && input.paidAtEvent;
    const after = resolvedSnapshot(entries, paid);
    const reason = actor.kind === 'admin' ? requireReason(rawReason) : null;
    if (!confirmed) {
      return {
        branch: 'needs_confirmation', memberName: entrant.display_name, eventTitle: event.title,
        changes: this.entryChanges(event, null, after),
      };
    }

    const actorType = actor.kind === 'admin' ? 'admin' : 'member';
    const now = new Date().toISOString();
    const registrationId = own?.id ?? `reg_${newId()}`;
    transaction(() => {
      if (own) {
        // A member who withdrew or was canceled comes back on the same row.
        if (eventRegistrations.reactivate.run('competitor', 'confirmed', null, now, now, actor.memberId, own.id).changes !== 1) {
          throw new Error(`registration ${own.id} changed between its read and its reactivation`);
        }
      } else {
        eventRegistrations.insert.run(
          registrationId, now, actor.memberId, now, actor.memberId,
          event.id, entrant.id, now, 'competitor', 'confirmed', null,
        );
      }
      this.writeEntriesInTx(registrationId, entries, actor.memberId, now);
      if (paid || own?.paid_at_event_at) {
        eventRegistrations.setPaidAtEvent.run(paid ? now : null, paid ? actor.memberId : null, now, actor.memberId, registrationId);
      }
      const auditId = appendAuditEntry({
        actionType: 'event.registration_added',
        actorType,
        actorMemberId: actor.memberId,
        entityType: 'event',
        entityId: event.id,
        reasonText: reason,
        metadata: { registration_id: registrationId, member_id: entrant.id, before: null, after },
      });
      emailService.sendActNotice({
        template: 'event_registration_added',
        params: {
          memberName: entrant.display_name,
          eventTitle: event.title,
          eventDates: eventDatesPhrase(event.start_date, event.end_date),
          registrationSummary: registrationSummary('competitor', entries.map((e) => ({
            divisionName: e.division.name, partnerName: e.partner?.display_name ?? null, partnerHref: null, isAmateur: e.amateur,
          })), null),
          byAdministrator: actor.kind === 'admin',
          reason,
        },
        memberId: entrant.id,
        actId: auditId,
      });
    });
    return {
      branch: 'added', memberName: entrant.display_name, registrationId, divisionNames: entries.map((e) => e.division.name),
    };
  }

  private correctEntryAs(
    actor: EventActor, event: EventRow, registrationId: string, input: EntryInput, rawReason: string, confirmed: boolean,
  ): CorrectEntryResult {
    const { reg, entrant, held } = this.requireEditableEntry(event, registrationId);
    const entries = this.resolveEntry(event, entrant, input, held);
    // Paid at the event is offered only where a fee applies; elsewhere the
    // mark stands as it is.
    const paid = hasFees(event) ? input.paidAtEvent : reg.paid_at_event_at !== null;
    const before = heldSnapshot(held, reg.paid_at_event_at);
    const after = resolvedSnapshot(entries, paid);
    const { divisionName, memberName } = this.entryNamers(event);
    if (sameSnapshot(before, after)) {
      // Nothing to change: this actor's own correction is what stands, so the
      // first submit's line is reported from its record.
      const ownAct = findStandingOwnAct(
        actor.memberId, 'event.registration_corrected', 'event.registration_added', 'event', event.id,
        { metadataKey: 'registration_id', id: reg.id },
      );
      if (ownAct) {
        const recorded = JSON.parse(ownAct.metadata_json) as { before: EntrySnapshot; after: EntrySnapshot };
        return {
          branch: 'own_repeat', memberName: entrant.display_name, registrationId: reg.id,
          whatChanged: entryChangePhrase(recorded.before, recorded.after, divisionName, memberName),
        };
      }
      return { branch: 'already_held', memberName: entrant.display_name, registrationId: reg.id, whatChanged: '' };
    }
    this.assertCorrectionsOpen(event);
    const reason = actor.kind === 'admin' ? requireReason(rawReason) : null;
    if (!confirmed) {
      return {
        branch: 'needs_confirmation', memberName: entrant.display_name, eventTitle: event.title,
        changes: this.entryChanges(event, before, after),
      };
    }

    const actorType = actor.kind === 'admin' ? 'admin' : 'member';
    const whatChanged = entryChangePhrase(before, after, divisionName, memberName);
    const now = new Date().toISOString();
    transaction(() => {
      this.writeEntriesInTx(reg.id, entries, actor.memberId, now);
      // A partner this entry no longer names keeps their own entry, now
      // naming nobody where it named this entrant, so the list flags it.
      const cleared: string[] = [];
      // Each old partner whose entry changed, with the divisions it changed in.
      const partnersLeft = new Map<string, { registration: OwnRegistrationRow; divisionIds: string[] }>();
      for (const s of held) {
        if (s.partner_member_id === null || (after.partners[s.discipline_id] ?? null) === s.partner_member_id) continue;
        const theirs = eventRegistrations.findForMember.get(event.id, s.partner_member_id) as OwnRegistrationRow | undefined;
        if (!theirs || theirs.status === 'canceled') continue;
        if (eventRegistrations.clearPartnerOnEntry.run(now, actor.memberId, theirs.id, s.discipline_id, entrant.id).changes > 0) {
          cleared.push(theirs.id);
          const left = partnersLeft.get(s.partner_member_id) ?? { registration: theirs, divisionIds: [] };
          left.divisionIds.push(s.discipline_id);
          partnersLeft.set(s.partner_member_id, left);
        }
      }
      if (before.paid_at_event !== after.paid_at_event) {
        eventRegistrations.setPaidAtEvent.run(paid ? now : null, paid ? actor.memberId : null, now, actor.memberId, reg.id);
      } else {
        eventRegistrations.touch.run(now, actor.memberId, reg.id);
      }
      const auditId = appendAuditEntry({
        actionType: 'event.registration_corrected',
        actorType,
        actorMemberId: actor.memberId,
        entityType: 'event',
        entityId: event.id,
        reasonText: reason,
        metadata: {
          registration_id: reg.id, member_id: entrant.id, before, after,
          partner_cleared_registration_ids: cleared,
        },
      });
      const byAdministrator = actor.kind === 'admin';
      const eventDates = eventDatesPhrase(event.start_date, event.end_date);
      emailService.sendActNotice({
        template: 'event_registration_corrected',
        params: {
          memberName: entrant.display_name,
          eventTitle: event.title,
          eventDates,
          whatChanged: `${whatChanged}.`,
          registrationSummary: registrationSummary('competitor', entries.map((e) => ({
            divisionName: e.division.name, partnerName: e.partner?.display_name ?? null, partnerHref: null, isAmateur: e.amateur,
          })), reg.tshirt_size),
          byAdministrator,
          reason,
        },
        memberId: entrant.id,
        actId: auditId,
      });
      // An old partner's registration changed too: they are told which of
      // their entries now names no partner, once each.
      for (const [partnerId, left] of partnersLeft) {
        const partner = eventRegistrations.findMemberById.get(partnerId) as MemberRow | undefined;
        if (!partner) continue;
        const theirEntries = eventRegistrations.listSelectionsForRegistration.all(left.registration.id) as SelectionRow[];
        emailService.sendActNotice({
          template: 'event_registration_corrected',
          params: {
            memberName: partner.display_name,
            eventTitle: event.title,
            eventDates,
            whatChanged: `${left.divisionIds.map((id) => `${divisionName(id)} partner removed`).join(', ')}.`,
            registrationSummary: registrationSummary(
              left.registration.registration_type, theirEntries.map(toEntryView), left.registration.tshirt_size,
            ),
            byAdministrator,
            reason,
          },
          memberId: partnerId,
          actId: auditId,
        });
      }
    });
    return { branch: 'corrected', memberName: entrant.display_name, registrationId: reg.id, whatChanged };
  }

  // The form both doors share: the entrant (searched for on Add Entrant,
  // named on Edit Entry), every division with a partner picker on each doubles
  // one, Paid at the event where a fee applies, and an administrator's reason.
  private entryFormContent(
    event: EventRow, actorId: string,
    entry: { reg: EventRegistrationRow; entrant: MemberRow; held: SelectionRow[] } | null,
    form: EntryFormState | undefined, picker: PickerRequest | undefined,
    frame: {
      formId: string; formAction: string; cancelHref: string; submitLabel: string;
      withReason: boolean; cancelRegistrationAction: string | null;
    },
  ): EntryFormContent {
    const intent = picker?.intent ?? null;
    const input: EntryInput = form?.input ?? (entry
      ? {
        memberId: entry.entrant.id,
        divisionIds: entry.held.map((s) => s.discipline_id),
        partners: entry.held
          .filter((s) => s.partner_member_id !== null)
          .map((s) => ({ divisionId: s.discipline_id, memberId: s.partner_member_id ?? '' })),
        paidAtEvent: entry.reg.paid_at_event_at !== null,
      }
      : { memberId: '', divisionIds: [], partners: [], paidAtEvent: false });

    let entrantPicker: MemberPickerView | null = null;
    let entrantId: string | null = entry?.entrant.id ?? null;
    if (!entry) {
      const chosenId = intent?.kind === 'choose' && intent.key === 'entrant' ? intent.memberId : input.memberId;
      const chosen = chosenId.trim() !== '' ? findSearchableMember(chosenId) : null;
      entrantId = chosen?.id ?? null;
      entrantPicker = buildMemberPicker({
        formId: frame.formId,
        formAction: frame.formAction,
        fieldName: 'member_id',
        fieldKey: 'entrant',
        label: 'Entrant',
        searchLabel: "Entrant's name",
        openLabel: 'Choose Member',
        rowAction: { label: 'Choose', completes: false, ariaLabel: (name) => `Choose ${name} as entrant` },
        chosen: chosen ? toPickerMember(chosen) : null,
        intent,
        openOnLoad: true,
        query: picker?.query ?? '',
        search: runPickerSearch(picker, 'entrant', actorId, []),
        notFoundHint: WALK_UP_HINT,
      });
    }

    const partnerPicker = (d: DivisionRow): MemberPickerView => {
      const key = `partner-${d.id}`;
      const chosenId = intent?.key === key && intent.kind === 'choose'
        ? intent.memberId
        : intent?.key === key && intent.kind === 'remove'
          ? ''
          : input.partners.find((p) => p.divisionId === d.id)?.memberId ?? '';
      const partner = chosenId.trim() !== '' ? findSearchableMember(chosenId) : null;
      return buildMemberPicker({
        formId: frame.formId,
        formAction: frame.formAction,
        fieldName: 'partner',
        fieldKey: key,
        label: 'Partner',
        searchLabel: "Partner's name",
        openLabel: 'Choose Partner',
        rowAction: { label: 'Choose', completes: false, ariaLabel: (name) => `Choose ${name} as partner for ${d.name}` },
        chosen: partner && partner.id !== entrantId ? toPickerMember(partner) : null,
        intent,
        openOnLoad: false,
        query: picker?.query ?? '',
        search: runPickerSearch(picker, key, actorId, entrantId ? [entrantId] : []),
        notFoundHint: WALK_UP_HINT,
        canRemove: entry !== null,
      });
    };

    const divisions = eventWrites.listDivisions.all(event.id) as DivisionRow[];
    return {
      formId: frame.formId,
      formAction: frame.formAction,
      cancelHref: frame.cancelHref,
      eventTitle: event.title,
      eventDates: eventDatesPhrase(event.start_date, event.end_date),
      entrantPicker,
      entrantName: entry?.entrant.display_name ?? null,
      divisions: divisions.map((d) => ({
        id: d.id,
        name: d.name,
        checked: input.divisionIds.includes(d.id),
        partnerPicker: d.team_type === 'doubles' ? partnerPicker(d) : null,
      })),
      hasDivisions: divisions.length > 0,
      paidAtEvent: hasFees(event) ? { checked: input.paidAtEvent } : null,
      reasonField: frame.withReason ? { value: form?.reason ?? '' } : null,
      errorMessage: form?.message ?? null,
      errorLink: form?.link ?? null,
      submitLabel: frame.submitLabel,
      cancelRegistrationAction: frame.cancelRegistrationAction,
    };
  }

  // The participant list's division groups: each division's confirmed
  // entries, with the partner a doubles entry names or its flag for naming
  // none, and how the entrant paid.
  private divisionGroups(event: EventRow, editHref: ((registrationId: string) => string) | null): DivisionGroupView[] {
    const rows = eventRegistrations.listConfirmedEntriesByDivision.all(event.id) as Array<{
      registration_id: string; discipline_id: string; partner_member_id: string | null;
      division_name: string; team_type: string; member_id: string; registration_type: RegistrationType;
      paid_at_event_at: string | null; display_name: string; slug: string;
      partner_member_name: string | null; payment_status: string | null;
    }>;
    const groups = new Map<string, DivisionGroupView>();
    for (const r of rows) {
      let group = groups.get(r.discipline_id);
      if (!group) {
        group = { name: r.division_name, confirmedCount: 0, isDoubles: r.team_type === 'doubles', rows: [] };
        groups.set(r.discipline_id, group);
      }
      group.confirmedCount += 1;
      group.rows.push({
        registrationId: r.registration_id,
        entrantName: r.display_name,
        entrantHref: `/members/${encodeURIComponent(r.slug)}`,
        partnerName: r.partner_member_name,
        noPartner: group.isDoubles && r.partner_member_id === null,
        paymentLabel: paymentLabel(r.payment_status, r.paid_at_event_at, feeOwed(event, { status: 'confirmed', registration_type: r.registration_type })),
        editHref: editHref && r.registration_type === 'competitor' ? editHref(r.registration_id) : null,
      });
    }
    return [...groups.values()];
  }

  // ── Organizer management: participants, exports, email ─────────────────────

  /**
   * The organizers' participant list: every registration still standing, and
   * above it the confirmed entries grouped by division. `entryId` names the
   * entry a correction just saved, linked beside its notice.
   */
  getParticipantsPage(
    eventKey: string, viewerMemberId: string, sort: string | undefined,
    opts: { notice?: OutcomeNoticeView | null; entryId?: string } = {},
  ): PageViewModel<ParticipantsContent> {
    const event = this.requireOrganizedEvent(eventKey, viewerMemberId);
    const base = eventBasePath(event);
    const bySort = sort === 'date' ? 'date' : 'name';
    const rows = this.participantRows(event);
    if (bySort === 'date') rows.sort((a, b) => a.registered_at.localeCompare(b.registered_at) || a.id.localeCompare(b.id));
    const showPayment = hasFees(event);
    const canCancel = event.status !== 'completed' && event.status !== 'canceled';
    const canMark = ATTENDANCE_STATUSES.includes(event.status) && lastDayHasCome(event);
    const correctionsOpen = this.correctionsClosedText(event) === null;
    const editHref = (registrationId: string): string => `${base}/participants/${encodeURIComponent(registrationId)}/edit`;
    const divisionGroups = this.divisionGroups(event, correctionsOpen ? editHref : null);
    const noticeEntry = opts.notice && opts.entryId && correctionsOpen
      && divisionGroups.some((g) => g.rows.some((r) => r.registrationId === opts.entryId))
      ? opts.entryId : null;
    return {
      seo: { title: `Participants: ${event.title}`, noindex: true },
      page: {
        sectionKey: 'events',
        pageKey: 'event_participants',
        title: 'Participants',
        intro: `Everyone registered for ${event.title}. Only this event's organizers see this page.`,
      },
      navigation: { contextLinks: [{ label: `Back to Manage ${event.title}`, href: `${base}/manage` }] },
      content: {
        notice: opts.notice ?? null,
        noticeEditHref: noticeEntry ? editHref(noticeEntry) : null,
        addEntrantHref: correctionsOpen ? `${base}/participants/add` : null,
        divisionGroups,
        hasDivisionGroups: divisionGroups.length > 0,
        eventTitle: event.title,
        confirmedCount: rows.filter((r) => r.status === 'confirmed').length,
        pendingCount: rows.filter((r) => r.status === 'pending').length,
        attendanceAction: canMark ? `${base}/attendance` : null,
        showPayment,
        showTshirt: event.is_tshirt_size_collected === 1,
        sortLinks: [
          { label: 'Sort by Name', href: `${base}/participants`, isActive: bySort === 'name' },
          { label: 'Sort by Registration Date', href: `${base}/participants?sort=date`, isActive: bySort === 'date' },
        ],
        rows: rows.map((r) => ({
          registrationId: r.id,
          name: r.display_name,
          profileHref: `/members/${encodeURIComponent(r.slug)}`,
          registeredOn: r.registered_at.slice(0, 10),
          statusLabel: r.status === 'confirmed' ? 'Confirmed' : 'Awaiting payment',
          typeLabel: REGISTRATION_TYPE_LABELS[r.registration_type],
          tierLabel: tierBadgeShort(r.tier_status) ?? TIER_NAMES.tier0,
          activePlayerLabel: r.is_active_player === 1 ? 'Active Player' : '',
          location: personLocation(r.city, r.region, r.country)?.text ?? '',
          email: r.email_visibility === 'members' ? r.login_email : null,
          paymentLabel: showPayment ? paymentLabel(r.payment_status, r.paid_at_event_at, feeOwed(event, r)) : null,
          tshirtSize: r.tshirt_size,
          entries: r.entries,
          cancelAction: canCancel ? `${base}/registrations/${encodeURIComponent(r.id)}/cancel` : null,
          attendedLabel: r.attended_at ? 'Attended' : null,
          canMarkAttended: canMark && r.status === 'confirmed' && !r.attended_at,
        })),
        hasRows: rows.length > 0,
        csvHref: `${base}/participants.csv`,
        checkInByNameHref: `${base}/check-in-sheet`,
        checkInByTypeHref: `${base}/check-in-sheet?sort=type`,
        summaryHref: `${base}/summary`,
        emailHref: `${base}/email`,
        manageHref: `${base}/manage`,
      },
    };
  }

  /** The confirmed participants as a CSV download. */
  getParticipantsCsv(eventKey: string, viewerMemberId: string): { filename: string; body: string } {
    const event = this.requireOrganizedEvent(eventKey, viewerMemberId);
    const rows = this.participantRows(event).filter((r) => r.status === 'confirmed');
    // A free event has no payment to report, so its export carries no payment
    // column, as its participant page shows none.
    const charges = hasFees(event);
    const lines = [csvRow([
      'Name', 'Email', 'City', 'Country', 'Registered', 'Tier', 'Active Player',
      ...(charges ? ['Payment'] : []),
      'Registration Type', 'Competitions', 'Partners', 'Amateur Entries', 'T-shirt Size',
    ])];
    for (const r of rows) {
      lines.push(csvRow([
        r.display_name,
        r.email_visibility === 'members' ? r.login_email : '',
        r.city,
        r.country ? (canonicalCountryName(r.country) ?? r.country) : '',
        r.registered_at.slice(0, 10),
        tierBadgeShort(r.tier_status) ?? TIER_NAMES.tier0,
        r.is_active_player === 1 ? 'Yes' : 'No',
        ...(charges ? [paymentLabel(r.payment_status, r.paid_at_event_at, feeOwed(event, r))] : []),
        REGISTRATION_TYPE_LABELS[r.registration_type],
        r.entries.map((e) => e.divisionName).join('; '),
        r.entries.filter((e) => e.partner).map((e) => `${e.divisionName}: ${e.partner}`).join('; '),
        r.entries.filter((e) => e.amateurLabel).map((e) => e.divisionName).join('; '),
        r.tshirt_size ?? '',
      ]));
    }
    return {
      filename: downloadFilename(event.title, 'participants', new Date().toISOString(), 'csv'),
      body: lines.join(''),
    };
  }

  /** The registration summary dashboard, counted from the tables on each request. */
  getRegistrationSummaryPage(eventKey: string, viewerMemberId: string): PageViewModel<RegistrationSummaryContent> {
    const event = this.requireOrganizedEvent(eventKey, viewerMemberId);
    const base = eventBasePath(event);
    return {
      seo: { title: `Registration Summary: ${event.title}`, noindex: true },
      page: {
        sectionKey: 'events',
        pageKey: 'event_registration_summary',
        title: 'Registration Summary',
        intro: `How registration for ${event.title} stands right now. Counts are confirmed registrations unless a line says otherwise.`,
      },
      navigation: { contextLinks: [{ label: 'Back to Participants', href: `${base}/participants` }] },
      content: this.registrationSummary(event, new Date(), `${base}/participants`),
    };
  }

  /**
   * An administrator's view of any event's registration summary, by event
   * id: the same counts its organizers see. AdminEventService shapes the page.
   */
  getAdminRegistrationSummary(eventId: string): { eventTitle: string; content: RegistrationSummaryContent } {
    const event = this.requireEventById(eventId);
    return { eventTitle: event.title, content: this.registrationSummary(event, new Date(), null) };
  }

  // The summary's counts, read on demand: totals by registration type, by
  // competition category and by division, payments by status in the event's
  // currency, and confirmed registrations for every day from registration
  // opening to today, a day without one included.
  private registrationSummary(event: EventRow, now: Date, participantsHref: string | null): RegistrationSummaryContent {
    const rows = this.participantRows(event);
    const confirmed = rows.filter((r) => r.status === 'confirmed');
    const divisions = eventWrites.listDivisions.all(event.id) as DivisionRow[];
    const byCategoryRows = eventRegistrations.countConfirmedByCategory.all(event.id) as Array<{
      discipline_category: string; registered: number;
    }>;
    const payments = eventRegistrations.summarizePaymentsForEvent.all(event.id) as Array<{
      status: string; registrations: number; amount_cents: number;
    }>;
    const days = eventRegistrations.countConfirmedByDay.all(event.id) as Array<{ day: string; registered: number }>;
    const tshirtCounts = new Map<string, number>();
    for (const r of confirmed) if (r.tshirt_size) tshirtCounts.set(r.tshirt_size, (tshirtCounts.get(r.tshirt_size) ?? 0) + 1);

    // Each category the event offers, in the order its first division appears.
    const categoryCounts = new Map(byCategoryRows.map((r) => [r.discipline_category, r.registered]));
    const categories: string[] = [];
    for (const d of divisions) {
      if (d.discipline_category && !categories.includes(d.discipline_category)) categories.push(d.discipline_category);
    }

    // Paid, pending and failed always show for an event that charges, so a
    // zero reads as none rather than as missing; any other status that
    // occurs follows them.
    const byStatus = new Map(payments.map((p) => [p.status, p]));
    const statuses = hasFees(event)
      ? [...SUMMARY_PAYMENT_STATUSES, ...payments.map((p) => p.status).filter((s) => !SUMMARY_PAYMENT_STATUSES.includes(s))]
      : payments.map((p) => p.status);

    const timeline = registrationTimeline(days, event.reg_opened_at, now);
    return {
      eventTitle: event.title,
      confirmedCount: confirmed.length,
      pendingCount: rows.length - confirmed.length,
      byType: (Object.keys(REGISTRATION_TYPE_LABELS) as RegistrationType[]).map((t) => ({
        label: REGISTRATION_TYPE_LABELS[t],
        count: confirmed.filter((r) => r.registration_type === t).length,
      })),
      byCategory: categories.map((c) => ({ label: sportLabel(c), count: categoryCounts.get(c) ?? 0 })),
      byDivision: divisions.map((d) => ({ name: d.name, count: d.confirmed_count })),
      hasDivisions: divisions.length > 0,
      payments: statuses.map((s) => ({
        label: paymentLabel(s),
        count: byStatus.get(s)?.registrations ?? 0,
        amount: formatFee(byStatus.get(s)?.amount_cents ?? 0, event.currency),
      })),
      hasPayments: statuses.length > 0,
      timeline,
      hasTimeline: timeline.length > 0,
      tshirts: event.is_tshirt_size_collected === 1
        ? TSHIRT_SIZES.map((size) => ({ size, count: tshirtCounts.get(size) ?? 0 }))
        : null,
      participantsHref,
    };
  }

  /**
   * The check-in sheet for the venue, as a printable document: every
   * confirmed participant with a box to tick and room for notes, sorted by
   * name or grouped by registration type.
   */
  getCheckInSheet(eventKey: string, viewerMemberId: string, sort: string | undefined): { filename: string; document: PrintableDocument } {
    const event = this.requireOrganizedEvent(eventKey, viewerMemberId);
    const byType = sort === 'type';
    const rows = this.participantRows(event).filter((r) => r.status === 'confirmed');
    const showTshirt = event.is_tshirt_size_collected === 1;
    const now = new Date().toISOString();
    const columns: PrintColumn[] = [
      { header: 'Name', width: 3, kind: 'text' },
      { header: 'Type', width: 1.6, kind: 'text' },
      { header: 'Competitions', width: 4, kind: 'text' },
      { header: 'Partner', width: 2.4, kind: 'text' },
      { header: 'Payment', width: 1.4, kind: 'text' },
      ...(showTshirt ? [{ header: 'T-shirt', width: 0.9, kind: 'text' as const }] : []),
      { header: 'In', width: 0.6, kind: 'checkbox' },
      { header: 'Notes', width: 3, kind: 'writeIn' },
    ];
    const toRow = (r: ParticipantRow): PrintRow => ({
      kind: 'row',
      cells: [
        r.display_name,
        REGISTRATION_TYPE_LABELS[r.registration_type],
        r.entries.map((e) => e.divisionName + (e.amateurLabel ? ` (${e.amateurLabel})` : '')).join('\n'),
        r.entries.map((e) => e.partner ?? '').filter((p) => p !== '').join('\n'),
        paymentLabel(r.payment_status, r.paid_at_event_at, feeOwed(event, r)),
        ...(showTshirt ? [r.tshirt_size ?? ''] : []),
        null,
        null,
      ],
    });
    const printRows: PrintRow[] = [];
    if (byType) {
      for (const t of Object.keys(REGISTRATION_TYPE_LABELS) as RegistrationType[]) {
        const group = rows.filter((r) => r.registration_type === t);
        if (group.length === 0) continue;
        printRows.push({ kind: 'group', label: `${REGISTRATION_TYPE_LABELS[t]} (${group.length})` });
        for (const r of group) printRows.push(toRow(r));
      }
    } else {
      for (const r of rows) printRows.push(toRow(r));
    }
    const place = [event.city, event.country ? (canonicalCountryName(event.country) ?? event.country) : ''].filter(Boolean).join(', ');
    return {
      filename: downloadFilename(event.title, 'checkin', now, 'pdf'),
      document: {
        title: `Check-in Sheet: ${event.title}`,
        subtitle: `${eventDatesPhrase(event.start_date, event.end_date)}${place ? `, ${place}` : ''}. ${rows.length} confirmed participant${rows.length === 1 ? '' : 's'}.`,
        orientation: 'landscape',
        runningHeader: `${event.title}: check-in sheet`,
        generatedLabel: `Printed from footbag.org on ${now.slice(0, 10)}`,
        blocks: [{
          kind: 'table',
          columns,
          rows: printRows,
          emptyText: 'No confirmed participants yet.',
        }],
      },
    };
  }

  /** The participant email form, with the event's sent emails beneath it. */
  getEmailParticipantsPage(
    eventKey: string, viewerMemberId: string,
    form: {
      values?: { subject: string; bodyText: string; sendToken: string };
      fieldErrors?: Record<string, string>; message?: string; preview?: boolean;
      notice?: OutcomeNoticeView | null;
    } = {},
  ): PageViewModel<EmailParticipantsContent> {
    const event = this.requireOrganizedEvent(eventKey, viewerMemberId);
    const base = eventBasePath(event);
    const values = form.values ?? { subject: '', bodyText: '', sendToken: randomUUID() };
    const recipients = this.participantRows(event).filter((r) => r.status === 'confirmed').length;
    const sent = emailArchives.listForEvent.all(event.id) as Array<{
      subject: string; body_text: string; sent_at: string; recipient_count: number; sender_name: string | null;
    }>;
    return {
      seo: { title: `Email Participants: ${event.title}`, noindex: true },
      page: {
        sectionKey: 'events',
        pageKey: 'event_email_participants',
        title: 'Email Participants',
        intro: `Send a plain-text email to everyone confirmed for ${event.title}. One email can go out per event each day.`,
      },
      navigation: { contextLinks: [{ label: 'Back to Participants', href: `${base}/participants` }] },
      content: {
        notice: form.notice ?? null,
        eventTitle: event.title,
        formAction: `${base}/email`,
        values,
        fieldErrors: form.fieldErrors ?? {},
        errorMessage: form.message ?? null,
        recipientCount: recipients,
        preview: form.preview && !form.message
          ? {
            subject: values.subject,
            bodyText: participantEmailBody(
              values.bodyText, event.title,
              (eventRegistrations.findMemberById.get(viewerMemberId) as MemberRow | undefined)?.display_name,
            ),
          }
          : null,
        sendBlockedText: this.participantEmailBlockedText(event, new Date().toISOString()),
        sent: sent.map((s) => ({
          subject: s.subject,
          bodyText: s.body_text,
          sentOn: s.sent_at.slice(0, 10),
          senderName: s.sender_name ?? 'A former organizer',
          recipientCount: s.recipient_count,
        })),
        hasSent: sent.length > 0,
        participantsHref: `${base}/participants`,
      },
    };
  }

  /**
   * Check the participant email and, unless only previewing, send it to every
   * confirmed participant through the outbox, archived and audited. One send
   * per event in any 24 hours. The same form submitted again reports its
   * first send.
   */
  emailParticipants(
    memberId: string, eventKey: string,
    input: { subject: string; bodyText: string; sendToken: string }, previewOnly: boolean,
  ): { branch: 'preview' } | EmailParticipantsResult {
    const event = this.requireOrganizedEvent(eventKey, memberId);
    const compose = readParticipantEmail(input);
    const key = participantEmailKey(event.id, memberId, compose);
    if (outbox.findAnyInKeyRange.get(`${key}:`, `${key};`)) {
      // The first submit's send is the event's newest archived email.
      const latest = emailArchives.listForEvent.get(event.id) as { recipient_count: number } | undefined;
      return { branch: 'own_repeat', recipients: latest?.recipient_count ?? 0 };
    }
    const tokenKey = `event-email:${event.id}:${compose.sendToken}`;
    if (outbox.findAnyInKeyRange.get(`${tokenKey}:`, `${tokenKey};`)) {
      throw new ValidationError('This message was already sent. Open the email page again to write a new one.');
    }
    const now = new Date().toISOString();
    const blocked = this.participantEmailBlockedText(event, now);
    if (blocked) throw new ValidationError(blocked);
    if (previewOnly) return { branch: 'preview' };

    const sender = eventRegistrations.findMemberById.get(memberId) as MemberRow | undefined;
    const bodyText = participantEmailBody(compose.bodyText, event.title, sender?.display_name);
    let result: EmailParticipantsResult = { branch: 'no_recipients' };
    transaction(() => {
      // Counted again inside the transaction, so two overlapping sends cannot
      // both pass the daily limit.
      if (this.participantEmailBlockedText(event, now)) throw new ValidationError(PARTICIPANT_EMAIL_DAILY);
      const enqueued = getCommunicationService().enqueue({
        audience: { kind: 'event', eventId: event.id },
        subject: compose.subject,
        bodyText,
        idempotencyKey: key,
      });
      if (enqueued.recipients === 0) return;
      const archiveId = `bcast_${newId()}`;
      emailArchives.insertArchive.run(
        archiveId, now, memberId, now, memberId,
        'event_participants', null, event.id,
        memberId, null, compose.subject, bodyText, now, enqueued.enqueued,
      );
      appendAuditEntry({
        actionType: 'event.participants_emailed',
        actorType: 'member',
        actorMemberId: memberId,
        entityType: 'event',
        entityId: event.id,
        // The message lives on the archive row this names.
        metadata: {
          archive_id: archiveId,
          recipients: enqueued.recipients,
          enqueued: enqueued.enqueued,
          suppressed: enqueued.suppressed,
        },
      });
      result = { branch: 'sent', recipients: enqueued.recipients };
    });
    return result;
  }

  private participantEmailBlockedText(event: EventRow, nowIso: string): string | null {
    if (event.status === 'canceled' || event.status === 'draft' || event.status === 'pending_approval') {
      return 'Participant email is available once the event is open for registration.';
    }
    const since = new Date(Date.parse(nowIso) - 24 * 60 * 60 * 1000).toISOString();
    const { n } = emailArchives.countEventSentSince.get(event.id, since) as { n: number };
    return n > 0 ? PARTICIPANT_EMAIL_DAILY : null;
  }

  // Every registration still standing, with the member's details and the
  // entries each makes, sorted by name.
  private participantRows(event: EventRow): ParticipantRow[] {
    const rows = eventRegistrations.listParticipantsForEvent.all(event.id) as Array<Omit<ParticipantRow, 'entries'>>;
    const entries = eventRegistrations.listParticipantEntriesForEvent.all(event.id) as Array<{
      registration_id: string; division_name: string; offers_prize_money: number;
      partner_member_name: string | null; enters_as_amateur: number;
    }>;
    const byRegistration = new Map<string, ParticipantEntryView[]>();
    for (const e of entries) {
      const list = byRegistration.get(e.registration_id) ?? [];
      list.push({
        divisionName: e.division_name,
        partner: e.partner_member_name,
        amateurLabel: e.offers_prize_money === 1 && e.enters_as_amateur === 1 ? 'Amateur' : null,
      });
      byRegistration.set(e.registration_id, list);
    }
    return rows.map((r) => ({ ...r, entries: byRegistration.get(r.id) ?? [] }));
  }

  // ── Results upload and attendance ──────────────────────────────────────────
  //
  // An organizer uploads results from the event's last day onward, as a file
  // read into a preview and written only when the organizer commits it. The
  // commit writes the results, completes the event, and marks every placing
  // member with a confirmed registration attended; the attendance screen and
  // the participant list mark the rest. Each attendance grants or extends a
  // Tier 0 member's Active Player standing in the same transaction.

  /** What an event owes after it ends, read now. */
  getEventObligations(event: { id: string; end_date: string; sanction_status: string }): EventObligations {
    const hasResults = (eventResults.countEntries.get(event.id) as { n: number }).n > 0;
    const summarySent = (eventResults.hasSummarySent.get(event.id) as { sent: number }).sent === 1;
    return eventObligations(event, hasResults, summarySent, todayUtc());
  }

  /** The results upload page, with the preview when the organizer has asked for one. */
  getResultsUploadPage(
    eventKey: string, viewerMemberId: string,
    opts: {
      notice?: OutcomeNoticeView | null;
      errorMessage?: string | null;
      preview?: { input: ResultsUploadInput; result: ResultsPreview } | null;
    } = {},
  ): PageViewModel<ResultsUploadContent> {
    const event = this.requireOrganizedEvent(eventKey, viewerMemberId);
    const base = eventBasePath(event);
    const obligations = this.getEventObligations(event);
    const notYetText = this.resultsClosedText(event);
    return {
      seo: { title: `Upload Results: ${event.title}`, noindex: true },
      page: {
        sectionKey: 'events',
        pageKey: 'event_results_upload',
        title: 'Upload Results',
        intro: `Upload the results of ${event.title} as a CSV file. You check a preview first, and nothing shows on the event page until you publish it.`,
      },
      navigation: { contextLinks: [{ label: `Back to Manage ${event.title}`, href: `${base}/manage` }] },
      content: {
        notice: opts.notice ?? null,
        errorMessage: opts.errorMessage ?? null,
        eventTitle: event.title,
        badge: obligations.showBadge ? SANCTION_BADGE_TEXT : null,
        notYetText,
        canUpload: notYetText === null,
        hasResults: (eventResults.countEntries.get(event.id) as { n: number }).n > 0,
        previewAction: `${base}/results/preview`,
        commitAction: `${base}/results`,
        templateHref: `${base}/results/template.csv`,
        eventHref: base,
        attendanceHref: `${base}/attendance`,
        maxSizeText: `${RESULTS_FILE_MAX_BYTES / 1024} KB and ${RESULTS_FILE_MAX_ROWS} rows`,
        preview: opts.preview ? toResultsPreviewView(opts.preview.input, opts.preview.result, obligations.isSanctioned) : null,
      },
    };
  }

  /** The blank results file, its columns named. */
  getResultsTemplate(eventKey: string, viewerMemberId: string): { filename: string; body: string } {
    const event = this.requireOrganizedEvent(eventKey, viewerMemberId);
    return {
      filename: downloadFilename(event.title, 'results', new Date().toISOString(), 'csv'),
      body: resultsFileTemplate(),
    };
  }

  /** Read an uploaded results file into its preview. Writes nothing. */
  previewResults(memberId: string, eventKey: string, input: ResultsUploadInput): ResultsPreview {
    const event = this.requireOrganizedEvent(eventKey, memberId);
    const closed = this.resultsClosedText(event);
    if (closed) throw new ValidationError(closed);
    return this.readResults(event, input);
  }

  /**
   * Commit a previewed results file: the upload, its entries and their
   * competitors, any division that ran unadvertised, the event's completion,
   * and the attendance of every placing member with a confirmed registration,
   * in one transaction. The write path takes the file and the organizer's
   * decisions, not a request, so another caller can use it.
   */
  commitResults(memberId: string, eventKey: string, input: ResultsUploadInput): CommitResultsResult {
    const event = this.requireOrganizedEvent(eventKey, memberId);
    const closed = this.resultsClosedText(event);
    if (closed) throw new ValidationError(closed);
    const preview = this.readResults(event, input);
    const fileHash = createHash('sha256').update(input.text).digest('hex');
    if (!preview.committable) {
      const own = findStandingOwnAct(
        memberId, 'event.results_uploaded', 'event.results_uploaded', 'event', event.id,
        { metadataKey: 'file_sha256', id: fileHash },
      );
      if (own) return { branch: 'own_repeat', rowCount: preview.rowCount, attendedCount: 0 };
      throw new ValidationError(preview.fileErrors[0] ?? preview.problems[0] ?? 'The file has no results to publish.');
    }
    const candidates = eventRegistrations.listConfirmedForAttendance.all(event.id) as AttendanceCandidateRow[];
    const byRegistration = new Map(candidates.map((c) => [c.id, c]));
    const now = new Date().toISOString();
    let attendedCount = 0;
    transaction(() => {
      const uploadId = newId();
      eventResults.insertUpload.run(
        uploadId, now, memberId, now, memberId, event.id, memberId, now, input.filename.slice(0, 200) || null, null,
      );
      let sortOrder = (eventWrites.nextDivisionSortOrder.get(event.id) as { next: number }).next;
      const placed = new Set<string>();
      const newDivisions: string[] = [];
      for (const group of preview.groups) {
        let divisionId = group.divisionId;
        if (!divisionId) {
          divisionId = newId();
          eventWrites.insertDivision.run(
            divisionId, now, memberId, now, memberId, event.id, group.name, group.category,
            null, null, group.teamType, null, null, 0, sortOrder,
          );
          sortOrder += 1;
          newDivisions.push(group.name);
        }
        for (const p of group.placements) {
          const entryId = newId();
          eventResults.insertEntry.run(entryId, now, memberId, now, memberId, event.id, divisionId, uploadId, p.place, p.score);
          p.competitors.forEach((c, i) => {
            eventResults.insertParticipant.run(
              newId(), now, memberId, now, memberId, entryId, i + 1,
              c.match?.memberId ?? null, c.match?.displayName ?? c.name, c.match?.historicalPersonId ?? null,
            );
            if (c.match) placed.add(c.match.registrationId);
          });
        }
      }
      const completed = eventWrites.completeOnResults.run(now, memberId, event.id).changes === 1;
      for (const registrationId of placed) {
        const row = byRegistration.get(registrationId);
        if (row && this.markAttendedInTx(event, row, memberId, 'member', 'event.attendance_marked', null, now)) {
          attendedCount += 1;
        }
      }
      appendAuditEntry({
        actionType: 'event.results_uploaded',
        actorType: 'member',
        actorMemberId: memberId,
        entityType: 'event',
        entityId: event.id,
        metadata: {
          upload_id: uploadId,
          rows: preview.rowCount,
          new_divisions: newDivisions,
          attended: attendedCount,
          before_status: event.status,
          after_status: completed ? 'completed' : event.status,
          file_sha256: fileHash,
        },
      });
    });
    return { branch: 'committed', rowCount: preview.rowCount, attendedCount };
  }

  /** The attendance screen: confirmed registrants still to mark, and those already marked. */
  getAttendancePage(
    eventKey: string, viewerMemberId: string, opts: { notice?: OutcomeNoticeView | null } = {},
  ): PageViewModel<AttendanceContent> {
    const event = this.requireOrganizedEvent(eventKey, viewerMemberId);
    const base = eventBasePath(event);
    const rows = eventRegistrations.listConfirmedForAttendance.all(event.id) as AttendanceCandidateRow[];
    const unmarked = rows.filter((r) => r.attended_at === null);
    const marked = rows.filter((r) => r.attended_at !== null);
    return {
      seo: { title: `Attendance: ${event.title}`, noindex: true },
      page: {
        sectionKey: 'events',
        pageKey: 'event_attendance',
        title: 'Confirm Attendance',
        intro: `Tick everyone registered for ${event.title} who took part. Members in the results are marked already. Attendance at an IFPA-registered event gives a Tier 0 member Active Player status.`,
      },
      navigation: { contextLinks: [{ label: 'Back to Participants', href: `${base}/participants` }] },
      content: {
        notice: opts.notice ?? null,
        eventTitle: event.title,
        markAction: `${base}/attendance`,
        unmarked: unmarked.map((r) => ({
          registrationId: r.id,
          name: r.display_name,
          field: 'registration',
          tierLabel: tierBadgeShort(r.tier_status) ?? TIER_NAMES.tier0,
        })),
        marked: marked.map((r) => ({ name: r.display_name, markedOn: (r.attended_at ?? '').slice(0, 10) })),
        hasUnmarked: unmarked.length > 0,
        hasMarked: marked.length > 0,
        participantsHref: `${base}/participants`,
      },
    };
  }

  /** Mark confirmed registrations attended, from the attendance screen or the participant list. */
  markAttended(memberId: string, eventKey: string, registrationIds: string[]): MarkAttendedResult {
    const event = this.requireOrganizedEvent(eventKey, memberId);
    if (!ATTENDANCE_STATUSES.includes(event.status) || !lastDayHasCome(event)) {
      throw new ValidationError('Attendance can be marked from the event\'s last day.');
    }
    const wanted = new Set(registrationIds.filter((id) => id !== ''));
    if (wanted.size === 0) throw new ValidationError('Tick at least one participant.');
    const rows = (eventRegistrations.listConfirmedForAttendance.all(event.id) as AttendanceCandidateRow[])
      .filter((r) => wanted.has(r.id));
    if (rows.length === 0) throw new NotFoundError('Registration not found.');
    const now = new Date().toISOString();
    let marked = 0;
    transaction(() => {
      for (const row of rows) {
        if (this.markAttendedInTx(event, row, memberId, 'member', 'event.attendance_marked', null, now)) marked += 1;
      }
    });
    if (marked > 0) return { branch: 'marked', marked };
    const allMine = rows.every((r) => r.attended_marked_by_member_id === memberId);
    return { branch: allMine ? 'own_repeat' : 'already_held', marked: 0 };
  }

  /**
   * An administrator marks a registration attended, granting what an
   * organizer's mark would, or takes a mark back. Taking it back leaves any
   * Active Player grant it caused: the grant is a ledger row, corrected on the
   * member record.
   */
  correctAttendance(
    adminMemberId: string, eventId: string, registrationId: string, attended: boolean,
    rawReason: string, opts: { preview: boolean },
  ): EventCorrection {
    const event = this.requireEventById(eventId);
    const row = (eventRegistrations.listConfirmedForAttendance.all(event.id) as AttendanceCandidateRow[])
      .find((r) => r.id === registrationId);
    if (!row) throw new NotFoundError('Registration not found.');
    const reason = requireReason(rawReason);
    const was = row.attended_at !== null;
    if (was === attended) return { outcome: 'unchanged', changes: [] };
    if (attended && (!ATTENDANCE_STATUSES.includes(event.status) || !lastDayHasCome(event))) {
      throw new ValidationError('Attendance can be marked from the event\'s last day.');
    }
    const label = (v: boolean) => (v ? 'Attended' : 'Not attended');
    const changes = [{ label: `attendance of ${row.display_name}`, before: label(was), after: label(attended) }];
    if (opts.preview) return { outcome: 'preview', changes };
    const now = new Date().toISOString();
    transaction(() => {
      let auditId: string | null;
      if (attended) {
        auditId = this.markAttendedInTx(event, row, adminMemberId, 'admin', 'event.attendance_corrected', reason, now);
      } else {
        auditId = null;
        if (eventRegistrations.unmarkAttended.run(now, adminMemberId, row.id, event.id).changes === 1) {
          auditId = appendAuditEntry({
            actionType: 'event.attendance_corrected',
            actorType: 'admin',
            actorMemberId: adminMemberId,
            entityType: 'event',
            entityId: event.id,
            reasonText: reason,
            metadata: {
              registration_id: row.id,
              member_id: row.member_id,
              changes: { attended: { before: row.attended_at, after: null } },
            },
          });
        }
      }
      if (auditId) this.notifyOrganizersOfCorrectionInTx(event, `the attendance of ${row.display_name}`, reason, auditId);
    });
    return { outcome: 'corrected', changes };
  }

  // Why results cannot be uploaded now, or null while they can.
  private resultsClosedText(event: EventRow): string | null {
    if (!ATTENDANCE_STATUSES.includes(event.status)) return 'Results can be uploaded only for an event that has opened.';
    if (!lastDayHasCome(event)) return `Results can be uploaded from the event's last day, ${event.end_date}.`;
    return null;
  }

  private readResults(event: EventRow, input: ResultsUploadInput): ResultsPreview {
    const withResults = new Set(
      (eventResults.listDivisionsWithResults.all(event.id) as Array<{ discipline_id: string }>).map((r) => r.discipline_id),
    );
    const divisions = (eventWrites.listDivisions.all(event.id) as DivisionRow[]).map((d) => ({
      id: d.id, name: d.name, teamType: d.team_type, hasResults: withResults.has(d.id),
    }));
    const partnerless = new Map<string, string[]>();
    for (const e of eventRegistrations.listPartnerlessDoublesEntries.all(event.id) as Array<{ registration_id: string; discipline_id: string }>) {
      partnerless.set(e.registration_id, [...(partnerless.get(e.registration_id) ?? []), e.discipline_id]);
    }
    const candidates = (eventRegistrations.listConfirmedForAttendance.all(event.id) as AttendanceCandidateRow[]).map((c) => ({
      registrationId: c.id, memberId: c.member_id, displayName: c.display_name, historicalPersonId: c.historical_person_id,
      partnerlessDivisionIds: partnerless.get(c.id) ?? [],
    }));
    return readResultsFile(input.text, divisions, candidates, {
      ties: new Set(input.ties),
      newDivisions: new Set(input.contested),
    });
  }

  // One attendance mark inside the caller's transaction: the registration is
  // marked, a Tier 0 member's standing granted or extended, the act audited
  // with the standing before and after, and a member whose standing changed
  // is told. Returns the audit row's id, or null when the registration was
  // already marked.
  private markAttendedInTx(
    event: EventRow, row: AttendanceCandidateRow, actorId: string, actorType: 'member' | 'admin',
    actionType: 'event.attendance_marked' | 'event.attendance_corrected', reason: string | null, now: string,
  ): string | null {
    if (eventRegistrations.markAttended.run(now, actorId, now, actorId, row.id, event.id).changes !== 1) return null;
    const grant = applyAttendanceInTx(actorId, row.member_id, row.id, event.end_date);
    const changed = grant.status === 'granted' || grant.status === 'extended';
    const auditId = appendAuditEntry({
      actionType,
      actorType,
      actorMemberId: actorId,
      entityType: 'event',
      entityId: event.id,
      reasonText: reason,
      metadata: {
        registration_id: row.id,
        member_id: row.member_id,
        reason_code: 'official_event_attendance',
        active_player: grant.status === 'noop' ? grant.reason : grant.status,
        old_expires_at: changed ? grant.oldExpiresAt : null,
        new_expires_at: changed ? grant.expiresAt : null,
        ...(actionType === 'event.attendance_corrected'
          ? { changes: { attended: { before: null, after: now } } }
          : {}),
      },
    });
    if (changed) {
      emailService.sendActNotice({
        template: 'event_attendance_active_player',
        params: { eventTitle: event.title, expiryDate: grant.expiresAt.slice(0, 10) },
        memberId: row.member_id,
        actId: auditId,
      });
    }
    return auditId;
  }

  // ── Administrator corrections ──────────────────────────────────────────────
  //
  // The backstop for what an organizer's own surfaces do not reach: any field
  // on any event, the sanction state, and divisions whose entries are
  // confirmed. Each takes a reason, previews before it writes, writes nothing
  // when nothing changes, records every changed value before and after, and
  // emails the event's current organizers.

  /**
   * Correct an event's details, fees and, once it has opened, its sanction
   * state: granting sanction to a free event or revoking an approved one.
   */
  correctEventDetails(
    adminMemberId: string, eventId: string, values: EventFormValues, sanctionState: string,
    rawReason: string, opts: { preview: boolean },
  ): EventCorrection {
    const event = this.requireEventById(eventId);
    const reason = requireReason(rawReason);
    const sanctionEditable = SANCTION_CORRECTABLE_STATUSES.includes(event.status);
    const nextSanction = sanctionEditable && (sanctionState === 'approved' || sanctionState === 'none')
      ? sanctionState
      : event.sanction_status;
    const isSanctioned = sanctionEditable ? nextSanction === 'approved' : !isFreeEvent(event);
    const fieldErrors: Record<string, string> = {};
    const details = readEventDetails(values, isSanctioned, fieldErrors);
    if (Object.keys(fieldErrors).length > 0) throw new ValidationError('Please fix the errors below.', { fieldErrors });
    const paymentEnabled = sanctionEditable
      ? (nextSanction === 'approved' && (details.competitorFeeCents !== null || details.attendeeFeeCents !== null) ? 1 : 0)
      : event.payment_enabled;

    const changes = new CorrectionChanges(event.currency);
    changes.note('title', event.title, details.title);
    changes.note('description', event.description, details.description);
    changes.note('start_date', event.start_date, details.startDate);
    changes.note('end_date', event.end_date, details.endDate);
    changes.note('city', event.city, details.city);
    changes.note('region', event.region, details.region);
    changes.note('country', event.country, details.country);
    changes.note('registration_deadline', event.registration_deadline, details.registrationDeadline);
    changes.note('is_tshirt_size_collected', event.is_tshirt_size_collected, details.tshirtSizeCollected ? 1 : 0);
    changes.note('is_attendee_registration_open', event.is_attendee_registration_open, details.attendeeRegistrationOpen ? 1 : 0);
    changes.note('competitor_fee_cents', event.competitor_fee_cents, details.competitorFeeCents);
    changes.note('attendee_fee_cents', event.attendee_fee_cents, details.attendeeFeeCents);
    changes.note('sanction_status', event.sanction_status, nextSanction);
    changes.note('payment_enabled', event.payment_enabled, paymentEnabled);
    if (opts.preview || changes.isEmpty()) return changes.result(opts.preview);

    const now = new Date().toISOString();
    transaction(() => {
      eventWrites.correctEvent.run(
        details.title, details.description, details.startDate, details.endDate,
        details.city, details.region, details.country, details.registrationDeadline,
        details.tshirtSizeCollected ? 1 : 0, details.attendeeRegistrationOpen ? 1 : 0,
        details.competitorFeeCents, details.attendeeFeeCents,
        nextSanction, paymentEnabled,
        now, adminMemberId, event.id,
      );
      const auditId = appendAuditEntry({
        actionType: 'event.corrected',
        actorType: 'admin',
        actorMemberId: adminMemberId,
        entityType: 'event',
        entityId: event.id,
        reasonText: reason,
        metadata: { changes: changes.forAudit() },
      });
      this.notifyOrganizersOfCorrectionInTx(event, `its ${changes.phrase()}`, reason, auditId);
    });
    return changes.result(false);
  }

  /** Clear an event's description, which only an administrator can do on an organizer's behalf. */
  clearDescription(adminMemberId: string, eventId: string, rawReason: string, opts: { preview: boolean }): EventCorrection {
    const event = this.requireEventById(eventId);
    const reason = requireReason(rawReason);
    const changes = new CorrectionChanges(event.currency);
    changes.note('description', event.description, '');
    if (opts.preview || changes.isEmpty()) return changes.result(opts.preview);
    const now = new Date().toISOString();
    transaction(() => {
      eventWrites.correctEvent.run(
        event.title, '', event.start_date, event.end_date,
        event.city, event.region, event.country, event.registration_deadline,
        event.is_tshirt_size_collected, event.is_attendee_registration_open,
        event.competitor_fee_cents, event.attendee_fee_cents,
        event.sanction_status, event.payment_enabled,
        now, adminMemberId, event.id,
      );
      const auditId = appendAuditEntry({
        actionType: 'event.description_cleared',
        actorType: 'admin',
        actorMemberId: adminMemberId,
        entityType: 'event',
        entityId: event.id,
        reasonText: reason,
        metadata: { changes: changes.forAudit() },
      });
      this.notifyOrganizersOfCorrectionInTx(event, 'the event description, which has been cleared', reason, auditId);
    });
    return changes.result(false);
  }

  /** Correct a division's parts, including one whose entries are confirmed. */
  correctDivision(
    adminMemberId: string, eventId: string, input: DivisionInput & { divisionId: string },
    rawReason: string, opts: { preview: boolean },
  ): EventCorrection {
    const event = this.requireEventById(eventId);
    const reason = requireReason(rawReason);
    const divisions = eventWrites.listDivisions.all(event.id) as DivisionRow[];
    const existing = divisions.find((d) => d.id === input.divisionId);
    if (!existing) throw new ValidationError('That competition is no longer on this event.');
    const resolved = resolveDivisionGame({
      gameId: existing.game_id, customName: existing.custom_game_name, customDiscipline: existing.discipline_category,
    });
    const parts = validateDivisionParts(resolved, input);
    const name = divisionName(parts.divisionClass, parts.gender, parts.teamType, resolved.gameName);
    const clash = divisions.find((d) => d.name.toLowerCase() === name.toLowerCase() && d.id !== existing.id);
    if (clash) throw new ValidationError(`This event already has a competition named ${clash.name}.`);

    const changes = new CorrectionChanges(event.currency);
    changes.note('division_name', existing.name, name);
    changes.note('team_type', existing.team_type, parts.teamType);
    changes.note('gender_eligibility', existing.gender_eligibility, parts.gender);
    changes.note('division_class', existing.division_class, parts.divisionClass);
    changes.note('offers_prize_money', existing.offers_prize_money, parts.offersPrizeMoney ? 1 : 0);
    if (opts.preview || changes.isEmpty()) return changes.result(opts.preview);
    const now = new Date().toISOString();
    transaction(() => {
      eventWrites.updateDivision.run(
        name, parts.teamType, parts.gender, parts.divisionClass, parts.offersPrizeMoney ? 1 : 0,
        now, adminMemberId, existing.id, event.id,
      );
      const auditId = appendAuditEntry({
        actionType: 'event.division_corrected',
        actorType: 'admin',
        actorMemberId: adminMemberId,
        entityType: 'event',
        entityId: event.id,
        reasonText: reason,
        metadata: { division_id: existing.id, changes: changes.forAudit() },
      });
      this.notifyOrganizersOfCorrectionInTx(event, `the competition ${existing.name}`, reason, auditId);
    });
    return changes.result(false);
  }

  /**
   * Remove a division, including one whose entries are confirmed. Its entries
   * go with it; the preview counts them and the audit row names each one.
   */
  removeDivisionAsAdmin(
    adminMemberId: string, eventId: string, divisionId: string, rawReason: string, opts: { preview: boolean },
  ): EventCorrection {
    const event = this.requireEventById(eventId);
    const reason = requireReason(rawReason);
    const division = (eventWrites.listDivisions.all(event.id) as DivisionRow[]).find((d) => d.id === divisionId);
    const changes = new CorrectionChanges(event.currency);
    if (!division) return changes.result(opts.preview);
    const entries = eventRegistrations.listSelectionsForDivision.all(division.id) as Array<{
      id: string; registration_id: string; member_id: string; status: string;
    }>;
    changes.note('division', division.name, null);
    changes.note('division_entries', entries.length, 0);
    if (opts.preview) return changes.result(true);
    transaction(() => {
      eventRegistrations.deleteSelectionsForDivision.run(division.id);
      eventWrites.deleteDivision.run(division.id, event.id);
      const auditId = appendAuditEntry({
        actionType: 'event.division_corrected',
        actorType: 'admin',
        actorMemberId: adminMemberId,
        entityType: 'event',
        entityId: event.id,
        reasonText: reason,
        metadata: {
          division_id: division.id,
          removed: true,
          changes: changes.forAudit(),
          entries: entries.map((e) => ({ registration_id: e.registration_id, member_id: e.member_id, status: e.status })),
        },
      });
      this.notifyOrganizersOfCorrectionInTx(event, `the competition ${division.name}, which has been removed`, reason, auditId);
      // Each member whose registration entered it is told, as an
      // administrator's change to an entry tells them, with what remains.
      const told = new Set<string>();
      for (const e of entries) {
        if (e.status === 'canceled' || told.has(e.member_id)) continue;
        told.add(e.member_id);
        const member = eventRegistrations.findMemberById.get(e.member_id) as MemberRow | undefined;
        const reg = eventRegistrations.findForMember.get(event.id, e.member_id) as OwnRegistrationRow | undefined;
        if (!member || !reg) continue;
        const remaining = eventRegistrations.listSelectionsForRegistration.all(reg.id) as SelectionRow[];
        emailService.sendActNotice({
          template: 'event_registration_corrected',
          params: {
            memberName: member.display_name,
            eventTitle: event.title,
            eventDates: eventDatesPhrase(event.start_date, event.end_date),
            whatChanged: `${division.name} removed from the event.`,
            registrationSummary: registrationSummary(reg.registration_type, remaining.map(toEntryView), reg.tshirt_size),
            byAdministrator: true,
            reason,
          },
          memberId: e.member_id,
          actId: auditId,
        });
      }
    });
    return changes.result(false);
  }

  /** The parts form for an administrator's correction of one division. */
  getDivisionCorrectionStep(eventId: string, divisionId: string): { eventTitle: string; divisionName: string; step: DivisionPartsStep } {
    const event = this.requireEventById(eventId);
    const division = (eventWrites.listDivisions.all(event.id) as DivisionRow[]).find((d) => d.id === divisionId);
    if (!division) throw new NotFoundError('Competition not found.');
    const games = eventWrites.listGames.all() as GameRow[];
    const adminBase = `/admin/events/${encodeURIComponent(event.id)}`;
    const step = divisionPartsStep(adminBase, games, {
      gameId: division.game_id, customName: division.custom_game_name, customDiscipline: division.discipline_category,
    }, division);
    if (!step) throw new NotFoundError('Competition not found.');
    return {
      eventTitle: event.title,
      divisionName: division.name,
      step: {
        ...step,
        action: `${adminBase}/divisions/${encodeURIComponent(division.id)}`,
        cancelHref: adminBase,
        submitLabel: 'Review the Competition Correction',
      },
    };
  }

  private notifyOrganizersOfCorrectionInTx(event: EventRow, whatChanged: string, note: string, auditId: string): void {
    const organizers = eventOrganizers.listForEvent.all(event.id) as Array<{ member_id: string; display_name: string }>;
    for (const o of organizers) {
      emailService.sendActNotice({
        template: 'event_record_corrected',
        params: { organizerName: o.display_name, eventTitle: event.title, whatChanged, note },
        memberId: o.member_id,
        actId: auditId,
      });
    }
  }

  // An event by its id, whatever its status, for an administrator's door.
  private requireEventById(eventId: string): EventRow {
    const event = eventWrites.findById.get(eventId) as EventRow | undefined;
    if (!event) throw new NotFoundError('Event not found.');
    return event;
  }

  /** The confirm step every removal on an organizer surface passes through. */
  getConfirmPage(opts: {
    title: string; caution: string; action: string; buttonLabel: string; cancelHref: string;
    hiddenMemberId?: string;
    reasonField?: { label: string; value: string; error: string | null };
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
        reasonField: opts.reasonField ?? null,
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

/**
 * The organizers' dashboard item for an event that has ended with something
 * still owed: its results, and for a sanctioned event its after-event summary.
 * Every current organizer sees it, pending until the twenty days after the
 * event's last day run out and needing attention now after that. It clears
 * when what it asks for is done.
 */
export const eventActionSource: MemberActionSource = {
  sourceKey: 'event',

  itemsFor(ctx: MemberActionContext): MemberActionItem[] {
    const today = todayUtc();
    const rows = eventResults.listEndedForOrganizer.all(ctx.memberId, today) as Array<{
      id: string; title: string; end_date: string; sanction_status: string; tag_normalized: string;
      has_results: number; summary_sent: number;
    }>;
    const items: MemberActionItem[] = [];
    for (const row of rows) {
      const o = eventObligations(row, row.has_results === 1, row.summary_sent === 1, today);
      if (!o.resultsOwed && !o.summaryOwed) continue;
      const base = eventBasePath(row);
      const by = formatDateDisplay(o.deadline, { style: 'long' });
      // The announcement form takes Tier 2 or 3; a co-organizer below that
      // sees the summary named in the headline and leaves sending it to one who can.
      const canAnnounce = isTier2Plus(ctx.memberId);
      const options = [
        ...(o.resultsOwed ? [navigateTo('Upload Results', `${base}/results`)] : []),
        ...(o.summaryOwed && canAnnounce
          ? [navigateTo('Send the Event Summary', `/members/${encodeURIComponent(ctx.slug)}/announce`)]
          : []),
      ];
      if (options.length === 0) continue;
      const input = {
        kind: 'event_results_owed',
        headline: o.resultsOwed && o.summaryOwed
          ? `Upload results and send the event summary for ${row.title}`
          : o.resultsOwed ? `Upload results for ${row.title}` : `Send the event summary for ${row.title}`,
        detail: o.isSanctioned
          ? `IFPA sanctioning asks for both by ${by}.`
          : `The event has ended; its results belong on its page.`,
        // Only sanctioning sets a deadline; an unsanctioned event's results are owed without one.
        deadline: o.isSanctioned ? o.deadline : null,
        options,
      };
      items.push(o.overdue && o.isSanctioned ? urgentAction(input) : pendingAction(input));
    }
    return items;
  },
};
