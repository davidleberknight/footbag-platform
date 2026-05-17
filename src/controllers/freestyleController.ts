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
      // UX3b0 universal shell (2026-05-11): one template renders every trick;
      // pilot/legacy ordering branch lives inside the shell via content.ux2Pilot.
      res.render('freestyle/trick-shell', vm);
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

  /** GET /freestyle/add-analysis */
  addAnalysis(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getAddAnalysisPage();
      res.render('freestyle/add-analysis', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/tricks */
  tricksIndex(req: Request, res: Response, next: NextFunction): void {
    try {
      const family = typeof req.query['family'] === 'string' ? req.query['family'] : undefined;
      const view   = typeof req.query['view']   === 'string' ? req.query['view']   : undefined;
      const vm = freestyleService.getFreestyleTricksIndexPage(family, view);
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

  /** GET /freestyle/sets — set-notation reference (formerly /freestyle/moves) */
  moves(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getMovesPage();
      res.render('freestyle/moves', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/glossary */
  glossary(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getGlossaryPage();
      res.render('freestyle/glossary', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/progression/walking-family — observational symbolic-grammar layer */
  walkingProgression(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getWalkingFamilyProgressionPage();
      res.render('freestyle/walking-progression', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/learn — observational symbolic-grammar layer index */
  symbolicLearn(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getSymbolicLearnPage();
      res.render('freestyle/learn', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/modifier/:slug — observational symbolic-grammar layer */
  modifierFamily(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getModifierFamilyPage(req.params['slug'] ?? '');
      res.render('freestyle/modifier-family', vm);
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

};
