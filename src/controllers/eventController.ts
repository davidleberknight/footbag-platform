import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  eventService, type EventFormValues, type RegistrationInput, type SanctionFormValues,
} from '../services/eventService';
import { ConflictError, ForbiddenError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import {
  handleControllerError, renderForbidden, renderInvalidRequest, renderNotFound, renderRateLimited,
} from '../lib/controllerErrors';
import { parseFormBody, formText, formOptionalText, formCheckbox, formList } from '../lib/parseFormBody';
import { FLASH_KIND, readFlash, clearFlash } from '../lib/flashCookie';
import { redirectWithOutcome, type ActionEnding } from '../lib/actionOutcome';
import { outcomeNotice, type OutcomeNoticeView } from '../lib/outcomeNotice';

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
  attendee_registration_open: formCheckbox('Accept Attendee/Supporter registrations', '0'),
  slug: formText('Event hashtag'),
  event_type: formText('Free or sanctioned'),
  competitor_fee: formText('Competitor fee'),
  spectator_fee: formText('Spectator fee'),
});

const divisionForm = z.object({
  division_id: formOptionalText('The division'),
  game_id: formText('Game'),
  custom_name: formText('Game name'),
  custom_discipline: formText('Discipline'),
  team_type: formText('Entry size'),
  gender: formText('Who may enter'),
  division_class: formText('Class'),
  offers_prize_money: formCheckbox('Offers prize money', '0'),
});

const organizerForm = z.object({ member_key: formText('Member id or profile URL') });
const removeOrganizerForm = z.object({
  member_id: formText('The organizer'),
  confirmed: formOptionalText('The confirmation'),
});
const confirmForm = z.object({ confirmed: formOptionalText('The confirmation') });

// The partner fields repeat once per doubles division, in the form's order, so
// the three partner lists line up entry for entry.
const registerForm = z.object({
  registration_type: formText('Registering as'),
  division: formList('Divisions'),
  amateur: formList('Enter as an Amateur'),
  partner_division: formList('Partner division'),
  partner_key: formList("Partner's member id or profile URL"),
  partner_name: formList("Partner's name"),
  tshirt_size: formText('T-shirt size'),
});

const registrationStatusForm = z.object({ set_to: formText('Online registration') });

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
    partners: d.partner_division.map((divisionId, i) => ({
      divisionId,
      key: d.partner_key[i] ?? '',
      name: d.partner_name[i] ?? '',
    })),
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
        { isMember, memberId: isMember ? req.user?.userId : undefined },
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

  /** POST /events/create */
  postCreate(req: Request, res: Response, next: NextFunction): void {
    try {
      const parsed = parseFormBody(eventForm, req.body);
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
        case 'own_repeat':
          flashTo(req, res, manageHref(result.eventKey), result.branch === 'created' ? 'advance' : 'own_repeat',
            result.branch === 'created' && !result.isOpen
              ? 'Event created as a draft. It is not public until its sanction is approved.'
              : 'Event created. It is open for registration and listed under Upcoming Events.');
          return;
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
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
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
        const text = result.branch === 'added' ? 'Division added.' : 'Division saved.';
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
          buttonLabel: 'Remove Division',
          cancelHref: manageHref(eventKey),
        }));
        return;
      }
      const endings: Record<typeof result.branch, [ActionEnding, string]> = {
        removed: ['advance', 'Division removed.'],
        own_repeat: ['own_repeat', 'Division removed.'],
        already_held: ['already_held', 'That division is no longer on this event.'],
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
      try {
        const result = eventService.addOrganizer(req.user!.userId, eventKey, parsed.data.member_key);
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
