/**
 * IdentityAccessService -- account entry and authentication.
 *
 * Owns:
 *   - Registration, email verification, credential check, password change/reset
 *   - The member name rules, and every write of a member's recorded legal name
 *     and display name: the registration write and an administrator's
 *     correction both reach them through one shared validator, so a correction
 *     cannot take a name registration would refuse
 *   - Legacy archive passthrough JWT
 *   - The claim step's writes, each deciding through LegacyMatchingService
 *     (which alone decides what a member's evidence reaches and what they may
 *     do with it) and writing nothing it did not decide:
 *       - The claim: the member's evidence is matched afresh inside the claim
 *         transaction before any write, and only a candidate that is claimable
 *         now is claimed, with the evidence tier the live match proves and the
 *         full evidence block on its audit row. An old account and the record
 *         the pipeline linked to it are claimed whole. A target already held by
 *         the member reports success and writes nothing.
 *       - The claim under a surname the member used before: the surname is
 *         recorded as a declared former surname and the candidate claimed, in
 *         one transaction.
 *       - The decline: a standing legacy_claim_declines row for a shown card;
 *         the matching never offers that candidate to the member again.
 *       - The record of a refused claim (after its rollback) and of a
 *         non-claiming answer, each with its evidence.
 *   - The claim step's view-model: the cards built from the matching's shown
 *     candidates, strongest first. Rendering writes nothing.
 *   - Direct historical-person claim transaction (first-name-variant warning on
 *     its confirmation page, which opens only where the matching makes the
 *     record claimable)
 *   - Declared identity anchors (former surnames / old emails): rate-limited,
 *     add-only, audited declaration. An old email address is a matching key
 *     only; the platform never mails it.
 *   - Date of birth is a matching key collected in the personal_details task
 *     (not declared here). An identical, non-placeholder date corroborates an
 *     old account; a date that does not match simply fails to corroborate and
 *     never counts against the member. Every claim records the comparison in
 *     its audit metadata, so a disputed link can be reconstructed from the
 *     ledger.
 *   - Registration-time conflict detection: a registrant whose surname
 *     matches an already-claimed record gets the prompted event and the
 *     wizard's "is one of these you?" card; the dispute affordance files a
 *     help request
 *   - Member link help requests: structured intake into the admin work
 *     queue (one open item per member); admin approve applies the link
 *     (exactly one target type: a legacy account or a historical-person
 *     record) with admin-vetted evidence and resolves the item atomically;
 *     admin-vetted evidence bypasses the self-serve surname gate, never the
 *     deceased or already-claimed integrity gates; reject records the reason.
 *     The approval is previewed before it is applied: the preview runs the same
 *     refusals in the same order and reports the two records about to be bound,
 *     so a mistyped opaque id is caught by the administrator reading a name
 *     rather than by a member finding somebody else's history on their profile
 *   - The two admin-facing reads behind that decision: everything the member
 *     did in the claim step (claims, declines, refusals, answers, anchor
 *     additions, reverts), uncapped, with names read live rather than from the
 *     ledger; and every candidate the matching reaches for them, hidden ones
 *     included with the reason they are hidden and who holds them, plus every
 *     address that reached more than one account. Reads only
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
 *     The forensic pair binds to the claim audit row that took the disputed
 *     record, and the revert clears a deceased flag the member's own deceased
 *     marking cascaded onto that record.
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
 *   - The surname rule binds every self-serve claim path, the legacy-account
 *     claim included: one of the member's possible surnames or a declared
 *     former surname must stand in the account's real name or the linked
 *     record's name. A matching email alone never suffices, because a family's
 *     shared address sits on one member's account. Only admin-vetted evidence
 *     stands in for it.
 *   - A name alone never makes an old account claimable: the account needs the
 *     member's email or an identical date of birth.
 *   - Every row a claim writes names who acted: the member on a self-serve
 *     claim, the approving administrator on an applied link.
 *   - No card offers a control that can only be refused: the cards are the
 *     matching's shown candidates and carry exactly the control the candidate's
 *     status allows. A held record still reaches the member through the
 *     registration conflict prompt.
 *   - No name, date of birth or raw address is written to the ledger by a
 *     claim-step write: records are named by id and addresses by a keyed hash.
 *   - A soft-deleted member is refused sign-in exactly as an unknown address is,
 *     inside the grace period and after it. The platform offers no restore: a
 *     member who deleted in error asks IFPA out of band, and an administrator
 *     acts on the record. Nothing here distinguishes the two, deliberately, so
 *     the login path cannot become a way to discover that an account once
 *     existed.
 *   - Every confirmed-claim audit row carries an evidence_strength tag, set by
 *     the live match and never by the confidence: the verified login email
 *     reaching the claimed account, otherwise the declared_anchor_only floor,
 *     or admin_vetted_evidence on an administrator's applied link.
 *   - Claim-merge source precedence: the member's own answer beats every
 *     import, and the curated historical_persons record beats the legacy
 *     footbag.org dump. Both merge statements are fill-if-empty, so the
 *     ladder is carried by write order on both claim paths: the historical
 *     merge always executes before the legacy transfer. Honors OR together
 *     (MAX) and are order-independent.
 *   - Auto-link revert is idempotent: a second revert returns
 *     `already_reverted` without state change.
 *   - No member is given a permanent public profile address that carries
 *     nothing of their name. The address must contain the recorded family
 *     name, folded on both sides to the letters and digits a URL can hold. A
 *     family name with no Latin form folds to nothing, so that rule cannot
 *     apply to it and any well-formed address is accepted instead; in exchange
 *     registration refuses a blank one from that member, because neither random
 *     characters nor a machine romanisation should become the permanent public
 *     spelling of somebody's name.
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
 *   - In-tx variants (claimLegacyAccountInTx, claimHistoricalPersonInTx) accept a
 *     caller-owned transaction so the wizard orchestrator can merge the claim and the
 *     member_onboarding_tasks row transition inside one transaction.
 *
 * Persistence:
 *   members, members_active, legacy_members, historical_persons (read for
 *   matching; written only by a claim revert clearing a deceased flag that the
 *   member's own deceased marking cascaded onto the record),
 *   account_tokens,
 *   audit_entries, outbox_emails, legacy_claim_declines (insert),
 *   member_declared_anchors (add-only; deleted wholesale on PII purge by
 *   MemberService), work_queue_items (link help requests: insert + resolve).
 *   Tier-grant writes delegated to MembershipTieringService.
 *
 * Side effects:
 *   - audit_entries append (auth, claim, claim refused, candidate declined,
 *     claim step answered, anchor declared, dev/staging admin allowlist grant,
 *     revert, dispute opened / revert applied, help request submitted /
 *     approved / rejected, registration conflict prompted / disputed,
 *     registration duplicate email)
 *   - outbox_emails enqueue (verification, account-exists notice on a duplicate
 *     registration, reset, password-change confirmation, resend,
 *     and the reply telling a
 *     member their link request was answered, which carries the decision and,
 *     on a refusal, the administrator's reason, and the notice telling a member
 *     an administrator corrected their recorded name or their profile address)
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
import { auth, registration, legacyClaim, legacyMembers, account, memberOnboarding, workQueue, declaredAnchors, legacyClaimDeclines, MemberAuthRow, LegacyMemberRow, AlreadyClaimedRow, HistoricalPersonClaimRow } from '../db/db';
import { legacyMatchingService, type Candidate, type Confidence } from './legacyMatchingService';
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
import { ConflictError, NotFoundError, RateLimitedError, ServiceUnavailableError, ValidationError } from './serviceErrors';
import { createSessionJwt } from './jwtService';
import { compareBirthDates, type RecordedBirthDateComparison } from '../lib/birthDate';
import { isUniqueConstraintError } from './sqliteRetry';
import { appendAuditEntry } from './auditService';
import { recordOperationalError } from './operationalErrors';
import {
  applyAutoLinkRevertGrantInTx, applyLegacyClaimGrantInTx, hasHonorGrant,
} from './membershipTieringService';
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
  assembleFullName, latinFold, matchReservedNameWord, memberSurnameKey,
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
    // Backstop only. Registration refuses a blank profile URL when the display
    // name carries no Latin letter, so a member whose name cannot produce a
    // readable address supplies their own rather than reaching this. An
    // unreadable address is permanent, so this is a last resort, never a
    // default anyone is given.
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
 * One card in the onboarding wizard's claim step at
 * `/register/wizard/legacy_claim`, built from one matching candidate: an old
 * account, a competition record, or an account and the record the pipeline
 * linked to it, presented as one.
 *
 * Every card has two answers. `cardKind` decides the first; "This Is Not Me"
 * posts to the decline route on every card:
 *  - `claim`: an old account (with its linked record, if any) the member's own
 *    evidence corroborates. Posts to the claim route.
 *  - `claim_record_page`: a competition record with no old account behind it.
 *    Links to its confirmation page.
 *  - `claim_with_surname`: reached by the member's evidence but carrying a
 *    different surname. Posts to the route that records that surname as a
 *    former surname and claims in one step.
 *  - `needs_admin`: an old account reached by name alone. No claim control;
 *    an administrator can link it after signing up.
 */
export interface LinkHistoryCandidate {
  cardKind: 'claim' | 'claim_record_page' | 'claim_with_surname' | 'needs_admin';
  /** Display copy: the name as it appears on the record, or the account. */
  displayName: string;
  /** How strong the match is and what found it. Never an anchor value. */
  provenanceLabel: string;
  /** The candidate's ids, posted back by the card's forms. */
  accountId: string | null;
  recordId: string | null;
  /** The surname the target carries, on a `claim_with_surname` card. */
  differingSurname: string | null;
  /** The confirmation page, on a `claim_record_page` card. */
  claimRecordHref: string | null;
  country: string | null;
  isHof: boolean;
  isBap: boolean;
  firstYear: number | null;
  /** Truncated bio from the old account. Null when there is none. */
  bioExcerpt: string | null;
  /** Club names from legacy_person_club_affiliations for this person. */
  clubAffiliations: string[];
  /** Events attended, newest first. */
  eventsAttended: Array<{ title: string; year: number }>;
}

/**
 * View-model for the onboarding wizard's claim step at
 * `/register/wizard/legacy_claim`: the cards the member's own evidence reaches,
 * strongest first, and the declared-anchor form. There is no search box: a
 * member reaches old records only through the matching the step runs on their
 * own evidence. Rendering writes nothing.
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
  /** The cards, in the matching order: claimable first, strongest first. */
  candidates: LinkHistoryCandidate[];
  /** True when the member's evidence reaches nothing the step can show. */
  lowConfidenceBanner: boolean;
  /**
   * The cards a non-claiming answer leaves unanswered, by name, so the
   * member sees what they are leaving before they give it. The answer
   * declines none of them.
   */
  unansweredCardNames: string[];
  /**
   * Inline message surfaced as a banner when a claim-step action returns a
   * validation_error. Threaded through by the controller; null/undefined
   * when no validation message applies.
   */
  validationMessage?: string;
  declaredAnchors?: DeclaredAnchorView[];
  /** Banner after an anchor add redirected back: confirms the save and the
   * match re-check without leaking whether anything matched. */
  anchorSavedNotice?: 'saved' | null;
  /** Same-name collision against already-claimed records; renders the
   * "is one of these you?" prompt with the dispute affordance. */
  conflictPrompt: { records: RegistrationConflictRecord[] } | null;
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
 * Attempt a login: rate-limit by normalized email + client IP, with a lockout
 * that outlasts the counting window once the ceiling is reached, then delegate
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
  // The lockout that follows the ceiling, which outlasts the window that counted
  // up to it. Without it the refusal lasts only the window's remainder, so an
  // attacker who exhausts the attempts late in a window waits seconds.
  const cooldownMinutes = readIntConfig('login_cooldown_minutes', 30);
  // Per (email, IP) bucket: throttles one attacker hammering one account.
  const rl = rateLimitHit(`login:${normalized}:${ip}`, maxAttempts, windowMinutes, cooldownMinutes);
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
function validateNameParts(givenNames: string, familyName: string, opts: NameRuleOptions): void {
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
  if (givenNames) assertSafeNameCharacters(givenNames, 'Given name', opts);
  if (familyName) assertSafeNameCharacters(familyName, 'Family name', opts);
  if (/\d/.test(assembled)) {
    throw new ValidationError('Your name must not contain digits.');
  }
  if (assembled.length < 2) {
    throw new ValidationError('Your name must be at least two characters.');
  }
}

/**
 * The names a member's record carries: the two recorded parts of the legal
 * name, those parts assembled, the display name, and the surname key both name
 * rules are held to.
 *
 * A blank display name falls back to the assembled legal name, which is what
 * lets a member who wants no separate public name simply leave it empty.
 */
export interface MemberNames {
  givenNames:  string;
  familyName:  string;
  realName:    string;
  displayName: string;
  surnameKey:  string;
}

/**
 * What differs between the accounts these name rules run for.
 *
 * The platform's own account carries the display name shown as the uploader
 * attribution on curated media. The reserved-word rule refuses a name that
 * asserts an official IFPA or site position its holder does not hold, and that
 * account is the one holder of the position, so it alone is lifted there. Every
 * other rule applies to that account unchanged.
 */
interface NameRuleOptions {
  isPlatformAccount: boolean;
}

/**
 * Trim, NFC-normalize and assemble a member's names into the shape the rules
 * and the write both read.
 *
 * Deriving the assembled legal name and the surname key here, rather than at
 * each call site, is what keeps a name written at registration and a name
 * written by an administrator correction from being held to different
 * standards: both reach the rules through this one shape.
 */
function normalizeMemberNames(
  givenNames: string,
  familyName: string,
  displayName: string,
): MemberNames {
  const trimmedGivenNames = givenNames.trim().normalize('NFC');
  const trimmedFamilyName = familyName.trim().normalize('NFC');
  const realName = assembleFullName(trimmedGivenNames, trimmedFamilyName);
  return {
    givenNames:  trimmedGivenNames,
    familyName:  trimmedFamilyName,
    realName,
    displayName: displayName.trim().normalize('NFC') || realName,
    // Both name rules key on the recorded family name rather than the last word
    // of the full name. A member whose only name is a given name is held to that
    // name, so neither rule becomes unsatisfiable for them.
    surnameKey: memberSurnameKey({
      family_name: trimmedFamilyName || null,
      given_names: trimmedGivenNames || null,
      real_name:   realName,
    }),
  };
}

/**
 * The complete rule set a member's names are held to, wherever they are
 * written. Registration and the administrator correction both run this, so a
 * correction can never take a name registration would refuse.
 *
 * A display name equal to the assembled legal name skips the surname rule
 * because it trivially satisfies it.
 */
function validateMemberNames(names: MemberNames, opts: NameRuleOptions): void {
  validateNameParts(names.givenNames, names.familyName, opts);
  if (names.displayName.length < MIN_DISPLAY_NAME) {
    throw new ValidationError(`Display name must be at least ${MIN_DISPLAY_NAME} characters.`);
  }
  if (names.displayName.length > MAX_DISPLAY_NAME) {
    throw new ValidationError(`Display name must be ${MAX_DISPLAY_NAME} characters or fewer.`);
  }
  assertSafeNameCharacters(names.displayName, 'Display name', opts);
  if (names.displayName !== names.realName) {
    validateDisplayNameSurname(names.displayName, names.surnameKey);
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
function assertSafeNameCharacters(name: string, label: string, opts: NameRuleOptions): void {
  if (!opts.isPlatformAccount && matchReservedNameWord(name)) {
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

function validateSlug(
  slug: string,
  registrantSurnameKey: string,
  opts: NameRuleOptions = { isPlatformAccount: false },
): void {
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
  // from the already-checked display name and never reaches this. The platform's
  // own account is lifted from this rule for the same reason its name is: the
  // rule refuses a claim to a position its holder does not hold, and that
  // account holds it.
  if (!opts.isPlatformAccount && matchReservedNameWord(slug)) {
    throw new ValidationError('Profile URL must not include a word reserved for official IFPA and site roles.');
  }
  // A profile URL carries no spaces, so a family name of several words could
  // never be contained in one and every slug the member tried would be refused.
  // The rule is held to the family name's final word, which is satisfiable and
  // still ties the public address to the name.
  //
  // Both sides fold to letters and digits before the comparison, because a slug
  // holds nothing else. Unfolded, the rule refuses every slug a member named
  // O'Brien or Smith-Jones could type: the apostrophe and the hyphen survive
  // into the surname key and no valid slug can carry either. Folding the slug
  // as well makes o_brien as good as obrien.
  //
  // A family name written in Han, Cyrillic, Hangul or any other non-Latin
  // script folds to nothing and the rule does not apply, because no profile URL
  // can contain any spelling of it and holding the member to one leaves them no
  // address they could ever choose. The reserved-word rule, the pattern and
  // uniqueness still stand.
  const slugSurname = latinFold(surnameKey(registrantSurnameKey));
  if (slugSurname && !latinFold(slug).includes(slugSurname)) {
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

  // A registrant is a person claiming their own name, never the platform's own
  // account, so the reserved-word rule always applies here.
  const names = normalizeMemberNames(givenNames, familyName, displayName);
  validateMemberNames(names, { isPlatformAccount: false });
  const trimmedGivenNames  = names.givenNames;
  const trimmedFamilyName  = names.familyName;
  const trimmedRealName    = names.realName;
  const trimmedDisplayName = names.displayName;
  const registrantSurnameKey = names.surnameKey;
  const trimmedEmail = email.trim();
  const normalizedEmail = normalizeEmail(trimmedEmail);

  const trimmedSlug = requestedSlug?.trim().toLowerCase() ?? '';
  const userProvidedSlug = trimmedSlug !== '';
  if (userProvidedSlug) {
    validateSlug(trimmedSlug, registrantSurnameKey);
  } else if (!/[a-z]/.test(slugify(trimmedDisplayName))) {
    // A display name written wholly in a non-Latin script reduces to nothing a
    // profile URL could carry, so there is no address to derive from it and the
    // member supplies their own. Random characters would be unreadable and
    // permanent, and a machine romanisation would freeze a spelling of their
    // name that they may not use themselves into a permanent public address.
    // Names are single-script and a display name ends with the recorded family
    // name, so a display name with no Latin letter is exactly the member whose
    // family name has no Latin form. Every other registrant may still leave
    // this blank and take the generated default.
    throw new ValidationError(
      'Please choose your profile URL. It can only use lowercase letters a to z, digits and underscores, so we cannot make one from your name for you.',
    );
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
  const conflicts = detectRegistrationConflicts(id, CONFLICT_CARD_LIMIT);
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

export interface VerifyEmailResult {
  memberId: string;
  slug: string;
  passwordVersion: number;
  isAdmin: number;
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
 * Consume an email_verify token, mark the member verified, and return the
 * session inputs the controller needs to issue a JWT. Matching against the old
 * records happens in the wizard's claim step and nowhere else. Returns null if
 * the token is invalid, expired, or already used.
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
    | { id: string; slug: string | null; password_version: number; is_admin: number }
    | undefined;
  if (!row) return null;

  return {
    memberId: row.id,
    slug: row.slug ?? row.id,
    passwordVersion: row.password_version,
    isAdmin: row.is_admin,
  };
}

/**
 * The surname rule for a self-serve claim, read through the matching module so
 * every claim gate and the conflict prompt apply the one rule the claim step
 * shows its cards by.
 */
function surnamePassesForMember(memberId: string, targetName: string | null): boolean {
  const evidence = legacyMatchingService.readMemberEvidence(memberId);
  return evidence ? legacyMatchingService.surnamePasses(evidence, targetName).passes : false;
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
  limit: number = Number.POSITIVE_INFINITY,
): RegistrationConflictMatch[] {
  const out: RegistrationConflictMatch[] = [];
  // The surname rule is the only piece this scan shares with the claim step's
  // matching: it looks at already-claimed records, which matching never offers.
  const evidence = legacyMatchingService.readMemberEvidence(memberId);
  if (!evidence) return out;
  const surnamePasses = (name: string) => legacyMatchingService.surnamePasses(evidence, name).passes;
  const claimedLegacy = declaredAnchors.listClaimedLegacyForConflictScan.all() as Array<{
    legacy_member_id: string; display_name: string | null;
  }>;
  for (const row of claimedLegacy) {
    // Match and display only the chosen public handle: matching on the legal
    // real_name would let a surname-matched registrant link a member's public
    // handle to their legal surname, which is itself a disclosure.
    const name = row.display_name;
    if (!name) continue;
    if (surnamePasses(name)) {
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
    if (surnamePasses(row.person_name)) {
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
  return detectRegistrationConflicts(memberId);
}

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

// How each card says how strongly the member's evidence agrees and what found
// it. Never an anchor value: a card says an email address found it, not which.
const MATCH_STRENGTH_LABELS: Record<Confidence, string> = {
  high:   'Strong match',
  medium: 'Possible match',
  low:    'Possible match',
};

function foundThroughLabel(candidate: Candidate): string {
  const keys = new Set(candidate.hits.map((h) => h.key));
  const parts: string[] = [];
  if (keys.has('email')) parts.push('an email address');
  if (keys.has('name')) parts.push('your name');
  if (keys.has('surname_dob')) parts.push('your surname and date of birth');
  return parts.length === 0 ? '' : `found through ${parts.join(' and ')}`;
}

/**
 * One claim-step card from one matching candidate. What the card offers comes
 * from the candidate's status alone, so the card can never offer a control the
 * claim's own re-check would refuse.
 */
function cardFor(candidate: Candidate): LinkHistoryCandidate {
  const account = candidate.accountId
    ? (legacyMembers.findByLegacyMemberId.get(candidate.accountId) as LegacyMemberRow | undefined) ?? null
    : null;
  const record = candidate.recordId
    ? (legacyClaim.findHistoricalPersonById.get(candidate.recordId) as HistoricalPersonClaimRow | undefined) ?? null
    : null;
  const cardKind: LinkHistoryCandidate['cardKind'] =
    candidate.status === 'needs_admin' ? 'needs_admin'
      : candidate.status === 'needs_former_surname' ? 'claim_with_surname'
        : candidate.accountId ? 'claim' : 'claim_record_page';
  const found = foundThroughLabel(candidate);
  return {
    cardKind,
    accountId: candidate.accountId,
    recordId: candidate.recordId,
    displayName: record?.person_name ?? account?.real_name ?? account?.display_name ?? 'Unknown',
    provenanceLabel: found
      ? `${MATCH_STRENGTH_LABELS[candidate.confidence]}, ${found}.`
      : `${MATCH_STRENGTH_LABELS[candidate.confidence]}.`,
    differingSurname: candidate.surname.differingSurname,
    claimRecordHref: cardKind === 'claim_record_page' ? `/history/${candidate.recordId}/claim` : null,
    country: record?.country ?? account?.country ?? null,
    isHof: Boolean(record?.hof_member) || Boolean(account?.is_hof),
    isBap: Boolean(record?.bap_member) || Boolean(account?.is_bap),
    firstYear: record?.first_year ?? account?.first_competition_year ?? null,
    bioExcerpt: bioExcerptFor(candidate.accountId),
    ...candidateClubsAndEvents(candidate.recordId),
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

// Shown wherever a claim is refused because the name did not reconcile. It
// names the two remedies rather than the failure, because both are self-serve,
// both live in the claim step, and both re-run the match the moment they are
// saved. It names no administrator: this refusal reaches registrants who are
// not yet members, and the contact form is a member-only surface.
const SURNAME_MISMATCH_MESSAGE =
  'Your name does not match this record. If you used a different surname before, '
  + 'or a different email address on the old footbag.org, add either one in the claim step '
  + 'and we will look again.';

// Appended to the refusals a registrant cannot act on themselves: a record held
// by someone else, or one tied to a legacy account that is not theirs. There is
// no self-serve remedy for either, so the only honest next step is the
// administrator, and it is stated in the future tense because the contact form
// is a member-only surface a registrant cannot reach until signing up is done.
const ASK_ADMIN_AFTER_SIGNUP =
  ' Finish signing up and then ask an IFPA administrator, who can sort this out for you.';

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
 * Evidence-strength tag carried on every confirmed-claim audit row, set by the
 * anchor that proved the match. Name-only evidence (the surname rule alone, as
 * on a direct record claim) and a declared old email tag the
 * declared_anchor_only floor tier, the weakest evidence band an admin sees when
 * reviewing a disputed claim. A name-variant match found through the login
 * email carries that email's tier.
 */
export type EvidenceStrength =
  | 'declared_anchor_only'
  | 'currently_controls_modern_email_matching_legacy'
  | 'admin_vetted_evidence';

const EVIDENCE_STRENGTHS: ReadonlySet<string> = new Set<EvidenceStrength>([
  'declared_anchor_only',
  'currently_controls_modern_email_matching_legacy',
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
  admin_vetted_evidence:
    'An administrator vetted the evidence and applied this link by hand.',
};

/** What the date comparison actually established, stated plainly. */
const DOB_COMPARISON_LABELS: Record<RecordedBirthDateComparison | 'placeholder', string> = {
  placeholder:       'The old account carries a placeholder date of birth, which settles nothing.',
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
  'claim.refused':                   'Refused: the member\'s evidence no longer made it claimable',
  'legacy.claim_candidate_declined': 'Said a candidate is not them',
  'legacy.claim_step_answered':      'Finished the claim step without linking',
  'legacy.anchor_declared':          'Added a former surname or an old email address',
  'legacy.auto_link_revert':         'A claim was reverted',
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
  /**
   * Set where the attempt was not recorded as real business, so an
   * administrator adjudicating an identity is never shown a rehearsal attempt
   * as though it were something the member actually did. Null for a real one.
   */
  dataOriginLabel: string | null;
}

export interface ClaimEvidence {
  attempts: ClaimEvidenceAttempt[];
  /** The member's own date, which is what every comparison here was against. */
  memberBirthDate: string | null;
}

/** What the platform can already see for a member an administrator must link. */
export interface AdminLinkCandidates {
  /** Old accounts the member's evidence reaches, each with the record the
   *  pipeline linked to it where there is one. */
  legacyAccounts: Array<{
    legacyMemberId: string;
    displayName: string | null;
    country: string | null;
    birthDate: string | null;
    /** How this account was reached, so the administrator can weigh it. */
    anchorLabel: string;
    /** What the claim step does with it and why, in words. */
    statusLabel: string;
  }>;
  /** Competition records with no old account behind them that the member's
   *  evidence reaches. */
  historicalPersons: Array<{
    personId: string;
    personName: string;
    isVariantMatch: boolean;
    statusLabel: string;
  }>;
  /** An address that reached more than one old account, which is a fact about
   *  the member rather than a candidate: none of them may be assumed theirs. */
  ambiguousAnchors: string[];
}

const ADMIN_STATUS_LABELS: Record<string, string> = {
  claimable:              'The member could claim this themselves.',
  needs_former_surname:   'Reached, but the surname differs from the member\'s.',
  needs_admin:            'Found by name only: nothing on the old account corroborates it.',
  already_mine:           'Already linked to this member.',
  deceased:               'The record is flagged deceased.',
  held_by_other:          'Held by another member.',
  no_account_name:        'The old account carries no real name.',
  declined:               'The member said this is not them.',
  incompatible_with_held: 'The member already holds a different account or record.',
};

function adminStatusLabel(c: Candidate): string {
  const label = ADMIN_STATUS_LABELS[c.refusal ?? c.status] ?? c.status;
  if (c.refusal !== 'held_by_other' || !c.heldBy) return label;
  // A held record is shown as a conflict naming its holder, never as something
  // to approve: the administrator must see who already has it.
  const holder = legacyClaim.findHolderForAdmin.get(c.heldBy) as
    | { id: string; slug: string | null; display_name: string | null } | undefined;
  return holder
    ? `Held by another member: ${holder.display_name ?? holder.id} (/members/${holder.slug ?? holder.id}).`
    : label;
}

function adminFoundThrough(c: Candidate): string {
  const parts = new Set<string>();
  for (const h of c.hits) {
    if (h.key === 'email') parts.add(h.address.kind === 'login' ? 'their sign-in address' : 'an old address they declared');
    else if (h.key === 'name') parts.add(h.match === 'exact' ? 'their name' : 'a variant of their name');
    else parts.add('their surname and date of birth');
  }
  return [...parts].join(' and ');
}

/**
 * The candidates behind a member, for the administrator answering their
 * link-help request: everything the matching reaches, hidden candidates
 * included with the reason the claim step hides them, and every address that
 * reached more than one account.
 *
 * Reads only. It reports what a held record is rather than hiding it, because
 * an administrator adjudicating a doubtful link needs to see that the record
 * they were about to attach is already somebody else's.
 */
function getLinkCandidatesForAdmin(memberId: string): AdminLinkCandidates {
  const evidence = legacyMatchingService.readMemberEvidence(memberId);
  if (!evidence) return { legacyAccounts: [], historicalPersons: [], ambiguousAnchors: [] };
  const result = legacyMatchingService.match(evidence);

  const legacyAccounts: AdminLinkCandidates['legacyAccounts'] = [];
  const historicalPersons: AdminLinkCandidates['historicalPersons'] = [];
  for (const c of result.candidates) {
    if (c.accountId) {
      const row = legacyMembers.findByLegacyMemberId.get(c.accountId) as LegacyMemberRow | undefined;
      legacyAccounts.push({
        legacyMemberId: c.accountId,
        displayName:    row?.real_name ?? row?.display_name ?? null,
        country:        row?.country ?? null,
        birthDate:      row?.birth_date ?? null,
        anchorLabel:    adminFoundThrough(c),
        statusLabel:    adminStatusLabel(c),
      });
    } else if (c.recordId) {
      const hp = legacyClaim.findHistoricalPersonById.get(c.recordId) as HistoricalPersonClaimRow | undefined;
      historicalPersons.push({
        personId:       c.recordId,
        personName:     hp?.person_name ?? c.recordId,
        isVariantMatch: c.nameAgreement === 'variant',
        statusLabel:    adminStatusLabel(c),
      });
    }
  }
  return {
    legacyAccounts,
    historicalPersons,
    ambiguousAnchors: result.ambiguousAddresses.map((a) =>
      a.address.kind === 'login' ? 'their sign-in address' : 'an old address they declared'),
  };
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
    data_origin: string;
  }>;
  const attempts = rows.map((r) => {
    let meta: Record<string, unknown> = {};
    try {
      meta = r.metadata_json ? JSON.parse(r.metadata_json) as Record<string, unknown> : {};
    } catch {
      // A row whose metadata will not parse still says an attempt happened, and
      // that is worth showing; the detail is simply unavailable for it.
    }
    // The ledger names records by id only; names are read live here, so an
    // erased record stops resolving rather than outliving its erasure.
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    const block = (meta.evidence && typeof meta.evidence === 'object' ? meta.evidence : meta) as Record<string, unknown>;
    const comparison = str(meta.dob_comparison) ?? str(block.dob_comparison);
    const evidence = str(meta.evidence_strength) ? readEvidenceStrength(str(meta.evidence_strength)) : null;
    const recordId = str(meta.person_id) ?? str(meta.record_id) ?? str(block.record_id);
    const accountId = str(meta.legacy_member_id) ?? str(meta.account_id) ?? str(block.account_id);
    const recordName = recordId
      ? (legacyClaim.findHistoricalPersonById.get(recordId) as HistoricalPersonClaimRow | undefined)?.person_name ?? null
      : null;
    const accountName = accountId
      ? (legacyMembers.findByLegacyMemberId.get(accountId) as LegacyMemberRow | undefined)?.real_name ?? null
      : null;
    return {
      whenDisplay: formatDateForDisplay(r.occurred_at),
      outcomeLabel: CLAIM_OUTCOME_LABELS[r.action_type] ?? r.action_type,
      targetLabel: recordName ?? accountName ?? recordId ?? accountId,
      comparisonLabel: comparison
        ? DOB_COMPARISON_LABELS[comparison as RecordedBirthDateComparison | 'placeholder'] ?? 'The date comparison was not recorded.'
        : 'The date comparison was not recorded.',
      evidenceLabel: evidence ? EVIDENCE_STRENGTH_LABELS[evidence] : null,
      isContradicted: comparison === 'mismatch',
      recordBirthDate: recordId ? candidateBirthDate(recordId) : null,
      dataOriginLabel: r.data_origin === 'live'
        ? null
        : r.data_origin === 'test' ? 'Test data' : 'Unknown origin',
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
/**
 * Who performed a claim. A member claiming for themselves by default; an
 * administrator applying a link on a member's behalf is named as the actor on
 * every row the claim writes, so the ledger says who actually did it.
 */
export interface ClaimActor {
  type: 'member' | 'admin';
  id: string;
}

function claimLegacyAccountInTx(
  requestingMemberId: string,
  targetLegacyMemberId: string,
  evidenceStrength: EvidenceStrength,
  actor: ClaimActor = { type: 'member', id: requestingMemberId },
  evidence: Record<string, unknown> | null = null,
): void {
  try {
    claimLegacyAccountInTxInner(requestingMemberId, targetLegacyMemberId, evidenceStrength, actor, evidence);
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
  actor: ClaimActor,
  evidence: Record<string, unknown> | null,
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
  // claim here: whether the member's evidence corroborates the account was
  // decided by the matching before this runs, and a legacy-side typo must not
  // lock a member out.
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

  const hp = legacyClaim.findHistoricalPersonByLegacyId.get(row.legacy_member_id) as HistoricalPersonClaimRow | undefined;

  // The surname rule binds every self-serve claim path, this one included: one
  // of the member's possible surnames or a declared former surname must stand
  // in the account's real name, or in the name on the record the pipeline
  // linked to it. A matching email alone is not enough, because a family's
  // shared address sits on one member's old account, and claiming that account
  // also takes its competition record, honours and tier. Admin-vetted evidence
  // stands in for the rule, as it does on the direct record claim.
  if (
    evidenceStrength !== 'admin_vetted_evidence'
    && !surnamePassesForMember(requestingMemberId, row.real_name)
    && !(hp && surnamePassesForMember(requestingMemberId, hp.person_name))
  ) {
    throw new ValidationError(SURNAME_MISMATCH_MESSAGE);
  }

  const now = new Date().toISOString();

  const marked = legacyMembers.markClaimed.run(requestingMemberId, now, targetLegacyMemberId);
  if (marked.changes === 0) {
    throw new ValidationError('This legacy record has already been claimed by another account.');
  }

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
  applyLegacyClaimGrantInTx(actor.id, requestingMemberId, {
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
    actorType:     actor.type,
    actorMemberId: actor.id,
    entityType:    'member',
    entityId:      requestingMemberId,
    reasonText:    null,
    metadata: {
      legacy_member_id:   row.legacy_member_id,
      legacy_user_id:     row.legacy_user_id,
      transitive_hp_id:   hp?.person_id ?? null,
      evidence_strength:  evidenceStrength,
      dob_comparison:     dobComparison,
      ...(evidence ? { evidence } : {}),
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
function claimLegacyAccount(
  requestingMemberId: string,
  targetLegacyMemberId: string,
  evidenceStrength: EvidenceStrength = 'declared_anchor_only',
): void {
  transaction(() => {
    claimLegacyAccountInTx(requestingMemberId, targetLegacyMemberId, evidenceStrength);
  });
}

// ── Claim-step claims, declines and refusals ────────────────────────────────
//
// Matching is computed live by the matching module and nothing is staged. A
// claim re-runs the match inside its own transaction before any write and
// proceeds only on a candidate the member's evidence still makes claimable; a
// decline records a standing answer the matching then honours; a refused claim
// is recorded after its rollback so the attempt survives it.

/** The candidate a claim-step form names: its account id, its record id, or both. */
export interface ClaimTarget {
  accountId: string | null;
  recordId: string | null;
}

function holdsTarget(c: Candidate, target: ClaimTarget): boolean {
  return (target.accountId !== null && c.accountId === target.accountId)
    || (target.recordId !== null && c.recordId === target.recordId);
}

export type ClaimCandidateOutcome =
  | { status: 'claimed'; candidate: Candidate }
  | { status: 'already_mine' }
  | { status: 'refused'; candidate: Candidate | null };

/**
 * Claim the candidate holding the target, inside the caller's transaction.
 *
 * The member's evidence is read and matched afresh before any write, so a
 * forged or stale target, or one the member's evidence no longer makes
 * claimable, is refused with nothing written. A target the member already
 * holds reports that and writes nothing, so a double submit lands as the
 * success it already was. The claim then runs the ordinary claim transaction
 * with the evidence tier the live match proves and the full evidence block.
 */
function claimCandidateInTx(memberId: string, target: ClaimTarget): ClaimCandidateOutcome {
  const evidence = legacyMatchingService.readMemberEvidence(memberId);
  if (!evidence) return { status: 'refused', candidate: null };
  const result = legacyMatchingService.match(evidence);
  const candidate = result.candidates.find((c) => holdsTarget(c, target)) ?? null;
  if (candidate?.refusal === 'already_mine') return { status: 'already_mine' };
  if (!candidate || candidate.status !== 'claimable') return { status: 'refused', candidate };
  const tier = legacyMatchingService.evidenceTier(candidate);
  const block = legacyMatchingService.auditEvidence(
    candidate, evidence, legacyMatchingService.shownCandidates(result), { proposed: tier, written: tier },
  );
  const actor: ClaimActor = { type: 'member', id: memberId };
  if (candidate.accountId) {
    claimLegacyAccountInTx(memberId, candidate.accountId, tier, actor, block);
  } else {
    claimHistoricalPersonInTx(memberId, candidate.recordId!, tier, actor, block);
  }
  return { status: 'claimed', candidate };
}

/**
 * "This is me, I used the surname X": record the surname the candidate carries
 * as a declared former surname and claim, inside the caller's transaction. The
 * candidate must be one the step showed with that offer; the anchor goes in
 * first and the claim re-checks against the evidence it now includes, so a
 * candidate that still would not be claimable is refused and, the caller's
 * transaction rolling back, the anchor goes with it.
 */
function claimWithFormerSurnameInTx(memberId: string, target: ClaimTarget): ClaimCandidateOutcome {
  const evidence = legacyMatchingService.readMemberEvidence(memberId);
  if (!evidence) return { status: 'refused', candidate: null };
  const candidate = legacyMatchingService.match(evidence).candidates.find((c) => holdsTarget(c, target)) ?? null;
  if (candidate?.refusal === 'already_mine') return { status: 'already_mine' };
  if (!candidate || candidate.status !== 'needs_former_surname' || !candidate.surname.differingSurname) {
    return { status: 'refused', candidate };
  }
  declareAnchorInTx(memberId, 'former_surname', candidate.surname.differingSurname);
  return claimCandidateInTx(memberId, target);
}

/**
 * Record the member's standing "This Is Not Me" for one shown candidate. A
 * target the step does not show them right now (a forged id, a candidate
 * already declined or hidden) records nothing, which is the same non-revealing
 * outcome. A decline naming an account and its linked record hides each half.
 */
function declineCandidate(memberId: string, target: ClaimTarget): { status: 'declined' | 'not_found' } {
  return transaction(() => {
    const evidence = legacyMatchingService.readMemberEvidence(memberId);
    if (!evidence) return { status: 'not_found' as const };
    const shown = legacyMatchingService.shownCandidates(legacyMatchingService.match(evidence));
    const candidate = shown.find((c) => c.accountId === target.accountId && c.recordId === target.recordId);
    if (!candidate) return { status: 'not_found' as const };
    const block = legacyMatchingService.auditEvidence(candidate, evidence, shown);
    const now = new Date().toISOString();
    const res = legacyClaimDeclines.insertIfMissing.run(
      `lcd_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      now, memberId, now, memberId,
      memberId, candidate.accountId, candidate.recordId, candidate.confidence, JSON.stringify(block),
    );
    if (res.changes === 0) return { status: 'not_found' as const };
    appendAuditEntry({
      actionType:    'legacy.claim_candidate_declined',
      category:      'identity',
      actorType:     'member',
      actorMemberId: memberId,
      entityType:    'member',
      entityId:      memberId,
      reasonText:    null,
      metadata:      block,
    });
    return { status: 'declined' as const };
  });
}

/**
 * A non-claiming answer to the claim step, with the cards it left on screen.
 * Inside the caller's transaction. The answer declines none of them; the row
 * records what was shown so an administrator later sees what was passed over.
 */
function recordClaimStepAnswered(memberId: string, answer: 'never_had_one' | 'cannot_find_it'): void {
  const evidence = legacyMatchingService.readMemberEvidence(memberId);
  const shown = evidence ? legacyMatchingService.shownCandidates(legacyMatchingService.match(evidence)) : [];
  appendAuditEntry({
    actionType:    'legacy.claim_step_answered',
    category:      'identity',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'member',
    entityId:      memberId,
    reasonText:    null,
    metadata: {
      answer,
      dob_changes_during_onboarding: evidence?.dobChangesDuringOnboarding ?? 0,
      shown: evidence
        ? shown.map((c) => legacyMatchingService.auditEvidence(c, evidence, shown))
        : [],
    },
  });
}

/**
 * A refused claim attempt, recorded after its rollback so it survives.
 *
 * Where the target is a competition record the row carries the date-of-birth
 * comparison and an assessment derived from it, because a refused name is not
 * on its own evidence against a member: names change, and an archived record
 * carries whatever the old site held. Only a date that actively contradicts the
 * claim is recorded as evidence against them.
 */
function recordClaimRefused(memberId: string, target: ClaimTarget, candidate: Candidate | null): void {
  const evidence = legacyMatchingService.readMemberEvidence(memberId);
  const hp = target.recordId
    ? legacyClaim.findHistoricalPersonById.get(target.recordId) as HistoricalPersonClaimRow | undefined
    : undefined;
  const dobComparison = hp
    ? compareDobToHistoricalPerson(evidence?.birthDate ?? null, hp)
    : candidate?.dob ?? null;
  const assessment =
    dobComparison === 'mismatch' ? 'contradicted'
      : dobComparison === 'identical' ? 'corroborated'
        : 'unevidenced';
  appendAuditEntry({
    actionType:    'claim.refused',
    category:      'identity',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'member',
    entityId:      memberId,
    reasonText:    null,
    metadata: {
      account_id:     target.accountId,
      record_id:      target.recordId,
      refusal:        candidate?.refusal ?? 'not_reached',
      status:         candidate?.status ?? null,
      dob_comparison: dobComparison,
      assessment,
      ...(candidate && evidence
        ? { evidence: legacyMatchingService.auditEvidence(candidate, evidence, []) }
        : {}),
    },
  });
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
function enforceHistoricalPersonClaimLimit(requestingMemberId: string, ip: string, targetId?: string): void {
  const windowMinutes = hpClaimWindowMinutes();
  const ipRl = rateLimitHit(`hpclaim-ip:${ip}`, hpClaimMaxPerIp(), windowMinutes);
  if (!ipRl.allowed) {
    throw new RateLimitedError('Too many claim attempts. Please try again later.', ipRl.retryAfterSeconds);
  }
  const memberRl = rateLimitHit(`hpclaim:${requestingMemberId}`, hpClaimMaxPerMember(), windowMinutes);
  if (!memberRl.allowed) {
    throw new RateLimitedError('Too many claim attempts. Please try again later.', memberRl.retryAfterSeconds);
  }
  // Per target record too, so attempts at one record spread across many
  // accounts and addresses are still bounded. It takes the per-member ceiling.
  if (targetId) {
    const targetRl = rateLimitHit(`hpclaim-target:${targetId}`, hpClaimMaxPerMember(), windowMinutes);
    if (!targetRl.allowed) {
      throw new RateLimitedError('Too many claim attempts. Please try again later.', targetRl.retryAfterSeconds);
    }
  }
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

  // A holder whose record still stands owns this historical record, and that
  // includes the two permanent holders: a deceased member keeps the link through
  // the contact scrub, and an honoree keeps it through account erasure. Neither
  // is open for another member to take over.
  const existing = legacyClaim.findMemberClaimingHp.get(personId) as { id: string; slug: string } | undefined;
  if (existing) {
    return { status: 'conflict' };
  }

  // The confirmation page opens only where the member's own evidence reaches
  // the record and makes it claimable under the claim step's rules: the same
  // decision the card that linked here was drawn from, so the page and the card
  // cannot disagree. Nothing is recorded: this runs on a bare page view, and
  // opening a record is not an attempt at anything. Only an attempted
  // confirmation writes a refusal, after its rollback.
  const evidence = legacyMatchingService.readMemberEvidence(requestingMemberId);
  const candidate = evidence
    ? legacyMatchingService.recheckInTx(evidence, { recordId: personId })
    : null;
  if (candidate?.status === 'needs_former_surname') {
    // The message names the two things that actually resolve a name that does
    // not line up, because both exist in the claim step and both re-run the
    // match on save. It names no administrator: this refusal reaches
    // registrants, for whom the contact form is unreachable.
    throw new ValidationError(SURNAME_MISMATCH_MESSAGE);
  }
  if (candidate?.refusal === 'held_by_other') return { status: 'conflict' };
  if (candidate?.status !== 'claimable') return null;

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
  actor: ClaimActor = { type: 'member', id: requestingMemberId },
  evidence: Record<string, unknown> | null = null,
): void {
  try {
    claimHistoricalPersonInTxInner(requestingMemberId, personId, evidenceStrength, actor, evidence);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ConflictError('This historical record has already been claimed by another member.'
        + ASK_ADMIN_AFTER_SIGNUP);
    }
    throw err;
  }
}

function claimHistoricalPersonInTxInner(
  requestingMemberId: string,
  personId: string,
  evidenceStrength: EvidenceStrength,
  actor: ClaimActor,
  evidence: Record<string, unknown> | null,
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

  // A holder whose record still stands owns this historical record, the two
  // permanent holders included: a deceased member keeps the link through the
  // contact scrub, and an honoree keeps it through account erasure. Gating the
  // execution path on the same read is what stops a direct post taking a record
  // the surfaces already refuse to offer.
  const existing = legacyClaim.findMemberClaimingHp.get(personId) as { id: string; slug: string } | undefined;
  if (existing) {
    throw new ValidationError('This historical record has already been claimed by another member.'
      + ASK_ADMIN_AFTER_SIGNUP);
  }

  // The surname gate constrains self-serve claiming. Admin-vetted evidence
  // means an administrator verified the member's identity against the record,
  // which subsumes the automated name check (the admin legacy-account link
  // path carries no name gate either); the deceased and already-claimed
  // integrity gates above still apply to every caller.
  // Either half of a record and the account the pipeline linked to it is enough.
  const linkedAccount = hp.legacy_member_id
    ? legacyMembers.findByLegacyMemberId.get(hp.legacy_member_id) as LegacyMemberRow | undefined
    : undefined;
  if (
    evidenceStrength !== 'admin_vetted_evidence'
    && !surnamePassesForMember(requestingMemberId, hp.person_name)
    && !(linkedAccount && surnamePassesForMember(requestingMemberId, linkedAccount.real_name))
  ) {
    throw new ValidationError(SURNAME_MISMATCH_MESSAGE);
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
        'This historical record is tied to a different legacy account than the one already linked to your profile.'
        + ASK_ADMIN_AFTER_SIGNUP,
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
          'The legacy account tied to this historical record has already been claimed by another member.'
        + ASK_ADMIN_AFTER_SIGNUP,
        );
      }
      if (!member.legacy_member_id) {
        transitiveLegacyRow = lm;
      }
    } else if (lm && lm.claimed_by_member_id && lm.claimed_by_member_id !== requestingMemberId) {
      throw new ValidationError(
        'The legacy account tied to this historical record has already been claimed by another member.'
        + ASK_ADMIN_AFTER_SIGNUP,
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
    actor.id,
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
    actorType:     actor.type,
    actorMemberId: actor.id,
    entityType:    'member',
    entityId:      requestingMemberId,
    reasonText:    null,
    metadata: {
      person_id:              hp.person_id,
      first_name_variant:     !firstNamesMatch(member.real_name, hp.person_name),
      transitive_legacy_id:   hp.legacy_member_id ?? null,
      evidence_strength:      evidenceStrength,
      dob_comparison:         dobComparison,
      ...(evidence ? { evidence } : {}),
    },
  });
}

// A claim revert clears every field that still matches what the claim copied
// in, and city, country and date of birth are fields the personal-details step
// requires. A member who happened to type the same city as their linked record
// therefore loses it on a revert, while the step stays completed: nothing
// re-asks them, and the Official IFPA Roster shows the blank. Putting
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

/** The claim with its own transaction, for a caller that does not already hold one. */
function claimHistoricalPerson(
  requestingMemberId: string,
  personId: string,
  evidenceStrength: EvidenceStrength = 'declared_anchor_only',
): void {
  transaction(() => claimHistoricalPersonInTx(requestingMemberId, personId, evidenceStrength));
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
 * The claim step's view-model: every candidate the member's own evidence
 * reaches and the step may show, strongest first, plus the conflict prompt.
 * Reads only; showing the cards records nothing.
 */
async function getLinkHistoryViewForWizard(memberId: string): Promise<LinkHistoryContent | null> {
  const member = legacyClaim.findClaimingMember.get(memberId) as ClaimingMemberRow | undefined;
  const evidence = legacyMatchingService.readMemberEvidence(memberId);
  if (!member || !evidence) return null;

  const candidates = legacyMatchingService
    .shownCandidates(legacyMatchingService.match(evidence))
    .map(cardFor);
  const holdsSomething = member.legacy_member_id !== null || member.historical_person_id !== null;

  return {
    memberSlug: member.slug,
    dashboardHref: `/members/${member.slug}`,
    candidates,
    // Display half only: the record identifiers stay in the service so the
    // card discloses nothing beyond the public handle it already renders.
    conflictPrompt: (() => {
      if (holdsSomething) return null;
      const records: RegistrationConflictRecord[] = detectRegistrationConflicts(memberId, CONFLICT_CARD_LIMIT)
        .map((m) => ({ displayName: m.displayName, sourceLabel: m.sourceLabel }));
      return records.length > 0 ? { records } : null;
    })(),
    lowConfidenceBanner: !holdsSomething && candidates.length === 0,
    unansweredCardNames: candidates.map((c) => c.displayName),
  };
}

// ── Auto-link revert ─────────────────────────────────────────────────────────
//
// Reverses a confirmed claim when it is reported incorrect.
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
          is_hof: number;
          is_bap: number;
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
    // Marking a member deceased cascades the flag onto the record they hold.
    // When the claim that linked that record is reverted, the record was never
    // theirs, so the cascaded flag goes with the link; otherwise the record's
    // real owner could never claim it. A flag set on the record independently
    // of this member's marking is left alone.
    let clearedCascadedDeceased = false;
    if (clearedHp && member.historical_person_id !== null) {
      const cascade = legacyClaim.findDeceasedCascadeOntoRecord.get(memberId, member.historical_person_id);
      if (cascade) {
        clearedCascadedDeceased =
          legacyClaim.clearDeceasedFlagOnRecord.run(member.historical_person_id).changes > 0;
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
    // Decided per honor. The two are independent, so a member can hold one from
    // a still-linked historical record or an administrator's own grant while the
    // other came from the claim being reverted; treating them together would
    // either strand the claimed one or strip the standing one.
    let hpBacksHof = false;
    let hpBacksBap = false;
    if (member.historical_person_id !== null && !clearedHp) {
      const survivingHp = legacyClaim.findHistoricalPersonById.get(member.historical_person_id) as
        | { hof_member: number; bap_member: number }
        | undefined;
      hpBacksHof = Boolean(survivingHp?.hof_member);
      hpBacksBap = Boolean(survivingHp?.bap_member);
    }
    // An honor an administrator granted directly stands on its own ledger row
    // and did not come from the claim, so a revert leaves it alone. Without this
    // an administrator's grant would be stripped as collateral of an unrelated
    // disputed claim.
    // A flag the member does not carry is not something a revert clears, and
    // reporting it as cleared would put a change in the trail that never
    // happened.
    const clearHof = member.is_hof === 1 && !hpBacksHof && !hasHonorGrant(memberId, 'hof');
    const clearBap = member.is_bap === 1 && !hpBacksBap && !hasHonorGrant(memberId, 'bap');
    if (clearHof || clearBap) {
      legacyMembers.clearDerivedHonors.run(
        clearHof ? 1 : 0, clearHof ? 1 : 0,
        clearBap ? 1 : 0, clearBap ? 1 : 0,
        now, actor.actorMemberId, memberId,
      );
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
        // What was actually cleared, not what the decision was about: the two
        // honors are decided separately and either can survive alone.
        cleared_derived_honors:  clearHof || clearBap,
        cleared_derived_hof:     clearHof,
        cleared_derived_bap:     clearBap,
        cleared_cascaded_deceased_flag: clearedCascadedDeceased,
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
  const disputedRecordId = legacyId || personId;
  const originalClaim = legacyClaim.findClaimAuditForRecord.get(
    targetMemberId, disputedRecordId, disputedRecordId, disputedRecordId, disputedRecordId,
  ) as { id: string } | undefined;
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
// Declared anchors — former surnames and old emails the member provides to
// broaden the matching surface for identity linking. Add-only: a declared
// anchor is evidence the claim rests on, so the member cannot withdraw it.
// ---------------------------------------------------------------------------

export interface DeclaredAnchorView {
  id: string;
  anchorType: 'former_surname' | 'old_email';
  anchorTypeLabel: string;
  anchorValue: string;
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
  if (!anchorValue.trim()) {
    throw new ValidationError('Enter a value to add.');
  }
  try {
    transaction(() => declareAnchorInTx(memberId, anchorType as 'former_surname' | 'old_email', anchorValue));
  } catch (err: unknown) {
    // Adding one already on file (a double submit, a second tab) lands where the
    // first add did: the anchor is there, so the save stands and nothing more is
    // written.
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return;
    }
    throw err;
  }
}

/**
 * Insert one declared anchor and record its addition, inside the caller's
 * transaction. The ledger names the anchor by id and kind, never by value: a
 * former surname or an old address is personal data the ledger must not hold.
 */
function declareAnchorInTx(memberId: string, anchorType: 'former_surname' | 'old_email', anchorValue: string): string {
  const value = anchorType === 'old_email' ? anchorValue.trim().toLowerCase() : anchorValue.trim();
  const id = `mda_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  declaredAnchors.insert.run(id, memberId, memberId, memberId, anchorType, value);
  appendAuditEntry({
    actionType:    'legacy.anchor_declared',
    category:      'identity',
    actorType:     'member',
    actorMemberId: memberId,
    entityType:    'member',
    entityId:      memberId,
    reasonText:    null,
    metadata:      { anchor_id: id, anchor_type: anchorType },
  });
  return id;
}

function listDeclaredAnchors(memberId: string): DeclaredAnchorView[] {
  const rows = declaredAnchors.listByMember.all(memberId) as {
    id: string; anchor_type: string; anchor_value: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    anchorType: r.anchor_type as 'former_surname' | 'old_email',
    anchorTypeLabel: r.anchor_type === 'old_email' ? 'Old email' : 'Former name',
    anchorValue: r.anchor_value,
  }));
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

/** The two records an approval is about to bind, before anything is written. */
export interface LinkHelpApprovalPreview {
  workQueueItemId: string;
  member: { memberId: string; displayName: string; realName: string; birthDate: string | null };
  target: {
    kindLabel: string;
    recordId: string;
    /** The name on the record, which is the thing a mistyped id gets wrong. */
    recordName: string;
    facts: string[];
  };
  /** Which of the two ids the confirmation must carry back. */
  legacyMemberId: string | null;
  historicalPersonId: string | null;
}

/**
 * What an approval is about to do, read before anything is written.
 *
 * The approve form takes an opaque id typed by hand. Every other consequential
 * administrative write on a person shows the record first and writes on confirm;
 * this one bound a member account to whatever id was typed, so a mistyped
 * character linked the wrong person silently and the administrator saw nothing
 * about whose record it was.
 *
 * Runs the same refusals the apply path runs, in the same order, so the
 * confirmation never offers a step that will then be refused.
 */
function previewLinkHelpApproval(
  adminMemberId: string,
  workQueueItemId: string,
  target: LinkHelpApproveTarget,
): LinkHelpApprovalPreview {
  const legacyId = target.legacyMemberId?.trim() ?? '';
  const personId = target.historicalPersonId?.trim() ?? '';
  if ((legacyId && personId) || (!legacyId && !personId)) {
    throw new ValidationError(
      'Enter exactly one link target: a legacy account id or a historical person id.',
    );
  }
  const item = loadOpenLinkHelpItem(workQueueItemId);
  if (item.entity_id === adminMemberId) {
    throw new ValidationError(
      'You cannot approve your own help request. Another administrator must review it.',
    );
  }
  const member = legacyClaim.findClaimingMember.get(item.entity_id) as
    | { id: string; real_name: string; birth_date: string | null;
        legacy_member_id: string | null; historical_person_id: string | null }
    | undefined;
  const memberContact = account.findContactInfoById.get(item.entity_id) as
    | { display_name: string }
    | undefined;
  if (!member) throw new NotFoundError('That member no longer exists.');
  // The refusals the apply step makes about the member and the record the link
  // would also bind, checked here so the confirmation never offers a link that
  // will then be refused.
  const refuseLinkedRecord = (linkedPersonId: string | null): void => {
    if (!linkedPersonId) return;
    const linked = legacyClaim.findHistoricalPersonById.get(linkedPersonId) as
      | { is_deceased: number } | undefined;
    if (linked?.is_deceased) {
      throw new ValidationError(
        'The competition record this link would also bind is marked deceased, so it cannot be linked here.',
      );
    }
    if (member.historical_person_id && member.historical_person_id !== linkedPersonId) {
      throw new ValidationError(
        'This member already holds a different competition record, so this link cannot be applied.',
      );
    }
  };

  const shared = {
    workQueueItemId,
    member: {
      memberId:    item.entity_id,
      displayName: memberContact?.display_name ?? member.real_name,
      realName:    member.real_name,
      birthDate:   member.birth_date,
    },
  };

  if (legacyId) {
    const row = legacyMembers.findByLegacyMemberId.get(legacyId) as
      | {
        legacy_member_id: string; real_name: string | null; display_name: string | null;
        birth_date: string | null; city: string | null; region: string | null; country: string | null;
        first_competition_year: number | null; claimed_by_member_id: string | null;
      }
      | undefined;
    // A ValidationError, not a not-found: the id came from a form field an
    // administrator typed, so an unknown one is a correction to make here rather
    // than a missing page.
    if (!row) throw new ValidationError('No legacy account with that id.');
    if (member.legacy_member_id) {
      throw new ValidationError('This member already holds a legacy account, so this link cannot be applied.');
    }
    if (row.claimed_by_member_id) {
      throw new ValidationError(
        'Another member already holds that legacy account, so it cannot be linked here.',
      );
    }
    const backLinked = legacyClaim.findHistoricalPersonByLegacyId.get(row.legacy_member_id) as
      | { person_id: string } | undefined;
    refuseLinkedRecord(backLinked?.person_id ?? null);
    return {
      ...shared,
      target: {
        kindLabel:  'Legacy account',
        recordId:   row.legacy_member_id,
        recordName: row.display_name ?? row.real_name ?? row.legacy_member_id,
        facts: [
          row.real_name && row.real_name !== row.display_name ? row.real_name : null,
          [row.city, row.region, row.country].filter(Boolean).join(', ') || null,
          row.first_competition_year ? `First competed ${row.first_competition_year}` : null,
          row.birth_date ? `Date of birth on the account: ${row.birth_date}` : null,
        ].filter((f): f is string => Boolean(f)),
      },
      legacyMemberId:     row.legacy_member_id,
      historicalPersonId: null,
    };
  }

  const person = legacyClaim.findHistoricalPersonById.get(personId) as
    | { person_id: string; person_name: string; country: string | null; first_year: number | null;
        legacy_member_id: string | null }
    | undefined;
  if (!person) throw new ValidationError('No competition record with that id.');
  if (member.historical_person_id) {
    throw new ValidationError(
      'This member already holds a competition record, so this link cannot be applied.',
    );
  }
  refuseLinkedRecord(person.person_id);
  // Any holder whose record still stands, which includes a deceased member and
  // an honoree: both keep the link through their erasure, and treating either
  // record as free is exactly how it would be handed to somebody else.
  const holder = legacyClaim.findMemberClaimingHp.get(personId) as { id: string } | undefined;
  if (holder) {
    throw new ValidationError(
      'Another member already holds that competition record, so it cannot be linked here.',
    );
  }
  if (person.legacy_member_id) {
    if (member.legacy_member_id && member.legacy_member_id !== person.legacy_member_id) {
      throw new ValidationError(
        'That competition record is tied to a different legacy account than the one this member holds.',
      );
    }
    const tied = legacyMembers.findByLegacyMemberId.get(person.legacy_member_id) as
      | { claimed_by_member_id: string | null } | undefined;
    if (tied?.claimed_by_member_id && tied.claimed_by_member_id !== member.id) {
      throw new ValidationError(
        'The legacy account tied to that competition record is held by another member.',
      );
    }
  }
  return {
    ...shared,
    target: {
      kindLabel:  'Competition record',
      recordId:   person.person_id,
      recordName: person.person_name,
      facts: [
        person.country,
        person.first_year ? `First competed ${person.first_year}` : null,
      ].filter((f): f is string => Boolean(f)),
    },
    legacyMemberId:     null,
    historicalPersonId: person.person_id,
  };
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
    // The administrator applying the link is the actor on every row the claim
    // writes; the member is its subject.
    const actor: ClaimActor = { type: 'admin', id: adminMemberId };
    if (legacyId) {
      claimLegacyAccountInTx(item.entity_id, legacyId, 'admin_vetted_evidence', actor);
    } else {
      claimHistoricalPersonInTx(item.entity_id, personId, 'admin_vetted_evidence', actor);
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

/** The member names an administrator correction may rewrite. */
export interface MemberNameCorrection {
  givenNames:  string;
  familyName:  string;
  displayName: string;
}

export type CorrectMemberNamesResult =
  | { status: 'corrected'; changedFields: readonly string[] }
  | { status: 'unchanged' };

const MAX_CORRECTION_REASON = 500;

/** The member row a name correction resolves and validates against. */
function readNamesForCorrection(memberId: string): {
  family_name: string | null;
  given_names: string | null;
  real_name: string;
  display_name: string;
  is_system: number;
} {
  const row = account.findMemberForAdminRecord.get(memberId) as
    | {
        family_name: string | null;
        given_names: string | null;
        real_name: string;
        display_name: string;
        is_system: number;
        personal_data_purged_at: string | null;
      }
    | undefined;
  if (!row) throw new NotFoundError('No member with that id.');
  assertNotErased(row.personal_data_purged_at);
  return row;
}

/**
 * Refuse to write personal data onto an account whose personal data has been
 * erased.
 *
 * The row is an anonymized stub by then, and the erasure ledger records that it
 * was cleared. Writing a fresh legal name onto it would put personal data back
 * on a record that exists precisely to no longer carry any, and the audit row
 * for the correction would then hold that name permanently, since the ledger is
 * immutable and erasure cannot reach it.
 */
function assertNotErased(purgedAt: string | null): void {
  if (purgedAt) {
    throw new ConflictError(
      "This account's personal data has been erased, so it cannot be corrected.",
    );
  }
}

/**
 * Run a proposed correction's names through the rules and hand back what would
 * be recorded, writing nothing.
 *
 * The confirmation an administrator reads is produced from this, so the names
 * shown on it are the names the commit will write, and an illegal name is
 * refused before the administrator is asked to confirm anything.
 */
function previewMemberNames(memberId: string, input: MemberNameCorrection): MemberNames {
  const row = readNamesForCorrection(memberId);
  const names = normalizeMemberNames(input.givenNames, input.familyName, input.displayName);
  validateMemberNames(names, { isPlatformAccount: row.is_system === 1 });
  return names;
}

/**
 * Rewrite a member's recorded legal name and display name on an
 * administrator's correction.
 *
 * The corrected names run the same rules a name runs at registration, through
 * the same function, so a correction cannot take a name registration would
 * refuse. The platform's own account is held to all of them but the
 * reserved-word rule, which exists to refuse a name claiming a position its
 * holder does not hold and which that account does hold.
 *
 * The profile slug is untouched, so the member's public address, their
 * provenance tags and their galleries all stay as they are; a profile URL
 * correction is a separate request.
 *
 * The audit row records each changed name before and after, alongside the
 * administrator, the member and the reason, because an administrator's
 * correction of someone else's record is reviewable and reversible only if the
 * trail says what the name actually was. The surface that reads it is
 * admin-only. The ledger is immutable, so a name recorded here outlives an
 * account erasure that clears it everywhere else.
 *
 * A correction that changes nothing writes nothing, rather than recording a
 * change that did not happen.
 */
function correctMemberNames(
  actorId: string,
  memberId: string,
  input: MemberNameCorrection,
  reasonText: string,
): CorrectMemberNamesResult {
  const row = readNamesForCorrection(memberId);

  const reason = reasonText.trim();
  if (!reason) {
    throw new ValidationError('Enter the reason for this correction.');
  }
  if (reason.length > MAX_CORRECTION_REASON) {
    throw new ValidationError(`The reason must be ${MAX_CORRECTION_REASON} characters or fewer.`);
  }

  const names = normalizeMemberNames(input.givenNames, input.familyName, input.displayName);
  validateMemberNames(names, { isPlatformAccount: row.is_system === 1 });

  // The three recorded names an administrator supplies. The assembled legal
  // name and the normalized display name follow from them, so recording these
  // three before and after is what makes the correction reversible from the
  // trail alone.
  const before: Record<string, string> = {};
  const after:  Record<string, string> = {};
  const noteChange = (field: string, was: string, now: string): void => {
    if (was === now) return;
    before[field] = was;
    after[field]  = now;
  };
  noteChange('given_names',  row.given_names ?? '', names.givenNames);
  noteChange('family_name',  row.family_name ?? '', names.familyName);
  noteChange('display_name', row.display_name,      names.displayName);

  const changedFields = Object.keys(after);
  if (changedFields.length === 0) return { status: 'unchanged' as const };

  const now = new Date().toISOString();
  transaction(() => {
    account.updateMemberNames.run(
      names.familyName || null,
      names.givenNames || null,
      names.realName,
      names.displayName,
      names.displayName.toLowerCase(),
      now,
      actorId,
      memberId,
    );
    appendAuditEntry({
      actionType:    'member.name_corrected',
      category:      'profile_change',
      actorType:     'admin',
      actorMemberId: actorId,
      entityType:    'member',
      entityId:      memberId,
      reasonText:    reason,
      metadata:      { fields: changedFields, before, after },
    });
  });
  // After the commit, and without the values: the recorded name is what a
  // member is identified by, so a correction to it is the case where the
  // address on file is most likely to be wrong too.
  notifyRecordCorrected(memberId, names.displayName, 'the name on your account', reason);
  return { status: 'corrected' as const, changedFields };
}

/**
 * Run a proposed profile URL through the rules and hand back the normalized
 * form, writing nothing.
 *
 * The confirmation an administrator reads is produced from this, so an address
 * the rules refuse is refused before they are asked to confirm it, the same way
 * the name correction behaves.
 */
/**
 * Tell a member an administrator corrected their record. Best-effort and after
 * the commit, so a delivery problem never unwinds a correction already made.
 * Carries what changed and why, never the values: the address on file may be
 * exactly what was wrong.
 */
function notifyRecordCorrected(
  memberId: string, displayName: string, whatChanged: string, reason: string,
): void {
  emailService.sendToMember({
    template: 'member_record_corrected',
    params:   { memberName: displayName, whatChanged, note: reason },
    memberId,
    idempotencyKey: `member-record-corrected:${memberId}:${new Date().toISOString()}`,
  });
}

function previewMemberSlug(memberId: string, requestedSlug: string): string {
  const row = account.findMemberForAdminRecord.get(memberId) as
    | { slug: string | null; is_system: number; personal_data_purged_at: string | null }
    | undefined;
  if (!row) throw new NotFoundError('No member with that id.');
  assertNotErased(row.personal_data_purged_at);

  const slug = requestedSlug.trim().toLowerCase();
  if (!slug) throw new ValidationError('Enter the new profile URL.');
  if (slug === row.slug) return slug;

  const parts = account.findNamePartsById.get(memberId) as
    | { family_name: string | null; given_names: string | null; real_name: string | null }
    | undefined;
  validateSlug(
    slug,
    memberSurnameKey({
      family_name: parts?.family_name ?? null,
      given_names: parts?.given_names ?? null,
      real_name:   parts?.real_name ?? '',
    }),
    { isPlatformAccount: row.is_system === 1 },
  );
  return slug;
}

export type CorrectMemberSlugResult =
  | { status: 'corrected'; before: string; after: string; mediaTagsMoved: number }
  | { status: 'unchanged' };

const UPLOADER_TAG_PREFIX = '#by_';

/**
 * Move a member's profile URL on an administrator's correction.
 *
 * The new URL runs the same rules registration applies, through the same
 * function, so a correction cannot take an address registration would refuse.
 *
 * A slug is not just a column. The member's uploader tag is `#by_<slug>`, every
 * upload of theirs carries it, and their galleries key their criteria on it. The
 * tag is therefore renamed in place, keeping its id: every media and gallery row
 * references the tag by id, so all of them follow that one write. The copy of
 * the tag text that `media_tags` keeps for display is refreshed alongside it.
 *
 * Gallery identifiers keep the spelling they were created with. They were fixed
 * when each gallery was made, three tables reference them, and re-keying would
 * break both those references and any address built from them. A gallery id is
 * an identifier rather than a name, and it still resolves.
 *
 * The old profile URL stops resolving and nothing redirects from it. That is a
 * real consequence for a member who has shared the old one, which is why the
 * surface says so before the correction is made.
 */
function correctMemberSlug(
  actorId: string,
  memberId: string,
  requestedSlug: string,
  reasonText: string,
): CorrectMemberSlugResult {
  const row = account.findMemberForAdminRecord.get(memberId) as
    | {
        id: string;
        slug: string | null;
        display_name: string;
        is_system: number;
        personal_data_purged_at: string | null;
      }
    | undefined;
  if (!row) throw new NotFoundError('No member with that id.');
  assertNotErased(row.personal_data_purged_at);

  const reason = reasonText.trim();
  if (!reason) throw new ValidationError('Enter the reason for this correction.');
  if (reason.length > MAX_CORRECTION_REASON) {
    throw new ValidationError(`The reason must be ${MAX_CORRECTION_REASON} characters or fewer.`);
  }

  const slug = requestedSlug.trim().toLowerCase();
  if (!slug) throw new ValidationError('Enter the new profile URL.');
  if (slug === row.slug) return { status: 'unchanged' as const };

  const parts = account.findNamePartsById.get(memberId) as
    | { family_name: string | null; given_names: string | null; real_name: string | null }
    | undefined;
  validateSlug(
    slug,
    memberSurnameKey({
      family_name: parts?.family_name ?? null,
      given_names: parts?.given_names ?? null,
      real_name:   parts?.real_name ?? '',
    }),
    { isPlatformAccount: row.is_system === 1 },
  );

  const before = row.slug ?? '';
  const now = new Date().toISOString();

  try {
    return transaction(() => {
      account.updateMemberSlug.run(slug, now, actorId, memberId);

      const renamed = `${UPLOADER_TAG_PREFIX}${slug}`;
      // An uploader tag for the requested address can already exist, left behind
      // by an erased account whose media survives. Renaming onto it would
      // collide, and the collision would surface as though another member held
      // the profile URL, which is a different and untrue thing to tell an
      // administrator. Say what is actually in the way.
      const occupied = account.findUploaderTag.get(renamed) as { id: string } | undefined;
      if (occupied) {
        throw new ConflictError(
          'An uploader tag for that profile URL already exists, left by an account that has since '
          + 'been erased. Choose a different profile URL.',
        );
      }

      let mediaTagsMoved = 0;
      const tag = account.findUploaderTag.get(`${UPLOADER_TAG_PREFIX}${before}`) as
        | { id: string; tag_normalized: string }
        | undefined;
      if (tag) {
        account.renameUploaderTag.run(renamed, renamed, now, actorId, tag.id);
        mediaTagsMoved = account.refreshMediaTagDisplay.run(renamed, now, actorId, tag.id).changes;
      }

      appendAuditEntry({
        actionType:    'member.slug_corrected',
        category:      'profile_change',
        actorType:     'admin',
        actorMemberId: actorId,
        entityType:    'member',
        entityId:      memberId,
        reasonText:    reason,
        metadata: {
          before,
          after: slug,
          uploader_tag_moved: Boolean(tag),
          media_tags_moved: mediaTagsMoved,
        },
      });

      // The consequence is named because it is the one the member bears: every
      // link they have already shared to the old address stops resolving the
      // moment this lands, and nothing redirects from it.
      notifyRecordCorrected(
        memberId, row.display_name,
        'your profile address, so links you have already shared to the old one no longer work',
        reason,
      );
      return { status: 'corrected' as const, before, after: slug, mediaTagsMoved };
    });
  } catch (err) {
    // The uploader-tag collision is caught inside the transaction and reported
    // for what it is, so the only unique constraint that can reach here is the
    // profile URL's own.
    if (isUniqueConstraintError(err)) {
      throw new ConflictError('Another member already holds that profile URL.');
    }
    throw err;
  }
}

export const identityAccessService = { attemptLogin, registerMember, lookupLegacyAccount, claimLegacyAccount, lookupHistoricalPersonForClaim, claimHistoricalPerson, claimHistoricalPersonInTx, claimCandidateInTx, claimWithFormerSurnameInTx, declineCandidate, recordClaimRefused, recordClaimStepAnswered, changePassword, verifyEmailByToken, resendVerifyEmail, requestPasswordReset, completePasswordReset, getLinkHistoryViewForWizard, revertAutoLink, revertClaimForDispute, listClaimedLegacyIdentities, declareAnchor, listDeclaredAnchors, submitLinkHelpRequest, approveLinkHelpRequest, rejectLinkHelpRequest, enforceHistoricalPersonClaimLimit, getClaimEvidenceForMember, getLinkCandidatesForAdmin, previewLinkHelpApproval, previewMemberNames, correctMemberNames, previewMemberSlug, correctMemberSlug };
