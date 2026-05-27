import { Request, Response, NextFunction } from 'express';
import { clubCleanupService } from '../services/clubCleanupService';
import { ValidationError } from '../services/serviceErrors';

const VALID_ACTIONS = new Set([
  'demote_inactive', 'archive', 'dismiss',
  'defer_30', 'defer_90', 'defer_180',
]);

export const adminClubCleanupController = {
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = clubCleanupService.getCleanupQueuePage();
      res.render('admin/club-cleanup', vm);
    } catch (err) {
      next(err);
    }
  },

  resolve(req: Request, res: Response, next: NextFunction): void {
    const clubId = req.params.clubId;
    const action = String(req.body.action ?? '');
    const predicate = String(req.body.predicate ?? 'crowdsource_viability');
    const reasonText = typeof req.body.reasonText === 'string' && req.body.reasonText.trim()
      ? req.body.reasonText.trim()
      : null;

    if (!VALID_ACTIONS.has(action)) {
      res.status(422).render('errors/not-found', {
        seo:  { title: 'Invalid Request' },
        page: { sectionKey: 'admin', pageKey: 'error_422', title: 'Invalid Request' },
      });
      return;
    }

    try {
      clubCleanupService.resolveClub(
        req.user!.userId, clubId, predicate,
        action as 'demote_inactive' | 'archive' | 'dismiss' | 'defer_30' | 'defer_90' | 'defer_180',
        reasonText,
      );
      res.redirect(303, '/admin/club-cleanup');
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('errors/not-found', {
          seo:  { title: 'Invalid Request' },
          page: { sectionKey: 'admin', pageKey: 'error_422', title: 'Invalid Request' },
        });
        return;
      }
      next(err);
    }
  },
};
