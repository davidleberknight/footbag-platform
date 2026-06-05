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
 *   - Staged-candidate resolution inside every claim transaction: any claim
 *     path that satisfies an open staged candidate marks it confirmed and
 *     emits the confirmed audit event.
 *   - Declared identity anchors (former surnames / old emails): rate-limited
 *     declare/remove, multi-anchor classifier matching, surname gates that
 *     honor former surnames, and the mailbox-control round-trip (single-use
 *     link to the declared address; a same-account click upgrades matches
 *     through that anchor to the hard-evidence tier)
 *   - Cross-source offers: after a one-source claim, the other source is
 *     searched via real anchors and a cross_source staged candidate is
 *     offered (same stage / confirm / decline / expire lifecycle, distinct
 *     audit event family)
 *   - Registration-time conflict detection: a registrant whose surname
 *     matches an already-claimed record gets the prompted event and the
 *     wizard's "is one of these you?" card; the dispute affordance files a
 *     help request
 *   - Member link help requests: structured intake into the admin work
 *     queue (one open item per member); admin approve applies the link with
 *     admin-vetted evidence and resolves the item atomically; reject
 *     records the reason
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
 *     registration conflict prompted / disputed, mailbox link issued /
 *     consumed / expired, cross-source offered / confirmed / declined)
 *   - outbox_emails enqueue (verification, reset, claim email, resend,
 *     mailbox-control link to a declared old email)
 *   - work_queue_items insert (auto_link_revert_review on every revert;
 *     member_link_help_request intake with admin-alerts fan-out)
 *
 * Service shape: singleton object (no external adapters beyond db.ts and the KMS-backed
 * JwtSigningAdapter resolved via getJwtSigningAdapter()).
 */
import { randomUUID } from 'crypto';
import argon2 from 'argon2';
import { hashPassword } from '../lib/passwordHash';
import { auth, registration, legacyClaim, legacyMembers, account, workQueue, autoLinkStagedCandidates, declaredAnchors, accountTokens, MemberAuthRow, LegacyMemberRow, AlreadyClaimedRow, HistoricalPersonClaimRow, AutoLinkStagedCandidateRow } from '../db/db';
import { transaction } from '../db/db';
import { accountTokenService } from './accountTokenService';
import { getCommunicationService } from './communicationService';
import { hit as rateLimitHit } from './rateLimitService';
import { readIntConfig } from './configReader';
import { config } from '../config/env';
// CUTOVER-REMOVE: dev/staging admin bootstrap convenience.
// Current: applyDevStagingBootstrapAdmin (the registration-time admin
//   allowlist) is active in dev/staging only; the env-config fail-fast guard
//   prevents its trigger from being set in production.
// Target: remove this import and the bootstrap call in registerMember at
//   production go-live, when the SSM-token first-admin claim is the only path.
import { applyDevStagingBootstrapAdmin } from '../dev-bootstrap/runtime';
import { ConflictError, NotFoundError, RateLimitedError, ServiceError, ValidationError } from './serviceErrors';
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
  slug?: string;
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
   * (dev and staging); null in production. Mirrors the pattern in
   * /register/check-email so developers can complete
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
   * claim. Carries the simulated-email card (stub adapter; dev and staging) and an
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
  declaredAnchors?: DeclaredAnchorView[];
  /** Banner gate after a help-request submit redirected back to the task. */
  helpRequestNotice?: boolean;
  /** Mailbox-verification round-trip notice ('sent' | 'verified' | 'invalid'). */
  anchorVerificationNotice?: 'sent' | 'verified' | 'invalid' | null;
  /** Same-name collision against already-claimed records; renders the
   * "is one of these you?" prompt with the dispute affordance. */
  conflictPrompt: { records: RegistrationConflictRecord[] } | null;
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

  const emailExists = registration.checkEmailExists.get(normalizedEmail) as { exists_flag: number } | undefined;
  if (emailExists) {
    throw new ValidationError('An account with this email already exists. Please log in or reset your password.');
  }

  const id = `member_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const hash = await hashPassword(password);
  const now = new Date().toISOString();

  // Insert with race-defensive catch:
  //   - UNIQUE on login_email_normalized: concurrent registration won the
  //     race; return the same silent_duplicate shape so the response is
  //     observationally identical to the pre-check happy path.
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
        now,   // created_at
        now,   // updated_at
      );
      inserted = true;
      break;
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      const msg = String((err as Error).message ?? '');
      if (msg.includes('login_email_normalized')) {
        throw new ValidationError('An account with this email already exists. Please log in or reset your password.');
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

  applyDevStagingBootstrapAdmin({ memberId: id, normalizedEmail, now }); // CUTOVER-REMOVE

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
    getCommunicationService().enqueueEmailOrFail({
      // tokenRowId is the natural single-use key: re-issuing on a worker
      // restart between SES-send and outbox-mark-sent collapses to the same
      // outbox row instead of double-delivering.
      idempotencyKey: `verify:${issued.tokenRowId}`,
      recipientEmail,
      recipientMemberId: memberId,
      subject: 'Verify your IFPA Footbag account',
      bodyText:
        'Welcome to IFPA Footbag.\n\n' +
        `Please confirm your email address by opening the link below. The link expires in ${ttlHours} hour${ttlHours === 1 ? '' : 's'}.\n\n` +
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
    legacy_member_id: string; real_name: string | null; display_name: string | null;
  }>;
  for (const row of claimedLegacy) {
    const name = row.real_name ?? row.display_name;
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
 * `sentNotice`, `noMatchNotice`, and `lowConfidenceBanner` are HTTP-context
 * inputs from the controller (driven by `?sent=1`, `?nomatch=1`, and
 * `?from=register | ?reason=low_confidence`). They're threaded in here so
 * the template stays logic-light.
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
  let emailLegacyMemberId: string | null = null;
  const seenLegacyIds = new Set<string>(
    stagedRows.map((r) => r.legacy_member_id).filter((v): v is string => v != null),
  );
  if (!legacyLinked && member.login_email_normalized) {
    try {
      const lookup = lookupLegacyAccount(memberId, member.login_email_normalized);
      if (lookup.kind === 'single') {
        const row = legacyMembers.findByLegacyMemberId.get(lookup.result.legacyMemberId) as LegacyMemberRow | undefined;
        if (row && !seenLegacyIds.has(row.legacy_member_id)) {
          seenLegacyIds.add(row.legacy_member_id);
          emailLegacyMemberId = row.legacy_member_id;
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
    showClubsComingSoon: true,
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
    if (memberBirthDate && legacyMatch.birthDate && memberBirthDate === legacyMatch.birthDate) {
      const provenanceCandidate = candidates.find((c) => c.personId === hpProvenance.person_id);
      if (provenanceCandidate) {
        const narrowed = provenanceCandidate;
        if (!normalizedSurnamesMatch(realName, narrowed.personName)) {
          return { confidence: 'low', reason: 'hp_mismatch' };
        }
        if (narrowed.matchKind === 'exact') {
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
  if (!row) return;
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

  const rows = legacyMembers.findAllByIdentifier.all(trimmed, trimmed, normalizeEmail(identifier)) as LegacyMemberRow[];
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
 * floor tier; the admin oversight feed filters by tier, weakest first.
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

  // Single tier grant per legacy claim; grants never stack.
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
      evidence_strength:  evidenceStrength,
    },
  });

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

  const existing = legacyClaim.findMemberClaimingHp.get(personId) as { id: string; slug: string } | undefined;
  if (existing) {
    return { status: 'conflict' };
  }

  // Surname reconciliation is required to proceed: the current real-name
  // surname or any declared former surname must match. Mismatch blocks the
  // claim entirely; callers should not render the confirm page.
  if (!surnameMatchesWithAnchors(requestingMemberId, member.real_name, hp.person_name)) {
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

  const existing = legacyClaim.findMemberClaimingHp.get(personId) as { id: string; slug: string } | undefined;
  if (existing) {
    throw new ValidationError('This historical record has already been claimed by another member.');
  }

  if (!surnameMatchesWithAnchors(requestingMemberId, member.real_name, hp.person_name)) {
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

  // Single tier grant per legacy claim; grants never stack.
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
      evidence_strength:      evidenceStrength,
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
      getCommunicationService().enqueueEmailOrFail({
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
    }
    if (clearedHp) {
      legacyMembers.clearMemberHistoricalPersonId.run(now, actor.actorMemberId, memberId);
    }

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
  targetMemberId: string,
  reason: string,
): DisputeRevertResult {
  enforceWorkQueueResolveLimit(adminMemberId);
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new ValidationError('A dispute reason is required.');
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
      metadata: { original_claim_audit_id: originalClaim?.id ?? null },
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
      metadata: { original_claim_audit_id: originalClaim?.id ?? null },
    });
    return { status: 'reverted' as const, originalClaimAuditId: originalClaim?.id ?? null };
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

// ---------------------------------------------------------------------------
// Cross-source candidate prompt (DD-F). After a successful claim of one
// source (HP or legacy), check the other for unclaimed matches.
// ---------------------------------------------------------------------------

export interface CrossSourceCandidate {
  kind: 'legacy' | 'hp';
  displayName: string;
  personId: string | null;
  legacyMemberId: string | null;
}

function findCrossSourceCandidateAfterHpClaim(memberId: string, personId: string): CrossSourceCandidate | null {
  const member = legacyClaim.findClaimingMember.get(memberId) as
    | { legacy_member_id: string | null; real_name: string; login_email_normalized: string | null }
    | undefined;
  if (!member || member.legacy_member_id) return null;

  const hp = legacyClaim.findHistoricalPersonById.get(personId) as HistoricalPersonClaimRow | undefined;
  if (!hp) return null;

  // Real anchors only: the member's verified login email and declared old
  // emails. A hit must also agree on surname (current or declared former)
  // and be unclaimed; anything ambiguous offers nothing.
  const emails: string[] = [];
  if (member.login_email_normalized) emails.push(member.login_email_normalized);
  emails.push(...getDeclaredAnchorValues(memberId).oldEmails);
  for (const email of emails) {
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
      };
    } catch {
      // Non-revealing on lookup errors; try the next anchor.
    }
  }
  return null;
}

function findCrossSourceCandidateAfterLegacyClaim(memberId: string, legacyMemberId: string): CrossSourceCandidate | null {
  const member = legacyClaim.findClaimingMember.get(memberId) as
    | { historical_person_id: string | null; real_name: string }
    | undefined;
  if (!member || member.historical_person_id) return null;

  // Name candidates from the member's own name plus declared former
  // surnames (the variant machinery covers spelling differences). The
  // candidate must be unclaimed and agree on surname via the same gate the
  // direct claim enforces; multiple survivors offer nothing.
  const firstName = member.real_name.trim().split(/\s+/)[0] ?? '';
  const queries = [member.real_name];
  if (firstName) {
    for (const formerSurname of getDeclaredAnchorValues(memberId).formerSurnames) {
      queries.push(`${firstName} ${formerSurname}`);
    }
  }
  const seen = new Set<string>();
  const survivors: Array<{ personId: string; personName: string }> = [];
  for (const c of queries.flatMap((q) => findAutoLinkCandidates(q))) {
    if (seen.has(c.personId)) continue;
    seen.add(c.personId);
    const taken = legacyClaim.findMemberClaimingHp.get(c.personId) as { id: string } | undefined;
    if (taken) continue;
    if (!surnameMatchesWithAnchors(memberId, member.real_name, c.personName)) continue;
    survivors.push({ personId: c.personId, personName: c.personName });
  }
  if (survivors.length !== 1) return null;
  return {
    kind: 'hp',
    displayName: survivors[0].personName,
    personId: survivors[0].personId,
    legacyMemberId: null,
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
        JSON.stringify(['cross_source_anchor_agreement']),
        'declared_anchor_only',
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
  claimLegacyAccount(memberId, row.legacy_member_id, 'declared_anchor_only');
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
    throw new ValidationError('Anchor value cannot be empty.');
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
    getCommunicationService().enqueueEmailOrFail({
      idempotencyKey:    `mailbox_link:${tokenRowId}`,
      recipientEmail:    anchor.anchor_value,
      recipientMemberId: memberId,
      subject:           'IFPA: confirm this was your footbag.org email address',
      bodyText:
        'You (or someone signed in to an IFPA Footbag account) told us this email ' +
        'address was used on the old footbag.org site.\n\n' +
        'If that was you, open the link below WHILE SIGNED IN to your IFPA account ' +
        `to confirm you still control this mailbox. The link expires in ${ttlHours} hour${ttlHours === 1 ? '' : 's'}.\n\n` +
        `${baseUrl}/register/wizard/legacy_claim/anchors/verify/${rawToken}\n\n` +
        'If this was not you, you can ignore this message.',
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

  const id = `wq_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  const now = new Date().toISOString();
  transaction(() => {
    workQueue.insertItem.run(
      id,
      now, memberId,
      now, memberId,
      'membership',
      'member_link_help_request',
      'member',
      memberId,
      5,
      now,
      JSON.stringify(payload),
    );
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
    getCommunicationService().enqueueMailingListEmail({
      mailingListSlug:      'admin-alerts',
      subject:              'New admin queue item: member_link_help_request',
      bodyText:             `Task type: member_link_help_request\nEntity ID: ${memberId}`,
      idempotencyKeyPrefix: `admin-alerts:member_link_help_request:${id}`,
    });
  });
  return { status: 'submitted', workQueueItemId: id };
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

/**
 * Admin approval: applies the legacy link with admin-vetted evidence and
 * resolves the queue item, atomically. The claim gates (already linked,
 * target claimed by another) throw the same errors as the member path; the
 * queue row stays open on failure so the admin can correct the target.
 */
function approveLinkHelpRequest(
  adminMemberId: string,
  workQueueItemId: string,
  targetLegacyMemberId: string,
): void {
  enforceWorkQueueResolveLimit(adminMemberId);
  const target = targetLegacyMemberId.trim();
  if (!target) {
    throw new ValidationError('A target legacy account id is required to approve.');
  }
  const item = loadOpenLinkHelpItem(workQueueItemId);
  const now = new Date().toISOString();
  transaction(() => {
    claimLegacyAccountInTx(item.entity_id, target, 'admin_vetted_evidence');
    workQueue.resolve.run(
      now, adminMemberId, 'approved',
      `Approved: linked to legacy account ${target}.`,
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
        legacy_member_id:   target,
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

export const identityAccessService = { verifyMemberCredentials, attemptLogin, registerMember, lookupLegacyAccount, claimLegacyAccount, initiateLegacyClaim, peekLegacyClaim, consumeAndClaimLegacy, consumeAndClaimLegacyInTx, lookupHistoricalPersonForClaim, claimHistoricalPerson, claimHistoricalPersonInTx, recordHistoricalPersonClaimBlocked, changePassword, verifyEmailByToken, resendVerifyEmail, requestPasswordReset, completePasswordReset, getAutoLinkClassificationForMember, getLinkHistoryViewForWizard, findHistoricalPersonForLinkSubmit, revertAutoLink, revertClaimForDispute, stageAutoLinkCandidate, listOpenStagedCandidates, declineStagedCandidate, expireStagedCandidates, listClaimedLegacyIdentities, declareAnchor, listDeclaredAnchors, removeAnchor, requestAnchorMailboxVerification, consumeAnchorMailboxVerification, submitLinkHelpRequest, approveLinkHelpRequest, rejectLinkHelpRequest, findCrossSourceCandidateAfterHpClaim, findCrossSourceCandidateAfterLegacyClaim, offerCrossSourceCandidate, confirmCrossSourceLegacyCandidate };
