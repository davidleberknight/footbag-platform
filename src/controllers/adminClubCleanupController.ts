import { Request, Response, NextFunction } from 'express';
import { clubCleanupService } from '../services/clubCleanupService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';

// An action that changed nothing has to say so. A resolve whose guarded write
// matched no row means another admin acted first, and redirecting the same way
// as a successful one tells the admin their decision landed when it did not.
function takeActionNotice(req: Request, res: Response): string | null {
  const flash = readFlash(req);
  if (flash?.kind !== FLASH_KIND.CLUB_ACTION) return null;
  clearFlash(res, req);
  return flash.payload ?? null;
}

export const adminClubCleanupController = {
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = clubCleanupService.getCleanupQueuePage({
        category: typeof req.query.category === 'string' ? req.query.category : undefined,
        region: typeof req.query.region === 'string' ? req.query.region : undefined,
        sort: typeof req.query.sort === 'string' ? req.query.sort : undefined,
        actionNotice: takeActionNotice(req, res),
      });
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

    // The service owns the valid action and predicate sets and throws
    // ValidationError for an unknown one; the catch below maps that to the same
    // 422 render, so the controller does not duplicate either list. A club id
    // that names nothing is a NotFoundError and renders 404.
    try {
      clubCleanupService.resolveClub(
        req.user!.userId, clubId, predicate,
        action as 'demote_inactive' | 'archive' | 'dismiss' | 'park',
        reasonText,
      );
      res.redirect(303, '/admin/club-cleanup');
    } catch (err) {
      if (err instanceof NotFoundError) {
        res.status(404).render('errors/not-found', {
          seo:  { title: 'Page Not Found' },
          page: { sectionKey: 'admin', pageKey: 'error_404', title: 'Page Not Found' },
        });
        return;
      }
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

  contactMembers(req: Request, res: Response, next: NextFunction): void {
    const clubId = req.params.clubId;
    try {
      clubCleanupService.contactMembersToVolunteer(req.user!.userId, clubId);
      res.redirect(303, '/admin/club-cleanup');
    } catch (err) {
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

  claim(req: Request, res: Response, next: NextFunction): void {
    const itemType = String(req.body.itemType ?? '');
    const itemId = String(req.body.itemId ?? '');

    try {
      clubCleanupService.claimItem(
        req.user!.userId,
        itemType as 'club' | 'candidate',
        itemId,
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

  resolveCandidate(req: Request, res: Response, next: NextFunction): void {
    const candidateId = req.params.candidateId;
    const action = String(req.body.action ?? '');
    const predicate = typeof req.body.predicate === 'string' && req.body.predicate
      ? req.body.predicate
      : undefined;
    const reasonText = typeof req.body.reasonText === 'string' && req.body.reasonText.trim()
      ? req.body.reasonText.trim()
      : null;

    // The service owns the valid-action set and throws ValidationError for an
    // unknown action; the catch below maps that to the same 422 render, so the
    // controller does not duplicate the action list.
    try {
      const result = clubCleanupService.resolveCandidate(
        req.user!.userId, candidateId,
        action as 'park' | 'dismiss' | 'demote' | 'archive' | 'confirm_junk' | 'promote_dormant',
        reasonText,
        predicate,
      );
      if (result.status === 'noop') {
        writeFlash(
          res, req, FLASH_KIND.CLUB_ACTION,
          'Nothing changed: another administrator resolved this item first.',
        );
      }
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

  bulkResolve(req: Request, res: Response, next: NextFunction): void {
    const group = String(req.body.group ?? '');
    const action = String(req.body.action ?? '');
    const reasonText = typeof req.body.reasonText === 'string' && req.body.reasonText.trim()
      ? req.body.reasonText.trim()
      : null;

    // The service owns the valid group and action sets and throws
    // ValidationError for unknown values; the catch below maps that to the
    // same 422 render.
    try {
      clubCleanupService.bulkParkGroup(req.user!.userId, group, action, reasonText);
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
