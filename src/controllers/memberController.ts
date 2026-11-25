import { Request, Response, NextFunction } from 'express';
import { nextPendingWizardHref } from '../middleware/auth';
import { memberService, isVouchOutcome, ProfileEditInput, AVATAR_BANNER_NAME_MAX_LEN, type VouchOutcome } from '../services/memberService';
import { outcomeNotice, type OutcomeNoticeView } from '../lib/outcomeNotice';
import { getDefaultAccountDeletionService } from '../services/accountDeletionService';
import { memberDataExportService } from '../services/memberDataExportService';
import { AVATAR_MAX_BYTES, AVATAR_TOO_LARGE_MESSAGE, getDefaultAvatarService } from '../services/avatarService';
import { identityAccessService } from '../services/identityAccessService';
import { ImageProcessingError } from '../adapters/imageProcessingAdapter';
import { clearSessionCookie, issueSessionCookie } from '../lib/sessionCookie';
import { ConflictError, RateLimitedError, ServiceUnavailableError, ValidationError, NotFoundError } from '../services/serviceErrors';
import { paymentService } from '../services/paymentService';
import { PageViewModel } from '../types/page';
import { FLASH_KIND, writeFlash, readFlash, clearFlash, takeFlash } from '../lib/flashCookie';
import { renderImageWorkerUnavailable, renderInvalidRequest, renderNotFound, renderRateLimited, renderServiceUnavailable, setRetryAfter } from '../lib/controllerErrors';
import { statusForPage } from '../lib/searchRefusal';
import { isAdminCaller, isOwnMemberRoute } from '../lib/routeOwnership';
import { readMultipart, type ParsedMultipart } from '../lib/multipartForm';

interface MemberPasswordEditContent {
  memberKey: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

import { logger } from '../config/logger';
import { isSafePath } from '../lib/safePath';
import { z } from 'zod';
import { parseFormBody, formText, formOptionalText, formList, formCheckbox } from '../lib/parseFormBody';

// The tier purchase button. Each field may instead arrive on the query string.
const purchaseTierForm = z.object({
  tier: formOptionalText('Membership tier'),
  returnTo: formOptionalText('The page to return to'),
});

const passwordEditForm = z.object({
  oldPassword: formText('Current password'),
  newPassword: formText('New password'),
  confirmPassword: formText('Confirm new password'),
});

// The account-deletion confirmation. A bare post without `confirmed` is someone
// who has not read the screen yet.
const deleteAccountForm = z.object({
  confirmed: formOptionalText('Confirmation'),
  recurringDonation: formOptionalText('Your recurring donation'),
});

// The profile edit form. Each checkbox keeps the default it has always had
// when absent; the link inputs repeat, one label and one URL per slot.
const profileEditForm = z.object({
  bio: formText('Bio'),
  city: formText('City'),
  region: formText('State or province'),
  country: formText('Country'),
  phone: formText('Phone'),
  whatsapp: formText('WhatsApp'),
  emailVisibility: formOptionalText('Contact email visibility'),
  phoneVisible: formCheckbox('Show my phone to logged-in members', '0'),
  whatsappVisible: formCheckbox('Show my WhatsApp to logged-in members', '0'),
  searchable: formCheckbox('Allow other members to find me in member search', '0'),
  firstCompetitionYear: formText('First year of competition'),
  birthDay: formText('Day of birth'),
  birthMonth: formText('Month of birth'),
  birthYear: formText('Year of birth'),
  showCompetitiveResults: formCheckbox('Show competitive results on my public profile', '1'),
  showFirstCompetitionYear: formCheckbox('Show first competition year on my public profile', '0'),
  showGender: formCheckbox('Show my gender on my public profile', '0'),
  gender: formText('Gender'),
  link_label: formList('Link label'),
  link_url: formList('Link URL'),
});

function profileEditInput(fields: z.output<typeof profileEditForm>): ProfileEditInput {
  const { link_label: labels, link_url: urls, emailVisibility, ...rest } = fields;
  const links: Array<{ label: string; url: string }> = [];
  for (let i = 0; i < Math.max(labels.length, urls.length); i += 1) {
    links.push({ label: labels[i] ?? '', url: urls[i] ?? '' });
  }
  return { ...rest, emailVisibility: emailVisibility ?? 'private', links };
}

// What a refused profile edit hands back to the form: every field that arrived
// in a shape the form sends, read the same way a save reads it. The refused
// fields are left out and show as blank beside their messages.
function keptProfileInput(
  refusal: { fieldErrors: Record<string, string>; submitted: Partial<Record<string, string>>; submittedLists: Partial<Record<string, string[]>> },
): ProfileEditInput | undefined {
  const kept: Record<string, string | string[] | undefined> = { ...refusal.submitted, ...refusal.submittedLists };
  for (const key of Object.keys(refusal.fieldErrors)) delete kept[key];
  const reread = profileEditForm.safeParse(kept);
  return reread.success ? profileEditInput(reread.data) : undefined;
}

export const memberController = {
  /** GET /members/:memberKey: own profile, any member profile for a
   * member viewer, or the HoF/BAP public read-only exception for
   * anonymous visitors (others redirect to login). A profile page exists only
   * once its owner is a member: a prospective member is routed to their next
   * wizard task in place of their own page. An unknown, erased or pending slug
   * answers exactly as a real non-honoree's does: a signed-out visitor is sent
   * to sign in, and a signed-in viewer gets not-found. */
  getProfile(req: Request, res: Response, next: NextFunction): void {
    const memberKey = req.params.memberKey;

    if (isOwnMemberRoute(req)) {
      if (!req.isMember) {
        res.redirect(303, nextPendingWizardHref(req.user!.userId));
        return;
      }
      try {
        const flash = readFlash(req);
        let profileNotice: string | undefined;
        let clubActionNotice: OutcomeNoticeView | null | undefined;
        if (flash?.kind === FLASH_KIND.PROFILE_UPDATED) {
          profileNotice = flash.payload || 'Profile updated.';
          clearFlash(res, req);
        } else if (flash?.kind === FLASH_KIND.CLUB_ACTION || flash?.kind === FLASH_KIND.EVENT_ACTION) {
          // Leaving a club, swapping the primary, stepping down as co-leader,
          // parking or reactivating a club, and stepping down as an event
          // organizer all land here, so this page is the one that has to say
          // how they went. Cleared whatever the
          // payload turns out to be: a note left behind in the cookie surfaces
          // on the next club page the member opens, telling them something
          // happened there that happened somewhere else.
          clubActionNotice = outcomeNotice(flash.payload);
          clearFlash(res, req);
        }
        const query = typeof req.query.q === 'string' ? req.query.q : undefined;
        const vm = memberService.getOwnProfile(memberKey, {
          query,
          notice: profileNotice,
          clubActionNotice,
          ip: req.ip,
        });
        res.status(statusForPage(res, vm, 200)).render('members/profile', vm);
      } catch (err) {
        if (err instanceof NotFoundError) { renderNotFound(res); return; }
        logger.error('member profile error', { error: err instanceof Error ? err.message : String(err) });
        next(err);
      }
      return;
    }

    try {
      // The vouch the viewer has just given, if they came here from one. The
      // payload is whatever was in the cookie, so it is narrowed before the
      // service is asked to turn it into a sentence.
      const flash = readFlash(req);
      let vouchOutcome: VouchOutcome | undefined;
      if (flash?.kind === FLASH_KIND.VOUCH_RESULT) {
        vouchOutcome =
          flash.payload && isVouchOutcome(flash.payload) ? flash.payload : undefined;
        clearFlash(res, req);
      }
      // Member enhancement keys off membership, not bare authentication: a
      // prospective member reads this page as an anonymous visitor. The
      // viewer's member id decides only whether this page offers them the vouch.
      const publicVm = memberService.getMemberProfilePage(
        memberKey,
        {
          authenticated: req.isMember,
          memberId: req.user?.userId ?? null,
        },
        vouchOutcome ? { vouchOutcome } : undefined,
      );
      if (publicVm) {
        res.render('members/public-profile', publicVm);
        return;
      }
    } catch (err) {
      // A signed-out visitor falls through to the sign-in redirect below, the
      // same answer a hidden profile gets, so the response never says whether
      // an address belongs to anyone.
      if (!(err instanceof NotFoundError)) {
        logger.error('member public profile error', { error: err instanceof Error ? err.message : String(err) });
        next(err);
        return;
      }
      if (req.isAuthenticated) { renderNotFound(res); return; }
    }

    if (!req.isAuthenticated) {
      res.redirect(302, `/login?returnTo=${encodeURIComponent(req.originalUrl)}`);
      return;
    }

    renderNotFound(res);
  },

  /** GET /members/:memberKey/edit */
  getProfileEdit(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    try {
      const avatarUploadedName = takeFlash(req, res, FLASH_KIND.AVATAR_UPLOADED) ?? undefined;
      const vm = memberService.getProfileEditPage(req.params.memberKey, { avatarUploadedName });
      res.render('members/profile-edit', vm);
    } catch (err) {
      if (err instanceof NotFoundError) { renderNotFound(res); return; }
      logger.error('member profile edit error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  /** GET /members/:memberKey/download
   *  The signed-in member's own data, built and returned in this response. A
   *  read: it writes nothing, so a repeat or a prefetch is harmless. */
  getDataExportDownload(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) { renderNotFound(res); return; }
    try {
      const out = memberDataExportService.getExportBody(req.user!.userId);
      res.setHeader('Content-Type', `${out.contentType}; charset=utf-8`);
      res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
      res.send(out.body);
    } catch (err) {
      if (err instanceof NotFoundError) { renderNotFound(res); return; }
      next(err);
    }
  },

  /** GET /members/:memberKey/delete */
  getDeleteAccount(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) { renderNotFound(res); return; }
    try {
      res.render('members/delete-account', memberService.getAccountDeletionPage(req.params.memberKey));
    } catch (err) {
      if (err instanceof NotFoundError) { renderNotFound(res); return; }
      next(err);
    }
  },

  /** POST /members/:memberKey/delete */
  async postDeleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnMemberRoute(req)) { renderNotFound(res); return; }
    const memberKey = req.params.memberKey;
    const parsed = parseFormBody(deleteAccountForm, req.body);
    if (!parsed.ok) {
      res.status(422).render('members/delete-account', memberService.getAccountDeletionPage(memberKey, {
        refusal: { message: parsed.message, fieldErrors: parsed.fieldErrors },
      }));
      return;
    }
    // The confirmation screen posts back to itself carrying the hidden field, so
    // a bare POST is someone who has not read it yet and gets it now.
    if (parsed.data.confirmed !== '1') {
      res.render('members/delete-account', memberService.getAccountDeletionPage(memberKey));
      return;
    }
    try {
      const result = await getDefaultAccountDeletionService().requestAccountDeletion({
        memberId: req.user!.userId,
        recurringDonationChoice: parsed.data.recurringDonation === 'cancel' ? 'cancel' : 'keep',
      });
      // A deletion that already landed (two overlapping submits) is the same
      // outcome as the first, so it gets the same done page.
      if (result.status !== 'deleted' && result.status !== 'already_deleted') {
        res.status(422).render(
          'members/delete-account',
          memberService.getAccountDeletionPage(memberKey, { notice: result.status === 'not_found' ? 'already_deleted' : result.status }),
        );
        return;
      }
      // No redirect and no flash: every member page now answers not-found for
      // this visitor, so there is nowhere to send them. The cookie goes first so
      // the browser is not left holding a session for an account that is gone.
      clearSessionCookie(res, req);
      res.render('members/delete-account-done', memberService.getAccountDeletionDonePage(result.graceDays));
    } catch (err) {
      if (err instanceof NotFoundError) { renderNotFound(res); return; }
      if (err instanceof RateLimitedError) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
        renderRateLimited(res, { title: 'Too Many Attempts' });
        return;
      }
      next(err);
    }
  },

  /** POST /members/:memberKey/edit */
  async postProfileEdit(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    const memberKey = req.params.memberKey;
    try {
      const parsed = parseFormBody(profileEditForm, req.body);
      if (!parsed.ok) {
        const vm = memberService.getProfileEditPage(memberKey, {
          error: parsed.message,
          fieldErrors: parsed.fieldErrors,
          submitted: keptProfileInput(parsed),
        });
        res.status(422).render('members/profile-edit', vm);
        return;
      }
      const input = profileEditInput(parsed.data);
      try {
        await memberService.updateOwnProfile(memberKey, input);
        writeFlash(res, req, FLASH_KIND.PROFILE_UPDATED);
        res.redirect(303, `/members/${memberKey}`);
      } catch (err) {
        // Both re-renders hand back what was submitted, so the member fixes the
        // one field the message names without retyping the rest of the form.
        if (err instanceof ValidationError) {
          const vm = memberService.getProfileEditPage(memberKey, { error: err.message, submitted: input });
          res.status(422).render('members/profile-edit', vm);
          return;
        }
        if (err instanceof RateLimitedError) {
          if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
          const vm = memberService.getProfileEditPage(memberKey, { error: err.message, submitted: input });
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
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }

    const memberKey = req.params.memberKey;
    const memberId = req.user!.userId;

    const renderError = (msg: string, status = 422) => {
      const vm = memberService.getProfileEditPage(memberKey, { avatarError: msg });
      res.status(status).render('members/profile-edit', vm);
    };

    const onParsed = ({ files, limitExceeded }: ParsedMultipart): void => {
      if (limitExceeded) {
        renderError(AVATAR_TOO_LARGE_MESSAGE);
        return;
      }
      const file = Object.values(files).flat()[0];
      if (!file || file.buffer.length === 0) {
        renderError('Please select an image file to upload.');
        return;
      }

      const fileBuffer = file.buffer;
      const uploadedFilename = file.filename.slice(0, AVATAR_BANNER_NAME_MAX_LEN);
      const avatarService = getDefaultAvatarService();

      avatarService.uploadAvatar(memberId, req.user!.slug, fileBuffer, uploadedFilename, {
        actorIsAdmin: isAdminCaller(req),
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
            renderImageWorkerUnavailable(res, 'avatar upload: image worker unavailable', err);
            return;
          }
          logger.error('avatar upload error', { error: err instanceof Error ? err.message : String(err) });
          next(err);
        });
    };

    readMultipart(
      req,
      // fields: 0 because the avatar form posts only the file input; busboy
      // would otherwise buffer up to ~100 flooded field parts before rejecting.
      { limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0 } },
      onParsed,
      (err) => {
        logger.error('busboy parse error', { error: err.message });
        next(err);
      },
    );
  },

  /** GET /members/:memberKey/edit/password, password-change form (own profile only). */
  getPasswordEdit(req: Request, res: Response): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    // The change redirects here, so this page is the one that reports it.
    const flash = readFlash(req);
    const success = flash?.kind === FLASH_KIND.PASSWORD_CHANGED;
    if (success) clearFlash(res, req);
    res.render('members/password-edit', {
      seo:  { title: 'Change Password' },
      page: { sectionKey: 'members', pageKey: 'member_password', title: 'Change Password' },
      navigation: {
        contextLinks: [{ label: 'Back to My Profile', href: `/members/${req.params.memberKey}` }],
      },
      content: { memberKey: req.params.memberKey, success },
    } satisfies PageViewModel<MemberPasswordEditContent>);
  },

  /** POST /members/:memberKey/edit/password, apply password change. */
  async postPasswordEdit(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    const memberId = req.user!.userId;

    const renderForm = (opts: { error: string; status: number; fieldErrors?: Record<string, string> }) => {
      res.status(opts.status).render('members/password-edit', {
        seo:  { title: 'Change Password' },
        page: { sectionKey: 'members', pageKey: 'member_password', title: 'Change Password' },
        navigation: {
          contextLinks: [{ label: 'Back to My Profile', href: `/members/${req.params.memberKey}` }],
        },
        content: { error: opts.error, fieldErrors: opts.fieldErrors, memberKey: req.params.memberKey },
      } satisfies PageViewModel<MemberPasswordEditContent>);
    };

    const parsed = parseFormBody(passwordEditForm, req.body);
    if (!parsed.ok) {
      renderForm({ error: parsed.message, status: 422, fieldErrors: parsed.fieldErrors });
      return;
    }
    const { oldPassword, newPassword, confirmPassword } = parsed.data;

    try {
      const result = await identityAccessService.changePassword(memberId, oldPassword, newPassword, confirmPassword);
      // Set the replacement session cookie so this browser stays signed in. The
      // service signed it before committing the change, so by the time we get
      // here the token is guaranteed to exist and to carry the new version.
      // Other devices, still on the old version, are rejected by the auth
      // middleware's per-request check. A re-post of a change that already
      // landed changes nothing and needs no new cookie, unless it overlapped
      // the change itself: then it carries the session for the version the
      // change committed, because the browser may keep this response's cookies
      // rather than the change's.
      if (result.sessionJwt) issueSessionCookie(res, result.sessionJwt, req, { archiveAccess: req.isMember });
      writeFlash(res, req, FLASH_KIND.PASSWORD_CHANGED);
      res.redirect(303, `/members/${encodeURIComponent(req.params.memberKey)}/edit/password`);
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
      if (err instanceof ConflictError) {
        // Another session changed this member's password first, so the change
        // was abandoned rather than applied on top of an unknown current state.
        renderForm({ error: err.message, status: 422 });
        return;
      }
      if (err instanceof ServiceUnavailableError) {
        // A dependency the change depends on (session signing, the notification
        // outbox) was unavailable, so nothing was committed. The member is still
        // signed in on their old password and can simply try again.
        setRetryAfter(res);
        renderForm({
          error:
            'We could not complete the password change, so your password was not changed and you are still signed in. Please try again in a moment.',
          status: 503,
        });
        return;
      }
      next(err);
    }
  },

  async postPurchaseTier(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!isOwnMemberRoute(req)) { renderNotFound(res); return; }
    const parsed = parseFormBody(purchaseTierForm, req.body);
    if (!parsed.ok) {
      // The purchase form is a single button carrying hidden fields, so there
      // is nothing typed to keep: the generic page names what was refused.
      renderInvalidRequest(res, { title: parsed.message });
      return;
    }
    const queryTier = typeof req.query.tier === 'string' ? req.query.tier : '';
    const tier = parsed.data.tier ?? queryTier;
    const rawReturnTo =
      parsed.data.returnTo !== undefined ? parsed.data.returnTo
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
        renderInvalidRequest(res, { title: err.message });
        return;
      }
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) {
          res.setHeader('Retry-After', String(err.retryAfterSeconds));
        }
        renderRateLimited(res, { title: 'Too Many Attempts', detail: err.message });
        return;
      }
      // Payment kill-switch (payments_paused) and any transient payment-service
      // unavailability render the truthful 503 page rather than a stack-trace 500.
      if (err instanceof ServiceUnavailableError) {
        renderServiceUnavailable(res);
        return;
      }
      next(err);
    }
  },
};
