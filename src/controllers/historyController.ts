import { Request, Response, NextFunction } from 'express';
import { historyService } from '../services/historyService';
import { NotFoundError } from '../services/serviceErrors';
import { logger } from '../config/logger';
import { renderNotFound } from '../lib/controllerErrors';

function redirectToLogin(req: Request, res: Response): void {
  res.redirect(302, `/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
}

export const historyController = {
  /** GET /history/:personId -- service decides: redirect, require auth, or render. */
  detail(req: Request, res: Response, next: NextFunction): void {
    try {
      const viewerMemberId = req.isAuthenticated ? req.user?.userId : undefined;
      const result = historyService.getHistoricalPlayerPage(
        req.params.personId,
        req.isAuthenticated,
        viewerMemberId,
      );
      switch (result.action) {
        case 'redirect':
          res.redirect(301, result.href);
          break;
        case 'requireAuth':
          redirectToLogin(req, res);
          break;
        case 'render':
          res.render('history/detail', result.vm);
          break;
      }
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      logger.error('history detail error', {
        personId: req.params.personId,
        error: err instanceof Error ? err.message : String(err),
      });
      next(err);
    }
  },
};
