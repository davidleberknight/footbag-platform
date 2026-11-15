import { Request, Response, NextFunction } from 'express';
import { memberMessageService } from '../services/memberMessageService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { isOwnMemberRoute } from '../lib/routeOwnership';
import { z } from 'zod';
import { parseFormBody, formText } from '../lib/parseFormBody';

const answerForm = z.object({
  birthDay: formText('Day of birth'),
  birthMonth: formText('Month of birth'),
  birthYear: formText('Year of birth'),
  dateAnswer: formText('Your answer about the date'),
  note: formText('Your note'),
});

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
    const parsed = parseFormBody(answerForm, req.body);
    if (!parsed.ok) {
      // The answer comes back holding what arrived as text; the refused field
      // is the one the message names.
      const s = parsed.submitted;
      try {
        res.status(422).render(
          'members/questions',
          memberMessageService.getQuestionsPage(memberKey, {
            error: parsed.message,
            submitted: {
              messageId,
              dateAnswer: s.dateAnswer ?? '',
              birth: { day: s.birthDay ?? '', month: s.birthMonth ?? '', year: s.birthYear ?? '' },
              note: s.note ?? '',
            },
          }),
        );
      } catch (err) {
        handleControllerError(err, res, next, 'member question controller');
      }
      return;
    }
    const birth = { day: parsed.data.birthDay, month: parsed.data.birthMonth, year: parsed.data.birthYear };
    const { dateAnswer, note } = parsed.data;
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
