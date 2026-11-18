import { Request, Response, NextFunction } from 'express';
import {
  adminWorkQueueService, type WorkQueueListQuery, type WorkQueueOutcomeOptions,
} from '../services/adminWorkQueueService';
import { identityAccessService } from '../services/identityAccessService';
import { workQueueService } from '../services/workQueueService';
import { memberMessageService } from '../services/memberMessageService';
import { ConflictError, NotFoundError, RateLimitedError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';
import { outcomeNotice } from '../lib/outcomeNotice';
import { redirectWithOutcome } from '../lib/actionOutcome';
import { z } from 'zod';
import { parseFormBody, formText, formOptionalText, formCheckbox } from '../lib/parseFormBody';
import { broadcastService, type AnnouncementDecisionResult } from '../services/broadcastService';
import { eventService, type SanctionDecisionResult } from '../services/eventService';
import { WORK_QUEUE_TOPICS, WORK_QUEUE_TOPIC_KEYS, type WorkQueueTopic } from '../services/workQueueTaskTypes';

// Every queue form carries the list state the administrator is working in (the
// kind, the area, the unclaimed filter and the page) and which page it was
// posted from, so the action returns them to where they were.
const listFields = {
  kind: formOptionalText('Kind'),
  topic: formOptionalText('Area'),
  unclaimed: formOptionalText('Unclaimed only'),
  page: formOptionalText('Page'),
  from: formOptionalText('Return page'),
};

const filtersForm = z.object(listFields);
const claimForm = z.object(listFields);
const resolveForm = z.object({
  decision_label: formText('Decision'),
  resolution_note: formText('Note'),
  ...listFields,
});
const noteForm = z.object({ note: formText('Note'), ...listFields });
const askForm = z.object({
  subject: formOptionalText('Subject'),
  body: formOptionalText('Message'),
  expectedAnswerKind: formOptionalText('Answer kind'),
  ...listFields,
});
const linkTargetForm = z.object({
  target_legacy_member_id: formText('Legacy member id'),
  target_historical_person_id: formText('Historical person id'),
  reason: formText('Reason'),
  ...listFields,
});
const rejectForm = z.object({ reason: formText('Reason'), ...listFields });
const approveAnnouncementForm = z.object({
  allow_extra: formCheckbox('Allow an extra announcement today', '0'),
  ...listFields,
});
const sendBackForm = z.object({ comment: formText('Note to the member'), ...listFields });
const approveSanctionForm = z.object({ note: formOptionalText('Note'), ...listFields });
const rejectSanctionForm = z.object({ reason: formText('Reason'), ...listFields });
// One owner choice per area; an empty value is No owner. The service decides
// whether each choice is a current administrator. The fields come from the area
// registry, so a new area's choice is read by the save the day the page offers it.
const ownerField = (area: WorkQueueTopic) => `owner_${area}`;
const ownersForm = z.object(Object.fromEntries(WORK_QUEUE_TOPIC_KEYS.map((area) =>
  [ownerField(area), formOptionalText(`${WORK_QUEUE_TOPICS[area].label} owner`)])));

/** The list state a queue form carries back, and the page it came from. */
type ListForm = WorkQueueListQuery & { from?: string };

// A shape the form never sends is refused like any other fixable submission,
// through the catch that re-renders the item page at 422.
function read<S extends z.ZodType>(schema: S, req: Request): z.output<S> {
  const parsed = parseFormBody(schema, req.body);
  if (!parsed.ok) throw new ValidationError(parsed.message);
  return parsed.data;
}

/** The list state alone, for a refusal that came before the whole form could be read. */
function filtersOf(req: Request): ListForm {
  const parsed = parseFormBody(filtersForm, req.body);
  return parsed.ok ? parsed.data : {};
}

/** The list state a GET names in its query. */
function queryState(req: Request): WorkQueueListQuery {
  const q = (key: string) => (typeof req.query[key] === 'string' ? req.query[key] as string : null);
  return { kind: q('kind'), topic: q('topic'), unclaimed: q('unclaimed'), page: q('page') };
}

function listState(form: ListForm): WorkQueueListQuery {
  return { kind: form.kind, topic: form.topic, unclaimed: form.unclaimed, page: form.page };
}

/**
 * The list again, at not-found, saying the item is gone: the action's item is
 * no longer open, so its own page has nothing to show.
 */
function renderGone(req: Request, res: Response, form: ListForm, message: string): void {
  res.status(404).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({
    adminMemberId: req.user!.userId, ...listState(form), errorMessage: message,
  }));
}

/**
 * A refused submission at 422: the item's page again with the refusal, or, for
 * an item no longer open, the list carrying the same refusal. Either way the
 * answer is the refusal of what was sent, never a not-found for it.
 */
function renderRefusal(req: Request, res: Response, queueItemId: string, form: ListForm, message: string): void {
  const vm = adminWorkQueueService.getWorkQueueItemPage(queueItemId, req.user!.userId, {
    state: listState(form), errorMessage: message,
  });
  if (vm) {
    res.status(422).render('admin/work-queue/item', vm);
    return;
  }
  res.status(422).render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({
    adminMemberId: req.user!.userId, ...listState(form), errorMessage: message,
  }));
}

// The resolve methods rate-limit in-service (shared per-admin bucket; admin
// role does not bypass). This controller only maps the error to HTTP.
function sendRateLimited(res: Response, err: RateLimitedError): void {
  if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
  res.status(429).type('text/plain').send(err.message);
}

/**
 * A dispute revert that finds nobody holding the record changed nothing and was
 * not refused, so it returns to the item saying so in the informational tone
 * rather than drawing an error page.
 */
function redirectAlreadySettled(req: Request, res: Response, text: string, queueItemId: string, form: ListForm): void {
  redirectWithOutcome(req, res, {
    flash: FLASH_KIND.WORK_QUEUE_OUTCOME,
    to: adminWorkQueueService.originReturnPath({ ...form, from: 'item' }, queueItemId),
    ending: 'already_held',
    text,
  });
}

/**
 * After a decision on a held announcement: back to the list, confirming the
 * member was emailed. The administrator's own decision submitted again reports
 * that same success; one another decision already settled says the item is no
 * longer open, informationally, rather than claiming a change.
 */
function redirectAnnouncementDecision(
  req: Request,
  res: Response,
  result: AnnouncementDecisionResult,
  form: ListForm,
): void {
  if (result.status === 'already_held') {
    redirectWithOutcome(req, res, {
      flash: FLASH_KIND.WORK_QUEUE_OUTCOME,
      to: adminWorkQueueService.listReturnPath(form),
      ending: 'already_held',
      text: 'That queue item is no longer open.',
    });
    return;
  }
  writeFlash(res, req, FLASH_KIND.WORK_QUEUE_RESOLVED, 'notified');
  res.redirect(303, adminWorkQueueService.listReturnPath(form));
}

/**
 * After a decision on a sanction request: back to the list, confirming the
 * organizers were emailed, the same way an announcement decision reports.
 */
function redirectSanctionDecision(
  req: Request,
  res: Response,
  result: SanctionDecisionResult,
  form: ListForm,
): void {
  if (result.status === 'already_held') {
    redirectWithOutcome(req, res, {
      flash: FLASH_KIND.WORK_QUEUE_OUTCOME,
      to: adminWorkQueueService.listReturnPath(form),
      ending: 'already_held',
      text: 'That queue item is no longer open.',
    });
    return;
  }
  writeFlash(res, req, FLASH_KIND.WORK_QUEUE_RESOLVED, 'notified');
  res.redirect(303, adminWorkQueueService.listReturnPath(form));
}

/** One decision handler's refusals, mapped the way every item action maps them. */
function announcementDecisionError(
  err: unknown, req: Request, res: Response, next: NextFunction, queueItemId: string,
): void {
  if (err instanceof ValidationError) {
    renderRefusal(req, res, queueItemId, filtersOf(req), err.message);
    return;
  }
  if (err instanceof NotFoundError) {
    renderGone(req, res, filtersOf(req), err.message);
    return;
  }
  if (err instanceof RateLimitedError) {
    sendRateLimited(res, err);
    return;
  }
  handleControllerError(err, res, next, 'admin work queue controller');
}

/** The outcome of the action that redirected here, read once and cleared. */
function readQueueFlash(req: Request, res: Response): WorkQueueOutcomeOptions {
  const flash = readFlash(req);
  const out: WorkQueueOutcomeOptions = {};
  if (flash?.kind === FLASH_KIND.WORK_QUEUE_RESOLVED) {
    // A payments-task resolve (and a contact resolve with no member email)
    // notified nobody, so the page confirms it without the email banner.
    if (flash.payload === 'quiet') out.resolvedQuietFlag = true;
    else out.resolvedFlag = true;
  } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_REVIEWED) {
    out.reviewedFlag = true;
  } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_MEMBER_ASKED) {
    out.memberAskedFlag = true;
  } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_CLAIM_REVERTED) {
    out.claimRevertedFlag = true;
  } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_PARKED) {
    out.parkedFlag = flash.payload === 'parked';
    out.unparkedFlag = flash.payload !== 'parked';
  } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_CLAIMED) {
    // The claim POST carries its outcome in the flash payload so the page can
    // confirm the claim or report that another admin won it.
    out.claimedFlag = flash.payload === 'claimed';
    out.claimNoopFlag = flash.payload !== 'claimed';
  } else if (flash?.kind === FLASH_KIND.WORK_QUEUE_OUTCOME) {
    out.outcome = outcomeNotice(flash.payload);
  } else {
    return out;
  }
  clearFlash(res, req);
  return out;
}

export const adminWorkQueueController = {
  /** GET /admin/work-queue */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/work-queue/index', adminWorkQueueService.getAdminWorkQueuePage({
        adminMemberId: req.user!.userId,
        ...queryState(req),
        ...readQueueFlash(req, res),
      }));
    } catch (err) {
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** GET /admin/work-queue/:id
   *
   * One open item's page. `?ask=1` is the deep link the story specifies: a
   * matter that needs the member's own answer opens its composer already
   * drafted. */
  item(req: Request, res: Response, next: NextFunction): void {
    try {
      const vm = adminWorkQueueService.getWorkQueueItemPage(req.params['id'] ?? '', req.user!.userId, {
        state: queryState(req),
        ask: req.query['ask'] === '1',
        ...readQueueFlash(req, res),
      });
      if (!vm) throw new NotFoundError('Open work-queue item not found');
      res.render('admin/work-queue/item', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** GET /admin/work-queue/parked */
  parked(req: Request, res: Response, next: NextFunction): void {
    try {
      res.render('admin/work-queue/parked', adminWorkQueueService.getParkedWorkQueuePage(
        req.user!.userId, readQueueFlash(req, res),
      ));
    } catch (err) {
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** GET /admin/work-queue-areas */
  areas(req: Request, res: Response, next: NextFunction): void {
    try {
      const { outcome } = readQueueFlash(req, res);
      res.render('admin/work-queue-areas', adminWorkQueueService.getWorkQueueAreasPage({ outcome }));
    } catch (err) {
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue-areas
   *
   * Record each area's owner. Any administrator may; each changed area writes
   * one audit row, and a save that changes nothing says so in the informational
   * tone. */
  saveAreas(req: Request, res: Response, next: NextFunction): void {
    try {
      const choices = read(ownersForm, req) as Record<string, string | undefined>;
      const result = adminWorkQueueService.saveTopicOwners({
        adminMemberId: req.user!.userId,
        owners: Object.fromEntries(
          WORK_QUEUE_TOPIC_KEYS.map((area) => [area, choices[ownerField(area)]]),
        ) as Partial<Record<WorkQueueTopic, string>>,
      });
      redirectWithOutcome(req, res, {
        flash: FLASH_KIND.WORK_QUEUE_OUTCOME,
        to: '/admin/work-queue-areas',
        ending: result.status === 'saved' ? 'advance' : 'already_held',
        text: result.status === 'saved' ? 'Area owners saved.' : 'No area owner changed.',
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(422).render('admin/work-queue-areas', adminWorkQueueService.getWorkQueueAreasPage({ errorMessage: err.message }));
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/claim
   *
   * Claim an open, unclaimed item for the acting admin, which drops it from
   * every other admin's digest. A second claim (already claimed, or no longer
   * open) is a harmless no-op reported back on the page it came from. */
  claim(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(claimForm, req);
      const result = workQueueService.claim({ queueItemId, adminMemberId: req.user!.userId });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_CLAIMED, result.status);
      res.redirect(303, adminWorkQueueService.originReturnPath(form, queueItemId));
    } catch (err) {
      if (err instanceof ValidationError) {
        renderRefusal(req, res, queueItemId, filtersOf(req), err.message);
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
      res.redirect(303, adminWorkQueueService.listReturnPath(form));
    } catch (err) {
      if (err instanceof ValidationError) {
        renderRefusal(req, res, queueItemId, filtersOf(req), err.message);
        return;
      }
      if (err instanceof NotFoundError) {
        renderGone(req, res, filtersOf(req), 'That queue item is no longer open.');
        return;
      }
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/park
   *
   * Set an item aside with a reason. It leaves the working queue, the digests
   * and the escalation sweep, and waits on the parked page until the member
   * answers or an administrator takes it back. */
  park(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(noteForm, req);
      adminWorkQueueService.park({ queueItemId, adminMemberId: req.user!.userId, note: form.note });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_PARKED, 'parked');
      res.redirect(303, adminWorkQueueService.originReturnPath(form, queueItemId));
    } catch (err) {
      if (err instanceof ValidationError) {
        renderRefusal(req, res, queueItemId, filtersOf(req), err.message);
        return;
      }
      if (err instanceof NotFoundError) {
        renderGone(req, res, filtersOf(req), 'That item cannot be parked.');
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
      res.redirect(303, adminWorkQueueService.originReturnPath(form, queueItemId));
    } catch (err) {
      if (err instanceof ValidationError) {
        renderRefusal(req, res, queueItemId, filtersOf(req), err.message);
        return;
      }
      if (err instanceof NotFoundError) {
        renderGone(req, res, filtersOf(req), 'That item is not parked.');
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
      res.redirect(303, adminWorkQueueService.listReturnPath(form));
    } catch (err) {
      if (err instanceof ValidationError) {
        renderRefusal(req, res, queueItemId, filtersOf(req), err.message);
        return;
      }
      if (err instanceof NotFoundError) {
        renderGone(req, res, filtersOf(req), 'That review item is no longer open.');
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
   * status; what changes is that its page now shows a question waiting.
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
      res.redirect(303, adminWorkQueueService.originReturnPath(form, queueItemId));
    } catch (err) {
      if (err instanceof ValidationError) {
        renderRefusal(req, res, queueItemId, filtersOf(req), err.message);
        return;
      }
      if (err instanceof NotFoundError) {
        renderGone(req, res, filtersOf(req), 'That item is no longer open.');
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
        state:              listState(form),
      }));
    } catch (err) {
      if (err instanceof ValidationError) {
        renderRefusal(req, res, queueItemId, filtersOf(req), err.message);
        return;
      }
      if (err instanceof NotFoundError) {
        renderGone(req, res, filtersOf(req), err.message);
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
      res.redirect(303, adminWorkQueueService.listReturnPath(form));
    } catch (err) {
      if (err instanceof ValidationError || err instanceof ConflictError) {
        renderRefusal(req, res, queueItemId, filtersOf(req), err.message);
        return;
      }
      if (err instanceof NotFoundError) {
        renderGone(req, res, filtersOf(req), 'That queue item is no longer open.');
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
        state:              listState(form),
      });
      if (!vm) {
        redirectAlreadySettled(req, res, 'Nobody currently holds that record, so there is no claim to revert.', queueItemId, form);
        return;
      }
      res.render('admin/work-queue/dispute-revert-confirm', vm);
    } catch (err) {
      if (err instanceof ValidationError) {
        renderRefusal(req, res, queueItemId, filtersOf(req), err.message);
        return;
      }
      if (err instanceof NotFoundError) {
        renderGone(req, res, filtersOf(req), 'No member with that id.');
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/link-help/dispute-revert/confirm
   *
   * Upheld dispute: reverts the current HOLDER's confirmed claim. Leaves
   * the queue item open, and returns to its page, so the admin can then approve
   * the requester's link (which resolves the item) or reject it. */
  async linkHelpDisputeRevert(req: Request, res: Response, next: NextFunction): Promise<void> {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(linkTargetForm, req);
      const result = identityAccessService.revertClaimForDispute(req.user!.userId, queueItemId, {
        legacyMemberId: form.target_legacy_member_id,
        historicalPersonId: form.target_historical_person_id,
      }, form.reason);
      if (result.status === 'nothing_to_revert') {
        redirectAlreadySettled(req, res, 'Nobody currently holds that record, so there is no claim to revert.', queueItemId, form);
        return;
      }
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_CLAIM_REVERTED, '');
      res.redirect(303, adminWorkQueueService.originReturnPath({ ...form, from: 'item' }, queueItemId));
    } catch (err) {
      if (err instanceof ValidationError) {
        renderRefusal(req, res, queueItemId, filtersOf(req), err.message);
        return;
      }
      if (err instanceof NotFoundError) {
        renderGone(req, res, filtersOf(req), 'No member with that id.');
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
      res.redirect(303, adminWorkQueueService.listReturnPath(form));
    } catch (err) {
      if (err instanceof ValidationError) {
        renderRefusal(req, res, queueItemId, filtersOf(req), err.message);
        return;
      }
      if (err instanceof NotFoundError) {
        renderGone(req, res, filtersOf(req), 'That queue item is no longer open.');
        return;
      }
      if (err instanceof RateLimitedError) {
        sendRateLimited(res, err);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/announcement/approve */
  announcementApprove(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(approveAnnouncementForm, req);
      const result = broadcastService.approveAnnouncement({
        queueItemId,
        adminMemberId: req.user!.userId,
        allowExtra: form.allow_extra === '1',
      });
      redirectAnnouncementDecision(req, res, result, form);
    } catch (err) {
      announcementDecisionError(err, req, res, next, queueItemId);
    }
  },

  /** POST /admin/work-queue/:id/announcement/send-back */
  announcementSendBack(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(sendBackForm, req);
      const result = broadcastService.returnAnnouncement({
        queueItemId,
        adminMemberId: req.user!.userId,
        comment: form.comment,
      });
      redirectAnnouncementDecision(req, res, result, form);
    } catch (err) {
      announcementDecisionError(err, req, res, next, queueItemId);
    }
  },

  /** POST /admin/work-queue/:id/sanction/approve */
  sanctionApprove(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(approveSanctionForm, req);
      const result = eventService.approveSanction({
        queueItemId,
        adminMemberId: req.user!.userId,
        note: form.note ?? '',
      });
      redirectSanctionDecision(req, res, result, form);
    } catch (err) {
      announcementDecisionError(err, req, res, next, queueItemId);
    }
  },

  /** POST /admin/work-queue/:id/sanction/reject */
  sanctionReject(req: Request, res: Response, next: NextFunction): void {
    const queueItemId = req.params['id'] ?? '';
    try {
      const form = read(rejectSanctionForm, req);
      const result = eventService.rejectSanction({
        queueItemId,
        adminMemberId: req.user!.userId,
        reason: form.reason,
      });
      redirectSanctionDecision(req, res, result, form);
    } catch (err) {
      announcementDecisionError(err, req, res, next, queueItemId);
    }
  },
};
