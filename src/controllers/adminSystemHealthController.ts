import type { Request, Response, NextFunction } from 'express';
import { systemHealthService } from '../services/systemHealthService';
import { handleControllerError } from '../lib/controllerErrors';

export const adminSystemHealthController = {
  /** GET /admin/system-health */
  index(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/system-health/index', systemHealthService.getSystemHealthPage());
    } catch (err) {
      handleControllerError(err, res, next, 'admin system-health controller');
    }
  },
};
