import { Request, Response, NextFunction } from 'express';
import { adminEventOrganizerService } from '../services/adminEventOrganizerService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';
import { FLASH_KIND, readFlash, clearFlash } from '../lib/flashCookie';
import { outcomeNotice, type OutcomeNoticeView } from '../lib/outcomeNotice';
import { redirectWithOutcome } from '../lib/actionOutcome';
import { z } from 'zod';
import { parseFormBody, formText } from '../lib/parseFormBody';

const assignForm = z.object({ member_key: formText('Member'), reason: formText('Reason') });
const removeForm = z.object({ member_id: formText('Organizer'), reason: formText('Reason') });

// A shape the form never sends is refused like any other fixable submission.
function read<S extends z.ZodType>(schema: S, req: Request): z.output<S> {
  const parsed = parseFormBody(schema, req.body);
  if (!parsed.ok) throw new ValidationError(parsed.message);
  return parsed.data;
}

// A failed write is answered on the event's own page, which means loading the
// event again. When the event is the thing that does not exist, that reload
// throws the same not-found from inside the catch block, where nothing handles
// it and the administrator gets a 500 instead of the 404 the GET on the same id
// answers. An event that cannot be loaded has no page to carry the error.
function renderDetailError(
  res: Response,
  next: NextFunction,
  eventId: string,
  err: ValidationError | NotFoundError,
): void {
  const status = err instanceof NotFoundError ? 404 : 422;
  let page;
  try {
    page = adminEventOrganizerService.getEventOrganizersPage(eventId, { errorMessage: err.message });
  } catch (reloadErr) {
    if (reloadErr instanceof NotFoundError) { renderNotFound(res); return; }
    handleControllerError(reloadErr, res, next, 'admin event organizer controller');
    return;
  }
  res.status(status).render('admin/event-organizers/detail', page);
}

export const adminEventOrganizerController = {
  /** GET /admin/events/organizers */
  queue(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/event-organizers/queue', adminEventOrganizerService.getOrganizerQueuePage());
    } catch (err) {
      handleControllerError(err, res, next, 'admin event organizer controller');
    }
  },

  /** GET /admin/events/:eventId/organizers */
  detail(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let notice: OutcomeNoticeView | null = null;
      if (flash?.kind === FLASH_KIND.EVENT_ORGANIZER_OUTCOME) {
        notice = outcomeNotice(flash.payload);
        clearFlash(res, req);
      }
      res.render(
        'admin/event-organizers/detail',
        adminEventOrganizerService.getEventOrganizersPage(req.params.eventId ?? '', { notice }),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'admin event organizer controller');
    }
  },

  /** POST /admin/events/:eventId/organizers/assign */
  assign(req: Request, res: Response, next: NextFunction): void {
    const eventId = req.params.eventId ?? '';
    try {
      const form = read(assignForm, req);
      const outcome = adminEventOrganizerService.assignOrganizer(
        req.user!.userId,
        eventId,
        form.member_key,
        form.reason,
      );
      redirectWithOutcome(req, res, {
        flash: FLASH_KIND.EVENT_ORGANIZER_OUTCOME,
        to: `/admin/events/${eventId}/organizers`,
        ending: outcome.ending,
        text: outcome.text,
      });
    } catch (err) {
      if (err instanceof ValidationError || err instanceof NotFoundError) {
        renderDetailError(res, next, eventId, err);
        return;
      }
      handleControllerError(err, res, next, 'admin event organizer controller');
    }
  },

  /** POST /admin/events/:eventId/organizers/remove */
  remove(req: Request, res: Response, next: NextFunction): void {
    const eventId = req.params.eventId ?? '';
    try {
      const form = read(removeForm, req);
      const outcome = adminEventOrganizerService.removeOrganizer(
        req.user!.userId,
        eventId,
        form.member_id,
        form.reason,
      );
      redirectWithOutcome(req, res, {
        flash: FLASH_KIND.EVENT_ORGANIZER_OUTCOME,
        to: `/admin/events/${eventId}/organizers`,
        ending: outcome.ending,
        text: outcome.text,
      });
    } catch (err) {
      if (err instanceof ValidationError || err instanceof NotFoundError) {
        renderDetailError(res, next, eventId, err);
        return;
      }
      handleControllerError(err, res, next, 'admin event organizer controller');
    }
  },
};
