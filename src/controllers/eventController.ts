import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  eventService, resultsDecisionsFromFields,
  type EntryInput, type EventFormValues, type PartnerInput, type RegistrationInput, type ResultsUploadInput, type SanctionFormValues,
} from '../services/eventService';
import { RESULTS_FILE_MAX_BYTES, RESULTS_FILE_MAX_ROWS } from '../services/eventResultsFile';
import { readMultipart } from '../lib/multipartForm';
import { COVER_PHOTO_MISSING_MESSAGE, coverNoteAfterCreate, readCoverForm, type CoverForm } from '../lib/coverPhotoForm';
import { isAdminCaller } from '../lib/routeOwnership';
import { ImageProcessingError } from '../adapters/imageProcessingAdapter';
import { ConflictError, ForbiddenError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import {
  handleControllerError, renderForbidden, renderImageWorkerUnavailable, renderInvalidRequest, renderNotFound, renderRateLimited,
} from '../lib/controllerErrors';
import { statusForPage } from '../lib/searchRefusal';
import { parseFormBody, formText, formOptionalText, formCheckbox, formList } from '../lib/parseFormBody';
import { FLASH_KIND, readFlash, clearFlash } from '../lib/flashCookie';
import { redirectWithOutcome, type ActionEnding } from '../lib/actionOutcome';
import { outcomeNotice, type OutcomeNoticeView } from '../lib/outcomeNotice';
import { renderPdf, sendPdfDownload } from '../lib/printableDocument';
import { parsePickIntent } from '../services/memberPicker';

/**
 * Thin controller layer for the Events routes: the public pages, and an
 * organizer's own surfaces for creating and running an event.
 *
 * Responsibilities:
 *  - Parse route params and form bodies
 *  - Call the appropriate EventService method
 *  - Render the correct Handlebars template, or redirect with the outcome
 *  - Map service errors to HTTP status codes
 *
 * Business logic and page shaping live in EventService, not here.
 */

const eventForm = z.object({
  title: formText('Event title'),
  description: formText('Description'),
  start_date: formText('First day'),
  end_date: formText('Last day'),
  city: formText('City'),
  region: formText('State or province'),
  country: formText('Country'),
  registration_deadline: formText('Registration deadline'),
  tshirt_size_collected: formCheckbox('Collect t-shirt sizes', '0'),
  attendee_registration_open: formCheckbox('Let spectators register too', '0'),
  slug: formText('Event hashtag'),
  event_type: formText('Free or sanctioned'),
  competitor_fee: formText('Competitor fee'),
  spectator_fee: formText('Spectator fee'),
});

const divisionForm = z.object({
  division_id: formOptionalText('The competition'),
  game_id: formText('What is played'),
  custom_name: formText('Game name'),
  custom_discipline: formText('Sport'),
  team_type: formText('Singles or doubles'),
  gender: formText('Who may enter'),
  division_class: formText('Skill level'),
  offers_prize_money: formCheckbox('Offers prize money', '0'),
});

const organizerForm = z.object({
  member_id: formText('The member to add'),
  pick: formOptionalText('The member picker'),
  pick_q: formText("New organizer's name"),
});
const removeOrganizerForm = z.object({
  member_id: formText('The organizer'),
  confirmed: formOptionalText('The confirmation'),
});
const confirmForm = z.object({ confirmed: formOptionalText('The confirmation') });

// The partner fields repeat once per doubles division, in the form's order, so
// the two partner lists line up entry for entry: the division, and the member
// id chosen from the member search (empty while none is chosen).
const registerForm = z.object({
  registration_type: formText('Registering as'),
  division: formList('Competitions'),
  amateur: formList('Enter as an Amateur'),
  partner_division: formList('Partner competition'),
  partner: formList('Partner'),
  looking: formList('Looking for a partner'),
  tshirt_size: formText('T-shirt size'),
  pick: formOptionalText('The partner picker'),
  pick_q: formText("Partner's name"),
});

// A member's own doubles partners: the partner fields pair up as the
// registration form's do, and each looking tick names its division.
const partnerForm = z.object({
  partner_division: formList('Partner competition'),
  partner: formList('Partner'),
  looking: formList('Looking for a partner'),
  pick: formOptionalText('The partner picker'),
  pick_q: formText("Partner's name"),
});

function toPartnerInput(d: z.output<typeof partnerForm>): PartnerInput {
  return {
    partners: d.partner_division.map((divisionId, i) => ({ divisionId, memberId: d.partner[i] ?? '' })),
    lookingDivisionIds: d.looking,
  };
}

// Add Entrant and Edit Entry, for an organizer and an administrator alike. The
// partner fields pair up as the registration form's do; the entrant's id is
// read on Add Entrant only, and the reason on an administrator's form only.
export const entryForm = z.object({
  member_id: formText('Entrant'),
  division: formList('Competitions'),
  partner_division: formList('Partner competition'),
  partner: formList('Partner'),
  paid_at_event: formCheckbox('Paid at the event', '0'),
  reason: formText('Reason'),
  pick: formOptionalText('The member picker'),
  pick_q: formText("Member's name"),
});

export function toEntryInput(d: z.output<typeof entryForm>): EntryInput {
  return {
    memberId: d.member_id,
    divisionIds: d.division,
    partners: d.partner_division.map((divisionId, i) => ({ divisionId, memberId: d.partner[i] ?? '' })),
    paidAtEvent: d.paid_at_event === '1',
  };
}

const registrationStatusForm = z.object({ set_to: formText('Online registration') });

const attendanceForm = z.object({ registration: formList('Participants') });

// The results forms are multipart, so the file and the preview's text travel
// past the urlencoded body limit. One file part at most; the field count
// covers a tie or contested-division box per row of the largest file.
const RESULTS_MULTIPART_LIMITS = { fileSize: RESULTS_FILE_MAX_BYTES, files: 1, fields: RESULTS_FILE_MAX_ROWS * 2 + 10 };

const reasonConfirmForm = z.object({
  confirmed: formOptionalText('The confirmation'),
  reason: formText('Reason'),
});

const participantEmailForm = z.object({
  subject: formText('Subject'),
  body_text: formText('Message'),
  send_token: formText('The form'),
  step: formText('The button'),
});

const sanctionForm = z.object({
  attest: formCheckbox('The sanctioning attestation', '0'),
  deviates: formText('Differs from the official rules'),
  deviations: formText('Where the event differs'),
  prize_money: formText('Prize money'),
  prize_total: formText('Total prize money'),
  prize_currency: formText('Prize money currency'),
  entry_fee_includes: formText('What the entry fee includes'),
  frequency: formText('How often the event is held'),
  years_held: formText('Years held'),
  expected_players: formText('Expected players'),
  expected_spectators: formText('Expected spectators'),
  permits: formText('Permits'),
  insurance: formText('Insurance'),
  justification: formText('Fee justification'),
});

function toSanctionValues(typed: Partial<Record<string, string>>): SanctionFormValues {
  return {
    attest: typed.attest === '1',
    deviates: typed.deviates ?? '',
    deviations: typed.deviations ?? '',
    prizeMoney: typed.prize_money ?? '',
    prizeTotal: typed.prize_total ?? '',
    prizeCurrency: typed.prize_currency ?? '',
    entryFeeIncludes: typed.entry_fee_includes ?? '',
    frequency: typed.frequency ?? '',
    yearsHeld: typed.years_held ?? '',
    expectedPlayers: typed.expected_players ?? '',
    expectedSpectators: typed.expected_spectators ?? '',
    permits: typed.permits ?? '',
    insurance: typed.insurance ?? '',
    justification: typed.justification ?? '',
  };
}

function toRegistrationInput(d: z.output<typeof registerForm>): RegistrationInput {
  return {
    type: d.registration_type,
    divisionIds: d.division,
    amateurIds: d.amateur,
    partners: d.partner_division.map((divisionId, i) => ({ divisionId, memberId: d.partner[i] ?? '' })),
    lookingDivisionIds: d.looking,
    tshirtSize: d.tshirt_size,
  };
}

function eventHref(eventKey: string): string {
  return `/events/${encodeURIComponent(eventKey)}`;
}

function toFormValues(typed: Partial<Record<string, string>>): EventFormValues {
  return {
    title: typed.title ?? '',
    description: typed.description ?? '',
    startDate: typed.start_date ?? '',
    endDate: typed.end_date ?? '',
    city: typed.city ?? '',
    region: typed.region ?? '',
    country: typed.country ?? '',
    registrationDeadline: typed.registration_deadline ?? '',
    tshirtSizeCollected: typed.tshirt_size_collected === '1',
    attendeeRegistrationOpen: typed.attendee_registration_open === '1',
    slug: typed.slug ?? '',
    eventType: typed.event_type ?? 'free',
    competitorFee: typed.competitor_fee ?? '',
    spectatorFee: typed.spectator_fee ?? '',
  };
}

function eventKeyParam(req: Request): string {
  return typeof req.params.eventKey === 'string' ? req.params.eventKey : '';
}

function manageHref(eventKey: string): string {
  return `/events/${encodeURIComponent(eventKey)}/manage`;
}

function profileHref(req: Request): string {
  return `/members/${encodeURIComponent(req.user!.slug)}`;
}

// Every organizer action redirects to the manage page with its outcome in the
// flash cookie; taken once and cleared, so a reload does not repeat it.
function takeEventNotice(req: Request, res: Response): OutcomeNoticeView | null {
  const flash = readFlash(req);
  if (flash?.kind !== FLASH_KIND.EVENT_ACTION) return null;
  clearFlash(res, req);
  return outcomeNotice(flash.payload);
}

function flashTo(req: Request, res: Response, to: string, ending: ActionEnding, text: string): void {
  redirectWithOutcome(req, res, { flash: FLASH_KIND.EVENT_ACTION, to, ending, text });
}

function participantsHref(eventKey: string): string {
  return `/events/${encodeURIComponent(eventKey)}/participants`;
}

// The participant list after a saved correction, naming the entry so its
// notice carries an Edit Entry link back to it.
function entryNoticeHref(eventKey: string, registrationId: string): string {
  return `${participantsHref(eventKey)}?entry=${encodeURIComponent(registrationId)}`;
}

function registrationIdParam(req: Request): string {
  return typeof req.params.registrationId === 'string' ? req.params.registrationId : '';
}

// A correction refused before its form can be drawn (corrections closed, the
// event canceled) goes back to the participant list with the reason; anything
// else takes the standard error path.
function refuseToParticipants(req: Request, res: Response, next: NextFunction, eventKey: string, err: unknown): void {
  if (err instanceof ValidationError) { flashTo(req, res, participantsHref(eventKey), 'refused', err.message); return; }
  handleControllerError(err, res, next, 'events controller');
}

// The results upload's second half, shared by the file upload and the
// preview's own form: show the preview, or on a commit publish it and move on
// to attendance. A refused commit shows the preview again with the reason.
function renderResultsStep(req: Request, res: Response, eventKey: string, input: ResultsUploadInput, commit: boolean): void {
  const userId = req.user!.userId;
  try {
    if (commit) {
      const result = eventService.commitResults(userId, eventKey, input);
      flashTo(req, res, `${eventHref(eventKey)}/attendance`, result.branch === 'committed' ? 'advance' : 'own_repeat',
        `Results published: ${result.rowCount} placing${result.rowCount === 1 ? '' : 's'}. Now confirm who else attended.`);
      return;
    }
    const result = eventService.previewResults(userId, eventKey, input);
    const status = result.fileErrors.length > 0 ? 422 : 200;
    res.status(status).render('events/results', eventService.getResultsUploadPage(eventKey, userId, { preview: { input, result } }));
  } catch (err) {
    if (!(err instanceof ValidationError)) throw err;
    res.status(422).render('events/results', eventService.getResultsUploadPage(eventKey, userId, {
      errorMessage: err.message,
      preview: commit ? { input, result: eventService.previewResults(userId, eventKey, input) } : null,
    }));
  }
}

// The reason field of a confirm page, carrying what was typed and, after a
// refused submit, why it was refused.
function reasonField(label: string, value: string, err: unknown): { label: string; value: string; error: string | null } {
  const error = err instanceof ValidationError ? (err.fieldErrors?.reason ?? err.message) : null;
  return { label, value, error };
}

// The create form's text fields and their repeated checkbox parts, with room to spare.
const CREATE_TEXT_FIELDS = 40;

function coverEnding(branch: 'changed' | 'own_repeat' | 'already_held'): ActionEnding {
  return branch === 'changed' ? 'advance' : branch;
}

// The create form, read from either body. The event is created in its own
// transaction first; a chosen cover photo is uploaded after, and a refusal of
// the photo is added to the success message rather than undoing the event.
async function createEventFrom(req: Request, res: Response, form: CoverForm): Promise<void> {
  const parsed = form.fields ? parseFormBody(eventForm, form.fields) : parseFormBody(eventForm, req.body);
  const values = toFormValues(parsed.ok ? parsed.data : parsed.submitted);
  const renderForm = (message: string, fieldErrors?: Record<string, string>, tone: 'no' | 'info' = 'no', kept = values) => {
    res.status(422).render('events/create', eventService.getCreateEventPage(
      req.user!.userId, req.user!.slug, { values: kept, fieldErrors, message, tone },
    ));
  };
  if (!parsed.ok) { renderForm(parsed.message, parsed.fieldErrors); return; }

  let result;
  try {
    result = eventService.createEvent(req.user!.userId, values);
  } catch (err) {
    if (err instanceof ValidationError) { renderForm(err.message, err.fieldErrors); return; }
    throw err;
  }

  switch (result.branch) {
    case 'created':
    case 'own_repeat': {
      const eventKey = result.eventKey;
      const uploader = { memberId: req.user!.userId, slug: req.user!.slug, isAdmin: isAdminCaller(req) };
      const coverNote = await coverNoteAfterCreate(
        form, (file) => eventService.uploadCoverPhoto(uploader, eventKey, file), "the event's manage page",
      );
      flashTo(req, res, manageHref(eventKey), result.branch === 'created' ? 'advance' : 'own_repeat',
        `${result.branch === 'created' && !result.isOpen
          ? 'Event created as a draft. It is not public until its sanction is approved.'
          : 'Event created. It is open for registration and listed under Upcoming Events.'}`
          + ` Its hashtag is #${eventKey}: photos and videos carrying it appear in the event's gallery.`
          + coverNote);
      return;
    }
    case 'tag_conflict':
      renderForm(
        `The hashtag ${result.tagNormalized} is already taken.${result.suggestion ? ` Try adding the city, for example ${result.suggestion}.` : ' Try adding something that sets your event apart, such as the city.'}`,
        { slug: 'Choose a different hashtag.' },
      );
      return;
    case 'slug_folded':
      renderForm(
        `Your event hashtag will end in ${result.slug}. A hashtag uses only the letters a to z, digits and underscores, so accented letters became plain ones and other characters became underscores. It is permanent, so check it, then press Create Event again.`,
        undefined, 'info', { ...values, slug: result.slug },
      );
      return;
  }
}

export const eventController = {
  /**
   * GET /events
   * Events landing page: upcoming events + archive year links.
   */
  landing(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = eventService.getPublicEventsLandingPage(new Date().toISOString());
      res.render('events/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /**
   * GET /events/year/:year
   * Full-year archive page, all completed events for a given year.
   */
  year(req: Request, res: Response, next: NextFunction): void {
    try {
      const rawYear = req.params.year;
      const year = parseInt(rawYear, 10);

      // Non-integer year params are treated as 404 (do not expose param detail)
      if (isNaN(year)) {
        renderNotFound(res);
        return;
      }

      const vm = eventService.getPublicEventsYearPage(year);
      res.render('events/year', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /**
   * GET /events/:eventKey
   * Canonical single-event page. eventKey format: event_{year}_{slug}
   */
  event(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = req.params.eventKey;
      const isMember = req.isMember === true;
      const vm = eventService.getPublicEventPage(
        eventKey,
        {
          isMember,
          memberId: isMember ? req.user?.userId : undefined,
          onboardingMemberId: isMember ? undefined : req.user?.userId,
        },
        { notice: takeEventNotice(req, res) },
      );
      res.render('events/detail', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** GET /events/create */
  getCreate(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('events/create', eventService.getCreateEventPage(req.user!.userId, req.user!.slug));
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /**
   * POST /events/create. Multipart when it carries a cover photo; the event is
   * created first, in its own transaction, and the photo uploaded after it, so
   * a refused photo leaves the event created and the message says so.
   */
  postCreate(req: Request, res: Response, next: NextFunction): void {
    readCoverForm(req, { isAdmin: isAdminCaller(req), maxTextFields: CREATE_TEXT_FIELDS }, (form) => {
      createEventFrom(req, res, form).catch((err: unknown) => handleControllerError(err, res, next, 'events controller'));
    }, (err) => next(err));
  },

  /** GET /events/:eventKey/manage */
  getManage(req: Request, res: Response, next: NextFunction): void {
    try {
      const q = (name: string): string | undefined => (typeof req.query[name] === 'string' ? req.query[name] as string : undefined);
      const vm = eventService.getManageEventPage(eventKeyParam(req), req.user!.userId, {
        game: q('game'),
        customName: q('custom_name'),
        customDiscipline: q('custom_discipline'),
        editDivision: q('editDivision'),
      }, { notice: takeEventNotice(req, res) });
      res.render('events/manage', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/cover-photo: upload a photo and make it the event's cover. */
  postCoverPhoto(req: Request, res: Response, next: NextFunction): void {
    const eventKey = eventKeyParam(req);
    const uploader = { memberId: req.user!.userId, slug: req.user!.slug, isAdmin: isAdminCaller(req) };
    readCoverForm(req, { isAdmin: uploader.isAdmin, maxTextFields: 2 }, (form) => {
      const refuse = (change: { message: string; httpStatus: number; retryAfterSeconds?: number }): void => {
        if (change.retryAfterSeconds) res.setHeader('Retry-After', String(change.retryAfterSeconds));
        res.status(change.httpStatus).render('events/manage', eventService.getManageEventPage(
          eventKey, uploader.memberId, {}, { notice: { text: change.message, tone: 'no' } },
        ));
      };
      (async () => {
        if (form.tooLargeMessage || !form.file) {
          refuse({ message: form.tooLargeMessage ?? COVER_PHOTO_MISSING_MESSAGE, httpStatus: 422 });
          return;
        }
        const change = await eventService.uploadCoverPhoto(uploader, eventKey, form.file);
        if (change.branch === 'refused') { refuse(change); return; }
        flashTo(req, res, manageHref(eventKey), coverEnding(change.branch), 'Cover photo saved.');
      })().catch((err: unknown) => {
        if (err instanceof ImageProcessingError) { renderImageWorkerUnavailable(res, 'event cover photo: image worker unavailable', err); return; }
        handleControllerError(err, res, next, 'events controller');
      });
    }, (err) => next(err));
  },

  /** POST /events/:eventKey/cover-photo/remove: clear the cover; the photo stays in the gallery. */
  postRemoveCoverPhoto(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const change = eventService.removeCoverPhoto(req.user!.userId, eventKey);
      if (change.branch === 'refused') { flashTo(req, res, manageHref(eventKey), 'refused', change.message); return; }
      flashTo(req, res, manageHref(eventKey), coverEnding(change.branch), 'Cover photo removed.');
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/edit */
  postEdit(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const parsed = parseFormBody(eventForm, req.body);
      const values = toFormValues(parsed.ok ? parsed.data : parsed.submitted);
      const renderForm = (message: string, fieldErrors: Record<string, string>) => {
        res.status(422).render('events/manage', eventService.getManageEventPage(
          eventKey, req.user!.userId, {}, { detailsForm: { values, fieldErrors, message } },
        ));
      };
      if (!parsed.ok) { renderForm(parsed.message, parsed.fieldErrors); return; }
      let result;
      try {
        result = eventService.updateEventDetails(req.user!.userId, eventKey, values);
      } catch (err) {
        if (err instanceof ValidationError && err.fieldErrors) { renderForm(err.message, err.fieldErrors); return; }
        if (err instanceof ValidationError) { flashTo(req, res, manageHref(eventKey), 'refused', err.message); return; }
        throw err;
      }
      flashTo(req, res, manageHref(eventKey), result.branch === 'updated' ? 'advance' : 'own_repeat', 'Event details saved.');
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/divisions */
  postDivision(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const parsed = parseFormBody(divisionForm, req.body);
      if (!parsed.ok) { flashTo(req, res, manageHref(eventKey), 'refused', parsed.message); return; }
      const d = parsed.data;
      try {
        const result = eventService.saveDivision(req.user!.userId, eventKey, {
          divisionId: d.division_id || undefined,
          gameId: d.game_id,
          customName: d.custom_name,
          customDiscipline: d.custom_discipline,
          teamType: d.team_type,
          gender: d.gender,
          divisionClass: d.division_class,
          offersPrizeMoney: d.offers_prize_money === '1',
        });
        const text = result.branch === 'added' ? 'Competition added.' : 'Competition saved.';
        flashTo(req, res, manageHref(eventKey), result.branch === 'unchanged' ? 'own_repeat' : 'advance', text);
      } catch (err) {
        if (err instanceof ValidationError) { flashTo(req, res, manageHref(eventKey), 'refused', err.message); return; }
        throw err;
      }
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/divisions/:divisionId/remove */
  postRemoveDivision(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const parsed = parseFormBody(confirmForm, req.body);
      if (!parsed.ok) { renderInvalidRequest(res, { title: parsed.message }); return; }
      const divisionId = typeof req.params.divisionId === 'string' ? req.params.divisionId : '';
      let result;
      try {
        result = eventService.removeDivision(req.user!.userId, eventKey, divisionId, parsed.data.confirmed === '1');
      } catch (err) {
        if (err instanceof ValidationError) { flashTo(req, res, manageHref(eventKey), 'refused', err.message); return; }
        throw err;
      }
      if (result.branch === 'needs_confirmation') {
        res.render('events/confirm', eventService.getConfirmPage({
          title: `Remove ${result.divisionName}`,
          caution: `Removing ${result.divisionName} takes it off ${result.eventTitle}. You can add it again later.`,
          action: `/events/${encodeURIComponent(eventKey)}/divisions/${encodeURIComponent(divisionId)}/remove`,
          buttonLabel: 'Remove Competition',
          cancelHref: manageHref(eventKey),
        }));
        return;
      }
      const endings: Record<typeof result.branch, [ActionEnding, string]> = {
        removed: ['advance', 'Competition removed.'],
        own_repeat: ['own_repeat', 'Competition removed.'],
        already_held: ['already_held', 'That competition is no longer on this event.'],
      };
      const [ending, text] = endings[result.branch];
      flashTo(req, res, manageHref(eventKey), ending, text);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/organizers */
  postAddOrganizer(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const parsed = parseFormBody(organizerForm, req.body);
      if (!parsed.ok) { flashTo(req, res, manageHref(eventKey), 'refused', parsed.message); return; }
      // A member picker control draws the manage page again, adding nobody.
      if (parsed.data.pick !== undefined) {
        const vm = eventService.getManageEventPage(eventKey, req.user!.userId, {}, {
          organizerPicker: { intent: parsePickIntent(parsed.data.pick), query: parsed.data.pick_q, ip: req.ip ?? 'unknown' },
        });
        res.status(statusForPage(res, vm, 200)).render('events/manage', vm);
        return;
      }
      try {
        const result = eventService.addOrganizer(req.user!.userId, eventKey, parsed.data.member_id);
        const endings: Record<typeof result.branch, [ActionEnding, string]> = {
          added: ['advance', `${result.name} is now an organizer of this event.`],
          own_repeat: ['own_repeat', `${result.name} is now an organizer of this event.`],
          already_held: ['already_held', `${result.name} is already an organizer of this event.`],
        };
        const [ending, text] = endings[result.branch];
        flashTo(req, res, manageHref(eventKey), ending, text);
      } catch (err) {
        if (err instanceof ValidationError) { flashTo(req, res, manageHref(eventKey), 'refused', err.message); return; }
        throw err;
      }
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/organizers/remove */
  postRemoveOrganizer(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const parsed = parseFormBody(removeOrganizerForm, req.body);
      if (!parsed.ok) { renderInvalidRequest(res, { title: parsed.message }); return; }
      const memberId = parsed.data.member_id;
      let result;
      try {
        result = eventService.removeOrganizer(req.user!.userId, eventKey, memberId, parsed.data.confirmed === '1');
      } catch (err) {
        if (err instanceof ValidationError) { flashTo(req, res, manageHref(eventKey), 'refused', err.message); return; }
        throw err;
      }
      if (result.branch === 'needs_confirmation') {
        res.render('events/confirm', eventService.getConfirmPage({
          title: `Remove ${result.name} as Organizer`,
          caution: `${result.name} will no longer be able to manage ${result.eventTitle}.`,
          action: `/events/${encodeURIComponent(eventKey)}/organizers/remove`,
          buttonLabel: 'Remove Organizer',
          cancelHref: manageHref(eventKey),
          hiddenMemberId: memberId,
        }));
        return;
      }
      const endings: Record<typeof result.branch, [ActionEnding, string]> = {
        removed: ['advance', 'Organizer removed.'],
        own_repeat: ['own_repeat', 'Organizer removed.'],
        already_held: ['already_held', 'That member is not an organizer of this event.'],
      };
      const [ending, text] = endings[result.branch];
      flashTo(req, res, manageHref(eventKey), ending, text);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/step-down */
  postStepDown(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const parsed = parseFormBody(confirmForm, req.body);
      if (!parsed.ok) { renderInvalidRequest(res, { title: parsed.message }); return; }
      let result;
      try {
        result = eventService.stepDownAsOrganizer(req.user!.userId, eventKey, parsed.data.confirmed === '1');
      } catch (err) {
        if (err instanceof ValidationError) { flashTo(req, res, profileHref(req), 'refused', err.message); return; }
        throw err;
      }
      if (result.branch === 'needs_confirmation') {
        res.render('events/confirm', eventService.getConfirmPage({
          title: `Step Down From ${result.eventTitle}`,
          caution: `Stepping down gives up your organizer role for ${result.eventTitle}. Another organizer can add you back.`,
          action: `/events/${encodeURIComponent(eventKey)}/step-down`,
          buttonLabel: 'Step Down as Organizer',
          cancelHref: profileHref(req),
        }));
        return;
      }
      const endings: Record<typeof result.branch, [ActionEnding, string]> = {
        stepped_down: ['advance', 'Stepped down as an organizer of this event.'],
        own_repeat: ['own_repeat', 'Stepped down as an organizer of this event.'],
        not_organizer: ['already_held', 'You are not an organizer of this event.'],
      };
      const [ending, text] = endings[result.branch];
      flashTo(req, res, profileHref(req), ending, text);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** GET /events/:eventKey/register */
  getRegister(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const result = eventService.getRegisterPage(eventKey, req.user!.userId);
      if (result.branch === 'form') { res.render('events/register', result.page); return; }
      flashTo(req, res, eventHref(eventKey), result.branch === 'already_registered' ? 'already_held' : 'refused', result.message);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/register */
  async postRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const eventKey = eventKeyParam(req);
      const parsed = parseFormBody(registerForm, req.body);
      const renderForm = (input: RegistrationInput, message: string): void => {
        const page = eventService.getRegisterPage(eventKey, req.user!.userId, { input, message });
        if (page.branch === 'form') { res.status(422).render('events/register', page.page); return; }
        flashTo(req, res, eventHref(eventKey), 'refused', page.message);
      };
      if (!parsed.ok) {
        renderForm(toRegistrationInput(registerForm.parse({})), parsed.message);
        return;
      }
      const input = toRegistrationInput(parsed.data);
      // A partner picker control draws the form again with everything typed,
      // registering nothing.
      if (parsed.data.pick !== undefined) {
        const page = eventService.getRegisterPage(eventKey, req.user!.userId, { input, message: null }, {
          intent: parsePickIntent(parsed.data.pick), query: parsed.data.pick_q, ip: req.ip ?? 'unknown',
        });
        if (page.branch === 'form') { res.status(statusForPage(res, page.page, 200)).render('events/register', page.page); return; }
        flashTo(req, res, eventHref(eventKey), page.branch === 'already_registered' ? 'already_held' : 'refused', page.message);
        return;
      }
      let result;
      try {
        result = await eventService.register(req.user!.userId, eventKey, input);
      } catch (err) {
        if (err instanceof ValidationError || err instanceof ConflictError) { renderForm(input, err.message); return; }
        if (err instanceof RateLimitedError) {
          if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
          renderRateLimited(res, { title: 'Too Many Attempts', detail: err.message });
          return;
        }
        throw err;
      }
      if (result.branch === 'checkout') { res.redirect(303, result.redirectUrl); return; }
      flashTo(req, res, eventHref(eventKey), result.branch === 'registered' ? 'advance' : 'own_repeat',
        `You are registered for ${result.eventTitle}.`);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** GET /events/:eventKey/registration/partner */
  getPartner(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const result = eventService.getPartnerPage(eventKey, req.user!.userId);
      if (result.branch === 'form') { res.render('events/partner', result.page); return; }
      flashTo(req, res, eventHref(eventKey), 'refused', result.message);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/registration/partner */
  postPartner(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const parsed = parseFormBody(partnerForm, req.body);
      const renderForm = (input: PartnerInput, message: string | null, status: number, picker?: Parameters<typeof eventService.getPartnerPage>[3]): void => {
        const page = eventService.getPartnerPage(eventKey, req.user!.userId, { input, message }, picker);
        if (page.branch === 'form') { res.status(statusForPage(res, page.page, status)).render('events/partner', page.page); return; }
        flashTo(req, res, eventHref(eventKey), 'refused', page.message);
      };
      if (!parsed.ok) { renderForm(toPartnerInput(partnerForm.parse({})), parsed.message, 422); return; }
      const input = toPartnerInput(parsed.data);
      // A partner picker control draws the form again with everything chosen, saving nothing.
      if (parsed.data.pick !== undefined) {
        renderForm(input, null, 200, { intent: parsePickIntent(parsed.data.pick), query: parsed.data.pick_q, ip: req.ip ?? 'unknown' });
        return;
      }
      let result;
      try {
        result = eventService.changePartners(req.user!.userId, eventKey, input);
      } catch (err) {
        if (err instanceof ValidationError) { renderForm(input, err.message, 422); return; }
        if (err instanceof RateLimitedError) {
          if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
          renderRateLimited(res, { title: 'Too Many Attempts', detail: err.message });
          return;
        }
        throw err;
      }
      flashTo(req, res, eventHref(eventKey), result.branch === 'saved' ? 'advance' : 'own_repeat', result.message);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/withdraw */
  async postWithdraw(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const eventKey = eventKeyParam(req);
      const parsed = parseFormBody(confirmForm, req.body);
      if (!parsed.ok) { renderInvalidRequest(res, { title: parsed.message }); return; }
      let result;
      try {
        result = await eventService.withdrawRegistration(req.user!.userId, eventKey, parsed.data.confirmed === '1');
      } catch (err) {
        if (err instanceof ValidationError) { flashTo(req, res, eventHref(eventKey), 'refused', err.message); return; }
        throw err;
      }
      if (result.branch === 'needs_confirmation') {
        res.render('events/confirm', eventService.getConfirmPage({
          title: `Withdraw From ${result.eventTitle}`,
          caution: `Withdraw from ${result.eventTitle}? The organizers are told, and you can register again while registration is open.`
            + (result.isPaid ? ' Any refund is arranged by the IFPA Treasurer outside the platform.' : ''),
          action: `${eventHref(eventKey)}/withdraw`,
          buttonLabel: 'Withdraw Registration',
          cancelHref: eventHref(eventKey),
        }));
        return;
      }
      const endings: Record<typeof result.branch, [ActionEnding, string]> = {
        withdrawn: ['advance', `You withdrew from ${result.eventTitle}.`],
        own_repeat: ['own_repeat', `You withdrew from ${result.eventTitle}.`],
        not_registered: ['already_held', `You are not registered for ${result.eventTitle}.`],
      };
      const [ending, text] = endings[result.branch];
      flashTo(req, res, eventHref(eventKey), ending, text);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** GET /events/:eventKey/sanction */
  getSanction(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const result = eventService.getSanctionRequestPage(eventKey, req.user!.userId);
      if (result.branch === 'form') { res.render('events/sanction', result.page); return; }
      flashTo(req, res, manageHref(eventKey), 'already_held', result.text);
    } catch (err) {
      if (err instanceof ForbiddenError) { renderForbidden(res); return; }
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/sanction */
  postSanction(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const parsed = parseFormBody(sanctionForm, req.body);
      const values = toSanctionValues(parsed.ok ? parsed.data : parsed.submitted);
      const renderForm = (message: string, fieldErrors: Record<string, string>): void => {
        const page = eventService.getSanctionRequestPage(eventKey, req.user!.userId, { values, fieldErrors, message });
        if (page.branch === 'form') { res.status(422).render('events/sanction', page.page); return; }
        flashTo(req, res, manageHref(eventKey), 'already_held', page.text);
      };
      if (!parsed.ok) { renderForm(parsed.message, parsed.fieldErrors); return; }
      let result;
      try {
        result = eventService.submitSanctionRequest(req.user!.userId, eventKey, values);
      } catch (err) {
        if (err instanceof ValidationError) { renderForm(err.message, err.fieldErrors ?? {}); return; }
        throw err;
      }
      if (result.branch === 'already_held') { flashTo(req, res, manageHref(eventKey), 'already_held', result.text); return; }
      flashTo(req, res, manageHref(eventKey), result.branch === 'submitted' ? 'advance' : 'own_repeat',
        'Sanction request submitted. IFPA will review it and email you the decision.');
    } catch (err) {
      if (err instanceof ForbiddenError) { renderForbidden(res); return; }
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/close-registration */
  postCloseRegistration(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const parsed = parseFormBody(confirmForm, req.body);
      if (!parsed.ok) { renderInvalidRequest(res, { title: parsed.message }); return; }
      let result;
      try {
        result = eventService.closeRegistration(req.user!.userId, eventKey, parsed.data.confirmed === '1');
      } catch (err) {
        if (err instanceof ValidationError) { flashTo(req, res, manageHref(eventKey), 'refused', err.message); return; }
        throw err;
      }
      if (result.branch === 'needs_confirmation') {
        res.render('events/confirm', eventService.getConfirmPage({
          title: `Close Registration for ${result.eventTitle}`,
          caution: `Close registration for ${result.eventTitle}? Nobody can register after this, and it cannot be reopened. To pause registration instead, use Stop Taking Registrations.`,
          action: `${eventHref(eventKey)}/close-registration`,
          buttonLabel: 'Close Registration',
          cancelHref: manageHref(eventKey),
        }));
        return;
      }
      const endings: Record<typeof result.branch, [ActionEnding, string]> = {
        closed: ['advance', 'Registration is closed.'],
        own_repeat: ['own_repeat', 'Registration is closed.'],
        already_held: ['already_held', 'Registration for this event is already closed.'],
      };
      const [ending, text] = endings[result.branch];
      flashTo(req, res, manageHref(eventKey), ending, text);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/cancel */
  async postCancelEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const eventKey = eventKeyParam(req);
      const parsed = parseFormBody(reasonConfirmForm, req.body);
      if (!parsed.ok) { renderInvalidRequest(res, { title: parsed.message }); return; }
      const userId = req.user!.userId;
      const renderConfirm = async (status: number, err: unknown): Promise<void> => {
        const step = await eventService.cancelEvent(userId, eventKey, '', false);
        if (step.branch !== 'needs_confirmation') { flashTo(req, res, manageHref(eventKey), 'already_held', 'This event is already canceled.'); return; }
        const count = step.registrantCount;
        res.status(status).render('events/confirm', eventService.getConfirmPage({
          title: `Cancel ${step.eventTitle}`,
          caution: `Cancel ${step.eventTitle}? This notifies all ${count} registered participant${count === 1 ? '' : 's'} and cannot be undone.`
            + (step.hasPaid ? ' Canceling does not refund anyone by itself: refunds are arranged by the IFPA Treasurer outside the platform.' : ''),
          action: `${eventHref(eventKey)}/cancel`,
          buttonLabel: 'Cancel Event',
          cancelHref: manageHref(eventKey),
          reasonField: reasonField('Reason, sent to everyone registered', parsed.data.reason, err),
        }));
      };
      let result;
      try {
        result = await eventService.cancelEvent(userId, eventKey, parsed.data.reason, parsed.data.confirmed === '1');
      } catch (err) {
        if (err instanceof ValidationError && err.fieldErrors?.reason) { await renderConfirm(422, err); return; }
        if (err instanceof ValidationError) { flashTo(req, res, manageHref(eventKey), 'refused', err.message); return; }
        throw err;
      }
      if (result.branch === 'needs_confirmation') { await renderConfirm(200, null); return; }
      const endings: Record<typeof result.branch, [ActionEnding, string]> = {
        canceled: ['advance', `${result.eventTitle} is canceled. Everyone registered has been emailed.`],
        own_repeat: ['own_repeat', `${result.eventTitle} is canceled. Everyone registered has been emailed.`],
        already_held: ['already_held', 'This event is already canceled.'],
      };
      const [ending, text] = endings[result.branch];
      flashTo(req, res, manageHref(eventKey), ending, text);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/delete */
  postDeleteEvent(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const parsed = parseFormBody(reasonConfirmForm, req.body);
      if (!parsed.ok) { renderInvalidRequest(res, { title: parsed.message }); return; }
      const userId = req.user!.userId;
      const renderConfirm = (status: number, err: unknown): void => {
        const step = eventService.deleteEvent(userId, eventKey, '', false);
        if (step.branch !== 'needs_confirmation') { flashTo(req, res, profileHref(req), 'already_held', 'That event is already deleted.'); return; }
        res.status(status).render('events/confirm', eventService.getConfirmPage({
          title: `Delete ${step.eventTitle}`,
          caution: `Delete ${step.eventTitle}? This permanently removes the event and cannot be undone.`,
          action: `${eventHref(eventKey)}/delete`,
          buttonLabel: 'Delete Event',
          cancelHref: manageHref(eventKey),
          reasonField: reasonField('Reason, kept in the record of who deleted it', parsed.data.reason, err),
        }));
      };
      let result;
      try {
        result = eventService.deleteEvent(userId, eventKey, parsed.data.reason, parsed.data.confirmed === '1');
      } catch (err) {
        if (err instanceof ValidationError && err.fieldErrors?.reason) { renderConfirm(422, err); return; }
        if (err instanceof ValidationError) { flashTo(req, res, manageHref(eventKey), 'refused', err.message); return; }
        throw err;
      }
      if (result.branch === 'needs_confirmation') { renderConfirm(200, null); return; }
      flashTo(req, res, profileHref(req), result.branch === 'deleted' ? 'advance' : 'already_held', 'The event is deleted.');
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/registrations/:registrationId/cancel */
  async postCancelRegistration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const eventKey = eventKeyParam(req);
      const registrationId = typeof req.params.registrationId === 'string' ? req.params.registrationId : '';
      const parsed = parseFormBody(reasonConfirmForm, req.body);
      if (!parsed.ok) { renderInvalidRequest(res, { title: parsed.message }); return; }
      const userId = req.user!.userId;
      const back = participantsHref(eventKey);
      const renderConfirm = async (status: number, err: unknown): Promise<void> => {
        const step = await eventService.cancelRegistration(userId, eventKey, registrationId, '', false);
        if (step.branch !== 'needs_confirmation') { flashTo(req, res, back, 'already_held', 'That registration is already canceled.'); return; }
        res.status(status).render('events/confirm', eventService.getConfirmPage({
          title: `Cancel ${step.memberName}'s Registration`,
          caution: `Cancel ${step.memberName}'s registration for ${step.eventTitle}? They are emailed with your reason, and they leave the participant list, the exports and event email.`
            + (step.isPaid ? ' Any refund is arranged by the IFPA Treasurer outside the platform.' : ''),
          action: `${eventHref(eventKey)}/registrations/${encodeURIComponent(registrationId)}/cancel`,
          buttonLabel: 'Cancel Registration',
          cancelHref: back,
          reasonField: reasonField('Reason, sent to the member', parsed.data.reason, err),
        }));
      };
      let result;
      try {
        result = await eventService.cancelRegistration(userId, eventKey, registrationId, parsed.data.reason, parsed.data.confirmed === '1');
      } catch (err) {
        if (err instanceof ValidationError && err.fieldErrors?.reason) { await renderConfirm(422, err); return; }
        if (err instanceof ValidationError) { flashTo(req, res, back, 'refused', err.message); return; }
        throw err;
      }
      if (result.branch === 'needs_confirmation') { await renderConfirm(200, null); return; }
      const endings: Record<typeof result.branch, [ActionEnding, string]> = {
        canceled: ['advance', `${result.memberName}'s registration is canceled, and they have been emailed.`],
        own_repeat: ['own_repeat', `${result.memberName}'s registration is canceled, and they have been emailed.`],
        already_held: ['already_held', `${result.memberName}'s registration is already canceled.`],
      };
      const [ending, text] = endings[result.branch];
      flashTo(req, res, back, ending, text);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** GET /events/:eventKey/participants */
  getParticipants(req: Request, res: Response, next: NextFunction): void {
    try {
      const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
      const entryId = typeof req.query.entry === 'string' ? req.query.entry : undefined;
      res.render('events/participants', eventService.getParticipantsPage(
        eventKeyParam(req), req.user!.userId, sort, { notice: takeEventNotice(req, res), entryId },
      ));
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** GET /events/:eventKey/participants/add */
  getAddEntrant(req: Request, res: Response, next: NextFunction): void {
    const eventKey = eventKeyParam(req);
    try {
      res.render('events/participant-add', eventService.getAddEntrantPage(eventKey, req.user!.userId));
    } catch (err) {
      refuseToParticipants(req, res, next, eventKey, err);
    }
  },

  /** POST /events/:eventKey/participants/add */
  postAddEntrant(req: Request, res: Response, next: NextFunction): void {
    const eventKey = eventKeyParam(req);
    const userId = req.user!.userId;
    try {
      const parsed = parseFormBody(entryForm, req.body);
      const empty = toEntryInput(entryForm.parse({}));
      if (!parsed.ok) {
        res.status(422).render('events/participant-add', eventService.getAddEntrantPage(eventKey, userId, { input: empty, message: parsed.message }));
        return;
      }
      const input = toEntryInput(parsed.data);
      // A picker control draws the form again with everything typed, adding nobody.
      if (parsed.data.pick !== undefined) {
        const vm = eventService.getAddEntrantPage(eventKey, userId, { input, message: null }, {
          intent: parsePickIntent(parsed.data.pick), query: parsed.data.pick_q, ip: req.ip ?? 'unknown',
        });
        res.status(statusForPage(res, vm, 200)).render('events/participant-add', vm);
        return;
      }
      let result;
      try {
        result = eventService.addEntrant(userId, eventKey, input);
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
        res.status(422).render('events/participant-add', eventService.getAddEntrantPage(eventKey, userId, { input, message: err.message }));
        return;
      }
      if (result.branch === 'already_registered') {
        res.status(422).render('events/participant-add', eventService.getAddEntrantPage(eventKey, userId, {
          input,
          message: `${result.memberName} is already registered for this event. Edit their entry instead.`,
          link: { label: 'Edit Entry', href: result.editHref },
        }));
        return;
      }
      const to = entryNoticeHref(eventKey, result.registrationId);
      if (result.branch === 'already_held') {
        flashTo(req, res, to, 'already_held', `${result.memberName} is already registered for this event. Edit their entry instead.`);
        return;
      }
      flashTo(req, res, to, result.branch === 'added' ? 'advance' : 'own_repeat',
        `${result.memberName} added to ${result.divisionNames.join(', ')}.`);
    } catch (err) {
      refuseToParticipants(req, res, next, eventKey, err);
    }
  },

  /** GET /events/:eventKey/participants/:registrationId/edit */
  getEditEntry(req: Request, res: Response, next: NextFunction): void {
    const eventKey = eventKeyParam(req);
    try {
      res.render('events/participant-edit', eventService.getEditEntryPage(eventKey, req.user!.userId, registrationIdParam(req)));
    } catch (err) {
      refuseToParticipants(req, res, next, eventKey, err);
    }
  },

  /** POST /events/:eventKey/participants/:registrationId/edit */
  postEditEntry(req: Request, res: Response, next: NextFunction): void {
    const eventKey = eventKeyParam(req);
    const userId = req.user!.userId;
    const registrationId = registrationIdParam(req);
    try {
      const parsed = parseFormBody(entryForm, req.body);
      if (!parsed.ok) {
        res.status(422).render('events/participant-edit', eventService.getEditEntryPage(
          eventKey, userId, registrationId, { input: toEntryInput(entryForm.parse({})), message: parsed.message },
        ));
        return;
      }
      const input = toEntryInput(parsed.data);
      if (parsed.data.pick !== undefined) {
        const vm = eventService.getEditEntryPage(eventKey, userId, registrationId, { input, message: null }, {
          intent: parsePickIntent(parsed.data.pick), query: parsed.data.pick_q, ip: req.ip ?? 'unknown',
        });
        res.status(statusForPage(res, vm, 200)).render('events/participant-edit', vm);
        return;
      }
      let result;
      try {
        result = eventService.correctEntry(userId, eventKey, registrationId, input);
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
        res.status(422).render('events/participant-edit', eventService.getEditEntryPage(
          eventKey, userId, registrationId, { input, message: err.message },
        ));
        return;
      }
      const to = entryNoticeHref(eventKey, result.registrationId);
      if (result.branch === 'already_held') {
        flashTo(req, res, to, 'already_held', `${result.memberName}'s entry already reads that way, so nothing changed.`);
        return;
      }
      flashTo(req, res, to, result.branch === 'corrected' ? 'advance' : 'own_repeat',
        `${result.memberName}'s entry updated: ${result.whatChanged}.`);
    } catch (err) {
      refuseToParticipants(req, res, next, eventKey, err);
    }
  },

  /** GET /events/:eventKey/participants.csv */
  getParticipantsCsv(req: Request, res: Response, next: NextFunction): void {
    try {
      const out = eventService.getParticipantsCsv(eventKeyParam(req), req.user!.userId);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(out.body);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** GET /events/:eventKey/summary */
  getSummary(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('events/summary', eventService.getRegistrationSummaryPage(eventKeyParam(req), req.user!.userId));
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** GET /events/:eventKey/check-in-sheet */
  async getCheckInSheet(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
      const sheet = eventService.getCheckInSheet(eventKeyParam(req), req.user!.userId, sort);
      sendPdfDownload(res, { filename: sheet.filename, body: await renderPdf(sheet.document) });
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** GET /events/:eventKey/email */
  getEmail(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('events/email', eventService.getEmailParticipantsPage(
        eventKeyParam(req), req.user!.userId, { notice: takeEventNotice(req, res) },
      ));
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/email: preview, then send. */
  postEmail(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const userId = req.user!.userId;
      const parsed = parseFormBody(participantEmailForm, req.body);
      const typed = parsed.ok ? parsed.data : parsed.submitted;
      const values = { subject: typed.subject ?? '', bodyText: typed.body_text ?? '', sendToken: typed.send_token ?? '' };
      if (!parsed.ok) {
        res.status(422).render('events/email', eventService.getEmailParticipantsPage(eventKey, userId, { values, message: parsed.message }));
        return;
      }
      const previewOnly = parsed.data.step !== 'send';
      let result;
      try {
        result = eventService.emailParticipants(userId, eventKey, values, previewOnly);
      } catch (err) {
        if (err instanceof ValidationError) {
          res.status(422).render('events/email', eventService.getEmailParticipantsPage(eventKey, userId, {
            values, fieldErrors: err.fieldErrors ?? {}, message: err.message,
          }));
          return;
        }
        throw err;
      }
      if (result.branch === 'preview') {
        res.render('events/email', eventService.getEmailParticipantsPage(eventKey, userId, { values, preview: true }));
        return;
      }
      if (result.branch === 'no_recipients') {
        flashTo(req, res, `${eventHref(eventKey)}/email`, 'already_held', 'Nobody is confirmed for this event yet, so the email was not sent.');
        return;
      }
      flashTo(req, res, participantsHref(eventKey), result.branch === 'sent' ? 'advance' : 'own_repeat',
        `Email sent to ${result.recipients} participant${result.recipients === 1 ? '' : 's'}.`);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** GET /events/:eventKey/results */
  getResults(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('events/results', eventService.getResultsUploadPage(
        eventKeyParam(req), req.user!.userId, { notice: takeEventNotice(req, res) },
      ));
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** GET /events/:eventKey/results/template.csv */
  getResultsTemplate(req: Request, res: Response, next: NextFunction): void {
    try {
      const out = eventService.getResultsTemplate(eventKeyParam(req), req.user!.userId);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(out.body);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/results/preview: read the chosen file into a preview. */
  postResultsPreview(req: Request, res: Response, next: NextFunction): void {
    const eventKey = eventKeyParam(req);
    const userId = req.user!.userId;
    readMultipart(req, { limits: RESULTS_MULTIPART_LIMITS, fileFields: ['results_file'] }, (parsed) => {
      try {
        const file = parsed.files.results_file?.[0];
        if (parsed.limitExceeded || !file || file.buffer.length === 0) {
          res.status(422).render('events/results', eventService.getResultsUploadPage(eventKey, userId, {
            errorMessage: parsed.limitExceeded
              ? 'The file is too large. Split it, or remove anything that is not a result.'
              : 'Choose a results file to preview.',
          }));
          return;
        }
        const input: ResultsUploadInput = {
          text: file.buffer.toString('utf8'), filename: file.filename, ties: [], contested: [],
        };
        renderResultsStep(req, res, eventKey, input, false);
      } catch (err) {
        handleControllerError(err, res, next, 'events controller');
      }
    }, (err) => next(err));
  },

  /** POST /events/:eventKey/results: check the preview again, or publish it. */
  postResults(req: Request, res: Response, next: NextFunction): void {
    const eventKey = eventKeyParam(req);
    readMultipart(req, { limits: RESULTS_MULTIPART_LIMITS, fileFields: [] }, (parsed) => {
      try {
        const decisions = resultsDecisionsFromFields(parsed.fields);
        const input: ResultsUploadInput = {
          text: parsed.fields.results_text ?? '',
          filename: parsed.fields.filename ?? '',
          ties: decisions.ties,
          contested: decisions.contested,
        };
        renderResultsStep(req, res, eventKey, input, parsed.fields.step === 'commit');
      } catch (err) {
        handleControllerError(err, res, next, 'events controller');
      }
    }, (err) => next(err));
  },

  /** GET /events/:eventKey/attendance */
  getAttendance(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('events/attendance', eventService.getAttendancePage(
        eventKeyParam(req), req.user!.userId, { notice: takeEventNotice(req, res) },
      ));
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/attendance: from the attendance screen or the participant list. */
  postAttendance(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const to = `${eventHref(eventKey)}/attendance`;
      const parsed = parseFormBody(attendanceForm, req.body);
      if (!parsed.ok) { flashTo(req, res, to, 'refused', parsed.message); return; }
      let result;
      try {
        result = eventService.markAttended(req.user!.userId, eventKey, parsed.data.registration);
      } catch (err) {
        if (err instanceof ValidationError) { flashTo(req, res, to, 'refused', err.message); return; }
        throw err;
      }
      const text = result.branch === 'already_held'
        ? 'Everyone ticked was already marked attended.'
        : result.branch === 'own_repeat'
          ? 'Marked attended.'
          : `${result.marked} marked attended.`;
      const ending: ActionEnding = result.branch === 'marked' ? 'advance' : result.branch;
      flashTo(req, res, to, ending, text);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

  /** POST /events/:eventKey/registration-status */
  postRegistrationStatus(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = eventKeyParam(req);
      const parsed = parseFormBody(registrationStatusForm, req.body);
      if (!parsed.ok) { flashTo(req, res, manageHref(eventKey), 'refused', parsed.message); return; }
      try {
        const result = eventService.setRegistrationStatus(req.user!.userId, eventKey, parsed.data.set_to === 'open');
        const text = result.isOpen ? 'Online registration resumed.' : 'Online registration stopped.';
        const ending: ActionEnding = result.branch === 'changed' ? 'advance' : result.branch;
        flashTo(req, res, manageHref(eventKey), ending, text);
      } catch (err) {
        if (err instanceof ValidationError) { flashTo(req, res, manageHref(eventKey), 'refused', err.message); return; }
        throw err;
      }
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },
};
