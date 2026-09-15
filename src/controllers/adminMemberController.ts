import type { Request, Response, NextFunction } from 'express';
import { adminMemberService } from '../services/adminMemberService';
import type { ProfileEditInput } from '../services/memberService';
import { NotFoundError, ValidationError, ConflictError } from '../services/serviceErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { handleControllerError } from '../lib/controllerErrors';

const CONTEXT = 'admin member controller';

function bodyValue(req: Request, field: string): string {
  return String(req.body?.[field] ?? '');
}

function bodyArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v ?? ''));
  if (value === undefined || value === null) return [];
  return [String(value)];
}

/**
 * The submitted profile, in the shape the member service takes.
 *
 * The field names are the member's own form's, deliberately: one submission
 * shape means one assembler and one set of names for the same fields, whichever
 * surface posted them. The biography is absent because an administrator never
 * supplies one; the service carries the stored text through untouched.
 */
function profileInputFrom(req: Request): ProfileEditInput {
  const labels = bodyArray(req.body?.link_label);
  const urls   = bodyArray(req.body?.link_url);
  const links: Array<{ label: string; url: string }> = [];
  for (let i = 0; i < Math.max(labels.length, urls.length); i += 1) {
    links.push({ label: labels[i] ?? '', url: urls[i] ?? '' });
  }
  return {
    bio:                      '',
    city:                     bodyValue(req, 'city'),
    region:                   bodyValue(req, 'region'),
    country:                  bodyValue(req, 'country'),
    phone:                    bodyValue(req, 'phone'),
    whatsapp:                 bodyValue(req, 'whatsapp'),
    emailVisibility:          bodyValue(req, 'emailVisibility') || 'private',
    phoneVisible:             bodyValue(req, 'phoneVisible'),
    whatsappVisible:          bodyValue(req, 'whatsappVisible'),
    searchable:               bodyValue(req, 'searchable'),
    firstCompetitionYear:     bodyValue(req, 'firstCompetitionYear'),
    birthDay:                 bodyValue(req, 'birthDay'),
    birthMonth:               bodyValue(req, 'birthMonth'),
    birthYear:                bodyValue(req, 'birthYear'),
    showCompetitiveResults:   bodyValue(req, 'showCompetitiveResults'),
    showFirstCompetitionYear: bodyValue(req, 'showFirstCompetitionYear'),
    showGender:               bodyValue(req, 'showGender'),
    gender:                   bodyValue(req, 'gender'),
    links,
  };
}

/**
 * Re-render the member record carrying the error, so a refused correction
 * comes back on the page the administrator was working on with the record
 * still in front of them. An unknown member id is a 404; a fixable submission
 * is a 422.
 */
function renderRecordError(
  res: Response,
  memberId: string,
  err: NotFoundError | ValidationError | ConflictError,
  next: NextFunction,
): void {
  if (err instanceof NotFoundError) {
    handleControllerError(err, res, next, CONTEXT);
    return;
  }
  res.status(422).render(
    'admin/members/record',
    adminMemberService.getMemberRecordPage(memberId, { errorMessage: err.message }),
  );
}

function isHandled(err: unknown): err is NotFoundError | ValidationError | ConflictError {
  return err instanceof NotFoundError
    || err instanceof ValidationError
    || err instanceof ConflictError;
}

export const adminMemberController = {
  /** GET /admin/members */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const query = typeof req.query['q'] === 'string' ? req.query['q'] : '';
      res.render('admin/members/index', adminMemberService.getMemberLookupPage(query));
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** GET /admin/members/:memberId */
  record(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let outcome: string | null = null;
      if (flash?.kind === FLASH_KIND.MEMBER_RECORD_CORRECTED) {
        outcome = flash.payload ?? null;
        clearFlash(res, req);
      }
      res.render(
        'admin/members/record',
        adminMemberService.getMemberRecordPage(req.params['memberId'] ?? '', { outcome }),
      );
    } catch (err) {
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/name */
  previewName(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      res.render('admin/members/confirm', adminMemberService.previewNameCorrection(
        memberId,
        {
          givenNames:  bodyValue(req, 'given_names'),
          familyName:  bodyValue(req, 'family_name'),
          displayName: bodyValue(req, 'display_name'),
        },
        bodyValue(req, 'reason'),
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/name/confirm */
  confirmName(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      const outcome = adminMemberService.applyNameCorrection(
        req.user!.userId,
        memberId,
        {
          givenNames:  bodyValue(req, 'given_names'),
          familyName:  bodyValue(req, 'family_name'),
          displayName: bodyValue(req, 'display_name'),
        },
        bodyValue(req, 'reason'),
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/slug */
  previewSlug(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      res.render('admin/members/confirm', adminMemberService.previewSlugCorrection(
        memberId, bodyValue(req, 'slug'), bodyValue(req, 'reason'),
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/slug/confirm */
  confirmSlug(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      const outcome = adminMemberService.applySlugCorrection(
        req.user!.userId, memberId, bodyValue(req, 'slug'), bodyValue(req, 'reason'),
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/tier */
  previewTier(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      res.render('admin/members/confirm', adminMemberService.previewTierChange(
        memberId, bodyValue(req, 'tier'), bodyValue(req, 'reason'),
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/tier/confirm */
  confirmTier(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      const outcome = adminMemberService.applyTierChange(
        req.user!.userId, memberId, bodyValue(req, 'tier'), bodyValue(req, 'reason'),
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /**
   * POST /admin/members/:memberId/deceased and .../deceased/revert
   *
   * Which of the two this is comes from the route registration rather than from
   * reading it back off the request path: a path can arrive with a trailing
   * slash, and inferring the action from its shape then flips it.
   */
  previewDeceased(reverting: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const memberId = req.params['memberId'] ?? '';
      try {
        res.render('admin/members/confirm', adminMemberService.previewDeceasedChange(
          memberId, reverting,
        ));
      } catch (err) {
        if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
        handleControllerError(err, res, next, CONTEXT);
      }
    };
  },

  /** POST /admin/members/:memberId/deceased/confirm and .../revert/confirm */
  confirmDeceased(reverting: boolean) {
    return (req: Request, res: Response, next: NextFunction): void => {
    const memberId = req.params['memberId'] ?? '';
    try {
      const outcome = adminMemberService.applyDeceasedChange(
        req.user!.userId, memberId, reverting,
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
    };
  },

  /** POST /admin/members/:memberId/active-player */
  previewActivePlayer(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      res.render('admin/members/confirm', adminMemberService.previewActivePlayerCorrection(
        memberId, bodyValue(req, 'expires_on'), bodyValue(req, 'reason'),
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/active-player/confirm */
  confirmActivePlayer(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      const outcome = adminMemberService.applyActivePlayerCorrection(
        req.user!.userId, memberId, bodyValue(req, 'expires_on'), bodyValue(req, 'reason'),
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/profile */
  async previewProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    const memberId = req.params['memberId'] ?? '';
    try {
      res.render('admin/members/confirm', await adminMemberService.previewProfileCorrection(
        memberId, profileInputFrom(req), bodyValue(req, 'reason'),
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/profile/confirm */
  async confirmProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    const memberId = req.params['memberId'] ?? '';
    try {
      const outcome = await adminMemberService.applyProfileCorrection(
        req.user!.userId, memberId, profileInputFrom(req), bodyValue(req, 'reason'),
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/avatar/remove */
  previewAvatarRemoval(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    try {
      res.render('admin/members/confirm', adminMemberService.previewAvatarRemoval(
        memberId, bodyValue(req, 'reason'),
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/avatar/remove/confirm */
  async confirmAvatarRemoval(req: Request, res: Response, next: NextFunction): Promise<void> {
    const memberId = req.params['memberId'] ?? '';
    try {
      const outcome = await adminMemberService.applyAvatarRemoval(
        req.user!.userId, memberId, bodyValue(req, 'reason'),
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },
};
