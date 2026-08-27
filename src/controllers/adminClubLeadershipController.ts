import { Request, Response, NextFunction } from 'express';
import { adminClubLeadershipService } from '../services/adminClubLeadershipService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';

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
): void {
  const status = err instanceof NotFoundError ? 404 : 422;
  let page;
  try {
    page = adminClubLeadershipService.getClubLeadershipPage(clubId, { errorMessage: err.message });
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
  /** GET /admin/clubs/leadership */
  queue(_req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/club-leadership/queue', adminClubLeadershipService.getLeadershipQueuePage());
    } catch (err) {
      handleControllerError(err, res, next, 'admin club leadership controller');
    }
  },

  /** GET /admin/clubs/:clubId/leadership */
  detail(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/club-leadership/detail', adminClubLeadershipService.getClubLeadershipPage(req.params.clubId ?? ''));
    } catch (err) {
      handleControllerError(err, res, next, 'admin club leadership controller');
    }
  },

  /** POST /admin/clubs/:clubId/leadership/assign */
  assign(req: Request, res: Response, next: NextFunction): void {
    const clubId = req.params.clubId ?? '';
    try {
      adminClubLeadershipService.assignLeader(
        req.user!.userId,
        clubId,
        String(req.body.member_key ?? ''),
        String(req.body.reason ?? ''),
        String(req.body.cap_override_reason ?? ''),
      );
      res.redirect(303, `/admin/clubs/${clubId}/leadership`);
    } catch (err) {
      if (err instanceof ValidationError || err instanceof NotFoundError) {
        renderDetailError(res, next, clubId, err);
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
      const mode = req.body.mode;
      if (mode !== 'to_member' && mode !== 'remove_affiliation') {
        renderDetailError(res, next, clubId, new ValidationError('Choose how to demote the leader.'));
        return;
      }
      res.render('admin/club-leadership/demote-confirm', adminClubLeadershipService.previewDemote(
        clubId,
        String(req.body.member_id ?? ''),
        mode,
        String(req.body.reason ?? ''),
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
      const mode = req.body.mode;
      if (mode !== 'to_member' && mode !== 'remove_affiliation') {
        renderDetailError(res, next, clubId, new ValidationError('Choose how to demote the leader.'));
        return;
      }
      adminClubLeadershipService.demoteLeader(
        req.user!.userId,
        clubId,
        String(req.body.member_id ?? ''),
        mode,
        String(req.body.reason ?? ''),
      );
      res.redirect(303, `/admin/clubs/${clubId}/leadership`);
    } catch (err) {
      if (err instanceof ValidationError || err instanceof NotFoundError) {
        renderDetailError(res, next, clubId, err);
        return;
      }
      handleControllerError(err, res, next, 'admin club leadership controller');
    }
  },
};
