/**
 * IdentityAccessService -- account entry and authentication.
 *
 * Owns:
 *   - Registration, email verification, credential check, password change/reset
 *   - Legacy archive passthrough JWT
 *   - Legacy-account claim flow (two-step token + email-equality fast path)
 *   - Direct historical-person claim (surname-match precondition; first-name-variant warning)
 *   - Auto-link classification
 *   - Auto-link candidate staging (stage-and-confirm): high / medium
 *     classifier outcomes become auto_link_staged_candidates rows plus a
 *     staged audit event; nothing applies and no email is sent until the
 *     member confirms a wizard card. Decline is terminal and never
 *     re-staged; open candidates expire after a configurable window.
 *     A classifier-produced card with no staged row declines just as
 *     durably: the pair is staged and immediately resolved declined, so
 *     the view suppresses it and the stager never re-offers it.
 *   - Staged-candidate resolution inside every claim transaction: any claim
 *     path that satisfies an open staged candidate marks it confirmed and
 *     emits the confirmed audit event.
 *   - Declared identity anchors (former surnames / old emails / birth date):
 *     rate-limited declare/remove, multi-anchor classifier matching, surname
 *     gates that honor former surnames, and the mailbox-control round-trip
 *     (single-use link to the declared address; a same-account click upgrades
 *     matches through that anchor to the hard-evidence tier). The birth-date
 *     anchor fills members.birth_date only when absent; it disambiguates tied
 *     same-name candidates (identical narrows fully, a typo-shaped near-miss
 *     narrows at medium), and every legacy-account claim records the member-
 *     versus-legacy birth-date comparison outcome in its audit metadata, with a
 *     hard mismatch raising a claim_dob_mismatch_review work-queue item. A
 *     direct historical-record claim that resolves through to a legacy account
 *     records the same comparison outcome but raises no review item, since the
 *     flag is a legacy-account-claim behavior. The comparison never gates a claim.
 *   - Cross-source offers: after a one-source claim, the other source is
 *     searched via real anchors and a cross_source staged candidate is
 *     offered (same stage / confirm / decline / expire lifecycle, distinct
 *     audit event family)
 *   - Registration-time conflict detection: a registrant whose surname
 *     matches an already-claimed record gets the prompted event and the
 *     wizard's "is one of these you?" card; the dispute affordance files a
 *     help request
 *   - Member link help requests: structured intake into the admin work
 *     queue (one open item per member); admin approve applies the link
 *     (exactly one target type: a legacy account or a historical-person
 *     record) with admin-vetted evidence and resolves the item atomically;
 *     admin-vetted evidence bypasses the self-serve surname gate, never the
 *     deceased or already-claimed integrity gates; reject records the reason
 *   - Revert of a confirmed claim by its claim-audit id (idempotent), and
 *     the admin dispute revert that pairs claim.dispute_opened with
 *     claim.revert_applied in one transaction; covers legacy-linked and
 *     HP-only claims alike
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
 *   - Candidate staging never mutates live tables and never sends mail: a
 *     staged row plus its staged audit event commit in one transaction and
 *     nothing else happens until the member acts. Re-staging an open
 *     member/target pair is a unique-constraint no-op (batch reruns are
 *     idempotent); a declined pair is never re-staged.
 *   - Every confirmed-claim audit row carries an evidence_strength tag;
 *     name-only evidence tags the declared_anchor_only floor tier.
 *   - Auto-link revert is idempotent: a second revert returns
 *     `already_reverted` without state change.
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
 *   audit_entries, outbox_emails, auto_link_staged_candidates (stage /
 *   confirm / decline / expire lifecycle), member_declared_anchors (declare /
 *   remove / verify-by-link-click; deleted wholesale on PII purge by
 *   MemberService), work_queue_items (link help requests: insert + resolve).
 *   Tier-grant writes delegated to MembershipTieringService.
 *
 * Side effects:
 *   - audit_entries append (auth, claim, bootstrap, candidate staged /
 *     confirmed / declined / expired, claim blocked, revert, dispute opened /
 *     revert applied, help request submitted / approved / rejected,
 *     registration conflict prompted / disputed, registration duplicate email,
 *     mailbox link issued / consumed / expired, cross-source offered /
 *     confirmed / declined)
 *   - outbox_emails enqueue (verification, account-exists notice on a duplicate
 *     registration, reset, password-change confirmation, claim email, resend,
 *     mailbox-control link to a declared old email)
 *   - work_queue_items insert (member_link_help_request intake with
 *     admin-alerts fan-out; claim_dob_mismatch_review on a hard birth-date
 *     mismatch at claim confirmation)
 *
 * Service shape: singleton object (no external adapters beyond db.ts and the KMS-backed
 * JwtSigningAdapter resolved via getJwtSigningAdapter()).
 */
import { randomUUID, randomBytes } from 'crypto';
import argon2 from 'argon2';
import { hashPassword } from '../lib/passwordHash';
import { auth, registration, legacyClaim, legacyMembers, account, workQueue, autoLinkStagedCandidates, declaredAnchors, accountTokens, MemberAuthRow, LegacyMemberRow, AlreadyClaimedRow, HistoricalPersonClaimRow, AutoLinkStagedCandidateRow } from '../db/db';
import { transaction } from '../db/db';
import { accountTokenService } from './accountTokenService';
import { emailService } from './emailService';
import { workQueueService } from './workQueueService';
import { hit as rateLimitHit } from './rateLimitService';
import { readIntConfig } from './configReader';
import { config } from '../config/env';
// The permanent dev/staging register-allowlist bootstrap: applyDevStagingBootstrapAdmin
// promotes a registrant whose email is on the operator allowlist to admin. It is
// active in dev/staging only; the env-config fail-fast guard prevents its trigger
// from being set in production, where the single-shot SSM-token claim is the
// first-admin (and break-glass recovery) path.
import { applyDevStagingBootstrapAdmin } from '../dev-bootstrap/runtime';
import { ConflictError, NotFoundError, RateLimitedError, ServiceError, ValidationError } from './serviceErrors';
import { validateBirthDate, compareBirthDates } from '../lib/birthDate';
import { isUniqueConstraintError } from './sqliteRetry';
import { findAutoLinkCandidates } from './nameVariantsService';
import { appendAuditEntry } from './auditService';
import { recordOperationalError } from './operationalErrors';
import { applyAutoLinkRevertGrantInTx, applyLegacyClaimGrantInTx } from './membershipTieringService';
import { createHash } from 'crypto';
import { logger } from '../config/logger';
import { type SimulatedEmailPreview } from './simulatedEmailService';

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
  turnstileSiteKey?: string | null;
  captchaStubbed?: boolean;
}

export interface RegisterContent {
  error?: string;
  realName?: string;
  displayName?: string;
  slug?: string;
  email?: string;
  turnstileSiteKey?: string | null;
  captchaStubbed?: boolean;
}

export interface CheckEmailContent {
  resent?: boolean;
  emailPreview?: SimulatedEmailPreview;
  error?: string;
  turnstileSiteKey?: string | null;
  captchaStubbed?: boolean;
}

export interface VerifyResultContent {
  ok: boolean;
  signInPrompt?: boolean;
}

export interface PasswordForgotContent {
  error?: string;
  turnstileSiteKey?: string | null;
  captchaStubbed?: boolean;
}

export interface PasswordForgotSentContent {
  email?: string;
}

export interface PasswordResetContent {
  token: string | undefined;
  error?: string;
  turnstileSiteKey?: string | null;
  captchaStubbed?: boolean;
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
   * when SES_ADAPTER=stub (dev and staging);
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
  bioExcerpt?: string | null;
  clubAffiliations?: string[];
  eventsAttended?: Array<{ title: string; year: number }>;
  memberSlug?: string;
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
  claimMode: 'auto_link_confirm' | 'cross_source_legacy' | 'legacy_claim' | 'hp_review_page' | 'already_linked';
  /** Display copy: full name as it appears on the matched record. */
  displayName: string;
  /** Provenance phrase for the card subtitle. */
  provenanceLabel: string;
  /** Identifier for `legacy_claim` cards. Form posts `identifier=this`. */
  legacyMemberId: string | null;
  /** Identifier for `auto_link_confirm` (POST body) and `hp_review_page` (URL). */
  personId: string | null;
  /** Open staged-candidate id; non-null renders the decline affordance. */
  stagedCandidateId?: string | null;
  country: string | null;
  isHof: boolean;
  isBap: boolean;
  firstYear: number | null;
  /** "Claimed Jan 12, 2024" string for `already_linked` legacy badges. */
  alreadyLinkedSinceDisplay: string | null;
  /** Service-shaped alias line, e.g. "Also known as: dleberknight". Null when no aliases. */
  aliasesLabel: string | null;
  /** Truncated bio from legacy_members. Null for HP-only candidates or when bio is empty. */
  bioExcerpt: string | null;
  /** Club names from legacy_person_club_affiliations for this person. */
  clubAffiliations: string[];
  /** Events attended, newest first. */
  eventsAttended: Array<{ title: string; year: number }>;
}

/**
 * View-model for the onboarding wizard's legacy_claim view at
 * `/register/wizard/legacy_claim`. ONE section: a mixed candidate list
 * (legacy + HP + both, presented uniformly with provenance labels) plus
 * a manual-id input that tries both tables, plus a clubs-coming-soon
 * placeholder card. The wizard is the post-verify destination for every
 * classifier outcome and the dashboard task-widget resume target.
 *
 * Sent-state notice renders inline after a manual-id submission
 * (POST-render-next, no redirect) so the user stays on the wizard.
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
   * claim. Carries an optional dev outcomeNote when the silent
   * anti-enumeration paths fired.
   */
  sentNotice: {
    /** "We sent a confirmation email…" banner gate. */
    show: boolean;
    /** Dev-mode operator note (no_match / target_rate_limited explainer). */
    outcomeNote?: string;
  };
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
  declaredAnchors?: DeclaredAnchorView[];
  /** Show the required birth-date entry form while no birth date is on file. */
  showBirthDateAnchorField?: boolean;
  /** The birth date on file, rendered read-only once present. */
  birthDateOnFileDisplay?: string | null;
  /** Public Turnstile site key for the find-form CAPTCHA widget; null when the
   *  captcha is stubbed (dev + staging), so no widget renders there. */
  turnstileSiteKey?: string | null;
  /** Banner gate after a help-request submit redirected back to the task. */
  helpRequestNotice?: boolean;
  /** Mailbox-verification round-trip notice ('sent' | 'verified' | 'invalid'). */
  anchorVerificationNotice?: 'sent' | 'verified' | 'invalid' | null;
  /** Banner after an anchor add/remove redirected back: confirms the save and
   * the match re-check without leaking whether anything matched. */
  anchorSavedNotice?: 'saved' | 'removed' | null;
  /** Same-name collision against already-claimed records; renders the
   * "is one of these you?" prompt with the dispute affordance. */
  conflictPrompt: { records: RegistrationConflictRecord[] } | null;
}

export interface ClaimConfirmContent {
  legacyMemberId: string;
  displayName: string | null;
  country: string | null;
  isHof: boolean;
  isBap: boolean;
  token: string;
  clubAffiliations: string[];
  eventsAttended: Array<{ title: string; year: number }>;
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
  status: 'registered';
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
    _dummyHashPromise = hashPassword('footbag-dummy-timing-equaliser');
  }
  return _dummyHashPromise;
}

// Anti-enumeration timing equaliser for the single-use-token email flows
// (password-reset request, verify-email resend). The exists branch generates a
// token (random bytes + sha256) before enqueuing its email; the not-found
// branch must not return early having done nothing, or the wall-clock gap leaks
// whether the email is registered. Mirrors the login phantom-verify: reproduce
// the token-generation work and discard it. The two sub-millisecond DB inserts
// the real path adds are constant-time and below HTTP-observable noise.
function burnTokenIssuanceTiming(): void {
  const raw = randomBytes(32).toString('base64url');
  createHash('sha256').update(raw).digest('hex');
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
  // Per (email, IP) bucket: throttles one attacker hammering one account.
  const rl = rateLimitHit(`login:${normalized}:${ip}`, maxAttempts, windowMinutes);
  // Per-account bucket independent of IP: caps distributed credential-stuffing of
  // a single account from many IPs, which the per-IP bucket cannot see. Always
  // hit so the count accrues on every attempt regardless of the per-IP outcome.
  const accountMaxAttempts = readIntConfig('login_account_rate_limit_max_attempts', 30);
  const accountWindowMinutes = readIntConfig('login_account_rate_limit_window_minutes', 60);
  const accountRl = rateLimitHit(`login-account:${normalized}`, accountMaxAttempts, accountWindowMinutes);
  if (!rl.allowed || !accountRl.allowed) {
    const emailHash = createHash('sha256').update(normalized).digest('hex');
    const retryAfterSeconds = Math.max(rl.retryAfterSeconds ?? 0, accountRl.retryAfterSeconds ?? 0);
    appendAuditEntry({
      actionType: 'auth.login_rate_limited',
      category: 'auth',
      actorType: 'system',
      actorMemberId: null,
      entityType: 'login_attempt',
      entityId: emailHash,
      metadata: {
        retryAfterSeconds,
        bucket: !rl.allowed ? 'email_ip' : 'account',
        windowMinutes: !rl.allowed ? windowMinutes : accountWindowMinutes,
        maxAttempts: !rl.allowed ? maxAttempts : accountMaxAttempts,
      },
    });
    throw new RateLimitedError(
      'Too many failed login attempts. Please try again later.',
      retryAfterSeconds,
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

const SLUG_PATTERN = /^[a-z0-9]([a-z0-9_]*[a-z0-9])?$/;
const MAX_SLUG_LENGTH = 64;
const MIN_SLUG_LENGTH = 2;

function validateSlug(slug: string, realName: string): void {
  if (slug.length < MIN_SLUG_LENGTH) {
    throw new ValidationError(`Profile URL must be at least ${MIN_SLUG_LENGTH} characters.`);
  }
  if (slug.length > MAX_SLUG_LENGTH) {
    throw new ValidationError(`Profile URL must be ${MAX_SLUG_LENGTH} characters or fewer.`);
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new ValidationError('Profile URL must contain only lowercase letters, numbers, and underscores.');
  }
  const surname = surnameKey(realName);
  if (surname && !slug.includes(surname)) {
    throw new ValidationError('Profile URL must contain your last name.');
  }
}

/**
 * When registration hits an already-registered email, notify the real account
 * address out of band instead of revealing the collision to the submitter. The
 * notice offers sign-in and password-reset links; the person who submitted the
 * form gets the identical "check your email" response either way. Strict
 * enqueue so an outbox outage fails the same way the new-account verify enqueue
 * does (503 on both branches), never a status difference that leaks existence.
 */
function enqueueAccountExistsNotice(existing: { id: string; login_email: string }, now: string): void {
  const baseUrl = config.publicBaseUrl.replace(/\/+$/, '');
  emailService.send({
    template: 'account_exists_notice',
    params: { loginUrl: `${baseUrl}/login`, resetUrl: `${baseUrl}/password/forgot` },
    recipientEmail: existing.login_email,
    recipientMemberId: existing.id,
    idempotencyKey: `account_exists_notice:${existing.id}:${now}`,
    strict: true,
  });
  appendAuditEntry({
    actionType: 'auth.register_duplicate_email',
    category: 'auth',
    actorType: 'system',
    actorMemberId: null,
    entityType: 'member',
    entityId: existing.id,
  });
}

async function registerMember(
  email: string,
  password: string,
  confirmPassword: string,
  realName: string,
  displayName: string,
  ip: string,
  requestedSlug?: string,
): Promise<RegisterResult> {
  // Rate-limit by caller IP before any validation or argon2 hashing, so a tight
  // loop of distinct-email registrations from one source cannot flood the outbox
  // or exhaust CPU. Mirrors attemptLogin's IP-keyed bucket.
  const maxAttempts = readIntConfig('register_rate_limit_max_attempts', 10);
  const windowMinutes = readIntConfig('register_rate_limit_window_minutes', 15);
  const rl = rateLimitHit(`register:${ip}`, maxAttempts, windowMinutes);
  if (!rl.allowed) {
    const ipHash = createHash('sha256').update(ip).digest('hex');
    appendAuditEntry({
      actionType: 'auth.register_rate_limited',
      category: 'auth',
      actorType: 'system',
      actorMemberId: null,
      entityType: 'registration_attempt',
      entityId: ipHash,
      metadata: {
        retryAfterSeconds: rl.retryAfterSeconds,
        windowMinutes,
        maxAttempts,
      },
    });
    throw new RateLimitedError(
      'Too many registration attempts. Please try again later.',
      rl.retryAfterSeconds,
    );
  }

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

  const trimmedSlug = requestedSlug?.trim().toLowerCase() ?? '';
  const userProvidedSlug = trimmedSlug !== '';
  if (userProvidedSlug) {
    validateSlug(trimmedSlug, trimmedRealName);
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

  // Hash before the existence check so the new-account and already-registered
  // paths pay the same argon2 cost. Anti-enumeration: registration returns the
  // identical "check your email" response whether or not the email is already
  // registered; an existing address instead receives an out-of-band notice
  // (with sign-in / reset links), so the submitter learns nothing.
  const id = `member_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const hash = await hashPassword(password);
  const now = new Date().toISOString();

  const existingAccount = registration.findForDuplicateNotice.get(normalizedEmail) as
    | { id: string; login_email: string }
    | undefined;
  if (existingAccount) {
    enqueueAccountExistsNotice(existingAccount, now);
    return { status: 'registered' };
  }

  // Insert with race-defensive catch:
  //   - UNIQUE on login_email_normalized: a registration raced the pre-check;
  //     enqueue the account-exists notice and return the identical response so
  //     the outcome is observationally the same as the pre-check duplicate path.
  //   - UNIQUE on slug: another insert claimed the slug we picked; regenerate
  //     and retry up to MAX_SLUG_RETRIES times. Bounded retry; the slug
  //     suffix space is large so collisions resolve quickly.
  const MAX_SLUG_RETRIES = 3;
  let slug = userProvidedSlug ? trimmedSlug : generateUniqueSlug(trimmedDisplayName);
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
        'undisclosed',                      // gender: defaults to undisclosed; the member sets it later in the onboarding wizard's personal-details step
        now,   // created_at
        now,   // updated_at
      );
      inserted = true;
      break;
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      const msg = String((err as Error).message ?? '');
      if (msg.includes('login_email_normalized')) {
        // A concurrent registration or an existing account claimed this email
        // between the pre-check and the insert. Same enumeration-safe outcome:
        // notify the real address out of band, return the identical response.
        const raced = registration.findForDuplicateNotice.get(normalizedEmail) as
          | { id: string; login_email: string }
          | undefined;
        if (raced) enqueueAccountExistsNotice(raced, now);
        return { status: 'registered' };
      }
      if (msg.includes('slug')) {
        if (userProvidedSlug) {
          throw new ValidationError('This profile URL is already taken.');
        }
        if (attempt < MAX_SLUG_RETRIES) {
          slug = generateUniqueSlug(trimmedDisplayName);
          continue;
        }
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

  applyDevStagingBootstrapAdmin({ memberId: id, normalizedEmail, now }); // dev/staging register-allowlist bootstrap; no-op in production

  // Record the canonical registration audit before the verify-email enqueue.
  // The member row is already committed; enqueue failure re-throws (recording
  // auth.register_notification_failed), so writing auth.register first keeps the
  // registration itself auditable even when the notification path degrades.
  appendAuditEntry({
    actionType: 'auth.register',
    category: 'auth',
    actorType: 'system',
    actorMemberId: null,
    entityType: 'member',
    entityId: id,
  });

  // Same-name collision against already-claimed records, detected at the
  // earliest point. The wizard re-derives the prompt at render time; this
  // event records that the collision existed at signup.
  const conflicts = detectRegistrationConflicts(id, trimmedRealName);
  if (conflicts.length > 0) {
    appendAuditEntry({
      actionType: 'legacy.registration_conflict_prompted',
      category: 'identity',
      actorType: 'system',
      actorMemberId: null,
      entityType: 'member',
      entityId: id,
      reasonText: null,
      metadata: {
        conflict_count: conflicts.length,
        conflicts: conflicts.map((c) => ({ display_name: c.displayName, source: c.sourceLabel })),
      },
    });
  }

  await issueAndEnqueueVerifyEmail(id, trimmedEmail);

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
export type AutoLinkAnchorSource = 'login_email' | 'declared_old_email' | 'declared_old_email_verified';

export type AutoLinkClassification =
  | { confidence: 'none' }
  | { confidence: 'high'; personId: string; personName: string; anchorSource: AutoLinkAnchorSource }
  | {
      confidence: 'medium';
      personId: string;
      personName: string;
      matchedVariantNormalized: string;
      anchorSource: AutoLinkAnchorSource;
    }
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
  // Token issuance is inside the try so a token-store failure (e.g. SQLITE_BUSY)
  // is audited and re-thrown on the same path as an enqueue failure. resendVerifyEmail
  // swallows the re-throw for anti-enumeration, so an un-audited token-store error here
  // would otherwise vanish silently.
  let tokenRowId: string | undefined;
  try {
    const ttlHours = readIntConfig('email_verify_expiry_hours', 24);
    const issued = accountTokenService.issueToken({
      memberId,
      tokenType: 'email_verify',
      ttlHours,
    });
    tokenRowId = issued.tokenRowId;
    const baseUrl = config.publicBaseUrl.replace(/\/+$/, '');
    const verifyUrl = `${baseUrl}/verify/${issued.rawToken}`;
    emailService.send({
      template: 'account_verify',
      params: { verifyUrl, ttlHours },
      recipientEmail,
      recipientMemberId: memberId,
      // tokenRowId is the natural single-use key: re-issuing on a worker
      // restart between SES-send and outbox-mark-sent collapses to the same
      // outbox row instead of double-delivering.
      idempotencyKey: `verify:${issued.tokenRowId}`,
      strict: true,
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
      reasonText: 'Member row committed but verify-email token issuance or enqueue failed.',
      cause: err,
      metadata: { tokenRowId: tokenRowId ?? null },
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
  // Consume and mark-verified commit together: a crash between the two would
  // otherwise burn the single-use token while the member stays unverified,
  // leaving them a dead link recoverable only via resend.
  const consumed = transaction(() => {
    const c = accountTokenService.consumeIfUnusedInTx(rawToken, 'email_verify');
    if (!c) return null;

    const now = new Date().toISOString();
    const update = auth.markEmailVerified.run(now, now, c.memberId);
    // update.changes may be 0 if the member was already verified; that's fine
    // since the token itself is single-use, we proceed with login in any case.
    if (update.changes > 0) {
      // Account-lifecycle trail: verification is the transition that activates
      // the account, so it gets an audit row like register and password events.
      appendAuditEntry({
        actionType: 'auth.email_verified',
        category: 'auth',
        actorType: 'member',
        actorMemberId: c.memberId,
        entityType: 'member',
        entityId: c.memberId,
      });
    }
    return c;
  });
  if (!consumed) return null;

  const row = auth.findMemberForSessionAfterVerify.get(consumed.memberId) as
    | { id: string; slug: string | null; login_email: string | null; real_name: string | null; password_version: number; is_admin: number; birth_date: string | null }
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
    : classifyAutoLink(row.real_name, legacyMatch, row.birth_date);
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
function getDeclaredAnchorValues(memberId: string): {
  oldEmails: string[];
  oldEmailsDetailed: Array<{ value: string; verified: boolean }>;
  formerSurnames: string[];
} {
  const rows = declaredAnchors.listByMember.all(memberId) as Array<{
    anchor_type: string;
    anchor_value: string;
    verified_via_link_click_at?: string | null;
  }>;
  const oldEmailRows = rows.filter((r) => r.anchor_type === 'old_email');
  return {
    oldEmails:         oldEmailRows.map((r) => r.anchor_value),
    oldEmailsDetailed: oldEmailRows.map((r) => ({
      value:    r.anchor_value,
      verified: r.verified_via_link_click_at != null,
    })),
    formerSurnames: rows.filter((r) => r.anchor_type === 'former_surname').map((r) => r.anchor_value),
  };
}

/**
 * Surname gate that honors declared former surnames alongside the current
 * real-name surname, so a member who changed names can still pass the
 * direct-claim surname rule and the conflict checks.
 */
function surnameMatchesWithAnchors(
  memberId: string,
  realName: string | null,
  targetName: string | null,
): boolean {
  if (normalizedSurnamesMatch(realName, targetName)) return true;
  const { formerSurnames } = getDeclaredAnchorValues(memberId);
  return formerSurnames.some((s) => normalizedSurnamesMatch(s, targetName));
}


export interface RegistrationConflictRecord {
  displayName: string;
  sourceLabel: string;
}

/**
 * Same-name collision check against ALREADY-CLAIMED records: a registrant
 * whose surname (current or declared former) matches a claimed legacy
 * account or a claimed historical person gets the inline "is one of these
 * you?" prompt, catching collisions and impersonation at the earliest
 * point. Capped so a common surname cannot flood the card.
 */
function detectRegistrationConflicts(memberId: string, realName: string): RegistrationConflictRecord[] {
  const out: RegistrationConflictRecord[] = [];
  const claimedLegacy = declaredAnchors.listClaimedLegacyForConflictScan.all() as Array<{
    legacy_member_id: string; display_name: string | null;
  }>;
  for (const row of claimedLegacy) {
    // Match and display only the chosen public handle: matching on the legal
    // real_name would let a surname-matched registrant link a member's public
    // handle to their legal surname, which is itself a disclosure.
    const name = row.display_name;
    if (!name) continue;
    if (surnameMatchesWithAnchors(memberId, realName, name)) {
      out.push({ displayName: name, sourceLabel: 'Claimed legacy footbag.org account' });
      if (out.length >= 5) return out;
    }
  }
  const claimedHp = declaredAnchors.listClaimedHpForConflictScan.all() as Array<{
    person_id: string; person_name: string;
  }>;
  for (const row of claimedHp) {
    if (surnameMatchesWithAnchors(memberId, realName, row.person_name)) {
      out.push({ displayName: row.person_name, sourceLabel: 'Claimed competition record' });
      if (out.length >= 5) return out;
    }
  }
  return out;
}

function getAutoLinkClassificationForMember(memberId: string): AutoLinkClassification {
  const member = legacyClaim.findClaimingMember.get(memberId) as
    | { id: string; real_name: string; legacy_member_id: string | null; historical_person_id: string | null; birth_date: string | null }
    | undefined;
  if (!member) return { confidence: 'none' };

  if (member.legacy_member_id || member.historical_person_id) {
    return { confidence: 'none' };
  }

  const loginEmail = (auth.findMemberForSessionAfterVerify.get(memberId) as
    | { login_email: string | null }
    | undefined)?.login_email;

  // Email anchors in priority order: the verified login email first, then
  // each declared old email. The first single match wins; an ambiguous
  // anchor anywhere collapses to low so an attacker-shaped anchor set can
  // never silently pick among multiple accounts.
  const anchors: Array<{ value: string; source: AutoLinkAnchorSource }> = [];
  if (loginEmail) anchors.push({ value: loginEmail, source: 'login_email' });
  for (const declared of getDeclaredAnchorValues(memberId).oldEmailsDetailed) {
    anchors.push({
      value:  declared.value,
      source: declared.verified ? 'declared_old_email_verified' : 'declared_old_email',
    });
  }
  if (anchors.length === 0) return { confidence: 'none' };

  let legacyMatch: LegacyAccountLookupResult | null = null;
  let anchorSource: AutoLinkAnchorSource = 'login_email';
  for (const anchor of anchors) {
    try {
      const lookup = lookupLegacyAccount(memberId, anchor.value);
      if (lookup.kind === 'ambiguous_email') {
        return { confidence: 'low', reason: 'ambiguous_email_anchor' };
      }
      if (lookup.kind === 'single') {
        legacyMatch = lookup.result;
        anchorSource = anchor.source;
        break;
      }
    } catch {
      // Non-revealing on lookup errors; try the next anchor.
    }
  }
  return classifyAutoLink(member.real_name, legacyMatch, member.birth_date, anchorSource);
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
 * `sentNotice` and `lowConfidenceBanner` are HTTP-context inputs from the
 * controller (driven by `?sent=1` and `?from=register | ?reason=low_confidence`).
 * They're threaded in here so the template stays logic-light.
 *
 * Returns null when the member is not found (controller renders 404).
 */

const BIO_EXCERPT_MAX = 200;

function bioExcerptFor(legacyMemberId: string | null): string | null {
  if (!legacyMemberId) return null;
  const row = legacyMembers.findByLegacyMemberId.get(legacyMemberId) as LegacyMemberRow | undefined;
  if (!row?.bio) return null;
  const trimmed = row.bio.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= BIO_EXCERPT_MAX) return trimmed;
  return trimmed.slice(0, BIO_EXCERPT_MAX) + '…';
}

function candidateClubsAndEvents(personId: string | null): {
  clubAffiliations: string[];
  eventsAttended: Array<{ title: string; year: number }>;
} {
  if (!personId) return { clubAffiliations: [], eventsAttended: [] };
  const clubs = legacyClaim.listClubAffiliationsForPerson.all(personId) as { display_name: string }[];
  const events = legacyClaim.listEventsAttendedByPerson.all(personId) as { title: string; year: number }[];
  return {
    clubAffiliations: clubs.map((r) => r.display_name),
    eventsAttended: events.map((r) => ({ title: r.title, year: r.year })),
  };
}

function getLinkHistoryView(
  memberId: string,
  opts: {
    fromRegister: boolean;
    reasonIsLowConfidence: boolean;
    sentOutcome: 'enqueued' | 'no_match' | 'target_rate_limited' | null;
  },
): LinkHistoryContent | null {
  const member = legacyClaim.findClaimingMember.get(memberId) as ClaimingMemberRow | undefined;
  if (!member) return null;

  const links = account.findIdentityLinks.get(memberId) as IdentityLinksRow | undefined;
  const legacyLinked = links?.legacy_member_id != null;
  const hpLinked     = links?.historical_person_id != null;

  const candidates: LinkHistoryCandidate[] = [];

  // 1a. Open staged candidates (batch or registration-time pass). These are
  // the persisted stage-and-confirm cards: confirm runs the ordinary claim,
  // decline resolves the row terminally.
  // Open staged rows render until BOTH sources are linked: pre-claim batch
  // candidates target an unlinked member; cross-source offers target a
  // member with exactly one side linked. A row renders only when it offers
  // a side the member still lacks.
  const stagedRows = legacyLinked && hpLinked
    ? ([] as AutoLinkStagedCandidateRow[])
    : (autoLinkStagedCandidates.listOpenByMember.all(memberId) as AutoLinkStagedCandidateRow[]).filter(
        (r) =>
          (!hpLinked && r.historical_person_id != null) ||
          (!legacyLinked && r.legacy_member_id != null && r.historical_person_id == null),
      );
  const stagedPersonIds = new Set<string>();
  for (const staged of stagedRows) {
    if (!staged.historical_person_id) {
      // Cross-source offer for a legacy account (the member's HP side is
      // already linked): confirm applies the legacy claim directly.
      if (!staged.legacy_member_id) continue;
      const stagedLm = legacyMembers.findByLegacyMemberId.get(staged.legacy_member_id) as LegacyMemberRow | undefined;
      if (!stagedLm) continue;
      candidates.push({
        claimMode: 'cross_source_legacy',
        displayName: stagedLm.display_name ?? stagedLm.real_name ?? 'Unknown',
        provenanceLabel: 'Old footbag.org user account that appears to match your history.',
        legacyMemberId: staged.legacy_member_id,
        personId: null,
        stagedCandidateId: staged.id,
        country: stagedLm.country ?? null,
        isHof: Boolean(stagedLm.is_hof),
        isBap: Boolean(stagedLm.is_bap),
        firstYear: null,
        aliasesLabel: null,
        alreadyLinkedSinceDisplay: null,
        bioExcerpt: bioExcerptFor(staged.legacy_member_id),
        clubAffiliations: [],
        eventsAttended: [],
      });
      continue;
    }
    stagedPersonIds.add(staged.historical_person_id);
    const stagedHp = legacyClaim.findHistoricalPersonById.get(staged.historical_person_id) as HistoricalPersonClaimRow | undefined;
    if (!stagedHp) continue;
    candidates.push({
      claimMode: 'auto_link_confirm',
      displayName: stagedHp.person_name,
      provenanceLabel: staged.confidence === 'high'
        ? 'Likely your record (matched by name and email).'
        : 'Possible match (matched by a name variant and email).',
      legacyMemberId: staged.legacy_member_id,
      personId: staged.historical_person_id,
      stagedCandidateId: staged.id,
      country: stagedHp.country ?? null,
      isHof: stagedHp.hof_member !== 0 && stagedHp.hof_member != null,
      isBap: stagedHp.bap_member !== 0 && stagedHp.bap_member != null,
      firstYear: stagedHp.first_year ?? null,
      aliasesLabel: shapeAliasesLabel(stagedHp.aliases ?? null),
      alreadyLinkedSinceDisplay: null,
      bioExcerpt: bioExcerptFor(stagedHp.legacy_member_id ?? null),
      ...candidateClubsAndEvents(staged.historical_person_id),
    });
  }

  // Targets the member already declined stay declined: never re-surface them
  // as classifier cards.
  const declinedTargets = legacyLinked || hpLinked
    ? new Set<string>()
    : new Set(
        (autoLinkStagedCandidates.listResolvedByMember.all(memberId) as AutoLinkStagedCandidateRow[])
          .filter((r) => r.status === 'declined')
          .flatMap((r) => [r.historical_person_id, r.legacy_member_id].filter((v): v is string => v != null)),
      );

  // 1b. Verify-time classifier output: newly-found candidates not already
  // covered by a staged card and not previously declined. Only when neither
  // linkage is present (the classifier returns 'none' when either is set).
  const classification = legacyLinked || hpLinked
    ? ({ confidence: 'none' } as AutoLinkClassification)
    : getAutoLinkClassificationForMember(memberId);
  let classifierPersonId: string | null = null;
  if (
    (classification.confidence === 'high' || classification.confidence === 'medium') &&
    !stagedPersonIds.has(classification.personId) &&
    !declinedTargets.has(classification.personId)
  ) {
    classifierPersonId = classification.personId;
    const classifierHp = legacyClaim.findHistoricalPersonById.get(classification.personId) as HistoricalPersonClaimRow | undefined;
    candidates.push({
      claimMode: 'auto_link_confirm',
      displayName: classification.personName,
      provenanceLabel: classification.confidence === 'high'
        ? 'Likely your record (matched by name and email).'
        : 'Possible match (matched by a name variant and email).',
      legacyMemberId: null,
      personId: classification.personId,
      country: classifierHp?.country ?? null,
      isHof: classifierHp?.hof_member !== 0 && classifierHp?.hof_member != null,
      isBap: classifierHp?.bap_member !== 0 && classifierHp?.bap_member != null,
      firstYear: classifierHp?.first_year ?? null,
      aliasesLabel: shapeAliasesLabel(classifierHp?.aliases ?? null),
      alreadyLinkedSinceDisplay: null,
      bioExcerpt: bioExcerptFor(classifierHp?.legacy_member_id ?? null),
      ...candidateClubsAndEvents(classification.personId),
    });
  }

  // 2. Email-anchored legacy match. Skipped when legacy is already linked.
  // Also skipped when a staged or classifier card above already represents
  // this person (transitive: email → legacy → HP back-link). Declared
  // old-email cards are appended by the wizard wrapper with their own
  // provenance labels.
  const seenLegacyIds = new Set<string>(
    stagedRows.map((r) => r.legacy_member_id).filter((v): v is string => v != null),
  );
  if (!legacyLinked && member.login_email_normalized) {
    try {
      const lookup = lookupLegacyAccount(memberId, member.login_email_normalized);
      if (lookup.kind === 'single') {
        const row = legacyMembers.findByLegacyMemberId.get(lookup.result.legacyMemberId) as LegacyMemberRow | undefined;
        // A declined pair covers this card too: the email-anchored card is
        // the same candidate account, so re-offering it without new signal
        // would undo the member's standing decline.
        if (row && !seenLegacyIds.has(row.legacy_member_id) && !declinedTargets.has(row.legacy_member_id)) {
          seenLegacyIds.add(row.legacy_member_id);
          // Detect "both" via HP back-link to avoid duplicate cards.
          const backHp = legacyClaim.findHistoricalPersonByLegacyId.get(row.legacy_member_id) as HistoricalPersonClaimRow | undefined;
          const isBoth = backHp != null;
          // Skip if a staged card or the classifier card above already
          // covers this HP.
          const alreadyShownAsClassifier =
            isBoth &&
            (classifierPersonId === backHp!.person_id || stagedPersonIds.has(backHp!.person_id));
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
              firstYear: backHp?.first_year ?? null,
              alreadyLinkedSinceDisplay: null,
              aliasesLabel: shapeAliasesLabel(backHp?.aliases ?? null),
              bioExcerpt: bioExcerptFor(row.legacy_member_id),
              ...candidateClubsAndEvents(backHp?.person_id ?? null),
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
      const hp = legacyClaim.findHistoricalPersonById.get(c.personId) as HistoricalPersonClaimRow | undefined;
      candidates.push({
        claimMode: 'hp_review_page',
        displayName: c.personName,
        provenanceLabel: 'Competition record.',
        legacyMemberId: null,
        personId: c.personId,
        country: hp?.country ?? null,
        isHof: hp?.hof_member !== 0 && hp?.hof_member != null,
        isBap: hp?.bap_member !== 0 && hp?.bap_member != null,
        firstYear: hp?.first_year ?? null,
        alreadyLinkedSinceDisplay: null,
        aliasesLabel: shapeAliasesLabel(hp?.aliases ?? null),
        bioExcerpt: bioExcerptFor(hp?.legacy_member_id ?? null),
        ...candidateClubsAndEvents(c.personId),
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
      firstYear: null,
      alreadyLinkedSinceDisplay: links?.legacy_claimed_at ? formatDateForDisplay(links.legacy_claimed_at) : null,
      aliasesLabel: null,
      bioExcerpt: null,
      clubAffiliations: [],
      eventsAttended: [],
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
      firstYear: null,
      alreadyLinkedSinceDisplay: null,
      aliasesLabel: null,
      bioExcerpt: null,
      clubAffiliations: [],
      eventsAttended: [],
    });
  }

  let outcomeNote: string | undefined;
  if (opts.sentOutcome === 'no_match' && config.sesAdapter === 'stub') {
    outcomeNote = "No confirmation email was sent for this attempt. The identifier may not match an eligible legacy record. (Production users see the same banner regardless, for anti-enumeration.)";
  } else if (opts.sentOutcome === 'target_rate_limited' && config.sesAdapter === 'stub') {
    outcomeNote = "No confirmation email was sent for this attempt. The legacy mailbox has hit its hourly send cap. (Production users see the same banner regardless, for anti-enumeration.)";
  }

  return {
    memberSlug: member.slug,
    skipHref: opts.fromRegister ? '/register/wizard/legacy_claim/skip' : null,
    dashboardHref: `/members/${member.slug}`,
    candidates,
    sentNotice: {
      show: opts.sentOutcome !== null,
      outcomeNote,
    },
    // Low-confidence banner is only meaningful when we have NO actionable
    // candidate to offer. Once a candidate appears (manual-id search hit, an
    // auto-link suggestion, a name-variant HP review) the banner contradicts
    // the card the user can act on, so suppress it.
    conflictPrompt: (() => {
      if (legacyLinked || hpLinked) return null;
      const records = detectRegistrationConflicts(memberId, member.real_name);
      return records.length > 0 ? { records } : null;
    })(),
    lowConfidenceBanner:
      !legacyLinked
      && (opts.fromRegister || opts.reasonIsLowConfidence)
      && !candidates.some((c) => c.claimMode !== 'already_linked'),
    autoLinkDriftNotice: false,
  };
}

function shapeAliasesLabel(aliases: string | null): string | null {
  if (!aliases || !aliases.trim()) return null;
  const parts = aliases.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return `Also known as: ${parts.join(', ')}`;
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
  memberBirthDate: string | null = null,
  anchorSource: AutoLinkAnchorSource = 'login_email',
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
    // Birth-date disambiguation among tied same-name candidates. An identical
    // date narrows at full strength; a near-miss (a transposed day/month or a
    // single component off by one, the common entry errors) still narrows but
    // is capped at medium so the member's explicit confirmation is required.
    const dobComparison = memberBirthDate && legacyMatch.birthDate
      ? compareBirthDates(memberBirthDate, legacyMatch.birthDate)
      : null;
    if (dobComparison === 'identical' || dobComparison === 'near_miss') {
      const provenanceCandidate = candidates.find((c) => c.personId === hpProvenance.person_id);
      if (provenanceCandidate) {
        const narrowed = provenanceCandidate;
        if (!normalizedSurnamesMatch(realName, narrowed.personName)) {
          return { confidence: 'low', reason: 'hp_mismatch' };
        }
        if (narrowed.matchKind === 'exact' && dobComparison === 'identical') {
          return { confidence: 'high', personId: narrowed.personId, personName: narrowed.personName, anchorSource };
        }
        return {
          confidence: 'medium',
          personId: narrowed.personId,
          personName: narrowed.personName,
          matchedVariantNormalized: narrowed.matchedVariantNormalized ?? '',
          anchorSource,
        };
      }
    }
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
      anchorSource,
    };
  }
  return {
    confidence: 'medium',
    personId: candidate.personId,
    personName: candidate.personName,
    matchedVariantNormalized: candidate.matchedVariantNormalized ?? '',
    anchorSource,
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
  if (!row) {
    // Reach the same token-generation work the exists branch performs, so the
    // response time does not leak whether an unverified member matches.
    burnTokenIssuanceTiming();
    return;
  }
  try {
    await issueAndEnqueueVerifyEmail(row.id, email.trim());
  } catch {
    // Anti-enumeration: registered-but-unverified and unknown emails must return
    // identical UX. issueAndEnqueueVerifyEmail already recorded
    // auth.register_notification_failed (operator alarm preserved); swallow here
    // so the route returns 200 in both branches, matching requestPasswordReset.
  }
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
  birthDate: string | null;
}

/**
 * Outcome of a legacy-account lookup by identifier (email / username / id).
 *
 * The lookup matches the identifier against a legacy account's primary and two
 * secondary email columns, so a member who arrives under a secondary address
 * still links. The `ambiguous_email` branch signals that the identifier matches
 * 2+ rows, which includes an address that collides across accounts (primary on
 * one, secondary on another) when the legacy-data validation gate did not catch
 * it first. Callers MUST NOT silently pick one. Verify-time paths surface this as
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

  // The email value is bound once per legacy email column (primary plus two
  // secondary); a match on any column links the account.
  const normalizedEmail = normalizeEmail(identifier);
  const rows = legacyMembers.findAllByIdentifier.all(
    trimmed, trimmed, normalizedEmail, normalizedEmail, normalizedEmail,
  ) as LegacyMemberRow[];
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
      birthDate: row.birth_date ?? null,
    },
  };
}

/**
 * Surname-rule rejection of a direct historical-person claim. A subclass of
 * ValidationError so existing error handling renders the same user-facing
 * message; the typed form lets callers record the blocked-claim audit event
 * after their transaction rolls back.
 */
export class SurnameMismatchError extends ValidationError {
  constructor(
    message: string,
    public readonly personId: string,
    public readonly personName: string,
  ) {
    super(message);
    this.name = 'SurnameMismatchError';
  }
}

/**
 * Records the server-side surname rejection of a direct historical-person
 * claim. Called by claim entry points after their transaction rolled back,
 * so the forensic record survives the failed claim.
 */
function recordHistoricalPersonClaimBlocked(memberId: string, err: SurnameMismatchError): void {
  appendAuditEntry({
    actionType:    'claim.historical_person_blocked',
    category:      'identity',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'member',
    entityId:      memberId,
    reasonText:    null,
    metadata: {
      person_id:   err.personId,
      person_name: err.personName,
      reason:      'surname_mismatch',
    },
  });
}

/**
 * Evidence-strength tag carried on every confirmed-claim audit row. Name-only
 * evidence (surname rule, name-variant match) tags the declared_anchor_only
 * floor tier, the weakest evidence band an admin sees when reviewing a
 * disputed claim.
 */
export type EvidenceStrength =
  | 'declared_anchor_only'
  | 'currently_controls_modern_email_matching_legacy'
  | 'mailbox_control_via_link_click'
  | 'admin_vetted_evidence';

/**
 * Execute the three-table claim merge inside the caller's transaction.
 * Throws ValidationError on every gate failure; the caller's transaction
 * rolls back any preceding writes (e.g. a token consume) when this throws.
 *
 * Race posture: the pre-checks are synchronous reads, but a concurrent
 * claimant (another process sharing the database) can win between the read
 * and the writes. The partial UNIQUE indexes on members.legacy_member_id,
 * members.historical_person_id, and legacy_members.claimed_by_member_id are
 * the load-bearing defense; a loser's SQLITE_CONSTRAINT_UNIQUE maps to
 * ConflictError so the controller renders the same user-readable response
 * as the synchronous already-claimed check, and the transaction (including
 * the tier grant) rolls back whole.
 */
function claimLegacyAccountInTx(
  requestingMemberId: string,
  targetLegacyMemberId: string,
  evidenceStrength: EvidenceStrength,
): void {
  try {
    claimLegacyAccountInTxInner(requestingMemberId, targetLegacyMemberId, evidenceStrength);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ConflictError('This legacy record has already been claimed by another account.');
    }
    throw err;
  }
}

function claimLegacyAccountInTxInner(
  requestingMemberId: string,
  targetLegacyMemberId: string,
  evidenceStrength: EvidenceStrength,
): void {
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

  // Birth-date evidence comparison, read BEFORE the field transfer below
  // fills an absent member birth date from the legacy row. The outcome is
  // recorded permanently in the claim audit metadata and never gates the
  // claim: mailbox control plus the surname rule remain the load-bearing
  // evidence, and a legacy-side typo must not lock a member out.
  const claimant = legacyClaim.findClaimingMember.get(requestingMemberId) as
    | { birth_date: string | null; slug: string; real_name: string }
    | undefined;
  const dobComparison: string =
    claimant?.birth_date && row.birth_date
      ? compareBirthDates(claimant.birth_date, row.birth_date)
      : claimant?.birth_date
        ? 'legacy_dob_absent'
        : row.birth_date
          ? 'member_dob_absent'
          : 'both_dob_absent';

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
    // The link write is WHERE historical_person_id IS NULL; a 0-row result means
    // this member already holds an HP link (e.g. from a prior direct-HP claim
    // that left legacy_member_id NULL, which checkAlreadyClaimed does not catch).
    // Roll the whole claim back rather than proceeding with a stale link.
    const linked = legacyMembers.setMemberHistoricalPersonId.run(hp.person_id, now, requestingMemberId);
    if (linked.changes === 0) {
      throw new ValidationError('Your account is already linked to a historical player record.');
    }
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

  // Single tier grant per legacy claim; grants never stack. Maps the legacy
  // standing to a tier: honors (HoF or BAP, from the legacy row or the transitive
  // HP) or ever-paid Tier 2 → tier2; bought Tier 1 Lifetime or active Tier 1
  // Annual → tier1; otherwise tier0. Same transaction as the merge.
  const hasHof = Boolean(row.is_hof) || Boolean(hp?.hof_member);
  const hasBap = Boolean(row.is_bap) || Boolean(hp?.bap_member);
  applyLegacyClaimGrantInTx(requestingMemberId, requestingMemberId, {
    hasHof,
    hasBap,
    everPaidTier2:         Boolean(row.legacy_ever_paid_tier2),
    everPaidTier1Lifetime: Boolean(row.legacy_ever_paid_tier1_lifetime),
    tier1AnnualActive:     Boolean(row.legacy_tier1_annual_active_at_cutover),
  }, {
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
      evidence_strength:  evidenceStrength,
      dob_comparison:     dobComparison,
    },
  });

  // A hard birth-date mismatch on an otherwise-confirmed claim is the
  // strongest available red flag for a wrong claim, so it goes to the admin
  // review queue in the same transaction. Near-misses (typo-shaped) are
  // recorded in the audit metadata above but do not raise a queue item. The
  // raw dates live in detail_text (admin-only, scrubbed on PII purge), never
  // in the append-only audit ledger.
  if (dobComparison === 'mismatch') {
    workQueueService.enqueue({
      actorId:       requestingMemberId,
      queueCategory: 'membership',
      taskType:      'claim_dob_mismatch_review',
      entityType:    'member',
      entityId:      requestingMemberId,
      priority:      5,
      reasonText:    `Legacy account ${row.legacy_member_id} was claimed with a conflicting date of birth.`,
      detailText:
        `Claim confirmed with conflicting dates of birth: the member's entered date (${claimant?.birth_date}) ` +
        `does not match the legacy record's date (${row.birth_date}) for legacy account ${row.legacy_member_id}` +
        `${hp ? ` (linked historical record ${hp.person_id})` : ''}. ` +
        `Member to review: id ${requestingMemberId}, profile /members/${claimant?.slug}. ` +
        'Review the claim; if it looks wrong, use the link-help dispute revert.',
    });
  }

  // A claim through any path counts as confirmation of a matching staged
  // candidate; resolve it in the same transaction.
  resolveStagedCandidatesOnClaimInTx(requestingMemberId, {
    legacyMemberId: row.legacy_member_id,
    personId:       hp?.person_id ?? null,
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
function claimLegacyAccount(
  requestingMemberId: string,
  targetLegacyMemberId: string,
  evidenceStrength: EvidenceStrength = 'declared_anchor_only',
): void {
  transaction(() => {
    claimLegacyAccountInTx(requestingMemberId, targetLegacyMemberId, evidenceStrength);
  });
}

// ── Auto-link candidate staging (stage-and-confirm) ─────────────────────────
//
// The batch cutover pass (and future registration-time passes) never mutates
// live tables: a high- or medium-confidence classifier outcome for an
// unlinked member becomes a row in auto_link_staged_candidates plus a
// legacy.auto_link_candidate_staged audit entry, and nothing else. No email
// is sent. The member sees the staged candidate as a wizard card at next
// sign-in and confirms (ordinary claim transaction) or declines; staged rows
// that age past their expiry window are swept to 'expired'.
//
// Non-throwing discriminated return so the caller (runBatchAutoLink) can
// tally outcomes without try/catch.
export type StageAutoLinkCandidateResult =
  | { status: 'staged'; candidateId: string; confidence: 'high' | 'medium' }
  | { status: 'already_staged' }
  | { status: 'skipped_previously_declined' }
  | { status: 'skipped_already_linked' }
  | { status: 'skipped_no_legacy_for_hp' }
  | { status: 'skipped_legacy_claimed_by_other' };

export interface StageAutoLinkCandidateInput {
  confidence: 'high' | 'medium';
  personId: string;
  personName: string;
  matchedVariantNormalized?: string;
  anchorSource?: AutoLinkAnchorSource;
}

export type AutoLinkSourcePass = 'batch' | 'sign_in' | 'registration' | 'cross_source';

function stagedCandidateExpiryDays(): number {
  return readIntConfig('auto_link_staged_expiry_days', 365);
}

function newStagedCandidateId(): string {
  return `alsc_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

function stageAutoLinkCandidate(
  memberId: string,
  classification: StageAutoLinkCandidateInput,
  sourcePass: AutoLinkSourcePass,
): StageAutoLinkCandidateResult {
  const member = legacyClaim.findClaimingMember.get(memberId) as
    | {
        id: string;
        real_name: string;
        legacy_member_id: string | null;
        historical_person_id: string | null;
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

  // A member's decline is a standing decision: never re-stage a pair the
  // member already declined. (Expired rows do re-stage; expiry records
  // inaction, not refusal.)
  const resolved = autoLinkStagedCandidates.listResolvedByMember.all(memberId) as AutoLinkStagedCandidateRow[];
  const previouslyDeclined = resolved.some(
    (r) =>
      r.status === 'declined' &&
      (r.legacy_member_id === lm.legacy_member_id || r.historical_person_id === hp.person_id),
  );
  if (previouslyDeclined) return { status: 'skipped_previously_declined' };

  const anchorSource: AutoLinkAnchorSource = classification.anchorSource ?? 'login_email';
  const emailAnchor =
    anchorSource === 'login_email' ? 'modern_email' : anchorSource;
  const matchedAnchors =
    classification.confidence === 'high'
      ? [emailAnchor, 'real_name_surname']
      : [emailAnchor, 'name_variant'];
  // A declared old email is asserted, not proven: it proposes only the
  // floor tier no matter how confident the match is. Mailbox proof of the
  // declared address (the link-click round-trip) upgrades the tier.
  const proposedEvidence: EvidenceStrength =
    classification.confidence !== 'high'
      ? 'declared_anchor_only'
      : anchorSource === 'login_email'
        ? 'currently_controls_modern_email_matching_legacy'
        : anchorSource === 'declared_old_email_verified'
          ? 'mailbox_control_via_link_click'
          : 'declared_anchor_only';

  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + stagedCandidateExpiryDays() * 24 * 60 * 60 * 1000,
  ).toISOString();
  const candidateId = newStagedCandidateId();

  try {
    transaction(() => {
      autoLinkStagedCandidates.insertCandidate.run(
        candidateId,
        now, 'system', now, 'system',
        memberId,
        lm.legacy_member_id,
        hp.person_id,
        classification.confidence,
        JSON.stringify(matchedAnchors),
        proposedEvidence,
        sourcePass,
        expiresAt,
      );
      appendAuditEntry({
        actionType:    'legacy.auto_link_candidate_staged',
        category:      'identity',
        actorType:     'system',
        actorMemberId: null,
        entityType:    'member',
        entityId:      memberId,
        reasonText:    null,
        metadata: {
          candidate_id:               candidateId,
          legacy_member_id:           lm.legacy_member_id,
          person_id:                  hp.person_id,
          confidence:                 classification.confidence,
          matched_anchors:            matchedAnchors,
          proposed_evidence_strength: proposedEvidence,
          source_pass:                sourcePass,
          ...(classification.confidence === 'medium' && classification.matchedVariantNormalized
            ? { matched_variant_normalized: classification.matchedVariantNormalized }
            : {}),
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { status: 'already_staged' };
    }
    throw err;
  }

  return { status: 'staged', candidateId, confidence: classification.confidence };
}

function listOpenStagedCandidates(memberId: string): AutoLinkStagedCandidateRow[] {
  return autoLinkStagedCandidates.listOpenByMember.all(memberId) as AutoLinkStagedCandidateRow[];
}

function declineStagedCandidate(
  memberId: string,
  candidateId: string,
): { status: 'declined' | 'not_found' } {
  const row = autoLinkStagedCandidates.findOpenById.get(candidateId) as
    | AutoLinkStagedCandidateRow
    | undefined;
  // Anti-enumeration: a foreign or unknown candidate id is indistinguishable
  // from an already-resolved one.
  if (!row || row.member_id !== memberId) return { status: 'not_found' };

  const now = new Date().toISOString();
  const outcome = transaction(() => {
    const res = autoLinkStagedCandidates.resolveById.run('declined', now, now, memberId, candidateId);
    if (res.changes === 0) return 'not_found' as const;
    appendAuditEntry({
      actionType:    row.source_pass === 'cross_source'
        ? 'legacy.cross_source_candidate_declined'
        : 'legacy.auto_link_candidate_declined',
      category:      'identity',
      actorType:     'member',
      actorMemberId: memberId,
      entityType:    'member',
      entityId:      memberId,
      reasonText:    null,
      metadata: {
        candidate_id:         candidateId,
        legacy_member_id:     row.legacy_member_id,
        historical_person_id: row.historical_person_id,
        confidence:           row.confidence,
      },
    });
    return 'declined' as const;
  });
  return { status: outcome };
}

/**
 * Decline a classifier-produced candidate that has no staged row yet. A
 * member's decline is a standing decision whatever kind of card carried it,
 * so the pair is staged (reusing the stager's validation and idempotency)
 * and immediately resolved declined: the wizard view suppresses declined
 * targets, and the stager never re-stages a declined pair without new
 * signal. A card that drifted out from under the member resolves to
 * not_applicable and the next render simply no longer offers it.
 */
function declineClassifierCandidate(
  memberId: string,
  personId: string,
): { status: 'declined' | 'not_applicable' } {
  if (!personId) return { status: 'not_applicable' };
  const classification = getAutoLinkClassificationForMember(memberId);
  if (
    (classification.confidence !== 'high' && classification.confidence !== 'medium') ||
    classification.personId !== personId
  ) {
    return { status: 'not_applicable' };
  }
  const staged = stageAutoLinkCandidate(memberId, classification, 'sign_in');
  if (staged.status === 'staged') {
    const declined = declineStagedCandidate(memberId, staged.candidateId);
    return { status: declined.status === 'declined' ? 'declined' : 'not_applicable' };
  }
  if (staged.status === 'already_staged') {
    // Race with a staging pass: decline the open row for this person.
    const open = listOpenStagedCandidates(memberId).find(
      (r) => r.historical_person_id === personId,
    );
    if (open) {
      const declined = declineStagedCandidate(memberId, open.id);
      return { status: declined.status === 'declined' ? 'declined' : 'not_applicable' };
    }
    return { status: 'not_applicable' };
  }
  if (staged.status === 'skipped_previously_declined') {
    return { status: 'declined' };
  }
  return { status: 'not_applicable' };
}

/**
 * Resolves any open staged candidates that a just-completed claim satisfies,
 * inside the caller's claim transaction. Any claim path counts as the
 * member's confirmation of the matching staged candidate: the wizard's
 * candidate card, the manual-identifier token round-trip, and the direct
 * historical-record claim all close the staged row the same way.
 */
function resolveStagedCandidatesOnClaimInTx(
  memberId: string,
  targets: { legacyMemberId?: string | null; personId?: string | null },
): void {
  const open = autoLinkStagedCandidates.listOpenByMember.all(memberId) as AutoLinkStagedCandidateRow[];
  const now = new Date().toISOString();
  for (const row of open) {
    const matches =
      (targets.legacyMemberId != null && row.legacy_member_id === targets.legacyMemberId) ||
      (targets.personId != null && row.historical_person_id === targets.personId);
    if (!matches) continue;
    const res = autoLinkStagedCandidates.resolveById.run('confirmed', now, now, memberId, row.id);
    if (res.changes === 0) continue;
    appendAuditEntry({
      actionType:    row.source_pass === 'cross_source'
        ? 'legacy.cross_source_candidate_confirmed'
        : 'legacy.auto_link_candidate_confirmed',
      category:      'identity',
      actorType:     'member',
      actorMemberId: memberId,
      entityType:    'member',
      entityId:      memberId,
      reasonText:    null,
      metadata: {
        candidate_id:         row.id,
        legacy_member_id:     row.legacy_member_id,
        historical_person_id: row.historical_person_id,
        confidence:           row.confidence,
        proposed_evidence_strength: row.proposed_evidence_strength,
      },
    });
  }
}

/** Sweeps open staged candidates past their expiry window to 'expired'. */
function expireStagedCandidates(nowIso?: string): { expired: number } {
  const now = nowIso ?? new Date().toISOString();
  const rows = autoLinkStagedCandidates.listExpiredOpen.all(now) as AutoLinkStagedCandidateRow[];
  let expired = 0;
  for (const row of rows) {
    transaction(() => {
      const res = autoLinkStagedCandidates.resolveById.run('expired', now, now, 'system', row.id);
      if (res.changes === 0) return;
      expired += 1;
      appendAuditEntry({
        actionType:    'legacy.auto_link_candidate_expired',
        category:      'identity',
        actorType:     'system',
        actorMemberId: null,
        entityType:    'member',
        entityId:      row.member_id,
        reasonText:    null,
        metadata: {
          candidate_id:         row.id,
          legacy_member_id:     row.legacy_member_id,
          historical_person_id: row.historical_person_id,
          confidence:           row.confidence,
          expires_at:           row.expires_at,
        },
      });
    });
  }
  return { expired };
}

// ── Two-step emailed-token legacy claim flow ─────────────────────────────────
//
// The production claim flow is mailbox-verified rather than direct-lookup:
// the member submits an identifier, the server
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

// Direct historical-person claim rate-limit knobs (admin-configurable via
// system_config_current). The per-member cap gives a legitimate claimant
// explicit feedback; the per-IP cap throttles an authenticated attacker
// scripting claim attempts across many person ids from one source.
function hpClaimMaxPerMember(): number {
  return readIntConfig('hp_claim_rate_limit_max_per_member', 5);
}
function hpClaimMaxPerIp(): number {
  return readIntConfig('hp_claim_rate_limit_max_per_ip', 10);
}
function hpClaimWindowMinutes(): number {
  return readIntConfig('hp_claim_rate_limit_window_minutes', 60);
}

/**
 * Throttle the direct historical-person claim (the confirm step). Every
 * sibling claim and auth surface is rate-limited; this is the one direct-claim
 * entry point that was not, letting an authenticated attacker script rapid
 * claim attempts across many person ids. Per-member and per-IP buckets, each
 * throwing RateLimitedError so the controller maps to HTTP 429.
 */
function enforceHistoricalPersonClaimLimit(requestingMemberId: string, ip: string): void {
  const windowMinutes = hpClaimWindowMinutes();
  const ipRl = rateLimitHit(`hpclaim-ip:${ip}`, hpClaimMaxPerIp(), windowMinutes);
  if (!ipRl.allowed) {
    throw new RateLimitedError('Too many claim attempts. Please try again later.', ipRl.retryAfterSeconds);
  }
  const memberRl = rateLimitHit(`hpclaim:${requestingMemberId}`, hpClaimMaxPerMember(), windowMinutes);
  if (!memberRl.allowed) {
    throw new RateLimitedError('Too many claim attempts. Please try again later.', memberRl.retryAfterSeconds);
  }
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
  // login_email at registration verify; if that email equals any of the
  // legacy row's addresses (primary or either secondary), no second
  // token-email is required. Run the merge inline. Reachable only after a
  // positive lookup, so a non-matching attacker still gets the silent
  // `no_match` outcome above and cannot distinguish branches. Skipped
  // silently when the row carries no addresses (stub rows in dev where the
  // legacy data dump has not been loaded).
  const member = legacyClaim.findClaimingMember.get(requestingMemberId) as ClaimingMemberRow | undefined;
  const controlsLegacyEmail =
    Boolean(member?.email_verified_at) &&
    member?.login_email_normalized != null &&
    [row.legacy_email, row.legacy_email2, row.legacy_email3].some(
      (legacyEmail) => legacyEmail != null && member.login_email_normalized === normalizeEmail(legacyEmail),
    );
  if (controlsLegacyEmail) {
    transaction(() => {
      // Email-equality fast path: mailbox control of the modern address is
      // proven by registration verification and it matches the legacy email.
      claimLegacyAccountInTx(
        requestingMemberId,
        row!.legacy_member_id,
        'currently_controls_modern_email_matching_legacy',
      );
    });
    return { kind: 'auto_linked' };
  }

  // Email path requires a deliverable address. A stub legacy_members row with
  // no legacy_email collapses to the same neutral no_match outcome a missing
  // row would on this declared-email path; it remains claimable through the
  // wizard historical-person card-confirm path.
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
    emailService.send({
      template: 'legacy_claim_confirm',
      params: { confirmUrl, ttlHours: claimTokenTtlHours() },
      recipientEmail:    row.legacy_email,
      recipientMemberId: requestingMemberId,
      idempotencyKey:    `claim:${tokenRowId}`,
      strict: true,
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
  clubAffiliations: string[];
  eventsAttended: Array<{ title: string; year: number }>;
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

  const backHp = legacyClaim.findHistoricalPersonByLegacyId.get(row.legacy_member_id) as HistoricalPersonClaimRow | undefined;
  let clubAffiliations: string[] = [];
  let eventsAttended: Array<{ title: string; year: number }> = [];
  if (backHp) {
    const clubRows = legacyClaim.listClubAffiliationsForPerson.all(backHp.person_id) as { display_name: string }[];
    const eventRows = legacyClaim.listEventsAttendedByPerson.all(backHp.person_id) as { title: string; year: number }[];
    clubAffiliations = clubRows.map((r) => r.display_name);
    eventsAttended = eventRows.map((r) => ({ title: r.title, year: r.year }));
  }

  return {
    legacyMemberId: row.legacy_member_id,
    displayName:    row.display_name ?? row.real_name ?? null,
    country:        row.country,
    isHof:          Boolean(row.is_hof),
    isBap:          Boolean(row.is_bap),
    clubAffiliations,
    eventsAttended,
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
  // The claim link was delivered to and clicked from the legacy account's
  // mailbox: hard evidence of mailbox control.
  claimLegacyAccountInTx(
    requestingMemberId,
    consumed.targetLegacyMemberId,
    'mailbox_control_via_link_click',
  );
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
  bioExcerpt: string | null;
  clubAffiliations: string[];
  eventsAttended: Array<{ title: string; year: number }>;
}

function normalizedSurnamesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return surnameKey(a) === surnameKey(b);
}

/**
 * Country signal for a cross-source candidate offer. Country is NOT a gate:
 * people move, so a member's current country legitimately differs from the
 * country on their old account or competition record, and a mismatch must
 * never block a real person's "might be you" offer. It is a soft signal --
 * an agreement corroborates the match, a mismatch weighs against it (recorded
 * on the offer for admin review), and a missing country on either side is
 * neutral. Country names are canonical English, so a plain case / whitespace
 * fold compares them (accents are not folded the way names are).
 */
type CountrySignal = 'agree' | 'mismatch' | 'unknown';
function countryAgreementSignal(a: string | null, b: string | null): CountrySignal {
  if (!a || !b) return 'unknown';
  const fold = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return fold(a) === fold(b) ? 'agree' : 'mismatch';
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
  birth_date: string | null;
}

export type HistoricalPersonClaimLookupResult =
  | { status: 'ok'; data: HistoricalPersonClaimLookup }
  | { status: 'conflict' };

function lookupHistoricalPersonForClaim(
  requestingMemberId: string,
  personId: string,
): HistoricalPersonClaimLookupResult | null {
  const member = legacyClaim.findClaimingMember.get(requestingMemberId) as ClaimingMemberRow | undefined;
  if (!member) return null;
  if (member.historical_person_id) {
    throw new ValidationError('Your account is already linked to a historical player record.');
  }

  const hp = legacyClaim.findHistoricalPersonById.get(personId) as HistoricalPersonClaimRow | undefined;
  if (!hp) return null;

  // A record marked deceased is not self-claimable: a living member cannot
  // claim a deceased person's identity as their own account. Collapse to the
  // uniform unavailable response (same shape as not-found) so claim-status is
  // not enumerable.
  if (hp.is_deceased) return null;

  const existing = legacyClaim.findMemberClaimingHp.get(personId) as { id: string; slug: string } | undefined;
  if (existing) {
    return { status: 'conflict' };
  }

  // A deceased member who held this record keeps the link through the contact
  // scrub, so the record stays theirs; it is not open for another member to
  // take over (the scrub's purge marker otherwise hides them from the check
  // above). Treat it as taken, same as a live claimant.
  const deceasedHolder = legacyClaim.findDeceasedMemberHoldingHp.get(personId) as { id: string } | undefined;
  if (deceasedHolder) {
    return { status: 'conflict' };
  }

  // Surname reconciliation is required to proceed: the current real-name
  // surname or any declared former surname must match. Mismatch blocks the
  // claim entirely; callers should not render the confirm page.
  if (!surnameMatchesWithAnchors(requestingMemberId, member.real_name, hp.person_name)) {
    // Record the same forensic block row the merge path writes, so a surname
    // mismatch caught here leaves an impersonation-attempt trail too. This
    // lookup runs outside any transaction, so the row is written inline rather
    // than after a rollback.
    const message =
      'Your name does not match this historical record. If you believe this is your identity, contact an administrator.';
    recordHistoricalPersonClaimBlocked(
      requestingMemberId,
      new SurnameMismatchError(message, hp.person_id, hp.person_name),
    );
    throw new ValidationError(message);
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

  const clubRows = legacyClaim.listClubAffiliationsForPerson.all(personId) as { display_name: string }[];
  const eventRows = legacyClaim.listEventsAttendedByPerson.all(personId) as { title: string; year: number }[];

  return {
    status: 'ok' as const,
    data: {
      personId: hp.person_id,
      personName: hp.person_name,
      country: hp.country,
      isHof: Boolean(hp.hof_member),
      isBap: Boolean(hp.bap_member),
      firstNameWarning: !firstNamesMatch(member.real_name, hp.person_name),
      bioExcerpt: bioExcerptFor(hp.legacy_member_id ?? null),
      clubAffiliations: clubRows.map((r) => r.display_name),
      eventsAttended: eventRows.map((r) => ({ title: r.title, year: r.year })),
    },
  };
}

/**
 * Direct-HP claim merge. Caller owns the transaction. Used by the wizard
 * so the merge AND the wizard task transition are atomic with each other.
 * For non-wizard callers, use the `claimHistoricalPerson` wrapper.
 *
 * Race posture: same as the legacy claim. The partial UNIQUE index on
 * members.historical_person_id is the load-bearing defense against two
 * members claiming the same historical person; the loser's
 * SQLITE_CONSTRAINT_UNIQUE maps to ConflictError.
 */
function claimHistoricalPersonInTx(
  requestingMemberId: string,
  personId: string,
  evidenceStrength: EvidenceStrength = 'declared_anchor_only',
): void {
  try {
    claimHistoricalPersonInTxInner(requestingMemberId, personId, evidenceStrength);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ConflictError('This historical record has already been claimed by another member.');
    }
    throw err;
  }
}

function claimHistoricalPersonInTxInner(
  requestingMemberId: string,
  personId: string,
  evidenceStrength: EvidenceStrength,
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

  // A record marked deceased is not self-claimable: a living member cannot
  // claim a deceased person's identity. Gate the execution path too, so a
  // direct POST cannot bypass the suppressed CTA and confirm-page preview.
  if (hp.is_deceased) {
    throw new ValidationError('The historical record is no longer available for claim.');
  }

  const existing = legacyClaim.findMemberClaimingHp.get(personId) as { id: string; slug: string } | undefined;
  if (existing) {
    throw new ValidationError('This historical record has already been claimed by another member.');
  }

  // A deceased member who held this record keeps the link through the contact
  // scrub, so the record stays theirs and is not claimable by another member.
  // The scrub's purge marker hides them from findMemberClaimingHp, so check for
  // a deceased holder explicitly and gate the execution path the same way.
  const deceasedHolder = legacyClaim.findDeceasedMemberHoldingHp.get(personId) as { id: string } | undefined;
  if (deceasedHolder) {
    throw new ValidationError('This historical record has already been claimed by another member.');
  }

  // The surname gate constrains self-serve claiming. Admin-vetted evidence
  // means an administrator verified the member's identity against the record,
  // which subsumes the automated name check (the admin legacy-account link
  // path carries no name gate either); the deceased and already-claimed
  // integrity gates above still apply to every caller.
  if (
    evidenceStrength !== 'admin_vetted_evidence' &&
    !surnameMatchesWithAnchors(requestingMemberId, member.real_name, hp.person_name)
  ) {
    // Typed throw: this fn runs inside the caller's transaction, so an audit
    // row written here would roll back with the claim. Callers record the
    // claim.historical_person_blocked event AFTER the rollback via
    // recordHistoricalPersonClaimBlocked (impersonation forensics rely on
    // blocked attempts surviving).
    throw new SurnameMismatchError(
      'Your name does not match this historical record. If you believe this is your identity, contact an administrator.',
      hp.person_id,
      hp.person_name,
    );
  }

  const now = new Date().toISOString();

  // Paid-history standings come from the transitive legacy row when one exists;
  // a direct HP claim with no legacy account grants on the HP honors alone.
  let everPaidTier2 = false;
  let everPaidTier1Lifetime = false;
  let tier1AnnualActive = false;

  // Record-only birth-date evidence, mirroring the legacy-account claim path:
  // when this historical record resolves through to a legacy account carrying a
  // birth date, compare it against the member's own date and record the outcome
  // in the claim audit metadata below. A direct claim with no legacy account
  // behind it has no legacy date to compare. This path never enqueues a mismatch
  // review; that flag is a legacy-account-claim behavior.
  let dobComparison = 'no_legacy_account';

  // Transitive legacy claim when the HP is back-linked to a legacy account.
  if (hp.legacy_member_id) {
    if (member.legacy_member_id && member.legacy_member_id !== hp.legacy_member_id) {
      throw new ValidationError(
        'This historical record is tied to a different legacy account than the one already linked to your profile.',
      );
    }
    const lm = legacyMembers.findByLegacyMemberId.get(hp.legacy_member_id) as LegacyMemberRow | undefined;
    if (lm) {
      everPaidTier2 = Boolean(lm.legacy_ever_paid_tier2);
      everPaidTier1Lifetime = Boolean(lm.legacy_ever_paid_tier1_lifetime);
      tier1AnnualActive = Boolean(lm.legacy_tier1_annual_active_at_cutover);
      dobComparison = member.birth_date && lm.birth_date
        ? compareBirthDates(member.birth_date, lm.birth_date)
        : member.birth_date
          ? 'legacy_dob_absent'
          : lm.birth_date
            ? 'member_dob_absent'
            : 'both_dob_absent';
    }
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

  // Single tier grant per legacy claim; grants never stack. Direct HP claim
  // takes the same `legacy.claim_tier_grant` reason and the same mapping: honors
  // (HoF or BAP, from the HP) or a transitive legacy paid standing set above; a
  // direct claim with no legacy account grants on honors alone. Same transaction
  // as the merge writes above.
  applyLegacyClaimGrantInTx(
    requestingMemberId,
    requestingMemberId,
    {
      hasHof:                Boolean(hp.hof_member),
      hasBap:                Boolean(hp.bap_member),
      everPaidTier2,
      everPaidTier1Lifetime,
      tier1AnnualActive,
    },
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
      evidence_strength:      evidenceStrength,
      dob_comparison:         dobComparison,
    },
  });

  // A claim through any path counts as confirmation of a matching staged
  // candidate; resolve it in the same transaction.
  resolveStagedCandidatesOnClaimInTx(requestingMemberId, {
    legacyMemberId: hp.legacy_member_id ?? null,
    personId:       hp.person_id,
  });
}

function claimHistoricalPerson(
  requestingMemberId: string,
  personId: string,
  evidenceStrength: EvidenceStrength = 'declared_anchor_only',
): void {
  try {
    transaction(() => claimHistoricalPersonInTx(requestingMemberId, personId, evidenceStrength));
  } catch (err) {
    if (err instanceof SurnameMismatchError) {
      recordHistoricalPersonClaimBlocked(requestingMemberId, err);
    }
    throw err;
  }
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

  const newHash = await hashPassword(newPassword);
  const now = new Date().toISOString();
  // Password bump (invalidates all other sessions) and its audit row commit
  // together, so a failed audit insert cannot leave the version bumped with no
  // audit trail. The confirmation email below is external I/O and stays
  // post-commit by design.
  transaction(() => {
    auth.updateMemberPassword.run(newHash, now, now, memberId);
    appendAuditEntry({
      actionType: 'auth.password_change',
      category: 'auth',
      actorType: 'member',
      actorMemberId: memberId,
      entityType: 'member',
      entityId: memberId,
    });
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
      emailService.send({
        template: 'password_changed',
        params: {},
        recipientEmail: member.login_email,
        recipientMemberId: memberId,
        // No token row for password-change notifications; use the new
        // password_version as the per-event key so re-emit on worker
        // restart between SES-send and outbox-mark-sent collapses to the
        // same outbox row.
        idempotencyKey: `pwchange:${memberId}:${row.password_version + 1}`,
        strict: true,
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
    // Reach the same token-generation work the exists branch performs, so the
    // response time does not leak whether an account matches.
    burnTokenIssuanceTiming();
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
    emailService.send({
      template: 'password_reset_request',
      params: { resetUrl, ttlHours },
      recipientEmail: email.trim(),
      recipientMemberId: row.id,
      idempotencyKey: `pwreset:${tokenRowId}`,
      strict: true,
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

  // Hash before consuming the token: argon2 (~200ms) is async and must run
  // outside the transaction (no await inside a better-sqlite3 transaction), and
  // hashing first means an interrupted hash never burns the single-use token.
  const newHash = await hashPassword(newPassword);
  const now = new Date().toISOString();

  // Consume the token and write the new password in one transaction. A crash
  // between consume and update would otherwise burn the single-use token
  // without changing the password, locking the member out of the reset.
  const { consumed, member, newPasswordVersion } = transaction(() => {
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

    return { consumed, member, newPasswordVersion };
  });

  // Confirmation email. Use the strict enqueue + operational-error pattern
  // (mirroring changePassword) so a degraded outbox during a reset leaves an
  // operator signal instead of a silent drop: the "your password was changed"
  // notice is the only out-of-band cue a member gets if the forgot-password
  // flow is abused during an outbox-degradation window. Unlike changePassword,
  // the failure is NOT re-thrown — the reset token is single-use and already
  // consumed, so the caller must still complete the success path (session
  // re-issue + redirect); the audit row carries the operator signal.
  if (member.login_email) {
    try {
      emailService.send({
        template: 'password_reset_confirm',
        params: {},
        recipientEmail: member.login_email,
        recipientMemberId: consumed.memberId,
        // Pin to the consumed token row id so re-issue on worker restart
        // between SES-send and outbox-mark-sent collapses to the same row.
        idempotencyKey: `pwresetconfirm:${consumed.tokenRowId}`,
        strict: true,
      });
    } catch (err) {
      recordOperationalError({
        actionType: 'auth.password_reset_notification_failed',
        category: 'auth',
        entityType: 'member',
        entityId: consumed.memberId,
        reasonText:
          'Password reset committed but confirmation-email enqueue failed.',
        cause: err,
      });
    }
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
  if (hpByLegacy) return hpByLegacy;
  const escapedIdentifier = identifier.replace(/[%_\\]/g, c => '\\' + c);
  const hpByAlias = legacyClaim.findHistoricalPersonByAlias.get(escapedIdentifier) as
    | HistoricalPersonClaimRow
    | undefined;
  return hpByAlias ?? null;
}

/**
 * Wizard PRG composer for the legacy_claim GET render. Reads the flash
 * state the controller recovered, composes the view-model on top of
 * `getLinkHistoryView`, and post-processes:
 *   - Prepends an HP card when `hpPersonId` resolves (dedupe against
 *     candidates already present).
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
    autoLinkDrift: boolean;
  },
): Promise<LinkHistoryContent | null> {
  const view = getLinkHistoryView(memberId, {
    fromRegister: true,
    reasonIsLowConfidence: false,
    sentOutcome: opts.submitted && opts.hpPersonId === null ? 'enqueued' : null,
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
          firstYear: hp.first_year ?? null,
          alreadyLinkedSinceDisplay: null,
          aliasesLabel: shapeAliasesLabel(hp.aliases),
          bioExcerpt: bioExcerptFor(hp.legacy_member_id ?? null),
          ...candidateClubsAndEvents(hp.person_id),
        });
      }
    }
  }

  const anchors = listDeclaredAnchors(memberId);
  const seenPersonIds = new Set(view.candidates.map((c) => c.personId).filter(Boolean));
  const seenLegacyMemberIds = new Set(
    view.candidates.map((c) => c.legacyMemberId).filter(Boolean),
  );
  for (const anchor of anchors) {
    if (anchor.anchorType === 'former_surname') {
      for (const c of findAutoLinkCandidates(anchor.anchorValue)) {
        if (seenPersonIds.has(c.personId)) continue;
        seenPersonIds.add(c.personId);
        const hp = legacyClaim.findHistoricalPersonById.get(c.personId) as HistoricalPersonClaimRow | undefined;
        view.candidates.push({
          claimMode: 'hp_review_page',
          displayName: c.personName,
          provenanceLabel: `Matched via declared former surname.`,
          legacyMemberId: null,
          personId: c.personId,
          country: hp?.country ?? null,
          isHof: hp?.hof_member !== 0 && hp?.hof_member != null,
          isBap: hp?.bap_member !== 0 && hp?.bap_member != null,
          firstYear: hp?.first_year ?? null,
          alreadyLinkedSinceDisplay: null,
          aliasesLabel: shapeAliasesLabel(hp?.aliases ?? null),
          bioExcerpt: bioExcerptFor(hp?.legacy_member_id ?? null),
          ...candidateClubsAndEvents(c.personId),
        });
      }
    } else if (anchor.anchorType === 'old_email') {
      try {
        const lookup = lookupLegacyAccount(memberId, anchor.anchorValue);
        if (lookup.kind === 'single') {
          const lmRow = legacyMembers.findByLegacyMemberId.get(lookup.result.legacyMemberId) as LegacyMemberRow | undefined;
          if (lmRow) {
            const backHp = legacyClaim.findHistoricalPersonByLegacyId.get(lmRow.legacy_member_id) as HistoricalPersonClaimRow | undefined;
            const personId = backHp?.person_id ?? null;
            if (personId ? !seenPersonIds.has(personId) : !seenLegacyMemberIds.has(lmRow.legacy_member_id)) {
              if (personId) seenPersonIds.add(personId);
              else seenLegacyMemberIds.add(lmRow.legacy_member_id);
              view.candidates.push({
                claimMode: 'legacy_claim',
                displayName: lookup.result.displayName ?? lmRow.real_name ?? 'Unknown',
                provenanceLabel: 'Matched via declared old email.',
                legacyMemberId: lmRow.legacy_member_id,
                personId,
                country: lookup.result.country,
                isHof: lookup.result.isHof,
                isBap: lookup.result.isBap,
                firstYear: backHp?.first_year ?? null,
                alreadyLinkedSinceDisplay: null,
                aliasesLabel: shapeAliasesLabel(backHp?.aliases ?? null),
                bioExcerpt: bioExcerptFor(lmRow.legacy_member_id),
                ...candidateClubsAndEvents(personId),
              });
            }
          }
        } else if (lookup.kind === 'ambiguous_email') {
          // Declared old email matched multiple legacy rows (duplicate emails in the
          // legacy dump). The claim flow must not reveal whether an identifier matched
          // zero, one, or many rows, so surface no candidate and show the member
          // nothing; log server-side (no email, no count) for operability.
          logger.warn('legacy_claim.declared_old_email.ambiguous', {
            memberId,
            anchorId: anchor.id,
          });
        }
      } catch {
        // Non-revealing on lookup errors.
      }
    }
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
//   5. Append an audit_entries row with action_type 'legacy.auto_link_revert'
//      carrying metadata_json.original_claim_audit_id. This append-only row is
//      the revert's durable trail; the revert deliberately enqueues no admin
//      work-queue task, since the admin is already acting when they revert.
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

// Inner body: the CALLER owns the transaction. Composes plain statements only
// (no nested transaction()), so it can run inside revertAutoLink's wrapper or
// a future combined transaction (e.g. an admin dispute-revert flow).
function revertAutoLinkInTx(
  memberId: string,
  originalClaimAuditId: string,
  actor: RevertAutoLinkActor,
): RevertAutoLinkResult {
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
    if (member.legacy_member_id === null && member.historical_person_id === null) {
      return { status: 'already_reverted' as const };
    }

    const legacyMemberId = member.legacy_member_id;
    // The HP back-link clears when it came from the same claim being
    // reverted: transitively via the legacy account's provenance, or as the
    // claim itself for a direct historical-record claim with no legacy link.
    let clearedHp = false;
    if (member.historical_person_id !== null) {
      if (legacyMemberId === null) {
        clearedHp = true;
      } else {
        const hp = legacyClaim.findHistoricalPersonById.get(member.historical_person_id) as
          | { person_id: string; legacy_member_id: string | null }
          | undefined;
        if (hp && hp.legacy_member_id === legacyMemberId) {
          clearedHp = true;
        }
      }
    }

    const now = new Date().toISOString();

    if (legacyMemberId !== null) {
      legacyMembers.clearMemberLegacyLink.run(now, actor.actorMemberId, memberId);
      legacyMembers.clearClaim.run(legacyMemberId);
      // Un-linking alone would strand the linked record's PII (birth date,
      // address, bio, join date) on the member row. The legacy_members row
      // still holds the values the claim merge copied, so pass them in and
      // clear only the fields that still match -- data the member entered
      // themselves is preserved.
      const legacyRow = legacyMembers.findByLegacyMemberId.get(legacyMemberId) as LegacyMemberRow | undefined;
      if (legacyRow) {
        legacyMembers.scrubClaimedLegacyFields.run(
          legacyRow.legacy_user_id,
          legacyRow.legacy_email,
          legacyRow.bio ?? '',
          legacyRow.birth_date,
          legacyRow.street_address,
          legacyRow.postal_code,
          legacyRow.city,
          legacyRow.region,
          legacyRow.country,
          legacyRow.ifpa_join_date,
          legacyRow.first_competition_year,
          now,
          actor.actorMemberId,
          memberId,
        );
      }
    }
    if (clearedHp) {
      legacyMembers.clearMemberHistoricalPersonId.run(now, actor.actorMemberId, memberId);
    }

    // The honor flags are a denormalized cache of the claimed record(s). The
    // revert always clears the legacy link, so a HoF/BAP flag survives only if
    // the still-linked historical person carries the honor itself. A surviving
    // but unhonored HP -- an unrelated record claimed alongside the reverted
    // legacy account -- no longer backs the flag, so the honors, and the public
    // badge and tier they confer, must drop with the reverted claim rather than
    // strand on a member who no longer holds them.
    let retainsHonoredLink = false;
    if (member.historical_person_id !== null && !clearedHp) {
      const survivingHp = legacyClaim.findHistoricalPersonById.get(member.historical_person_id) as
        | { hof_member: number; bap_member: number }
        | undefined;
      retainsHonoredLink = Boolean(survivingHp?.hof_member) || Boolean(survivingHp?.bap_member);
    }
    if (!retainsHonoredLink) {
      legacyMembers.clearDerivedHonors.run(now, actor.actorMemberId, memberId);
    }

    applyAutoLinkRevertGrantInTx(actor.actorMemberId, memberId, {
      legacy_member_id:        legacyMemberId,
      cleared_hp:              clearedHp,
      original_claim_audit_id: originalClaimAuditId,
    });

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
        scrubbed_legacy_fields:  legacyMemberId !== null,
        cleared_derived_honors:  !retainsHonoredLink,
      },
    });

    return { status: 'reverted' as const };
}

function revertAutoLink(
  memberId: string,
  originalClaimAuditId: string,
  actor: RevertAutoLinkActor,
): RevertAutoLinkResult {
  return transaction(() => revertAutoLinkInTx(memberId, originalClaimAuditId, actor));
}

export type DisputeRevertResult =
  | { status: 'reverted'; originalClaimAuditId: string | null }
  | { status: 'nothing_to_revert' }
  | { status: 'not_found' };

/**
 * Admin dispute resolution: reverts a previously-confirmed claim (wizard
 * candidate confirm, token round-trip, or direct historical-record claim).
 * Opens the dispute and applies the revert in one transaction so the
 * forensic pair (claim.dispute_opened + claim.revert_applied) always lands
 * together with the state change.
 */
/**
 * Shared per-admin throttle for work-queue resolution actions, including
 * ContactRequestService.resolve (same bucket key). Compromised-admin is the
 * threat model, so the admin role never bypasses it.
 */
export function enforceWorkQueueResolveLimit(adminMemberId: string): void {
  const max = readIntConfig('work_queue_resolve_rate_limit_per_hour', 120);
  const rl = rateLimitHit(`work-queue-resolve:${adminMemberId}`, max, 60);
  if (!rl.allowed) {
    throw new RateLimitedError(
      `Too many work-queue operations. Try again in ${rl.retryAfterSeconds} seconds.`,
      rl.retryAfterSeconds,
    );
  }
}

function revertClaimForDispute(
  adminMemberId: string,
  workQueueItemId: string,
  targetMemberId: string,
  reason: string,
): DisputeRevertResult {
  enforceWorkQueueResolveLimit(adminMemberId);
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new ValidationError('A dispute reason is required.');
  }
  // The revert is bound to an open dispute queue item: the item cannot name
  // the holder itself (the disputed record is identified by member-typed free
  // text), so the binding is that an open dispute must exist and every audit
  // row names it. Without this, a forged holder id could revert any member's
  // claim with no trace of which dispute justified it.
  const item = loadOpenLinkHelpItem(workQueueItemId);
  if (!isDisputeLinkHelpPayload(item.reason_text)) {
    throw new ValidationError('That queue item is not a conflict dispute.');
  }
  const originalClaim = legacyClaim.findLatestClaimAuditForMember.get(targetMemberId) as
    | { id: string }
    | undefined;
  return transaction(() => {
    const actor = { actorType: 'admin' as const, actorMemberId: adminMemberId };
    appendAuditEntry({
      actionType:    'claim.dispute_opened',
      category:      'identity',
      actorType:     'admin',
      actorMemberId: adminMemberId,
      entityType:    'member',
      entityId:      targetMemberId,
      reasonText:    trimmed,
      metadata: {
        original_claim_audit_id: originalClaim?.id ?? null,
        work_queue_item_id:      item.id,
      },
    });
    const reverted = revertAutoLinkInTx(targetMemberId, originalClaim?.id ?? 'unknown', actor);
    if (reverted.status === 'not_found') {
      throw new NotFoundError('Member not found.');
    }
    if (reverted.status === 'already_reverted') {
      return { status: 'nothing_to_revert' as const };
    }
    appendAuditEntry({
      actionType:    'claim.revert_applied',
      category:      'identity',
      actorType:     'admin',
      actorMemberId: adminMemberId,
      entityType:    'member',
      entityId:      targetMemberId,
      reasonText:    trimmed,
      metadata: {
        original_claim_audit_id: originalClaim?.id ?? null,
        work_queue_item_id:      item.id,
      },
    });
    return { status: 'reverted' as const, originalClaimAuditId: originalClaim?.id ?? null };
  });
}

function isDisputeLinkHelpPayload(reasonText: string | null): boolean {
  if (!reasonText) return false;
  try {
    return (JSON.parse(reasonText) as Record<string, unknown>).is_dispute === true;
  } catch {
    return false;
  }
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

// ---------------------------------------------------------------------------
// Cross-source candidate prompt (DD-F). After a successful claim of one
// source (HP or legacy), check the other for unclaimed matches.
// ---------------------------------------------------------------------------

export interface CrossSourceCandidate {
  kind: 'legacy' | 'hp';
  displayName: string;
  personId: string | null;
  legacyMemberId: string | null;
  evidenceTier: EvidenceStrength;
  countrySignal: CountrySignal;
}

function findCrossSourceCandidateAfterHpClaim(memberId: string, personId: string): CrossSourceCandidate | null {
  const member = legacyClaim.findClaimingMember.get(memberId) as
    | { legacy_member_id: string | null; real_name: string; login_email_normalized: string | null; country: string | null }
    | undefined;
  if (!member || member.legacy_member_id) return null;

  const hp = legacyClaim.findHistoricalPersonById.get(personId) as HistoricalPersonClaimRow | undefined;
  if (!hp) return null;

  // Real anchors only: the member's verified login email and declared old
  // emails they have proven control of. A hit must agree on surname (current
  // or declared former) and be unclaimed; country is a soft signal recorded on
  // the offer, not a gate -- a mover's current country differs from their old
  // record and must still be offered. The login email is proof the member
  // controls that mailbox now, so a match through it proposes the modern-email
  // tier. A declared old email can seed an offer only after the member proves
  // control of it via the mailbox round-trip: an unverified old email is not
  // sufficient to confirm a claim, so it is never used as a cross-source
  // anchor; a verified one carries the mailbox-control tier.
  const anchors: Array<{ email: string; tier: EvidenceStrength }> = [];
  if (member.login_email_normalized) {
    anchors.push({ email: member.login_email_normalized, tier: 'currently_controls_modern_email_matching_legacy' });
  }
  for (const declared of getDeclaredAnchorValues(memberId).oldEmailsDetailed) {
    if (!declared.verified) continue;
    anchors.push({ email: declared.value, tier: 'mailbox_control_via_link_click' });
  }
  for (const { email, tier } of anchors) {
    try {
      const lookup = lookupLegacyAccount(memberId, email);
      if (lookup.kind !== 'single') continue;
      const row = legacyMembers.findByLegacyMemberId.get(lookup.result.legacyMemberId) as LegacyMemberRow | undefined;
      if (!row || row.claimed_by_member_id) continue;
      if (!surnameMatchesWithAnchors(memberId, member.real_name, row.real_name ?? row.display_name)) continue;
      return {
        kind: 'legacy',
        displayName: lookup.result.displayName ?? row.display_name ?? row.real_name ?? 'Unknown',
        personId: null,
        legacyMemberId: row.legacy_member_id,
        evidenceTier: tier,
        countrySignal: countryAgreementSignal(member.country, row.country),
      };
    } catch {
      // Non-revealing on lookup errors; try the next anchor.
    }
  }
  return null;
}

function findCrossSourceCandidateAfterLegacyClaim(memberId: string, _legacyMemberId: string): CrossSourceCandidate | null {
  const member = legacyClaim.findClaimingMember.get(memberId) as
    | { historical_person_id: string | null; real_name: string; country: string | null }
    | undefined;
  if (!member || member.historical_person_id) return null;

  // Name candidates from the member's own name plus declared former
  // surnames (the variant machinery covers spelling differences). The
  // candidate must be unclaimed and agree on surname via the same gate the
  // direct claim enforces; multiple survivors offer nothing. Country is a
  // soft signal recorded on the offer, not a gate. The match rests on a name
  // anchor, not proven mailbox control, so the offer proposes the floor tier.
  const firstName = member.real_name.trim().split(/\s+/)[0] ?? '';
  const queries = [member.real_name];
  if (firstName) {
    for (const formerSurname of getDeclaredAnchorValues(memberId).formerSurnames) {
      queries.push(`${firstName} ${formerSurname}`);
    }
  }
  const seen = new Set<string>();
  const survivors: Array<{ personId: string; personName: string; country: string | null }> = [];
  for (const c of queries.flatMap((q) => findAutoLinkCandidates(q))) {
    if (seen.has(c.personId)) continue;
    seen.add(c.personId);
    const taken = legacyClaim.findMemberClaimingHp.get(c.personId) as { id: string } | undefined;
    if (taken) continue;
    if (!surnameMatchesWithAnchors(memberId, member.real_name, c.personName)) continue;
    const hpRow = legacyClaim.findHistoricalPersonById.get(c.personId) as HistoricalPersonClaimRow | undefined;
    survivors.push({ personId: c.personId, personName: c.personName, country: hpRow?.country ?? null });
  }
  if (survivors.length !== 1) return null;
  return {
    kind: 'hp',
    displayName: survivors[0].personName,
    personId: survivors[0].personId,
    legacyMemberId: null,
    evidenceTier: 'declared_anchor_only',
    countrySignal: countryAgreementSignal(member.country, survivors[0].country),
  };
}

/**
 * Post-confirm hook: after a claim completes on one source, look for the
 * other source via real anchors and stage a cross-source offer. Idempotent
 * (the open-pair unique index) and decline-respecting (a declined pair is
 * never re-offered); failures are swallowed because the offer is a bonus,
 * never a claim-path dependency.
 */
function offerCrossSourceCandidate(memberId: string): { offered: boolean; candidateId?: string } {
  const member = legacyClaim.findClaimingMember.get(memberId) as
    | { legacy_member_id: string | null; historical_person_id: string | null }
    | undefined;
  if (!member) return { offered: false };

  let candidate: CrossSourceCandidate | null = null;
  if (member.historical_person_id && !member.legacy_member_id) {
    candidate = findCrossSourceCandidateAfterHpClaim(memberId, member.historical_person_id);
  } else if (member.legacy_member_id && !member.historical_person_id) {
    candidate = findCrossSourceCandidateAfterLegacyClaim(memberId, member.legacy_member_id);
  }
  if (!candidate) return { offered: false };

  // A previously-declined pair stays declined.
  const resolved = autoLinkStagedCandidates.listResolvedByMember.all(memberId) as AutoLinkStagedCandidateRow[];
  const previouslyDeclined = resolved.some(
    (r) =>
      r.status === 'declined' &&
      ((candidate!.legacyMemberId != null && r.legacy_member_id === candidate!.legacyMemberId) ||
        (candidate!.personId != null && r.historical_person_id === candidate!.personId)),
  );
  if (previouslyDeclined) return { offered: false };

  const now = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + stagedCandidateExpiryDays() * 24 * 60 * 60 * 1000,
  ).toISOString();
  const candidateId = newStagedCandidateId();
  try {
    transaction(() => {
      autoLinkStagedCandidates.insertCandidate.run(
        candidateId,
        now, 'system', now, 'system',
        memberId,
        candidate!.legacyMemberId,
        candidate!.personId,
        'medium',
        JSON.stringify(
          candidate!.countrySignal === 'agree'
            ? ['cross_source_anchor_agreement', 'country_agreement']
            : ['cross_source_anchor_agreement'],
        ),
        candidate!.evidenceTier,
        'cross_source',
        expiresAt,
      );
      appendAuditEntry({
        actionType:    'legacy.cross_source_candidate_offered',
        category:      'identity',
        actorType:     'system',
        actorMemberId: null,
        entityType:    'member',
        entityId:      memberId,
        reasonText:    null,
        metadata: {
          candidate_id:         candidateId,
          legacy_member_id:     candidate!.legacyMemberId,
          historical_person_id: candidate!.personId,
          country_signal:       candidate!.countrySignal,
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return { offered: false };
    }
    throw err;
  }
  return { offered: true, candidateId };
}

/**
 * Member confirms a cross-source LEGACY offer card: validates the open
 * staged row, applies the legacy claim with the offer's proposed evidence
 * tier, and lets the in-transaction resolution mark the row confirmed with
 * the cross-source event.
 */
function confirmCrossSourceLegacyCandidate(
  memberId: string,
  candidateId: string,
): { status: 'confirmed' } | { status: 'not_found' } {
  const row = autoLinkStagedCandidates.findOpenById.get(candidateId) as
    | AutoLinkStagedCandidateRow
    | undefined;
  if (!row || row.member_id !== memberId || row.source_pass !== 'cross_source' || !row.legacy_member_id) {
    return { status: 'not_found' };
  }
  // Carry the tier the offer was staged with (login-email control, or verified
  // old-email mailbox control); a cross-source offer is never staged from an
  // unverified old email, so it always rests on proven mailbox control.
  claimLegacyAccount(memberId, row.legacy_member_id, row.proposed_evidence_strength as EvidenceStrength);
  return { status: 'confirmed' };
}

// ---------------------------------------------------------------------------
// Declared anchors — former surnames and old emails the member provides to
// broaden the matching surface for identity linking.
// ---------------------------------------------------------------------------

export interface DeclaredAnchorView {
  id: string;
  anchorType: 'former_surname' | 'old_email';
  anchorTypeLabel: string;
  anchorValue: string;
  /** Mailbox control proven by the link-click round-trip. */
  verified: boolean;
  /** Old emails offer the verification round-trip until verified. */
  canRequestVerification: boolean;
}

// Declared-anchor changes are enumeration-adjacent (each declared old email
// re-runs candidate matching), so writes are rate-limited per member.
function anchorChangeRateLimit(memberId: string): void {
  const max = readIntConfig('declared_anchor_rate_limit_max_per_member', 10);
  const windowMinutes = readIntConfig('declared_anchor_rate_limit_window_minutes', 60);
  const rl = rateLimitHit(`anchor-change:${memberId}`, max, windowMinutes);
  if (!rl.allowed) {
    throw new RateLimitedError(
      'Too many identity-anchor changes. Please try again later.',
      rl.retryAfterSeconds,
    );
  }
}

function declareAnchor(
  memberId: string,
  anchorType: string,
  anchorValue: string,
): void {
  anchorChangeRateLimit(memberId);
  if (anchorType !== 'former_surname' && anchorType !== 'old_email') {
    throw new ValidationError('Anchor type must be former_surname or old_email.');
  }
  const trimmed = anchorType === 'old_email'
    ? anchorValue.trim().toLowerCase()
    : anchorValue.trim();
  if (!trimmed) {
    throw new ValidationError('Enter a value to add.');
  }
  const id = `mda_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  try {
    declaredAnchors.insert.run(id, memberId, memberId, memberId, anchorType, trimmed);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new ValidationError('This anchor has already been declared.');
    }
    throw err;
  }
}

/**
 * Declare the member's date of birth from the wizard claim task. The value
 * is stored as the member's birth date (the personal-details task shows it
 * pre-filled and owns later edits), so this only ever fills an absent value.
 * The post-redirect GET re-runs candidate matching with the date present,
 * which is what disambiguates tied same-name candidates.
 */
function declareBirthDateAnchor(memberId: string, rawValue: string): void {
  anchorChangeRateLimit(memberId);
  const value = validateBirthDate(rawValue.trim());
  const now = new Date().toISOString();
  const updated = account.setBirthDateIfAbsent.run(value, now, memberId, memberId);
  if (updated.changes === 0) {
    throw new ValidationError('A date of birth is already on file. You can edit it in the personal details step.');
  }
}

/**
 * The member's birth date on file, or null. Drives the wizard claim task's
 * required birth-date field (form when absent, read-only display when
 * present) and the task-resolution gate.
 */
function getMemberBirthDate(memberId: string): string | null {
  const member = legacyClaim.findClaimingMember.get(memberId) as
    | { birth_date: string | null }
    | undefined;
  return member?.birth_date ?? null;
}

function listDeclaredAnchors(memberId: string): DeclaredAnchorView[] {
  const rows = declaredAnchors.listByMember.all(memberId) as {
    id: string; anchor_type: string; anchor_value: string;
    verified_via_link_click_at?: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    anchorType: r.anchor_type as 'former_surname' | 'old_email',
    anchorTypeLabel: r.anchor_type === 'old_email' ? 'Old email' : 'Former name',
    anchorValue: r.anchor_value,
    verified: r.verified_via_link_click_at != null,
    canRequestVerification: r.anchor_type === 'old_email' && r.verified_via_link_click_at == null,
  }));
}

function removeAnchor(memberId: string, anchorId: string): void {
  anchorChangeRateLimit(memberId);
  declaredAnchors.deleteById.run(anchorId, memberId);
}

// ---------------------------------------------------------------------------
// Mailbox-control round-trip for declared old emails: a single-use link is
// delivered to the DECLARED address; clicking it while signed in to the same
// account proves current mailbox control and upgrades claims matched through
// this anchor to the hard-evidence tier.
// ---------------------------------------------------------------------------

export type RequestAnchorVerificationResult =
  | { status: 'enqueued' }
  | { status: 'already_verified' }
  | { status: 'not_found' };

function requestAnchorMailboxVerification(
  memberId: string,
  anchorId: string,
  ip: string,
): RequestAnchorVerificationResult {
  // Per-IP, per-member, and per-target caps mirror the claim-init knobs:
  // every leg of the round-trip is mail-sending and enumeration-adjacent.
  const windowMinutes = readIntConfig('mailbox_link_rate_limit_window_minutes', 60);
  const ipRl = rateLimitHit(`mailbox-link-ip:${ip}`, readIntConfig('mailbox_link_rate_limit_max_per_ip', 10), windowMinutes);
  if (!ipRl.allowed) return { status: 'not_found' };
  const memberRl = rateLimitHit(`mailbox-link:${memberId}`, readIntConfig('mailbox_link_rate_limit_max_per_member', 5), windowMinutes);
  if (!memberRl.allowed) {
    throw new RateLimitedError('Too many verification requests. Please try again later.', memberRl.retryAfterSeconds);
  }
  const targetRl = rateLimitHit(`mailbox-link-target:${anchorId}`, readIntConfig('mailbox_link_rate_limit_max_per_target', 3), windowMinutes);
  if (!targetRl.allowed) return { status: 'not_found' };

  const anchor = declaredAnchors.findByIdForMember.get(anchorId, memberId) as
    | { id: string; anchor_type: string; anchor_value: string; verified_via_link_click_at: string | null }
    | undefined;
  if (!anchor || anchor.anchor_type !== 'old_email') return { status: 'not_found' };
  if (anchor.verified_via_link_click_at !== null) return { status: 'already_verified' };

  const ttlHours = readIntConfig('account_claim_expiry_hours', 24);
  const { rawToken, tokenRowId } = accountTokenService.issueToken({
    memberId,
    tokenType: 'mailbox_link',
    ttlHours,
    targetAnchorId: anchorId,
  });
  const baseUrl = config.publicBaseUrl.replace(/\/+$/, '');
  try {
    emailService.send({
      template: 'mailbox_link_confirm',
      params: {
        verifyUrl: `${baseUrl}/register/wizard/legacy_claim/anchors/verify/${rawToken}`,
        ttlHours,
      },
      recipientEmail:    anchor.anchor_value,
      recipientMemberId: memberId,
      idempotencyKey:    `mailbox_link:${tokenRowId}`,
      strict: true,
    });
  } catch (err) {
    // The token row committed above; a lost enqueue would otherwise orphan
    // it with no operator signal to correlate when the member reports the
    // missing email.
    recordOperationalError({
      actionType: 'legacy.mailbox_link_email_enqueue_failed',
      category:   'identity',
      entityType: 'member',
      entityId:   memberId,
      reasonText: 'Mailbox-control token committed but the verification-email enqueue failed.',
      cause:      err,
      metadata:   { anchor_id: anchorId, token_row_id: tokenRowId },
    });
    throw err;
  }
  appendAuditEntry({
    actionType:    'legacy.mailbox_link_token_issued',
    category:      'identity',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'member',
    entityId:      memberId,
    reasonText:    null,
    metadata: {
      anchor_id:     anchorId,
      token_row_id:  tokenRowId,
      // Masked address: enough to recognize, not enough to harvest.
      masked_email:  anchor.anchor_value.replace(/^(.).*(@.*)$/, '$1***$2'),
    },
  });
  return { status: 'enqueued' };
}

export type ConsumeAnchorVerificationResult =
  | { status: 'verified'; anchorValueMasked: string }
  | { status: 'invalid' };

function consumeAnchorMailboxVerification(
  memberId: string,
  rawToken: string,
): ConsumeAnchorVerificationResult {
  // Expired-but-present tokens get the expiry event before the generic
  // invalid response, so the trail records the aged-out round-trip.
  const peeked = accountTokenService.peekToken(rawToken, 'mailbox_link');
  if (!peeked) {
    const hashRow = rawToken ? accountTokens.findByHash.get(
      createHash('sha256').update(rawToken).digest('hex'), 'mailbox_link',
    ) as { id: string; member_id: string; expires_at: string; used_at: string | null } | undefined : undefined;
    if (hashRow && hashRow.used_at === null && new Date(hashRow.expires_at).getTime() <= Date.now()) {
      appendAuditEntry({
        actionType:    'legacy.mailbox_link_token_expired',
        category:      'identity',
        actorType:     'system',
        actorMemberId: null,
        entityType:    'member',
        entityId:      hashRow.member_id,
        reasonText:    null,
        metadata: { token_row_id: hashRow.id },
      });
    }
    return { status: 'invalid' };
  }
  // The click must come from the SAME signed-in account the anchor belongs
  // to; a token opened from another session proves nothing about the
  // claiming account's mailbox control.
  if (peeked.memberId !== memberId || !peeked.targetAnchorId) return { status: 'invalid' };

  const consumed = accountTokenService.consumeToken(rawToken, 'mailbox_link');
  if (!consumed || !consumed.targetAnchorId) return { status: 'invalid' };

  const anchor = declaredAnchors.findByIdForMember.get(consumed.targetAnchorId, memberId) as
    | { id: string; anchor_value: string; verified_via_link_click_at: string | null }
    | undefined;
  if (!anchor) return { status: 'invalid' };

  const now = new Date().toISOString();
  transaction(() => {
    declaredAnchors.markVerifiedByLinkClick.run(
      now, consumed.tokenRowId, now, memberId, anchor.id, memberId,
    );
    appendAuditEntry({
      actionType:    'legacy.mailbox_link_token_consumed',
      category:      'identity',
      actorType:     'member',
      actorMemberId: memberId,
      entityType:    'member',
      entityId:      memberId,
      reasonText:    null,
      metadata: {
        anchor_id:         anchor.id,
        token_row_id:      consumed.tokenRowId,
        evidence_strength: 'mailbox_control_via_link_click',
      },
    });
  });
  return {
    status: 'verified',
    anchorValueMasked: anchor.anchor_value.replace(/^(.).*(@.*)$/, '$1***$2'),
  };
}

// ---------------------------------------------------------------------------
// Member-initiated admin link help request — the recovery path for a member
// whose records never surface as candidates. Structured evidence lands in
// the admin work queue; approval applies the link with admin-vetted
// evidence; rejection records the reason. The payload contract for
// task_type 'member_link_help_request' is owned here.
// ---------------------------------------------------------------------------

export interface LinkHelpRequestInput {
  statement: string;
  claimedLegacyUsername?: string;
  claimedLegacyEmail?: string;
  vouchers?: string;
  /** Set when the request originates from the registration-time conflict prompt. */
  isDispute?: boolean;
}

export interface LinkHelpRequestPayload {
  statement: string;
  claimed_legacy_username: string | null;
  claimed_legacy_email: string | null;
  vouchers: string | null;
  is_dispute: boolean;
}

export type SubmitLinkHelpRequestResult =
  | { status: 'submitted'; workQueueItemId: string }
  | { status: 'already_open'; workQueueItemId: string };

function submitLinkHelpRequest(
  memberId: string,
  input: LinkHelpRequestInput,
): SubmitLinkHelpRequestResult {
  const max = readIntConfig('link_help_request_rate_limit_max_per_member', 3);
  const windowMinutes = readIntConfig('link_help_request_rate_limit_window_minutes', 1440);
  const rl = rateLimitHit(`link-help:${memberId}`, max, windowMinutes);
  if (!rl.allowed) {
    throw new RateLimitedError(
      'Too many help requests. Please wait before submitting another.',
      rl.retryAfterSeconds,
    );
  }

  const statement = input.statement?.trim() ?? '';
  if (!statement) {
    throw new ValidationError('Please describe the records you believe are yours.');
  }
  if (statement.length > 2000) {
    throw new ValidationError('Please keep the description under 2000 characters.');
  }
  const clip = (v?: string) => {
    const t = v?.trim() ?? '';
    if (t.length > 200) throw new ValidationError('Identifier fields must be under 200 characters.');
    return t || null;
  };
  const payload: LinkHelpRequestPayload = {
    statement,
    claimed_legacy_username: clip(input.claimedLegacyUsername),
    claimed_legacy_email:    clip(input.claimedLegacyEmail),
    vouchers:                clip(input.vouchers),
    is_dispute:              Boolean(input.isDispute),
  };

  // One open request per member: a re-submit collapses onto the open item
  // rather than stacking queue rows.
  const existing = workQueue.findOpenByEntity.get('member_link_help_request', 'member', memberId) as
    | { id: string }
    | undefined;
  if (existing) {
    return { status: 'already_open', workQueueItemId: existing.id };
  }

  const result = transaction(() => {
    const { id } = workQueueService.enqueue({
      actorId:       memberId,
      queueCategory: 'membership',
      taskType:      'member_link_help_request',
      entityType:    'member',
      entityId:      memberId,
      priority:      5,
      reasonText:    JSON.stringify(payload),
      detailText:    null,
    });
    appendAuditEntry({
      actionType:    'support.help_request_submitted',
      category:      'identity',
      actorType:     'member',
      actorMemberId: memberId,
      entityType:    'member',
      entityId:      memberId,
      reasonText:    null,
      // The audit ledger is append-only and exempt from PII purge, so the
      // claimed legacy identifiers stay out of it; the mutable work-queue
      // row carries the operational copy.
      metadata: {
        work_queue_item_id: id,
        is_dispute:         payload.is_dispute,
      },
    });
    if (payload.is_dispute) {
      appendAuditEntry({
        actionType:    'claim.dispute_opened',
        category:      'identity',
        actorType:     'member',
        actorMemberId: memberId,
        entityType:    'member',
        entityId:      memberId,
        reasonText:    null,
        metadata: { work_queue_item_id: id, source: 'registration_conflict_prompt' },
      });
      appendAuditEntry({
        actionType:    'legacy.registration_conflict_disputed',
        category:      'identity',
        actorType:     'member',
        actorMemberId: memberId,
        entityType:    'member',
        entityId:      memberId,
        reasonText:    null,
        metadata: { work_queue_item_id: id },
      });
    }
    return { id };
  });
  return { status: 'submitted', workQueueItemId: result.id };
}

function loadOpenLinkHelpItem(workQueueItemId: string): { id: string; entity_id: string; reason_text: string | null } {
  const row = workQueue.findById.get(workQueueItemId) as
    | { id: string; task_type: string; entity_type: string; entity_id: string; status: string; reason_text: string | null }
    | undefined;
  if (!row || row.task_type !== 'member_link_help_request' || row.status !== 'open') {
    throw new NotFoundError('Help request not found or already resolved.');
  }
  return row;
}

export interface LinkHelpApproveTarget {
  legacyMemberId?: string;
  historicalPersonId?: string;
}

/**
 * Admin approval: applies the link with admin-vetted evidence and resolves
 * the queue item, atomically. The target is exactly one of a legacy account
 * or a historical-person record; both reuse the member-path claim
 * transactions, so the field-level merge and tier-grant rules are identical
 * to a wizard claim. The claim gates (already linked, target claimed by
 * another) throw the same errors as the member path; the queue row stays
 * open on failure so the admin can correct the target.
 */
function approveLinkHelpRequest(
  adminMemberId: string,
  workQueueItemId: string,
  target: LinkHelpApproveTarget,
): void {
  enforceWorkQueueResolveLimit(adminMemberId);
  const legacyId = target.legacyMemberId?.trim() ?? '';
  const personId = target.historicalPersonId?.trim() ?? '';
  if ((legacyId && personId) || (!legacyId && !personId)) {
    throw new ValidationError(
      'Enter exactly one link target: a legacy account id or a historical person id.',
    );
  }
  const item = loadOpenLinkHelpItem(workQueueItemId);
  const now = new Date().toISOString();
  transaction(() => {
    if (legacyId) {
      claimLegacyAccountInTx(item.entity_id, legacyId, 'admin_vetted_evidence');
    } else {
      claimHistoricalPersonInTx(item.entity_id, personId, 'admin_vetted_evidence');
    }
    workQueue.resolve.run(
      now, adminMemberId, 'approved',
      legacyId
        ? `Approved: linked to legacy account ${legacyId}.`
        : `Approved: linked to historical person ${personId}.`,
      now, adminMemberId, workQueueItemId,
    );
    appendAuditEntry({
      actionType:    'support.help_request_approved',
      category:      'identity',
      actorType:     'admin',
      actorMemberId: adminMemberId,
      entityType:    'member',
      entityId:      item.entity_id,
      reasonText:    null,
      metadata: {
        work_queue_item_id: workQueueItemId,
        ...(legacyId
          ? { legacy_member_id: legacyId }
          : { historical_person_id: personId }),
        evidence_strength:  'admin_vetted_evidence',
        original_payload:   item.reason_text,
      },
    });
  });
}

function rejectLinkHelpRequest(
  adminMemberId: string,
  workQueueItemId: string,
  reason: string,
): void {
  enforceWorkQueueResolveLimit(adminMemberId);
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new ValidationError('A rejection reason is required.');
  }
  const item = loadOpenLinkHelpItem(workQueueItemId);
  const now = new Date().toISOString();
  transaction(() => {
    workQueue.resolve.run(
      now, adminMemberId, 'rejected',
      `Rejected: ${trimmed}`,
      now, adminMemberId, workQueueItemId,
    );
    appendAuditEntry({
      actionType:    'support.help_request_rejected',
      category:      'identity',
      actorType:     'admin',
      actorMemberId: adminMemberId,
      entityType:    'member',
      entityId:      item.entity_id,
      reasonText:    trimmed,
      metadata: {
        work_queue_item_id: workQueueItemId,
        original_payload:   item.reason_text,
      },
    });
  });
}

export const identityAccessService = { attemptLogin, registerMember, lookupLegacyAccount, claimLegacyAccount, initiateLegacyClaim, peekLegacyClaim, consumeAndClaimLegacy, consumeAndClaimLegacyInTx, lookupHistoricalPersonForClaim, claimHistoricalPerson, claimHistoricalPersonInTx, recordHistoricalPersonClaimBlocked, changePassword, verifyEmailByToken, resendVerifyEmail, requestPasswordReset, completePasswordReset, getAutoLinkClassificationForMember, getLinkHistoryViewForWizard, findHistoricalPersonForLinkSubmit, revertAutoLink, revertClaimForDispute, stageAutoLinkCandidate, listOpenStagedCandidates, declineStagedCandidate, declineClassifierCandidate, expireStagedCandidates, listClaimedLegacyIdentities, declareAnchor, declareBirthDateAnchor, getMemberBirthDate, listDeclaredAnchors, removeAnchor, requestAnchorMailboxVerification, consumeAnchorMailboxVerification, submitLinkHelpRequest, approveLinkHelpRequest, rejectLinkHelpRequest, findCrossSourceCandidateAfterHpClaim, findCrossSourceCandidateAfterLegacyClaim, offerCrossSourceCandidate, confirmCrossSourceLegacyCandidate, surnameMatchesWithAnchors, enforceHistoricalPersonClaimLimit };
