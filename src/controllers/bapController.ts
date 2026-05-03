import { Request, Response, NextFunction } from 'express';
import { bapService } from '../services/bapService';
import { handleControllerError } from '../lib/controllerErrors';

export const bapController = {
  /**
   * GET /bap
   * Big Add Posse landing page, static/editorial content, no DB queries.
   */
  index(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = bapService.getBapLandingPage();
      res.render('public/bap', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'bap controller');
    }
  },
};
