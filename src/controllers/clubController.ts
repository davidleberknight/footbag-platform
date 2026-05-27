import { Request, Response, NextFunction } from 'express';
import { clubService } from '../services/clubService';
import { clubCleanupService } from '../services/clubCleanupService';
import { ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { writeFlash } from '../lib/flashCookie';
import { FLASH_KIND } from '../lib/flashCookie';

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
      const result = clubService.resolveByKey(req.params.key, req.isAuthenticated, req.user?.userId);
      res.render(result.template, result.vm);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  getCreate(_req: Request, res: Response): void {
    res.render('clubs/create', {
      seo: { title: 'Create a Club' },
      page: { sectionKey: 'clubs', pageKey: 'clubs_create', title: 'Create a Club' },
      formAction: '/clubs/create',
      cancelHref: '/clubs',
      club: { name: '', description: '', city: '', region: '', country: '', contactEmail: '', whatsapp: '', slug: '' },
    });
  },

  postCreate(req: Request, res: Response, next: NextFunction): void {
    try {
      const name = String(req.body?.name ?? '');
      const description = String(req.body?.description ?? '');
      const city = String(req.body?.city ?? '');
      const region = String(req.body?.region ?? '');
      const country = String(req.body?.country ?? '');
      const contactEmail = String(req.body?.contactEmail ?? '');
      const whatsapp = String(req.body?.whatsapp ?? '');
      const slug = String(req.body?.slug ?? '');

      const club = { name, description, city, region, country, contactEmail, whatsapp, slug };

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
          writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'Club created.');
          res.redirect(303, `/clubs/${encodeURIComponent(result.clubKey)}`);
          return;
        case 'already_leader':
          renderForm(422, `You are already a Club Leader for ${result.existingClubName}. Step down before creating a new club.`);
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
        res.status(404).render('errors/not-found', {
          seo: { title: 'Club Not Found' },
          page: { sectionKey: '', pageKey: 'error_404', title: 'Club Not Found' },
        });
        return;
      }
      if (result.branch === 'cap_reached') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'You are already in 2 clubs. Leave one before joining another.');
      } else if (result.branch === 'already_member') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'You are already a member of this club.');
      } else {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, `Joined as your ${result.branch === 'joined_primary' ? 'primary' : 'secondary'} club.`);
      }
      res.redirect(303, `/clubs/${encodeURIComponent(req.params.key)}`);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  postLeave(req: Request, res: Response, next: NextFunction): void {
    try {
      const clubId = clubService.resolveClubIdByKey(req.params.key);
      const result = clubService.leaveClub(req.user!.userId, clubId);

      if (result.branch === 'sole_leader_blocked') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'You are the sole leader of this club. Promote a co-leader before leaving.');
      } else if (result.branch === 'not_member') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'You are not a member of this club.');
      } else {
        const msg = result.remainingClubName
          ? `Left club. ${result.remainingClubName} remains. You can designate it as your primary club.`
          : 'Left club.';
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, msg);
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
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'You need two clubs to swap primary.');
      } else {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'Primary club swapped.');
      }
      res.redirect(303, `/members/${encodeURIComponent(req.user!.slug)}`);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  postStepDown(req: Request, res: Response, next: NextFunction): void {
    try {
      const clubId = clubService.resolveClubIdByKey(req.params.key);
      const result = clubService.stepDownFromLeader(req.user!.userId, clubId);

      if (result.branch === 'sole_leader_blocked') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'You are the sole leader. Promote a co-leader first.');
      } else if (result.branch === 'not_leader') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'You are not the leader of this club.');
      } else {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'Stepped down to co-leader.');
      }
      res.redirect(303, `/members/${encodeURIComponent(req.user!.slug)}`);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  postMarkInactive(req: Request, res: Response, next: NextFunction): void {
    try {
      const clubId = clubService.resolveClubIdByKey(req.params.key);
      const result = clubService.markClubInactive(req.user!.userId, clubId);

      if (result.branch === 'not_leader') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'Only club leaders can mark a club inactive.');
      } else if (result.branch === 'already_inactive') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'This club is already inactive.');
      } else {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'Club marked inactive.');
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
      const result = clubService.updateClubHashtag(clubId, newSlug, req.user!.userId);
      if (result.branch === 'not_leader') {
        res.status(404).render('errors/not-found');
        return;
      }
      if (result.branch === 'invalid_format') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'Invalid hashtag format.');
        res.redirect(303, `/clubs/${encodeURIComponent(clubKey)}`);
        return;
      }
      if (result.branch === 'tag_conflict') {
        writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'That hashtag is already taken.');
        res.redirect(303, `/clubs/${encodeURIComponent(clubKey)}`);
        return;
      }
      res.redirect(303, `/clubs/${encodeURIComponent(clubKey)}`);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

  postSignal(req: Request, res: Response, next: NextFunction): void {
    const clubKey = req.params.key;
    const activitySignal = String(req.body.activitySignal ?? '');
    const validSignals = new Set(['active', 'not_active', 'not_sure', 'never_heard_of_it']);
    if (!validSignals.has(activitySignal)) {
      res.redirect(303, `/clubs/${encodeURIComponent(clubKey)}`);
      return;
    }
    try {
      const clubId = clubService.resolveClubIdByKey(clubKey);
      clubCleanupService.submitClubDetailSignal(
        req.user!.userId,
        clubId,
        activitySignal as 'active' | 'not_active' | 'not_sure' | 'never_heard_of_it',
      );
      writeFlash(res, req, FLASH_KIND.CLUB_ACTION, 'Thanks for the feedback.');
      res.redirect(303, `/clubs/${encodeURIComponent(clubKey)}`);
    } catch (err) {
      handleControllerError(err, res, next, 'clubs controller');
    }
  },

};
