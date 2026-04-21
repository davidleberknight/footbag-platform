import { Request, Response, NextFunction } from 'express';
import { recordsService } from '../services/recordsService';
import { handleControllerError } from '../lib/controllerErrors';

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
      handleControllerError(err, res, next, 'records controller');
    }
  },

};
