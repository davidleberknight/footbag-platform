import { Request, Response, NextFunction } from 'express';
import { freestyleCurationService } from '../services/freestyleCurationService';

export const adminFreestyleController = {
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleCurationService.getBrowsePage({
        query:        typeof req.query.q === 'string' ? req.query.q : undefined,
        active:       typeof req.query.active === 'string' ? req.query.active : undefined,
        reviewStatus: typeof req.query.reviewStatus === 'string' ? req.query.reviewStatus : undefined,
      });
      res.render('admin/freestyle-tricks', vm);
    } catch (err) {
      next(err);
    }
  },

  // Read-only edit page for one trick: shows the editable scalar fields and the
  // attached aliases, sources, and modifier links. The save path is not built
  // yet, so the form is display-only (disabled controls, no POST route).
  edit(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleCurationService.getTrickEditPage(String(req.params.slug));
      if (!vm) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Not Found' },
          page: { sectionKey: 'admin', pageKey: 'error_404', title: 'Not Found' },
        });
        return;
      }
      res.render('admin/freestyle-trick-edit', vm);
    } catch (err) {
      next(err);
    }
  },
};
