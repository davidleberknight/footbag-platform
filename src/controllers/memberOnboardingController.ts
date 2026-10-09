import { Request, Response, NextFunction } from 'express';
import {
  identityAccessService,
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
  PersonalDetailsFormState,
  readClaimTarget,
} from '../services/memberOnboardingService';
import { memberService, birthMonthOptions } from '../services/memberService';
import { logger } from '../config/logger';
import { handleControllerError, renderNotFound } from '../lib/controllerErrors';
import { PageViewModel } from '../types/page';
import {
  FLASH_KIND,
  writeFlash,
  readFlash,
  clearFlash,
} from '../lib/flashCookie';

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
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  gender: string;
  yearValue: string;
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
  if (flash.kind === 'WIZARD_CLUB_CARD_RESOLVED') {
    writeFlash(res, req, FLASH_KIND.WIZARD_CLUB_CARD_RESOLVED, JSON.stringify(flash.payload));
    return;
  }
  if (flash.kind === 'WIZARD_CLUB_CAP_HIT') {
    writeFlash(res, req, FLASH_KIND.WIZARD_CLUB_CAP_HIT, JSON.stringify(flash.payload));
  }
}

async function renderLegacyClaim(
  req: Request,
  res: Response,
  statusOverride?: number,
  validationMessage?: string,
): Promise<void> {
  const memberId = req.user!.userId;
  const data = await identityAccessService.getLinkHistoryViewForWizard(memberId);
  if (!data) {
    renderNotFound(res);
    return;
  }
  data.dashboardHref = dashboardHrefFor(req);
  data.declaredAnchors = identityAccessService.listDeclaredAnchors(memberId);
  data.anchorSavedNotice = req.query.anchor === 'saved' ? 'saved' : null;
  // A decision is offered only while the task still needs one. Once it is
  // answered the form would submit into a silent no-op, which reads to the
  // member as a broken button.
  data.showNoLinkAnswers =
    memberOnboardingService.getTaskState(memberId, 'legacy_claim') !== 'completed';
  // The last attempt at the match, opened once by answering that they held an
  // account and cannot find it, and shown on the completed step's own render
  // until they hold an account or a record. The date on file is offered for
  // correction because the matcher runs on it.
  data.sharpenNotice = !data.showNoLinkAnswers && memberOnboardingService.lastAttemptOpen(memberId);
  data.birthDateSavedNotice = req.query.birth_date === 'saved';
  if (data.sharpenNotice || data.birthDateSavedNotice) {
    const parts = memberService.getBirthDateParts(memberId);
    data.birthDay = parts.day;
    data.birthMonth = parts.month;
    data.birthYear = parts.year;
    data.birthMonthOptions = birthMonthOptions(parts.month);
    data.continueHref = nextPendingHref(memberId);
  }
  if (validationMessage) data.validationMessage = validationMessage;
  res.status(statusOverride ?? 200).render('register/wizard/legacy-claim', {
    seo:  { title: 'Find Your Past Records' },
    page: { sectionKey: 'members', pageKey: 'onboarding_legacy_claim', title: 'Find Your Past Records' },
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
    seo:  { title: 'Club Affiliations' },
    page: { sectionKey: 'members', pageKey: 'onboarding_club_affiliations', title: 'Club Affiliations' },
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
  opts: { city?: string; region?: string; country?: string; birthDay?: string; birthMonth?: string; birthYear?: string; gender?: string; yearValue?: string; showCompetitiveResults?: boolean; error?: string | null; statusOverride?: number } = {},
): void {
  const form = memberService.getPersonalDetailsForm(req.user!.userId, opts);
  res.status(opts.statusOverride ?? 200).render('register/wizard/personal-details', {
    seo:  { title: 'Personal Details' },
    page: { sectionKey: 'members', pageKey: 'onboarding_personal_details', title: 'Personal Details' },
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
    seo:  { title: 'Onboarding Complete' },
    page: { sectionKey: 'members', pageKey: 'onboarding_complete', title: 'Onboarding Complete' },
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
    case 'legacy_claim':             await renderLegacyClaim(req, res); return;
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
        res.redirect(303, result.query
          ? `${taskUrlFor(currentTaskType)}?${result.query}`
          : taskUrlFor(currentTaskType));
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

async function claimFromCard(
  req: Request,
  res: Response,
  next: NextFunction,
  withSurname: boolean,
): Promise<void> {
  const target = readClaimTarget(req.body);
  await dispatch<null>(req, res, next, 'legacy_claim', {
    action: () => memberOnboardingService.processClaimCandidate(
      req.user!.userId, target, req.ip ?? 'unknown', withSurname),
    renderValidationError: async (result) => {
      // A member-safe reason from the service: the uniform "no longer
      // available" refusal, or a concurrent claimant having won the record.
      await renderLegacyClaim(req, res, 422, result.message);
    },
    renderRateLimited: async () => {
      await renderLegacyClaim(req, res, 429, 'Too many claim attempts. Please try again later.');
    },
  });
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

      // The wizard belongs to signing up, and claiming belongs to the wizard. A
      // member who has finished has no task here and no claim control that would
      // act, so the surface is closed to them rather than rendered with its
      // controls suppressed. A link they still need is asked for through the
      // identity-link category of the contact form, which an administrator
      // answers by applying the link. This sits below the cap acknowledgement
      // above, which is the one render a member legitimately still needs: the
      // club answer that completed signing up is also what capped them, and the
      // explanation has nowhere else to appear.
      if (req.isMember) {
        res.redirect(303, dashboardHrefFor(req));
        return;
      }

      const taskState = memberOnboardingService.getTaskState(memberId, taskType);
      if (taskState === 'completed') {
        // A completed legacy_claim still renders in one case: the one last
        // attempt at the match that answering "I had one but cannot find it"
        // opened, until the member holds an account or a record. The claim
        // step is one pass, so nothing else brings it back. Otherwise completed
        // tasks bounce to the next outstanding one.
        const stillRendersDuringSignup =
          taskType === 'legacy_claim' && memberOnboardingService.lastAttemptOpen(memberId);
        if (!stillRendersDuringSignup) {
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

  // The legacy-claim task's two non-claiming answers: the member never held an
  // old-site account, or held one and cannot find it. Either completes the
  // required task. Not a skip; the wizard has none.
  async postContinueWithoutLinking(req: Request, res: Response, next: NextFunction): Promise<void> {
    const answer = memberOnboardingService.readNoLinkAnswer(req.body?.no_link_answer);
    await dispatch(req, res, next, 'legacy_claim', {
      action: () => memberOnboardingService.processContinueWithoutLinking(req.user!.userId, answer),
      renderValidationError: async (result) => {
        // A missing answer is the only validation that can fail; re-render the
        // page with the message so the member sees why the click did not advance.
        await renderLegacyClaim(req, res, 422, result.message);
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

  // "This Is Me, Link My History" on a card.
  async postClaimCandidate(req: Request, res: Response, next: NextFunction): Promise<void> {
    await claimFromCard(req, res, next, false);
  },

  // "This is me, I used the surname X" on a card whose surname differs.
  async postClaimWithSurname(req: Request, res: Response, next: NextFunction): Promise<void> {
    await claimFromCard(req, res, next, true);
  },

  async postPersonalDetailsSubmit(req: Request, res: Response, next: NextFunction): Promise<void> {
    const city = String(req.body.city ?? '');
    const region = String(req.body.region ?? '');
    const country = String(req.body.country ?? '');
    const birth = {
      day:   String(req.body.birthDay ?? ''),
      month: String(req.body.birthMonth ?? ''),
      year:  String(req.body.birthYear ?? ''),
    };
    const gender = String(req.body.gender ?? '');
    const yearValue = String(req.body.year ?? '');
    // The form pairs a hidden "0" with the checkbox's "1" so an unchecked box
    // still submits a value, which means a checked box submits both and the
    // body carries an array. The checkbox is written second, so the last value
    // is the member's answer.
    const rawShowCompetitiveResults = Array.isArray(req.body.showCompetitiveResults)
      ? req.body.showCompetitiveResults[req.body.showCompetitiveResults.length - 1]
      : req.body.showCompetitiveResults;
    const showCompetitiveResults =
      rawShowCompetitiveResults === '1' || rawShowCompetitiveResults === 'true';
    await dispatch<PersonalDetailsFormState>(req, res, next, 'personal_details', {
      action: () => memberOnboardingService.processPersonalDetailsSubmit(
        req.user!.userId, city, region, country, birth, gender, yearValue, showCompetitiveResults),
      renderValidationError: (result) => {
        renderPersonalDetails(req, res, {
          city: result.formState.city,
          region: result.formState.region,
          country: result.formState.country,
          birthDay: result.formState.birthDay,
          birthMonth: result.formState.birthMonth,
          birthYear: result.formState.birthYear,
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

  // Correcting the date on file during the claim task's last attempt at the
  // match. The redirect back re-runs the match, because the step recomputes its
  // candidates on every draw, so a corrected date searches again by itself.
  async postLegacyClaimBirthDate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const parts = {
      day:   String(req.body.birthDay ?? ''),
      month: String(req.body.birthMonth ?? ''),
      year:  String(req.body.birthYear ?? ''),
    };
    await dispatch<null>(req, res, next, 'legacy_claim', {
      action: () => memberOnboardingService.processLegacyClaimBirthDate(req.user!.userId, req.user!.slug ?? '', parts),
      renderValidationError: async (result) => {
        await renderLegacyClaim(req, res, 422, result.message);
      },
    });
  },

  async postAddAnchor(req: Request, res: Response, next: NextFunction): Promise<void> {
    await dispatch<null>(req, res, next, 'legacy_claim', {
      action: () => memberOnboardingService.processAddAnchor(
        req.user!.userId, String(req.body.anchorType ?? ''), String(req.body.anchorValue ?? '')),
      renderValidationError: async (result) => {
        await renderLegacyClaim(req, res, 422, result.message);
      },
      renderRateLimited: async () => {
        await renderLegacyClaim(req, res, 429, 'Too many identity-anchor changes. Please try again later.');
      },
    });
  },

};
