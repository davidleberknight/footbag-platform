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

const VIEW = 'admin/system-parameters/index';

function stringField(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  return typeof value === 'string' ? value : '';
}

// Only the keys the screen owns are read out of the body, so a posted field
// naming any other configuration key reaches nothing.
function submittedValues(body: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of EDITABLE_PARAMETER_KEYS) {
    const raw = body[key];
    if (typeof raw === 'string') values[key] = raw;
  }
  return values;
}

function priceInputFromBody(body: Record<string, unknown>): PriceScheduleInput {
  return {
    priceKey: stringField(body, 'priceKey'),
    amountUsd: stringField(body, 'amountUsd'),
    effectiveStartDate: stringField(body, 'effectiveStartDate'),
    reason: stringField(body, 'reason'),
  };
}

export const adminSystemParametersController = {
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const saved = req.query.saved;
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
    const body = req.body as Record<string, unknown>;
    const values = submittedValues(body);
    const reason = stringField(body, 'reason');

    try {
      adminSystemParametersService.updateParameters({ values, reason }, req.user!.userId);
      res.redirect(303, '/admin/system-parameters?saved=parameters');
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
    const input = priceInputFromBody(req.body as Record<string, unknown>);

    try {
      adminSystemParametersService.schedulePrice(input, req.user!.userId);
      res.redirect(303, '/admin/system-parameters?saved=price');
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
