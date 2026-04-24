import { Request, Response, NextFunction } from 'express';
import { homeService } from '../services/homeService';
import { handleControllerError } from '../lib/controllerErrors';

export const homeController = {
  /**
   * GET /
   * Public home landing page.
   */
  home(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = homeService.getPublicHomePage(new Date().toISOString());
      res.render('public/home', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'home controller');
    }
  },
};
