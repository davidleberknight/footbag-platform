import { Request, Response, NextFunction } from 'express';
import { xSquareService } from '../services/xSquareService';
import { handleControllerError } from '../lib/controllerErrors';

export const xSquareController = {
  /** GET /x-square */
  landing(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('x-square/landing', xSquareService.getXSquarePage());
    } catch (err) {
      handleControllerError(err, res, next, 'x-square controller');
    }
  },
};
