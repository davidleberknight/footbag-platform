// ---- Dev-only ----
// Thin controller for GET /internal/dev-outbox. Delegates to devOutboxService
// and maps NotFoundError (live-mode gate) to 404 via handleControllerError.

import { Request, Response, NextFunction } from 'express';
import { devOutboxService } from '../services/devOutboxService';
import { handleControllerError } from '../../lib/controllerErrors';

export const devOutboxController = {
  /** GET /internal/dev-outbox */
  async page(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const vm = await devOutboxService.getDevOutboxPage();
      res.render('internal-qc/dev-outbox', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'dev outbox controller');
    }
  },
};
