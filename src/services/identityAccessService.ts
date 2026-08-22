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
 *     emits the confirmed audit event. The wizard's continue-without-linking
 *     attestation resolves the other way: it declines every open candidate in
 *     the transaction that completes the claim task, so the task cannot finish
 *     leaving a card unresolved.
 *   - Declared identity anchors (former surnames / old emails): rate-limited
 *     declare/remove, multi-anchor classifier matching, surname gates that honor
 *     former surnames, and the mailbox-control round-trip (single-use link to the
 *     declared address; a same-account click upgrades matches through that anchor
 *     to the hard-evidence tier).
 *   - Date of birth is a matching anchor collected in the personal_details task
 *     (not declared here). It only ever helps a member: an identical date
 *     disambiguates tied same-name candidates, and a date that does not match
 *     simply fails to corroborate. It never gates a claim, never weakens one,
 *     and never raises work for an administrator. Every claim records the
 *     member-versus-legacy comparison outcome in its audit metadata, on both
 *     the legacy-account and the direct historical-record claim paths, so a
 *     disputed link can be reconstructed from the ledger.
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
 *     HP-only claims alike. The revert is bound at three points: the resolving
 *     administrator may not be the member who filed the dispute; the record may
 *     only be one the dispute itself names, detected server-side when it was
 *     filed; and the record must still be held by the member the dispute was
 *     filed against, so an upheld dispute followed by a fresh admin-vetted link
 *     cannot be stripped by a second dispute naming the same record. The member
 *     whose claim is stripped is derived from whoever holds that record and is
 *     never supplied by the caller. Without these bindings the action reached
 *     any claimed member on the platform. A disputed historical record clears
 *     whatever its provenance, so upholding a dispute always undoes the record
 *     it was about rather than only the links that trace to a legacy account.
 *   - The claim-time field merge and its precedence ladder: the member's own
 *     answer beats every import, and the curated historical record beats the
 *     legacy dump. Inside one transaction that ladder is enforced by write
 *     order plus fill-if-empty; across transactions it is not, so a curated
 *     record claimed after a legacy account re-asserts its values over exactly
 *     what the dump wrote (equality-matched, so nothing the member entered
 *     moves). Imported location is normalised through the shared member
 *     location rules, which NEVER throw here: a value that will not normalise
 *     is dropped and the member supplies it, because refusing would roll back
 *     the whole claim transaction over a defect in twenty-year-old data. The
 *     revert scrub is handed the same normalised values that were written, or
 *     its equality test would match nothing and strand the record's personal
 *     data on the member row. Street address and postal code are deliberately
 *     not copied onto the member row at all; they stay on the archival
 *     legacy_members snapshot. A revert that empties a field the
 *     personal-details task requires re-opens that task.
 *
 * Does not own:
 *   - Member profile CRUD (MemberService)
 *   - Historical-person reads (HistoryService)
 *   - Tier calculation or grants (MembershipTieringService -- this service delegates)
 *   - Session-cookie HTTP glue (controller responsibility)
 *   - Club lifecycle and club-leader promotion (ClubService); the wizard's
 *     club-affiliation and leadership confirmations (MemberOnboardingService)
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
 *   - A historical record flagged deceased is not self-claimable on any path. The
 *     direct historical-record claim refuses it, and so does a legacy-account
 *     claim whose account transitively links to it, because that claim sets the
 *     same member-to-record link and folds the record's honors into the tier
 *     grant. Neither path can hand a living account a deceased person's identity.
 *   - Soft-deleted members within member_cleanup_grace_days get the restoration screen.
 *   - Candidate staging never mutates live tables and never sends mail: a
 *     staged row plus its staged audit event commit in one transaction and
 *     nothing else happens until the member acts. Re-staging an open
 *     member/target pair is a unique-constraint no-op (batch reruns are
 *     idempotent); a declined pair is never re-staged.
 *   - Every confirmed-claim audit row carries an evidence_strength tag;
 *     name-only evidence tags the declared_anchor_only floor tier.
 *   - Claim-merge source precedence: the member's own answer beats every
 *     import, and the curated historical_persons record beats the legacy
 *     footbag.org dump. Both merge statements are fill-if-empty, so the
 *     ladder is carried by write order on both claim paths: the historical
 *     merge always executes before the legacy transfer. Honors OR together
 *     (MAX) and are order-independent.
 *   - Auto-link revert is idempotent: a second revert returns
 *     `already_reverted` without state change.
 *
 * Transaction discipline:
 *   - Multi-write paths (claim merge, password reset + version bump, register + audit)
 *     wrap in transaction(() => { ... }) from db.ts. All DB ops inside are synchronous;
 *     external I/O (SES, etc.) happens BEFORE the transaction opens. Enqueuing an
 *     email is not external I/O: it inserts an outbox row in this same database,
 *     and the provider call happens later in the drain worker.
 *   - Password change orders every fallible step ahead of the one irreversible
 *     one. The replacement session JWT is signed first, so a signing outage ends
 *     the request with nothing changed; then the version bump, its audit row, and
 *     the confirmation-email outbox row commit as a single transaction, so a
 *     refused enqueue can never leave the password changed. A send the template
 *     registry suppresses, or an account with no deliverable address, commits
 *     without mail but never silently: it records the notification failure in
 *     the same transaction, so a password that changed with nobody told is
 *     always visible. The bump is
 *     conditioned on the password_version that was read, so a concurrent change
 *     is refused rather than applied over an unknown state.
 *   - In-tx variants (consumeAndClaimLegacyInTx, claimHistoricalPersonInTx) accept a
 *     caller-owned transaction so the wizard orchestrator can merge the claim and the
 *     member_onboarding_tasks row transition inside one transaction.
 *
 * Persistence:
 *   members, members_active, legacy_members, historical_persons (read-only for HP-match),
 *   account_tokens,
 *   audit_entries, outbox_emails, auto_link_staged_candidates (stage /
 *   confirm / decline / expire lifecycle), member_declared_anchors (declare /
 *   remove / verify-by-link-click; deleted wholesale on PII purge by
 *   MemberService), work_queue_items (link help requests: insert + resolve).
 *   Tier-grant writes delegated to MembershipTieringService.
 *
 * Side effects:
 *   - audit_entries append (auth, claim, dev/staging admin allowlist grant,
 *     candidate staged /
 *     confirmed / declined / expired, claim blocked, revert, dispute opened /
 *     revert applied, help request submitted / approved / rejected,
 *     registration conflict prompted / disputed, registration duplicate email,
 *     mailbox link issued / consumed / expired, cross-source offered /
 *     confirmed / declined)
 *   - outbox_emails enqueue (verification, account-exists notice on a duplicate
 *     registration, reset, password-change confirmation, claim email, resend,
 *     mailbox-control link to a declared old email, and the reply telling a
 *     member their link request was answered, which carries the decision and,
 *     on a refusal, the administrator's reason)
 *   - operational-error audit + alarm when that reply cannot be enqueued after
 *     the resolve has committed (support.help_request_resolve_notification_failed)
 *   - work_queue_items insert (member_link_help_request intake with
 *     admin-alerts fan-out), raised from the identity-link category of the
 *     member contact form, which is the only way a member reaches this queue
 *
 * Service shape: singleton object (no external adapters beyond db.ts and the KMS-backed
 * JwtSigningAdapter resolved via getJwtSigningAdapter()).
 */
import { randomUUID, randomBytes } from 'crypto';
import argon2 from 'argon2';
import { hashPassword } from '../lib/passwordHash';
import { auth, registration, legacyClaim, legacyMembers, account, memberOnboarding, workQueue, autoLinkStagedCandidates, declaredAnchors, accountTokens, MemberAuthRow, LegacyMemberRow, AlreadyClaimedRow, HistoricalPersonClaimRow, AutoLinkStagedCandidateRow } from '../db/db';
import { transaction, auditEntries } from '../db/db';
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
import { ConflictError, NotFoundError, RateLimitedError, ServiceError, ServiceUnavailableError, ValidationError } from './serviceErrors';
import { createSessionJwt } from './jwtService';
import { compareBirthDates, type RecordedBirthDateComparison } from '../lib/birthDate';
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
const MIN_DISPLAY_NAME = 2;
const MAX_DISPLAY_NAME = 64;

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

import { slugify } from './slugify';
import {
  assembleFullName, matchReservedNameWord, memberSurnameKey, memberSurnameCompareKey,
  stripAccents, surnameKey, surnameKeyMatchesName,
} from './nameUtils';
import { normalizeImportedLocation } from './memberLocationRules';
// Type only: the month picker on the claim step's last-attempt block renders the
// same option shape the profile and personal-details date controls render, so
// there is one shape for a month select rather than three.
import type { SelectOption } from './memberService';

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
  givenNames?: string;
  familyName?: string;
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
  /**
   * Simulated-email card for the post-submit sent state. Populated only when
   * SES_ADAPTER=stub (dev and staging); null in production, where no card
   * renders and no reset token is ever exposed to a live visitor. Mirrors the
   * pattern on /register/check-email so a tester completes the reset on the
   * page.
   */
  emailPreview?: SimulatedEmailPreview;
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
  /**
   * True when the surname rule the claim gate applies would refuse this record
   * today. The card still renders, because hiding it would hide a member's own
   * record from them at exactly the moment their name has changed, which is the
   * case the declared-anchor remedy exists for. What changes is the action: the
   * card offers the remedy instead of a claim, so the platform never offers a
   * control it is going to refuse.
   *
   * Computed with the same predicate the gate uses, so the two cannot drift.
   */
  claimNeedsAnchor?: boolean;
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
  /**
   * Whether the task still needs its answer. False once it is completed, which
   * is what stops the page offering a decision to someone who has already made
   * one and would otherwise submit into a silent no-op.
   */
  showNoLinkAnswers?: boolean;
  /**
   * The last attempt at the match, offered to a member who has just said they
   * held an old account but cannot find it. The task is already complete by the
   * time this renders; nothing here gates finishing.
   */
  sharpenNotice?: boolean;
  /** The date of birth on file, offered for correction during that attempt. */
  birthDay?: string;
  birthMonth?: string;
  birthYear?: string;
  birthMonthOptions?: SelectOption[];
  /** Set after a correction lands, so the member sees the re-check happened. */
  birthDateSavedNotice?: boolean;
  /** Where "carry on" goes: the member's next outstanding task. */
  continueHref?: string;
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
  /** Public Turnstile site key for the find-form CAPTCHA widget; null when the
   *  captcha is stubbed (dev + staging), so no widget renders there. */
  turnstileSiteKey?: string | null;
  /** Mailbox-verification round-trip notice ('sent' | 'verified' | 'invalid'). */
  anchorVerificationNotice?: 'sent' | 'verified' | 'invalid' | null;
  /** Banner after an anchor add/remove redirected back: confirms the save and
   * the match re-check without leaking whether anything matched. */
  anchorSavedNotice?: 'saved' | 'removed' | null;
  /** Same-name collision against already-claimed records; renders the
   * "is one of these you?" prompt with the dispute affordance. */
  conflictPrompt: { records: RegistrationConflictRecord[] } | null;
  /**
   * Simulated-email card for the two mail-sending states on this page, the
   * manual legacy-claim sent notice and the mailbox-control declared notice.
   * Populated only when SES_ADAPTER=stub (dev and staging); null in production,
   * where no card renders. Lets a tester open the confirmation link on the page
   * instead of hopping to the dev outbox.
   */
  emailPreview?: SimulatedEmailPreview;
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
 * Validate a full legal name for registration. The name is expected NFC-normalized.
 * Rules: required, 2-64 chars, at least two words, at least one word 2+ chars, no
 * digits, no invisible/control/bidi characters, and a single script (the UTS #39
 * mixed-script restriction).
 */
/**
 * Validate the two recorded parts of a member's legal name.
 *
 * The family name is required and the given names are not. The family name is
 * the anchor every claim path matches on, so it is the part that must always be
 * there; a member whose legal name is a single word, which is ordinary in much
 * of the world, records that one name here and leaves the given names empty.
 * Demanding both parts is what would refuse those members at the door.
 *
 * Nothing here restricts the character set beyond the existing safety check:
 * accents, apostrophes, hyphens, internal spaces and non-Latin scripts are all
 * real parts of real names.
 */
function validateNameParts(givenNames: string, familyName: string): void {
  if (!familyName) {
    throw new ValidationError(
      givenNames
        ? 'Enter your family name. If you have only one name, enter it as your family name.'
        : 'Enter your name.',
    );
  }
  const assembled = assembleFullName(givenNames, familyName);
  if (assembled.length > MAX_DISPLAY_NAME) {
    throw new ValidationError(`Your name must be ${MAX_DISPLAY_NAME} characters or fewer in total.`);
  }
  if (givenNames) assertSafeNameCharacters(givenNames, 'Given name');
  if (familyName) assertSafeNameCharacters(familyName, 'Family name');
  if (/\d/.test(assembled)) {
    throw new ValidationError('Your name must not contain digits.');
  }
  if (assembled.length < 2) {
    throw new ValidationError('Your name must be at least two characters.');
  }
}

/**
 * Validate that a display name shares a surname with the real name.
 */
function validateDisplayNameSurname(displayName: string, registrantSurnameKey: string): void {
  // The display name is one free-text string; the family name it must carry may
  // be several words. Checking that the display name ends with the family name
  // is what admits a member called "Belouin Ollivier" choosing to show
  // "B. Belouin Ollivier"; comparing last word to last word would refuse it.
  if (!surnameKeyMatchesName(registrantSurnameKey, displayName)) {
    throw new ValidationError('Display name must include your family name.');
  }
}

// UTS #39 display-name safety. A member's public display name is unforgeable
// attribution, so a name that mimics another member through invisible characters
// or cross-script homoglyphs is a spoofing vector. Two checks run on the
// NFC-normalized name: forbidden code points, then the single-script rule.
//
// The scripts tested for the mixed-script rule. A name's letters must resolve to
// a single script, with the CJK augmentations allowed (Japanese = Han + kana,
// Korean = Han + Hangul), so an ordinary name in any one writing system passes
// while a Latin/Cyrillic/Greek homoglyph mix is rejected.
const NAME_SCRIPT_TESTS: ReadonlyArray<readonly [string, RegExp]> = [
  ['Latin',      /\p{Script=Latin}/u],
  ['Cyrillic',   /\p{Script=Cyrillic}/u],
  ['Greek',      /\p{Script=Greek}/u],
  ['Han',        /\p{Script=Han}/u],
  ['Hiragana',   /\p{Script=Hiragana}/u],
  ['Katakana',   /\p{Script=Katakana}/u],
  ['Hangul',     /\p{Script=Hangul}/u],
  ['Arabic',     /\p{Script=Arabic}/u],
  ['Hebrew',     /\p{Script=Hebrew}/u],
  ['Devanagari', /\p{Script=Devanagari}/u],
  ['Thai',       /\p{Script=Thai}/u],
  ['Armenian',   /\p{Script=Armenian}/u],
  ['Georgian',   /\p{Script=Georgian}/u],
];

function resolvedNameScripts(name: string): Set<string> {
  const scripts = new Set<string>();
  for (const ch of name) {
    if (!/\p{L}/u.test(ch)) continue; // only letters carry a script for this rule
    for (const [scriptName, re] of NAME_SCRIPT_TESTS) {
      if (re.test(ch)) { scripts.add(scriptName); break; }
    }
    // A letter from a script outside the tested set is left unattributed rather
    // than forcing a false mixed-script rejection of an uncommon writing system.
  }
  return scripts;
}

function isSingleAllowedScript(scripts: Set<string>): boolean {
  if (scripts.size <= 1) return true;
  const s = [...scripts];
  const japanese = s.every(x => x === 'Han' || x === 'Hiragana' || x === 'Katakana');
  const korean   = s.every(x => x === 'Han' || x === 'Hangul');
  return japanese || korean;
}

/**
 * Reject the homograph / spoofing vectors an attacker uses to mimic another
 * member's name, and the role claims that mimic the platform itself. Runs on
 * the NFC-normalized name.
 * - A reserved word carried as one of the name's own words claims a position the
 *   registrant does not hold ("Footbag Official", "IFPA Support"). Checked first,
 *   because it is the only one of the three a plain ASCII name can trip.
 * - `\p{C}` covers control, format (zero-width joiners, bidi overrides, BOM),
 *   surrogate, private-use, and unassigned code points; none appear in a real name.
 * - The mixed-script rule rejects letters drawn from more than one script (a
 *   Cyrillic 'а' hidden inside a Latin name).
 */
function assertSafeNameCharacters(name: string, label: string): void {
  if (matchReservedNameWord(name)) {
    throw new ValidationError(`${label} must not include a word reserved for official IFPA and site roles.`);
  }
  if (/\p{C}/u.test(name)) {
    throw new ValidationError(`${label} must not contain invisible or control characters.`);
  }
  if (!isSingleAllowedScript(resolvedNameScripts(name))) {
    throw new ValidationError(`${label} must not mix letters from different scripts.`);
  }
}

const SLUG_PATTERN = /^[a-z0-9]([a-z0-9_]*[a-z0-9])?$/;
const MAX_SLUG_LENGTH = 64;
const MIN_SLUG_LENGTH = 2;

function validateSlug(slug: string, registrantSurnameKey: string): void {
  if (slug.length < MIN_SLUG_LENGTH) {
    throw new ValidationError(`Profile URL must be at least ${MIN_SLUG_LENGTH} characters.`);
  }
  if (slug.length > MAX_SLUG_LENGTH) {
    throw new ValidationError(`Profile URL must be ${MAX_SLUG_LENGTH} characters or fewer.`);
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new ValidationError('Profile URL must contain only lowercase letters, numbers, and underscores.');
  }
  // A member-chosen URL is free text that need only carry the surname, so it can
  // claim a role the name itself is refused for; an auto-generated one derives
  // from the already-checked display name and never reaches this.
  if (matchReservedNameWord(slug)) {
    throw new ValidationError('Profile URL must not include a word reserved for official IFPA and site roles.');
  }
  // A profile URL carries no spaces, so a family name of several words could
  // never be contained in one and every slug the member tried would be refused.
  // The rule is held to the family name's final word, which is satisfiable and
  // still ties the public address to the name.
  const slugSurname = surnameKey(registrantSurnameKey);
  if (slugSurname && !slug.includes(slugSurname)) {
    throw new ValidationError('Profile URL must contain your family name.');
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
  givenNames: string,
  familyName: string,
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

  const trimmedGivenNames = givenNames.trim().normalize('NFC');
  const trimmedFamilyName = familyName.trim().normalize('NFC');
  validateNameParts(trimmedGivenNames, trimmedFamilyName);
  const trimmedRealName = assembleFullName(trimmedGivenNames, trimmedFamilyName);
  const trimmedDisplayName = displayName.trim().normalize('NFC') || trimmedRealName;
  const trimmedEmail = email.trim();
  const normalizedEmail = normalizeEmail(trimmedEmail);

  if (trimmedDisplayName.length < MIN_DISPLAY_NAME) {
    throw new ValidationError(`Display name must be at least ${MIN_DISPLAY_NAME} characters.`);
  }
  if (trimmedDisplayName.length > MAX_DISPLAY_NAME) {
    throw new ValidationError(`Display name must be ${MAX_DISPLAY_NAME} characters or fewer.`);
  }
  assertSafeNameCharacters(trimmedDisplayName, 'Display name');
  // Both rules key on the recorded family name rather than the last word of the
  // full name. A member whose only name is a given name is held to that name,
  // so neither rule becomes unsatisfiable for them.
  const registrantSurnameKey = memberSurnameKey({
    family_name: trimmedFamilyName || null,
    given_names: trimmedGivenNames || null,
    real_name:   trimmedRealName,
  });
  if (trimmedDisplayName !== trimmedRealName) {
    validateDisplayNameSurname(trimmedDisplayName, registrantSurnameKey);
  }

  const trimmedSlug = requestedSlug?.trim().toLowerCase() ?? '';
  const userProvidedSlug = trimmedSlug !== '';
  if (userProvidedSlug) {
    validateSlug(trimmedSlug, registrantSurnameKey);
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
        trimmedFamilyName || null,          // family_name
        trimmedGivenNames || null,          // given_names
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
  // Bounded like the card is: the ledger records that the collision happened,
  // not an unbounded roster of everyone a common surname reached.
  const conflicts = detectRegistrationConflicts(id, trimmedRealName, CONFLICT_CARD_LIMIT);
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
        // Records are named by identifier, never by the person's name. This
        // ledger is append-only and erasure never reaches it, so a name written
        // here would outlive the account it belongs to and survive the very
        // anonymisation that is supposed to retire it -- and these are other
        // people's names, recorded against a registrant they may have no
        // connection to. An identifier resolves for anyone investigating, and
        // stops resolving once the record behind it is erased.
        conflicts: conflicts.map((c) => ({
          legacy_member_id:     c.legacyMemberId,
          historical_person_id: c.historicalPersonId,
          source:               c.sourceLabel,
        })),
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
  | {
      confidence: 'high';
      personId: string;
      personName: string;
      anchorSource: AutoLinkAnchorSource;
      /**
       * Set when a name-variant match reached high confidence on a corroborating
       * date rather than on an exact name. The variant is still how the match was
       * found, and the staged row records it either way, so raising the
       * confidence does not lose the reason.
       */
      matchedVariantNormalized?: string;
    }
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
    // A member who already verified changes no row here, because the statement
    // only marks an unverified account. They still spend a token and still
    // leave with a session, so the row is appended either way: what the trail
    // records is that a session was issued off a verification link, and gating
    // that on whether an UPDATE moved a row would silently lose the cases where
    // a second outstanding link is redeemed. The flag distinguishes the two.
    appendAuditEntry({
      actionType: 'auth.email_verified',
      category: 'auth',
      actorType: 'member',
      actorMemberId: c.memberId,
      entityType: 'member',
      entityId: c.memberId,
      ...(update.changes > 0 ? {} : { metadata: { alreadyVerified: true } }),
    });
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
    : classifyAutoLink(row.real_name, legacyMatch, row.birth_date, 'login_email', row.id);
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
/**
 * The surname to match this member by: their recorded family name where they
 * have one, and the last word of their full name where they do not.
 */
function memberSurnameKeyFor(memberId: string, fallbackRealName: string | null): string {
  const parts = account.findNamePartsById.get(memberId) as
    | { family_name: string | null; given_names: string | null; real_name: string | null }
    | undefined;
  return parts
    ? memberSurnameKey({ ...parts, real_name: parts.real_name ?? fallbackRealName })
    : surnameKey(fallbackRealName ?? '');
}

function surnameMatchesWithAnchors(
  memberId: string,
  realName: string | null,
  targetName: string | null,
): boolean {
  // The member's half of the comparison comes from their recorded family name,
  // so a member with two surnames, a name particle, or a family name written
  // first is matched on the name they gave rather than on whichever word
  // happened to be last. The target's half is still derived, because the legacy
  // and historical records it comes from carry one name string and always will.
  if (surnameKeyMatchesName(memberSurnameKeyFor(memberId, realName), targetName)) return true;
  // A declared former surname is held to the same rule as the recorded one. It
  // is self-asserted free text with no proof behind it, and the surname gate is
  // all that stands between it and someone else's competition record, so
  // reducing a two-word former surname to its final word would open every
  // record ending in that word.
  const { formerSurnames } = getDeclaredAnchorValues(memberId);
  return formerSurnames.some((s) => surnameKeyMatchesName(memberSurnameCompareKey(s), targetName));
}


export interface RegistrationConflictRecord {
  displayName: string;
  sourceLabel: string;
}

/**
 * A detected conflict with the record identifier behind it. The identifier
 * never reaches the page: the view model carries the display half only, so
 * the prompt keeps disclosing nothing beyond the public handle it already
 * shows. The full shape is what a filed dispute records, so the later admin
 * revert can be bound to the records the member actually disputed.
 */
interface RegistrationConflictMatch extends RegistrationConflictRecord {
  legacyMemberId:     string | null;
  historicalPersonId: string | null;
}

/** How many conflicting records the registration card shows before it stops;
 *  a common surname must not flood it. */
const CONFLICT_CARD_LIMIT = 5;

/**
 * Same-name collision check against ALREADY-CLAIMED records: a registrant
 * whose surname (current or declared former) matches a claimed legacy
 * account or a claimed historical person gets the inline "is one of these
 * you?" prompt, catching collisions and impersonation at the earliest
 * point.
 *
 * `limit` caps the card so a common surname cannot flood it. It is a display
 * bound only: a filed dispute records the whole conflict set, because that set
 * is what later bounds an administrator's revert. Capping there would scan the
 * legacy accounts first, leave every historical record out once five legacy
 * matches were found, and refuse a revert on a record genuinely in conflict.
 */
function detectRegistrationConflicts(
  memberId: string,
  realName: string,
  limit: number = Number.POSITIVE_INFINITY,
): RegistrationConflictMatch[] {
  const out: RegistrationConflictMatch[] = [];
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
      out.push({
        displayName:        name,
        sourceLabel:        'Claimed legacy footbag.org account',
        legacyMemberId:     row.legacy_member_id,
        historicalPersonId: null,
      });
      if (out.length >= limit) return out;
    }
  }
  const claimedHp = declaredAnchors.listClaimedHpForConflictScan.all() as Array<{
    person_id: string; person_name: string;
  }>;
  for (const row of claimedHp) {
    if (surnameMatchesWithAnchors(memberId, realName, row.person_name)) {
      out.push({
        displayName:        row.person_name,
        sourceLabel:        'Claimed competition record',
        legacyMemberId:     null,
        historicalPersonId: row.person_id,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** The same detection keyed on the member alone, for callers that hold no
 *  member row of their own. Returns nothing for a member that no longer
 *  exists, which fails a dispute's record binding closed. */
function detectRegistrationConflictsForMember(memberId: string): RegistrationConflictMatch[] {
  const member = legacyClaim.findClaimingMember.get(memberId) as
    | { real_name: string }
    | undefined;
  if (!member) return [];
  return detectRegistrationConflicts(memberId, member.real_name);
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
  return classifyAutoLink(member.real_name, legacyMatch, member.birth_date, anchorSource, member.id);
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
        claimNeedsAnchor: !surnameMatchesWithAnchors(memberId, member.real_name, c.personName),
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
      // Display half only: the record identifiers stay in the service so the
      // card discloses nothing beyond the public handle it already renders.
      const records: RegistrationConflictRecord[] = detectRegistrationConflicts(
        memberId, member.real_name, CONFLICT_CARD_LIMIT,
      ).map((m) => ({ displayName: m.displayName, sourceLabel: m.sourceLabel }));
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
 * The date of birth the archive holds for one candidate.
 *
 * A historical record carries no date of its own. The only date the archive
 * holds for one is on the legacy account it is back-linked to, so a record with
 * no such link has none, and roughly a third of the accounts that do exist carry
 * no date either. Absence is ordinary here and never counts against anyone.
 */
function candidateBirthDate(personId: string): string | null {
  const hp = legacyClaim.findHistoricalPersonById.get(personId) as
    | HistoricalPersonClaimRow | undefined;
  if (!hp?.legacy_member_id) return null;
  const lm = legacyMembers.findByLegacyMemberId.get(hp.legacy_member_id) as
    | LegacyMemberRow | undefined;
  return lm?.birth_date ?? null;
}

/** Whether the member's date and this candidate's own date agree. */
function birthDateCorroborates(memberBirthDate: string | null, personId: string): boolean {
  if (!memberBirthDate) return false;
  const theirs = candidateBirthDate(personId);
  return theirs !== null && compareBirthDates(memberBirthDate, theirs) === 'identical';
}

/**
 * The one tied candidate whose own date of birth matches the member's.
 *
 * This is what disambiguation actually means. Comparing the member's date
 * against the single legacy account they were found through cannot separate
 * candidates from one another, because that one date says the same thing about
 * every one of them; only each candidate's own date can tell them apart.
 *
 * Null unless exactly one agrees. Several agreeing is no narrower than none, and
 * a candidate that disagrees is not ruled out, merely not corroborated: an
 * archived record carries whatever date the old site happened to hold.
 */
function narrowTiedCandidatesByBirthDate<T extends { personId: string }>(
  candidates: readonly T[],
  memberBirthDate: string | null,
): T | null {
  if (!memberBirthDate) return null;
  const agreeing = candidates.filter((c) => birthDateCorroborates(memberBirthDate, c.personId));
  return agreeing.length === 1 ? agreeing[0] : null;
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
  memberId: string | null = null,
): AutoLinkClassification {
  // The classifier and the claim gate must agree on the surname, or the wizard
  // sends a member to an endpoint that then refuses them and records a
  // forensic row against them. Both read the recorded family name where there
  // is one; both fall back to the last word of the full name where there is not.
  const memberSurname = memberId
    ? memberSurnameKeyFor(memberId, realName)
    : surnameKey(realName ?? '');
  const surnamesAgree = (personName: string | null): boolean =>
    surnameKeyMatchesName(memberSurname, personName);
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
    // Birth-date disambiguation among tied same-name candidates. Only agreement
    // narrows a tie: a date that does not match simply fails to corroborate, so
    // the tie stays low and the member is never auto-sent to a candidate the
    // date argues against. Failing to narrow costs the member nothing, because
    // the email-anchored legacy card is offered on its own and is how a tied
    // member links either way; narrowing only adds a one-click confirmation
    // alongside it.
    //
    // Each candidate is compared on its own date first, which is the only
    // comparison that can tell them apart. Where that does not settle it, the
    // older test still applies: the member's date agreeing with the account they
    // were found through, with provenance picking the person.
    const narrowed =
      narrowTiedCandidatesByBirthDate(candidates, memberBirthDate)
      ?? (memberBirthDate && legacyMatch.birthDate
        && compareBirthDates(memberBirthDate, legacyMatch.birthDate) === 'identical'
        ? candidates.find((c) => c.personId === hpProvenance.person_id) ?? null
        : null);
    if (!narrowed) {
      return { confidence: 'low', reason: 'multiple_name_candidates' };
    }
    if (!surnamesAgree(narrowed.personName)) {
      return { confidence: 'low', reason: 'hp_mismatch' };
    }
    return classifyNarrowedCandidate(narrowed, anchorSource, memberBirthDate);
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
  if (!surnamesAgree(candidate.personName)) {
    return { confidence: 'low', reason: 'hp_mismatch' };
  }

  return classifyNarrowedCandidate(candidate, anchorSource, memberBirthDate);
}

/**
 * The confidence one settled candidate earns.
 *
 * An exact name match is high on its own. A name-variant match is medium unless
 * the member's date of birth agrees with the candidate's, which is the strongest
 * signal the platform holds and is documented as corroborating a claim, not
 * merely separating tied ones. Discarding that agreement left a variant match
 * weak while the best evidence available said it was right.
 *
 * Nothing here moves downward. A date that does not agree, or that neither side
 * carries, leaves the confidence exactly where the name put it.
 */
function classifyNarrowedCandidate(
  candidate: { personId: string; personName: string; matchKind: string; matchedVariantNormalized?: string },
  anchorSource: AutoLinkAnchorSource,
  memberBirthDate: string | null,
): AutoLinkClassification {
  if (candidate.matchKind === 'exact') {
    return {
      confidence: 'high',
      personId: candidate.personId,
      personName: candidate.personName,
      anchorSource,
    };
  }
  if (birthDateCorroborates(memberBirthDate, candidate.personId)) {
    return {
      confidence: 'high',
      personId: candidate.personId,
      personName: candidate.personName,
      anchorSource,
      matchedVariantNormalized: candidate.matchedVariantNormalized ?? '',
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
// Shown wherever a claim is refused because the name did not reconcile. It
// names the two remedies rather than the failure, because both are self-serve,
// both live in the claim step, and both re-run the match the moment they are
// saved. It names no administrator: this refusal reaches registrants who are
// not yet members, and the contact form is a member-only surface.
const SURNAME_MISMATCH_MESSAGE =
  'Your name does not match this record. If you used a different surname before, '
  + 'or a different email address on the old footbag.org, add either one in the claim step '
  + 'and we will look again.';

/**
 * The member's date of birth against the date reachable for a historical
 * record. A historical person carries no date of its own; the only date the
 * archive holds for one is on the legacy account it is back-linked to, so a
 * record with no such link has nothing to compare and says so rather than
 * reporting a mismatch.
 */
function compareDobToHistoricalPerson(
  memberBirthDate: string | null,
  hp: HistoricalPersonClaimRow,
): RecordedBirthDateComparison {
  if (!hp.legacy_member_id) return 'no_legacy_account';
  const lm = legacyMembers.findByLegacyMemberId.get(hp.legacy_member_id) as
    | LegacyMemberRow
    | undefined;
  if (!lm) return 'no_legacy_account';
  return memberBirthDate && lm.birth_date
    ? compareBirthDates(memberBirthDate, lm.birth_date)
    : memberBirthDate
      ? 'legacy_dob_absent'
      : lm.birth_date
        ? 'member_dob_absent'
        : 'both_dob_absent';
}

/**
 * A self-serve claim refused because the name did not reconcile.
 *
 * The refusal is recorded; what it is recorded AS depends on the evidence
 * standing beside it. A surname that does not match is not on its own grounds
 * to treat a member as an impostor. Names change on marriage, an archived
 * record carries whatever partial or stale name the old site held, and an
 * honest mistake is indistinguishable from an attempt when the name is all you
 * look at. So the row carries the date-of-birth comparison and an assessment
 * derived from it, and only a date that actively contradicts the claim is
 * recorded as evidence against the member:
 *
 *   contradicted - the dates disagree. The one case with real evidence in it.
 *   corroborated - the dates match exactly. Reads as a name change or a stale
 *                  record name, and is the member's cue to declare a former
 *                  surname or an old email so the match can be found.
 *   unevidenced  - one side or both carry no date, so nothing is settled
 *                  either way. Trusting the member is the default here.
 *
 * Callers write this AFTER any rollback, so it survives the failed claim.
 */
function recordHistoricalPersonClaimBlocked(memberId: string, err: SurnameMismatchError): void {
  const member = legacyClaim.findClaimingMember.get(memberId) as ClaimingMemberRow | undefined;
  const hp = legacyClaim.findHistoricalPersonById.get(err.personId) as
    | HistoricalPersonClaimRow
    | undefined;
  const dobComparison = hp
    ? compareDobToHistoricalPerson(member?.birth_date ?? null, hp)
    : 'no_legacy_account';
  const assessment =
    dobComparison === 'mismatch' ? 'contradicted'
      : dobComparison === 'identical' ? 'corroborated'
        : 'unevidenced';
  appendAuditEntry({
    actionType:    'claim.historical_person_blocked',
    category:      'identity',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'member',
    entityId:      memberId,
    reasonText:    null,
    metadata: {
      person_id:      err.personId,
      person_name:    err.personName,
      reason:         'surname_mismatch',
      dob_comparison: dobComparison,
      assessment,
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

const EVIDENCE_STRENGTHS: ReadonlySet<string> = new Set<EvidenceStrength>([
  'declared_anchor_only',
  'currently_controls_modern_email_matching_legacy',
  'mailbox_control_via_link_click',
  'admin_vetted_evidence',
]);

/**
 * Narrow a stored tier back to the vocabulary, falling to the floor for anything
 * unrecognised.
 *
 * The floor is the safe direction: the tier is read when a disputed claim is
 * judged, and understating evidence asks an administrator to look harder, while
 * overstating it would tell them a claim was better proven than it was.
 */
export function readEvidenceStrength(raw: string | null | undefined): EvidenceStrength {
  return raw && EVIDENCE_STRENGTHS.has(raw) ? raw as EvidenceStrength : 'declared_anchor_only';
}

/** How strong each tier is, in words an administrator can act on. */
const EVIDENCE_STRENGTH_LABELS: Record<EvidenceStrength, string> = {
  declared_anchor_only:
    'Name only. The member asserted this identity and nothing else was proven.',
  currently_controls_modern_email_matching_legacy:
    'Controls the verified sign-in address that matches the old account.',
  mailbox_control_via_link_click:
    'Opened a link sent to the old address, so they can still read that mailbox.',
  admin_vetted_evidence:
    'An administrator vetted the evidence and applied this link by hand.',
};

/** What the date comparison actually established, stated plainly. */
const DOB_COMPARISON_LABELS: Record<RecordedBirthDateComparison, string> = {
  identical:         'Date of birth matches the record.',
  mismatch:          'Date of birth does not match the record.',
  legacy_dob_absent: 'The old account carries no date of birth, so there was nothing to compare.',
  member_dob_absent: 'The member had no date of birth on file at the time.',
  both_dob_absent:   'Neither side carries a date of birth.',
  no_legacy_account: 'The record has no linked old account, so the archive holds no date for it.',
};

const CLAIM_OUTCOME_LABELS: Record<string, string> = {
  'claim.legacy_account':            'Linked an old footbag.org account',
  'claim.historical_person':         'Linked a competition record',
  'claim.historical_person_blocked': 'Refused: the surname did not match',
};

export interface ClaimEvidenceAttempt {
  whenDisplay: string;
  outcomeLabel: string;
  /** The record the attempt was aimed at, as far as the ledger names it. */
  targetLabel: string | null;
  comparisonLabel: string;
  /** Null on a refused attempt, which records no tier because nothing linked. */
  evidenceLabel: string | null;
  /** True where the date actively contradicted the claim. */
  isContradicted: boolean;
  /** The date the archive holds for this attempt's record, where it holds one. */
  recordBirthDate: string | null;
}

export interface ClaimEvidence {
  attempts: ClaimEvidenceAttempt[];
  /** The member's own date, which is what every comparison here was against. */
  memberBirthDate: string | null;
}

/**
 * The evidence standing behind a member's claim attempts, for an administrator
 * adjudicating a doubtful or disputed link.
 *
 * Read from the audit ledger because that is the only place it survives: a claim
 * may since have been reverted, and a refused attempt writes no other row. The
 * block states what each attempt established rather than printing raw codes,
 * because the administrator is being asked to weigh it, not to decode it.
 *
 * The dates themselves are shown alongside the verdict. An administrator
 * adjudicating an identity may see a member's date of birth, and a verdict the
 * platform computed cannot answer the question a doubtful claim actually asks,
 * which is whether that computation can be trusted. Reading this surface is
 * ordinary administrative work and is not recorded; only what the platform does
 * to a member's record is.
 */
function getClaimEvidenceForMember(memberId: string): ClaimEvidence {
  const rows = auditEntries.listClaimEvidenceForMember.all(memberId) as Array<{
    occurred_at: string;
    action_type: string;
    metadata_json: string | null;
  }>;
  const attempts = rows.map((r) => {
    let meta: Record<string, unknown> = {};
    try {
      meta = r.metadata_json ? JSON.parse(r.metadata_json) as Record<string, unknown> : {};
    } catch {
      // A row whose metadata will not parse still says an attempt happened, and
      // that is worth showing; the detail is simply unavailable for it.
    }
    const comparison = typeof meta.dob_comparison === 'string'
      ? meta.dob_comparison as RecordedBirthDateComparison
      : null;
    const evidence = typeof meta.evidence_strength === 'string'
      ? readEvidenceStrength(meta.evidence_strength)
      : null;
    const target = typeof meta.person_name === 'string'
      ? meta.person_name
      : typeof meta.legacy_member_id === 'string'
        ? meta.legacy_member_id
        : typeof meta.person_id === 'string'
          ? meta.person_id
          : null;
    return {
      whenDisplay: formatDateForDisplay(r.occurred_at),
      outcomeLabel: CLAIM_OUTCOME_LABELS[r.action_type] ?? r.action_type,
      targetLabel: target,
      comparisonLabel: comparison
        ? DOB_COMPARISON_LABELS[comparison] ?? 'The date comparison was not recorded.'
        : 'The date comparison was not recorded.',
      evidenceLabel: evidence ? EVIDENCE_STRENGTH_LABELS[evidence] : null,
      isContradicted: comparison === 'mismatch',
      recordBirthDate: typeof meta.person_id === 'string'
        ? candidateBirthDate(meta.person_id)
        : null,
    };
  });
  const member = account.findBirthDateById.get(memberId) as
    { birth_date: string | null } | undefined;
  return { attempts, memberBirthDate: member?.birth_date ?? null };
}


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
  const dobComparison: RecordedBirthDateComparison =
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

  const hp = legacyClaim.findHistoricalPersonByLegacyId.get(row.legacy_member_id) as HistoricalPersonClaimRow | undefined;

  // A historical record marked deceased is not self-claimable, and claiming this
  // legacy account would take it: the merge below sets members.historical_person_id
  // and folds the record's honors into the tier grant, which is exactly what the
  // direct historical-record claim refuses. Fail the whole claim rather than
  // completing it without the link, so the two paths cannot end up disagreeing
  // about who holds the record. Same uniform unavailable wording as the other
  // exits here, so claim status stays non-enumerable. An administrator who
  // flagged a record in error clears the flag and the claim then proceeds.
  if (hp?.is_deceased) {
    throw new ValidationError('The legacy record is no longer available for claim.');
  }

  // Merge precedence: the member's own answer beats every import, and the
  // curated historical record beats the legacy dump. Both merge statements are
  // fill-if-empty, so the ladder is enforced by write order: the curated
  // historical fields land BEFORE the legacy transfer, and a column the member
  // already filled is never touched by either.
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
      normalizeImportedLocation({ city: null, region: null, country: hp.country }).country,
      hp.hof_member,
      hp.bap_member,
      hp.hof_induction_year,
      hp.first_year,
      now,
      requestingMemberId,
    );
  }

  // The legacy record's location is held to the same rules the member's own
  // forms apply, except that nothing here refuses: a value that will not
  // normalise is dropped and the member supplies it on the personal-details
  // step, because a typo in twenty-year-old data must never fail a claim.
  const legacyLocation = normalizeImportedLocation({
    city: row.city, region: row.region, country: row.country,
  });

  legacyClaim.transferLegacyFields.run(
    row.legacy_member_id,
    row.legacy_user_id,
    row.legacy_email,
    row.bio ?? '',
    row.birth_date,
    legacyLocation.city,
    legacyLocation.region,
    legacyLocation.country,
    row.ifpa_join_date,
    row.is_hof,
    row.is_bap,
    row.first_competition_year,
    now,
    requestingMemberId,
  );

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
 * Resolves every open staged candidate the other way, inside the caller's
 * transaction: the wizard's continue-without-linking control is an explicit
 * attestation that the member never held an old-site account, which decides
 * every card the platform staged for them. Without this the claim task can
 * complete with a card still open, and the completed task keeps rendering
 * while open candidates remain, so a member who just said they never had an
 * old account is still shown records that might be them.
 *
 * Writes the same terminal decline the per-card control writes, so the stager
 * never re-offers the pair; the attestation is recorded in the audit metadata
 * to distinguish it from a card-by-card decline. Returns the number resolved.
 */
function declineOpenStagedCandidatesOnAttestationInTx(memberId: string): number {
  const open = autoLinkStagedCandidates.listOpenByMember.all(memberId) as AutoLinkStagedCandidateRow[];
  const now = new Date().toISOString();
  let declined = 0;
  for (const row of open) {
    const res = autoLinkStagedCandidates.resolveById.run('declined', now, now, memberId, row.id);
    if (res.changes === 0) continue;
    declined += 1;
    appendAuditEntry({
      actionType:    row.source_pass === 'cross_source'
        ? 'legacy.cross_source_candidate_declined'
        : 'legacy.auto_link_candidate_declined',
      category:      'identity',
      actorType:     'member',
      actorMemberId: memberId,
      entityType:    'member',
      entityId:      memberId,
      reasonText:    'Member attested to never having held an account on the old site.',
      metadata: {
        candidate_id:         row.id,
        legacy_member_id:     row.legacy_member_id,
        historical_person_id: row.historical_person_id,
        confidence:           row.confidence,
        declined_via:         'no_old_account_attestation',
      },
    });
  }
  return declined;
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
 * Throttle the direct historical-person claim. Covers both entry points, the
 * identifier lookup that renders the claim page and the confirm step that
 * executes it, because either one scripted across many person ids is the abuse
 * this exists to stop. Per-member and per-IP buckets, each throwing
 * RateLimitedError so the controller maps to HTTP 429. The two entry points
 * share the buckets deliberately: the pair is one claim attempt.
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

  if (!row) {
    // Reach the same token-generation work the match branch performs below, so
    // the response time does not leak whether the identifier resolved to a row.
    burnTokenIssuanceTiming();
    return { kind: 'no_match' };
  }

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
  if (!row.legacy_email) {
    // Equalize against the token-issuing branch below for the same reason: a row
    // with no deliverable address must not be distinguishable by response time
    // from one that got a claim email.
    burnTokenIssuanceTiming();
    return { kind: 'no_match' };
  }

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
  ip: string,
): HistoricalPersonClaimLookupResult | null {
  // Throttle before anything is read, so the limit is spent identically whether
  // or not the record exists and cannot be probed around by picking ids that
  // miss. The controller supplies the request-derived key input only.
  enforceHistoricalPersonClaimLimit(requestingMemberId, ip);

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
  // surname or any declared former surname must match. Mismatch refuses the
  // claim; callers should not render the confirm page.
  if (!surnameMatchesWithAnchors(requestingMemberId, member.real_name, hp.person_name)) {
    // Nothing is recorded here. This runs on a bare page view, and opening a
    // record is not an attempt at anything: a member who follows a link, or a
    // card the platform itself offered, would otherwise collect a permanent
    // refusal row for looking. Only an attempted confirmation writes one, and
    // those paths record it after their rollback.
    //
    // The message names the two things that actually resolve a name that does
    // not line up, because both already exist in the claim step and both
    // re-run the match on save. It names no administrator: this refusal
    // reaches registrants who are not yet members, for whom the contact form
    // is unreachable, and the remedies here are self-serve anyway.
    throw new ValidationError(SURNAME_MISMATCH_MESSAGE);
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
 * Every production caller already holds a transaction and uses this form. The
 * `claimHistoricalPerson` wrapper below opens one, and is what a caller outside
 * a transaction uses; today that is the test suite.
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
    // refusal AFTER the rollback via recordHistoricalPersonClaimBlocked, which
    // is also where it is classified on the evidence standing beside the name.
    throw new SurnameMismatchError(
      SURNAME_MISMATCH_MESSAGE,
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

  // Birth-date evidence, mirroring the legacy-account claim path: when this
  // historical record resolves through to a legacy account carrying a birth
  // date, compare it against the member's own date and record the outcome in
  // the claim audit metadata below. A direct claim with no legacy account
  // behind it has no legacy date to compare. The outcome is evidence for
  // reconstructing a disputed link later; it is never routed to anyone.
  let dobComparison: RecordedBirthDateComparison = 'no_legacy_account';
  // Set when the transitive legacy claim should also transfer the legacy
  // profile fields; the transfer itself runs after the historical-person merge
  // so the curated source keeps precedence over the legacy dump.
  let transitiveLegacyRow: LegacyMemberRow | null = null;

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
        transitiveLegacyRow = lm;
      }
    } else if (lm && lm.claimed_by_member_id && lm.claimed_by_member_id !== requestingMemberId) {
      throw new ValidationError(
        'The legacy account tied to this historical record has already been claimed by another member.',
      );
    }
  }

  // Set the member↔HP link. Partial UNIQUE index enforces one live member per HP.
  legacyMembers.setMemberHistoricalPersonId.run(hp.person_id, now, requestingMemberId);

  // Merge precedence: the member's own answer beats every import, and the
  // curated historical record beats the legacy dump. Both merge statements are
  // fill-if-empty, so WITHIN this transaction the ladder is enforced by write
  // order: the curated historical fields (country / HoF / BAP /
  // hof_inducted_year / first_competition_year) land BEFORE the transitive
  // legacy transfer. Write order settles nothing ACROSS transactions, which is
  // what the re-assert below is for.
  const curatedCountry =
    normalizeImportedLocation({ city: null, region: null, country: hp.country }).country;
  legacyClaim.mergeHistoricalPersonFields.run(
    curatedCountry,
    hp.hof_member,
    hp.bap_member,
    hp.hof_induction_year,
    hp.first_year,
    now,
    requestingMemberId,
  );

  // The member linked a legacy account in an earlier transaction, so the
  // columns the two sources share are already filled from the dump and the
  // fill-if-empty merge above could not reach them. Put the curated record back
  // on top of exactly what the dump wrote, and nothing else.
  if (member.legacy_member_id) {
    const priorLegacy = legacyMembers.findByLegacyMemberId.get(member.legacy_member_id) as
      | LegacyMemberRow
      | undefined;
    if (priorLegacy) {
      const priorLocation = normalizeImportedLocation({
        city: priorLegacy.city, region: priorLegacy.region, country: priorLegacy.country,
      });
      legacyClaim.reassertCuratedOverLegacyFields.run(
        curatedCountry, priorLocation.country, curatedCountry,
        hp.first_year, priorLegacy.first_competition_year, hp.first_year,
        now, requestingMemberId,
      );
    }
  }

  if (transitiveLegacyRow) {
    const transitiveLocation = normalizeImportedLocation({
      city:    transitiveLegacyRow.city,
      region:  transitiveLegacyRow.region,
      country: transitiveLegacyRow.country,
    });
    legacyClaim.transferLegacyFields.run(
      transitiveLegacyRow.legacy_member_id,
      transitiveLegacyRow.legacy_user_id,
      transitiveLegacyRow.legacy_email,
      transitiveLegacyRow.bio ?? '',
      transitiveLegacyRow.birth_date,
      transitiveLocation.city,
      transitiveLocation.region,
      transitiveLocation.country,
      transitiveLegacyRow.ifpa_join_date,
      transitiveLegacyRow.is_hof,
      transitiveLegacyRow.is_bap,
      transitiveLegacyRow.first_competition_year,
      now,
      requestingMemberId,
    );
  }

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

// A claim revert clears every field that still matches what the claim copied
// in, and city, country and date of birth are fields the personal-details step
// requires. A member who happened to type the same city as their linked record
// therefore loses it on a revert, while the step stays completed: nothing
// re-asks them, and the Official IFPA Roster export carries the blank. Putting
// the step back in front of them is the honest repair -- the same posture the
// platform takes elsewhere with unresolved legacy residue, which is labelled
// and re-asked rather than quietly carried.
//
// Runs inside the revert transaction, so the task state and the scrub commit
// together.
function reopenPersonalDetailsIfIncomplete(
  memberId: string,
  now: string,
  actorMemberId: string,
): void {
  const row = account.findPersonalDetails.get(memberId) as
    | { city: string | null; country: string | null; birth_date: string | null }
    | undefined;
  if (!row) return;
  const incomplete = !row.city || !row.country || !row.birth_date;
  if (!incomplete) return;
  memberOnboarding.reopenCompletedTask.run(now, actorMemberId, memberId, 'personal_details');
}

/**
 * The claim with its own transaction, for a caller that does not already hold
 * one, and the recorder of a surname refusal.
 *
 * The refusal row is written here rather than inside the transaction on purpose:
 * an audit row appended in there would roll back with the claim it is meant to
 * record, so the attempt would leave no trace at all.
 */
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
  /**
   * Session JWT carrying the new password_version, signed before the version
   * bump committed. The caller sets it as the session cookie; until it does,
   * the member's browser holds a token the bump has just invalidated.
   */
  sessionJwt: string;
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
  const newPasswordVersion = row.password_version + 1;

  const member = auth.findMemberForSessionAfterVerify.get(memberId) as
    | { login_email: string | null; is_admin: number }
    | undefined;

  // Every step that can fail on something outside this database runs BEFORE the
  // version bump, because the bump is the one action that cannot be undone from
  // the member's side: it invalidates the session in the browser they are using.
  // Signing the replacement token first means a signing outage ends the request
  // with nothing changed and the member still logged in, instead of committing a
  // change whose replacement session can no longer be minted. The token stays in
  // this process until the commit succeeds, so nothing outside ever sees a token
  // for a version the database does not hold.
  let sessionJwt: string;
  try {
    sessionJwt = await createSessionJwt(
      memberId,
      member?.is_admin ? 'admin' : 'member',
      newPasswordVersion,
    );
  } catch (err) {
    // Operator-actionable and alarmed: signing is a hard dependency, so a
    // policy regression or key problem here blocks every password change on the
    // platform. The production alarm counts error-level lines, so this must not
    // be softened to a warning.
    logger.error('password change abandoned: session signing unavailable', {
      memberId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new ServiceUnavailableError(
      'We could not complete the password change. Your password was not changed. Please try again.',
    );
  }

  const now = new Date().toISOString();
  // The bump (which invalidates every other session), its audit row, and the
  // confirmation email all commit together or not at all. The email is enqueued
  // into the outbox, which is a row in this same database, so it belongs inside
  // the transaction; the delivery attempt to the mail provider happens later in
  // the drain worker, outside any request. Keeping the three together removes
  // the failure mode where the password changed but the member was never told.
  const committed = transaction(() => {
    const update = auth.updateMemberPassword.run(
      newHash,
      now,
      now,
      memberId,
      row.password_version,
    );
    // The version moved between the read above and this write, so another
    // password change for this member won the race and the token signed above
    // is already stale. Change nothing and let the member retry.
    if (update.changes !== 1) return false;

    appendAuditEntry({
      actionType: 'auth.password_change',
      category: 'auth',
      actorType: 'member',
      actorMemberId: memberId,
      entityType: 'member',
      entityId: memberId,
    });

    // Strict enqueue: a silently dropped password-change notification is itself
    // a security signal, because an account takeover paired with a degraded
    // email path would leave the legitimate owner unaware. Strict means a failed
    // enqueue throws, which rolls this whole transaction back, so the password
    // cannot change on the strength of a notification the outbox refused.
    //
    // Suppression is the case that does not raise: an operator can disable this
    // notification's template, and the send then returns without sending. That
    // leaves the password changed and nobody told, which is the state someone
    // using a stolen session wants, so it leaves a forensic row and an operator
    // alert in the same transaction as the change itself rather than passing as
    // an ordinary change.
    if (!member?.login_email) {
      // Not defensive: the schema permits a null address only on an account
      // whose personal data is purged, and such an account has no password hash
      // to authenticate the change that got us here.
      throw new Error(
        'password change reached notification with no recipient address; schema invariant violated',
      );
    }
    const sent = emailService.send({
      template: 'password_changed',
      params: {},
      recipientEmail: member.login_email,
      recipientMemberId: memberId,
      // No token row for password-change notifications; use the new
      // password_version as the per-event key so re-emit on worker
      // restart between SES-send and outbox-mark-sent collapses to the
      // same outbox row.
      idempotencyKey: `pwchange:${memberId}:${newPasswordVersion}`,
      strict: true,
    });

    if (sent.status === 'suppressed') {
      recordOperationalError({
        actionType: 'auth.password_change_notification_failed',
        category: 'auth',
        entityType: 'member',
        entityId: memberId,
        reasonText:
          'Password changed but its confirmation email is suppressed, so the member was not told.',
        cause: 'password_changed template disabled',
        metadata: { newPasswordVersion },
      });
    }
    return true;
  });

  if (!committed) {
    throw new ConflictError(
      'Your password was changed from another session. Please sign in again and retry.',
    );
  }

  return { memberId, newPasswordVersion, sessionJwt };
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

    // The row was read inside this same transaction, so the version it carries
    // is the version the write conditions on and cannot have moved underneath.
    // Checked anyway, because the failure it guards against is silent and bad:
    // the token is already spent by the line above, so a write that matched
    // nothing would tell the member their reset succeeded while leaving the old
    // password in place and the single-use link burned.
    const reset = auth.updateMemberPassword.run(
      newHash,
      now,
      now,
      consumed.memberId,
      member.password_version,
    );
    if (reset.changes !== 1) {
      throw new Error(
        'password reset matched no row: password_version moved inside the transaction',
      );
    }

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
          claimNeedsAnchor: !surnameMatchesWithAnchors(memberId, null, hp.person_name),
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
          claimNeedsAnchor: !surnameMatchesWithAnchors(memberId, null, c.personName),
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
/**
 * `disputedHistoricalPersonId` names a historical record an administrator is
 * stripping on an upheld dispute. Without it the historical link clears only
 * where it traces to the legacy account being reverted, so a member holding a
 * legacy account and a separate historical record would keep the very record
 * under dispute while losing the other one -- the revert would report success
 * having undone nothing the dispute was about. Naming it here clears it whatever
 * its provenance.
 */
function revertAutoLinkInTx(
  memberId: string,
  originalClaimAuditId: string,
  actor: RevertAutoLinkActor,
  disputedHistoricalPersonId?: string | null,
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
      if (disputedHistoricalPersonId && member.historical_person_id === disputedHistoricalPersonId) {
        clearedHp = true;
      } else if (legacyMemberId === null) {
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
        // The scrub clears a field only where it still equals what the claim
        // copied in, so it must be handed the values the merge actually wrote,
        // not the raw ones it read. Comparing against the raw spelling after
        // the merge stored a normalised one would match nothing and strand the
        // linked record's personal data on the member row.
        const claimedLocation = normalizeImportedLocation({
          city: legacyRow.city, region: legacyRow.region, country: legacyRow.country,
        });
        legacyMembers.scrubClaimedLegacyFields.run(
          legacyRow.legacy_user_id,
          legacyRow.legacy_email,
          legacyRow.bio ?? '',
          legacyRow.birth_date,
          legacyRow.street_address,
          legacyRow.postal_code,
          claimedLocation.city,
          claimedLocation.region,
          claimedLocation.country,
          legacyRow.ifpa_join_date,
          legacyRow.first_competition_year,
          now,
          actor.actorMemberId,
          memberId,
        );
        reopenPersonalDetailsIfIncomplete(memberId, now, actor.actorMemberId);
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
 *
 * The caller names the DISPUTED RECORD, not the member to strip: the holder is
 * derived from whoever currently claims that record. Two administrators' worth
 * of separation is enforced as well, since the requester cannot be the resolver.
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
  target: LinkHelpApproveTarget,
  reason: string,
): DisputeRevertResult {
  enforceWorkQueueResolveLimit(adminMemberId);
  const trimmed = reason.trim();
  if (!trimmed) {
    throw new ValidationError('A dispute reason is required.');
  }
  const legacyId = target.legacyMemberId?.trim() ?? '';
  const personId = target.historicalPersonId?.trim() ?? '';
  if ((legacyId && personId) || (!legacyId && !personId)) {
    throw new ValidationError(
      'Enter exactly one disputed record: a legacy account id or a historical person id.',
    );
  }
  const item = loadOpenLinkHelpItem(workQueueItemId);
  const payload = parseDisputeLinkHelpPayload(item.reason_text);
  if (!payload) {
    throw new ValidationError('That queue item is not a conflict dispute.');
  }
  // An administrator may not resolve their own dispute. Any authenticated member
  // can raise one, so without this an administrator manufactures the very item
  // that authorizes the revert.
  if (item.entity_id === adminMemberId) {
    throw new ValidationError(
      'You cannot resolve your own dispute. Another administrator must review it.',
    );
  }
  // The record must be one this dispute is actually ABOUT. Deriving the holder
  // from the record (below) stops the caller naming a member directly, but on
  // its own it still let an administrator name ANY claimed record while holding
  // any open dispute, so the reach was unchanged. The dispute records the
  // conflicting records at filing time; the revert may touch only those.
  const disputedIds = legacyId
    ? payload.disputed_legacy_member_ids
    : payload.disputed_historical_person_ids;
  if (!disputedIds.includes(legacyId || personId)) {
    throw new ValidationError(
      'That record is not one of the records this dispute is about.',
    );
  }
  // The member whose claim is reverted is DERIVED from the disputed record, never
  // supplied by the caller. Taking it from the request body bound the revert to
  // nothing but "some open dispute exists", which let one request strip the claim
  // of a member with no relationship to the dispute at all.
  const targetMemberId = legacyId
    ? ((legacyMembers.findByLegacyMemberId.get(legacyId) as
        | { claimed_by_member_id: string | null }
        | undefined)?.claimed_by_member_id ?? '')
    : ((legacyClaim.findMemberClaimingHp.get(personId) as
        | { id: string }
        | undefined)?.id ?? '');
  if (!targetMemberId) {
    // Nobody holds the disputed record: it was never claimed, was already
    // reverted, or is held by a deceased member whose link the contact scrub
    // deliberately preserves.
    return { status: 'nothing_to_revert' as const };
  }
  // The holder must be the one the dispute was filed against. Binding by record
  // alone lets a still-open second dispute naming the same record strip whoever
  // holds it now -- including the first dispute's filer, freshly linked by an
  // administrator who vetted them. An absent entry refuses, so a dispute filed
  // before this binding is re-filed rather than acted on blind.
  if (payload.disputed_record_holders[legacyId || personId] !== targetMemberId) {
    throw new ValidationError(
      'That record is no longer held by the member this dispute was filed against. '
      + 'Ask the member to file a fresh dispute so it names the current holder.',
    );
  }
  const originalClaim = legacyClaim.findLatestClaimAuditForMember.get(targetMemberId) as
    | { id: string }
    | undefined;
  return transaction(() => {
    const actor = { actorType: 'admin' as const, actorMemberId: adminMemberId };
    // The revert runs before either audit row is written. The database wrapper
    // commits whatever the callback did unless it throws, so appending the
    // dispute-opened row first would leave it committed on the branch below that
    // reverts nothing -- one orphan row per resubmitted form, in a ledger that
    // cannot be corrected.
    const reverted = revertAutoLinkInTx(
      targetMemberId, originalClaim?.id ?? 'unknown', actor, personId || null,
    );
    if (reverted.status === 'not_found') {
      throw new NotFoundError('Member not found.');
    }
    if (reverted.status === 'already_reverted') {
      return { status: 'nothing_to_revert' as const };
    }
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

/**
 * The dispute payload, or null when the item is not a conflict dispute.
 *
 * The disputed-record lists are read defensively: an item filed before this
 * binding existed carries neither list, and an absent list reads as empty,
 * which refuses every revert rather than falling back to the unbounded
 * behaviour the binding replaced.
 */
function parseDisputeLinkHelpPayload(reasonText: string | null): LinkHelpRequestPayload | null {
  if (!reasonText) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(reasonText) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (raw.is_dispute !== true) return null;
  const idList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  const holderMap = (v: unknown): Record<string, string> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'string' && val.length > 0) out[k] = val;
    }
    return out;
  };
  return {
    statement:               typeof raw.statement === 'string' ? raw.statement : '',
    is_dispute:              true,
    disputed_legacy_member_ids:     idList(raw.disputed_legacy_member_ids),
    disputed_historical_person_ids: idList(raw.disputed_historical_person_ids),
    disputed_record_holders:        holderMap(raw.disputed_record_holders),
  };
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
    throw new ValidationError('Choose whether you are adding a former surname or an old email address.');
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
      throw new ValidationError('You have already added that one.');
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
}

export interface LinkHelpRequestPayload {
  statement: string;
  is_dispute: boolean;
  /**
   * The records this dispute is ABOUT, detected server-side at filing time and
   * never accepted from the browser. The admin revert may strip a claim only on
   * a record named here: without it the revert was bound to nothing but "some
   * open dispute exists", which let one request reach a member with no
   * relationship to the dispute at all. Empty on a non-dispute request, and
   * empty on a dispute whose conflict set went away between render and submit,
   * which fails the revert closed rather than stranding the help request.
   */
  disputed_legacy_member_ids: string[];
  disputed_historical_person_ids: string[];
  /**
   * Who held each named record when the dispute was filed. The record binding
   * alone is by record, not by holder, so once a dispute is upheld and its
   * filer is linked onto the record, a second dispute still naming that record
   * would strip the newly vetted holder -- a member with no relationship to the
   * second grievance. A revert therefore also requires the holder to be the one
   * the dispute was filed against. An absent entry refuses the revert, the same
   * fail-closed direction the record lists take.
   */
  disputed_record_holders: Record<string, string>;
}

export type SubmitLinkHelpRequestResult =
  | { status: 'submitted'; workQueueItemId: string }
  | { status: 'already_open'; workQueueItemId: string };

/** Who holds each detected conflicting record right now, keyed by record id.
 *  A dispute is filed against the holder of the moment; recording them lets the
 *  later revert refuse a record whose holder has since changed. */
function disputedRecordHolders(matches: RegistrationConflictMatch[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of matches) {
    if (m.legacyMemberId) {
      const row = legacyMembers.findByLegacyMemberId.get(m.legacyMemberId) as
        | { claimed_by_member_id: string | null }
        | undefined;
      if (row?.claimed_by_member_id) out[m.legacyMemberId] = row.claimed_by_member_id;
    } else if (m.historicalPersonId) {
      const row = legacyClaim.findMemberClaimingHp.get(m.historicalPersonId) as
        | { id: string }
        | undefined;
      if (row?.id) out[m.historicalPersonId] = row.id;
    }
  }
  return out;
}

function submitLinkHelpRequest(
  memberId: string,
  input: LinkHelpRequestInput,
): SubmitLinkHelpRequestResult {
  // Membership is the gate on this one, not bare authentication, and it is
  // enforced at the route: an administrator answers on a member-only surface, so
  // a request filed by someone still signing up could never be answered. It is
  // not repeated here because reaching the onboarding service from this one
  // would close an import cycle.
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
  // One open request per member: a re-submit collapses onto the open item
  // rather than stacking queue rows, so the row already on file has to be read
  // before the replacement payload is built.
  const existing = workQueue.findOpenByEntity.get('member_link_help_request', 'member', memberId) as
    | { id: string }
    | undefined;
  const prior = existing
    ? workQueue.findById.get(existing.id) as { reason_text: string | null } | undefined
    : undefined;
  const priorWasDispute = parseDisputeLinkHelpPayload(prior?.reason_text ?? null) !== null;

  // Whether this is a dispute is read off the records, never off the form: a
  // request is a dispute when someone else already holds a record this member's
  // own anchors reach. The browser never gets to say which record a later admin
  // revert may strip, and the member never has to know to declare it.
  const detected = detectRegistrationConflictsForMember(memberId);
  // A member who has already disputed stays a disputant. Adding detail is not a
  // withdrawal, and treating it as one would blank the record set an
  // administrator's revert is bound to, leaving a dispute that can never be
  // resolved.
  const isDispute = detected.length > 0 || priorWasDispute;
  const disputed = isDispute ? detected : [];
  const payload: LinkHelpRequestPayload = {
    statement,
    is_dispute:              isDispute,
    disputed_legacy_member_ids:     disputed
      .map((m) => m.legacyMemberId).filter((v): v is string => v !== null),
    disputed_historical_person_ids: disputed
      .map((m) => m.historicalPersonId).filter((v): v is string => v !== null),
    disputed_record_holders:        disputedRecordHolders(disputed),
  };

  if (existing) {
    // The newer submission replaces the payload on the row the member already
    // has. Discarding it instead would silently lose whatever they came back to
    // add, and the replacement carries the dispute flag and its record set
    // forward, so nothing an administrator's revert is bound to is dropped.
    const nowIso = new Date().toISOString();
    transaction(() => {
      workQueue.updateOpenPayload.run(JSON.stringify(payload), nowIso, memberId, existing.id);
      appendAuditEntry({
        actionType:    'support.help_request_submitted',
        category:      'identity',
        actorType:     'member',
        actorMemberId: memberId,
        entityType:    'member',
        entityId:      memberId,
        reasonText:    null,
        metadata: {
          work_queue_item_id: existing.id,
          is_dispute:         payload.is_dispute,
        },
      });
      // The dispute pair records the transition, so a member re-filing an
      // already-open dispute does not stack another copy of it.
      if (payload.is_dispute && !priorWasDispute) {
        appendAuditEntry({
          actionType:    'claim.dispute_opened',
          category:      'identity',
          actorType:     'member',
          actorMemberId: memberId,
          entityType:    'member',
          entityId:      memberId,
          reasonText:    null,
          metadata: { work_queue_item_id: existing.id, source: 'registration_conflict_prompt' },
        });
        appendAuditEntry({
          actionType:    'legacy.registration_conflict_disputed',
          category:      'identity',
          actorType:     'member',
          actorMemberId: memberId,
          entityType:    'member',
          entityId:      memberId,
          reasonText:    null,
          metadata: { work_queue_item_id: existing.id },
        });
      }
    });
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
  // An administrator may not approve their own help request. This path links
  // with 'admin_vetted_evidence', which skips the surname gate on the grounds
  // that an administrator checked the identity against the record; that
  // reasoning collapses when the approver and the requester are one person,
  // leaving nothing at all between a member and an unclaimed record. Compromised
  // -admin is this file's stated threat model, so the role never self-serves.
  if (item.entity_id === adminMemberId) {
    throw new ValidationError(
      'You cannot approve your own help request. Another administrator must review it.',
    );
  }
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
      // The member's submitted payload stays out of the ledger. It carries their
      // identity statement in their own words, which can name an old address or
      // anyone they think will vouch for them, and this same transaction
      // overwrites the work-queue row that held the purgeable copy -- so
      // recording it here would leave the ledger holding the only copy of
      // personal data that erasure can never reach, and rendering it on the
      // audit page and in its exports. The ids below reconstruct what was
      // decided without it.
      metadata: {
        work_queue_item_id: workQueueItemId,
        ...(legacyId
          ? { legacy_member_id: legacyId }
          : { historical_person_id: personId }),
        evidence_strength:  'admin_vetted_evidence',
      },
    });
  });
  notifyLinkHelpResolved({
    adminMemberId,
    memberId:        item.entity_id,
    workQueueItemId,
    displayDecision: 'your records are now linked',
    note:            'Sign in and you will find them on your profile.',
  });
}

/**
 * Tell the member their identity-link request was answered.
 *
 * Submitting the contact form promises a reply, and every other category keeps
 * that promise when an administrator resolves it. This is the one category
 * answered by applying a link rather than by writing back, so without this the
 * member is told to expect an answer and hears nothing, whether their records
 * were linked or the request was refused.
 *
 * Enqueued after the resolve has committed: the decision stands whatever the
 * outbox does, and a lost notification surfaces to the administrator rather
 * than being dropped in silence.
 */
function notifyLinkHelpResolved(input: {
  adminMemberId: string;
  memberId: string;
  workQueueItemId: string;
  displayDecision: string;
  note: string;
}): void {
  const member = account.findContactInfoById.get(input.memberId) as
    | { id: string; display_name: string; login_email: string }
    | undefined;
  if (!member?.login_email) return;
  try {
    emailService.send({
      template: 'link_help_request_resolution',
      params: {
        memberName:      member.display_name,
        displayDecision: input.displayDecision,
        note:            input.note,
      },
      recipientEmail:    member.login_email,
      recipientMemberId: member.id,
      idempotencyKey:    `link-help-resolve:${input.workQueueItemId}`,
      strict:            true,
    });
  } catch (err) {
    recordOperationalError({
      actionType:    'support.help_request_resolve_notification_failed',
      category:      'support',
      actorType:     'admin',
      actorMemberId: input.adminMemberId,
      entityType:    'member',
      entityId:      member.id,
      reasonText:    'Link-help resolve committed but resolve-notification enqueue failed.',
      cause:         err,
      metadata:      { queue_item_id: input.workQueueItemId },
    });
    throw err;
  }
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
      // The rejection reason is the administrator's own account of the decision,
      // which the story requires the ledger to carry. The member's submitted
      // payload is not: see the approval path above for why it stays out.
      reasonText:    trimmed,
      metadata: {
        work_queue_item_id: workQueueItemId,
      },
    });
  });
  // The administrator's reason travels, the way the contact-request resolution
  // reply already carries its note: a refusal a member cannot see the reason for
  // leaves them with no way to answer it.
  notifyLinkHelpResolved({
    adminMemberId,
    memberId:        item.entity_id,
    workQueueItemId,
    displayDecision: 'no link was applied',
    note:            trimmed,
  });
}

export const identityAccessService = { attemptLogin, registerMember, lookupLegacyAccount, claimLegacyAccount, initiateLegacyClaim, peekLegacyClaim, consumeAndClaimLegacy, consumeAndClaimLegacyInTx, lookupHistoricalPersonForClaim, claimHistoricalPerson, claimHistoricalPersonInTx, recordHistoricalPersonClaimBlocked, changePassword, verifyEmailByToken, resendVerifyEmail, requestPasswordReset, completePasswordReset, getAutoLinkClassificationForMember, getLinkHistoryViewForWizard, findHistoricalPersonForLinkSubmit, revertAutoLink, revertClaimForDispute, stageAutoLinkCandidate, listOpenStagedCandidates, declineStagedCandidate, declineClassifierCandidate, declineOpenStagedCandidatesOnAttestationInTx, expireStagedCandidates, listClaimedLegacyIdentities, declareAnchor, listDeclaredAnchors, removeAnchor, requestAnchorMailboxVerification, consumeAnchorMailboxVerification, submitLinkHelpRequest, approveLinkHelpRequest, rejectLinkHelpRequest, findCrossSourceCandidateAfterHpClaim, findCrossSourceCandidateAfterLegacyClaim, offerCrossSourceCandidate, confirmCrossSourceLegacyCandidate, surnameMatchesWithAnchors, enforceHistoricalPersonClaimLimit, getClaimEvidenceForMember };
