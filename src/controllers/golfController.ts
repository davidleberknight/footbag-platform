import { Request, Response, NextFunction } from 'express';
import { golfService } from '../services/golfService';
import { handleControllerError } from '../lib/controllerErrors';

export const golfController = {
  /** GET /golf */
  landing(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('golf/landing', golfService.getGolfPage());
    } catch (err) {
      handleControllerError(err, res, next, 'golf controller');
    }
  },
};
