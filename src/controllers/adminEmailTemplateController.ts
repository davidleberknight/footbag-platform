/**
 * Admin email-template editor controller: HTTP glue over
 * emailTemplateAdminService. List, edit form, and PRG save; a validation
 * failure re-renders the form (422) with submitted values and per-field
 * errors; an unknown template key is a 404.
 */
import type { NextFunction, Request, Response } from 'express';
import { emailTemplateAdminService, type EmailTemplateEditInput } from '../services/emailTemplateAdminService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';

function renderNotFound(res: Response): void {
  res.status(404).render('errors/not-found', {
    seo:  { title: 'Not Found' },
    page: { sectionKey: 'admin', pageKey: 'error_404', title: 'Not Found' },
  });
}

function editInputFromBody(body: Record<string, unknown>): EmailTemplateEditInput {
  return {
    subjectTemplate: typeof body.subjectTemplate === 'string' ? body.subjectTemplate : '',
    bodyTemplate: typeof body.bodyTemplate === 'string' ? body.bodyTemplate : '',
    piiClassification: typeof body.piiClassification === 'string' ? body.piiClassification : '',
    isEnabled: body.isEnabled === '1',
  };
}

export const adminEmailTemplateController = {
  index(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/email-templates/index', emailTemplateAdminService.getTemplateListPage());
    } catch (err) {
      next(err);
    }
  },

  edit(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = emailTemplateAdminService.getTemplateEditPage(String(req.params.key), {
        saved: req.query.saved === '1',
      });
      if (!vm) {
        renderNotFound(res);
        return;
      }
      res.render('admin/email-templates/edit', vm);
    } catch (err) {
      next(err);
    }
  },

  update(req: Request, res: Response, next: NextFunction): void {
    const key = String(req.params.key);
    const input = editInputFromBody(req.body as Record<string, unknown>);

    try {
      emailTemplateAdminService.updateTemplate(key, input, req.user!.userId);
      res.redirect(303, `/admin/email-templates/${key}/edit?saved=1`);
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = emailTemplateAdminService.getTemplateEditPage(key, {
          submitted: input,
          fieldErrors: err.fieldErrors ?? {},
        });
        if (!vm) {
          renderNotFound(res);
          return;
        }
        res.status(422).render('admin/email-templates/edit', vm);
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
