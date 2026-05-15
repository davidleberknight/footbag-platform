import { Request, Response, NextFunction } from 'express';
import { contactRequestService, CONTACT_CATEGORIES, CONTACT_CATEGORY_LABELS } from '../services/contactRequestService';
import { RateLimitedError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { PageViewModel } from '../types/page';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';

function isOwnProfile(req: Request): boolean {
  return req.user?.slug === req.params.memberKey;
}

function renderNotFound(res: Response): void {
  res.status(404).render('errors/not-found', {
    seo:  { title: 'Page Not Found' },
    page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
  });
}

interface ContactAdminContent {
  memberKey: string;
  formAction: string;
  cancelHref: string;
  categories: { value: string; label: string }[];
  prefilledCategory: string;
  prefilledMessage: string;
  errorMessage: string | null;
  successFlag: boolean;
}

function buildViewModel(
  req: Request,
  opts: {
    errorMessage?: string;
    prefilledCategory?: string;
    prefilledMessage?: string;
    successFlag?: boolean;
  } = {},
): PageViewModel<ContactAdminContent> {
  const memberKey = req.params.memberKey;
  return {
    seo:  { title: 'Contact IFPA admin' },
    page: { sectionKey: 'members', pageKey: 'member_contact_admin', title: 'Contact IFPA admin' },
    navigation: {
      contextLinks: [{ label: 'Back to Edit Profile', href: `/members/${memberKey}/edit` }],
    },
    content: {
      memberKey,
      formAction: `/members/${memberKey}/contact-admin`,
      cancelHref: `/members/${memberKey}/edit`,
      categories: CONTACT_CATEGORIES.map((c) => ({ value: c, label: CONTACT_CATEGORY_LABELS[c] })),
      prefilledCategory: opts.prefilledCategory ?? '',
      prefilledMessage:  opts.prefilledMessage  ?? '',
      errorMessage:      opts.errorMessage ?? null,
      successFlag:       opts.successFlag ?? false,
    },
  };
}

export const contactRequestController = {
  /** GET /members/:memberKey/contact-admin */
  getForm(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnProfile(req)) { renderNotFound(res); return; }
    try {
      const flash = readFlash(req);
      let successFlag = false;
      if (flash?.kind === FLASH_KIND.CONTACT_SUBMITTED) {
        successFlag = true;
        clearFlash(res);
      }
      const vm = buildViewModel(req, { successFlag });
      res.render('members/contact-admin', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'contact request controller');
    }
  },

  /** POST /members/:memberKey/contact-admin */
  postSubmit(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnProfile(req)) { renderNotFound(res); return; }
    const category = String(req.body?.category ?? '');
    const message = String(req.body?.message ?? '');
    try {
      contactRequestService.submit({
        requestingMemberId: req.user!.userId,
        category: category as never, // service validates
        message,
      });
      writeFlash(res, req, FLASH_KIND.CONTACT_SUBMITTED);
      res.redirect(303, `/members/${req.params.memberKey}/contact-admin`);
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = buildViewModel(req, {
          errorMessage: err.message,
          prefilledCategory: category,
          prefilledMessage: message,
        });
        res.status(422).render('members/contact-admin', vm);
        return;
      }
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) {
          res.setHeader('Retry-After', String(err.retryAfterSeconds));
        }
        const vm = buildViewModel(req, {
          errorMessage: err.message,
          prefilledCategory: category,
          prefilledMessage: message,
        });
        res.status(429).render('members/contact-admin', vm);
        return;
      }
      handleControllerError(err, res, next, 'contact request controller');
    }
  },
};
