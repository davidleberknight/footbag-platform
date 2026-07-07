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
  LegacyClaimAutoLinkConfirmFormState,
  LegacyClaimTokenConfirmFormState,
  PersonalDetailsFormState,
} from '../services/memberOnboardingService';
import { memberService } from '../services/memberService';
import { clubService } from '../services/clubService';
import { logger } from '../config/logger';
import { handleControllerError } from '../lib/controllerErrors';
import { RateLimitedError, ValidationError } from '../services/serviceErrors';
import { PageViewModel } from '../types/page';
import {
  FLASH_KIND,
  writeFlash,
  readFlash,
  clearFlash,
} from '../lib/flashCookie';
import { mayCreateClub } from '../services/tierPredicates';
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
  skipHref:        string;
  card:            WizardCard | null;
  cardsTotal:      number;
  cardsRemaining:  number;
  resolvedNotice:  { clubName: string; decision: 'confirm' | 'correct' | 'decline'; message: string } | null;
  capHitNotice:    { message: string; manageClubsHref: string } | null;
  formError:       string | null;
  isWrapUp?:       boolean;
  noLegacyAffiliationFound?: boolean;
  canCreateClub?:  boolean;
  clubsBrowseHref?: string;
  memberCountry?:  string;
  // Detour links route through the wizard so the optional club task pauses
  // (in_progress_paused) before the member leaves for the clubs surface, and
  // the dashboard can offer "Resume onboarding".
  detourBrowseHref?:  string;
  detourCountryHref?: string;
  detourCreateHref?:  string;
  // Permanent dismissal of the optional club task (distinct from "skip", which
  // the dashboard keeps offering to resume).
  dismissHref?:    string;
}

interface PersonalDetailsContent {
  dashboardHref: string;
  city: string;
  region: string;
  country: string;
  birthDate: string;
  gender: string;
  yearValue: string;
  showCompetitiveResults: boolean;
  error: string | null;
  submitLabel: string;
}

interface WizardCompleteContent {
  dashboardHref: string;
}

function dashboardHrefFor(req: Request): string {
  return `/members/${encodeURIComponent(req.user!.slug)}`;
}

function renderNotFound(res: Response): void {
  res.status(404).render('errors/not-found', {
    seo:  { title: 'Page Not Found' },
    page: { sectionKey: '', pageKey: 'error_404', title: 'Page Not Found' },
  });
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
  res.status(statusOverride ?? 200).render('register/wizard/legacy-claim', {
    seo:  { title: 'Find your past records and clubs' },
    page: { sectionKey: 'members', pageKey: 'onboarding_legacy_claim', title: 'Find your past records and clubs' },
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

function readClubCapHitFlash(req: Request, res: Response): { clubName: string } | null {
  const flash = readFlash(req);
  if (!flash) return null;
  if (flash.kind !== FLASH_KIND.WIZARD_CLUB_CAP_HIT) return null;
  clearFlash(res, req);
  try {
    const payload = JSON.parse(flash.payload ?? '{}');
    if (typeof payload.clubName === 'string') return { clubName: payload.clubName };
  } catch { /* garbage payload: drop the notice */ }
  return null;
}

function renderClubAffiliationsCard(
  req: Request,
  res: Response,
  opts: { formError?: string | null; statusOverride?: number } = {},
): void {
  const memberId = req.user!.userId;
  const cards = memberOnboardingService.listWizardCardsForMember(memberId);
  const resolvedFlash = readClubResolvedFlash(req, res);
  // Pre-shaped banner text so the template never branches on the decision code.
  const RESOLVED_MESSAGES: Record<'confirm' | 'correct' | 'decline', (clubName: string) => string> = {
    confirm: (n) => `Added ${n} to your clubs.`,
    decline: (n) => `Marked ${n} as not yours.`,
    correct: (n) => `Noted that the ${n} record needs correction.`,
  };
  const resolvedNotice = resolvedFlash
    ? { ...resolvedFlash, message: RESOLVED_MESSAGES[resolvedFlash.decision](resolvedFlash.clubName) }
    : null;
  const capHitFlash = readClubCapHitFlash(req, res);
  const capHitNotice = capHitFlash
    ? {
        message: `You are already at the two current-club limit, so ${capHitFlash.clubName} was not added. Leave one of your current clubs to add it.`,
        manageClubsHref: dashboardHrefFor(req),
      }
    : null;
  const cardsRemaining = cards.length;
  const cardsTotal     = resolvedNotice ? cardsRemaining + 1 : cardsRemaining;

  const stage = memberOnboardingService.getClubAffiliationStage(memberId);
  const prefill = memberService.getPersonalDetailsPrefill(memberId);
  const memberCountry = prefill.country ?? null;
  const clubsBrowseHref = clubService.countryBrowseHref(memberCountry);

  res.status(opts.statusOverride ?? 200).render('register/wizard/club-affiliations', {
    seo:  { title: 'Club affiliations' },
    page: { sectionKey: 'members', pageKey: 'onboarding_club_affiliations', title: 'Club affiliations' },
    content: {
      dashboardHref:  dashboardHrefFor(req),
      submitHref:     '/register/wizard/club_affiliations/submit',
      skipHref:       '/register/wizard/club_affiliations/skip',
      card:           cards.length > 0 ? cards[0] : null,
      cardsTotal,
      cardsRemaining,
      resolvedNotice,
      capHitNotice,
      formError:      opts.formError ?? null,
      isWrapUp:       stage === 'wrap_up',
      noLegacyAffiliationFound:
        stage === 'wrap_up' && !memberOnboardingService.memberHadClubSuggestionMaterial(memberId),
      canCreateClub:  mayCreateClub(memberId),
      clubsBrowseHref,
      memberCountry,
      detourBrowseHref:  '/register/wizard/club_affiliations/detour?to=join',
      detourCountryHref: '/register/wizard/club_affiliations/detour?to=country',
      detourCreateHref:  '/register/wizard/club_affiliations/detour?to=create',
      dismissHref:       '/register/wizard/club_affiliations/dismiss',
    },
  } satisfies PageViewModel<ClubAffiliationsCardContent>);
}

function renderPersonalDetails(
  req: Request,
  res: Response,
  opts: { city?: string; region?: string; country?: string; birthDate?: string; gender?: string; yearValue?: string; showCompetitiveResults?: boolean; error?: string | null; statusOverride?: number } = {},
): void {
  const prefill = memberService.getPersonalDetailsPrefill(req.user!.userId);
  const yearValue =
    opts.yearValue !== undefined
      ? opts.yearValue
      : prefill.firstCompetitionYear != null
      ? String(prefill.firstCompetitionYear)
      : '';
  res.status(opts.statusOverride ?? 200).render('register/wizard/personal-details', {
    seo:  { title: 'Personal details' },
    page: { sectionKey: 'members', pageKey: 'onboarding_personal_details', title: 'Personal details' },
    content: {
      dashboardHref: dashboardHrefFor(req),
      city: opts.city ?? prefill.city,
      region: opts.region ?? prefill.region,
      country: opts.country ?? prefill.country,
      birthDate: opts.birthDate ?? prefill.birthDate,
      gender: opts.gender ?? prefill.gender,
      yearValue,
      showCompetitiveResults: opts.showCompetitiveResults ?? prefill.showCompetitiveResults,
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
    content: { dashboardHref: dashboardHrefFor(req) },
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
      let transitioned = false;
      if (taskType === 'legacy_claim') {
        transitioned = memberOnboardingService.ensureLegacyClaimReflectsState(memberId);
      } else if (taskType === 'club_affiliations') {
        transitioned = memberOnboardingService.ensureClubAffiliationsReflectsState(memberId);
      }
      if (transitioned) {
        res.redirect(303, nextPendingHref(memberId));
        return;
      }

      const taskState = memberOnboardingService.getTaskState(memberId, taskType);
      if (taskState === 'completed' || taskState === 'not_applicable') {
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
      // Don't lie: if any task is still outstanding (pending or paused mid-flow),
      // route the member to the next one instead of telling them everything is
      // handled. Uses the same outstanding-task source the gate middleware uses.
      const upcoming = memberOnboardingService.nextOutstandingTaskType(memberId);
      if (upcoming) {
        res.redirect(303, taskUrlFor(upcoming));
        return;
      }
      renderComplete(req, res);
    } catch (err) {
      logger.error('onboarding getComplete error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  async postSkip(req: Request, res: Response, next: NextFunction): Promise<void> {
    const taskType = req.params.taskType;
    if (!isValidTaskType(taskType)) {
      renderNotFound(res);
      return;
    }
    const attestedNoOldAccount = String(req.body?.no_old_account ?? '') === '1';
    await dispatch(req, res, next, taskType, {
      action: () => memberOnboardingService.processTaskSkip(req.user!.userId, taskType, attestedNoOldAccount),
      renderValidationError: async (result) => {
        // Only the legacy_claim decision can fail validation (the "I never had an
        // old account" attestation); re-render its page with the message so the
        // member sees why the click did not advance.
        if (taskType === 'legacy_claim') {
          await renderLegacyClaim(req, res, { ...EMPTY_FLASH }, 422, result.message);
          return;
        }
        res.redirect(303, taskUrlFor(taskType));
      },
    });
  },

  // Detour out of the optional club task to join or create a club. The pause is
  // recorded in the onboarding service (the club task becomes in_progress_paused
  // and the dashboard offers "Resume onboarding") before redirecting to the
  // plain clubs surface, so the clubs controller never owns onboarding logic.
  getClubDetour(req: Request, res: Response, next: NextFunction): void {
    try {
      const memberId = req.user!.userId;
      const to = req.query.to;
      let dest: string;
      let targetStory: string;
      let sourceCard: string;
      if (to === 'create') {
        dest = '/clubs/create';
        targetStory = 'M_Create_Club';
        sourceCard = 'create_club';
      } else if (to === 'country') {
        const country = memberService.getPersonalDetailsPrefill(memberId).country ?? null;
        dest = clubService.countryBrowseHref(country);
        targetStory = 'M_Join_Club';
        sourceCard = 'clubs_in_country';
      } else {
        dest = '/clubs';
        targetStory = 'M_Join_Club';
        sourceCard = 'browse_clubs';
      }
      memberOnboardingService.transitionToDetourPaused(memberId, 'club_affiliations', targetStory, sourceCard);
      res.redirect(303, dest);
    } catch (err) {
      logger.error('onboarding club detour error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
  },

  // Permanently dismiss the optional club task so the dashboard stops offering
  // it (distinct from "skip", which stays resumable). Returns to the dashboard.
  postClubDismiss(req: Request, res: Response, next: NextFunction): void {
    try {
      memberOnboardingService.dismissClubAffiliationsTask(req.user!.userId);
      res.redirect(303, dashboardHrefFor(req));
    } catch (err) {
      logger.error('onboarding club dismiss error', { error: err instanceof Error ? err.message : String(err) });
      next(err);
    }
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
