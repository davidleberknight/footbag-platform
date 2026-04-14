import { Request, Response, NextFunction } from 'express';
import { legalService } from '../services/legalService';
import { logger } from '../config/logger';

/**
 * Thin controller for the /legal route.
 * Page shaping lives in legalService.
 */
export const legalController = {
  /** GET /legal */
  index(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = legalService.getLegalPage();
      res.render('legal/index', vm);
    } catch (err) {
      logger.error('unexpected error in legal controller', {
        error: err instanceof Error ? err.message : String(err),
      });
      next(err);
    }
  },
};
