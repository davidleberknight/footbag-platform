import type { Request, Response, NextFunction } from 'express';
import { emailLogService, type EmailLogQuery } from '../services/emailLogService';
import { handleControllerError } from '../lib/controllerErrors';

/** Trim a query value to a non-empty string, or undefined. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function parseQuery(req: Request): EmailLogQuery {
  const pageRaw = parseInt(String(req.query.page ?? '1'), 10);
  return {
    recipient: str(req.query.recipient),
    templateKey: str(req.query.template),
    status: str(req.query.status),
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
  };
}

export const adminEmailLogController = {
  /** GET /admin/email-log */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = emailLogService.getEmailLogPage(parseQuery(req));
      res.render('admin/email-log/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'admin email-log controller');
    }
  },
};
