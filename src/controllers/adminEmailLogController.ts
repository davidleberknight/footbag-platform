import type { Request, Response, NextFunction } from 'express';
import { emailLogService, type EmailLogQuery } from '../services/emailLogService';
import { ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';

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

/** Where a review returns to: the same filtered listing, page included. */
function returnPath(req: Request): string {
  const q = parseQuery(req);
  const p = new URLSearchParams();
  if (q.recipient) p.set('recipient', q.recipient);
  if (q.templateKey) p.set('template', q.templateKey);
  if (q.status) p.set('status', q.status);
  if (q.page && q.page > 1) p.set('page', String(q.page));
  const qs = p.toString();
  return qs ? `/admin/email-log?${qs}` : '/admin/email-log';
}

/** What the administrator is told after a review, by outcome. */
const REVIEW_NOTICES: Record<string, string> = {
  reviewed:        'Message marked reviewed. It stays in the log and on the health page; it no longer waits on anyone.',
  already_reviewed: 'That message was already reviewed, so nothing changed.',
  not_reviewable:  'That message is not in a failed state, so there is nothing to review.',
};

export const adminEmailLogController = {
  /** GET /admin/email-log */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      const notice = flash?.kind === FLASH_KIND.EMAIL_LOG_REVIEWED
        ? REVIEW_NOTICES[String(flash.payload)] ?? undefined
        : undefined;
      if (flash) clearFlash(res, req);
      const vm = emailLogService.getEmailLogPage(parseQuery(req));
      if (notice) vm.page.notice = notice;
      res.render('admin/email-log/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'admin email-log controller');
    }
  },

  /** POST /admin/email-log/:id/review
   *
   *  Returns to the filtered listing the administrator was reading, so working
   *  through the dead-letter filter does not throw them back to the whole log
   *  after every item. */
  review(req: Request, res: Response, next: NextFunction): void {
    try {
      const result = emailLogService.markReviewed({
        outboxId:      req.params['id'] ?? '',
        adminMemberId: req.user!.userId,
        note:          req.body?.note,
      });
      writeFlash(res, req, FLASH_KIND.EMAIL_LOG_REVIEWED, result.status);
      res.redirect(303, returnPath(req));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/email-log/index', emailLogService.getEmailLogPage(parseQuery(req)));
        return;
      }
      handleControllerError(err, res, next, 'admin email-log controller');
    }
  },
};
