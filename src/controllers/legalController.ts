import { Request, Response, NextFunction } from 'express';
import { legalService } from '../services/legalService';
import { handleControllerError } from '../lib/controllerErrors';

export const legalController = {
  index(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = legalService.getLegalPage();
      res.render('legal/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'legal controller');
    }
  },

  communityStandards(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = legalService.getCommunityStandardsPage();
      res.render('legal/community-standards', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'legal controller');
    }
  },
};
