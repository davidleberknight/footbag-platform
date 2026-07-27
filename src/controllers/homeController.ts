import { Request, Response, NextFunction } from 'express';
import { homeService } from '../services/homeService';
import { handleControllerError } from '../lib/controllerErrors';
import { config } from '../config/env';

export const homeController = {
  home(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = homeService.getPublicHomePage(new Date().toISOString());
      res.render('public/home', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'home controller');
    }
  },

  // Login-gated hop to the archive landing page, the only archive URL the
  // platform ever emits. Used where the archive edge cannot share the
  // platform session cookie, so the platform's own login gate stands in for
  // the edge gate. A deployment without an archive has no target: fall
  // through to the standard 404.
  archiveRedirect(_req: Request, res: Response, next: NextFunction): void {
    if (!config.archiveUrl) {
      next();
      return;
    }
    res.redirect(302, config.archiveUrl);
  },
};
