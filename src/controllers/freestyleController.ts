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

  /** GET /freestyle/search — server-rendered trick search results (works without JS). */
  search(req: Request, res: Response, next: NextFunction): void {
    try {
      const q = typeof req.query['q'] === 'string' ? req.query['q'] : '';
      const vm = freestyleService.getFreestyleTrickSearchPage(q);
      res.render('freestyle/search', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /** GET /freestyle/search/suggest?q= — JSON typeahead for the trick search box. */
  searchSuggest(req: Request, res: Response, next: NextFunction): void {
    try {
      const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';
      if (q.length === 0 || q.length > 100) {
        res.json([]);
        return;
      }
      res.json(freestyleService.searchTricks(q, 10));
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
      const slug = req.params['slug'] ?? '';
      const redirectTo = freestyleService.trickRouteRedirectTarget(slug);
      if (redirectTo) {
        res.redirect(301, redirectTo);
        return;
      }
      const vm = freestyleService.getTrickDetailPage(slug);
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
   * Renders the dictionary landing surface when no ?view= and no ?family=
   * parameter is supplied. Otherwise renders the browse-view chain
   * (preserves all existing bookmarks + external links to ?view=add,
   * ?view=family, ?view=movement-system, etc).
   */
  tricksIndex(req: Request, res: Response, next: NextFunction): void {
    try {
      const family = typeof req.query['family'] === 'string' ? req.query['family'] : undefined;
      const view   = typeof req.query['view']   === 'string' ? req.query['view']   : undefined;
      // Legacy/guessed alias: /freestyle/tricks?view=emerging redirects
      // to the dedicated Emerging Vocabulary surface. Without the
      // redirect, the unknown view falls through to the default 'add'
      // view silently, producing a confusing "this looked like a new
      // surface but rendered the same content" UX.
      if (view === 'emerging') {
        res.redirect(302, '/freestyle/observational');
        return;
      }
      // /freestyle/tricks opens directly on the By ADD ladder (the service
      // defaults view to 'add'); there is no separate browse-mode gate.
      // ?sort=alpha switches the ADD view's within-tier arrangement to flat A-Z
      // for lookup; anything else (the default) is the nearest-anchor By-family.
      const addSort = req.query['sort'] === 'alpha' ? 'alpha' : 'family';
      const vm = freestyleService.getFreestyleTricksIndexPage(family, view, addSort);
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

  /** GET /freestyle/notation-article */
  notationArticle(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getJobsNotationArticlePage();
      res.render('freestyle/jobs-notation-article', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /**
   * GET /freestyle/sets/reference — flat Holden set-notation reference
   * table. Lives under /sets/reference so the Set Encyclopedia can hold
   * the canonical /freestyle/sets/<slug> namespace.
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
   * GET /freestyle/sets — Set Encyclopedia. Standalone
   * minimalist index of canonical sets as first-class ontology objects.
   * Distinct from the dictionary's /freestyle/tricks?view=sets surface
   * and from the /freestyle/compositional-sets exploration hub.
   */
  setsEncyclopedia(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getSetsEncyclopediaPage();
      res.render('freestyle/sets-encyclopedia', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'freestyle controller');
    }
  },

  /**
   * GET /freestyle/sets/:slug — Set detail page. Anti-enumeration:
   * unknown slug → 404.
   */
  setDetail(req: Request, res: Response, next: NextFunction): void {
    try {
      const rawSlug = typeof req.params['slug'] === 'string' ? req.params['slug'] : '';
      const redirectTo = freestyleService.setRouteRedirectTarget(rawSlug);
      if (redirectTo) {
        res.redirect(301, redirectTo);
        return;
      }
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

  /** GET /freestyle/modifier/:slug — teaching page when authored, else a
   *  data-driven stub; unknown modifiers 404. */
  modifierFamily(req: Request, res: Response, next: NextFunction): void {
    try {
      const rawSlug = req.params['slug'] ?? '';
      const redirectTo = freestyleService.modifierRouteRedirectTarget(rawSlug);
      if (redirectTo) {
        res.redirect(301, redirectTo);
        return;
      }
      const detail = freestyleService.getModifierDetail(rawSlug);
      res.render(
        detail.kind === 'teaching' ? 'freestyle/modifier-family' : 'freestyle/modifier-stub',
        detail.vm,
      );
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
