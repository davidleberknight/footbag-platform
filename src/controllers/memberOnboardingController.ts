import { Request, Response, NextFunction } from 'express';
import {
  identityAccessService,
  ClaimConfirmContent,
  LinkHistoryContent,
} from '../services/identityAccessService';
import {
  memberOnboardingService,
  TASK_CATALOG,
  OnboardingTaskType,
  WizardFlash,
  WizardActionResult,
  WizardCard,
  ClubInsightPrompt,
  LegacyClaimAutoLinkConfirmFormState,
  LegacyClaimTokenConfirmFormState,
  PersonalDetailsFormState,
} from '../services/memberOnboardingService';
import { memberService } from '../services/memberService';
import { simulatedEmailService } from '../services/simulatedEmailService';
import { logger } from '../config/logger';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';
import { RateLimitedError, ValidationError } from '../services/serviceErrors';
import { PageViewModel } from '../types/page';
import {
  FLASH_KIND,
  writeFlash,
  readFlash,
  clearFlash,
} from '../lib/flashCookie';
import { config } from '../config/env';
import { getCaptchaAdapter } from '../adapters/captchaAdapter';

// Wizard surface: `/register/wizard/:taskType`. POST handlers are thin
// HTTP glue: parse input, call one service method returning a
// WizardActionResult, switch on the discriminant. Success
// outcomes 303 to the next task (or /register/wizard/complete);
// transient-notice outcomes 303 to the same task with a flash cookie
// carrying the next GET's banner state; validation errors re-render
// inline at 422; rate-limit re-renders at 429 with Retry-After. The
// auth-gate redirect to /login?returnTo=... comes from requireAuth.

const TASK_TYPE_SET: Set<string> = new Set(TASK_CATALOG);
const WIZARD_COMPLETE_URL = '/register/wizard/complete';

const EMPTY_FLASH = {
  submitted: false,
  hpPersonId: null,
  autoLinkDrift: false,
} as const;

interface ClubAffiliationsCardContent {
  dashboardHref:   string;
  submitHref:      string;
  // The explicit "none of these are my clubs" answer: declines every
  // remaining suggestion card and completes the task. The wizard carries no
  // outward links, no skip, and no dismissal; this and the per-card submits
  // are the step's only exits.
  noClubsHref:     string;
  card:            WizardCard | null;
  // Set only when the step is already finished and the page is drawing solely
  // to carry the cap notice; it replaces the card and the no-club exit.
  continueHref:    string | null;
  cardsTotal:      number;
  cardsRemaining:  number;
  resolvedNotice:  { clubName: string; decision: 'confirm' | 'correct' | 'decline'; message: string } | null;
  capHitNotice:    { message: string; manageClubsHref: string } | null;
  formError:       string | null;
  isWrapUp?:       boolean;
  noLegacyAffiliationFound?: boolean;
  // Present only where the insight question is asked: on the member's last
  // club card, and on the wrap-up landing. Absent everywhere else, so the
  // template renders the field exactly where it is offered.
  insightPrompt:   ClubInsightPrompt | null;
}

interface PersonalDetailsContent {
  dashboardHref: string;
  city: string;
  region: string;
  country: string;
  birthDate: string;
  gender: string;
  yearValue: string;
  showFirstCompetitionYear: boolean;
  showCompetitiveResults: boolean;
  regionRequired: boolean;
  error: string | null;
  submitLabel: string;
}

interface WizardCompleteContent {
  dashboardHref: string;
  capHitNotice: { message: string; manageClubsHref: string } | null;
}

function dashboardHrefFor(req: Request): string {
  return `/members/${encodeURIComponent(req.user!.slug)}`;
}

function isValidTaskType(value: string | undefined): value is OnboardingTaskType {
  return typeof value === 'string' && TASK_TYPE_SET.has(value);
}

function taskUrlFor(taskType: OnboardingTaskType): string {
  return `/register/wizard/${taskType}`;
}

function nextPendingHref(memberId: string): string {
  const next = memberOnboardingService.nextOutstandingTaskType(memberId);
  return next ? taskUrlFor(next) : WIZARD_COMPLETE_URL;
}

function writeWizardFlash(req: Request, res: Response, flash: WizardFlash): void {
  if (flash.kind === 'WIZARD_LEGACY_CLAIM_RESULT') {
    writeFlash(res, req, FLASH_KIND.WIZARD_LEGACY_CLAIM_RESULT, JSON.stringify(flash.payload));
    return;
  }
  if (flash.kind === 'WIZARD_AUTO_LINK_DRIFT') {
    writeFlash(res, req, FLASH_KIND.WIZARD_AUTO_LINK_DRIFT);
    return;
  }
  if (flash.kind === 'WIZARD_CLUB_CARD_RESOLVED') {
    writeFlash(res, req, FLASH_KIND.WIZARD_CLUB_CARD_RESOLVED, JSON.stringify(flash.payload));
    return;
  }
  if (flash.kind === 'WIZARD_CLUB_CAP_HIT') {
    writeFlash(res, req, FLASH_KIND.WIZARD_CLUB_CAP_HIT, JSON.stringify(flash.payload));
  }
}

interface WizardFlashState {
  submitted: boolean;
  hpPersonId: string | null;
  autoLinkDrift: boolean;
}

function readWizardFlashState(req: Request, res: Response): WizardFlashState {
  const flash = readFlash(req);
  if (!flash) return { ...EMPTY_FLASH };
  if (flash.kind === FLASH_KIND.WIZARD_LEGACY_CLAIM_RESULT) {
    clearFlash(res, req);
    let hpPersonId: string | null = null;
    try {
      const payload = JSON.parse(flash.payload ?? '{}');
      if (typeof payload.hpPersonId === 'string') hpPersonId = payload.hpPersonId;
    } catch {
      // Garbage payload: still treat as submitted; just no HP card.
    }
    return { submitted: true, hpPersonId, autoLinkDrift: false };
  }
  if (flash.kind === FLASH_KIND.WIZARD_AUTO_LINK_DRIFT) {
    clearFlash(res, req);
    return { submitted: false, hpPersonId: null, autoLinkDrift: true };
  }
  // Foreign flash kind (e.g., LOGOUT, AVATAR_UPLOADED): leave it intact for
  // whichever surface owns it.
  return { ...EMPTY_FLASH };
}

async function renderLegacyClaim(
  req: Request,
  res: Response,
  state: WizardFlashState,
  statusOverride?: number,
  validationMessage?: string,
): Promise<void> {
  const memberId = req.user!.userId;
  const data = await identityAccessService.getLinkHistoryViewForWizard(memberId, {
    submitted: state.submitted,
    hpPersonId: state.hpPersonId,
    autoLinkDrift: state.autoLinkDrift,
  });
  if (!data) {
    renderNotFound(res);
    return;
  }
  data.dashboardHref = dashboardHrefFor(req);
  data.turnstileSiteKey = config.turnstileSiteKey;
  data.declaredAnchors = identityAccessService.listDeclaredAnchors(memberId);
  data.helpRequestNotice = req.query.help_request === 'sent';
  const anchorVerification = req.query.anchor_verification;
  data.anchorVerificationNotice =
    anchorVerification === 'sent' || anchorVerification === 'verified' || anchorVerification === 'invalid'
      ? anchorVerification
      : null;
  const anchorSaved = req.query.anchor;
  data.anchorSavedNotice =
    anchorSaved === 'saved' || anchorSaved === 'removed' ? anchorSaved : null;
  if (validationMessage) data.validationMessage = validationMessage;
  // On a dev or staging host (stub adapter) show the just-sent confirmation link
  // on the page, scoped to the specific link type of whichever mail-sending
  // state is active, so a tester finishes the flow without opening the dev
  // outbox. In production the service returns null and no card renders.
  const mailLinkPrefix =
    data.anchorVerificationNotice === 'sent'
      ? '/register/wizard/legacy_claim/anchors/verify/'
      : data.sentNotice.show
        ? '/register/wizard/legacy_claim/claim/confirm/'
        : null;
  if (mailLinkPrefix) {
    data.emailPreview =
      (await simulatedEmailService.getEmailPreview({ urlPathPrefix: mailLinkPrefix })) ?? undefined;
  }
  res.status(statusOverride ?? 200).render('register/wizard/legacy-claim', {
    seo:  { title: 'Find your past records' },
    page: { sectionKey: 'members', pageKey: 'onboarding_legacy_claim', title: 'Find your past records' },
    content: data,
  } satisfies PageViewModel<LinkHistoryContent>);
}

function readClubResolvedFlash(
  req: Request,
  res: Response,
): { clubName: string; decision: 'confirm' | 'correct' | 'decline' } | null {
  const flash = readFlash(req);
  if (!flash) return null;
  if (flash.kind !== FLASH_KIND.WIZARD_CLUB_CARD_RESOLVED) return null;
  clearFlash(res, req);
  try {
    const payload = JSON.parse(flash.payload ?? '{}');
    if (typeof payload.clubName === 'string' &&
        (payload.decision === 'confirm' || payload.decision === 'correct' || payload.decision === 'decline')) {
      return { clubName: payload.clubName, decision: payload.decision };
    }
  } catch { /* garbage payload: drop the notice */ }
  return null;
}

// Peek, never consume: the render that follows is the one entitled to clear the
// flash and show the notice.
function clubCapHitFlashPending(req: Request): boolean {
  return readFlash(req)?.kind === FLASH_KIND.WIZARD_CLUB_CAP_HIT;
}

function readClubCapHitFlash(
  req: Request,
  res: Response,
): { clubName: string; capKind: 'membership' | 'leadership' } | null {
  const flash = readFlash(req);
  if (!flash) return null;
  if (flash.kind !== FLASH_KIND.WIZARD_CLUB_CAP_HIT) return null;
  clearFlash(res, req);
  try {
    const payload = JSON.parse(flash.payload ?? '{}');
    if (typeof payload.clubName === 'string') {
      return {
        clubName: payload.clubName,
        capKind: payload.capKind === 'leadership' ? 'leadership' : 'membership',
      };
    }
  } catch { /* garbage payload: drop the notice */ }
  return null;
}

// The cap notice has to reach the member wherever the answer leaves them. When
// the capped club was the last card, the task completes on the very next GET
// and the club page never renders again, so the completion page shows the
// notice instead; without that, the member is never told their Yes was recorded
// as a former membership. Wording is service-shaped; this only reads the flash
// cookie and supplies the request-derived href.
function capHitNoticeFrom(
  req: Request,
  res: Response,
): { message: string; manageClubsHref: string } | null {
  const flash = readClubCapHitFlash(req, res);
  if (!flash) return null;
  return {
    message: memberOnboardingService.buildClubCapHitNoticeMessage(flash.clubName, flash.capKind),
    manageClubsHref: dashboardHrefFor(req),
  };
}

function renderClubAffiliationsCard(
  req: Request,
  res: Response,
  opts: { formError?: string | null; statusOverride?: number; continueHref?: string | null } = {},
): void {
  const memberId = req.user!.userId;
  const cards = memberOnboardingService.listWizardCardsForMember(memberId);
  const resolvedFlash = readClubResolvedFlash(req, res);
  // Banner text is service-shaped so the template never branches on the
  // decision code and the wording lives with the rest of the wizard copy.
  const resolvedNotice = resolvedFlash
    ? {
        ...resolvedFlash,
        message: memberOnboardingService.buildClubResolvedNoticeMessage(
          resolvedFlash.decision,
          resolvedFlash.clubName,
        ),
      }
    : null;
  const capHitNotice = capHitNoticeFrom(req, res);
  const cardsRemaining = cards.length;
  const cardsTotal     = resolvedNotice ? cardsRemaining + 1 : cardsRemaining;

  const stage = memberOnboardingService.getClubAffiliationStage(memberId);

  res.status(opts.statusOverride ?? 200).render('register/wizard/club-affiliations', {
    seo:  { title: 'Club affiliations' },
    page: { sectionKey: 'members', pageKey: 'onboarding_club_affiliations', title: 'Club affiliations' },
    content: {
      dashboardHref:  dashboardHrefFor(req),
      submitHref:     '/register/wizard/club_affiliations/submit',
      noClubsHref:    '/register/wizard/club_affiliations/none',
      card:           cards.length > 0 ? cards[0] : null,
      continueHref:   opts.continueHref ?? null,
      cardsTotal,
      cardsRemaining,
      resolvedNotice,
      capHitNotice,
      formError:      opts.formError ?? null,
      isWrapUp:       stage === 'wrap_up',
      noLegacyAffiliationFound:
        stage === 'wrap_up' && !memberOnboardingService.memberHadClubSuggestionMaterial(memberId),
      // Asked once per member. On the wrap-up landing when the member has no
      // cards at all, otherwise on the last card they have left; a member who
      // answers it on their final card is not asked again on the landing. A
      // page drawing only to carry the cap notice has no form to attach it to.
      insightPrompt:
        opts.continueHref || cardsRemaining > 1
          ? null
          : memberOnboardingService.memberHasLeftClubInsight(memberId)
            ? null
            : memberOnboardingService.buildClubInsightPrompt(cards.length === 0),
    },
  } satisfies PageViewModel<ClubAffiliationsCardContent>);
}

function renderPersonalDetails(
  req: Request,
  res: Response,
  opts: { city?: string; region?: string; country?: string; birthDate?: string; gender?: string; yearValue?: string; showCompetitiveResults?: boolean; error?: string | null; statusOverride?: number } = {},
): void {
  const form = memberService.getPersonalDetailsForm(req.user!.userId, opts);
  res.status(opts.statusOverride ?? 200).render('register/wizard/personal-details', {
    seo:  { title: 'Personal details' },
    page: { sectionKey: 'members', pageKey: 'onboarding_personal_details', title: 'Personal details' },
    content: {
      dashboardHref: dashboardHrefFor(req),
      ...form,
      error: opts.error ?? null,
      // "Continue" while other onboarding steps remain; "Complete" when saving
      // this required step finishes the member's outstanding wizard tasks.
      submitLabel: memberOnboardingService.hasOtherOutstandingTasks(req.user!.userId, 'personal_details')
        ? 'Save and Continue Onboarding'
        : 'Save and Complete Onboarding',
    },
  } satisfies PageViewModel<PersonalDetailsContent>);
}


function renderComplete(req: Request, res: Response): void {
  res.status(200).render('register/wizard/complete', {
    seo:  { title: 'Onboarding complete' },
    page: { sectionKey: 'members', pageKey: 'onboarding_complete', title: 'Onboarding complete' },
    content: { dashboardHref: dashboardHrefFor(req), capHitNotice: capHitNoticeFrom(req, res) },
  } satisfies PageViewModel<WizardCompleteContent>);
}

async function renderTaskByType(
  req: Request,
  res: Response,
  taskType: OnboardingTaskType,
): Promise<void> {
  switch (taskType) {
    case 'personal_details':         renderPersonalDetails(req, res); return;
    case 'legacy_claim': {
      const state = readWizardFlashState(req, res);
      await renderLegacyClaim(req, res, state);
      return;
    }
    case 'club_affiliations':        renderClubAffiliationsCard(req, res); return;
    default: {
      const _exhaustive: never = taskType;
      void _exhaustive;
      renderNotFound(res);
    }
  }
}

interface DispatchOpts<TFormState> {
  action: () => Promise<WizardActionResult<TFormState>> | WizardActionResult<TFormState>;
  renderValidationError?: (result: { formState: TFormState; message: string }) => void | Promise<void>;
  renderRateLimited?: () => void | Promise<void>;
}

async function dispatch<TFormState>(
  req: Request,
  res: Response,
  next: NextFunction,
  currentTaskType: OnboardingTaskType,
  opts: DispatchOpts<TFormState>,
): Promise<void> {
  try {
    const result = await opts.action();
    switch (result.kind) {
      case 'advance':
        res.redirect(303, result.nextTaskType
          ? taskUrlFor(result.nextTaskType) : WIZARD_COMPLETE_URL);
        return;
      case 'retry_same':
        if (result.flash) writeWizardFlash(req, res, result.flash);
        res.redirect(303, taskUrlFor(currentTaskType));
        return;
      case 'validation_error':
        if (opts.renderValidationError) await opts.renderValidationError(result);
        return;
      case 'rate_limited':
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        if (opts.renderRateLimited) await opts.renderRateLimited();
        return;
    }
  } catch (err) {
    // Map NotFoundError / ValidationError to 404 (anti-enumeration for the
    // F1 ownership check on club_affiliations submit), ServiceUnavailableError
    // to 503, everything else to next(err) -> 500.
    handleControllerError(err, res, next, `onboarding wizard:${currentTaskType}`);
  }
}

export const memberOnboardingController = {
  async getTask(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const taskType = req.params.taskType;
      if (!isValidTaskType(taskType)) {
        renderNotFound(res);
        return;
      }
      const memberId = req.user!.userId;
      memberOnboardingService.startTaskList(memberId);

      // Personal-details-before-matching gate: a task that depends on the
      // required personal fields (legacy_claim, club_affiliations) does not
      // render until personal_details is complete. This is what keeps the
      // legacy-claim matcher from running before the member's date of birth is
      // on file; it also blocks reaching those steps by direct URL.
      const prerequisite = memberOnboardingService.prerequisiteTaskFor(memberId, taskType);
      if (prerequisite) {
        res.redirect(303, taskUrlFor(prerequisite));
        return;
      }

      // Reconcile task state with underlying reality before render. If the
      // underlying state shows the task is already done or moot, transition
      // it now and 303 to the next pending task (or /complete). Keeps the
      // wizard from rendering a search page for an already-linked account
      // or a "no clubs to confirm" empty state for a member who can never
      // have cards.
      // A cap-hit answer must be read beside the step that produced it. When the
      // capped club was the member's last card, this GET is where the task
      // completes, so without holding the render here the club page never draws
      // again and the explanation surfaces a step later with no card in sight.
      // The club cards and the no-club exit are spent by then, so the page shows
      // the notice and a way onward. The completion page keeps the notice for
      // the case where there is genuinely no further club render.
      const capAcknowledgement = taskType === 'club_affiliations' && clubCapHitFlashPending(req);

      let transitioned = false;
      if (taskType === 'legacy_claim') {
        transitioned = memberOnboardingService.ensureLegacyClaimReflectsState(memberId);
      } else if (taskType === 'club_affiliations') {
        transitioned = memberOnboardingService.ensureClubAffiliationsReflectsState(memberId);
      }
      if (transitioned && !capAcknowledgement) {
        res.redirect(303, nextPendingHref(memberId));
        return;
      }
      if (capAcknowledgement && memberOnboardingService.getTaskState(memberId, taskType) === 'completed') {
        renderClubAffiliationsCard(req, res, { continueHref: nextPendingHref(memberId) });
        return;
      }

      const taskState = memberOnboardingService.getTaskState(memberId, taskType);
      if (taskState === 'completed') {
        // A completed legacy_claim still renders in two cases: while open
        // staged candidates remain (the cross-source follow-on offer
        // surfaces here right after the first claim completes), and while a
        // linkage is still missing (the claim task is the sole claim and
        // anchor surface, reached from the profile's legacy-claim link after
        // onboarding, so a member who chose "continue without linking" can
        // return). Otherwise completed tasks bounce to the next outstanding
        // one.
        const stillRendersForMember =
          taskType === 'legacy_claim' &&
          (identityAccessService.listOpenStagedCandidates(memberId).length > 0 ||
            memberOnboardingService.legacyClaimLinkageIncomplete(memberId));
        if (!stillRendersForMember) {
          res.redirect(303, nextPendingHref(memberId));
          return;
        }
      }

      await renderTaskByType(req, res, taskType);
    } catch (err) {
      logger.error('onboarding getTask error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  getComplete(req: Request, res: Response, next: NextFunction): void {
    try {
      const memberId = req.user!.userId;
      // Materialize the task rows first, mirroring getTask: a member who reaches
      // this page with zero task rows has an empty outstanding set that would
      // otherwise read as "all done" and render a false completion page while the
      // gate still blocks every capability route.
      memberOnboardingService.startTaskList(memberId);
      // Render only when the membership predicate itself passes; anything less
      // routes the member to the first task still unanswered. Outstanding means
      // not completed, the same definition the gate and the widget use, so this
      // page can never say "handled" while the gate still bounces the member.
      if (!memberOnboardingService.isOnboardingComplete(memberId)) {
        const upcoming = memberOnboardingService.nextOutstandingTaskType(memberId);
        res.redirect(303, upcoming ? taskUrlFor(upcoming) : taskUrlFor('personal_details'));
        return;
      }
      renderComplete(req, res);
    } catch (err) {
      logger.error('onboarding getComplete error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  // The legacy-claim continue-without-linking decision: the member's explicit
  // statement that they never held an old-site account, which completes the
  // required task. Not a skip; the wizard has none.
  async postContinueWithoutLinking(req: Request, res: Response, next: NextFunction): Promise<void> {
    const attestedNoOldAccount = String(req.body?.no_old_account ?? '') === '1';
    await dispatch(req, res, next, 'legacy_claim', {
      action: () => memberOnboardingService.processContinueWithoutLinking(req.user!.userId, attestedNoOldAccount),
      renderValidationError: async (result) => {
        // The attestation is the only validation that can fail; re-render the
        // page with the message so the member sees why the click did not advance.
        await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 422, result.message);
      },
    });
  },

  // The club task's explicit "none of these are my clubs" answer: declines
  // every remaining suggestion card and completes the task in one transaction.
  async postNoClubs(req: Request, res: Response, next: NextFunction): Promise<void> {
    const insightNote = req.body?.insightNote;
    await dispatch(req, res, next, 'club_affiliations', {
      action: () => memberOnboardingService.processNoClubsAnswer(req.user!.userId, insightNote),
      // The no-club answer can fail validation now that it carries the insight
      // note, and a dispatch with no renderer here would return having written
      // nothing at all, leaving the request open.
      renderValidationError: (result) => {
        renderClubAffiliationsCard(req, res, {
          formError:      result.message,
          statusOverride: 422,
        });
      },
    });
  },

  async postLegacyClaimFind(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Anti-enumeration: verify the Turnstile token server-side BEFORE any claim
    // lookup. On failure the form re-renders with a generic message, identical
    // to any other non-result, so a failed challenge reveals nothing. The stub
    // (dev + staging) passes every real token, so this is transparent there.
    const captchaToken = String(req.body['cf-turnstile-response'] ?? '');
    const captcha = await getCaptchaAdapter().verify(captchaToken, req.ip);
    if (!captcha.ok) {
      await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 422,
        'Please complete the verification challenge and try again.');
      return;
    }
    const identifier = String(req.body.identifier ?? '').trim();
    await dispatch(req, res, next, 'legacy_claim', {
      action: () => memberOnboardingService.processLegacyClaimSubmit(req.user!.userId, identifier, req.ip ?? 'unknown'),
      renderValidationError: async (result) => {
        // Surface the validation message inline (e.g. "Enter an identifier to
        // search.") instead of silently reloading the page — D4: empty
        // submits used to look like the click did nothing.
        await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 422, result.message);
      },
      renderRateLimited: async () => {
        await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 429,
          'Too many search attempts. Please wait and try again.');
      },
    });
  },

  async postLegacyClaimAutoLinkConfirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    const personId = String(req.body.personId ?? '').trim();
    await dispatch<LegacyClaimAutoLinkConfirmFormState>(req, res, next, 'legacy_claim', {
      action: () => memberOnboardingService.processLegacyClaimAutoLinkConfirm(req.user!.userId, personId),
      renderValidationError: async (result) => {
        // A validation failure here carries a real, member-safe reason from
        // the service (surname mismatch with its contact-an-administrator
        // guidance, already claimed by another member, already linked,
        // unverified old-email anchor, or the birth-date requirement).
        // Render it inline on the wizard page so the member sees why the
        // confirm did not go through; genuine classifier drift never reaches
        // this branch (the service returns the drift flash for that).
        await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 422, result.message);
      },
    });
  },

  async postCrossSourceLegacyConfirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    const candidateId = String(req.body.candidateId ?? '').trim();
    await dispatch<null>(req, res, next, 'legacy_claim', {
      action: () => memberOnboardingService.processCrossSourceLegacyConfirm(req.user!.userId, candidateId),
      renderValidationError: async (result) => {
        await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 422, result.message);
      },
    });
  },

  async postAnchorSendVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      identityAccessService.requestAnchorMailboxVerification(
        req.user!.userId,
        String(req.body.anchorId ?? ''),
        req.ip ?? 'unknown',
      );
      // Non-revealing: enqueued, already-verified, and not-found all land on
      // the same banner; the member sees mail only when it was really sent.
      res.redirect(303, `${taskUrlFor('legacy_claim')}?anchor_verification=sent`);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
        await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 429, err.message);
        return;
      }
      next(err);
    }
  },

  async getAnchorVerify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = identityAccessService.consumeAnchorMailboxVerification(
        req.user!.userId,
        req.params.token ?? '',
      );
      const flag = result.status === 'verified' ? 'verified' : 'invalid';
      res.redirect(303, `${taskUrlFor('legacy_claim')}?anchor_verification=${flag}`);
    } catch (err) {
      next(err);
    }
  },

  async postLegacyClaimHelpRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      identityAccessService.submitLinkHelpRequest(req.user!.userId, {
        statement:             String(req.body.statement ?? ''),
        claimedLegacyUsername: String(req.body.claimed_legacy_username ?? ''),
        claimedLegacyEmail:    String(req.body.claimed_legacy_email ?? ''),
        vouchers:              String(req.body.vouchers ?? ''),
        isDispute:             req.body.is_dispute === '1',
      });
      res.redirect(303, `${taskUrlFor('legacy_claim')}?help_request=sent`);
    } catch (err) {
      if (err instanceof ValidationError) {
        await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 422, err.message);
        return;
      }
      if (err instanceof RateLimitedError) {
        if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
        await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 429, err.message);
        return;
      }
      next(err);
    }
  },

  async postLegacyClaimAutoLinkDecline(req: Request, res: Response, next: NextFunction): Promise<void> {
    const candidateId = String(req.body.candidateId ?? '').trim();
    const personId = String(req.body.personId ?? '').trim();
    await dispatch<null>(req, res, next, 'legacy_claim', {
      action: () => memberOnboardingService.processLegacyClaimAutoLinkDecline(req.user!.userId, candidateId, personId),
      renderValidationError: () => {
        res.redirect(303, taskUrlFor('legacy_claim'));
      },
    });
  },

  getLegacyClaimTokenConfirm(req: Request, res: Response, next: NextFunction): void {
    try {
      const token = req.params.token ?? '';
      const result = identityAccessService.peekLegacyClaim(req.user!.userId, token);
      if (!result) {
        res.status(400).render('register/wizard/legacy-claim-token-invalid', {
          seo:  { title: 'Claim link no longer valid' },
          page: { sectionKey: 'members', pageKey: 'onboarding_claim_token_invalid', title: 'Claim link no longer valid' },
          content: { dashboardHref: dashboardHrefFor(req) },
        });
        return;
      }
      res.render('register/wizard/legacy-claim-token-confirm', {
        seo:  { title: 'Confirm legacy account link' },
        page: { sectionKey: 'members', pageKey: 'onboarding_claim_token_confirm', title: 'Confirm legacy account link' },
        content: {
          legacyMemberId: result.legacyMemberId,
          displayName:    result.displayName,
          country:        result.country,
          isHof:          result.isHof,
          isBap:          result.isBap,
          token,
          clubAffiliations: result.clubAffiliations,
          eventsAttended:   result.eventsAttended,
        },
      } satisfies PageViewModel<ClaimConfirmContent>);
    } catch (err) {
      logger.error('onboarding claim token peek error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  async postLegacyClaimTokenConfirm(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = String(req.body.token ?? '');
    await dispatch<LegacyClaimTokenConfirmFormState>(req, res, next, 'legacy_claim', {
      action: () => memberOnboardingService.processLegacyClaimTokenConfirm(req.user!.userId, token),
      renderValidationError: (result) => {
        res.status(422).render('register/wizard/legacy-claim-token-invalid', {
          seo:  { title: 'Claim link no longer valid' },
          page: { sectionKey: 'members', pageKey: 'onboarding_claim_token_invalid', title: 'Claim link no longer valid' },
          content: { dashboardHref: dashboardHrefFor(req), error: result.message || undefined },
        });
      },
    });
  },

  async postPersonalDetailsSubmit(req: Request, res: Response, next: NextFunction): Promise<void> {
    const city = String(req.body.city ?? '');
    const region = String(req.body.region ?? '');
    const country = String(req.body.country ?? '');
    const birthDate = String(req.body.birthDate ?? '');
    const gender = String(req.body.gender ?? '');
    const yearValue = String(req.body.year ?? '');
    const showFirstCompetitionYear =
      req.body.showFirstCompetitionYear === '1' || req.body.showFirstCompetitionYear === 'true';
    const showCompetitiveResults =
      req.body.showCompetitiveResults === '1' || req.body.showCompetitiveResults === 'true';
    await dispatch<PersonalDetailsFormState>(req, res, next, 'personal_details', {
      action: () => memberOnboardingService.processPersonalDetailsSubmit(
        req.user!.userId, city, region, country, birthDate, gender, yearValue, showFirstCompetitionYear, showCompetitiveResults),
      renderValidationError: (result) => {
        renderPersonalDetails(req, res, {
          city: result.formState.city,
          region: result.formState.region,
          country: result.formState.country,
          birthDate: result.formState.birthDate,
          gender: result.formState.gender,
          yearValue: result.formState.yearValue,
          showCompetitiveResults: result.formState.showCompetitiveResults,
          error: result.message,
          statusOverride: 422,
        });
      },
    });
  },

  async postClubAffiliationsSubmit(req: Request, res: Response, next: NextFunction): Promise<void> {
    await dispatch<null>(req, res, next, 'club_affiliations', {
      action: () =>
        memberOnboardingService.processClubAffiliationsSubmit(req.user!.userId, req.body),
      renderValidationError: (result) => {
        renderClubAffiliationsCard(req, res, {
          formError:      result.message,
          statusOverride: 422,
        });
      },
    });
  },

  async postAddAnchor(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      identityAccessService.declareAnchor(
        req.user!.userId,
        String(req.body.anchorType ?? ''),
        String(req.body.anchorValue ?? ''),
      );
      res.redirect(303, '/register/wizard/legacy_claim?anchor=saved');
    } catch (err) {
      if (err instanceof ValidationError) {
        await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 422, err.message);
        return;
      }
      next(err);
    }
  },

  postRemoveAnchor(req: Request, res: Response, next: NextFunction): void {
    try {
      identityAccessService.removeAnchor(req.user!.userId, String(req.body.anchorId ?? ''));
      res.redirect(303, '/register/wizard/legacy_claim?anchor=removed');
    } catch (err) {
      next(err);
    }
  },

};
