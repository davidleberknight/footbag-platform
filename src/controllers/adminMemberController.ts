import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  adminMemberService,
  type MemberCorrectionForm,
  type MemberRecordRefusal,
} from '../services/adminMemberService';
import type { ProfileEditInput } from '../services/memberService';
import { NotFoundError, ValidationError, ConflictError } from '../services/serviceErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { handleControllerError } from '../lib/controllerErrors';
import { parseFormBody, formText, formList, type FormParse } from '../lib/parseFormBody';

const CONTEXT = 'admin member controller';

// Each correction's preview and its confirm post the same fields (the confirm
// page carries them as hidden inputs), so the two share one schema.
const nameForm = z.object({
  given_names: formText('Given names'),
  family_name: formText('Family name'),
  display_name: formText('Display name'),
  reason: formText('Reason'),
});

const slugForm = z.object({
  slug: formText('Profile URL'),
  reason: formText('Reason'),
});

const tierForm = z.object({
  tier: formText('Membership tier'),
  reason: formText('Reason'),
});

const activePlayerForm = z.object({
  expires_on: formText('Runs to the end of this date'),
  reason: formText('Reason'),
});

const reasonForm = z.object({
  reason: formText('Reason'),
});

// The profile correction. Its checkboxes have no hidden "0" beside them, so an
// unticked box is absent and reads as blank, which the save stores as unticked.
// The link inputs repeat, one label and one address per slot. The field names
// are the member's own form's, deliberately: one submission shape means one
// assembler and one set of names for the same fields, whichever surface posted
// them.
const profileForm = z.object({
  city: formText('City'),
  region: formText('State or province'),
  country: formText('Country'),
  phone: formText('Phone'),
  whatsapp: formText('WhatsApp'),
  emailVisibility: formText('Who can see the contact email'),
  phoneVisible: formText('Show the phone to members'),
  whatsappVisible: formText('Show WhatsApp to members'),
  searchable: formText('List in member search'),
  firstCompetitionYear: formText('First competition year'),
  birthDay: formText('Date of birth: day'),
  birthMonth: formText('Date of birth: month'),
  birthYear: formText('Date of birth: year'),
  showCompetitiveResults: formText('Show competition results'),
  showFirstCompetitionYear: formText('Show the first competition year'),
  showGender: formText('Show gender to members'),
  gender: formText('Gender'),
  link_label: formList('Link: what it is called'),
  link_url: formList('Link: address'),
  reason: formText('Reason'),
});

/**
 * The submitted profile, in the shape the member service takes. The biography
 * is absent because an administrator never supplies one; the service carries
 * the stored text through untouched. A blank contact-email setting reads as the
 * narrowest one.
 */
function profileInputFrom(fields: z.output<typeof profileForm>): ProfileEditInput {
  const { link_label: labels, link_url: urls, reason: _reason, emailVisibility, ...rest } = fields;
  const links: Array<{ label: string; url: string }> = [];
  for (let i = 0; i < Math.max(labels.length, urls.length); i += 1) {
    links.push({ label: labels[i] ?? '', url: urls[i] ?? '' });
  }
  return { ...rest, bio: '', emailVisibility: emailVisibility || 'private', links };
}

// What a refused profile correction hands back to the form: every field that
// arrived in a shape the form sends, read the same way a save reads it. The
// refused fields are left out and show as blank beside their messages.
function keptProfileInput(
  refusal: { fieldErrors: Record<string, string>; submitted: Partial<Record<string, string>>; submittedLists: Partial<Record<string, string[]>> },
): ProfileEditInput | undefined {
  const kept: Record<string, string | string[] | undefined> = { ...refusal.submitted, ...refusal.submittedLists };
  for (const key of Object.keys(refusal.fieldErrors)) delete kept[key];
  const reread = profileForm.safeParse(kept);
  return reread.success ? profileInputFrom(reread.data) : undefined;
}

/** The parsed fields, or the form's own refusal, answered like any fixable correction. */
function accepted<T>(parsed: FormParse<T>): T {
  if (!parsed.ok) throw new ValidationError(parsed.message, { fieldErrors: parsed.fieldErrors });
  return parsed.data;
}

/** What the record needs to bring a refused form back as the administrator typed it. */
function refusalOf<T extends object>(form: MemberCorrectionForm, parsed: FormParse<T>): MemberRecordRefusal {
  if (!parsed.ok) return { form, values: parsed.submitted };
  const values: Partial<Record<string, string>> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (typeof value === 'string') values[key] = value;
  }
  return { form, values };
}

function profileRefusal(parsed: FormParse<z.output<typeof profileForm>>): MemberRecordRefusal {
  return {
    ...refusalOf('profile', parsed),
    profile: parsed.ok ? profileInputFrom(parsed.data) : keptProfileInput(parsed),
  };
}

/**
 * Re-render the member record carrying the error, so a refused correction
 * comes back on the page the administrator was working on with the record
 * still in front of them and the form they filled in holding what they typed.
 * An unknown member id is a 404; a fixable submission is a 422.
 */
function renderRecordError(
  res: Response,
  memberId: string,
  err: NotFoundError | ValidationError | ConflictError,
  next: NextFunction,
  refusal?: MemberRecordRefusal,
): void {
  if (err instanceof NotFoundError) {
    handleControllerError(err, res, next, CONTEXT);
    return;
  }
  let page;
  try {
    page = adminMemberService.getMemberRecordPage(memberId, {
      errorMessage: err.message,
      ...(refusal
        ? { refusal: { ...refusal, fieldErrors: err instanceof ValidationError ? err.fieldErrors : undefined } }
        : {}),
    });
  } catch (pageErr) {
    // A form refused before the service ran can name a member that does not exist.
    handleControllerError(pageErr, res, next, CONTEXT);
    return;
  }
  res.status(422).render('admin/members/record', page);
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
    const parsed = parseFormBody(nameForm, req.body);
    try {
      const f = accepted(parsed);
      res.render('admin/members/confirm', adminMemberService.previewNameCorrection(
        memberId,
        { givenNames: f.given_names, familyName: f.family_name, displayName: f.display_name },
        f.reason,
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next, refusalOf('name', parsed)); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/name/confirm */
  confirmName(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    const parsed = parseFormBody(nameForm, req.body);
    try {
      const f = accepted(parsed);
      const outcome = adminMemberService.applyNameCorrection(
        req.user!.userId,
        memberId,
        { givenNames: f.given_names, familyName: f.family_name, displayName: f.display_name },
        f.reason,
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next, refusalOf('name', parsed)); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/slug */
  previewSlug(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    const parsed = parseFormBody(slugForm, req.body);
    try {
      const f = accepted(parsed);
      res.render('admin/members/confirm', adminMemberService.previewSlugCorrection(
        memberId, f.slug, f.reason,
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next, refusalOf('slug', parsed)); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/slug/confirm */
  confirmSlug(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    const parsed = parseFormBody(slugForm, req.body);
    try {
      const f = accepted(parsed);
      const outcome = adminMemberService.applySlugCorrection(
        req.user!.userId, memberId, f.slug, f.reason,
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next, refusalOf('slug', parsed)); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/tier */
  previewTier(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    const parsed = parseFormBody(tierForm, req.body);
    try {
      const f = accepted(parsed);
      res.render('admin/members/confirm', adminMemberService.previewTierChange(
        memberId, f.tier, f.reason,
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next, refusalOf('tier', parsed)); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/tier/confirm */
  confirmTier(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    const parsed = parseFormBody(tierForm, req.body);
    try {
      const f = accepted(parsed);
      const outcome = adminMemberService.applyTierChange(
        req.user!.userId, memberId, f.tier, f.reason,
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next, refusalOf('tier', parsed)); return; }
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
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const memberId = req.params['memberId'] ?? '';
    try {
      const outcome = await adminMemberService.applyDeceasedChange(
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

  /** POST /admin/members/:memberId/delete */
  previewDelete(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    const parsed = parseFormBody(reasonForm, req.body);
    try {
      res.render('admin/members/confirm', adminMemberService.previewAccountDeletion(
        memberId, accepted(parsed).reason,
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next, refusalOf('delete', parsed)); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/delete/confirm */
  async confirmDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
    const memberId = req.params['memberId'] ?? '';
    const parsed = parseFormBody(reasonForm, req.body);
    try {
      const outcome = await adminMemberService.applyAccountDeletion(
        req.user!.userId, memberId, accepted(parsed).reason,
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next, refusalOf('delete', parsed)); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/active-player */
  previewActivePlayer(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    const parsed = parseFormBody(activePlayerForm, req.body);
    try {
      const f = accepted(parsed);
      res.render('admin/members/confirm', adminMemberService.previewActivePlayerCorrection(
        memberId, f.expires_on, f.reason,
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next, refusalOf('activePlayer', parsed)); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/active-player/confirm */
  confirmActivePlayer(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    const parsed = parseFormBody(activePlayerForm, req.body);
    try {
      const f = accepted(parsed);
      const outcome = adminMemberService.applyActivePlayerCorrection(
        req.user!.userId, memberId, f.expires_on, f.reason,
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next, refusalOf('activePlayer', parsed)); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/profile */
  async previewProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    const memberId = req.params['memberId'] ?? '';
    const parsed = parseFormBody(profileForm, req.body);
    try {
      const f = accepted(parsed);
      res.render('admin/members/confirm', await adminMemberService.previewProfileCorrection(
        memberId, profileInputFrom(f), f.reason,
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next, profileRefusal(parsed)); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/profile/confirm */
  async confirmProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    const memberId = req.params['memberId'] ?? '';
    const parsed = parseFormBody(profileForm, req.body);
    try {
      const f = accepted(parsed);
      const outcome = await adminMemberService.applyProfileCorrection(
        req.user!.userId, memberId, profileInputFrom(f), f.reason,
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next, profileRefusal(parsed)); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/avatar/remove */
  previewAvatarRemoval(req: Request, res: Response, next: NextFunction): void {
    const memberId = req.params['memberId'] ?? '';
    const parsed = parseFormBody(reasonForm, req.body);
    try {
      res.render('admin/members/confirm', adminMemberService.previewAvatarRemoval(
        memberId, accepted(parsed).reason,
      ));
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next, refusalOf('avatar', parsed)); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },

  /** POST /admin/members/:memberId/avatar/remove/confirm */
  async confirmAvatarRemoval(req: Request, res: Response, next: NextFunction): Promise<void> {
    const memberId = req.params['memberId'] ?? '';
    const parsed = parseFormBody(reasonForm, req.body);
    try {
      const outcome = await adminMemberService.applyAvatarRemoval(
        req.user!.userId, memberId, accepted(parsed).reason,
      );
      writeFlash(res, req, FLASH_KIND.MEMBER_RECORD_CORRECTED, outcome);
      res.redirect(303, `/admin/members/${memberId}`);
    } catch (err) {
      if (isHandled(err)) { renderRecordError(res, memberId, err, next, refusalOf('avatar', parsed)); return; }
      handleControllerError(err, res, next, CONTEXT);
    }
  },
};
