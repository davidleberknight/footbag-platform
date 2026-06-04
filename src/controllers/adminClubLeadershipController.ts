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
        req.body.role === 'leader' ? 'leader' : 'co-leader',
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
      adminClubLeadershipService.demoteLeader(
        req.user!.userId,
        clubId,
        String(req.body.member_id ?? ''),
        req.body.mode === 'remove_affiliation' ? 'remove_affiliation' : 'to_member',
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

  /** POST /admin/clubs/:clubId/leadership/contact */
  contact(req: Request, res: Response, next: NextFunction): void {
    const clubId = req.params.clubId ?? '';
    try {
      adminClubLeadershipService.updateContactEmail(
        req.user!.userId,
        clubId,
        String(req.body.contact_email ?? ''),
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
