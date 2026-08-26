/**
 * Admin mailing-list controller: HTTP glue over mailingListService. The index,
 * the create and edit forms, the per-list detail page, and the three writes
 * reached from them. Each write follows post-redirect-get and carries its
 * outcome back as a query flag the detail page turns into a banner; a
 * validation failure re-renders the form it came from at 422 with the submitted
 * values, and an unknown slug is a 404.
 */
import type { NextFunction, Request, Response } from 'express';

import { mailingListService, type MailingListInput } from '../services/mailingListService';
import { ConflictError, NotFoundError, ValidationError } from '../services/serviceErrors';
import { renderNotFound } from '../lib/controllerErrors';

function listInputFromBody(body: Record<string, unknown>): MailingListInput {
  return {
    name: typeof body.name === 'string' ? body.name : '',
    description: typeof body.description === 'string' ? body.description : '',
    isMemberManageable: body.isMemberManageable === '1',
    fromIdentity: typeof body.fromIdentity === 'string' ? body.fromIdentity : '',
    subjectPrefix: typeof body.subjectPrefix === 'string' ? body.subjectPrefix : '',
  };
}

function noticeFrom(req: Request): string | undefined {
  return typeof req.query.notice === 'string' ? req.query.notice : undefined;
}

export const adminMailingListController = {
  index(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/mailing-lists/index', mailingListService.getMailingListIndexPage());
    } catch (err) {
      next(err);
    }
  },

  newForm(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/mailing-lists/form', mailingListService.getNewListPage());
    } catch (err) {
      next(err);
    }
  },

  create(req: Request, res: Response, next: NextFunction): void {
    const input = listInputFromBody(req.body as Record<string, unknown>);
    try {
      const slug = mailingListService.createList(input, req.user!.userId);
      res.redirect(303, `/admin/mailing-lists/${slug}?notice=created`);
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) {
        const fieldErrors = err instanceof ValidationError && err.fieldErrors
          ? err.fieldErrors
          : { name: err.message };
        res.status(422).render(
          'admin/mailing-lists/form',
          mailingListService.getNewListPage({ submitted: input, fieldErrors }),
        );
        return;
      }
      next(err);
    }
  },

  detail(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = mailingListService.getMailingListDetailPage(String(req.params.slug), {
        notice: noticeFrom(req),
      });
      if (!vm) {
        renderNotFound(res);
        return;
      }
      res.render('admin/mailing-lists/detail', vm);
    } catch (err) {
      next(err);
    }
  },

  editForm(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = mailingListService.getEditListPage(String(req.params.slug));
      if (!vm) {
        renderNotFound(res);
        return;
      }
      res.render('admin/mailing-lists/form', vm);
    } catch (err) {
      next(err);
    }
  },

  update(req: Request, res: Response, next: NextFunction): void {
    const slug = String(req.params.slug);
    const input = listInputFromBody(req.body as Record<string, unknown>);
    try {
      mailingListService.updateList(slug, input, req.user!.userId);
      res.redirect(303, `/admin/mailing-lists/${slug}?notice=saved`);
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) {
        const fieldErrors = err instanceof ValidationError && err.fieldErrors
          ? err.fieldErrors
          : { name: err.message };
        const vm = mailingListService.getEditListPage(slug, { submitted: input, fieldErrors });
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.status(422).render('admin/mailing-lists/form', vm);
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  archive(req: Request, res: Response, next: NextFunction): void {
    const slug = String(req.params.slug);
    try {
      const outcome = mailingListService.archiveList(slug, req.user!.userId);
      const notice = outcome.status === 'archived' ? 'archived' : outcome.reason;
      res.redirect(303, `/admin/mailing-lists/${slug}?notice=${notice}`);
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  adjustSubscription(req: Request, res: Response, next: NextFunction): void {
    const slug = String(req.params.slug);
    const body = req.body as Record<string, unknown>;
    const memberId = typeof body.memberId === 'string' ? body.memberId : '';
    const status = typeof body.status === 'string' ? body.status : '';
    const reason = typeof body.reason === 'string' ? body.reason : '';

    try {
      const outcome = mailingListService.adjustSubscription(
        slug, memberId, status, reason, req.user!.userId,
      );
      const notice = outcome.status === 'adjusted' ? 'adjusted' : outcome.reason;
      res.redirect(303, `/admin/mailing-lists/${slug}?notice=${notice}`);
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = mailingListService.getMailingListDetailPage(slug, {
          fieldErrors: err.fieldErrors ?? { status: err.message },
        });
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.status(422).render('admin/mailing-lists/detail', vm);
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },
};
