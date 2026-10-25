import { Request, Response, NextFunction } from 'express';
import { consecutivesService } from '../services/consecutivesService';
import { handleControllerError } from '../lib/controllerErrors';

export const consecutivesController = {
  /** GET /consecutives */
  landing(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('consecutives/index', consecutivesService.getConsecutivesPage());
    } catch (err) {
      handleControllerError(err, res, next, 'consecutives controller');
    }
  },
};
