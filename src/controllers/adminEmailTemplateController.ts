/**
 * Admin email-template editor controller: HTTP glue over
 * emailTemplateAdminService. List, edit form, and PRG save; a validation
 * failure re-renders the form (422) with submitted values and per-field
 * errors; an unknown template key is a 404.
 */
import type { NextFunction, Request, Response } from 'express';
import { emailTemplateAdminService, type EmailTemplateEditInput } from '../services/emailTemplateAdminService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';
import { renderNotFound } from '../lib/controllerErrors';
import { FLASH_KIND, takeFlash, writeFlash } from '../lib/flashCookie';

import { z } from 'zod';
import { parseFormBody, formText, formOptionalText } from '../lib/parseFormBody';

const templateForm = z.object({
  subjectTemplate: formText('Subject'),
  bodyTemplate: formText('Body'),
  piiClassification: formText('Personal data classification'),
  isEnabled: formOptionalText('Enabled'),
});

function editInputFrom(fields: Partial<Record<string, string>>): EmailTemplateEditInput {
  return {
    subjectTemplate: fields.subjectTemplate ?? '',
    bodyTemplate: fields.bodyTemplate ?? '',
    piiClassification: fields.piiClassification ?? '',
    isEnabled: fields.isEnabled === '1',
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
      const key = String(req.params.key);
      const flash = takeFlash(req, res, FLASH_KIND.ADMIN_SAVED);
      const vm = emailTemplateAdminService.getTemplateEditPage(key, {
        saved: flash === `email_template:${key}`,
        unchanged: flash === `email_template_unchanged:${key}`,
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
    const parsed = parseFormBody(templateForm, req.body);
    const input = editInputFrom(parsed.ok ? parsed.data : parsed.submitted);

    try {
      if (!parsed.ok) throw new ValidationError(parsed.message, { fieldErrors: parsed.fieldErrors });
      const result = emailTemplateAdminService.updateTemplate(key, input, req.user!.userId);
      const outcome = result.status === 'saved' ? 'email_template' : 'email_template_unchanged';
      writeFlash(res, req, FLASH_KIND.ADMIN_SAVED, `${outcome}:${key}`);
      res.redirect(303, `/admin/email-templates/${key}/edit`);
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
