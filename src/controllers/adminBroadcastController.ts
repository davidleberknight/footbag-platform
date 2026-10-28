/**
 * Admin broadcast controller: HTTP glue over broadcastService. The compose form
 * for one mailing list, the send, and the archive of what has been sent. The
 * send follows post-redirect-get and carries its outcome back as a query flag;
 * a validation failure re-renders the compose form at 422 with the submitted
 * text and its send token intact, so a retry is the same send rather than a
 * second one.
 */
import type { NextFunction, Request, Response } from 'express';

import { broadcastService, type ComposeInput } from '../services/broadcastService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';
import { renderNotFound } from '../lib/controllerErrors';
import { FLASH_KIND, writeFlash } from '../lib/flashCookie';

function composeInputFromBody(body: Record<string, unknown>): ComposeInput {
  return {
    subject: typeof body.subject === 'string' ? body.subject : '',
    bodyText: typeof body.bodyText === 'string' ? body.bodyText : '',
    sendToken: typeof body.sendToken === 'string' ? body.sendToken : '',
  };
}

export const adminBroadcastController = {
  composeForm(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = broadcastService.getComposePage(String(req.params.slug));
      if (!vm) {
        renderNotFound(res);
        return;
      }
      res.render('admin/mailing-lists/compose', vm);
    } catch (err) {
      next(err);
    }
  },

  send(req: Request, res: Response, next: NextFunction): void {
    const slug = String(req.params.slug);
    const input = composeInputFromBody(req.body as Record<string, unknown>);

    try {
      const outcome = broadcastService.sendToList(slug, input, req.user!.userId);
      // A send carries the number of copies queued, so the sender sees what
      // went out. A repeat of a send already made under this form reports that
      // send's success, as the member announce does, rather than a no-op note.
      const notice = outcome.status === 'sent'
        ? `sent:${outcome.enqueued}`
        : outcome.reason === 'already_sent' ? 'sent' : outcome.reason;
      writeFlash(res, req, FLASH_KIND.MAILING_LIST_RESULT, notice);
      res.redirect(303, `/admin/mailing-lists/${slug}`);
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = broadcastService.getComposePage(slug, {
          submitted: input,
          fieldErrors: err.fieldErrors ?? { subject: err.message },
        });
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.status(422).render('admin/mailing-lists/compose', vm);
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const pageRaw = parseInt(String(req.query.page ?? '1'), 10);
      res.render('admin/broadcasts/index', broadcastService.getBroadcastIndexPage(
        Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
      ));
    } catch (err) {
      next(err);
    }
  },

  detail(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = broadcastService.getBroadcastDetailPage(String(req.params.id));
      if (!vm) {
        renderNotFound(res);
        return;
      }
      res.render('admin/broadcasts/detail', vm);
    } catch (err) {
      next(err);
    }
  },
};
