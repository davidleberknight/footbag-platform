import { Request, Response, NextFunction } from 'express';
import { clubCleanupService } from '../services/clubCleanupService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';

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

    // The service owns the valid-action set and throws ValidationError for an
    // unknown action; the catch below maps that to the same 422 render, so the
    // controller does not duplicate the action list.
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

  async promote(req: Request, res: Response, next: NextFunction): Promise<void> {
    const candidateId = req.params.candidateId;
    const reasonText = typeof req.body.reasonText === 'string' && req.body.reasonText.trim()
      ? req.body.reasonText.trim()
      : null;

    try {
      await clubCleanupService.promoteCandidate(req.user!.userId, candidateId, reasonText);
      res.redirect(303, '/admin/club-cleanup');
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('errors/not-found', {
          seo:  { title: 'Invalid Request' },
          page: { sectionKey: 'admin', pageKey: 'error_422', title: 'Invalid Request' },
        });
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Page Not Found' },
          page: { sectionKey: 'admin', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
      next(err);
    }
  },

  delistResidue(req: Request, res: Response, next: NextFunction): void {
    const clubId = req.params.clubId;
    const reasonText = typeof req.body.reasonText === 'string' && req.body.reasonText.trim()
      ? req.body.reasonText.trim()
      : null;

    try {
      clubCleanupService.delistUnconfirmedResidue(req.user!.userId, clubId, reasonText);
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
