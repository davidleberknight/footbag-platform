import type { Request, Response, NextFunction } from 'express';
import { adminLegacyAccountService } from '../services/adminLegacyAccountService';
import { handleControllerError } from '../lib/controllerErrors';

export const adminLegacyAccountController = {
  /** GET /admin/legacy-accounts */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const query = typeof req.query['q'] === 'string' ? req.query['q'] : '';
      res.render(
        'admin/legacy-accounts/index',
        adminLegacyAccountService.getLegacyAccountsPage(query),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'admin legacy account controller');
    }
  },
};
