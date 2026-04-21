import { Request, Response, NextFunction } from 'express';
import { netService } from '../services/netService';
import { NotFoundError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';

/**
 * Thin controller for public net routes.
 * Business logic and page shaping live in netService.
 */
export const netController = {
  /** GET /net */
  homePage(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getNetHomePage();
      res.render('net/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'net controller');
    }
  },

  /** GET /net/events */
  eventsPage(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getEventsPage();
      res.render('net/events', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'net controller');
    }
  },

  /** GET /net/events/:eventId */
  eventDetailPage(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getEventDetailPage(req.params['eventId'] ?? '');
      res.render('net/event-detail', vm);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Page Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      handleControllerError(err, res, next, 'net controller');
    }
  },

  /** GET /net/partnerships */
  partnershipsPage(req: Request, res: Response, next: NextFunction): void {
    try {
      const rawDivision = req.query['division'];
      const rawSearch   = req.query['q'];
      const division = typeof rawDivision === 'string' && rawDivision.trim()
        ? rawDivision.trim() : undefined;
      const search = typeof rawSearch === 'string' && rawSearch.trim().length >= 2
        ? rawSearch.trim() : undefined;
      const vm = netService.getPartnershipsPage(division, search);
      res.render('net/partnerships', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'net controller');
    }
  },

  /** GET /net/partnerships/:teamId */
  partnershipDetail(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getPartnershipDetailPage(req.params['teamId'] ?? '');
      res.render('net/partnership-detail', vm);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Page Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      handleControllerError(err, res, next, 'net controller');
    }
  },

  /** GET /net/teams */
  teams(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getTeamsPage();
      res.render('net/teams', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'net controller');
    }
  },

  /** GET /net/teams/:teamId */
  teamDetail(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = netService.getTeamDetailPage(req.params['teamId'] ?? '');
      res.render('net/team-detail', vm);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Page Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      handleControllerError(err, res, next, 'net controller');
    }
  },
};
