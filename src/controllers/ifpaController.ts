import { Request, Response, NextFunction } from 'express';
import { ifpaService } from '../services/ifpaService';
import { NotFoundError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';

export const ifpaController = {
  /** GET /ifpa */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = ifpaService.getIfpaIndexPage({ isAuthenticated: req.isAuthenticated });
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
        res.status(404).render('errors/not-found', {
          seo: { title: 'Page Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      handleControllerError(err, res, next, 'ifpa controller');
    }
  },
};
