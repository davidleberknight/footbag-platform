import { Request, Response, NextFunction } from 'express';
import { eventService } from '../services/eventService';
import { handleControllerError } from '../lib/controllerErrors';

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
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Page Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
        });
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
      const vm = eventService.getPublicEventPage(eventKey);
      res.render('events/detail', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'events controller');
    }
  },

};
