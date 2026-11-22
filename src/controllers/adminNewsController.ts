import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { adminNewsService, type AdminNewsInput } from '../services/adminNewsService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';
import { renderNotFound } from '../lib/controllerErrors';
import { FLASH_KIND, takeFlash, writeFlash } from '../lib/flashCookie';
import { parseFormBody, formText, type FormParse } from '../lib/parseFormBody';

// One schema per form, each label the field's visible label on its page.
const newsForm = z.object({
  title:       formText('Title'),
  body:        formText('Body'),
  hashtag:     formText('Linked event or club hashtag (optional)'),
  publishedAt: formText('Publish date and time (UTC; empty means now)'),
  step:        formText('Step'),
});

const reasonForm = z.object({
  reason: formText('Reason'),
});

function newsInputFrom<T>(parsed: FormParse<T>): AdminNewsInput {
  const v = (parsed.ok ? parsed.data : parsed.submitted) as Partial<Record<string, string>>;
  return { title: v.title, body: v.body, hashtag: v.hashtag, publishedAt: v.publishedAt };
}

function refuseShape<T>(parsed: FormParse<T>): void {
  if (!parsed.ok) throw new ValidationError(parsed.message, { fieldErrors: parsed.fieldErrors });
}

function isPreview<T>(parsed: FormParse<T>): boolean {
  return parsed.ok && (parsed.data as { step: string }).step === 'preview';
}

function redirectSaved(req: Request, res: Response, path: string): void {
  writeFlash(res, req, FLASH_KIND.ADMIN_SAVED, path);
  res.redirect(303, path);
}

function itemPath(req: Request): string {
  return `/admin/news/${String(req.params.newsId)}`;
}

/** Renders one item's page, or the not-found page for an unknown id. */
function renderItem(
  res: Response,
  id: string,
  status: number,
  opts: Parameters<typeof adminNewsService.getItemPage>[2],
): void {
  const vm = adminNewsService.getItemPage(id, new Date().toISOString(), opts);
  if (!vm) {
    renderNotFound(res);
    return;
  }
  res.status(status).render('admin/news/edit', vm);
}

export const adminNewsController = {
  // Every item, newest first, a page at a time.
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/news/index', adminNewsService.getNewsListPage(req.query.page, new Date().toISOString()));
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // The blank write form.
  newItem(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/news/edit', adminNewsService.getNewPage());
    } catch (err) {
      next(err);
    }
  },

  // Preview re-renders the form with the item as it will appear; save writes
  // it and opens its page. A refusal re-renders the form as typed (422).
  create(req: Request, res: Response, next: NextFunction): void {
    const parsed = parseFormBody(newsForm, req.body);
    const input = newsInputFrom(parsed);
    const nowIso = new Date().toISOString();
    try {
      refuseShape(parsed);
      if (isPreview(parsed)) {
        const preview = adminNewsService.previewNewItem(input, nowIso);
        res.render('admin/news/edit', adminNewsService.getNewPage({ submitted: input, preview }));
        return;
      }
      const result = adminNewsService.createItem(input, req.user!.userId, nowIso);
      if (result.status === 'created') redirectSaved(req, res, `/admin/news/${result.newsItemId}`);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/news/edit', adminNewsService.getNewPage({
          submitted: input, fieldErrors: err.fieldErrors ?? {},
        }));
        return;
      }
      next(err);
    }
  },

  // One item's page; a save just made here shows the saved notice.
  show(req: Request, res: Response, next: NextFunction): void {
    try {
      const path = itemPath(req);
      renderItem(res, String(req.params.newsId), 200, {
        saved: takeFlash(req, res, FLASH_KIND.ADMIN_SAVED) === path,
      });
    } catch (err) {
      next(err);
    }
  },

  // Preview or save an edit to a News item.
  update(req: Request, res: Response, next: NextFunction): void {
    const id = String(req.params.newsId);
    const parsed = parseFormBody(newsForm, req.body);
    const input = newsInputFrom(parsed);
    const nowIso = new Date().toISOString();
    try {
      refuseShape(parsed);
      if (isPreview(parsed)) {
        const preview = adminNewsService.previewItemEdit(id, input, nowIso);
        renderItem(res, id, 200, { submitted: input, preview });
        return;
      }
      adminNewsService.updateItem(id, input, req.user!.userId, nowIso);
      redirectSaved(req, res, itemPath(req));
    } catch (err) {
      if (err instanceof ValidationError) {
        renderItem(res, id, 422, { submitted: input, fieldErrors: err.fieldErrors ?? {} });
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Hide an item, with a required reason.
  reject(req: Request, res: Response, next: NextFunction): void {
    const id = String(req.params.newsId);
    const parsed = parseFormBody(reasonForm, req.body);
    const reason = parsed.ok ? parsed.data.reason : (parsed.submitted.reason ?? '');
    try {
      refuseShape(parsed);
      const result = adminNewsService.hideItem(id, reason, req.user!.userId, new Date().toISOString());
      if (result.status === 'changed') redirectSaved(req, res, itemPath(req));
      else res.redirect(303, itemPath(req));
    } catch (err) {
      if (err instanceof ValidationError) {
        renderItem(res, id, 422, { reasonValue: reason, reasonError: err.fieldErrors?.reason ?? err.message });
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // Show a hidden item again.
  restore(req: Request, res: Response, next: NextFunction): void {
    try {
      const result = adminNewsService.restoreItem(String(req.params.newsId), req.user!.userId, new Date().toISOString());
      if (result.status === 'changed') redirectSaved(req, res, itemPath(req));
      else res.redirect(303, itemPath(req));
    } catch (err) {
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },

  // The confirm page before a permanent delete.
  deleteConfirm(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = adminNewsService.getDeleteConfirmPage(String(req.params.newsId));
      if (!vm) {
        renderNotFound(res);
        return;
      }
      res.render('admin/news/delete-confirm', vm);
    } catch (err) {
      next(err);
    }
  },

  // Delete an item permanently, with a required reason; back to the list.
  destroy(req: Request, res: Response, next: NextFunction): void {
    const id = String(req.params.newsId);
    const parsed = parseFormBody(reasonForm, req.body);
    const reason = parsed.ok ? parsed.data.reason : (parsed.submitted.reason ?? '');
    try {
      refuseShape(parsed);
      adminNewsService.deleteItem(id, reason, req.user!.userId);
      res.redirect(303, '/admin/news');
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = adminNewsService.getDeleteConfirmPage(id, {
          reasonValue: reason, reasonError: err.fieldErrors?.reason ?? err.message,
        });
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.status(422).render('admin/news/delete-confirm', vm);
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
