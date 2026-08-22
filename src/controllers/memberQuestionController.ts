import { Request, Response, NextFunction } from 'express';
import { memberMessageService } from '../services/memberMessageService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { isOwnMemberRoute } from '../lib/routeOwnership';

// The member's side of the administrator question channel. Owner-only and
// slug-scoped: a mismatch answers 404 rather than 403, so the route cannot be
// used to learn which member slugs exist.
export const memberQuestionController = {
  /** GET /members/:memberKey/questions */
  index(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    try {
      // A member who answers their only question would otherwise land on the
      // empty state with nothing telling them the answer was received.
      const answered = readFlash(req)?.kind === FLASH_KIND.MEMBER_QUESTION_ANSWERED;
      if (answered) clearFlash(res, req);
      res.render(
        'members/questions',
        memberMessageService.getQuestionsPage(req.params.memberKey, { answered }),
      );
    } catch (err) {
      handleControllerError(err, res, next, 'member question controller');
    }
  },

  /** POST /members/:memberKey/questions/:messageId/answer */
  answer(req: Request, res: Response, next: NextFunction): void {
    if (!isOwnMemberRoute(req)) {
      renderNotFound(res);
      return;
    }
    const memberKey = req.params.memberKey;
    const messageId = req.params['messageId'] ?? '';
    const birth = {
      day:   String(req.body?.birthDay ?? ''),
      month: String(req.body?.birthMonth ?? ''),
      year:  String(req.body?.birthYear ?? ''),
    };
    const dateAnswer = String(req.body?.dateAnswer ?? '');
    const note = String(req.body?.note ?? '');
    try {
      memberMessageService.answerQuestion({
        messageId,
        memberId:   req.user!.userId,
        memberSlug: memberKey,
        // The service decides what the answer means, including refusing a
        // submission that chose nothing; this is shape coercion only.
        dateAnswer,
        birth,
        note,
      });
      writeFlash(res, req, FLASH_KIND.MEMBER_QUESTION_ANSWERED);
      res.redirect(303, `/members/${memberKey}/questions`);
    } catch (err) {
      if (err instanceof ValidationError) {
        // The member gets their own work back, so they fix the one thing the
        // message names instead of retyping the date and the note.
        res.status(422).render(
          'members/questions',
          memberMessageService.getQuestionsPage(memberKey, {
            error: err.message,
            submitted: { messageId, dateAnswer, birth, note },
          }),
        );
        return;
      }
      if (err instanceof NotFoundError) {
        renderNotFound(res);
        return;
      }
      handleControllerError(err, res, next, 'member question controller');
    }
  },
};
