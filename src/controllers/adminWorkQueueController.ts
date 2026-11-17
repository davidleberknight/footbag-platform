import { Request, Response, NextFunction } from 'express';
import { adminWorkQueueService } from '../services/adminWorkQueueService';
import { identityAccessService } from '../services/identityAccessService';
import { workQueueService } from '../services/workQueueService';
import { memberMessageService } from '../services/memberMessageService';
import { ConflictError, NotFoundError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { outcomeNotice, type OutcomeNoticeView } from '../lib/outcomeNotice';
import { redirectWithOutcome } from '../lib/actionOutcome';
import { z } from 'zod';
import { parseFormBody, formText, formOptionalText } from '../lib/parseFormBody';
import { WORK_QUEUE_TOPICS, WORK_QUEUE_TOPIC_KEYS, type WorkQueueTopic } from '../services/workQueueTaskTypes';

// Every queue form carries the category and the area the administrator is
// working in, so the action returns to them.
const category = formOptionalText('Category');
const topic = formOptionalText('Area');

const claimForm = z.object({ category, topic });
const resolveForm = z.object({
  decision_label: formText('Decision'),
  resolution_note: formText('Note'),
  category,
  topic,
});
const noteForm = z.object({ note: formText('Note'), category, topic });
const askForm = z.object({
  subject: formOptionalText('Subject'),
  body: formOptionalText('Message'),
  expectedAnswerKind: formOptionalText('Answer kind'),
  category,
  topic,
});
const linkTargetForm = z.object({
  target_legacy_member_id: formText('Legacy member id'),
  target_historical_person_id: formText('Historical person id'),
  reason: formText('Reason'),
  category,
  topic,
});
const rejectForm = z.object({ reason: formText('Reason'), category, topic });
// One owner choice per area; an empty value is No owner. The service decides
// whether each choice is a current administrator. The fields come from the area
// registry, so a new area's choice is read by the save the day the page offers it.
const ownerField = (area: WorkQueueTopic) => `owner_${area}`;
const ownersForm = z.object({
  ...Object.fromEntries(WORK_QUEUE_TOPIC_KEYS.map((area) =>
    [ownerField(area), formOptionalText(`${WORK_QUEUE_TOPICS[area].label} owner`)])),
  category,
  topic,
});

/** The filters a queue form carries back. */
type QueueFilters = { category?: string; topic?: string };

// A shape the form never sends is refused like any other fixable submission,
// through the catch that already re-renders the queue at 422.
function read<S extends z.ZodType>(schema: S, req: Request): z.output<S> {
  const parsed = parseFormBody(schema, req.body);
  if (!parsed.ok) throw new ValidationError(parsed.message);
  return parsed.data;
}

function renderRefusal(req: Request, res: Response, err: ValidationError): void {
  res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
}

// The resolve methods rate-limit in-service (shared per-admin bucket; admin
// role does not bypass). This controller only maps the error to HTTP.
function sendRateLimited(res: Response, err: RateLimitedError): void {
  if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
  res.status(429).type('text/plain').send(err.message);
}

/**
 * A dispute revert that finds nobody holding the record changed nothing and was
 * not refused, so it returns to the queue saying so in the informational tone
 * rather than drawing an error page.
 */
function redirectAlreadySettled(req: Request, res: Response, text: string, form: QueueFilters): void {
  redirectWithOutcome(req, res, {
    flash: FLASH_KIND.WORK_QUEUE_OUTCOME,
    to: queueReturnPath(req, form),
    ending: 'already_held',
    text,
  });
}

/**
 * Where a completed action returns to. An administrator working one category
 * stays in it: dropping the filter on every action would make it useless after
 * the first item. The service decides what an unrecognized value means, so the
 * raw query value is passed straight back rather than validated twice.
 */
function queueReturnPath(req: Request, form: QueueFilters): string {
  const params = new URLSearchParams();
  const rawTopic = form.topic ?? req.query['topic'];
  if (typeof rawTopic === 'string' && rawTopic !== '') params.set('topic', rawTopic);
  const rawCategory = form.category ?? req.query['category'];
  if (typeof rawCategory === 'string' && rawCategory !== '') params.set('category', rawCategory);
  const qs = params.toString();
  return qs ? `/admin/work-queue?${qs}` : '/admin/work-queue';
}

export const adminWorkQueueController = {
  /** GET /admin/work-queue */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let resolvedFlag = false;
      let resolvedQuietFlag = false;
      let reviewedFlag = false;
      let claimedFlag = false;
      let claimNoopFlag = false;
      let memberAskedFlag = false;
      let parkedFlag = false;
      let unparkedFlag = false;
      let claimRevertedFlag = false;
      let outcome: OutcomeNoticeView | null = null;
      if (flash?.kind === FLASH_KIND.WORK_QUEUE_RESOLVED) {
        // A payments-task resolve (and a contact resolve with no member email)
        // notified nobody, so the page confirms it without the email banner.
        if (flash.payload === 'quiet') resolvedQuietFlag = true;
        else resolvedFlag = true;
        clearFlash(res, req);
      } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_REVIEWED) {
        reviewedFlag = true;
        clearFlash(res, req);
      } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_MEMBER_ASKED) {
        memberAskedFlag = true;
        clearFlash(res, req);
      } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_CLAIM_REVERTED) {
        claimRevertedFlag = true;
        clearFlash(res, req);
      } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_PARKED) {
        parkedFlag = flash.payload === 'parked';
        unparkedFlag = flash.payload !== 'parked';
        clearFlash(res, req);
      } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_CLAIMED) {
        // The claim POST carries its outcome in the flash payload so the queue
        // re-render can confirm the claim or report that another admin won it.
        claimedFlag = flash.payload === 'claimed';
        claimNoopFlag = flash.payload !== 'claimed';
        clearFlash(res, req);
      } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_OUTCOME) {
        outcome = outcomeNotice(flash.payload);
        clearFlash(res, req);
      }
      res.render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({
        adminMemberId: req.user!.userId,
        resolvedFlag,
        resolvedQuietFlag,
        reviewedFlag,
        claimedFlag,
        claimNoopFlag,
        memberAskedFlag,
        parkedFlag,
        unparkedFlag,
        claimRevertedFlag,
        outcome,
        // The deep link the story specifies: a matter that needs the member's
        // own answer names itself here, and its composer opens already drafted.
        askItemId: typeof req.query.ask === 'string' ? req.query.ask : null,
        category: typeof req.query.category === 'string' ? req.query.category : null,
        topic: typeof req.query.topic === 'string' ? req.query.topic : null,
      }));
    } catch (err) {
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/claim
   *
   * Claim an open, unclaimed item for the acting admin, which drops it from
   * every other admin's digest. A second claim (already claimed, or no longer
   * open) is a harmless no-op reported back on the queue page. */
  claim(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(claimForm, req);
      const result = workQueueService.claim({ queueItemId, adminMemberId: req.user!.userId });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_CLAIMED, result.status);
      res.redirect(303, queueReturnPath(req, form));
    } catch (err) {
      if (err instanceof ValidationError) {
        renderRefusal(req, res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/resolve */
  async resolve(req: Request, res: Response, next: NextFunction): Promise<void> {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(resolveForm, req);
      const result = await adminWorkQueueService.resolve({
        queueItemId,
        adminMemberId: req.user!.userId,
        decisionLabel: form.decision_label,
        resolutionNote: form.resolution_note,
      });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_RESOLVED, result.memberNotified ? 'notified' : 'quiet');
      res.redirect(303, queueReturnPath(req, form));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'That queue item is no longer open.' }));
        return;
      }
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/owners
   *
   * Record each area's owner. Any administrator may; each changed area writes
   * one audit row, and a save that changes nothing says so in the informational
   * tone. */
  saveOwners(req: Request, res: Response, next: NextFunction): void {
    try {
      const form = read(ownersForm, req);
      const choices = form as Record<string, string | undefined>;
      const result = adminWorkQueueService.saveTopicOwners({
        adminMemberId: req.user!.userId,
        owners: Object.fromEntries(
          WORK_QUEUE_TOPIC_KEYS.map((area) => [area, choices[ownerField(area)]]),
        ) as Partial<Record<WorkQueueTopic, string>>,
      });
      redirectWithOutcome(req, res, {
        flash: FLASH_KIND.WORK_QUEUE_OUTCOME,
        to: queueReturnPath(req, form),
        ending: result.status === 'saved' ? 'advance' : 'already_held',
        text: result.status === 'saved' ? 'Area owners saved.' : 'No area owner changed.',
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        renderRefusal(req, res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/park
   *
   * Set an item aside with a reason. It leaves the working queue, the digests
   * and the escalation sweep, and waits in the parked listing until the member
   * answers or an administrator takes it back. */
  park(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(noteForm, req);
      adminWorkQueueService.park({ queueItemId, adminMemberId: req.user!.userId, note: form.note });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_PARKED, 'parked');
      res.redirect(303, queueReturnPath(req, form));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'That item cannot be parked.' }));
        return;
      }
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/unpark
   *
   * Take a parked item back into the working queue. Any administrator may do it,
   * not only the one who parked it. */
  unpark(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(claimForm, req);
      adminWorkQueueService.unpark({ queueItemId, adminMemberId: req.user!.userId });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_PARKED, 'unparked');
      res.redirect(303, queueReturnPath(req, form));
    } catch (err) {
      if (err instanceof ValidationError) {
        renderRefusal(req, res, err);
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'That item is not parked.' }));
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/dismiss
   *
   * Close an internal-review item (a low-confidence auto-link match, or an
   * administrator-loss recruitment alert). No member email, and nothing is
   * reverted here. */
  dismiss(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(noteForm, req);
      adminWorkQueueService.dismiss({ queueItemId, adminMemberId: req.user!.userId, note: form.note });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_REVIEWED, queueItemId);
      res.redirect(303, queueReturnPath(req, form));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'That review item is no longer open.' }));
        return;
      }
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /**
   * POST /admin/work-queue/:id/ask-member
   *
   * Put a direct question to the member this item is about. The item keeps its
   * status; what changes is that the card now shows a question waiting.
   */
  askMember(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(askForm, req);
      memberMessageService.sendQuestion({
        queueItemId,
        adminMemberId:      req.user!.userId,
        subject:            form.subject,
        body:               form.body,
        expectedAnswerKind: form.expectedAnswerKind,
      });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_MEMBER_ASKED, queueItemId);
      res.redirect(303, queueReturnPath(req, form));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'That item is no longer open.' }));
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/link-help/approve
   *
   * Shows whose record is about to be bound to whose account. Writes nothing:
   * an opaque id typed by hand is exactly the case where a mistyped character
   * links the wrong person, and every other consequential write on a person is
   * previewed the same way. */
  linkHelpApprovePreview(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(linkTargetForm, req);
      res.render('admin/work-queue/link-help-confirm', adminWorkQueueService.getLinkHelpApprovalConfirmPage({
        adminMemberId:      req.user!.userId,
        queueItemId,
        legacyMemberId:     form.target_legacy_member_id,
        historicalPersonId: form.target_historical_person_id,
        category:           form.category ?? null,
        topic:              form.topic ?? null,
      }));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/link-help/approve/confirm */
  async linkHelpApprove(req: Request, res: Response, next: NextFunction): Promise<void> {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(linkTargetForm, req);
      identityAccessService.approveLinkHelpRequest(req.user!.userId, queueItemId, {
        legacyMemberId: form.target_legacy_member_id,
        historicalPersonId: form.target_historical_person_id,
      });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_RESOLVED, queueItemId);
      res.redirect(303, queueReturnPath(req, form));
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'That queue item is no longer open.' }));
        return;
      }
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/link-help/dispute-revert
   *
   * Shows what upholding the dispute would remove from the record's holder.
   * Writes nothing: a revert loses data, so it applies only from the
   * confirmation this page posts. */
  linkHelpDisputeRevertPreview(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(linkTargetForm, req);
      const vm = adminWorkQueueService.getDisputeRevertConfirmPage({
        adminMemberId:      req.user!.userId,
        queueItemId,
        legacyMemberId:     form.target_legacy_member_id,
        historicalPersonId: form.target_historical_person_id,
        reason:             form.reason,
        category:           form.category ?? null,
        topic:              form.topic ?? null,
      });
      if (!vm) {
        redirectAlreadySettled(req, res, 'Nobody currently holds that record, so there is no claim to revert.', form);
        return;
      }
      res.render('admin/work-queue/dispute-revert-confirm', vm);
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'No member with that id.' }));
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/link-help/dispute-revert/confirm
   *
   * Upheld dispute: reverts the current HOLDER's confirmed claim. Leaves
   * the queue item open so the admin can then approve the requester's link
   * (which resolves the item) or reject it. */
  async linkHelpDisputeRevert(req: Request, res: Response, next: NextFunction): Promise<void> {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(linkTargetForm, req);
      const result = identityAccessService.revertClaimForDispute(req.user!.userId, queueItemId, {
        legacyMemberId: form.target_legacy_member_id,
        historicalPersonId: form.target_historical_person_id,
      }, form.reason);
      if (result.status === 'nothing_to_revert') {
        redirectAlreadySettled(req, res, 'Nobody currently holds that record, so there is no claim to revert.', form);
        return;
      }
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_CLAIM_REVERTED, '');
      res.redirect(303, queueReturnPath(req, form));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'No member with that id.' }));
        return;
      }
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/link-help/reject */
  async linkHelpReject(req: Request, res: Response, next: NextFunction): Promise<void> {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(rejectForm, req);
      identityAccessService.rejectLinkHelpRequest(req.user!.userId, queueItemId, form.reason);
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_RESOLVED, queueItemId);
      res.redirect(303, queueReturnPath(req, form));
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: err.message }));
        return;
      }
      if (err instanceof NotFoundError) {
        res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({ adminMemberId: req.user!.userId, errorMessage: 'That queue item is no longer open.' }));
        return;
      }
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },
};
