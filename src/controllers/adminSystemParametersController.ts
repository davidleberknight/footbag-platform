/**
 * Admin system-parameters controller: HTTP glue over
 * adminSystemParametersService. One read view, one save for the tunable
 * values, and one scheduling post for a membership price. A validation failure
 * or a collision with a change someone else just made re-renders the page (422)
 * with the submitted values and per-field messages; a successful write
 * redirects so a reload cannot repeat it.
 */
import type { NextFunction, Request, Response } from 'express';
import {
  adminSystemParametersService,
  EDITABLE_PARAMETER_KEYS,
  type PriceScheduleInput,
} from '../services/adminSystemParametersService';
import { ConflictError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { FLASH_KIND, takeFlash, writeFlash } from '../lib/flashCookie';
import { z } from 'zod';
import { parseFormBody, formText, formOptionalText } from '../lib/parseFormBody';

const VIEW = 'admin/system-parameters/index';

// Only the keys the screen owns are named, so a posted field naming any other
// configuration key reaches nothing.
const parameterFields: Record<string, ReturnType<typeof formOptionalText>> = {};
for (const key of EDITABLE_PARAMETER_KEYS) parameterFields[key] = formOptionalText(key);
const parametersForm = z.object({ ...parameterFields, reason: formText('Reason') });

const priceForm = z.object({
  priceKey: formText('Price'),
  amountUsd: formText('Amount (USD)'),
  effectiveStartDate: formText('Effective from'),
  reason: formText('Reason'),
});

// The values as typed: each editable key that arrived as text, and the reason.
function submittedParameters(fields: Partial<Record<string, string>>): { values: Record<string, string>; reason: string } {
  const values: Record<string, string> = {};
  for (const key of EDITABLE_PARAMETER_KEYS) {
    const value = fields[key];
    if (typeof value === 'string') values[key] = value;
  }
  return { values, reason: fields.reason ?? '' };
}

function priceInputFrom(fields: Partial<Record<string, string>>): PriceScheduleInput {
  return {
    priceKey: fields.priceKey ?? '',
    amountUsd: fields.amountUsd ?? '',
    effectiveStartDate: fields.effectiveStartDate ?? '',
    reason: fields.reason ?? '',
  };
}

export const adminSystemParametersController = {
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const saved = takeFlash(req, res, FLASH_KIND.ADMIN_SAVED);
      res.render(
        VIEW,
        adminSystemParametersService.getSystemParametersPage({
          saved: saved === 'parameters' || saved === 'price' ? saved : undefined,
        }),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'admin system parameters');
    }
  },

  update(req: Request, res: Response, next: NextFunction): void {
    const parsed = parseFormBody(parametersForm, req.body);
    const { values, reason } = submittedParameters(parsed.ok ? parsed.data : parsed.submitted);

    try {
      if (!parsed.ok) throw new ValidationError(parsed.message, { fieldErrors: parsed.fieldErrors });
      adminSystemParametersService.updateParameters({ values, reason }, req.user!.userId);
      writeFlash(res, req, FLASH_KIND.ADMIN_SAVED, 'parameters');
      res.redirect(303, '/admin/system-parameters');
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) {
        const fieldErrors =
          err instanceof ValidationError ? (err.fieldErrors ?? {}) : { reason: err.message };
        res.status(422).render(
          VIEW,
          adminSystemParametersService.getSystemParametersPage({
            submittedValues: values,
            submittedReason: reason,
            fieldErrors,
          }),
        );
        return;
      }
      handleControllerError(err, res, next, 'admin system parameters save');
    }
  },

  schedulePrice(req: Request, res: Response, next: NextFunction): void {
    const parsed = parseFormBody(priceForm, req.body);
    const input = priceInputFrom(parsed.ok ? parsed.data : parsed.submitted);

    try {
      if (!parsed.ok) throw new ValidationError(parsed.message, { fieldErrors: parsed.fieldErrors });
      adminSystemParametersService.schedulePrice(input, req.user!.userId);
      writeFlash(res, req, FLASH_KIND.ADMIN_SAVED, 'price');
      res.redirect(303, '/admin/system-parameters');
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) {
        const priceFieldErrors =
          err instanceof ValidationError
            ? (err.fieldErrors ?? {})
            : { effectiveStartDate: err.message };
        res.status(422).render(
          VIEW,
          adminSystemParametersService.getSystemParametersPage({
            submittedPrice: input,
            priceFieldErrors,
          }),
        );
        return;
      }
      handleControllerError(err, res, next, 'admin system parameters price change');
    }
  },
};
