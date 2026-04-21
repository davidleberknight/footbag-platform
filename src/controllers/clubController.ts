import { Request, Response, NextFunction } from 'express';
import { clubService } from '../services/clubService';
import { handleControllerError } from '../lib/controllerErrors';

/**
 * Thin controller layer for the public Clubs routes.
 *
 * Responsibilities:
 *  - Parse route params
 *  - Call the appropriate ClubService method
 *  - Render the correct Handlebars template
 *  - Map service errors to HTTP status codes
 *
 * Business logic and page shaping live in ClubService, not here.
 */
export const clubController = {
  /**
   * GET /clubs
   * Clubs index: all countries with active clubs.
   */
  index(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = clubService.getPublicClubsIndexPage();
      res.render('clubs/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  /**
   * GET /clubs/:key
   * Service resolves key to club detail or country page.
   */
  byKey(req: Request, res: Response, next: NextFunction): void {
    try {
      const result = clubService.resolveByKey(req.params.key, req.isAuthenticated);
      res.render(result.template, result.vm);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

};
