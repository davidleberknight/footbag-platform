import { Request, Response, NextFunction } from 'express';
import { adminClubLeadershipService } from '../services/adminClubLeadershipService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';
import { FLASH_KIND, readFlash, clearFlash } from '../lib/flashCookie';
import { outcomeNotice, type OutcomeNoticeView } from '../lib/outcomeNotice';
import { redirectWithOutcome } from '../lib/actionOutcome';
import { z } from 'zod';
import { parseFormBody, formText, formOptionalText } from '../lib/parseFormBody';
import { parsePickIntent } from '../services/memberPicker';

const assignForm = z.object({
  member_id: formText('Member'),
  reason: formText('Reason'),
  pick: formOptionalText('The member picker'),
  pick_q: formText('Name or login email'),
});

const demoteForm = z.object({
  member_id: formText('Member'),
  mode: formText('Action'),
  reason: formText('Reason'),
});

// A shape the form never sends is refused like any other fixable submission,
// through the catch that already re-renders the detail page at 422.
function read<S extends z.ZodType>(schema: S, req: Request): z.output<S> {
  const parsed = parseFormBody(schema, req.body);
  if (!parsed.ok) throw new ValidationError(parsed.message);
  return parsed.data;
}

// The detail page is rebuilt to carry the error, which means loading the club
// again -- and when the club is the thing that does not exist, that load throws
// the same not-found a second time, this time from inside the caller's catch
// block, where nothing handles it and the visitor gets a 500 instead of the 404
// the GET on the same id answers. A club that cannot be loaded has no page to
// render the error on, so answer plainly.
function renderDetailError(
  res: Response,
  next: NextFunction,
  clubId: string,
  err: ValidationError | NotFoundError,
  typed?: { memberId: string; reason: string; query: string },
): void {
  const status = err instanceof NotFoundError ? 404 : 422;
  let page;
  try {
    page = adminClubLeadershipService.getClubLeadershipPage(clubId, {
      errorMessage: err.message,
      ...(typed ? { form: { ...typed, intent: null } } : {}),
    });
  } catch (reloadErr) {
    // Only a club that is genuinely gone has no page to answer on. Any other
    // reload failure keeps its own answer -- a contended database renders the
    // temporary-unavailable page rather than telling the admin that a club
    // which does exist does not.
    if (reloadErr instanceof NotFoundError) {
      renderNotFound(res);
      return;
    }
    handleControllerError(reloadErr, res, next, 'admin club leadership controller');
    return;
  }
  res.status(status).render('admin/club-leadership/detail', page);
}

export const adminClubLeadershipController = {
  /** GET /admin/clubs/:clubId/leadership */
  detail(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let notice: OutcomeNoticeView | null = null;
      if (flash?.kind === FLASH_KIND.CLUB_LEADERSHIP_OUTCOME) {
        notice = outcomeNotice(flash.payload);
        clearFlash(res, req);
      }
      res.render('admin/club-leadership/detail', adminClubLeadershipService.getClubLeadershipPage(req.params.clubId ?? '', { notice }));
    } catch (err) {
      handleControllerError(err, res, next, 'admin club leadership controller');
    }
  },

  /** POST /admin/clubs/:clubId/leadership/assign */
  assign(req: Request, res: Response, next: NextFunction): void {
    const clubId = req.params.clubId ?? '';
    let typed: { memberId: string; reason: string; query: string } | undefined;
    try {
      const form = read(assignForm, req);
      typed = { memberId: form.member_id, reason: form.reason, query: form.pick_q };
      // A member picker control draws the page again with what was typed, and
      // assigns nothing.
      if (form.pick !== undefined) {
        res.render('admin/club-leadership/detail', adminClubLeadershipService.getClubLeadershipPage(clubId, {
          form: { ...typed, intent: parsePickIntent(form.pick) },
        }));
        return;
      }
      const outcome = adminClubLeadershipService.assignLeader(
        req.user!.userId,
        clubId,
        form.member_id,
        form.reason,
      );
      redirectWithOutcome(req, res, {
        flash: FLASH_KIND.CLUB_LEADERSHIP_OUTCOME,
        to: `/admin/clubs/${clubId}/leadership`,
        ending: outcome.ending,
        text: outcome.text,
      });
    } catch (err) {
      if (err instanceof ValidationError || err instanceof NotFoundError) {
        renderDetailError(res, next, clubId, err, typed);
        return;
      }
      handleControllerError(err, res, next, 'admin club leadership controller');
    }
  },

  /** POST /admin/clubs/:clubId/leadership/demote
   *
   * Shows what the demotion does before it does it. Removing an affiliation
   * ends a member's membership of the club, which the form's dropdown said in
   * four words and nothing else. */
  demotePreview(req: Request, res: Response, next: NextFunction): void {
    const clubId = req.params.clubId ?? '';
    try {
      const form = read(demoteForm, req);
      const mode = form.mode;
      if (mode !== 'to_member' && mode !== 'remove_affiliation') {
        renderDetailError(res, next, clubId, new ValidationError('Choose how to demote the leader.'));
        return;
      }
      res.render('admin/club-leadership/demote-confirm', adminClubLeadershipService.previewDemote(
        clubId,
        form.member_id,
        mode,
        form.reason,
      ));
    } catch (err) {
      if (err instanceof ValidationError || err instanceof NotFoundError) {
        renderDetailError(res, next, clubId, err);
        return;
      }
      handleControllerError(err, res, next, 'admin club leadership controller');
    }
  },

  /** POST /admin/clubs/:clubId/leadership/demote/confirm */
  demote(req: Request, res: Response, next: NextFunction): void {
    const clubId = req.params.clubId ?? '';
    try {
      // The demote form offers exactly these two actions; reject anything else
      // rather than silently falling back to a demotion the admin did not pick.
      const form = read(demoteForm, req);
      const mode = form.mode;
      if (mode !== 'to_member' && mode !== 'remove_affiliation') {
        renderDetailError(res, next, clubId, new ValidationError('Choose how to demote the leader.'));
        return;
      }
      const outcome = adminClubLeadershipService.demoteLeader(
        req.user!.userId,
        clubId,
        form.member_id,
        mode,
        form.reason,
      );
      redirectWithOutcome(req, res, {
        flash: FLASH_KIND.CLUB_LEADERSHIP_OUTCOME,
        to: `/admin/clubs/${clubId}/leadership`,
        ending: outcome.ending,
        text: outcome.text,
      });
    } catch (err) {
      if (err instanceof ValidationError || err instanceof NotFoundError) {
        renderDetailError(res, next, clubId, err);
        return;
      }
      handleControllerError(err, res, next, 'admin club leadership controller');
    }
  },
};
