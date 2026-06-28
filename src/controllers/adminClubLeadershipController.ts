import { Request, Response, NextFunction } from 'express';
import { adminClubLeadershipService } from '../services/adminClubLeadershipService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';

function renderDetailError(res: Response, clubId: string, err: ValidationError | NotFoundError): void {
  if (err instanceof NotFoundError) {
    res.status(404).render('admin/club-leadership/detail', adminClubLeadershipService.getClubLeadershipPage(clubId, { errorMessage: err.message }));
    return;
  }
  res.status(422).render('admin/club-leadership/detail', adminClubLeadershipService.getClubLeadershipPage(clubId, { errorMessage: err.message }));
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
        renderDetailError(res, clubId, err);
        return;
      }
      handleControllerError(err, res, next, 'admin club leadership controller');
    }
  },

  /** POST /admin/clubs/:clubId/leadership/demote */
  demote(req: Request, res: Response, next: NextFunction): void {
    const clubId = req.params.clubId ?? '';
    try {
      // The demote form offers exactly these two actions; reject anything else
      // rather than silently falling back to a demotion the admin did not pick.
      const mode = req.body.mode;
      if (mode !== 'to_member' && mode !== 'remove_affiliation') {
        renderDetailError(res, clubId, new ValidationError('Choose how to demote the leader.'));
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
        renderDetailError(res, clubId, err);
        return;
      }
      handleControllerError(err, res, next, 'admin club leadership controller');
    }
  },
};
