import { Request, Response, NextFunction } from 'express';
import { groupService } from '../services/groupService';
import { handleControllerError } from '../lib/controllerErrors';

export const groupController = {
  /** GET /groups */
  getIndex(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = groupService.getIndexPage();
      res.render('groups/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'group controller');
    }
  },
};
