import { Request, Response, NextFunction } from 'express';
import { eventService } from '../services/EventService';
import { NotFoundError, ValidationError, ServiceUnavailableError } from '../services/serviceErrors';
import { logger } from '../config/logger';

/**
 * Thin controller layer for the public Events + Results routes.
 *
 * Responsibilities:
 *  - Parse route params
 *  - Call the appropriate EventService method
 *  - Render the correct Handlebars template
 *  - Map service errors to HTTP status codes
 *
 * Business logic and page shaping live in EventService, not here.
 */
export const eventsController = {
  /**
   * GET /events
   * Events landing page: upcoming events + archive year links.
   */
  landing(_req: Request, res: Response, next: NextFunction): void {
    try {
      const pageModel = eventService.getPublicEventsLandingPage(new Date().toISOString());
      res.render('events/index', { pageTitle: 'Events', ...pageModel });
    } catch (err) {
      eventsController._handleError(err, res, next);
    }
  },

  /**
   * GET /events/year/:year
   * Full-year archive page — all completed events for a given year.
   */
  year(req: Request, res: Response, next: NextFunction): void {
    try {
      const rawYear = req.params.year;
      const year = parseInt(rawYear, 10);

      // Non-integer year params are treated as 404 (do not expose param detail)
      if (isNaN(year)) {
        res.status(404).render('errors/not-found', { pageTitle: 'Page Not Found' });
        return;
      }

      const pageModel = eventService.getPublicEventsYearPage(year);
      res.render('events/year', { pageTitle: `${year} Events`, ...pageModel });
    } catch (err) {
      eventsController._handleError(err, res, next);
    }
  },

  /**
   * GET /events/:eventKey
   * Canonical single-event page. eventKey format: event_{year}_{slug}
   */
  event(req: Request, res: Response, next: NextFunction): void {
    try {
      const eventKey = req.params.eventKey;
      const pageModel = eventService.getPublicEventPage(eventKey);
      res.render('events/detail', { pageTitle: pageModel.event.title, ...pageModel });
    } catch (err) {
      eventsController._handleError(err, res, next);
    }
  },

  /**
   * Maps service errors to HTTP responses.
   * NotFoundError and ValidationError both render 404 — validation detail
   * must not be exposed to public visitors.
   */
  _handleError(err: unknown, res: Response, next: NextFunction): void {
    if (err instanceof NotFoundError || err instanceof ValidationError) {
      res.status(404).render('errors/not-found', { pageTitle: 'Page Not Found' });
      return;
    }
    if (err instanceof ServiceUnavailableError) {
      res.status(503).render('errors/unavailable', { pageTitle: 'Service Unavailable' });
      return;
    }
    logger.error('unexpected error in events controller', {
      error: err instanceof Error ? err.message : String(err),
    });
    next(err);
  },
};
