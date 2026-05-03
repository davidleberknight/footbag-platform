import { Request, Response, NextFunction } from 'express';
import { sidelineService } from '../services/sidelineService';
import { handleControllerError } from '../lib/controllerErrors';

export const sidelineController = {
  /** GET /sideline */
  landing(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = sidelineService.getSidelineLandingPage();
      res.render('sideline/landing', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'sideline controller');
    }
  },
};
