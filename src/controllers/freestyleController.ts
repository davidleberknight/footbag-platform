import { Request, Response, NextFunction } from 'express';
import { freestyleService } from '../services/freestyleService';
import { ServiceUnavailableError } from '../services/serviceErrors';
import { logger } from '../config/logger';

/**
 * Thin controller for public freestyle routes.
 * Business logic and page shaping live in freestyleService.
 */
export const freestyleController = {
  /** GET /freestyle */
  landing(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getLandingPage();
      res.render('freestyle/landing', vm);
    } catch (err) {
      freestyleController._handleError(err, res, next);
    }
  },

  /** GET /freestyle/records */
  records(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = freestyleService.getRecordsPage();
      res.render('freestyle/records', vm);
    } catch (err) {
      freestyleController._handleError(err, res, next);
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
    logger.error('unexpected error in freestyle controller', {
      error: err instanceof Error ? err.message : String(err),
    });
    next(err);
  },
};
