import { Request, Response, NextFunction } from 'express';
import { freestyleService } from '../services/freestyleService';
import { handleControllerError } from '../lib/controllerErrors';
import { NotFoundError } from '../services/serviceErrors';

/**
 * Thin controller for public freestyle routes.
 * Business logic and page shaping live in freestyleService.
 */
export const freestyleController = {
  /** GET /freestyle */
  landing(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getLandingPage();
      res.render('freestyle/landing', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/records */
  records(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getRecordsPage();
      res.render('freestyle/records', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/leaders */
  leaders(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getLeadersPage();
      res.render('freestyle/leaders', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/tricks/:slug */
  trick(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getTrickDetailPage(req.params['slug'] ?? '');
      res.render('freestyle/trick', vm);
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Page Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/competition */
  competition(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getFreestyleCompetitionPage();
      res.render('freestyle/competition', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/partnerships */
  partnerships(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getFreestylePartnershipsPage();
      res.render('freestyle/partnerships', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/history */
  history(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getFreestyleHistoryPage();
      res.render('freestyle/history', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/tricks */
  tricksIndex(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getFreestyleTricksIndexPage();
      res.render('freestyle/tricks', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/insights */
  insights(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getFreestyleInsightsPage();
      res.render('freestyle/insights', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/about */
  about(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getAboutPage();
      res.render('freestyle/about', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/moves */
  moves(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getMovesPage();
      res.render('freestyle/moves', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

};
