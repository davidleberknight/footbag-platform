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

  // Placeholder for the not-yet-built edit surface: a read-only notice so the
  // browse page's per-row edit link resolves instead of returning a 404. No
  // form and no writes; the edit capability lands in a later slice.
  editPlaceholder(req: Request, res: Response, next: NextFunction): void {
    try {
      const found = freestyleCurationService.getEditPlaceholder(String(req.params.slug));
      if (!found) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Not Found' },
          page: { sectionKey: 'admin', pageKey: 'error_404', title: 'Not Found' },
        });
        return;
      }
      res.render('admin/freestyle-trick-edit-placeholder', {
        seo:  { title: 'Freestyle Content' },
        page: { sectionKey: 'admin', pageKey: 'admin_freestyle_edit_placeholder', title: found.displayName },
        content: found,
      });
    } catch (err) {
      next(err);
    }
  },
};
