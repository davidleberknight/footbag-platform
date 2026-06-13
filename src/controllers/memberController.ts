import { Request, Response, NextFunction } from 'express';
import Busboy from 'busboy';
import { memberService, ProfileEditInput } from '../services/memberService';
import { AVATAR_MAX_BYTES, getDefaultAvatarService } from '../services/avatarService';
import { identityAccessService } from '../services/identityAccessService';
import { ImageProcessingError } from '../adapters/imageProcessingAdapter';
import { createSessionJwt } from '../services/jwtService';
import { issueSessionCookie } from '../lib/sessionCookie';
import { ConflictError, RateLimitedError, ServiceUnavailableError, ValidationError, NotFoundError } from '../services/serviceErrors';
import { paymentService } from '../services/paymentService';
import { PageViewModel } from '../types/page';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { renderServiceUnavailable } from '../lib/controllerErrors';

interface MemberPasswordEditContent {
  memberKey: string;
  error?: string;
  success?: boolean;
}

type MemberStubContent = Record<string, never>;
import { logger } from '../config/logger';
import { isSafePath } from '../lib/safePath';

// Avatar-upload flash: filename display is capped so a maliciously long
// filename cannot blow out the banner. Cookie semantics live in lib/flashCookie.
const FLASH_NAME_MAX_LEN = 120;

interface StubConfig {
  pageKey: string;
  title: string;
}

const STUB_SEGMENTS: Record<string, StubConfig> = {
  media:    { pageKey: 'member_media',    title: 'Share Media' },
  settings: { pageKey: 'member_settings', title: 'Account Settings' },
  download: { pageKey: 'member_download', title: 'Download My Data' },
  delete:   { pageKey: 'member_delete',   title: 'Delete Account' },
};

function isOwnProfile(req: Request): boolean {
  return req.user?.slug === req.params.memberKey;
}

// Repeated form fields (e.g. three `link_label` inputs) arrive as an array;
// a single one arrives as a string. Normalize both to a string[].
function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? v : ''));
  if (typeof value === 'string') return [value];
  return [];
}

function renderNotFound(res: Response): void {
  res.status(404).render('errors/not-found', {
    seo:  { title: 'Page Not Found' },
    page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
  });
}

export const memberController = {
  /** GET /members, public informational landing (welcome + tier explainer). */
  landing(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = memberService.getMembersWelcomePage({ isAuthenticated: req.isAuthenticated });
      res.render('members/welcome', vm);
    } catch (err) {
      logger.error('members welcome error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /** GET /members/:memberKey: own profile, any member profile for an
   * authenticated viewer, or the HoF/BAP public read-only exception for
   * anonymous visitors (others redirect to login). */
  getProfile(req: Request, res: Response, next: NextFunction): void {
    const memberKey = req.params.memberKey;

    if (isOwnProfile(req)) {
      try {
        const flash = readFlash(req);
        let profileNotice: string | undefined;
        if (flash?.kind === FLASH_KIND.PROFILE_UPDATED) {
          profileNotice = flash.payload || 'Profile updated.';
          clearFlash(res, req);
        }
        const query = typeof req.query.q === 'string' ? req.query.q : undefined;
        const vm = memberService.getOwnProfile(memberKey, { query, notice: profileNotice });
        res.render('members/profile', vm);
      } catch (err) {
        if (err instanceof NotFoundError) { renderNotFound(res); return; }
        logger.error('member profile error', { error: err instanceof Error ? err.message : String(err) });
        next(err);
      }
      return;
    }

    try {
      const publicVm = memberService.getMemberProfilePage(memberKey, {
        authenticated: req.isAuthenticated,
      });
      if (publicVm) {
        res.render('members/public-profile', publicVm);
        return;
      }
    } catch (err) {
      if (err instanceof NotFoundError) { renderNotFound(res); return; }
      logger.error('member public profile error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
      return;
    }

    if (!req.isAuthenticated) {
      res.redirect(302, `/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
      return;
    }

    renderNotFound(res);
  },

  /** GET /members/:memberKey/edit */
  getProfileEdit(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnProfile(req)) {
      renderNotFound(res);
      return;
    }
    try {
      let avatarSuccess: string | undefined;
      const flash = readFlash(req);
      if (flash?.kind === FLASH_KIND.AVATAR_UPLOADED) {
        const name = flash.payload && flash.payload.length > 0
          ? flash.payload.slice(0, FLASH_NAME_MAX_LEN)
          : null;
        avatarSuccess = name ? `Avatar updated: ${name}` : 'Avatar updated.';
        clearFlash(res, req);
      }
      const vm = memberService.getProfileEditPage(
        req.params.memberKey,
        undefined,
        undefined,
        avatarSuccess,
      );
      res.render('members/profile-edit', vm);
    } catch (err) {
      if (err instanceof NotFoundError) { renderNotFound(res); return; }
      logger.error('member profile edit error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /** POST /members/:memberKey/edit */
  async postProfileEdit(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnProfile(req)) {
      renderNotFound(res);
      return;
    }
    const memberKey = req.params.memberKey;
    try {
      const linkLabels = coerceStringArray(req.body.link_label);
      const linkUrls   = coerceStringArray(req.body.link_url);
      const linkCount  = Math.max(linkLabels.length, linkUrls.length);
      const links: Array<{ label: string; url: string }> = [];
      for (let i = 0; i < linkCount; i += 1) {
        links.push({ label: linkLabels[i] ?? '', url: linkUrls[i] ?? '' });
      }
      const input: ProfileEditInput = {
        bio:             req.body.bio            ?? '',
        city:            req.body.city           ?? '',
        region:          req.body.region         ?? '',
        country:         req.body.country        ?? '',
        phone:           req.body.phone          ?? '',
        whatsapp:        req.body.whatsapp       ?? '',
        emailVisibility: req.body.emailVisibility ?? 'private',
        phoneVisible:    req.body.phoneVisible    ?? '0',
        whatsappVisible: req.body.whatsappVisible ?? '0',
        searchable:      req.body.searchable      ?? '0',
        firstCompetitionYear: req.body.firstCompetitionYear ?? '',
        showCompetitiveResults: req.body.showCompetitiveResults ?? '1',
        showFirstCompetitionYear: req.body.showFirstCompetitionYear ?? '0',
        sex:             req.body.sex            ?? '',
        links,
      };
      try {
        await memberService.updateOwnProfile(memberKey, input);
        writeFlash(res, req, FLASH_KIND.PROFILE_UPDATED);
        res.redirect(303, `/members/${memberKey}`);
      } catch (err) {
        if (err instanceof ValidationError) {
          const vm = memberService.getProfileEditPage(memberKey, err.message);
          res.status(422).render('members/profile-edit', vm);
          return;
        }
        if (err instanceof RateLimitedError) {
          if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
          const vm = memberService.getProfileEditPage(memberKey, err.message);
          res.status(429).render('members/profile-edit', vm);
          return;
        }
        throw err;
      }
    } catch (err) {
      logger.error('member profile edit post error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /** POST /members/:memberKey/avatar, handle avatar file upload. */
  postAvatarUpload(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnProfile(req)) {
      renderNotFound(res);
      return;
    }

    const memberKey = req.params.memberKey;
    const memberId = req.user!.userId;

    const renderError = (msg: string, status = 422) => {
      const vm = memberService.getProfileEditPage(memberKey, undefined, msg);
      res.status(status).render('members/profile-edit', vm);
    };

    const chunks: Buffer[] = [];
    let fileFound = false;
    let totalBytes = 0;
    let limitExceeded = false;
    let uploadedFilename = '';

    // fields: 0 because the avatar form posts only the file input; busboy
    // would otherwise buffer up to ~100 flooded field parts before rejecting.
    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0 },
    });

    busboy.on('file', (_fieldname, stream, info) => {
      fileFound = true;
      if (info && typeof info.filename === 'string') {
        uploadedFilename = info.filename.slice(0, FLASH_NAME_MAX_LEN);
      }
      stream.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > AVATAR_MAX_BYTES) {
          limitExceeded = true;
          stream.resume();
          return;
        }
        chunks.push(chunk);
      });
    });

    busboy.on('finish', () => {
      if (!fileFound || totalBytes === 0) {
        renderError('Please select an image file to upload.');
        return;
      }
      if (limitExceeded) {
        renderError('File is too large. Maximum size is 5 MB.');
        return;
      }

      const fileBuffer = Buffer.concat(chunks);
      const avatarService = getDefaultAvatarService();

      avatarService.uploadAvatar(memberId, req.user!.slug, fileBuffer, uploadedFilename, {
        actorIsAdmin: req.user?.role === 'admin',
      })
        .then(() => {
          writeFlash(res, req, FLASH_KIND.AVATAR_UPLOADED, uploadedFilename || undefined);
          res.redirect(303, `/members/${memberKey}/edit`);
        })
        .catch((err: unknown) => {
          if (err instanceof RateLimitedError) {
            if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
            renderError(err.message, 429);
            return;
          }
          if (err instanceof ValidationError) {
            renderError(err.message);
            return;
          }
          if (err instanceof ImageProcessingError) {
            // Image worker unreachable / misconfigured / overloaded. Surface
            // as a real 503 with the unavailable page instead of falling
            // through to the 500 handler. Operator log line above the render
            // still carries the detail.
            logger.error('avatar upload: image worker unavailable', {
              error: err.message,
              status: err.status,
            });
            renderServiceUnavailable(res);
            return;
          }
          logger.error('avatar upload error', { error: err instanceof Error ? err.message : String(err) });
          next(err);
        });
    });

    busboy.on('error', (err: Error) => {
      logger.error('busboy parse error', { error: err.message });
      next(err);
    });

    req.pipe(busboy);
  },

  /** GET /members/:memberKey/edit/password, password-change form (own profile only). */
  getPasswordEdit(req: Request, res: Response): void {
    if (!isOwnProfile(req)) {
      renderNotFound(res);
      return;
    }
    res.render('members/password-edit', {
      seo:  { title: 'Change Password' },
      page: { sectionKey: 'members', pageKey: 'member_password', title: 'Change Password' },
      navigation: {
        contextLinks: [{ label: 'Back to Profile', href: `/members/${req.params.memberKey}` }],
      },
      content: { memberKey: req.params.memberKey },
    } satisfies PageViewModel<MemberPasswordEditContent>);
  },

  /** POST /members/:memberKey/edit/password, apply password change. */
  async postPasswordEdit(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnProfile(req)) {
      renderNotFound(res);
      return;
    }
    const memberId = req.user!.userId;

    const renderForm = (opts: { error?: string; success?: boolean; status?: number }) => {
      res.status(opts.status ?? 200).render('members/password-edit', {
        seo:  { title: 'Change Password' },
        page: { sectionKey: 'members', pageKey: 'member_password', title: 'Change Password' },
        navigation: {
          contextLinks: [{ label: 'Back to Profile', href: `/members/${req.params.memberKey}` }],
        },
        content: { error: opts.error, success: opts.success, memberKey: req.params.memberKey },
      } satisfies PageViewModel<MemberPasswordEditContent>);
    };

    const { oldPassword, newPassword, confirmPassword } = req.body as {
      oldPassword?: string; newPassword?: string; confirmPassword?: string;
    };

    try {
      const result = await identityAccessService.changePassword(
        memberId,
        oldPassword ?? '',
        newPassword ?? '',
        confirmPassword ?? '',
      );
      // Re-issue the JWT cookie under the new passwordVersion so this browser
      // stays authenticated. Other sessions (older passwordVersion) are rejected
      // by the auth middleware's per-request DB check.
      //
      // Failure mode (KMS Sign error, IAM regression, KMS key rotation mid-flight):
      // the password change already committed at the DB layer (password_version
      // incremented). All existing sessions are now invalid by the per-request
      // password_version check. If we let the signing error fall through to the
      // 500 handler, the member sees a generic error and is locked out with no
      // recovery path visible. Catch and surface an actionable message pointing
      // at password reset (which goes through a separate JWT issuance flow).
      const role = req.user!.role;
      let cookieValue: string;
      try {
        cookieValue = await createSessionJwt(result.memberId, role, result.newPasswordVersion);
      } catch (jwtErr) {
        logger.error('password change: session reissue failed after password_version commit', {
          memberId: result.memberId,
          error: jwtErr instanceof Error ? jwtErr.message : String(jwtErr),
        });
        renderForm({
          error:
            'Your password was changed, but we could not re-issue your session. ' +
            'All existing sessions (including this one) are now invalid. ' +
            'Please use the Forgot password? link on the login page to reset and sign in again.',
          status: 503,
        });
        return;
      }
      issueSessionCookie(res, cookieValue, req);
      renderForm({ success: true });
    } catch (err) {
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
        renderForm({ error: err.message, status: 429 });
        return;
      }
      if (err instanceof ValidationError) {
        renderForm({ error: err.message, status: 422 });
        return;
      }
      if (err instanceof ServiceUnavailableError) {
        // Confirmation-email enqueue failed AFTER the password_version
        // increment committed (per identityAccessService.changePassword's
        // enqueueEmailOrFail call). All existing sessions are now invalid
        // by the per-request password_version check; the member must use
        // the password-reset flow to issue a fresh session.
        renderForm({
          error:
            'Your password was changed, but we could not enqueue the confirmation email and your session was not re-issued. ' +
            'All existing sessions (including this one) are now invalid. ' +
            'Please use the Forgot password? link on the login page to reset and sign in again.',
          status: 503,
        });
        return;
      }
      next(err);
    }
  },

  /** GET /members/:memberKey/:section, stub pages (own profile only). */
  getStub(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnProfile(req)) {
      renderNotFound(res);
      return;
    }
    const config = STUB_SEGMENTS[req.params.section];
    if (!config) {
      // Explicit 404 render rather than falling through to the Express
      // 404 handler. The non-owner branch above already does this; the
      // own-profile branch should behave symmetrically. Falling through
      // via next() risks a future route silently matching `/:section`.
      renderNotFound(res);
      return;
    }
    try {
      res.render('members/stub', {
        seo:  { title: config.title },
        page: { sectionKey: 'members', pageKey: config.pageKey, title: config.title },
        navigation: {
          contextLinks: [{ label: 'Back to Profile', href: `/members/${req.params.memberKey}` }],
        },
        content: {},
      } satisfies PageViewModel<MemberStubContent>);
    } catch (err) {
      next(err);
    }
  },

  async postPurchaseTier(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnProfile(req)) { renderNotFound(res); return; }
    const tier = String(req.body.tier ?? req.query.tier ?? '');
    const rawReturnTo =
      typeof req.body.returnTo === 'string' ? req.body.returnTo
      : typeof req.query.returnTo === 'string' ? req.query.returnTo
      : '';
    const returnTo = isSafePath(rawReturnTo) ? rawReturnTo : `/members/${req.params.memberKey}`;
    try {
      const result = await paymentService.startMembershipPurchase(
        req.user!.userId,
        tier,
        returnTo,
      );
      res.redirect(303, result.redirectUrl);
    } catch (err) {
      // ConflictError covers an already-pending membership purchase: an
      // ordinary user state, not a server fault, so it renders as 422
      // instead of falling through to the 500 handler.
      if (err instanceof ValidationError || err instanceof ConflictError) {
        res.status(422).render('errors/not-found', {
          seo:  { title: 'Invalid request' },
          page: { sectionKey: '', pageKey: 'error_422', title: err.message },
        });
        return;
      }
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) {
          res.setHeader('Retry-After', String(err.retryAfterSeconds));
        }
        res.status(429).render('errors/not-found', {
          seo:  { title: 'Too many requests' },
          page: { sectionKey: '', pageKey: 'error_429', title: err.message },
        });
        return;
      }
      next(err);
    }
  },
};
