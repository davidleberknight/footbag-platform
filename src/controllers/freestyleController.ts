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
      // One template renders every trick detail page. The ux2Pilot flag in
      // content gates the legacy ordering branch inside the shell template.
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

  /** GET /freestyle/combo-analysis */
  comboAnalysis(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getComboAnalysisPage();
      res.render('freestyle/combo-analysis', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /**
   * GET /freestyle/tricks
   *
   * Renders the dictionary landing surface (CR-1 of
   * dictionary-coherence-2026-05-18) when no ?view= and no ?family=
   * parameter is supplied. Otherwise renders the browse-view chain
   * (preserves all existing bookmarks + external links to ?view=add,
   * ?view=family, ?view=movement-system, etc).
   */
  tricksIndex(req: Request, res: Response, next: NextFunction): void {
    try {
      const family = typeof req.query['family'] === 'string' ? req.query['family'] : undefined;
      const view   = typeof req.query['view']   === 'string' ? req.query['view']   : undefined;
      // /freestyle/tricks opens directly on the By ADD ladder (the service
      // defaults view to 'add'); there is no separate browse-mode gate.
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

  /**
   * GET /freestyle/sets/reference — flat Holden set-notation reference table
   * (formerly /freestyle/sets, formerly /freestyle/moves). Phase B of the
   * set-system refactor moved this content out of /freestyle/sets so the Set
   * Hub can claim the canonical /freestyle/sets/<slug> namespace.
   */
  moves(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getMovesPage();
      res.render('freestyle/moves', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /**
   * GET /freestyle/sets/:slug — Set detail page (Phase B of the set-system
   * refactor, 2026-05-25). Anti-enumeration: unknown slug → 404.
   */
  setDetail(req: Request, res: Response, next: NextFunction): void {
    try {
      const rawSlug = typeof req.params['slug'] === 'string' ? req.params['slug'] : '';
      const vm = freestyleService.getCanonicalSetDetailPage(rawSlug);
      if (!vm) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Page Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      res.render('freestyle/set-detail', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/compositional-sets — systematic dictionary-hub exploration */
  compositionalSets(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getCompositionalSetsPage();
      res.render('freestyle/compositional-sets', vm);
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

  /** GET /freestyle/operators — standalone modifier vocabulary reference. */
  operators(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getOperatorsPage();
      res.render('freestyle/operators', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/observational — observational-layer trick entries. */
  observational(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getObservationalLayerPage();
      res.render('freestyle/observational', vm);
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
