import { Request, Response, NextFunction } from 'express';
import { legalService } from '../services/legalService';
import { handleControllerError } from '../lib/controllerErrors';

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
      handleControllerError(err, res, next, 'legal controller');
    }
  },
};
