/**
 * IdentityAccessService -- account entry and authentication.
 *
 * Owns:
 *   - Registration, email verification, credential check, password change/reset
 *   - Legacy archive passthrough JWT
 *   - Legacy-account claim flow (two-step token + email-equality fast path)
 *   - Direct historical-person claim (surname-match precondition; first-name-variant warning)
 *   - Auto-link classification
 *   - Silent auto-link claim transaction (high / medium confidence): atomic
 *     member↔legacy↔HP merge + single legacy.claim_tier_grant + audit row +
 *     notification email enqueue with tokened report-incorrect link
 *   - First-login confirmation card lifecycle (medium-confidence only):
 *     persist on silent claim, surface to dashboard, confirm / dismiss /
 *     report-incorrect transitions
 *   - Tokened revert of a silent claim (anti-enumerating: unrecognized,
 *     expired, and already-used tokens return the same status as a real
 *     already-reverted claim)
 *
 * Does not own:
 *   - Member profile CRUD (MemberService)
 *   - Historical-person reads (HistoryService)
 *   - Tier calculation or grants (MembershipTieringService -- this service delegates)
 *   - Session-cookie HTTP glue (controller responsibility)
 *   - Club lifecycle or club-leader promotion beyond bootstrap confirmation (ClubService)
 *
 * Non-negotiable invariants:
 *   - Anti-enumeration on every account-existence-leaking path. Same code path, same
 *     timing, same response shape for "exists" vs "does not exist". No controller
 *     short-circuit around an earlier existence check.
 *   - Rate limiting is in-service; controllers map RateLimitedError to HTTP 429
 *     with Retry-After from retryAfterSeconds.
 *   - Tokens stored as SHA-256 hashes only; plaintext never persisted.
 *   - JWT payload embeds password_version; bumping it invalidates all outstanding JWTs.
 *   - Deceased members cannot log in regardless of credentials.
 *   - Soft-deleted members within member_cleanup_grace_days get the restoration screen.
 *   - Silent auto-link claim, tier grant, audit row, pending-card write, and
 *     report-incorrect token issuance commit in one transaction; the
 *     notification email is enqueued AFTER the transaction commits via
 *     enqueueEmailOrFail. An outbox failure leaves the claim committed and
 *     records a legacy.auto_link_notification_failed audit row via
 *     recordOperationalError; the caller (runBatchAutoLink) treats the
 *     re-thrown error as skipped_error. The notification email's
 *     idempotency key is bound to the claim audit row id so reruns of
 *     runBatchAutoLink collapse onto the existing outbox row.
 *   - Auto-link revert (member-initiated, from card or tokened email link) is
 *     idempotent: a second revert returns `already_reverted` without state
 *     change. Pending card rows are cleared as part of every revert so the
 *     dashboard does not keep asking about a link that no longer exists.
 *
 * Transaction discipline:
 *   - Multi-write paths (claim merge, password reset + version bump, register + audit)
 *     wrap in transaction(() => { ... }) from db.ts. All DB ops inside are synchronous;
 *     external I/O (SES, etc.) happens BEFORE the transaction opens.
 *   - In-tx variants (consumeAndClaimLegacyInTx, claimHistoricalPersonInTx) accept a
 *     caller-owned transaction so the wizard orchestrator can merge the claim and the
 *     member_onboarding_tasks row transition inside one transaction.
 *
 * Persistence:
 *   members, members_active, legacy_members, historical_persons (read-only for HP-match),
 *   account_tokens, member_club_affiliations, club_bootstrap_leaders, club_leaders,
 *   audit_entries, outbox_emails, members.pending_auto_link_card_json (silent
 *   claim card lifecycle). Tier-grant writes delegated to MembershipTieringService.
 *
 * Side effects:
 *   - audit_entries append (auth, claim, bootstrap, silent-claim, confirm, revert)
 *   - outbox_emails enqueue (verification, reset, claim email, resend, silent
 *     auto-link notification)
 *   - work_queue_items insert (auto_link_revert_review on every revert)
 *
 * Service shape: singleton object (no external adapters beyond db.ts and the KMS-backed
 * JwtSigningAdapter resolved via getJwtSigningAdapter()).
 */
import { randomUUID } from 'crypto';
import argon2 from 'argon2';
import { auth, registration, legacyClaim, legacyMembers, account, workQueue, pendingAutoLinkCard, MemberAuthRow, LegacyMemberRow, AlreadyClaimedRow, HistoricalPersonClaimRow } from '../db/db';
import { transaction } from '../db/db';
import { accountTokenService } from './accountTokenService';
import { getCommunicationService } from './communicationService';
import { hit as rateLimitHit } from './rateLimitService';
import { readIntConfig } from './configReader';
import { config } from '../config/env';
// CUTOVER-REMOVE: dev/staging admin shortcuts.
// Current: applyDevStagingBootstrapAdmin and shouldSkipClaimEmailForAdmin are
//   active in dev/staging only; the env-config fail-fast guard prevents the
//   flag enabling them from being set in production.
// Target: remove this import and all call sites (the bootstrap call in
//   registerMember and the skip-claim branch in claimLegacyByEmailKnown)
//   at production go-live.
import { applyDevStagingBootstrapAdmin, shouldSkipClaimEmailForAdmin } from '../dev-shortcuts/runtime';
import { RateLimitedError, ServiceError, ValidationError } from './serviceErrors';
import { isUniqueConstraintError } from './sqliteRetry';
import { findAutoLinkCandidates } from './nameVariantsService';
import { appendAuditEntry } from './auditService';
import { recordOperationalError } from './operationalErrors';
import { applyAutoLinkRevertGrantInTx, applyLegacyClaimGrantInTx } from './membershipTieringService';
import { createHash } from 'crypto';
import { logger } from '../config/logger';
import { simulatedEmailService, type SimulatedEmailPreview } from './simulatedEmailService';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const MAX_DISPLAY_NAME = 64;

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

import { slugify } from './slugify';
import { extractSurname, stripAccents, surnameKey } from './nameUtils';

/**
 * Generate a unique slug. Appends _2, _3, etc. on conflict.
 */
function generateUniqueSlug(displayName: string): string {
  const base = slugify(displayName);
  if (!base) {
    // Fallback for names that produce empty slugs (e.g. all non-ASCII).
    const fallback = `member_${randomUUID().slice(0, 8)}`;
    return fallback;
  }

  const exists = (slug: string): boolean =>
    (registration.checkSlugExists.get(slug) as { exists_flag: number } | undefined) !== undefined;

  if (!exists(base)) return base;

  let suffix = 2;
  while (exists(`${base}_${suffix}`)) suffix++;
  return `${base}_${suffix}`;
}

// ── Page content contracts ─────────────────────────────────────────────────
// Consumed by authController and claimController renders. Kept here so page
// contracts live with the domain service that owns the business logic behind
// each page.

export interface LoginContent {
  returnTo?: string;
  authReason?: string;
  error?: string;
}

export interface RegisterContent {
  error?: string;
  realName?: string;
  displayName?: string;
  email?: string;
}

export interface CheckEmailContent {
  resent?: boolean;
  emailPreview?: SimulatedEmailPreview;
}

export interface VerifyResultContent {
  ok: boolean;
  signInPrompt?: boolean;
}

export type PasswordForgotContent = Record<string, never>;

export interface PasswordForgotSentContent {
  email?: string;
  /**
   * Simulated-email card view-model. Populated only when SES_ADAPTER=stub
   * (dev) or SES_SANDBOX_MODE=1 (staging sandbox); null in production.
   * Mirrors the pattern in /register/check-email so developers can complete
   * the password-reset flow without leaving the page.
   */
  emailPreview?: SimulatedEmailPreview;
}

export interface PasswordResetContent {
  token: string | undefined;
  error?: string;
}

export interface ClaimFormContent {
  identifier?: string;
  message?: string;
  error?: string;
  candidates?: Array<{ personId: string; personName: string }>;
  skipHref?: string;
  sent?: boolean;
  /**
   * Low-confidence banner gate. Rendered as a one-line preamble when the
   * user landed on /history/claim from a registration redirect or from an
   * auto-link drift redirect that reported low confidence. Decouples the
   * page's generic "search for your record" copy from the registration
   * context "we tried, we couldn't confirm" framing.
   */
  lowConfidenceBanner?: boolean;
  /**
   * Simulated-email card for the post-submit sent state. Populated only
   * when SES_ADAPTER=stub (dev) or SES_SANDBOX_MODE=1 (staging sandbox);
   * null in production. Mirrors the pattern in /register/check-email so
   * developers can complete the claim flow without leaving the page.
   */
  emailPreview?: SimulatedEmailPreview;
  /**
   * Dev-only operator note shown above the simulated-email card on the sent
   * state when no email was actually enqueued (anti-enumeration silent paths:
   * no_match, target_rate_limited). Lets the operator distinguish a real
   * enqueue from a silent no-op without leaking the reason in the public
   * banner. Always undefined in production (the simulated-email card itself
   * does not render in production).
   */
  outcomeNote?: string;
}

export interface AutoLinkConfirmContent {
  personId?: string;
  personName?: string;
  confidence?: 'high' | 'medium';
  matchedVariantNormalized?: string;
  error?: string;
  declineHref: string;
  skipHref?: string;
}

export interface ClaimHpConfirmContent {
  personId?: string;
  personName?: string;
  country?: string | null;
  isHof?: boolean;
  isBap?: boolean;
  firstNameWarning?: boolean;
  error?: string;
  cancelHref: string;
}

/**
 * One card in the onboarding wizard's legacy_claim candidate list at
 * `/register/wizard/legacy_claim`. Each card abstracts over the underlying
 * table (`legacy_members` or `historical_persons` or both via the
 * `historical_persons.legacy_member_id` back-link) so the user does not need
 * to know which one a record lives in.
 *
 * `claimMode` drives the card's action:
 *  - `auto_link_confirm`: the verify-time classifier matched a high/medium
 *    HP. Card POSTs to `/register/wizard/legacy_claim/auto-link/confirm`
 *    with `personId` so the endpoint re-validates classification (drift
 *    safety).
 *  - `legacy_claim`: legacy_members row, with or without an HP back-link.
 *    Card POSTs to `/register/wizard/legacy_claim/find` with
 *    `identifier=legacyMemberId`; the wizard re-renders inline (POST-render-
 *    next) so the user stays on the wizard. On `auto_linked` outcome the
 *    transitive HP claim runs in the same transaction when the back-link
 *    exists.
 *  - `hp_review_page`: HP-only candidate (no legacy back-link). Card links
 *    to `/history/<personId>/claim` (review page that surfaces HoF /
 *    country / first-name-warning fields before commit).
 *  - `already_linked`: read-only badge; no action.
 */
export interface LinkHistoryCandidate {
  /** Discriminator. */
  claimMode: 'auto_link_confirm' | 'legacy_claim' | 'hp_review_page' | 'already_linked';
  /** Display copy: full name as it appears on the matched record. */
  displayName: string;
  /** Provenance phrase for the card subtitle. */
  provenanceLabel: string;
  /** Identifier for `legacy_claim` cards. Form posts `identifier=this`. */
  legacyMemberId: string | null;
  /** Identifier for `auto_link_confirm` (POST body) and `hp_review_page` (URL). */
  personId: string | null;
  country: string | null;
  isHof: boolean;
  isBap: boolean;
  /** "Claimed Jan 12, 2024" string for `already_linked` legacy badges. */
  alreadyLinkedSinceDisplay: string | null;
}

/**
 * View-model for the onboarding wizard's legacy_claim view at
 * `/register/wizard/legacy_claim`. ONE section: a mixed candidate list
 * (legacy + HP + both, presented uniformly with provenance labels) plus
 * a manual-id input that tries both tables, plus a clubs-coming-soon
 * placeholder card. The wizard is the post-verify destination for every
 * classifier outcome and the dashboard task-widget resume target.
 *
 * Sent-state notice + simulated-email card render inline after a manual-id
 * submission (POST-render-next, no redirect) so the user stays on the wizard.
 */
export interface LinkHistoryContent {
  memberSlug: string;
  /** Set when arriving via ?from=register; renders the dashboard skip link. */
  skipHref: string | null;
  /** Always-rendered "Back to dashboard" link, points at `/members`. */
  dashboardHref: string;
  /**
   * Mixed candidate list. Order: classifier auto_link_confirm card first
   * (when present), then legacy_claim cards (email match + manual matches),
   * then hp_review_page cards (name candidates not already covered), then
   * already_linked cards last (so unlinked options stay visually prominent).
   */
  candidates: LinkHistoryCandidate[];
  /**
   * Sent-state notice for redirect-back-to-wizard after a manual legacy
   * claim. Carries the simulated-email card (dev/sandbox only) and an
   * optional dev outcomeNote when the silent anti-enumeration paths fired.
   */
  sentNotice: {
    /** "We sent a confirmation email…" banner gate. */
    show: boolean;
    /** Dev-mode operator note (no_match / target_rate_limited explainer). */
    outcomeNote?: string;
    emailPreview?: SimulatedEmailPreview;
  };
  /** Anti-enumeration "identifier didn't match" inline notice. */
  noMatchNotice: boolean;
  /**
   * Echo-back of the identifier the user typed, surfaced inside the
   * no-match notice so they can see what was actually tried (helps spot
   * typos and confirm what the server received). Capped to 80 chars at the
   * controller boundary; null when no echo is available.
   */
  noMatchTried: string | null;
  /** Banner shown when user arrived via ?from=register or ?reason=low_confidence. */
  lowConfidenceBanner: boolean;
  /**
   * Wizard PRG banner: the user's previously suggested auto-link match
   * no longer applies (drift between GET and POST). Surfaced after a
   * 303 from postLegacyClaimAutoLinkConfirm's drift fallback.
   */
  autoLinkDriftNotice: boolean;
  /**
   * Inline form-validation message (e.g. "Enter an identifier to search.")
   * surfaced as a banner when the legacy_claim search POST returns a
   * validation_error. Threaded through by the controller; null/undefined
   * when no validation message applies.
   */
  validationMessage?: string;
  /**
   * Static "Your clubs (coming soon)" placeholder per
   * `M_Review_Legacy_Club_Data_During_Claim`. The bootstrap pipeline that
   * surfaces actual suggestions is not built yet; this is a placeholder.
   */
  showClubsComingSoon: boolean;
}

export interface ClaimConfirmContent {
  legacyMemberId: string;
  displayName: string | null;
  country: string | null;
  isHof: boolean;
  isBap: boolean;
  token: string;
}

// ── Business result contracts ──────────────────────────────────────────────

export interface RegisteredMember {
  id: string;
  slug: string;
  displayName: string;
  isAdmin: number;
  passwordVersion: number;
}

export interface RegisterResult {
  /**
   * Always redirect to /register/check-email regardless of which branch ran.
   * Duplicate-email registrations silently take the 'silent_duplicate' branch
   * to prevent account enumeration.
   */
  status: 'registered' | 'silent_duplicate';
}

/**
 * Verify member credentials against the database.
 *
 * Returns the member row on success, null on any failure (wrong password,
 * not found, unverified, deceased).
 */
// Lazy-initialised dummy argon2id hash used to equalise wall-clock between
// the present-user verify path and the absent-user no-row path. argon2.verify
// always returns false against this hash for any input the caller supplies,
// so the result is unconditionally discarded; only the wall-clock matters.
// Anti-enumeration contract per DD §3.3: response timing must not leak
// whether an email is registered.
let _dummyHashPromise: Promise<string> | null = null;
function getDummyArgonHash(): Promise<string> {
  if (_dummyHashPromise === null) {
    _dummyHashPromise = argon2.hash('footbag-dummy-timing-equaliser');
  }
  return _dummyHashPromise;
}

async function verifyMemberCredentials(
  email: string,
  password: string,
): Promise<MemberAuthRow | null> {
  const normalized = normalizeEmail(email);
  const member = auth.findMemberByEmail.get(normalized) as MemberAuthRow | undefined;

  if (!member) {
    // Phantom verify against a constant hash so wall-clock for absent
    // emails matches the present-email verify path. Result is discarded;
    // we always return null on this branch. Defends against the timing
    // oracle that would otherwise enumerate registered emails.
    try {
      await argon2.verify(await getDummyArgonHash(), password);
    } catch {
      // argon2.verify can throw on certain malformed-hash conditions;
      // swallow because the only purpose here is the wall-clock cost.
    }
    return null;
  }

  const valid = await argon2.verify(member.password_hash, password);
  if (!valid) {
    return null;
  }

  const now = new Date().toISOString();
  auth.updateMemberLastLogin.run(now, now, member.id);

  return member;
}

/**
 * Attempt a login: rate-limit by normalized email + client IP, then delegate
 * to credential verification. Throws RateLimitedError when the bucket is
 * exceeded; returns null on invalid credentials.
 */
async function attemptLogin(
  email: string,
  password: string,
  ip: string,
): Promise<MemberAuthRow | null> {
  const normalized = normalizeEmail(email);
  const maxAttempts = readIntConfig('login_rate_limit_max_attempts', 10);
  const windowMinutes = readIntConfig('login_rate_limit_window_minutes', 15);
  const rl = rateLimitHit(`login:${normalized}:${ip}`, maxAttempts, windowMinutes);
  if (!rl.allowed) {
    const emailHash = createHash('sha256').update(normalized).digest('hex');
    appendAuditEntry({
      actionType: 'auth.login_rate_limited',
      category: 'auth',
      actorType: 'system',
      actorMemberId: null,
      entityType: 'login_attempt',
      entityId: emailHash,
      metadata: {
        retryAfterSeconds: rl.retryAfterSeconds,
        windowMinutes,
        maxAttempts,
      },
    });
    throw new RateLimitedError(
      'Too many failed login attempts. Please try again later.',
      rl.retryAfterSeconds,
    );
  }
  return verifyMemberCredentials(email, password);
}

/**
 * Validate a full legal name for registration.
 * Rules: required, 2-64 chars, at least two words, at least one word 2+ chars, no digits.
 */
function validateRealName(name: string): void {
  if (!name) {
    throw new ValidationError('Full legal name is required.');
  }
  if (name.length > MAX_DISPLAY_NAME) {
    throw new ValidationError(`Full legal name must be ${MAX_DISPLAY_NAME} characters or fewer.`);
  }
  if (/\d/.test(name)) {
    throw new ValidationError('Full legal name must not contain digits.');
  }
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    throw new ValidationError('Full legal name must include at least a first name and last name.');
  }
  if (!words.some(w => w.length >= 2)) {
    throw new ValidationError('Full legal name must include at least one name that is two or more characters.');
  }
}

/**
 * Validate that a display name shares a surname with the real name.
 */
function validateDisplayNameSurname(displayName: string, realName: string): void {
  const displaySurname = stripAccents(extractSurname(displayName)).toLowerCase();
  const realSurname = stripAccents(extractSurname(realName)).toLowerCase();
  if (displaySurname !== realSurname) {
    throw new ValidationError('Display name must include your last name.');
  }
}

async function registerMember(
  email: string,
  password: string,
  confirmPassword: string,
  realName: string,
  displayName: string,
): Promise<RegisterResult> {
  const trimmedRealName = realName.trim();
  const trimmedDisplayName = displayName.trim() || trimmedRealName;
  const trimmedEmail = email.trim();
  const normalizedEmail = normalizeEmail(trimmedEmail);

  validateRealName(trimmedRealName);

  if (trimmedDisplayName.length > MAX_DISPLAY_NAME) {
    throw new ValidationError(`Display name must be ${MAX_DISPLAY_NAME} characters or fewer.`);
  }
  if (trimmedDisplayName !== trimmedRealName) {
    validateDisplayNameSurname(trimmedDisplayName, trimmedRealName);
  }

  if (!trimmedEmail) {
    throw new ValidationError('Email address is required.');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
  if (password !== confirmPassword) {
    throw new ValidationError('Passwords do not match.');
  }

  const emailExists = registration.checkEmailExists.get(normalizedEmail) as { exists_flag: number } | undefined;
  if (emailExists) {
    // Anti-enumeration: render the same check-email page for an
    // already-registered address. We do not re-issue a token here;
    // the existing verified account is unaffected. The UNIQUE-constraint
    // catch below handles the residual race-window case where a concurrent
    // registration commits between this check and the insert.
    return { status: 'silent_duplicate' };
  }

  const id = `member_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const hash = await argon2.hash(password);
  const now = new Date().toISOString();

  // Insert with race-defensive catch:
  //   - UNIQUE on login_email_normalized: concurrent registration won the
  //     race; return the same silent_duplicate shape so the response is
  //     observationally identical to the pre-check happy path.
  //   - UNIQUE on slug: another insert claimed the slug we picked; regenerate
  //     and retry up to MAX_SLUG_RETRIES times. Bounded retry; the slug
  //     suffix space is large so collisions resolve quickly.
  const MAX_SLUG_RETRIES = 3;
  let slug = generateUniqueSlug(trimmedDisplayName);
  let inserted = false;
  for (let attempt = 0; attempt <= MAX_SLUG_RETRIES; attempt += 1) {
    try {
      registration.insertMember.run(
        id,
        slug,
        trimmedEmail,
        normalizedEmail,
        null,  // email_verified_at — NULL until verify link consumed
        hash,
        now,   // password_changed_at
        trimmedRealName,                    // real_name
        trimmedDisplayName,                 // display_name
        trimmedDisplayName.toLowerCase(),   // display_name_normalized
        now,   // created_at
        now,   // updated_at
      );
      inserted = true;
      break;
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      const msg = String((err as Error).message ?? '');
      if (msg.includes('login_email_normalized')) {
        // Email race lost. Anti-enumeration: same response shape as the
        // pre-check duplicate path.
        return { status: 'silent_duplicate' };
      }
      if (msg.includes('slug') && attempt < MAX_SLUG_RETRIES) {
        slug = generateUniqueSlug(trimmedDisplayName);
        continue;
      }
      // Unknown unique constraint (e.g. PK id collision — astronomically
      // rare with 24-char random hex) or slug retries exhausted. Let it
      // propagate to the controller's generic error handler.
      throw err;
    }
  }
  if (!inserted) {
    // Defense-in-depth: should be unreachable, but if the loop somehow
    // exits without inserting, fail loud rather than continue post-insert.
    throw new Error('registerMember: insert did not commit after retry loop');
  }

  applyDevStagingBootstrapAdmin({ memberId: id, normalizedEmail, now }); // CUTOVER-REMOVE

  await issueAndEnqueueVerifyEmail(id, trimmedEmail);

  appendAuditEntry({
    actionType: 'auth.register',
    category: 'auth',
    actorType: 'system',
    actorMemberId: null,
    entityType: 'member',
    entityId: id,
  });

  return { status: 'registered' };
}

/**
 * Outcome of combining the email-anchor check with name-variant candidates.
 * Read-only classification; never initiates a link.
 *
 * Tier 1/2 are only emitted when THREE anchors all agree:
 *   1. The member's login_email matches a legacy_members row.
 *   2. A historical_persons row provenances to that legacy account
 *      (HP.legacy_member_id == legacy_members.legacy_member_id).
 *   3. findAutoLinkCandidates(real_name) returns exactly one candidate,
 *      and that candidate is the provenance HP.
 *
 * Anything short of that collapses to `low` confidence (review). `none`
 * applies when there is no email anchor at all.
 *
 * Note: `confidence` here is the auto-link match confidence, not the member
 * tier-grant level. The two are distinct concepts that share unrelated
 * label sets (`high`/`medium`/`low`/`none` vs `tier0`/`tier1`/`tier2`/`tier3`).
 */
export type AutoLinkClassification =
  | { confidence: 'none' }
  | { confidence: 'high'; personId: string; personName: string }
  | { confidence: 'medium'; personId: string; personName: string; matchedVariantNormalized: string }
  | {
      confidence: 'low';
      reason:
        | 'no_hp_for_legacy_account'
        | 'no_name_candidate'
        | 'multiple_name_candidates'
        | 'hp_mismatch'
        | 'ambiguous_email_anchor';
    };

export interface VerifyEmailResult {
  memberId: string;
  slug: string;
  passwordVersion: number;
  isAdmin: number;
  legacyMatch: LegacyAccountLookupResult | null;
  autoLinkClassification: AutoLinkClassification;
}

async function issueAndEnqueueVerifyEmail(memberId: string, recipientEmail: string): Promise<void> {
  const { rawToken, tokenRowId } = accountTokenService.issueToken({
    memberId,
    tokenType: 'email_verify',
    ttlHours: 24,
  });
  const baseUrl = config.publicBaseUrl.replace(/\/+$/, '');
  const verifyUrl = `${baseUrl}/verify/${rawToken}`;
  try {
    getCommunicationService().enqueueEmailOrFail({
      // tokenRowId is the natural single-use key: re-issuing on a worker
      // restart between SES-send and outbox-mark-sent collapses to the same
      // outbox row instead of double-delivering.
      idempotencyKey: `verify:${tokenRowId}`,
      recipientEmail,
      recipientMemberId: memberId,
      subject: 'Verify your IFPA Footbag account',
      bodyText:
        'Welcome to IFPA Footbag.\n\n' +
        'Please confirm your email address by opening the link below. The link expires in 24 hours.\n\n' +
        `${verifyUrl}\n\n` +
        'If you did not request this account, you can ignore this message.',
    });
  } catch (err) {
    // Member row (or, for resend, the existing unverified member) committed
    // but no verify email was queued. Operator review should treat this as
    // a possible outbox / SES degradation signal; the affected member can
    // self-recover via /verify/resend.
    recordOperationalError({
      actionType: 'auth.register_notification_failed',
      category: 'auth',
      entityType: 'member',
      entityId: memberId,
      reasonText: 'Member row committed but verify-email enqueue failed.',
      cause: err,
      metadata: { tokenRowId },
    });
    throw err;
  }
}

/**
 * Consume an email_verify token, mark the member verified, run the legacy-link
 * check, and return the session inputs the controller needs to issue a JWT.
 * Returns null if the token is invalid, expired, or already used.
 */
async function verifyEmailByToken(rawToken: string): Promise<VerifyEmailResult | null> {
  const consumed = accountTokenService.consumeToken(rawToken, 'email_verify');
  if (!consumed) return null;

  const now = new Date().toISOString();
  const update = auth.markEmailVerified.run(now, now, consumed.memberId);
  // update.changes may be 0 if the member was already verified; that's fine
  // since the token itself is single-use, we proceed with login in any case.

  const row = auth.findMemberForSessionAfterVerify.get(consumed.memberId) as
    | { id: string; slug: string | null; login_email: string | null; real_name: string | null; password_version: number; is_admin: number }
    | undefined;
  if (!row) return null;

  // Legacy-link check: see whether this member's email matches an
  // imported legacy row so the post-verify landing can offer the claim
  // flow. lookupLegacyAccount throws on already-claimed; at verify time
  // the member has never claimed, so errors here are swallowed.
  let legacyMatch: LegacyAccountLookupResult | null = null;
  let emailAmbiguous = false;
  if (row.login_email) {
    try {
      const lookup = lookupLegacyAccount(row.id, row.login_email);
      if (lookup.kind === 'single') legacyMatch = lookup.result;
      else if (lookup.kind === 'ambiguous_email') emailAmbiguous = true;
    } catch {
      legacyMatch = null;
    }
  }

  const autoLinkClassification: AutoLinkClassification = emailAmbiguous
    ? { confidence: 'low', reason: 'ambiguous_email_anchor' }
    : classifyAutoLink(row.real_name, legacyMatch);
  logger.info('verify.autolink.classification', {
    memberId: row.id,
    confidence: autoLinkClassification.confidence,
    ...(autoLinkClassification.confidence === 'low'
      ? { reason: autoLinkClassification.reason }
      : {}),
    ...(autoLinkClassification.confidence === 'high' || autoLinkClassification.confidence === 'medium'
      ? { personId: autoLinkClassification.personId }
      : {}),
  });

  return {
    memberId: row.id,
    slug: row.slug ?? row.id,
    passwordVersion: row.password_version,
    isAdmin: row.is_admin,
    legacyMatch,
    autoLinkClassification,
  };
}

/**
 * Re-run the verify-time auto-link classification for an authenticated member.
 * Read-only. Used to re-derive the classification server-side rather than
 * trust a request parameter, in the wizard's `auto_link_confirm` card
 * composition and in the POST drift-safety check at
 * `/register/wizard/legacy_claim/auto-link/confirm`. Returns
 * `{ confidence: 'none' }` if the member is not found.
 */
function getAutoLinkClassificationForMember(memberId: string): AutoLinkClassification {
  const member = legacyClaim.findClaimingMember.get(memberId) as
    | { id: string; real_name: string; legacy_member_id: string | null; historical_person_id: string | null }
    | undefined;
  if (!member) return { confidence: 'none' };

  // If the member is already linked (legacy or HP), the auto-link UI should
  // fall through — don't re-offer a link they already have.
  if (member.legacy_member_id || member.historical_person_id) {
    return { confidence: 'none' };
  }

  const loginEmail = (auth.findMemberForSessionAfterVerify.get(memberId) as
    | { login_email: string | null }
    | undefined)?.login_email;
  if (!loginEmail) return { confidence: 'none' };

  let legacyMatch: LegacyAccountLookupResult | null = null;
  let emailAmbiguous = false;
  try {
    const lookup = lookupLegacyAccount(memberId, loginEmail);
    if (lookup.kind === 'single') legacyMatch = lookup.result;
    else if (lookup.kind === 'ambiguous_email') emailAmbiguous = true;
  } catch {
    legacyMatch = null;
  }
  if (emailAmbiguous) {
    return { confidence: 'low', reason: 'ambiguous_email_anchor' };
  }
  return classifyAutoLink(member.real_name, legacyMatch);
}

interface IdentityLinksRow {
  legacy_member_id:        string | null;
  legacy_claimed_at:       string | null;
  historical_person_id:    string | null;
  historical_person_name:  string | null;
}

/**
 * Compose the unified link-history wizard's view-model. ONE candidate list
 * mixing legacy_members + historical_persons + back-linked "both" cases.
 * Composition order:
 *   1. Verify-time classifier output (high/medium HP) → `auto_link_confirm` card.
 *   2. Email-anchored legacy match → `legacy_claim` card (collapsed with
 *      the back-linked HP if present).
 *   3. Other HP candidates from `findAutoLinkCandidates(real_name)` →
 *      `hp_review_page` cards (skipping any HP already covered above).
 *   4. Already-linked badges last.
 *
 * Reuses `getAutoLinkClassificationForMember`, `lookupLegacyAccount` (by
 * login_email), `findAutoLinkCandidates` (by real_name), and
 * `account.findIdentityLinks` — no new DB statements.
 *
 * `sentNotice`, `noMatchNotice`, and `lowConfidenceBanner` are HTTP-context
 * inputs from the controller (driven by `?sent=1`, `?nomatch=1`, and
 * `?from=register | ?reason=low_confidence`). They're threaded in here so
 * the template stays logic-light.
 *
 * Returns null when the member is not found (controller renders 404).
 */
function getLinkHistoryView(
  memberId: string,
  opts: {
    fromRegister: boolean;
    reasonIsLowConfidence: boolean;
    sentOutcome: 'enqueued' | 'no_match' | 'target_rate_limited' | null;
    sinceIndex: number | null;
    noMatchNotice: boolean;
    noMatchTried: string | null;
  },
): LinkHistoryContent | null {
  const member = legacyClaim.findClaimingMember.get(memberId) as ClaimingMemberRow | undefined;
  if (!member) return null;

  const links = account.findIdentityLinks.get(memberId) as IdentityLinksRow | undefined;
  const legacyLinked = links?.legacy_member_id != null;
  const hpLinked     = links?.historical_person_id != null;

  const candidates: LinkHistoryCandidate[] = [];

  // 1. Verify-time classifier output. Only when neither linkage is present
  // (the classifier returns 'none' when either is set).
  const classification = legacyLinked || hpLinked
    ? ({ confidence: 'none' } as AutoLinkClassification)
    : getAutoLinkClassificationForMember(memberId);
  let classifierPersonId: string | null = null;
  if (classification.confidence === 'high' || classification.confidence === 'medium') {
    classifierPersonId = classification.personId;
    candidates.push({
      claimMode: 'auto_link_confirm',
      displayName: classification.personName,
      provenanceLabel: classification.confidence === 'high'
        ? 'Likely your record (matched by name and email).'
        : 'Possible match (matched by a name variant and email).',
      legacyMemberId: null,
      personId: classification.personId,
      country: null,
      isHof: false,
      isBap: false,
      alreadyLinkedSinceDisplay: null,
    });
  }

  // 2. Email-anchored legacy match. Skipped when legacy is already linked.
  // Also skipped when the classifier card above already represents this
  // person (transitive: classifier walked email → legacy → HP back-link).
  let emailLegacyMemberId: string | null = null;
  if (!legacyLinked && member.login_email_normalized) {
    try {
      const lookup = lookupLegacyAccount(memberId, member.login_email_normalized);
      if (lookup.kind === 'single') {
        const row = legacyMembers.findByLegacyMemberId.get(lookup.result.legacyMemberId) as LegacyMemberRow | undefined;
        if (row) {
          emailLegacyMemberId = row.legacy_member_id;
          // Detect "both" via HP back-link to avoid duplicate cards.
          const backHp = legacyClaim.findHistoricalPersonByLegacyId.get(row.legacy_member_id) as HistoricalPersonClaimRow | undefined;
          const isBoth = backHp != null;
          // Skip if the classifier card above already covers this HP.
          const alreadyShownAsClassifier = isBoth && classifierPersonId === backHp!.person_id;
          if (!alreadyShownAsClassifier) {
            candidates.push({
              claimMode: 'legacy_claim',
              displayName: lookup.result.displayName ?? row.real_name ?? 'Unknown',
              provenanceLabel: isBoth
                ? 'Old footbag.org user account + competition history.'
                : 'Old footbag.org user account.',
              legacyMemberId: row.legacy_member_id,
              personId: backHp?.person_id ?? null,
              country: lookup.result.country,
              isHof: lookup.result.isHof,
              isBap: lookup.result.isBap,
              alreadyLinkedSinceDisplay: null,
            });
          }
        }
      }
    } catch (_e) {
      // Non-revealing on lookup errors; just skip the email-anchored card.
    }
  }

  // 3. Other HP candidates by name. Skip any HP already covered above
  // (classifier card or legacy "both" card).
  if (!hpLinked) {
    const seenPersonIds = new Set<string>();
    if (classifierPersonId) seenPersonIds.add(classifierPersonId);
    for (const c of candidates) if (c.personId) seenPersonIds.add(c.personId);
    for (const c of findAutoLinkCandidates(member.real_name)) {
      if (seenPersonIds.has(c.personId)) continue;
      candidates.push({
        claimMode: 'hp_review_page',
        displayName: c.personName,
        provenanceLabel: 'Competition record.',
        legacyMemberId: null,
        personId: c.personId,
        country: null,
        isHof: false,
        isBap: false,
        alreadyLinkedSinceDisplay: null,
      });
    }
  }

  // 4. Already-linked badges last (visually less prominent than the
  // actionable cards above). Provenance is a real label (not "Linked.") so
  // the card reads e.g. "Your old footbag.org user account / Legacy account"
  // and the linked-since line carries the date when available; the template
  // does not render a second "Linked." badge on top of the provenance line.
  if (legacyLinked) {
    candidates.push({
      claimMode: 'already_linked',
      displayName: 'Your old footbag.org user account',
      provenanceLabel: 'Legacy account.',
      legacyMemberId: links?.legacy_member_id ?? null,
      personId: null,
      country: null,
      isHof: false,
      isBap: false,
      alreadyLinkedSinceDisplay: links?.legacy_claimed_at ? formatDateForDisplay(links.legacy_claimed_at) : null,
    });
  }
  if (hpLinked) {
    candidates.push({
      claimMode: 'already_linked',
      displayName: links?.historical_person_name ?? 'Your competition record',
      provenanceLabel: 'Historical-person record.',
      legacyMemberId: null,
      personId: links?.historical_person_id ?? null,
      country: null,
      isHof: false,
      isBap: false,
      alreadyLinkedSinceDisplay: null,
    });
  }

  // Sent-state composition (dev only). The simulated-email card scopes to
  // `sinceIndex` so the operator only sees messages from this turn.
  let emailPreview: SimulatedEmailPreview | undefined;
  if (opts.sentOutcome && opts.sinceIndex != null) {
    // The controller computes emailPreview when rendering the sent state;
    // this view-model carries only the shape the template consumes.
  }
  let outcomeNote: string | undefined;
  if (opts.sentOutcome === 'no_match' && config.sesAdapter === 'stub') {
    outcomeNote = "No confirmation email was sent for this attempt. The identifier may not match an eligible legacy record. (Production users see the same banner regardless — anti-enumeration.)";
  } else if (opts.sentOutcome === 'target_rate_limited' && config.sesAdapter === 'stub') {
    outcomeNote = "No confirmation email was sent for this attempt. The legacy mailbox has hit its hourly send cap. (Production users see the same banner regardless — anti-enumeration.)";
  }

  return {
    memberSlug: member.slug,
    skipHref: opts.fromRegister ? '/members' : null,
    dashboardHref: '/members',
    candidates,
    sentNotice: {
      show: opts.sentOutcome !== null,
      outcomeNote,
      emailPreview,
    },
    noMatchNotice: opts.noMatchNotice,
    noMatchTried: opts.noMatchTried,
    // Low-confidence banner is only meaningful when we have NO actionable
    // candidate to offer. Once a candidate appears (manual-id search hit, an
    // auto-link suggestion, a name-variant HP review) the banner contradicts
    // the card the user can act on, so suppress it.
    lowConfidenceBanner:
      !legacyLinked
      && (opts.fromRegister || opts.reasonIsLowConfidence)
      && !candidates.some((c) => c.claimMode !== 'already_linked'),
    autoLinkDriftNotice: false,
    showClubsComingSoon: true,
  };
}

function formatDateForDisplay(iso: string): string {
  // Best-effort short month + day + year. Falls back to raw on parse failure.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/**
 * Classify the post-verify auto-link situation.
 *
 * Pure function against inputs + DB reads. No writes, no throws, no state.
 * `high` and `medium` confidence require email + HP-provenance + unique name
 * match; anything else that has an email anchor collapses to `low`. Callers
 * use the output to decide UI; no auto-link is committed here.
 */
function classifyAutoLink(
  realName: string | null,
  legacyMatch: LegacyAccountLookupResult | null,
): AutoLinkClassification {
  if (!legacyMatch) return { confidence: 'none' };

  const hpProvenance = legacyClaim.findHistoricalPersonByLegacyId.get(
    legacyMatch.legacyMemberId,
  ) as HistoricalPersonClaimRow | undefined;
  if (!hpProvenance) {
    return { confidence: 'low', reason: 'no_hp_for_legacy_account' };
  }

  const candidates = findAutoLinkCandidates(realName ?? '');
  if (candidates.length === 0) {
    return { confidence: 'low', reason: 'no_name_candidate' };
  }
  if (candidates.length > 1) {
    return { confidence: 'low', reason: 'multiple_name_candidates' };
  }

  const candidate = candidates[0];
  if (candidate.personId !== hpProvenance.person_id) {
    return { confidence: 'low', reason: 'hp_mismatch' };
  }

  // Align with lookupHistoricalPersonForClaim's surname block. A legitimate
  // name_variants pair (e.g. curated display-name rows like
  // "Boris Belouin Ollivier" -> "Boris Belouin") can link two identities
  // whose surnames legitimately differ. The existing claim flow would
  // refuse such a claim at 422; downgrade the classification here so the
  // UX never sends such a user to an endpoint that will reject them.
  if (!normalizedSurnamesMatch(realName, candidate.personName)) {
    return { confidence: 'low', reason: 'hp_mismatch' };
  }

  if (candidate.matchKind === 'exact') {
    return {
      confidence: 'high',
      personId: candidate.personId,
      personName: candidate.personName,
    };
  }
  return {
    confidence: 'medium',
    personId: candidate.personId,
    personName: candidate.personName,
    matchedVariantNormalized: candidate.matchedVariantNormalized ?? '',
  };
}

/**
 * Re-send an email_verify token to an unverified member. Rate-limited per
 * normalized email; silently no-ops when the bucket is exceeded or no
 * unverified member matches (identical response for anti-enumeration).
 */
async function resendVerifyEmail(email: string): Promise<void> {
  const normalized = normalizeEmail(email);
  const maxAttempts = readIntConfig('verify_resend_rate_limit_max_attempts', 3);
  const windowMinutes = readIntConfig('verify_resend_rate_limit_window_minutes', 60);
  const rl = rateLimitHit(`verify-resend:${normalized}`, maxAttempts, windowMinutes);
  if (!rl.allowed) return;
  const row = auth.findUnverifiedMemberByEmail.get(normalized) as
    | { id: string }
    | undefined;
  if (!row) return;
  await issueAndEnqueueVerifyEmail(row.id, email.trim());
}

// ── Legacy account claim flow (three-table design) ──────────────────────────
//
// Operates against the legacy_members table. Claim marks the row (sets
// claimed_by_member_id + claimed_at); the row is never deleted. If the claimed
// legacy account has a matching historical_persons.legacy_member_id,
// members.historical_person_id is also set in the same transaction.

export interface LegacyAccountLookupResult {
  legacyMemberId: string;
  displayName: string | null;
  country: string | null;
  isHof: boolean;
  isBap: boolean;
}

/**
 * Outcome of a legacy-account lookup by identifier (email / username / id).
 *
 * The `ambiguous_email` branch signals that the identifier matches 2+ rows.
 * Callers MUST NOT silently pick one. Verify-time paths surface this as
 * classification `low / ambiguous_email_anchor`; the manual claim form
 * surfaces it as a form-level error asking the user to disambiguate.
 */
export type LegacyAccountLookup =
  | { kind: 'none' }
  | { kind: 'single'; result: LegacyAccountLookupResult }
  | { kind: 'ambiguous_email'; count: number };

function lookupLegacyAccount(
  requestingMemberId: string,
  identifier: string,
): LegacyAccountLookup {
  const trimmed = identifier.trim();
  if (!trimmed) {
    throw new ValidationError('Please enter a legacy identifier.');
  }

  const already = legacyClaim.checkAlreadyClaimed.get(requestingMemberId) as AlreadyClaimedRow | undefined;
  if (already) {
    throw new ValidationError('Your account is already linked to a legacy record.');
  }

  const rows = legacyMembers.findAllByIdentifier.all(trimmed, trimmed, trimmed) as LegacyMemberRow[];
  if (rows.length === 0) return { kind: 'none' };
  if (rows.length > 1) {
    return { kind: 'ambiguous_email', count: rows.length };
  }

  const row = rows[0]!;
  return {
    kind: 'single',
    result: {
      legacyMemberId: row.legacy_member_id,
      displayName: row.display_name ?? row.real_name ?? null,
      country: row.country,
      isHof: Boolean(row.is_hof),
      isBap: Boolean(row.is_bap),
    },
  };
}

/**
 * Execute the three-table claim merge inside the caller's transaction.
 * Throws ValidationError on every gate failure; the caller's transaction
 * rolls back any preceding writes (e.g. a token consume) when this throws.
 */
function claimLegacyAccountInTx(requestingMemberId: string, targetLegacyMemberId: string): void {
  const already = legacyClaim.checkAlreadyClaimed.get(requestingMemberId) as AlreadyClaimedRow | undefined;
  if (already) {
    throw new ValidationError('Your account is already linked to a legacy record.');
  }

  const row = legacyMembers.findByLegacyMemberId.get(targetLegacyMemberId) as LegacyMemberRow | undefined;
  if (!row) {
    throw new ValidationError('The legacy record is no longer available for claim.');
  }
  if (row.claimed_by_member_id) {
    throw new ValidationError('This legacy record has already been claimed by another account.');
  }

  const now = new Date().toISOString();

  const marked = legacyMembers.markClaimed.run(requestingMemberId, now, targetLegacyMemberId);
  if (marked.changes === 0) {
    throw new ValidationError('This legacy record has already been claimed by another account.');
  }

  legacyClaim.transferLegacyFields.run(
    row.legacy_member_id,
    row.legacy_user_id,
    row.legacy_email,
    row.bio ?? '',
    row.birth_date,
    row.street_address,
    row.postal_code,
    row.city,
    row.region,
    row.country,
    row.ifpa_join_date,
    row.is_hof,
    row.is_bap,
    row.first_competition_year,
    now,
    requestingMemberId,
  );

  const hp = legacyClaim.findHistoricalPersonByLegacyId.get(row.legacy_member_id) as HistoricalPersonClaimRow | undefined;
  if (hp) {
    legacyMembers.setMemberHistoricalPersonId.run(hp.person_id, now, requestingMemberId);
    legacyClaim.mergeHistoricalPersonFields.run(
      hp.country,
      hp.hof_member,
      hp.bap_member,
      hp.hof_induction_year,
      hp.first_year,
      now,
      requestingMemberId,
    );
  }

  // Single tier grant per DD §2551 / SC §LegacyClaim / MIGRATION_PLAN §3.
  // Honors-only fallback: HoF or BAP (from either the legacy row or the
  // transitive HP) → tier2; otherwise tier0. Same transaction as the merge.
  const hasHof = Boolean(row.is_hof) || Boolean(hp?.hof_member);
  const hasBap = Boolean(row.is_bap) || Boolean(hp?.bap_member);
  applyLegacyClaimGrantInTx(requestingMemberId, requestingMemberId, hasHof, hasBap, {
    source:           'legacy_claim',
    legacy_member_id: row.legacy_member_id,
    legacy_user_id:   row.legacy_user_id,
    transitive_hp_id: hp?.person_id ?? null,
  });

  // Audit-trail for the legacy claim merge. Symmetric with the
  // claim.historical_person entry written by claimHistoricalPerson — both
  // identity-merge paths land in audit_entries so a disputed link can be
  // reconstructed (who claimed what, when, with what HP back-link).
  appendAuditEntry({
    actionType:    'claim.legacy_account',
    category:      'identity',
    actorType:     'member',
    actorMemberId: requestingMemberId,
    entityType:    'member',
    entityId:      requestingMemberId,
    reasonText:    null,
    metadata: {
      legacy_member_id:   row.legacy_member_id,
      legacy_user_id:     row.legacy_user_id,
      transitive_hp_id:   hp?.person_id ?? null,
    },
  });
}

/**
 * Execute the three-table claim transaction.
 *
 * Marks the legacy_members row claimed (atomic via WHERE claimed_by_member_id IS NULL),
 * copies merge-eligible fields to the claiming members row, and if the legacy account
 * has a matching historical_persons row (shared legacy_member_id), also sets
 * members.historical_person_id so the member↔HP FK link is established.
 */
function claimLegacyAccount(requestingMemberId: string, targetLegacyMemberId: string): void {
  transaction(() => {
    claimLegacyAccountInTx(requestingMemberId, targetLegacyMemberId);
  });
}

// ── Auto-link silent claim ──────────────────────────────────────────────────
//
// One-shot batch cutover claim. Given a high- or medium-confidence classifier
// outcome for a Tier-0 unlinked member, perform the merge silently in a single
// transaction:
//   1. Mark the legacy_members row claimed (race-closed via WHERE IS NULL).
//   2. Transfer the legacy account's merge-eligible fields onto the member.
//   3. Set the member's historical_person_id back-link via the legacy
//      account's HP provenance row, and merge HP attribution fields.
//   4. Apply the single legacy.claim_tier_grant member_tier_grants row.
//   5. For medium confidence only, persist a pending_auto_link_card payload
//      so the dashboard surfaces a first-login confirm/dismiss/report card.
//   6. Append a legacy.auto_link_silent_claim audit_entries row; capture its
//      id so the notification email's report-incorrect link can carry it.
//   7. Issue a long-TTL auto_link_report_incorrect token bound to that audit
//      id, render the notification body, and enqueue the email with an
//      idempotency key derived from the audit id so reruns coalesce.
//
// Non-throwing discriminated return: low-confidence and "no HP back-link" and
// "already claimed by other" cases skip silently so the caller (runBatchAutoLink)
// can tally them without try/catch.
export type AutoLinkSilentClaimResult =
  | { status: 'claimed'; confidence: 'high' | 'medium'; claimAuditId: string }
  | { status: 'skipped_already_linked' }
  | { status: 'skipped_no_legacy_for_hp' }
  | { status: 'skipped_legacy_claimed_by_other' }
  | { status: 'skipped_no_email' };

export interface AutoLinkSilentClaimInput {
  confidence: 'high' | 'medium';
  personId: string;
  personName: string;
  matchedVariantNormalized?: string;
}

function applyAutoLinkSilentClaim(
  memberId: string,
  classification: AutoLinkSilentClaimInput,
): AutoLinkSilentClaimResult {
  const member = legacyClaim.findClaimingMember.get(memberId) as
    | {
        id: string;
        slug: string | null;
        real_name: string;
        legacy_member_id: string | null;
        historical_person_id: string | null;
        login_email_normalized: string | null;
        email_verified_at: string | null;
      }
    | undefined;
  if (!member) return { status: 'skipped_already_linked' };
  if (member.legacy_member_id !== null || member.historical_person_id !== null) {
    return { status: 'skipped_already_linked' };
  }

  const hp = legacyClaim.findHistoricalPersonById.get(classification.personId) as
    | HistoricalPersonClaimRow
    | undefined;
  if (!hp || !hp.legacy_member_id) {
    return { status: 'skipped_no_legacy_for_hp' };
  }

  const lm = legacyMembers.findByLegacyMemberId.get(hp.legacy_member_id) as LegacyMemberRow | undefined;
  if (!lm) {
    return { status: 'skipped_no_legacy_for_hp' };
  }
  if (lm.claimed_by_member_id && lm.claimed_by_member_id !== memberId) {
    return { status: 'skipped_legacy_claimed_by_other' };
  }

  const recipientEmail = member.login_email_normalized;
  if (!recipientEmail) {
    return { status: 'skipped_no_email' };
  }

  // Claim, tier grant, audit row, pending-card write, and report-incorrect
  // token commit atomically. The notification email is enqueued AFTER the
  // transaction commits so an outbox failure does not lose the claim;
  // recordOperationalError persists a legacy.auto_link_notification_failed
  // row and the re-thrown error becomes skipped_error in runBatchAutoLink.
  const txnResult = transaction(() => {
    const now = new Date().toISOString();

    const marked = legacyMembers.markClaimed.run(memberId, now, lm.legacy_member_id);
    if (marked.changes === 0) {
      return {
        kind:   'skipped' as const,
        result: { status: 'skipped_legacy_claimed_by_other' as const },
      };
    }

    legacyClaim.transferLegacyFields.run(
      lm.legacy_member_id,
      lm.legacy_user_id,
      lm.legacy_email,
      lm.bio ?? '',
      lm.birth_date,
      lm.street_address,
      lm.postal_code,
      lm.city,
      lm.region,
      lm.country,
      lm.ifpa_join_date,
      lm.is_hof,
      lm.is_bap,
      lm.first_competition_year,
      now,
      memberId,
    );

    legacyMembers.setMemberHistoricalPersonId.run(hp.person_id, now, memberId);
    legacyClaim.mergeHistoricalPersonFields.run(
      hp.country,
      hp.hof_member,
      hp.bap_member,
      hp.hof_induction_year,
      hp.first_year,
      now,
      memberId,
    );

    const hasHof = Boolean(lm.is_hof) || Boolean(hp.hof_member);
    const hasBap = Boolean(lm.is_bap) || Boolean(hp.bap_member);
    applyLegacyClaimGrantInTx(memberId, memberId, hasHof, hasBap, {
      source:           'auto_link_silent_claim',
      confidence:       classification.confidence,
      legacy_member_id: lm.legacy_member_id,
      legacy_user_id:   lm.legacy_user_id,
      transitive_hp_id: hp.person_id,
      ...(classification.confidence === 'medium' && classification.matchedVariantNormalized
        ? { matched_variant_normalized: classification.matchedVariantNormalized }
        : {}),
    });

    const claimAuditId = appendAuditEntry({
      actionType:    'legacy.auto_link_silent_claim',
      category:      'identity',
      actorType:     'system',
      actorMemberId: null,
      entityType:    'member',
      entityId:      memberId,
      reasonText:    null,
      metadata: {
        confidence:               classification.confidence,
        legacy_member_id:         lm.legacy_member_id,
        legacy_user_id:           lm.legacy_user_id,
        transitive_hp_id:         hp.person_id,
        set_historical_person_id: true,
        has_hof:                  hasHof,
        has_bap:                  hasBap,
        ...(classification.confidence === 'medium' && classification.matchedVariantNormalized
          ? { matched_variant_normalized: classification.matchedVariantNormalized }
          : {}),
      },
    });

    const legacyDisplayName = lm.display_name ?? lm.real_name ?? classification.personName;
    if (classification.confidence === 'medium') {
      const cardPayload = JSON.stringify({
        personId:               classification.personId,
        personName:             classification.personName,
        confidence:             'medium' as const,
        matchedVariantNormalized: classification.matchedVariantNormalized ?? null,
        legacyMemberId:         lm.legacy_member_id,
        legacyDisplayName,
        claimAuditId,
      });
      pendingAutoLinkCard.setForMember.run(cardPayload, now, 'auto_link_silent_claim', memberId);
    }

    const ttlHours = readIntConfig('auto_link_report_incorrect_expiry_hours', 90 * 24);
    const { rawToken } = accountTokenService.issueToken({
      memberId,
      tokenType: 'auto_link_report_incorrect',
      ttlHours,
      targetAuditEntryId: claimAuditId,
    });
    const baseUrl = config.publicBaseUrl.replace(/\/+$/, '');
    const reportIncorrectUrl = `${baseUrl}/auto-link/report-incorrect/${rawToken}`;

    const tierGrantSummary = hasHof || hasBap
      ? ' and grants you the IFPA membership tier associated with that record'
      : '';
    const hofFlagText = hasHof ? '\n\nThis record is recognized as a Hall of Fame member.' : '';
    const bapFlagText = hasBap ? '\n\nThis record is recognized as a Big Add Posse member.' : '';

    const emailPayload = {
      idempotencyKey:    `auto_link_notification:${claimAuditId}`,
      recipientEmail,
      recipientMemberId: memberId,
      subject:           'IFPA: We have linked your account to your competition history',
      bodyText:
        `Hello ${member.real_name},\n\n` +
        `We have linked your IFPA account to the legacy footbag.org record for ${legacyDisplayName}. ` +
        `This grants you attribution for the competition history attached to that record${tierGrantSummary}.${hofFlagText}${bapFlagText}\n\n` +
        `If this link is not correct, please tell us:\n${reportIncorrectUrl}\n\n` +
        `You can also review and manage linked legacy accounts from your profile settings.\n\n` +
        `-- IFPA`,
    };

    return {
      kind:   'claimed' as const,
      result: { status: 'claimed' as const, confidence: classification.confidence, claimAuditId },
      emailPayload,
    };
  });

  if (txnResult.kind === 'skipped') return txnResult.result;

  try {
    getCommunicationService().enqueueEmailOrFail(txnResult.emailPayload);
  } catch (err) {
    recordOperationalError({
      actionType: 'legacy.auto_link_notification_failed',
      category:   'identity',
      entityType: 'member',
      entityId:   memberId,
      reasonText: 'Auto-link silent claim committed but notification-email enqueue failed.',
      cause:      err,
      metadata: {
        claimAuditId:   txnResult.result.claimAuditId,
        legacyMemberId: lm.legacy_member_id,
      },
    });
    throw err;
  }

  return txnResult.result;
}

export interface PendingAutoLinkCardView {
  personId:       string;
  personName:     string;
  confidence:     'medium';
  matchedVariantNormalized: string | null;
  legacyMemberId: string;
  legacyDisplayName: string;
  claimAuditId:   string;
}

function getPendingAutoLinkCard(memberId: string): PendingAutoLinkCardView | null {
  const row = pendingAutoLinkCard.readForMember.get(memberId) as
    | { pending_auto_link_card_json: string | null; pending_auto_link_card_dismissed_at: string | null }
    | undefined;
  if (!row || !row.pending_auto_link_card_json || row.pending_auto_link_card_dismissed_at !== null) {
    return null;
  }
  try {
    return JSON.parse(row.pending_auto_link_card_json) as PendingAutoLinkCardView;
  } catch {
    return null;
  }
}

function confirmAutoLinkCard(memberId: string): { status: 'confirmed' | 'no_card' } {
  const card = getPendingAutoLinkCard(memberId);
  if (!card) return { status: 'no_card' };
  transaction(() => {
    const now = new Date().toISOString();
    pendingAutoLinkCard.clearForMember.run(now, 'auto_link_confirmed', memberId);
    appendAuditEntry({
      actionType:    'legacy.auto_link_confirmed',
      category:      'identity',
      actorType:     'member',
      actorMemberId: memberId,
      entityType:    'member',
      entityId:      memberId,
      reasonText:    null,
      metadata: {
        legacy_member_id:        card.legacyMemberId,
        original_claim_audit_id: card.claimAuditId,
      },
    });
  });
  return { status: 'confirmed' };
}

function dismissAutoLinkCard(memberId: string): { status: 'dismissed' | 'no_card' } {
  const now = new Date().toISOString();
  const result = pendingAutoLinkCard.markDismissed.run(now, now, 'auto_link_dismissed', memberId);
  if (result.changes === 0) return { status: 'no_card' };
  return { status: 'dismissed' };
}

// ── Two-step emailed-token legacy claim flow ─────────────────────────────────
//
// Per docs/MIGRATION_PLAN.md §7, the production claim flow is mailbox-verified
// rather than direct-lookup: the member submits an identifier, the server
// issues a single-use token and emails it to the legacy account's
// `legacy_email`, and a follow-on confirm step consumes the token and runs
// the merge. The two-step flow is non-revealing: the POST response is
// identical for matched, unmatched, ambiguous, and ineligible identifiers.

// Legacy-claim init rate-limit knobs are admin-configurable via
// `system_config_current` (read on every call). Defaults below match the
// seed values in `database/schema.sql`. The per-target and per-IP caps
// preserve anti-enumeration by returning silent outcomes (not throws); the
// per-member cap is the one place legitimate users get explicit feedback.
function claimInitMaxPerMember(): number {
  return readIntConfig('legacy_claim_init_rate_limit_max_per_member', 5);
}
function claimInitWindowMinutes(): number {
  return readIntConfig('legacy_claim_init_rate_limit_window_minutes', 60);
}
function claimInitMaxPerTarget(): number {
  return readIntConfig('legacy_claim_init_rate_limit_max_per_target', 3);
}
function claimInitMaxPerIp(): number {
  return readIntConfig('legacy_claim_init_rate_limit_max_per_ip', 10);
}
function claimTokenTtlHours(): number {
  return readIntConfig('account_claim_expiry_hours', 24);
}

/**
 * Possible outcomes of `initiateLegacyClaim`. The HTTP response surface is
 * identical for `enqueued`, `no_match`, and `target_rate_limited` (anti-
 * enumeration: the controller renders the same generic banner regardless).
 * The outcome is consumed by the controller solely for dev-mode operator
 * visibility (the simulated-email card shows an explainer when no email was
 * actually sent).
 *
 * `auto_linked` is observable to the user (different next-page redirect),
 * but it is reachable only when the requesting member has a verified
 * `login_email` that equals the legacy row's `legacy_email`. A non-matching
 * attacker still produces `no_match` and gets the silent generic banner.
 */
export type InitiateLegacyClaimOutcome =
  | { kind: 'enqueued' }
  | { kind: 'no_match' }
  | { kind: 'target_rate_limited' }
  | { kind: 'ip_rate_limited' }
  | { kind: 'auto_linked' };

/**
 * Step 1 of the two-step claim flow. Looks up the identifier; if exactly one
 * eligible legacy_members row matches AND it has a deliverable legacy_email,
 * issues an `account_claim` token and enqueues an email containing the
 * confirm-step URL. Returns an `InitiateLegacyClaimOutcome` discriminator;
 * callers must render the same generic banner for the non-revealing kinds
 * (`no_match`, `target_rate_limited`) to honor the anti-enumeration contract.
 *
 * Email-equality fast path: when the requesting member's verified login_email
 * matches the legacy row's legacy_email, mailbox control is already proven by
 * registration verification. The merge runs synchronously and the second
 * token-email step is skipped (outcome `auto_linked`).
 *
 * Rate-limited per requesting member (mitigates sock-puppet spam from one
 * actor) AND per target legacy_member_id (caps the total mail volume to one
 * mailbox regardless of how many requesting members try to claim it). The
 * per-target check fires AFTER the lookup so it spends a bucket only when
 * the identifier actually resolves to a row, preserving the non-revealing
 * UX contract.
 */
function initiateLegacyClaim(
  requestingMemberId: string,
  identifier: string,
  ip: string,
): InitiateLegacyClaimOutcome {
  const trimmed = identifier.trim();
  if (!trimmed) {
    throw new ValidationError('Please enter a legacy identifier.');
  }

  // Per-IP cap (DD §3.8). Silent outcome to preserve anti-enumeration: an
  // attacker rotating sock-puppet members from one IP cannot tell whether
  // they're capped vs simply not finding matches. Throws are reserved for
  // the per-member cap, where the legitimate user owns the feedback signal.
  const windowMinutes = claimInitWindowMinutes();
  const ipRl = rateLimitHit(`legclaim-ip:${ip}`, claimInitMaxPerIp(), windowMinutes);
  if (!ipRl.allowed) return { kind: 'ip_rate_limited' };

  const rl = rateLimitHit(`legclaim-init:${requestingMemberId}`, claimInitMaxPerMember(), windowMinutes);
  if (!rl.allowed) {
    throw new RateLimitedError(
      'Too many claim attempts. Please try again in an hour.',
      rl.retryAfterSeconds,
    );
  }

  // Look up without throwing: only ServiceError paths collapse to the neutral
  // outcome below (no token issued, no email sent). Runtime errors (schema
  // mismatch, OOM, missing prepared statement) propagate so operators see a
  // signal in logs when emails aren't being delivered.
  let row: LegacyMemberRow | undefined;
  try {
    const lookup = lookupLegacyAccount(requestingMemberId, trimmed);
    if (lookup.kind === 'single') {
      row = legacyMembers.findByLegacyMemberId.get(lookup.result.legacyMemberId) as LegacyMemberRow | undefined;
    }
  } catch (e) {
    if (!(e instanceof ServiceError)) throw e;
    row = undefined;
  }

  if (!row) return { kind: 'no_match' };

  // Email-equality fast path. The requesting member proved control of
  // login_email at registration verify; if that email equals the legacy row's
  // legacy_email, no second token-email is required. Run the merge inline.
  // Reachable only after a positive lookup, so a non-matching attacker still
  // gets the silent `no_match` outcome above and cannot distinguish branches.
  // Skipped silently when legacy_email is NULL (stub rows in dev where the
  // legacy data dump has not been loaded).
  const member = legacyClaim.findClaimingMember.get(requestingMemberId) as ClaimingMemberRow | undefined;
  if (
    row.legacy_email &&
    member?.email_verified_at &&
    member.login_email_normalized &&
    member.login_email_normalized === normalizeEmail(row.legacy_email)
  ) {
    transaction(() => {
      claimLegacyAccountInTx(requestingMemberId, row!.legacy_member_id);
    });
    return { kind: 'auto_linked' };
  }

  // CUTOVER-REMOVE: dev-admin shortcut that skips the email step.
  // Current: when the requesting member is a dev-admin (per
  //   shouldSkipClaimEmailForAdmin), the legacy claim is merged inline
  //   without sending a verification email; env-config blocks this branch
  //   in production. Other dev shortcuts are catalogued in
  //   src/dev-shortcuts/runtime.ts.
  // Target: remove this whole branch at production go-live; production
  //   admins recover legacy claims via manualLegacyClaimRecovery.
  if (shouldSkipClaimEmailForAdmin(requestingMemberId)) {
    transaction(() => {
      claimLegacyAccountInTx(requestingMemberId, row!.legacy_member_id);
    });
    return { kind: 'auto_linked' };
  }

  // Email path requires a deliverable address. After the shortcuts above are
  // declined (or unavailable), a stub legacy_members row with no legacy_email
  // collapses to the same neutral no_match outcome a missing row would.
  if (!row.legacy_email) return { kind: 'no_match' };

  // Per-target cap: once a single legacy mailbox has received
  // claimInitMaxPerTarget() emails, further attempts from any member
  // are silently dropped (UX still renders the same non-revealing response
  // to honor the anti-enumeration contract). Returns the silent outcome
  // rather than throwing so the caller cannot distinguish "target capped"
  // from "no match".
  const targetRl = rateLimitHit(
    `legclaim-target:${row.legacy_member_id}`,
    claimInitMaxPerTarget(),
    windowMinutes,
  );
  if (!targetRl.allowed) return { kind: 'target_rate_limited' };

  const { rawToken, tokenRowId } = accountTokenService.issueToken({
    memberId:              requestingMemberId,
    tokenType:             'account_claim',
    ttlHours:              claimTokenTtlHours(),
    targetLegacyMemberId:  row.legacy_member_id,
  });
  const baseUrl    = config.publicBaseUrl.replace(/\/+$/, '');
  const confirmUrl = `${baseUrl}/register/wizard/legacy_claim/claim/confirm/${rawToken}`;
  try {
    getCommunicationService().enqueueEmailOrFail({
      idempotencyKey:    `claim:${tokenRowId}`,
      recipientEmail:    row.legacy_email,
      recipientMemberId: requestingMemberId,
      subject:           'Confirm your IFPA legacy account claim',
      bodyText:
        'Hello,\n\n' +
        'A claim request was submitted on your legacy IFPA account. ' +
        'Open the link below to review and confirm the link to your current account. ' +
        `The link expires in ${claimTokenTtlHours()} hours.\n\n` +
        `${confirmUrl}\n\n` +
        'If you did not initiate this claim, you can ignore this message; the link will expire unused.',
    });
  } catch (err) {
    // The account_claim token is already committed by issueToken but no
    // confirmation email was queued. The token will sit in account_tokens
    // until TTL expiry; operator review should treat this as an outbox /
    // SES degradation. Re-throw so the controller maps to 503 rather than
    // returning `enqueued`, which would lie to the caller about delivery.
    recordOperationalError({
      actionType: 'legacy.claim_initiate_notification_failed',
      category:   'identity',
      entityType: 'member',
      entityId:   requestingMemberId,
      reasonText: 'Legacy-claim initiation token committed but confirmation-email enqueue failed.',
      cause:      err,
      metadata: {
        tokenRowId,
        legacyMemberId: row.legacy_member_id,
      },
    });
    throw err;
  }
  return { kind: 'enqueued' };
}

export interface LegacyClaimTokenLookup {
  legacyMemberId: string;
  displayName:    string | null;
  country:        string | null;
  isHof:          boolean;
  isBap:          boolean;
}

/**
 * Step 2a of the two-step claim flow: validate the token and return the
 * matched legacy_members snapshot for the confirm page. Does NOT consume the
 * token; consume is deferred to the merge step so that a user who lands on
 * the confirm page can review without burning the single-use token.
 *
 * Returns null when the token is invalid, expired, already used, or bound to
 * a different requesting member. The controller renders an identical
 * "couldn't validate the link" error for all null returns to avoid leaking
 * which gate failed.
 */
function peekLegacyClaim(requestingMemberId: string, rawToken: string): LegacyClaimTokenLookup | null {
  const peek = accountTokenService.peekToken(rawToken, 'account_claim');
  if (!peek) return null;
  if (peek.memberId !== requestingMemberId) return null;
  if (!peek.targetLegacyMemberId) return null;

  const row = legacyMembers.findByLegacyMemberId.get(peek.targetLegacyMemberId) as LegacyMemberRow | undefined;
  if (!row || row.claimed_by_member_id) return null;

  return {
    legacyMemberId: row.legacy_member_id,
    displayName:    row.display_name ?? row.real_name ?? null,
    country:        row.country,
    isHof:          Boolean(row.is_hof),
    isBap:          Boolean(row.is_bap),
  };
}

/**
 * Step 2b of the two-step claim flow: consume the token AND run the merge
 * inside ONE transaction so a failed merge un-consumes the token via rollback.
 * Validates the same gates peekLegacyClaim checks; throws ValidationError on
 * any failure so the controller can render a user-readable error.
 *
 * Atomicity: consumeIfUnusedInTx and claimLegacyAccountInTx both run inside
 * the wrapping transaction. Any throw rolls back the token consume too, so
 * the user can retry with the same email link rather than re-initiating.
 */
/**
 * Token-consume + merge body. Caller owns the transaction. Used by the wizard
 * so the merge AND the wizard task transition are atomic. For non-wizard
 * callers, use the `consumeAndClaimLegacy` wrapper.
 */
function consumeAndClaimLegacyInTx(requestingMemberId: string, rawToken: string): void {
  const consumed = accountTokenService.consumeIfUnusedInTx(rawToken, 'account_claim');
  if (!consumed) {
    throw new ValidationError('This claim link is no longer valid. Please start the claim again.');
  }
  if (consumed.memberId !== requestingMemberId) {
    throw new ValidationError('This claim link belongs to a different account.');
  }
  if (!consumed.targetLegacyMemberId) {
    throw new ValidationError('This claim link is missing a target record.');
  }
  claimLegacyAccountInTx(requestingMemberId, consumed.targetLegacyMemberId);
}

function consumeAndClaimLegacy(requestingMemberId: string, rawToken: string): void {
  transaction(() => consumeAndClaimLegacyInTx(requestingMemberId, rawToken));
}

// ── Historical-person direct claim (scenarios D and E) ──────────────────────
//
// For registrants who were competitors but never had an old-site user account
// (scenario D), or whose legacy_members row and historical_persons row were
// not pipeline-linked (scenario E). Email cannot be the anchor because
// historical_persons carries no email, so the identity anchor is surname
// reconciliation against the member's real_name. Flow:
//   1. Member views /history/:personId (the HP detail page).
//   2. If eligible, member clicks "Claim this identity".
//   3. Confirm page shows HP name + the first-name mismatch warning if any.
//      Surname mismatch blocks the claim outright.
//   4. On confirm, members.historical_person_id is set, HP fields are merged
//      in, and if the HP has a legacy_member_id back-link, the legacy_members
//      row is transitively claimed in the same transaction.

export interface HistoricalPersonClaimLookup {
  personId: string;
  personName: string;
  country: string | null;
  isHof: boolean;
  isBap: boolean;
  firstNameWarning: boolean;
}

function normalizedSurnamesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return surnameKey(a) === surnameKey(b);
}

function extractFirstName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words[0] ?? '';
}

function firstNamesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return stripAccents(extractFirstName(a)).toLowerCase() ===
         stripAccents(extractFirstName(b)).toLowerCase();
}

interface ClaimingMemberRow {
  id: string;
  slug: string;
  real_name: string;
  legacy_member_id: string | null;
  historical_person_id: string | null;
  login_email_normalized: string | null;
  email_verified_at: string | null;
}

function lookupHistoricalPersonForClaim(
  requestingMemberId: string,
  personId: string,
): HistoricalPersonClaimLookup | null {
  const member = legacyClaim.findClaimingMember.get(requestingMemberId) as ClaimingMemberRow | undefined;
  if (!member) return null;
  if (member.historical_person_id) {
    throw new ValidationError('Your account is already linked to a historical player record.');
  }

  const hp = legacyClaim.findHistoricalPersonById.get(personId) as HistoricalPersonClaimRow | undefined;
  if (!hp) return null;

  // Not already claimed by another member.
  const existing = legacyClaim.findMemberClaimingHp.get(personId) as { id: string; slug: string } | undefined;
  if (existing) {
    throw new ValidationError('This historical record has already been claimed by another member.');
  }

  // Surname reconciliation is required to proceed. Mismatch blocks the claim
  // entirely; callers should not render the confirm page.
  if (!normalizedSurnamesMatch(member.real_name, hp.person_name)) {
    throw new ValidationError(
      'Your name does not match this historical record. If you believe this is your identity, contact an administrator.',
    );
  }

  // If the HP has a legacy_member_id back-link, the claim will transitively
  // act on legacy_members. Reject if the member already holds a different
  // legacy linkage, so we never leave two incompatible legacy ids on one
  // account.
  if (hp.legacy_member_id) {
    if (member.legacy_member_id && member.legacy_member_id !== hp.legacy_member_id) {
      throw new ValidationError(
        'This historical record is tied to a different legacy account than the one already linked to your profile.',
      );
    }
    const lm = legacyMembers.findByLegacyMemberId.get(hp.legacy_member_id) as LegacyMemberRow | undefined;
    if (lm && lm.claimed_by_member_id && lm.claimed_by_member_id !== requestingMemberId) {
      throw new ValidationError(
        'The legacy account tied to this historical record has already been claimed by another member.',
      );
    }
  }

  return {
    personId: hp.person_id,
    personName: hp.person_name,
    country: hp.country,
    isHof: Boolean(hp.hof_member),
    isBap: Boolean(hp.bap_member),
    firstNameWarning: !firstNamesMatch(member.real_name, hp.person_name),
  };
}

/**
 * Direct-HP claim merge. Caller owns the transaction. Used by the wizard
 * so the merge AND the wizard task transition are atomic with each other.
 * For non-wizard callers, use the `claimHistoricalPerson` wrapper.
 */
function claimHistoricalPersonInTx(
  requestingMemberId: string,
  personId: string,
): void {
  const member = legacyClaim.findClaimingMember.get(requestingMemberId) as ClaimingMemberRow | undefined;
  if (!member) {
    throw new ValidationError('Your account cannot be found.');
  }
  if (member.historical_person_id) {
    throw new ValidationError('Your account is already linked to a historical player record.');
  }

  const hp = legacyClaim.findHistoricalPersonById.get(personId) as HistoricalPersonClaimRow | undefined;
  if (!hp) {
    throw new ValidationError('The historical record is no longer available for claim.');
  }

  const existing = legacyClaim.findMemberClaimingHp.get(personId) as { id: string; slug: string } | undefined;
  if (existing) {
    throw new ValidationError('This historical record has already been claimed by another member.');
  }

  if (!normalizedSurnamesMatch(member.real_name, hp.person_name)) {
    throw new ValidationError(
      'Your name does not match this historical record. If you believe this is your identity, contact an administrator.',
    );
  }

  const now = new Date().toISOString();

  // Transitive legacy claim when the HP is back-linked to a legacy account.
  if (hp.legacy_member_id) {
    if (member.legacy_member_id && member.legacy_member_id !== hp.legacy_member_id) {
      throw new ValidationError(
        'This historical record is tied to a different legacy account than the one already linked to your profile.',
      );
    }
    const lm = legacyMembers.findByLegacyMemberId.get(hp.legacy_member_id) as LegacyMemberRow | undefined;
    if (lm && !lm.claimed_by_member_id) {
      const marked = legacyMembers.markClaimed.run(requestingMemberId, now, hp.legacy_member_id);
      if (marked.changes === 0) {
        throw new ValidationError(
          'The legacy account tied to this historical record has already been claimed by another member.',
        );
      }
      if (!member.legacy_member_id) {
        legacyClaim.transferLegacyFields.run(
          lm.legacy_member_id,
          lm.legacy_user_id,
          lm.legacy_email,
          lm.bio ?? '',
          lm.birth_date,
          lm.street_address,
          lm.postal_code,
          lm.city,
          lm.region,
          lm.country,
          lm.ifpa_join_date,
          lm.is_hof,
          lm.is_bap,
          lm.first_competition_year,
          now,
          requestingMemberId,
        );
      }
    } else if (lm && lm.claimed_by_member_id && lm.claimed_by_member_id !== requestingMemberId) {
      throw new ValidationError(
        'The legacy account tied to this historical record has already been claimed by another member.',
      );
    }
  }

  // Set the member↔HP link. Partial UNIQUE index enforces one live member per HP.
  legacyMembers.setMemberHistoricalPersonId.run(hp.person_id, now, requestingMemberId);

  // Carry country / HoF / BAP / hof_inducted_year / first_competition_year from HP.
  legacyClaim.mergeHistoricalPersonFields.run(
    hp.country,
    hp.hof_member,
    hp.bap_member,
    hp.hof_induction_year,
    hp.first_year,
    now,
    requestingMemberId,
  );

  // Single tier grant per DD §2551 / SC §LegacyClaim / MIGRATION_PLAN §3.
  // Direct HP claim takes the same `legacy.claim_tier_grant` reason: honors
  // (HoF or BAP, from the HP) → tier2; otherwise tier0. Same transaction
  // as the merge writes above.
  applyLegacyClaimGrantInTx(
    requestingMemberId,
    requestingMemberId,
    Boolean(hp.hof_member),
    Boolean(hp.bap_member),
    {
      source:               'direct_hp_claim',
      person_id:            hp.person_id,
      transitive_legacy_id: hp.legacy_member_id ?? null,
    },
  );

  appendAuditEntry({
    actionType:    'claim.historical_person',
    category:      'identity',
    actorType:     'member',
    actorMemberId: requestingMemberId,
    entityType:    'member',
    entityId:      requestingMemberId,
    reasonText:    null,
    metadata: {
      person_id:              hp.person_id,
      person_name:            hp.person_name,
      first_name_variant:     !firstNamesMatch(member.real_name, hp.person_name),
      transitive_legacy_id:   hp.legacy_member_id ?? null,
    },
  });
}

function claimHistoricalPerson(
  requestingMemberId: string,
  personId: string,
): void {
  transaction(() => claimHistoricalPersonInTx(requestingMemberId, personId));
}

export interface PasswordChangeResult {
  memberId: string;
  newPasswordVersion: number;
}

async function changePassword(
  memberId: string,
  oldPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<PasswordChangeResult> {
  const maxAttempts = readIntConfig('password_change_rate_limit_max_attempts', 10);
  const windowMinutes = readIntConfig('password_change_rate_limit_window_minutes', 15);
  const rl = rateLimitHit(`pwchange:${memberId}`, maxAttempts, windowMinutes);
  if (!rl.allowed) {
    throw new RateLimitedError(
      'Too many password-change attempts. Please try again later.',
      rl.retryAfterSeconds,
    );
  }

  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
  if (newPassword !== confirmPassword) {
    throw new ValidationError('Passwords do not match.');
  }
  if (oldPassword === newPassword) {
    throw new ValidationError('New password must be different from your current password.');
  }

  const row = auth.findMemberForPasswordChange.get(memberId) as
    | { id: string; password_hash: string; password_version: number }
    | undefined;
  if (!row || !row.password_hash) {
    throw new ValidationError('Current password is incorrect.');
  }

  const ok = await argon2.verify(row.password_hash, oldPassword);
  if (!ok) {
    throw new ValidationError('Current password is incorrect.');
  }

  const newHash = await argon2.hash(newPassword);
  const now = new Date().toISOString();
  auth.updateMemberPassword.run(newHash, now, now, memberId);

  appendAuditEntry({
    actionType: 'auth.password_change',
    category: 'auth',
    actorType: 'member',
    actorMemberId: memberId,
    entityType: 'member',
    entityId: memberId,
  });

  // Confirmation email. Uses the strict enqueueEmailOrFail helper because a
  // silent loss of the password-change notification is itself a security
  // signal (an attacker doing account takeover plus a degraded email path
  // would otherwise leave the legitimate owner unaware). The
  // password_version increment is already committed above; if the enqueue
  // fails the caller surfaces an actionable 503 and the member uses
  // password reset to recover (per memberController.postPasswordEdit).
  const member = auth.findMemberForSessionAfterVerify.get(memberId) as
    | { login_email: string | null }
    | undefined;
  if (member?.login_email) {
    try {
      getCommunicationService().enqueueEmailOrFail({
        // No token row for password-change notifications; use the new
        // password_version as the per-event key so re-emit on worker
        // restart between SES-send and outbox-mark-sent collapses to the
        // same outbox row.
        idempotencyKey: `pwchange:${memberId}:${row.password_version + 1}`,
        recipientEmail: member.login_email,
        recipientMemberId: memberId,
        subject: 'Your IFPA Footbag password was changed',
        bodyText:
          'This is a confirmation that the password for your IFPA Footbag account was just changed.\n\n' +
          'If this was not you, please reset your password immediately and contact admin@footbag.org.',
      });
    } catch (err) {
      // High-priority audit row: the password change committed but the
      // member never got their notification. Operator review should treat
      // this as a possible account-takeover signal that coincided with an
      // email-pipeline degradation.
      recordOperationalError({
        actionType: 'auth.password_change_notification_failed',
        category: 'auth',
        entityType: 'member',
        entityId: memberId,
        reasonText:
          'Password change committed but confirmation-email enqueue failed.',
        cause: err,
        metadata: { newPasswordVersion: row.password_version + 1 },
      });
      throw err;
    }
  }

  return { memberId, newPasswordVersion: row.password_version + 1 };
}

// ── Password reset ───────────────────────────────────────────────────────────

export interface PasswordResetRequestResult {
  /** Always true; caller renders the same page either way (anti-enumeration). */
  responseSent: true;
}

async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  const normalized = normalizeEmail(email);
  const maxAttempts = readIntConfig('password_reset_rate_limit_max_attempts', 5);
  const windowMinutes = readIntConfig('password_reset_rate_limit_window_minutes', 60);
  const rl = rateLimitHit(`pwreset:${normalized}`, maxAttempts, windowMinutes);
  if (!rl.allowed) {
    return { responseSent: true };
  }
  const row = auth.findMemberByEmail.get(normalized) as MemberAuthRow | undefined;
  if (!row) {
    return { responseSent: true };
  }
  const ttlHours = readIntConfig('password_reset_expiry_hours', 1);
  const { rawToken, tokenRowId } = accountTokenService.issueToken({
    memberId: row.id,
    tokenType: 'password_reset',
    ttlHours,
  });
  const baseUrl = config.publicBaseUrl.replace(/\/+$/, '');
  const resetUrl = `${baseUrl}/password/reset/${rawToken}`;
  // Anti-enumeration contract: the exists-vs-not-exists branches of this
  // method must produce identical responses to the caller. If the outbox
  // enqueue fails (SQLite BUSY, schema mismatch, adapter outage), letting the
  // exception propagate would make the exists branch return 500 while the
  // not-exists branch still returns 200 — leaking account existence to any
  // observer of HTTP status codes. Catch the failure here, write a
  // high-priority audit row so operators can correlate the resulting orphan
  // token in account_tokens with the email-pipeline degradation, and still
  // return responseSent so the caller renders the uniform sent page.
  try {
    getCommunicationService().enqueueEmailOrFail({
      idempotencyKey: `pwreset:${tokenRowId}`,
      recipientEmail: email.trim(),
      recipientMemberId: row.id,
      subject: 'Reset your IFPA Footbag password',
      bodyText:
        'A password reset was requested for your IFPA Footbag account.\n\n' +
        `Open the link below within ${ttlHours} hour${ttlHours === 1 ? '' : 's'} to set a new password:\n\n` +
        `${resetUrl}\n\n` +
        'If you did not request this, you can ignore this message. Your current password remains in effect.',
    });
  } catch (err) {
    // Swallow (do not re-throw) to preserve the anti-enumeration contract:
    // the exists/not-exists branches must return identical UX to the caller.
    recordOperationalError({
      actionType: 'auth.password_reset_notification_failed',
      category: 'auth',
      entityType: 'member',
      entityId: row.id,
      reasonText:
        'Password-reset token issued but notification-email enqueue failed; anti-enumeration response preserved.',
      cause: err,
      metadata: { tokenRowId },
    });
  }
  return { responseSent: true };
}

export interface PasswordResetCompletionResult {
  memberId: string;
  newPasswordVersion: number;
  role: 'admin' | 'member';
  slug: string;
}

async function completePasswordReset(
  rawToken: string,
  newPassword: string,
  confirmPassword: string,
): Promise<PasswordResetCompletionResult> {
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
  if (newPassword !== confirmPassword) {
    throw new ValidationError('Passwords do not match.');
  }

  const consumed = accountTokenService.consumeToken(rawToken, 'password_reset');
  if (!consumed) {
    throw new ValidationError('This reset link is invalid, expired, or already used.');
  }

  const member = auth.findMemberForSessionAfterVerify.get(consumed.memberId) as
    | { id: string; slug: string | null; login_email: string | null; password_version: number; is_admin: number }
    | undefined;
  if (!member) {
    throw new ValidationError('This reset link is invalid, expired, or already used.');
  }

  const newHash = await argon2.hash(newPassword);
  const now = new Date().toISOString();
  auth.updateMemberPassword.run(newHash, now, now, consumed.memberId);

  // Re-read password_version post-UPDATE rather than computing
  // `member.password_version + 1` from the pre-UPDATE snapshot. The
  // computed value happens to be correct under the current sync UPDATE
  // (the only writer of password_version, atomic +1), but the pattern
  // is fragile to any future refactor that interleaves writes; reading
  // the live value removes the trap.
  const after = auth.findMemberForSessionAfterVerify.get(consumed.memberId) as
    | { password_version: number }
    | undefined;
  const newPasswordVersion = after?.password_version ?? member.password_version + 1;

  appendAuditEntry({
    actionType: 'auth.password_reset',
    category: 'auth',
    actorType: 'system',
    actorMemberId: null,
    entityType: 'member',
    entityId: consumed.memberId,
  });

  // Confirmation email, best-effort.
  try {
    if (member.login_email) {
      getCommunicationService().enqueueEmail({
        // Pin to the consumed token row id so re-issue on worker restart
        // between SES-send and outbox-mark-sent collapses to the same row.
        idempotencyKey: `pwresetconfirm:${consumed.tokenRowId}`,
        recipientEmail: member.login_email,
        recipientMemberId: consumed.memberId,
        subject: 'Your IFPA Footbag password was changed',
        bodyText:
          'Your IFPA Footbag password was reset via the password-reset link.\n\n' +
          'If this was not you, contact admin@footbag.org immediately.',
      });
    }
  } catch {
    // Swallow, the reset itself committed.
  }

  return {
    memberId: consumed.memberId,
    newPasswordVersion,
    role: member.is_admin ? 'admin' : 'member',
    // Return the slug so the controller can redirect to /members/:slug
    // (matching the login and verify flows) instead of the generic /members
    // landing page.
    slug: member.slug ?? consumed.memberId,
  };
}

/**
 * Resolve an identifier the user typed into the manual-id form to an HP row,
 * trying person_id first then the legacy_member_id back-link (matters in dev
 * where legacy_members rows are often stubs and the HP carries the full
 * identity anchor). Returns null when neither match resolves. Pure read;
 * eligibility (already-claimed, surname mismatch) is enforced by the GET
 * /history/<personId>/claim handler, which the wizard surfaces this match
 * through as an `hp_review_page` card.
 */
function findHistoricalPersonForLinkSubmit(
  identifier: string,
): HistoricalPersonClaimRow | null {
  const hpById = legacyClaim.findHistoricalPersonById.get(identifier) as
    | HistoricalPersonClaimRow
    | undefined;
  if (hpById) return hpById;
  const hpByLegacy = legacyClaim.findHistoricalPersonByLegacyId.get(identifier) as
    | HistoricalPersonClaimRow
    | undefined;
  return hpByLegacy ?? null;
}

const WIZARD_CLAIM_CONFIRM_URL_PREFIX = '/register/wizard/legacy_claim/claim/confirm/';

/**
 * Wizard PRG composer for the legacy_claim GET render. Reads the flash
 * state the controller recovered, composes the view-model on top of
 * `getLinkHistoryView`, and post-processes:
 *   - Prepends an HP card when `hpPersonId` resolves (dedupe against
 *     candidates already present).
 *   - Attaches the simulated-email preview when `sinceIndex` is set and
 *     the SES adapter is stub.
 *   - Surfaces the drift banner when `autoLinkDrift` is true.
 *
 * `submitted` drives the anti-enumeration "If an eligible legacy record
 * was found..." banner. Identical for all submit outcomes by design;
 * this wrapper does not surface a typed-identifier echo or a leak-y
 * "didn't match" notice.
 */
async function getLinkHistoryViewForWizard(
  memberId: string,
  opts: {
    submitted: boolean;
    hpPersonId: string | null;
    sinceIndex: number | null;
    autoLinkDrift: boolean;
  },
): Promise<LinkHistoryContent | null> {
  const view = getLinkHistoryView(memberId, {
    fromRegister: true,
    reasonIsLowConfidence: false,
    sentOutcome: opts.submitted && opts.hpPersonId === null ? 'enqueued' : null,
    sinceIndex: opts.sinceIndex,
    noMatchNotice: false,
    noMatchTried: null,
  });
  if (!view) return null;

  if (opts.hpPersonId) {
    const hp = legacyClaim.findHistoricalPersonById.get(opts.hpPersonId) as
      | HistoricalPersonClaimRow
      | undefined;
    if (hp) {
      const seen = new Set(view.candidates.map((c) => c.personId).filter(Boolean));
      if (!seen.has(hp.person_id)) {
        view.candidates.unshift({
          claimMode: 'hp_review_page',
          displayName: hp.person_name,
          provenanceLabel: 'Matched by id. Competition record.',
          legacyMemberId: null,
          personId: hp.person_id,
          country: hp.country,
          isHof: hp.hof_member !== 0,
          isBap: hp.bap_member !== 0,
          alreadyLinkedSinceDisplay: null,
        });
      }
    }
  }

  if (view.sentNotice.show && opts.sinceIndex != null) {
    const preview = await simulatedEmailService.getEmailPreview({
      urlPathPrefix: WIZARD_CLAIM_CONFIRM_URL_PREFIX,
      sinceIndex: opts.sinceIndex,
    });
    if (preview) view.sentNotice.emailPreview = preview;
  }

  view.autoLinkDriftNotice = opts.autoLinkDrift;
  return view;
}

// ── Auto-link revert ─────────────────────────────────────────────────────────
//
// Reverses a silent auto-link claim when the member reports it incorrect.
// Atomic transaction:
//   1. Clear members.legacy_member_id (the linkage anchor).
//   2. Clear legacy_members.claimed_by_member_id + claimed_at so the legacy
//      account becomes claimable again.
//   3. Conditionally clear members.historical_person_id: the HP is cleared
//      only when its legacy_member_id matches the cleared linkage. Direct-HP
//      claims (HP rows whose legacy_member_id is NULL or does not match) are
//      preserved on revert.
//   4. Append a member_tier_grants 'revoke' row with reason_code
//      'legacy.auto_link_reported_incorrect'.
//   5. Enqueue a work_queue_items row with task_type 'auto_link_revert_review'
//      pointing back to the original claim audit entry.
//   6. Append an audit_entries row with action_type 'legacy.auto_link_revert'
//      carrying metadata_json.original_claim_audit_id.
//
// Anti-enumeration: an unrecognized original_claim_audit_id and an already-
// reverted link both return a non-revealing reason discriminator so a
// tokened email link cannot be used to probe which claims exist.
export interface RevertAutoLinkActor {
  actorType: 'member' | 'admin';
  actorMemberId: string;
}

export type RevertAutoLinkResult =
  | { status: 'reverted' }
  | { status: 'already_reverted' }
  | { status: 'not_found' };

function revertAutoLink(
  memberId: string,
  originalClaimAuditId: string,
  actor: RevertAutoLinkActor,
): RevertAutoLinkResult {
  return transaction(() => {
    const member = legacyClaim.findClaimingMember.get(memberId) as
      | {
          id: string;
          slug: string | null;
          real_name: string;
          legacy_member_id: string | null;
          historical_person_id: string | null;
          login_email_normalized: string | null;
          email_verified_at: string | null;
        }
      | undefined;
    if (!member) return { status: 'not_found' as const };
    if (member.legacy_member_id === null) {
      return { status: 'already_reverted' as const };
    }

    const legacyMemberId = member.legacy_member_id;
    let clearedHp = false;
    if (member.historical_person_id !== null) {
      const hp = legacyClaim.findHistoricalPersonById.get(member.historical_person_id) as
        | { person_id: string; legacy_member_id: string | null }
        | undefined;
      if (hp && hp.legacy_member_id === legacyMemberId) {
        clearedHp = true;
      }
    }

    const now = new Date().toISOString();

    legacyMembers.clearMemberLegacyLink.run(now, actor.actorMemberId, memberId);
    legacyMembers.clearClaim.run(legacyMemberId);
    if (clearedHp) {
      legacyMembers.clearMemberHistoricalPersonId.run(now, actor.actorMemberId, memberId);
    }
    // Drop any pending first-login card so the dashboard does not keep
    // asking the member to confirm a link they just reverted.
    pendingAutoLinkCard.clearForMember.run(now, actor.actorMemberId, memberId);

    applyAutoLinkRevertGrantInTx(actor.actorMemberId, memberId, {
      legacy_member_id:        legacyMemberId,
      cleared_hp:              clearedHp,
      original_claim_audit_id: originalClaimAuditId,
    });

    const wqId = `wq_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    workQueue.insertItem.run(
      wqId, now, 'system', now, 'system',
      'membership', 'auto_link_revert_review',
      'member', memberId,
      1, now,
      `Auto-link revert reported by member. Original claim audit: ${originalClaimAuditId}.`,
    );

    appendAuditEntry({
      actionType:    'legacy.auto_link_revert',
      category:      'identity',
      actorType:     actor.actorType,
      actorMemberId: actor.actorMemberId,
      entityType:    'member',
      entityId:      memberId,
      reasonText:    null,
      metadata: {
        original_claim_audit_id: originalClaimAuditId,
        legacy_member_id:        legacyMemberId,
        cleared_historical_person_id: clearedHp,
        work_queue_item_id:      wqId,
      },
    });

    return { status: 'reverted' as const };
  });
}

// Tokened revert path consumed by the report-incorrect link in the silent-
// claim notification email. Unrecognized, expired, or already-used tokens
// return the same `already_reverted` status as a real already-reverted
// claim so an attacker cannot use the endpoint to probe which audit ids
// exist (anti-enumeration).
function revertAutoLinkByToken(rawToken: string): RevertAutoLinkResult {
  const consumed = accountTokenService.consumeToken(rawToken, 'auto_link_report_incorrect');
  if (!consumed || !consumed.targetAuditEntryId) {
    return { status: 'already_reverted' };
  }
  return revertAutoLink(consumed.memberId, consumed.targetAuditEntryId, {
    actorType: 'member',
    actorMemberId: consumed.memberId,
  });
}

export interface ClaimedLegacyIdentity {
  legacyMemberId: string;
  displayName:    string;
  claimedAt:      string | null;
}

function listClaimedLegacyIdentities(memberId: string): ClaimedLegacyIdentity[] {
  const rows = legacyMembers.listClaimedByMember.all(memberId) as Array<{
    legacy_member_id: string;
    display_name: string | null;
    claimed_at: string | null;
  }>;
  return rows.map(r => ({
    legacyMemberId: r.legacy_member_id,
    displayName:    r.display_name ?? 'Unknown',
    claimedAt:      r.claimed_at,
  }));
}

export const identityAccessService = { verifyMemberCredentials, attemptLogin, registerMember, lookupLegacyAccount, claimLegacyAccount, initiateLegacyClaim, peekLegacyClaim, consumeAndClaimLegacy, consumeAndClaimLegacyInTx, lookupHistoricalPersonForClaim, claimHistoricalPerson, claimHistoricalPersonInTx, changePassword, verifyEmailByToken, resendVerifyEmail, requestPasswordReset, completePasswordReset, getAutoLinkClassificationForMember, getLinkHistoryViewForWizard, findHistoricalPersonForLinkSubmit, revertAutoLink, revertAutoLinkByToken, applyAutoLinkSilentClaim, getPendingAutoLinkCard, confirmAutoLinkCard, dismissAutoLinkCard, listClaimedLegacyIdentities };
