import { Request, Response, NextFunction } from 'express';
import { recordsService } from '../services/recordsService';
import { ServiceUnavailableError } from '../services/serviceErrors';
import { logger } from '../config/logger';

/**
 * Thin controller for public records routes.
 * Business logic and page shaping live in recordsService.
 */
export const recordsController = {
  /** GET /records */
  records(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = recordsService.getRecordsPage();
      res.render('records/records', vm);
    } catch (err) {
      recordsController._handleError(err, res, next);
    }
  },

  _handleError(err: unknown, res: Response, next: NextFunction): void {
    if (err instanceof ServiceUnavailableError) {
      res.status(503).render('errors/unavailable', {
        seo:  { title: 'Service Unavailable' },
        page: { sectionKey: '', pageKey: 'error_503', title: 'Service Unavailable' },
      });
      return;
    }
    logger.error('unexpected error in records controller', {
      error: err instanceof Error ? err.message : String(err),
    });
    next(err);
  },
};
