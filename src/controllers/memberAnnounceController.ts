/**
 * The community announcement an organizer-tier member submits for review: the
 * form and the submit.
 *
 * The tier gate is applied at the route; ownership of the path's member key is
 * checked here, and a mismatch is a 404 rather than a 403, so the path cannot be
 * used to discover which member slugs exist. The submit follows
 * post-redirect-get; a refusal (a missing agreement tick, a field error, or an
 * announcement already waiting for review) re-renders the form at 422 with the
 * text, the tick and the send token intact.
 */
import type { NextFunction, Request, Response } from 'express';

import { broadcastService } from '../services/broadcastService';
import { ConflictError, NotFoundError, ValidationError } from '../services/serviceErrors';
import { renderNotFound } from '../lib/controllerErrors';
import { isOwnMemberRoute } from '../lib/routeOwnership';
import { FLASH_KIND, takeFlash, writeFlash } from '../lib/flashCookie';

import { z } from 'zod';
import { parseFormBody, formText, formCheckbox } from '../lib/parseFormBody';

const announceForm = z.object({
  subject: formText('Subject'),
  bodyText: formText('Message'),
  sendToken: formText('The send token'),
  agree: formCheckbox('Community Standards agreement', '0'),
});

export const memberAnnounceController = {
  /** GET /members/:memberKey/announce */
  getForm(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    try {
      const notice = takeFlash(req, res, FLASH_KIND.ANNOUNCE_RESULT) ?? undefined;
      const vm = broadcastService.getAnnouncePage(String(req.params.memberKey), req.user!.userId, { notice });
      if (!vm) {
        renderNotFound(res);
        return;
      }
      res.render('members/announce', vm);
    } catch (err) {
      next(err);
    }
  },

  /** POST /members/:memberKey/announce */
  postSend(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    const memberKey = String(req.params.memberKey);
    const memberId = req.user!.userId;
    const rerender = (
      submitted: { subject: string; bodyText: string; sendToken: string },
      agreeChecked: boolean,
      fieldErrors: Record<string, string>,
    ): void => {
      const vm = broadcastService.getAnnouncePage(memberKey, memberId, { submitted, agreeChecked, fieldErrors });
      if (!vm) {
        renderNotFound(res);
        return;
      }
      res.status(422).render('members/announce', vm);
    };

    const parsed = parseFormBody(announceForm, req.body);
    if (!parsed.ok) {
      const s = parsed.submitted;
      try {
        rerender(
          { subject: s.subject ?? '', bodyText: s.bodyText ?? '', sendToken: s.sendToken ?? '' },
          false,
          parsed.fieldErrors,
        );
      } catch (err) {
        next(err);
      }
      return;
    }
    const input = parsed.data;

    try {
      // A repeat of this member's own submit reports the first submit's success.
      broadcastService.submitAnnouncement(input, memberId);
      writeFlash(res, req, FLASH_KIND.ANNOUNCE_RESULT, 'submitted');
      res.redirect(303, `/members/${memberKey}/announce`);
    } catch (err) {
      if (err instanceof ValidationError) {
        rerender(input, input.agree === '1', err.fieldErrors ?? { subject: err.message });
        return;
      }
      if (err instanceof ConflictError) {
        rerender(input, input.agree === '1', { subject: err.message });
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      next(err);
    }
  },
};
