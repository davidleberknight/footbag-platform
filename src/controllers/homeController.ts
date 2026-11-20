import { Request, Response, NextFunction } from 'express';
import { homeService } from '../services/homeService';
import { handleControllerError } from '../lib/controllerErrors';
import { config } from '../config/env';
import { legacyRedirectTarget } from '../lib/legacyRedirects';

const FORUM_URL = 'https://modified.in/';

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
    res.redirect(303, config.archiveUrl);
  },

  // An old footbag.org address that outside pages still cite answers a
  // permanent redirect to the page carrying the same content. The target comes
  // from the fixed list, never from request input; an address the list does not
  // hold falls through to the standard 404.
  legacyRedirect(req: Request, res: Response, next: NextFunction): void {
    const target = legacyRedirectTarget(req.path);
    if (!target) {
      next();
      return;
    }
    res.redirect(301, target);
  },

  // The community forum is hosted off-site; /forum is the stable short link
  // to it. The target is a fixed constant, never derived from request input.
  forumRedirect(_req: Request, res: Response): void {
    res.redirect(303, FORUM_URL);
  },
};
