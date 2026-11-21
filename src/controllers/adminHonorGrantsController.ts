import { Request, Response, NextFunction } from 'express';
import { adminHonorGrantService, type HonorPickForm } from '../services/adminHonorGrantService';
import { parsePickIntent } from '../services/memberPicker';
import { ConflictError, NotFoundError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { FLASH_KIND, readFlash, clearFlash } from '../lib/flashCookie';
import { outcomeNotice, type OutcomeNoticeView } from '../lib/outcomeNotice';
import { redirectWithOutcome } from '../lib/actionOutcome';
import { z } from 'zod';
import { parseFormBody, formText, formOptionalText } from '../lib/parseFormBody';

const grantForm = z.object({
  member_id: formText('Member'),
  honor: formText('Honor'),
  induction_year: formText('Induction year'),
  pick: formOptionalText('The member picker'),
  pick_q: formText('Name or login email'),
});

const removeForm = z.object({
  member_id: formText('Member'),
  honor: formText('Honor'),
  reason: formText('Reason'),
});

const boardForm = z.object({
  member_id: formText('Member'),
  reason: formText('Reason'),
  pick: formOptionalText('The member picker'),
  pick_q: formText('Name or login email'),
});

// A shape the form never sends is refused like any other fixable submission,
// through the catch that already re-renders the page at 422.
function read<S extends z.ZodType>(schema: S, req: Request): z.output<S> {
  const parsed = parseFormBody(schema, req.body);
  if (!parsed.ok) throw new ValidationError(parsed.message);
  return parsed.data;
}

// Re-render the form with an inline error; the status follows the error class.
// ValidationError -> 422 (unknown member, invalid honor). ConflictError -> 409
// (the honor comes from a claimed historical record; the guard wrote nothing).
// A refused grant or board form keeps what was typed and chosen.
function renderError(
  res: Response,
  err: NotFoundError | ValidationError | ConflictError,
  form?: HonorPickForm,
): void {
  const status = err instanceof NotFoundError ? 404 : err instanceof ConflictError ? 409 : 422;
  res.status(status).render(
    'admin/honor-grants/index',
    adminHonorGrantService.getHonorGrantsPage({ errorMessage: err.message, ...(form ? { form: { ...form, intent: null } } : {}) }),
  );
}

// A member picker control draws the page again with what was typed, and writes
// nothing.
function renderPick(res: Response, form: HonorPickForm): void {
  res.render('admin/honor-grants/index', adminHonorGrantService.getHonorGrantsPage({ form }));
}

export const adminHonorGrantsController = {
  /** GET /admin/honor-grants */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let outcome: OutcomeNoticeView | null = null;
      if (flash?.kind === FLASH_KIND.HONOR_GRANT_OUTCOME) {
        outcome = outcomeNotice(flash.payload);
        clearFlash(res, req);
      }
      res.render('admin/honor-grants/index', adminHonorGrantService.getHonorGrantsPage({ outcome }));
    } catch (err) {
      handleControllerError(err, res, next, 'admin honor grants controller');
    }
  },

  /** POST /admin/honor-grants/grant -- validate, then show the confirmation page. */
  grant(req: Request, res: Response, next: NextFunction): void {
    let typed: HonorPickForm | undefined;
    try {
      const form = read(grantForm, req);
      typed = {
        form: 'grant', memberId: form.member_id, intent: parsePickIntent(form.pick), query: form.pick_q,
        honor: form.honor, inductionYear: form.induction_year,
      };
      if (form.pick !== undefined) {
        renderPick(res, typed);
        return;
      }
      const vm = adminHonorGrantService.previewHonorGrant(form.member_id, form.honor, form.induction_year);
      res.render('admin/honor-grants/grant-confirm', vm);
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
        renderError(res, err, typed);
        return;
      }
      handleControllerError(err, res, next, 'admin honor grants controller');
    }
  },

  /** POST /admin/honor-grants/grant/confirm -- commit the grant after confirmation. */
  grantConfirm(req: Request, res: Response, next: NextFunction): void {
    try {
      const form = read(grantForm, req);
      const outcome = adminHonorGrantService.grantHonor(
        req.user!.userId,
        form.member_id,
        form.honor,
        form.induction_year,
      );
      // The first submit and this admin's own repeat return to the list as they
      // always have; an honor another act left in place says so.
      if (outcome.notice) {
        redirectWithOutcome(req, res, {
          flash: FLASH_KIND.HONOR_GRANT_OUTCOME,
          to: '/admin/honor-grants',
          ending: outcome.ending,
          text: outcome.notice,
        });
        return;
      }
      res.redirect(303, '/admin/honor-grants');
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
        renderError(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin honor grants controller');
    }
  },

  /** POST /admin/honor-grants/remove -- preview taking back a grant made in error. */
  remove(req: Request, res: Response, next: NextFunction): void {
    try {
      const form = read(removeForm, req);
      res.render('admin/honor-grants/action-confirm', adminHonorGrantService.previewHonorRemoval(
        form.member_id,
        form.honor,
        form.reason,
      ));
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
        renderError(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin honor grants controller');
    }
  },

  /** POST /admin/honor-grants/remove/confirm */
  removeConfirm(req: Request, res: Response, next: NextFunction): void {
    try {
      const form = read(removeForm, req);
      adminHonorGrantService.removeHonor(req.user!.userId, form.member_id, form.honor, form.reason);
      res.redirect(303, '/admin/honor-grants');
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
        renderError(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin honor grants controller');
    }
  },

  /**
   * POST /admin/honor-grants/board/set and /board/remove -- preview.
   *
   * The direction comes from the route registration, not from the request path,
   * which a trailing slash would flip.
   */
  board(setting: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
      let typed: HonorPickForm | undefined;
      try {
        const form = read(boardForm, req);
        // Only the board-set form carries a picker; a removal starts from the
        // director's own row.
        if (setting) {
          typed = { form: 'board', memberId: form.member_id, intent: parsePickIntent(form.pick), query: form.pick_q, reason: form.reason };
          if (form.pick !== undefined) {
            renderPick(res, typed);
            return;
          }
        }
        res.render('admin/honor-grants/action-confirm', adminHonorGrantService.previewBoardChange(
          form.member_id,
          setting,
          form.reason,
        ));
      } catch (err) {
        if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
          renderError(res, err, typed);
          return;
        }
        handleControllerError(err, res, next, 'admin honor grants controller');
      }
    };
  },

  /** POST /admin/honor-grants/board/set/confirm and /board/remove/confirm */
  boardConfirm(setting: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        const form = read(boardForm, req);
        const outcome = adminHonorGrantService.applyBoardChange(
          req.user!.userId,
          form.member_id,
          setting,
          form.reason,
        );
        if (outcome.notice) {
          redirectWithOutcome(req, res, {
            flash: FLASH_KIND.HONOR_GRANT_OUTCOME,
            to: '/admin/honor-grants',
            ending: outcome.ending,
            text: outcome.notice,
          });
          return;
        }
        res.redirect(303, '/admin/honor-grants');
      } catch (err) {
        if (err instanceof NotFoundError || err instanceof ValidationError || err instanceof ConflictError) {
          renderError(res, err);
          return;
        }
        handleControllerError(err, res, next, 'admin honor grants controller');
      }
    };
  },
};
