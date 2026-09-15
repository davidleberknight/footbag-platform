import { Request, Response, NextFunction } from 'express';
import { clubService } from '../services/clubService';
import { ValidationError } from '../services/serviceErrors';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';
import { writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { FLASH_KIND } from '../lib/flashCookie';
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
    try {
      const clubId = clubService.resolveClubIdByKey(req.params.key);
      const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
      await clubService.editClubContent(
        clubId,
        {
          name:        str(req.body.name),
          description: str(req.body.description),
          city:        str(req.body.city),
          region:      str(req.body.region),
          country:     str(req.body.country),
          externalUrl: str(req.body.external_url),
        },
        { kind: 'leader', memberId: req.user!.userId },
      );
      writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('ok', 'Club updated.'));
      res.redirect(303, `/clubs/${encodeURIComponent(req.params.key)}`);
    } catch (err) {
      if (err instanceof ValidationError) {
        // Re-render the club page carrying what was typed, so one bad field
        // does not cost the co-leader everything else in the form.
        const vm = clubService.getPublicClubPage(
          req.params.key,
          req.isMember,
          req.user?.userId,
          { editErrors: err.fieldErrors ?? { form: err.message }, editValues: req.body },
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
    });
  },

  postCreate(req: Request, res: Response, next: NextFunction): void {
    try {
      const name = String(req.body?.name ?? '');
      const description = String(req.body?.description ?? '');
      const city = String(req.body?.city ?? '');
      const region = String(req.body?.region ?? '');
      const country = String(req.body?.country ?? '');
      const slug = String(req.body?.slug ?? '');
      const confirmNearMatches = req.body?.confirm_near_matches === '1';

      const club = { name, description, city, region, country, slug, confirmNearMatches };

      const renderForm = (status: number, errorMessage: string, fieldErrors?: Record<string, string>, extra?: Record<string, unknown>) => {
        res.status(status).render('clubs/create', {
          seo: { title: 'Create a Club' },
          page: { sectionKey: 'clubs', pageKey: 'clubs_create', title: 'Create a Club' },
          formAction: '/clubs/create',
          cancelHref: '/clubs',
          errorMessage,
          fieldErrors,
          club,
          ...extra,
        });
      };

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
          writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('ok', 'Club created.'));
          res.redirect(303, `/clubs/${encodeURIComponent(result.clubKey)}`);
          return;
        case 'already_leader':
          renderForm(422, `You already co-lead ${result.existingClubName}. Clubs are local groups, so you lead your own club and are a guest at any other. To create a new club, step down there first.`);
          return;
        case 'affiliation_cap':
          renderForm(422, 'You are already in 2 clubs. Leave one before creating a new club.');
          return;
        case 'exact_name_exists':
          renderForm(422, `A club named "${result.existingClubName}" already exists in that country.`, undefined, {
            existingClubHref: `/clubs/${encodeURIComponent(result.existingClubKey)}`,
            existingClubName: result.existingClubName,
          });
          return;
        case 'near_matches_found':
          renderForm(422, 'A similarly named club may already exist in that country. Review the matches below; if your club is distinct, confirm and submit again.', undefined, {
            nearMatches: result.nearMatches,
          });
          return;
        case 'tag_conflict':
          renderForm(422, `The hashtag ${result.tagNormalized} is already taken. Try a different slug.`);
          return;
      }
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
      if (result.branch === 'cap_reached') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('no', 'You are already in 2 clubs. Leave one before joining another.'));
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
      const clubId = clubService.resolveClubIdByKey(req.params.key);
      const confirmed = req.body?.confirmed === '1';
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

      if (result.branch === 'not_member') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('no', 'You are not a member of this club.'));
      } else {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('ok', 'Left club.'));
      }
      res.redirect(303, `/members/${encodeURIComponent(req.user!.slug)}`);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  postSwapPrimary(req: Request, res: Response, next: NextFunction): void {
    try {
      const result = clubService.swapPrimaryAffiliation(req.user!.userId);

      if (result.branch === 'not_enough_clubs') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('no', 'You need two clubs to swap primary.'));
      } else {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('ok', 'Primary club swapped.'));
      }
      res.redirect(303, `/members/${encodeURIComponent(req.user!.slug)}`);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  postStepDown(req: Request, res: Response, next: NextFunction): void {
    try {
      const clubId = clubService.resolveClubIdByKey(req.params.key);
      const confirmed = req.body?.confirmed === '1';
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

      if (result.branch === 'not_leader') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('no', 'You are not a co-leader of this club.'));
      } else {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('ok', 'Stepped down from co-leading this club.'));
      }
      res.redirect(303, `/members/${encodeURIComponent(req.user!.slug)}`);
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
        not_eligible:       ['no',   'Co-leading requires Tier 1 benefits (Tier 1+ or an active Active Player period).'],
        already_coleader:   ['info', 'You already co-lead this club.'],
        coleads_other_club: ['no',   'You already co-lead another club. Clubs are local groups, so you lead your own club and are a guest at any other. To lead this one instead, step down at your club first.'],
        cap_reached:        ['no',   'This club already has the maximum of 5 co-leaders.'],
      };
      const outcome = messages[result.branch] ?? (['no', 'Could not volunteer.'] as [OutcomeTone, string]);
      writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload(outcome[0], outcome[1]));
      res.redirect(303, `/clubs/${encodeURIComponent(req.params.key)}`);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  postInvite(req: Request, res: Response, next: NextFunction): void {
    try {
      const clubId = clubService.resolveClubIdByKey(req.params.key);
      const inviteeKey = String(req.body?.member_key ?? '');
      const result = clubService.inviteToCoLeadClub(req.user!.userId, clubId, inviteeKey);

      const messages: Record<string, [OutcomeTone, string]> = {
        sent:             ['ok',   'Invitation recorded. It goes to that member by email.'],
        not_leader:       ['no',   'Only a co-leader can invite members to co-lead.'],
        member_not_found: ['no',   'No member found with that id or username.'],
        not_member:       ['no',   'That member must join the club before they can be invited to co-lead.'],
        already_coleader: ['info', 'That member already co-leads this club.'],
        no_email:         ['no',   'That member has no contact email on file.'],
      };
      const outcome = messages[result.branch] ?? (['no', 'Could not send the invitation.'] as [OutcomeTone, string]);
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

  postUpdateHashtag(req: Request, res: Response, next: NextFunction): void {
    const clubKey = req.params.key;
    const newSlug = String(req.body.newSlug ?? '');
    try {
      const clubId = clubService.resolveClubIdByKey(clubKey);
      const result = clubService.updateClubHashtag(
        clubId, newSlug, { kind: 'leader', memberId: req.user!.userId },
      );
      if (result.branch === 'not_leader' || result.branch === 'not_found') {
        renderNotFound(res);
        return;
      }
      if (result.branch === 'invalid_format') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('no', 'Invalid hashtag format.'));
        res.redirect(303, `/clubs/${encodeURIComponent(clubKey)}`);
        return;
      }
      if (result.branch === 'tag_conflict') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, outcomePayload('no', 'That hashtag is already taken.'));
        res.redirect(303, `/clubs/${encodeURIComponent(clubKey)}`);
        return;
      }
      // The hashtag is the club's URL key, so success must land on the NEW slug.
      res.redirect(303, `/clubs/${encodeURIComponent(result.newClubKey)}`);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

};
