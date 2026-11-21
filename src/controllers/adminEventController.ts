import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { adminEventService, detailsHiddenFields } from '../services/adminEventService';
import { eventService, emptyEventForm, type EventFormValues } from '../services/eventService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';
import { FLASH_KIND, readFlash, clearFlash } from '../lib/flashCookie';
import { redirectWithOutcome, type ActionEnding } from '../lib/actionOutcome';
import { outcomeNotice } from '../lib/outcomeNotice';
import { handleControllerError, renderInvalidRequest } from '../lib/controllerErrors';
import { parseFormBody, formText, formCheckbox, formOptionalText } from '../lib/parseFormBody';
import { parsePickIntent } from '../services/memberPicker';
import { entryForm, toEntryInput } from './eventController';

/**
 * Thin controller for the administrator's event record: the lookup, the
 * record, and each correction or cancellation as a preview and a confirm.
 * The writes are EventService's; the pages are AdminEventService's.
 */

const CONTEXT = 'admin event controller';

// The organizer's own field names, so one submission shape serves both forms.
const detailsForm = z.object({
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
  competitor_fee: formText('Competitor fee'),
  spectator_fee: formText('Spectator fee'),
  sanction_state: formText('IFPA sanction'),
  reason: formText('Reason'),
});

const divisionForm = z.object({
  team_type: formText('Singles or doubles'),
  gender: formText('Who may enter'),
  division_class: formText('Skill level'),
  offers_prize_money: formCheckbox('Offers prize money', '0'),
  reason: formText('Reason'),
});

const reasonForm = z.object({
  reason: formText('Reason'),
  confirmed: formOptionalText('The confirmation'),
});

const attendanceForm = z.object({
  attended: formText('Attended'),
  reason: formText('Reason'),
});

function param(req: Request, name: string): string {
  const v = req.params[name];
  return typeof v === 'string' ? v : '';
}

function recordHref(eventId: string): string {
  return `/admin/events/${encodeURIComponent(eventId)}`;
}

function readForm<S extends z.ZodType>(schema: S, req: Request): z.output<S> {
  const parsed = parseFormBody(schema, req.body);
  if (!parsed.ok) throw new ValidationError(parsed.message);
  return parsed.data;
}

function detailsValues(form: z.output<typeof detailsForm>): EventFormValues {
  return {
    ...emptyEventForm(),
    title: form.title,
    description: form.description,
    startDate: form.start_date,
    endDate: form.end_date,
    city: form.city,
    region: form.region,
    country: form.country,
    registrationDeadline: form.registration_deadline,
    tshirtSizeCollected: form.tshirt_size_collected === '1',
    attendeeRegistrationOpen: form.attendee_registration_open === '1',
    competitorFee: form.competitor_fee,
    spectatorFee: form.spectator_fee,
  };
}

function flashTo(req: Request, res: Response, eventId: string, ending: ActionEnding, text: string): void {
  redirectWithOutcome(req, res, { flash: FLASH_KIND.EVENT_RECORD_CORRECTED, to: recordHref(eventId), ending, text });
}

// A refused correction comes back on the record, carrying the message; an
// unknown event is the standard not-found.
function renderRefused(req: Request, res: Response, next: NextFunction, eventId: string, err: unknown, values?: EventFormValues): void {
  if (err instanceof NotFoundError) { handleControllerError(err, res, next, CONTEXT); return; }
  if (err instanceof ValidationError) {
    const fields = err.fieldErrors ? Object.values(err.fieldErrors).join(' ') : '';
    res.status(422).render('admin/events/record', adminEventService.getEventRecordPage(eventId, {
      errorMessage: fields ? `${err.message} ${fields}` : err.message,
      values,
    }));
    return;
  }
  handleControllerError(err, res, next, CONTEXT);
}

// The entry form's fields as the confirm page re-posts them, so the write
// confirms exactly what was previewed.
function entryHiddenFields(form: z.output<typeof entryForm>, withMember: boolean): Array<{ name: string; value: string }> {
  return [
    ...(withMember ? [{ name: 'member_id', value: form.member_id }] : []),
    ...form.division.map((value) => ({ name: 'division', value })),
    ...form.partner_division.flatMap((divisionId, i) => [
      { name: 'partner_division', value: divisionId },
      { name: 'partner', value: form.partner[i] ?? '' },
    ]),
    { name: 'paid_at_event', value: form.paid_at_event },
    { name: 'reason', value: form.reason },
  ];
}

// The administrator's entry form drawn again: after a picker step (200) or a
// refusal (422), carrying everything typed.
function renderEntryForm(
  req: Request, res: Response, eventId: string, registrationId: string | null,
  form: z.output<typeof entryForm>, status: number, message: string | null, link: { label: string; href: string } | null = null,
): void {
  const picker = status === 200 && form.pick !== undefined
    ? { intent: parsePickIntent(form.pick), query: form.pick_q, ip: req.ip ?? 'unknown' }
    : undefined;
  res.status(status).render('admin/events/entry', adminEventService.getEntryPage(
    req.user!.userId, eventId, registrationId, { input: toEntryInput(form), message, link, reason: form.reason }, picker,
  ));
}

const CORRECTED_TEXT ='The event is corrected. Every changed value is in its audit history, and its organizers have been emailed.';
const UNCHANGED_TEXT = 'That is what the event already held, so nothing changed.';

export const adminEventController = {
  /** GET /admin/events */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      res.render('admin/events/index', adminEventService.getEventLookupPage(q));
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** GET /admin/events/:eventId */
  record(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let notice = null;
      if (flash?.kind === FLASH_KIND.EVENT_RECORD_CORRECTED) {
        notice = outcomeNotice(flash.payload);
        clearFlash(res, req);
      }
      res.render('admin/events/record', adminEventService.getEventRecordPage(param(req, 'eventId'), { notice }));
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/events/:eventId/details, and /confirm */
  details(confirm: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const eventId = param(req, 'eventId');
      let values: EventFormValues | undefined;
      try {
        const form = readForm(detailsForm, req);
        values = detailsValues(form);
        const correction = eventService.correctEventDetails(
          req.user!.userId, eventId, values, form.sanction_state, form.reason, { preview: !confirm },
        );
        if (!confirm) {
          res.render('admin/events/confirm', adminEventService.correctionConfirmPage({
            eventId,
            title: 'Confirm: Correct the Event',
            correction,
            reason: form.reason,
            summary: 'Every value is held to the rules the organizers\' own form applies. The event\'s organizers are emailed what changed and your reason.',
            hiddenFields: detailsHiddenFields(values, form.sanction_state, form.reason),
            confirmAction: `${recordHref(eventId)}/details/confirm`,
            confirmLabel: 'Yes, Correct the Event',
          }));
          return;
        }
        flashTo(req, res, eventId, correction.outcome === 'corrected' ? 'advance' : 'already_held',
          correction.outcome === 'corrected' ? CORRECTED_TEXT : UNCHANGED_TEXT);
      } catch (err) {
        renderRefused(req, res, next, eventId, err, values);
      }
    };
  },

  /** POST /admin/events/:eventId/description/clear, and /confirm */
  clearDescription(confirm: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const eventId = param(req, 'eventId');
      try {
        const form = readForm(reasonForm, req);
        const correction = eventService.clearDescription(req.user!.userId, eventId, form.reason, { preview: !confirm });
        if (!confirm) {
          res.render('admin/events/confirm', adminEventService.correctionConfirmPage({
            eventId,
            title: 'Confirm: Clear the Event Description',
            correction,
            reason: form.reason,
            summary: 'The description is removed from the event page. Its organizers are emailed that it was cleared, with your reason, and can write a new one.',
            hiddenFields: [{ name: 'reason', value: form.reason }],
            confirmAction: `${recordHref(eventId)}/description/clear/confirm`,
            confirmLabel: 'Yes, Clear the Description',
          }));
          return;
        }
        flashTo(req, res, eventId, correction.outcome === 'corrected' ? 'advance' : 'already_held',
          correction.outcome === 'corrected'
            ? 'The description is cleared, and the event\'s organizers have been emailed.'
            : 'The event has no description, so nothing changed.');
      } catch (err) {
        renderRefused(req, res, next, eventId, err);
      }
    };
  },

  /** POST /admin/events/:eventId/registrations/:registrationId/attendance, and /confirm */
  correctAttendance(confirm: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const eventId = param(req, 'eventId');
      const registrationId = param(req, 'registrationId');
      try {
        const form = readForm(attendanceForm, req);
        const attended = form.attended === 'yes';
        const correction = eventService.correctAttendance(
          req.user!.userId, eventId, registrationId, attended, form.reason, { preview: !confirm },
        );
        if (!confirm && correction.outcome === 'preview') {
          res.render('admin/events/confirm', adminEventService.correctionConfirmPage({
            eventId,
            title: attended ? 'Confirm: Mark Attended' : 'Confirm: Remove the Attendance Mark',
            correction,
            reason: form.reason,
            summary: attended
              ? 'The registration is marked attended. A Tier 0 member is given or extended Active Player status for this event, and is emailed if it changes. The organizers are emailed with your reason.'
              : 'The attendance mark is removed. Any Active Player status the mark gave stays: correct it on the member\'s record if it should not stand. The organizers are emailed with your reason.',
            hiddenFields: [{ name: 'attended', value: form.attended }, { name: 'reason', value: form.reason }],
            confirmAction: `${recordHref(eventId)}/registrations/${encodeURIComponent(registrationId)}/attendance/confirm`,
            confirmLabel: attended ? 'Yes, Mark Attended' : 'Yes, Remove the Mark',
          }));
          return;
        }
        flashTo(req, res, eventId, correction.outcome === 'corrected' ? 'advance' : 'already_held',
          correction.outcome === 'corrected'
            ? 'The attendance is corrected, and the event\'s organizers have been emailed.'
            : 'The attendance already reads that way, so nothing changed.');
      } catch (err) {
        renderRefused(req, res, next, eventId, err);
      }
    };
  },

  /** GET /admin/events/:eventId/divisions/:divisionId */
  division(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/events/division', adminEventService.getDivisionPage(param(req, 'eventId'), param(req, 'divisionId')));
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/events/:eventId/divisions/:divisionId, and /confirm */
  correctDivision(confirm: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const eventId = param(req, 'eventId');
      const divisionId = param(req, 'divisionId');
      try {
        const form = readForm(divisionForm, req);
        const correction = eventService.correctDivision(req.user!.userId, eventId, {
          divisionId,
          gameId: '',
          customName: '',
          customDiscipline: '',
          teamType: form.team_type,
          gender: form.gender,
          divisionClass: form.division_class,
          offersPrizeMoney: form.offers_prize_money === '1',
        }, form.reason, { preview: !confirm });
        if (!confirm) {
          res.render('admin/events/confirm', adminEventService.correctionConfirmPage({
            eventId,
            title: 'Confirm: Correct the Competition',
            correction,
            reason: form.reason,
            summary: 'Every entry in the competition stays in it. The event\'s organizers are emailed what changed and your reason.',
            hiddenFields: [
              { name: 'team_type', value: form.team_type },
              { name: 'gender', value: form.gender },
              { name: 'division_class', value: form.division_class },
              { name: 'offers_prize_money', value: form.offers_prize_money },
              { name: 'reason', value: form.reason },
            ],
            confirmAction: `${recordHref(eventId)}/divisions/${encodeURIComponent(divisionId)}/confirm`,
            confirmLabel: 'Yes, Correct the Competition',
          }));
          return;
        }
        flashTo(req, res, eventId, correction.outcome === 'corrected' ? 'advance' : 'already_held',
          correction.outcome === 'corrected' ? CORRECTED_TEXT : UNCHANGED_TEXT);
      } catch (err) {
        renderRefused(req, res, next, eventId, err);
      }
    };
  },

  /** POST /admin/events/:eventId/divisions/:divisionId/remove, and /confirm */
  removeDivision(confirm: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const eventId = param(req, 'eventId');
      const divisionId = param(req, 'divisionId');
      try {
        const form = readForm(reasonForm, req);
        const correction = eventService.removeDivisionAsAdmin(req.user!.userId, eventId, divisionId, form.reason, { preview: !confirm });
        if (!confirm) {
          res.render('admin/events/confirm', adminEventService.correctionConfirmPage({
            eventId,
            title: 'Confirm: Remove the Competition',
            correction,
            reason: form.reason,
            summary: 'The competition and every entry in it are removed. A registration keeps its other entries. The event\'s organizers are emailed with your reason.',
            hiddenFields: [{ name: 'reason', value: form.reason }],
            confirmAction: `${recordHref(eventId)}/divisions/${encodeURIComponent(divisionId)}/remove/confirm`,
            confirmLabel: 'Yes, Remove the Competition',
          }));
          return;
        }
        flashTo(req, res, eventId, correction.outcome === 'corrected' ? 'advance' : 'already_held',
          correction.outcome === 'corrected'
            ? 'The competition is removed, and the event\'s organizers have been emailed.'
            : 'That competition is no longer on this event.');
      } catch (err) {
        renderRefused(req, res, next, eventId, err);
      }
    };
  },

  /** POST /admin/events/:eventId/cancel: the reason, then the confirm page, then the act. */
  async cancelEvent(req: Request, res: Response, next: NextFunction): Promise<void> {
    const eventId = param(req, 'eventId');
    try {
      const parsed = parseFormBody(reasonForm, req.body);
      if (!parsed.ok) { renderInvalidRequest(res, { title: parsed.message }); return; }
      const confirmed = parsed.data.confirmed === '1';
      const result = await eventService.adminCancelEvent(req.user!.userId, eventId, parsed.data.reason, confirmed);
      if (result.branch === 'needs_confirmation') {
        const count = result.registrantCount;
        res.render('admin/events/confirm', adminEventService.cancellationConfirmPage({
          eventId,
          title: `Confirm: Cancel ${result.eventTitle}`,
          caution: `Cancel ${result.eventTitle}? This notifies all ${count} registered participant${count === 1 ? '' : 's'} and its organizers, and cannot be undone.`
            + (result.hasPaid ? ' Canceling does not refund anyone by itself: refunds are arranged by the IFPA Treasurer outside the platform.' : ''),
          reason: parsed.data.reason,
          confirmAction: `${recordHref(eventId)}/cancel`,
          confirmLabel: 'Yes, Cancel the Event',
        }));
        return;
      }
      const endings: Record<typeof result.branch, [ActionEnding, string]> = {
        canceled: ['advance', `${result.eventTitle} is canceled, and everyone registered and its organizers have been emailed.`],
        own_repeat: ['own_repeat', `${result.eventTitle} is canceled, and everyone registered and its organizers have been emailed.`],
        already_held: ['already_held', 'This event is already canceled.'],
      };
      const [ending, text] = endings[result.branch];
      flashTo(req, res, eventId, ending, text);
    } catch (err) {
      renderRefused(req, res, next, eventId, err);
    }
  },

  /** GET /admin/events/:eventId/summary */
  summary(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/events/summary', adminEventService.getRegistrationSummaryPage(param(req, 'eventId')));
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** GET /admin/events/:eventId/registrations/add, and /:registrationId/edit */
  entryPage(kind: 'add' | 'edit') {
    return (req: Request, res: Response, next: NextFunction): void => {
      const eventId = param(req, 'eventId');
      try {
        res.render('admin/events/entry', adminEventService.getEntryPage(
          req.user!.userId, eventId, kind === 'add' ? null : param(req, 'registrationId'),
        ));
      } catch (err) {
        renderRefused(req, res, next, eventId, err);
      }
    };
  },

  /** POST /admin/events/:eventId/registrations/add, and /confirm */
  addEntrant(confirm: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const eventId = param(req, 'eventId');
      try {
        const form = readForm(entryForm, req);
        if (!confirm && form.pick !== undefined) { renderEntryForm(req, res, eventId, null, form, 200, null); return; }
        let result;
        try {
          result = eventService.adminAddEntrant(req.user!.userId, eventId, toEntryInput(form), form.reason, confirm);
        } catch (err) {
          if (!(err instanceof ValidationError)) throw err;
          renderEntryForm(req, res, eventId, null, form, 422, err.message);
          return;
        }
        if (result.branch === 'already_registered') {
          renderEntryForm(req, res, eventId, null, form, 422,
            `${result.memberName} is already registered for this event. Edit their entry instead.`,
            { label: 'Edit Entry', href: result.editHref });
          return;
        }
        if (result.branch === 'needs_confirmation') {
          res.render('admin/events/confirm', adminEventService.entryConfirmPage({
            eventId,
            title: `Confirm: Add ${result.memberName} to ${result.eventTitle}`,
            caution: `Add ${result.memberName} to ${result.eventTitle}? They are emailed.`,
            changes: result.changes,
            reason: form.reason,
            hiddenFields: entryHiddenFields(form, true),
            confirmAction: `${recordHref(eventId)}/registrations/add/confirm`,
            confirmLabel: 'Add Entrant',
          }));
          return;
        }
        if (result.branch === 'already_held') {
          flashTo(req, res, eventId, 'already_held', `${result.memberName} is already registered for this event. Edit their entry instead.`);
          return;
        }
        flashTo(req, res, eventId, result.branch === 'added' ? 'advance' : 'own_repeat',
          `${result.memberName} added to ${result.divisionNames.join(', ')}.`);
      } catch (err) {
        renderRefused(req, res, next, eventId, err);
      }
    };
  },

  /** POST /admin/events/:eventId/registrations/:registrationId/edit, and /confirm */
  correctEntry(confirm: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const eventId = param(req, 'eventId');
      const registrationId = param(req, 'registrationId');
      try {
        const form = readForm(entryForm, req);
        if (!confirm && form.pick !== undefined) { renderEntryForm(req, res, eventId, registrationId, form, 200, null); return; }
        let result;
        try {
          result = eventService.adminCorrectEntry(req.user!.userId, eventId, registrationId, toEntryInput(form), form.reason, confirm);
        } catch (err) {
          if (!(err instanceof ValidationError)) throw err;
          renderEntryForm(req, res, eventId, registrationId, form, 422, err.message);
          return;
        }
        if (result.branch === 'needs_confirmation') {
          res.render('admin/events/confirm', adminEventService.entryConfirmPage({
            eventId,
            title: `Confirm: Change ${result.memberName}'s Entry`,
            caution: `Change ${result.memberName}'s entry for ${result.eventTitle}? They are emailed with your reason.`,
            changes: result.changes,
            reason: form.reason,
            hiddenFields: entryHiddenFields(form, false),
            confirmAction: `${recordHref(eventId)}/registrations/${encodeURIComponent(registrationId)}/edit/confirm`,
            confirmLabel: 'Save Entry',
          }));
          return;
        }
        if (result.branch === 'already_held') {
          flashTo(req, res, eventId, 'already_held', `${result.memberName}'s entry already reads that way, so nothing changed.`);
          return;
        }
        flashTo(req, res, eventId, result.branch === 'corrected' ? 'advance' : 'own_repeat',
          `${result.memberName}'s entry updated: ${result.whatChanged}.`);
      } catch (err) {
        renderRefused(req, res, next, eventId, err);
      }
    };
  },

  /** POST /admin/events/:eventId/registrations/:registrationId/cancel */
  async cancelRegistration(req: Request, res: Response, next: NextFunction): Promise<void> {
    const eventId = param(req, 'eventId');
    const registrationId = param(req, 'registrationId');
    try {
      const parsed = parseFormBody(reasonForm, req.body);
      if (!parsed.ok) { renderInvalidRequest(res, { title: parsed.message }); return; }
      const confirmed = parsed.data.confirmed === '1';
      const result = await eventService.adminCancelRegistration(req.user!.userId, eventId, registrationId, parsed.data.reason, confirmed);
      if (result.branch === 'needs_confirmation') {
        res.render('admin/events/confirm', adminEventService.cancellationConfirmPage({
          eventId,
          title: `Confirm: Cancel ${result.memberName}'s Registration`,
          caution: `Cancel ${result.memberName}'s registration for ${result.eventTitle}? They are emailed with your reason.`
            + (result.isPaid ? ' Any refund is arranged by the IFPA Treasurer outside the platform.' : ''),
          reason: parsed.data.reason,
          confirmAction: `${recordHref(eventId)}/registrations/${encodeURIComponent(registrationId)}/cancel`,
          confirmLabel: 'Yes, Cancel the Registration',
        }));
        return;
      }
      const endings: Record<typeof result.branch, [ActionEnding, string]> = {
        canceled: ['advance', `${result.memberName}'s registration is canceled, and they have been emailed.`],
        own_repeat: ['own_repeat', `${result.memberName}'s registration is canceled, and they have been emailed.`],
        already_held: ['already_held', `${result.memberName}'s registration is already canceled.`],
      };
      const [ending, text] = endings[result.branch];
      flashTo(req, res, eventId, ending, text);
    } catch (err) {
      renderRefused(req, res, next, eventId, err);
    }
  },
};
