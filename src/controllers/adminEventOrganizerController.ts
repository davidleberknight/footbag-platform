import { Request, Response, NextFunction } from 'express';
import { adminEventOrganizerService } from '../services/adminEventOrganizerService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';

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
      res.render(
        'admin/event-organizers/detail',
        adminEventOrganizerService.getEventOrganizersPage(req.params.eventId ?? ''),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'admin event organizer controller');
    }
  },

  /** POST /admin/events/:eventId/organizers/assign */
  assign(req: Request, res: Response, next: NextFunction): void {
    const eventId = req.params.eventId ?? '';
    try {
      adminEventOrganizerService.assignOrganizer(
        req.user!.userId,
        eventId,
        String(req.body.member_key ?? ''),
        String(req.body.reason ?? ''),
      );
      res.redirect(303, `/admin/events/${eventId}/organizers`);
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
      adminEventOrganizerService.removeOrganizer(
        req.user!.userId,
        eventId,
        String(req.body.member_id ?? ''),
        String(req.body.reason ?? ''),
      );
      res.redirect(303, `/admin/events/${eventId}/organizers`);
    } catch (err) {
      if (err instanceof ValidationError || err instanceof NotFoundError) {
        renderDetailError(res, next, eventId, err);
        return;
      }
      handleControllerError(err, res, next, 'admin event organizer controller');
    }
  },
};
