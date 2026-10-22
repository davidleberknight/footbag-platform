import type { Request, Response, NextFunction } from 'express';
import { auditLogService, type AuditLogQuery } from '../services/auditLogService';
import { handleControllerError } from '../lib/controllerErrors';
import { ValidationError } from '../services/serviceErrors';

/** Trim a query value to a non-empty string, or undefined. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function parseQuery(req: Request): AuditLogQuery {
  const pageRaw = parseInt(String(req.query.page ?? '1'), 10);
  return {
    memberId: str(req.query.member),
    entityType: str(req.query.entityType),
    entityId: str(req.query.entityId),
    actionType: str(req.query.actionType),
    category: str(req.query.category),
    actorType: str(req.query.actorType),
    fromDate: str(req.query.from),
    toDate: str(req.query.to),
    selfActionOnly: req.query.self === '1',
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
  };
}

export const adminAuditLogController = {
  /** GET /admin/audit-log */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const query = parseQuery(req);
      const vm = auditLogService.getAuditLogPage(query);
      res.render('admin/audit-log/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'admin audit-log controller');
    }
  },

  /** GET /admin/audit-log/summary */
  summary(req: Request, res: Response, next: NextFunction): void {
    try {
      const query = parseQuery(req);
      const vm = auditLogService.getAuditLogSummaryPage(query);
      res.render('admin/audit-log/summary', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'admin audit-log summary');
    }
  },

  /** GET /admin/audit-log/export */
  exportLog(req: Request, res: Response, next: NextFunction): void {
    try {
      const format = req.query.format === 'json' ? 'json' : 'csv';
      const query = parseQuery(req);
      const out = auditLogService.getAuditLogExport(query, format);
      res.setHeader('Content-Type', `${out.contentType}; charset=utf-8`);
      res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
      for (const chunk of out.chunks) res.write(chunk);
      res.end();
    } catch (err) {
      // A refused window re-renders the viewer with the rule as a refusal, so
      // the administrator sees why rather than a not-found page.
      if (err instanceof ValidationError) {
        const vm = auditLogService.getAuditLogPage(parseQuery(req));
        res.status(422).render('admin/audit-log/index', {
          ...vm,
          page: { ...vm.page, notice: err.message, noticeTone: 'no' },
        });
        return;
      }
      handleControllerError(err, res, next, 'admin audit-log export');
    }
  },
};
