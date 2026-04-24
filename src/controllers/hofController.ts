import { Request, Response, NextFunction } from 'express';
import { hofService } from '../services/hofService';
import { handleControllerError } from '../lib/controllerErrors';

export const hofController = {
  /**
   * GET /hof
   * Hall of Fame landing page, static/editorial content, no DB queries.
   */
  index(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = hofService.getHofLandingPage();
      res.render('public/hof', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'hof controller');
    }
  },
};
