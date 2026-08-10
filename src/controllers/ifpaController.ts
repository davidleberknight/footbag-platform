import { Request, Response, NextFunction } from 'express';
import { ifpaService } from '../services/ifpaService';
import { NotFoundError } from '../services/serviceErrors';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';

export const ifpaController = {
  /** GET /ifpa */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      // Member enhancement keys off membership, not bare authentication: a
      // pending registrant reads this page as an anonymous visitor.
      const vm = ifpaService.getIfpaIndexPage({ isAuthenticated: req.isMember });
      res.render('ifpa/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'ifpa controller');
    }
  },

  /** GET /ifpa/:docSlug */
  detail(req: Request, res: Response, next: NextFunction): void {
    try {
      const docSlug = req.params['docSlug'] ?? '';
      const vm = ifpaService.getIfpaDocPage(docSlug);
      res.render('ifpa/detail', vm);
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      handleControllerError(err, res, next, 'ifpa controller');
    }
  },
};
