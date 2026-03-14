import { Request, Response, NextFunction } from 'express';
import { eventService } from '../services/EventService';
import { ServiceUnavailableError } from '../services/serviceErrors';
import { logger } from '../config/logger';

const FEATURED_EVENTS_LIMIT = 3;

export const publicController = {
  /**
   * GET /
   * Public home landing page with featured upcoming events.
   */
  home(_req: Request, res: Response, next: NextFunction): void {
    try {
      const nowIso = new Date().toISOString();
      const featuredUpcomingEvents = eventService
        .listPublicUpcomingEvents(nowIso)
        .slice(0, FEATURED_EVENTS_LIMIT);
      res.render('public/home', { pageTitle: 'IFPA Footbag', featuredUpcomingEvents });
    } catch (err) {
      if (err instanceof ServiceUnavailableError) {
        res.status(503).render('errors/unavailable', { pageTitle: 'Service Unavailable' });
        return;
      }
      logger.error('unexpected error in public controller (home)', {
        error: err instanceof Error ? err.message : String(err),
      });
      next(err);
    }
  },

  /**
   * GET /clubs
   * Clubs landing placeholder — no data required.
   */
  clubs(_req: Request, res: Response): void {
    res.render('public/clubs', { pageTitle: 'Clubs' });
  },
};
