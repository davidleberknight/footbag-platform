import { Request, Response, NextFunction } from 'express';
import { clubService, COLEAD_CAP_VOLUNTEER_REFUSAL, NO_LEADER_JOIN_REFUSAL } from '../services/clubService';
import { locationPickers } from '../services/memberService';
import { ValidationError } from '../services/serviceErrors';
import { handleControllerError, renderImageWorkerUnavailable, renderInvalidRequest, renderNotFound } from '../lib/controllerErrors';
import { COVER_PHOTO_MISSING_MESSAGE, coverNoteAfterCreate, readCoverForm, type CoverForm } from '../lib/coverPhotoForm';
import { isAdminCaller } from '../lib/routeOwnership';
import { ImageProcessingError } from '../adapters/imageProcessingAdapter';
import { z } from 'zod';
import { parseFormBody, formText, formOptionalText } from '../lib/parseFormBody';

// The co-leaders' edit form on the club page. A field the form leaves out
// stays undefined, which the service reads as "leave it as it is".
const contentEditForm = z.object({
  name: formOptionalText('Club name'),
  description: formOptionalText('Description'),
  city: formOptionalText('City'),
  region: formOptionalText('Region / State'),
  external_url: formOptionalText('External URL'),
});

const createForm = z.object({
  name: formText('Club name'),
  description: formText('Description'),
  city: formText('City'),
  region: formText('Region / State'),
  country: formText('Country'),
  slug: formText('Club hashtag'),
  confirm_near_matches: formOptionalText('The confirmation that your club is distinct'),
});

// What the edit form sent, for the re-render: only the fields that arrived.
function keptEditValues(fields: z.output<typeof contentEditForm>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) kept[key] = value;
  }
  return kept;
}

// The confirm screens' buttons, and the primary-club switch.
const confirmForm = z.object({ confirmed: formOptionalText('The confirmation') });
const makePrimaryForm = z.object({ club_key: formOptionalText('The club') });
import { writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { FLASH_KIND } from '../lib/flashCookie';
import { redirectWithOutcome, type ActionEnding } from '../lib/actionOutcome';
import {
  outcomeNotice,
  outcomePayload,
  type OutcomeNoticeView,
  type OutcomeTone,
} from '../lib/outcomeNotice';

// Every club action redirects here and leaves its outcome in the flash cookie,
// so the club page is the surface that has to consume it. Taken once and
// cleared, because a notice that survived a reload would tell a visitor an
// action happened that did not happen on this request.
function takeActionNotice(req: Request, res: Response): OutcomeNoticeView | null {
  const flash = readFlash(req);
  if (flash?.kind !== FLASH_KIND.CLUB_ACTION) return null;
  clearFlash(res, req);
  return outcomeNotice(flash.payload);
}

function clubCoverOutcome(req: Request, res: Response, clubKey: string, branch: 'changed' | 'own_repeat' | 'already_held', text: string): void {
  const ending: ActionEnding = branch === 'changed' ? 'advance' : branch;
  redirectWithOutcome(req, res, { flash: FLASH_KIND.CLUB_ACTION, to: `/clubs/${encodeURIComponent(clubKey)}`, ending, text });
}

// The create form, read from either body. The club is created in its own
// transaction first; a chosen cover photo is uploaded after, and a refusal of
// the photo is added to the success message rather than undoing the club.
async function createClubFrom(req: Request, res: Response, form: CoverForm): Promise<void> {
  const parsed = form.fields ? parseFormBody(createForm, form.fields) : parseFormBody(createForm, req.body);
  const typed = parsed.ok ? parsed.data : parsed.submitted;
  const name = typed.name ?? '';
  const description = typed.description ?? '';
  const city = typed.city ?? '';
  const region = typed.region ?? '';
  const country = typed.country ?? '';
  const slug = typed.slug ?? '';
  const confirmNearMatches = typed.confirm_near_matches === '1';

  const club = { name, description, city, region, country, slug, confirmNearMatches };

  // A near match holds the club back for a second look rather than
  // refusing it, so that one prompt reads neutral; every other branch
  // refuses the create.
  const renderForm = (status: number, errorMessage: string, fieldErrors?: Record<string, string>, extra?: Record<string, unknown>, errorTone: OutcomeTone = 'no') => {
    res.status(status).render('clubs/create', {
      seo: { title: 'Create a Club' },
      page: { sectionKey: 'clubs', pageKey: 'clubs_create', title: 'Create a Club' },
      formAction: '/clubs/create',
      cancelHref: '/clubs',
      errorMessage,
      errorTone,
      fieldErrors,
      club,
      countryOptions: locationPickers(country, '').countryOptions,
      ...extra,
    });
  };

  if (!parsed.ok) {
    renderForm(422, parsed.message, parsed.fieldErrors);
    return;
  }

  let result;
  try {
    result = clubService.createClub(req.user!.userId, club);
  } catch (err) {
    if (err instanceof ValidationError) {
      renderForm(422, err.message, err.fieldErrors);
      return;
    }
    throw err;
  }

  switch (result.branch) {
    case 'created':
    case 'own_repeat': {
      const clubKey = result.clubKey;
      const uploader = { memberId: req.user!.userId, slug: req.user!.slug, isAdmin: isAdminCaller(req) };
      const coverNote = await coverNoteAfterCreate(
        form, (file) => clubService.uploadCoverPhoto(uploader, clubKey, file), "the club's page",
      );
      writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('ok',
        `Club created. Its hashtag is #${clubKey}: photos and videos carrying it appear in the club's gallery.` + coverNote));
      res.redirect(303, `/clubs/${encodeURIComponent(clubKey)}`);
      return;
    }
    case 'colead_cap_reached':
      renderForm(422, 'You already co-lead three clubs, the most a member can lead. To create a new club, step down at one of them first.');
      return;
    case 'affiliation_cap':
      renderForm(422, 'You are already in 3 clubs. Leave one before creating a new club.');
      return;
    case 'exact_name_exists':
      renderForm(422, `A club named "${result.existingClubName}" already exists in that country.`, undefined, {
        existingClubHref: `/clubs/${encodeURIComponent(result.existingClubKey)}`,
        existingClubName: result.existingClubName,
      });
      return;
    case 'exact_candidate_exists':
      renderForm(422, `A club named "${result.existingClubName}" already exists in that country.`);
      return;
    case 'near_matches_found':
      renderForm(422, 'A similarly named club may already exist in that country. Review the matches below; if your club is distinct, confirm and submit again.', undefined, {
        nearMatches: result.nearMatches,
      }, 'info');
      return;
    case 'tag_conflict':
      renderForm(422, `The hashtag ${result.tagNormalized} is already taken. Try adding something that sets your club apart, such as a neighbourhood or part of the club name.`);
      return;
    case 'slug_folded':
      renderForm(422, `Your club hashtag will be #club_${result.slug}. A club hashtag uses only the letters a to z, digits and underscores, so accented letters became plain ones and other characters became underscores. It is permanent, so check it, then press Create Club again.`, undefined, {
        club: { ...club, slug: result.slug },
      }, 'info');
      return;
  }
}

/**
 * Thin controller layer for the public Clubs routes.
 *
 * Responsibilities:
 *  - Parse route params
 *  - Call the appropriate ClubService method
 *  - Render the correct Handlebars template
 *  - Map service errors to HTTP status codes
 *
 * Business logic and page shaping live in ClubService, not here.
 */
export const clubController = {
  /**
   * GET /clubs
   * Clubs index: all countries with active clubs.
   */
  index(_req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = clubService.getPublicClubsIndexPage();
      res.render('clubs/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  /**
   * GET /clubs/:key
   * Service resolves key to club detail or country page.
   */
  byKey(req: Request, res: Response, next: NextFunction): void {
    try {
      // Member-visible roster, contact, and affiliation state key off
      // membership, not bare authentication: a pending registrant reads the
      // club page as an anonymous visitor.
      const result = clubService.resolveByKey(
        req.params.key,
        req.isMember,
        req.isMember ? req.user?.userId : undefined,
        { notice: takeActionNotice(req, res) },
      );
      res.render(result.template, result.vm);
    } catch (err) {
      // An old /clubs/<slug> link whose club did not survive normalization
      // falls through to the standard 404: the platform never constructs a
      // URL into the archive mirror's interior (the archive landing page is
      // the only archive URL it ever emits).
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  /** POST /clubs/:key/content/edit (leaders edit directly) */
  async postContentEdit(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parsed = parseFormBody(contentEditForm, req.body);
    try {
      if (!parsed.ok) {
        const vm = clubService.getPublicClubPage(
          req.params.key,
          req.isMember,
          req.user?.userId,
          { editErrors: parsed.fieldErrors, editValues: parsed.submitted as Record<string, string> },
        );
        res.status(422).render('clubs/detail', vm);
        return;
      }
      const clubId = clubService.resolveClubIdByKey(req.params.key);
      const fields = parsed.data;
      const ending = await clubService.editClubContentAsLeader(
        clubId,
        {
          name:        fields.name,
          description: fields.description,
          city:        fields.city,
          region:      fields.region,
          externalUrl: fields.external_url,
        },
        req.user!.userId,
      );
      redirectWithOutcome(req, res, {
        flash: FLASH_KIND.CLUB_ACTION,
        to: `/clubs/${encodeURIComponent(req.params.key)}`,
        ending,
        text: ending === 'already_held' ? 'Nothing to update.' : 'Club updated.',
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        // Re-render the club page carrying what was typed, so one bad field
        // does not cost the co-leader everything else in the form.
        const vm = clubService.getPublicClubPage(
          req.params.key,
          req.isMember,
          req.user?.userId,
          { editErrors: err.fieldErrors ?? { form: err.message }, editValues: parsed.ok ? keptEditValues(parsed.data) : null },
        );
        res.status(422).render('clubs/detail', vm);
        return;
      }
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  getCreate(_req: Request, res: Response): void {
    res.render('clubs/create', {
      seo: { title: 'Create a Club' },
      page: { sectionKey: 'clubs', pageKey: 'clubs_create', title: 'Create a Club' },
      formAction: '/clubs/create',
      cancelHref: '/clubs',
      club: { name: '', description: '', city: '', region: '', country: '', slug: '' },
      countryOptions: locationPickers('', '').countryOptions,
    });
  },

  /**
   * POST /clubs/create. Multipart when it carries a cover photo; the club is
   * created first, in its own transaction, and the photo uploaded after it, so
   * a refused photo leaves the club created and the message says so.
   */
  postCreate(req: Request, res: Response, next: NextFunction): void {
    readCoverForm(req, { isAdmin: isAdminCaller(req), maxTextFields: 20 }, (form) => {
      createClubFrom(req, res, form).catch((err: unknown) => handleControllerError(err, res, next, 'clubs controller'));
    }, (err) => next(err));
  },

  /** POST /clubs/:key/cover-photo: upload a photo and make it the club's cover. */
  postCoverPhoto(req: Request, res: Response, next: NextFunction): void {
    const clubKey = req.params.key;
    const uploader = { memberId: req.user!.userId, slug: req.user!.slug, isAdmin: isAdminCaller(req) };
    readCoverForm(req, { isAdmin: uploader.isAdmin, maxTextFields: 2 }, (form) => {
      const refuse = (change: { message: string; httpStatus: number; retryAfterSeconds?: number }): void => {
        if (change.retryAfterSeconds) res.setHeader('Retry-After', String(change.retryAfterSeconds));
        res.status(change.httpStatus).render('clubs/detail', clubService.getPublicClubPage(
          clubKey, req.isMember, uploader.memberId, { notice: { text: change.message, tone: 'no' } },
        ));
      };
      (async () => {
        if (form.tooLargeMessage || !form.file) {
          clubService.requireLedClub(clubKey, uploader.memberId);
          refuse({ message: form.tooLargeMessage ?? COVER_PHOTO_MISSING_MESSAGE, httpStatus: 422 });
          return;
        }
        const change = await clubService.uploadCoverPhoto(uploader, clubKey, form.file);
        if (change.branch === 'refused') { refuse(change); return; }
        clubCoverOutcome(req, res, clubKey, change.branch, 'Cover photo saved.');
      })().catch((err: unknown) => {
        if (err instanceof ImageProcessingError) { renderImageWorkerUnavailable(res, 'club cover photo: image worker unavailable', err); return; }
        handleControllerError(err, res, next, 'clubs controller');
      });
    }, (err) => next(err));
  },

  /** POST /clubs/:key/cover-photo/remove: clear the cover; the photo stays in the gallery. */
  postRemoveCoverPhoto(req: Request, res: Response, next: NextFunction): void {
    try {
      const clubKey = req.params.key;
      const change = clubService.removeCoverPhoto(req.user!.userId, clubKey);
      if (change.branch === 'refused') {
        redirectWithOutcome(req, res, { flash: FLASH_KIND.CLUB_ACTION, to: `/clubs/${encodeURIComponent(clubKey)}`, ending: 'refused', text: change.message });
        return;
      }
      clubCoverOutcome(req, res, clubKey, change.branch, 'Cover photo removed.');
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  postJoin(req: Request, res: Response, next: NextFunction): void {
    try {
      const clubId = clubService.resolveClubIdByKey(req.params.key);
      const result = clubService.joinClub(req.user!.userId, clubId);

      if (result.branch === 'club_not_found') {
        renderNotFound(res, { title: 'Club Not Found' });
        return;
      }
      if (result.branch === 'no_leader') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('no', NO_LEADER_JOIN_REFUSAL));
      } else if (result.branch === 'cap_reached') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('no', 'You are already in 3 clubs. Leave one before joining another.'));
      } else if (result.branch === 'already_member') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('info', 'You are already a member of this club.'));
      } else {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('ok', `Joined as your ${result.branch === 'joined_primary' ? 'primary' : 'secondary'} club.`));
      }
      res.redirect(303, `/clubs/${encodeURIComponent(req.params.key)}`);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  postLeave(req: Request, res: Response, next: NextFunction): void {
    try {
      const parsed = parseFormBody(confirmForm, req.body);
      if (!parsed.ok) { renderInvalidRequest(res, { title: parsed.message }); return; }
      const clubId = clubService.resolveClubIdByKey(req.params.key);
      const confirmed = parsed.data.confirmed === '1';
      const result = clubService.leaveClub(req.user!.userId, clubId, { confirmed });

      if (result.branch === 'needs_confirmation') {
        const key = encodeURIComponent(req.params.key);
        res.render('clubs/leave-confirm', {
          seo: { title: 'Leave Club' },
          page: { sectionKey: 'clubs', pageKey: 'clubs_leave_confirm', title: `Leave ${result.clubName}` },
          clubName: result.clubName,
          isSoleCoLeader: result.isSoleCoLeader,
          leaveHref: `/clubs/${key}/leave`,
          manageCoLeadersHref: `/clubs/${key}`,
          cancelHref: `/members/${encodeURIComponent(req.user!.slug)}`,
        });
        return;
      }

      // Not being in the club is the state a leave asks for, so it reads as
      // informational rather than refused.
      const endings: Record<typeof result.branch, [ActionEnding, string]> = {
        left:       ['advance',      'Left club.'],
        own_repeat: ['own_repeat',   'Left club.'],
        not_member: ['already_held', 'You are not a member of this club.'],
      };
      const [ending, text] = endings[result.branch];
      redirectWithOutcome(req, res, {
        flash: FLASH_KIND.CLUB_ACTION,
        to: `/members/${encodeURIComponent(req.user!.slug)}`,
        ending,
        text,
      });
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  postMakePrimary(req: Request, res: Response, next: NextFunction): void {
    try {
      const parsed = parseFormBody(makePrimaryForm, req.body);
      if (!parsed.ok) { renderInvalidRequest(res, { title: parsed.message }); return; }
      const targetClubKey = parsed.data.club_key ?? '';
      const result = clubService.makePrimaryAffiliation(req.user!.userId, targetClubKey);

      const endings: Record<typeof result.branch, [ActionEnding, string]> = {
        made_primary:     ['advance',      'Primary club changed.'],
        own_repeat:       ['own_repeat',   'Primary club changed.'],
        already_held:     ['already_held', 'This is already your primary club.'],
        not_member:       ['refused',      'You are not a member of this club.'],
        not_enough_clubs: ['refused',      'You need two clubs to choose a primary.'],
      };
      const [ending, text] = endings[result.branch];
      redirectWithOutcome(req, res, {
        flash: FLASH_KIND.CLUB_ACTION,
        to: `/members/${encodeURIComponent(req.user!.slug)}`,
        ending,
        text,
      });
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  postStepDown(req: Request, res: Response, next: NextFunction): void {
    try {
      const parsed = parseFormBody(confirmForm, req.body);
      if (!parsed.ok) { renderInvalidRequest(res, { title: parsed.message }); return; }
      const clubId = clubService.resolveClubIdByKey(req.params.key);
      const confirmed = parsed.data.confirmed === '1';
      const result = clubService.stepDownFromLeader(req.user!.userId, clubId, { confirmed });

      if (result.branch === 'needs_confirmation') {
        const key = encodeURIComponent(req.params.key);
        res.render('clubs/step-down-confirm', {
          seo: { title: 'Step Down as Co-leader' },
          page: { sectionKey: 'clubs', pageKey: 'clubs_step_down_confirm', title: `Step down from ${result.clubName}` },
          clubName: result.clubName,
          isSoleCoLeader: result.isSoleCoLeader,
          stepDownHref: `/clubs/${key}/step-down`,
          manageCoLeadersHref: `/clubs/${key}`,
          cancelHref: `/members/${encodeURIComponent(req.user!.slug)}`,
        });
        return;
      }

      const endings: Record<typeof result.branch, [ActionEnding, string]> = {
        stepped_down: ['advance',      'Stepped down from co-leading this club.'],
        own_repeat:   ['own_repeat',   'Stepped down from co-leading this club.'],
        not_leader:   ['already_held', 'You are not a co-leader of this club.'],
      };
      const [ending, text] = endings[result.branch];
      redirectWithOutcome(req, res, {
        flash: FLASH_KIND.CLUB_ACTION,
        to: `/members/${encodeURIComponent(req.user!.slug)}`,
        ending,
        text,
      });
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  postVolunteer(req: Request, res: Response, next: NextFunction): void {
    try {
      const clubId = clubService.resolveClubIdByKey(req.params.key);
      const result = clubService.volunteerToCoLeadClub(req.user!.userId, clubId);

      // Each branch carries its own tone: only one of them is the act
      // happening, one is the member already holding what they asked for, and
      // the rest are refusals that must not read like either.
      const messages: Record<string, [OutcomeTone, string]> = {
        volunteered:        ['ok',   'You are now a co-leader of this club.'],
        club_not_found:     ['no',   'Club not found.'],
        not_member:         ['no',   'Join this club before volunteering to co-lead it.'],
        not_eligible:       ['no',   'Co-leading requires Tier 1 IFPA Member benefits: a paid Tier 1 IFPA Member membership or a current Active Player period.'],
        already_coleader:   ['info', 'You already co-lead this club.'],
        colead_cap_reached: ['no',   COLEAD_CAP_VOLUNTEER_REFUSAL],
        cap_reached:        ['no',   'This club already has the maximum of 5 co-leaders.'],
      };
      const outcome = messages[result.branch] ?? (['no', 'Could not volunteer.'] as [OutcomeTone, string]);
      writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload(outcome[0], outcome[1]));
      res.redirect(303, `/clubs/${encodeURIComponent(req.params.key)}`);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  postMarkInactive(req: Request, res: Response, next: NextFunction): void {
    try {
      const clubId = clubService.resolveClubIdByKey(req.params.key);
      const result = clubService.markClubInactive(req.user!.userId, clubId);

      if (result.branch === 'not_leader') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('no', 'Only club leaders can mark a club inactive.'));
      } else if (result.branch === 'already_inactive') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('info', 'This club is already inactive.'));
      } else {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('ok', 'Club marked inactive.'));
      }
      res.redirect(303, `/members/${encodeURIComponent(req.user!.slug)}`);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  postReactivate(req: Request, res: Response, next: NextFunction): void {
    try {
      const clubId = clubService.resolveClubIdByKey(req.params.key);
      const result = clubService.reactivateClub(req.user!.userId, clubId);

      if (result.branch === 'not_leader') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('no', 'Only club leaders can reactivate a club.'));
      } else if (result.branch === 'already_active') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('info', 'This club is already active.'));
      } else {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('ok', 'Club reactivated.'));
      }
      res.redirect(303, `/members/${encodeURIComponent(req.user!.slug)}`);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

};
