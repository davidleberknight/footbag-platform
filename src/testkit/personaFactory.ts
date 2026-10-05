/**
 * Persona composition primitive.
 *
 * seedPersona builds a member plus all supporting rows from a single structured
 * PersonaSpec, composing the row-building primitives in personaRowBuilders.ts.
 * A persona's row shape is therefore identical whether instantiated in-process
 * for a Vitest test or seeded into the dev database for a browser session.
 *
 * Supported spec dimensions: tier grant + governance tier3, payment history,
 * onboarding progress (a full member by default, or per-task pending state for
 * a persona modelling a pending registrant, with the claim step's
 * date-of-birth change count and last-attempt marker), the shape of the old
 * records the claim step can reach (an old account and the record the pipeline
 * linked to it, either alone, an unlinked split of the two, same-name
 * namesakes, a second account sharing the login address), what the member's
 * own evidence carries (login address on the account, declared anchors, a date
 * of birth, a nickname pair), a standing decline, club affiliation + bootstrap
 * leadership, additional plain club memberships (current/former), legacy-club-
 * candidate cards (pending/declined/resolved/junk), a recently-expired (or
 * active) Active Player grant, and mailing-list subscription state. Every
 * matching rule is tested on its own at the test layer; a persona seeds one
 * coherent journey through them.
 *
 * Detection markers (grep-able evidence a row originated from the harness;
 * the cutover audit confirms these are zero-residue in any production DB,
 * since the harness seeds only in development and staging):
 *   - member_tier_grants.reason_code = 'dev_persona_seed.tier_grant'
 *   - audit_entries.action_type      = 'testkit.persona_seed'    (seed)
 *   - audit_entries.action_type      = 'testkit.persona_switch'  (cookie issuance)
 *   - created_by / source            = 'dev-shortcuts/personas'
 *
 * These markers are non-sensitive and live here rather than in personaSecrets.ts:
 * the factory is imported in-process by Vitest (FOOTBAG_ENV unset), where
 * personaSecrets' production import-guard would throw. The sensitive persona
 * password literal stays behind that guard and is read only by the seed runner.
 */
import BetterSqlite3 from 'better-sqlite3';
import { SEEDED_PERSONA_MEMBER_ID_PREFIX } from '../lib/personaGuards';
import type { ExpectedAnswerKind } from '../services/memberMessageService';
import {
  insertMember,
  insertMemberTierGrant,
  insertPayment,
  completeOnboarding,
  insertOnboardingTask,
  insertActivePlayerGrant,
  insertMailingListSubscription,
  insertLegacyMember,
  insertHistoricalPerson,
  insertClub,
  insertClubLeader,
  insertMemberClubAffiliation,
  insertClubBootstrapLeader,
  insertClubBootstrapLeaderSignal,
  insertAuditEntry,
  insertWorkQueueItem,
  insertMemberMessage,
  insertGivenNameVariant,
  insertMemberDeclaredAnchor,
  insertLegacyClaimDecline,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertPersonaNamedGallery,
} from './personaRowBuilders';
import type {
  OnboardingTaskType,
  OnboardingTaskState,
  MailingListSubscriptionStatus,
  LegacyClubCandidateClassification,
} from './personaRowBuilders';

export const PERSONA_SEED_REASON_CODE = 'dev_persona_seed.tier_grant';
export const PERSONA_SEED_REASON_TEXT =
  'TEST PERSONA HARNESS. Not a real tier purchase. Remove before any production deploy.';
export const PERSONA_SEED_AUDIT_ACTION_TYPE = 'testkit.persona_seed';
export const PERSONA_SWITCH_AUDIT_ACTION_TYPE = 'testkit.persona_switch';
export const PERSONA_LOGIN_AUDIT_ACTION_TYPE = 'testkit.persona_login';
export const PERSONA_REFRESH_AUDIT_ACTION_TYPE = 'testkit.persona_refresh';
export const PERSONA_SEED_CREATED_BY = 'dev-shortcuts/personas';

/**
 * Disclaimer that opens every seeded persona's profile About text, so a tester
 * who switches in and views the profile is never misled into reading it as a
 * real member.
 */
export const TEST_PERSONA_BIO_PREFIX =
  'Test persona for the footbag platform development and staging harness, not a real member profile.';

export type PersonaTier = 'tier0' | 'tier1' | 'tier2' | 'tier3';

export interface PersonaPaymentSpec {
  type?: 'membership' | 'donation' | 'event_registration';
  status?: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded';
  amountCents?: number;
  purchasedTier?: 'tier1' | 'tier2' | null;
  /**
   * Stripe subscription id, which makes the payment a recurring donation rather
   * than a one-off. The member-facing cancel route is addressed by this id, so
   * a persona without one cannot reach that surface at all.
   */
  stripeSubscriptionId?: string;
}

/**
 * The old records a persona's claim step can reach, and what the member's own
 * evidence carries against them. Every id is deterministic per slug, so the
 * refresh runner finds every row a persona seeded:
 *   - the old account:                 legmem_persona_<slug>
 *   - a second account (shared login): legmem_persona_<slug>_twin
 *   - a record with no account behind: person_persona_<slug>_rec
 *   - same-name namesake records:      person_persona_<slug>_alt_<n>
 */
export interface PersonaLegacySpec {
  /** The name on the old account and its record. Defaults to the member's real name. */
  realName?: string;
  /**
   * The name on the record when it differs from the account's, as a record
   * found through a nickname carries the long form of a first name.
   */
  recordName?: string;
  /**
   * What exists in the archive: an old account and the record the pipeline
   * linked to it (`pair`, the default), an old account with no record, or a
   * record with no account behind it.
   */
  shape?: 'pair' | 'account_only' | 'record_only';
  /**
   * When true, the member already holds the account and its linked record (a
   * completed claim, which takes both). When false/omitted the records are
   * unclaimed and the claim step can reach them.
   */
  linked?: boolean;
  /** An address in the account's first email slot (an old address). */
  legacyEmail?: string;
  /**
   * Put the member's own login address in the account's first email slot, so
   * the verified sign-in address reaches it and corroborates it.
   */
  legacyEmailIsLogin?: boolean;
  /**
   * Seed a second old account carrying the member's login address in its second
   * slot. An address that reaches two accounts is no key at all, so neither is
   * reached through it, and the administrator sees the ambiguity.
   */
  ambiguousLoginEmailTwin?: boolean;
  /**
   * The member's date of birth, written to the member row and, unless
   * legacyBirthDate overrides it, to the old account. An identical date
   * corroborates the account.
   */
  birthDate?: string;
  /**
   * A different date on the old account than the member carries. A date that
   * does not match fails to corroborate and never counts against the member.
   */
  legacyBirthDate?: string;
  /**
   * Seed a record with the same name and no account link alongside an
   * account-only shape: the member's account and record the pipeline left
   * unlinked, of which the claim step offers both and the member claims one.
   */
  separateRecord?: boolean;
  /** Same-name records with no account behind them, beside the persona's own. */
  namesakeRecords?: number;
  /**
   * A curated nickname pair to seed, tying the member's first name (short) to
   * the record's (long). Persona-owned: the refresh runner removes it.
   */
  nicknamePair?: { short: string; long: string };
  /**
   * The member has already said "This Is Not Me" to this candidate: a standing
   * decline naming the account and its record.
   */
  declined?: boolean;
  /**
   * Sets legacy_members.legacy_is_admin=1 on this persona's legacy row. With
   * `linked: true` it seeds the claimed-legacy-admin case: the legacy admin flag
   * must never confer a live admin role, so the member's own is_admin stays 0.
   */
  legacyIsAdmin?: boolean;
}

export interface PersonaAdminQuestionSpec {
  /** The one-line subject the member sees before opening the question. */
  subject: string;
  /** The administrator's question, read only on the member's own surface. */
  body: string;
  /**
   * What the answer must come back as. Typed from the service that owns the
   * vocabulary rather than re-spelled here, so a kind added there cannot leave
   * the harness seeding a value the application refuses.
   */
  answerKind: ExpectedAnswerKind;
  /**
   * Seed the question already answered, for the administrator's side of the
   * round trip. Omit for a question still waiting on the member.
   */
  answer?: {
    outcome: 'acknowledged' | 'confirmed' | 'corrected';
    note?: string;
  };
}

export interface PersonaClubSpec {
  clubName?: string;
  /**
   * When true, also writes a club_bootstrap_leaders row claimed by this member
   * plus one leadership signal, so the persona reads as a confirmed club leader.
   */
  leader?: boolean;
  /**
   * When set, writes a live club_leaders co-leader row — the table the
   * club-content authorization gate reads. Co-leaders are a flat equal set
   * (the only role); a member co-leads at most one club. Distinct from
   * `leader` (the bootstrap claim).
   */
  role?: 'co-leader';
}

/**
 * A plain (non-leader) club affiliation. The `clubs` array lets a persona hold
 * several memberships at once, each current or former. The richer pending /
 * declined / junk legacy-club-candidate states are the separate
 * `legacyClubCandidates` dimension below.
 */
export interface PersonaClubAffiliationSpec {
  clubName?: string;
  /** Current membership (is_current=1) when true/omitted; former (0) when false. */
  current?: boolean;
  primary?: boolean;
  contact?: boolean;
}

/**
 * A legacy-club-candidate card the onboarding wizard surfaces for this persona.
 * Models the loader-produced apparatus: a legacy_club_candidates row (its
 * `classification` governs visibility — `junk` with no mapped club is
 * suppressed) joined to a legacy_person_club_affiliations row whose
 * `resolutionStatus` is the card's state (pending → shown for review,
 * rejected → declined, confirmed_current → resolved to a mapped club).
 * Requires the persona to carry a legacy identity (`legacy`), since the
 * affiliation hangs off its historical_persons / legacy_members provenance.
 */
export interface PersonaLegacyClubCandidateSpec {
  clubName?: string;
  /**
   * City on the candidate (and its mapped club, when one is seeded). The
   * wizard groups same-city membership suggestions into one single-select
   * disambiguation card, so two candidates sharing a city model that card.
   */
  city?: string;
  /** legacy_club_candidates.classification; default 'onboarding_visible'. */
  classification?: LegacyClubCandidateClassification;
  /** legacy_person_club_affiliations.resolution_status; default 'pending'. */
  resolutionStatus?: 'pending' | 'confirmed_current' | 'rejected';
  /**
   * Seed a real mapped club (sets candidate.mapped_club_id, and
   * affiliation.resolved_club_id when confirmed_current — the schema requires
   * the latter pairing). Implied true when resolutionStatus is
   * 'confirmed_current'.
   */
  mapped?: boolean;
}

/**
 * An Active Player grant, expressed as a distance from seed time because every
 * persona holding one claims a time-relative state: current, or recently
 * expired. A fixed calendar date cannot hold either claim, since a future date
 * eventually arrives and turns a current-status persona into an expired one
 * without a word, and a past date drifts further from "recent" every day. The
 * deletion-grace personas already compute their windows this way; this is the
 * same rule. Active Player lives on its own ledger; membership tiers do not
 * expire.
 */
export interface PersonaActivePlayerSpec {
  /**
   * Days from seed time to `active_player_grants.new_active_player_expires_at`.
   * Positive is a current grant, negative a lapsed one.
   */
  expiresInDays: number;
  reasonCode?: string;
}

const DAY_MS = 86_400_000;

/** Resolve an Active Player spec's day offset against seed time. */
export function activePlayerExpiresAt(
  spec: PersonaActivePlayerSpec,
  now: number = Date.now(),
): string {
  return new Date(now + spec.expiresInDays * DAY_MS).toISOString();
}

export interface PersonaMailingListSpec {
  /** mailing_lists slug; defaults to a shared 'announce' list. */
  listSlug?: string;
  listName?: string;
  status?: MailingListSubscriptionStatus;
}

/** A single member-owned named gallery seeded for this persona, with one
 *  matching uploaded media item so it has a non-zero item count. */
export interface PersonaGallerySpec {
  /** Stable gallery id; defaults to gallery_persona_<slug>. */
  id?: string;
  name: string;
  description?: string;
}

export interface PersonaSpec {
  /** Member slug; also the `?as=` key for /dev/switch. */
  slug: string;
  displayName: string;
  realName?: string;
  loginEmail?: string;
  tier: PersonaTier;
  /** Required when tier === 'tier3'; the post-governance underlying tier. */
  underlyingTier?: 'tier1' | 'tier2';
  isAdmin?: boolean;
  /**
   * Email-verified state. Omitted/true seeds a verified account; false leaves
   * email_verified_at NULL, the registered-unverified state whose login is
   * blocked until verification and which the member search excludes.
   */
  emailVerified?: boolean;
  /** Marks the member deceased (login blocked, search-excluded, honors preserved on render). */
  isDeceased?: boolean;
  /**
   * Soft-deletion lifecycle position, the boundary pair around
   * member_cleanup_grace_days. Both are refused at sign-in identically, because
   * the platform offers no restore; what separates them is the purge. A
   * 'grace_open' row is not yet eligible for the anonymising purge and a
   * 'grace_elapsed' row is, which is the only behaviour that reads the boundary.
   */
  deletionState?: 'grace_open' | 'grace_elapsed';
  /** Standing honors. HoF/BAP are lifetime; Board is the Tier 3 governance flag. */
  honors?: { hof?: boolean; bap?: boolean; board?: boolean };
  /**
   * Authorization axis this persona belongs to, used to group the /dev/personas
   * catalog so it reads as a coverage matrix.
   */
  dimension?: string;
  /** One sentence: what code path / gate this persona exists to exercise. */
  purpose?: string;
  /**
   * Plain-words how a tester uses this persona and what to verify when acting as
   * it. Distinct from `purpose` (why it exists): this is the testing recipe a
   * tester reads on /dev/personas before clicking Switch.
   */
  testingUsage: string;
  /**
   * Set when the persona's backing feature is not built yet, naming the missing
   * feature or table. A blocked persona is never seeded (the seed runner skips
   * it) and renders greyed on /dev/personas, so the catalog shows the full
   * deployed-spread coverage matrix including the test cases that arrive with a
   * future feature.
   */
  blockedBy?: string;
  /**
   * Plain-English user story this persona traces to: the real-world scenario its
   * not-yet-built feature serves, shown beside a blocked persona.
   */
  userStory?: string;
  /**
   * Marks an adjacent-owner / unauthorized actor whose value is the deny half of
   * the authorization matrix (owns a resource of the same type, but not this one).
   */
  negative?: boolean;
  /**
   * Per-task onboarding state, for a persona that models a pending registrant.
   * Membership is an authorization level, so a persona is a full member unless
   * this says otherwise: setting it seeds exactly the states listed, an empty
   * object seeds a fresh signup with no task rows at all, and omitting it
   * completes onboarding. A task named here but left out of the object is
   * absent, which the wizard reads as pending.
   */
  onboardingTasks?: Partial<Record<OnboardingTaskType, OnboardingTaskState>>;
  /**
   * The claim step's own markers on the legacy_claim task row: date-of-birth
   * changes already made while onboarding, and whether the "I had one but cannot
   * find it" answer has already opened the one last attempt. Requires
   * onboardingTasks to name legacy_claim.
   */
  legacyClaimTask?: { birthDateChanges?: number; lastAttemptOpened?: boolean };
  /** Former surnames and old email addresses the member has already declared. */
  declaredAnchors?: Array<{ type: 'former_surname' | 'old_email'; value: string }>;
  payments?: PersonaPaymentSpec[];
  legacy?: PersonaLegacySpec;
  club?: PersonaClubSpec;
  /** Additional plain club memberships (current or former) beyond `club`. */
  clubs?: PersonaClubAffiliationSpec[];
  /** One member-owned named gallery (with one matching media item). */
  gallery?: PersonaGallerySpec;
  /** Legacy-club-candidate cards (pending / declined / resolved / junk). */
  legacyClubCandidates?: PersonaLegacyClubCandidateSpec[];
  activePlayer?: PersonaActivePlayerSpec;
  /**
   * A link-help request already raised by this member, and an administrator's
   * question already put to them about it. Seeds the state a
   * maintainer needs to explore both sides of the question channel: the
   * member's answer surface, and the queue card that shows the answer coming
   * back. Requires onboarding to be complete, because an unfinished registrant
   * cannot reach the page a question is read on and the channel refuses to send
   * one to them.
   */
  adminQuestion?: PersonaAdminQuestionSpec;
  /**
   * Seed an open link-help request with no question on it, for the case where
   * the platform refuses to put one: the member has not finished signing up, so
   * the page a question is read on is closed to them. Implied by
   * `adminQuestion`, since a question always hangs off one of these.
   */
  linkHelpRequest?: boolean;
  mailingList?: PersonaMailingListSpec | PersonaMailingListSpec[];
  /** Testing dimensions this persona exercises. Must be non-empty. */
  coverageNotes: string[];
}

export interface Persona {
  slug: string;
  memberId: string;
  tier: PersonaTier;
  isAdmin: boolean;
  legacyMemberId?: string;
  personId?: string;
  clubId?: string;
}

export interface SeedPersonaOpts {
  /**
   * Pre-computed argon2 hash applied to the member so a tester can also log in
   * through the normal form. Omitted in-process (tests use the cheap default
   * placeholder and authenticate via cookie issuance instead).
   */
  passwordHash?: string;
}

/**
 * The About text a seeded persona shows on its profile: the harness disclaimer
 * followed by the persona's purpose, so the profile itself explains what the
 * persona exists to test. Both this and the /dev/personas card read from
 * `purpose`, so the card and the profile can never drift.
 */
// A seeded club carries a complete location for the same reason a seeded member
// does: the clubs directory groups a country's clubs by state or province, and
// a region-less row is real data-quality evidence there. Personas that left the
// region blank made the development database look like it held a location gap
// the curated club seed does not actually have.
const PERSONA_CLUB_LOCATION = { region: 'CO', country: 'USA' } as const;

export function composePersonaBio(spec: PersonaSpec): string {
  return spec.purpose
    ? `${TEST_PERSONA_BIO_PREFIX} ${spec.purpose}`
    : TEST_PERSONA_BIO_PREFIX;
}

/**
 * Build a member plus its supporting rows from a spec. Idempotency and env
 * gating are the caller's concern (the seed runner and /dev/switch enforce the
 * dev/staging boot guard); this is a pure composition over the row builders.
 */
export function seedPersona(
  db: BetterSqlite3.Database,
  spec: PersonaSpec,
  opts: SeedPersonaOpts = {},
): Persona {
  // The member-id prefix is load-bearing for the pre-go-live curated-media
  // guardrail: the curator service refuses curated writes from any member whose
  // id carries it. Build it from the shared constant; do not inline a different
  // prefix here without updating the guard in lockstep.
  const memberId = `${SEEDED_PERSONA_MEMBER_ID_PREFIX}${spec.slug}`;
  const isAdmin = spec.isAdmin ? 1 : 0;

  const memberLoginEmail = spec.loginEmail ?? `${spec.slug}@personas.test`;
  const memberRealName = spec.realName ?? spec.displayName;

  let legacyMemberId: string | undefined;
  let personId: string | undefined;
  let legacyDisplayName: string | undefined;

  // Old records first (without the claim) so the member can FK-link to them on
  // insert. The claim back-reference (legacy_members.claimed_by_member_id →
  // members.id) is applied after the member row exists.
  if (spec.legacy) {
    const shape = spec.legacy.shape ?? 'pair';
    legacyDisplayName = spec.legacy.realName ?? memberRealName;
    const recordName = spec.legacy.recordName ?? legacyDisplayName;
    if (shape !== 'record_only') {
      legacyMemberId = `legmem_persona_${spec.slug}`;
      const legacyEmail = spec.legacy.legacyEmailIsLogin ? memberLoginEmail : spec.legacy.legacyEmail;
      const accountBirthDate = spec.legacy.legacyBirthDate ?? spec.legacy.birthDate;
      insertLegacyMember(db, {
        legacy_member_id: legacyMemberId,
        real_name: legacyDisplayName,
        ...(legacyEmail ? { legacy_email: legacyEmail.toLowerCase() } : {}),
        ...(accountBirthDate ? { birth_date: accountBirthDate } : {}),
        ...(spec.legacy.legacyIsAdmin ? { legacy_is_admin: 1 as const } : {}),
      });
    }
    if (shape === 'pair') {
      personId = insertHistoricalPerson(db, {
        legacy_member_id: legacyMemberId,
        person_name: recordName,
      });
    } else if (shape === 'record_only' || spec.legacy.separateRecord) {
      // A record with no account behind it: the persona's own record, or the
      // half of a split pair the pipeline never linked to its account.
      const recordId = insertHistoricalPerson(db, {
        person_id: `person_persona_${spec.slug}_rec`,
        person_name: recordName,
      });
      if (shape === 'record_only') personId = recordId;
    }
    if (spec.legacy.ambiguousLoginEmailTwin) {
      // Another person's old account carrying the same address as a secondary,
      // so the login address reaches two accounts and neither through it.
      insertLegacyMember(db, {
        legacy_member_id: `legmem_persona_${spec.slug}_twin`,
        real_name: `Other ${spec.slug.replace(/[^a-z]/gi, '')}`,
        legacy_email2: memberLoginEmail.toLowerCase(),
      });
    }
    // Same-name records with no account behind them: namesakes the claim step
    // shows beside the persona's own, strongest first.
    for (let i = 0; i < (spec.legacy.namesakeRecords ?? 0); i++) {
      insertHistoricalPerson(db, {
        person_id: `person_persona_${spec.slug}_alt_${i + 1}`,
        person_name: recordName,
      });
    }
    if (spec.legacy.nicknamePair) {
      insertGivenNameVariant(db, {
        short_form_normalized: spec.legacy.nicknamePair.short,
        long_form_normalized: spec.legacy.nicknamePair.long,
      });
    }
  }

  // Soft-deletion lifecycle timestamps are relative to the seeding moment so the
  // grace boundary resolves correctly whenever the persona is loaded: an open
  // grace is not yet purge-eligible, an elapsed one is (and neither can sign in).
  const deletionFields: {
    deleted_at?: string;
    deletion_requested_at?: string;
    deletion_grace_expires_at?: string;
  } = {};
  if (spec.deletionState) {
    const GRACE_DAYS = 90; // member_cleanup_grace_days default
    const DAY_MS = 86_400_000;
    const now = Date.now();
    if (spec.deletionState === 'grace_open') {
      const deletedAt = new Date(now - DAY_MS).toISOString();
      deletionFields.deleted_at = deletedAt;
      deletionFields.deletion_requested_at = deletedAt;
      deletionFields.deletion_grace_expires_at = new Date(now + (GRACE_DAYS - 1) * DAY_MS).toISOString();
    } else {
      const deletedAt = new Date(now - (GRACE_DAYS + 30) * DAY_MS).toISOString();
      deletionFields.deleted_at = deletedAt;
      deletionFields.deletion_requested_at = deletedAt;
      deletionFields.deletion_grace_expires_at = new Date(now - 30 * DAY_MS).toISOString();
    }
  }

  insertMember(db, {
    id: memberId,
    slug: spec.slug,
    login_email: memberLoginEmail,
    real_name: memberRealName,
    display_name: spec.displayName,
    bio: composePersonaBio(spec),
    is_admin: isAdmin as 0 | 1,
    // Task rows are seeded below from the spec: explicit per-task states for
    // onboarding personas, completed for everyone else. insertMember must not
    // pre-seed them, because its completed default would win the
    // UNIQUE(member_id, task_type) race and turn an intended pending state
    // into a loud seed failure.
    onboarding: 'none',
    ...(spec.emailVerified === false ? { email_verified_at: null } : {}),
    ...(spec.isDeceased ? { is_deceased: 1 as const, deceased_at: '2025-06-01T00:00:00.000Z' } : {}),
    ...(spec.honors?.hof ? { is_hof: 1 as const } : {}),
    ...(spec.honors?.bap ? { is_bap: 1 as const } : {}),
    ...(spec.honors?.board ? { is_board: 1 as const } : {}),
    ...deletionFields,
    ...(opts.passwordHash ? { password_hash: opts.passwordHash } : {}),
    // Every real member has a date of birth: the onboarding wizard requires one
    // before anyone becomes a member at all, and the profile edit form requires
    // it on save. A persona seeded without one is not a state a real member can
    // be in, and exploring their profile would hit a validation error that no
    // member would ever meet. Personas that exercise the matching anchor set
    // their own; the rest get a plausible default.
    birth_date: spec.legacy?.birthDate ?? '1985-07-21',
    // A real claim takes the account and the record the pipeline linked to it
    // together, so a linked persona holds both.
    ...(spec.legacy?.linked && legacyMemberId ? { legacy_member_id: legacyMemberId } : {}),
    ...(spec.legacy?.linked && personId ? { historical_person_id: personId } : {}),
  });

  // Complete the account claim now that the member exists (upsert updates the
  // existing legacy_members row in place).
  if (spec.legacy?.linked && legacyMemberId) {
    const legacyEmail = spec.legacy.legacyEmailIsLogin ? memberLoginEmail : spec.legacy.legacyEmail;
    insertLegacyMember(db, {
      legacy_member_id: legacyMemberId,
      real_name: legacyDisplayName,
      ...(legacyEmail ? { legacy_email: legacyEmail.toLowerCase() } : {}),
      ...(spec.legacy.legacyIsAdmin ? { legacy_is_admin: 1 as const } : {}),
      claimed_by_member_id: memberId,
      claimed_at: '2025-01-01T00:00:00.000Z',
    });
  }

  for (const anchor of spec.declaredAnchors ?? []) {
    insertMemberDeclaredAnchor(db, {
      member_id: memberId,
      anchor_type: anchor.type,
      anchor_value: anchor.type === 'old_email' ? anchor.value.toLowerCase() : anchor.value,
    });
  }

  if (spec.legacy?.declined) {
    insertLegacyClaimDecline(db, {
      member_id: memberId,
      legacy_member_id: legacyMemberId ?? null,
      historical_person_id: personId ?? null,
    });
  }

  if (spec.tier !== 'tier0') {
    if (spec.tier === 'tier3') {
      if (!spec.underlyingTier) {
        throw new Error(`persona '${spec.slug}': tier3 requires underlyingTier`);
      }
      insertMemberTierGrant(db, {
        member_id: memberId,
        change_type: 'governance_set',
        new_tier_status: 'tier3',
        new_underlying_tier_status: spec.underlyingTier,
        reason_code: PERSONA_SEED_REASON_CODE,
        reason_text: PERSONA_SEED_REASON_TEXT,
      });
    } else {
      insertMemberTierGrant(db, {
        member_id: memberId,
        new_tier_status: spec.tier,
        reason_code: PERSONA_SEED_REASON_CODE,
        reason_text: PERSONA_SEED_REASON_TEXT,
      });
    }
  }

  for (const p of spec.payments ?? []) {
    insertPayment(db, {
      member_id: memberId,
      payment_type: p.type ?? 'membership',
      status: p.status ?? 'succeeded',
      ...(p.amountCents !== undefined ? { amount_cents: p.amountCents } : {}),
      ...(p.purchasedTier !== undefined ? { purchased_tier_status: p.purchasedTier } : {}),
      ...(p.stripeSubscriptionId !== undefined
        ? { stripe_subscription_id: p.stripeSubscriptionId }
        : {}),
    });
  }

  // Membership is an authorization level, so a persona is a full member unless
  // its spec says otherwise: explicit onboardingTasks seed exactly the declared
  // states (an empty object means a fresh signup with no task rows at all);
  // every other persona completes onboarding, because a pending account has no
  // profile page and reaches no member capability, which would invalidate the
  // persona's own purpose.
  if (spec.legacyClaimTask && !spec.onboardingTasks?.legacy_claim) {
    throw new Error(`persona '${spec.slug}': legacyClaimTask requires onboardingTasks to name legacy_claim`);
  }
  if (spec.onboardingTasks) {
    for (const [taskType, state] of Object.entries(spec.onboardingTasks) as [
      OnboardingTaskType,
      OnboardingTaskState,
    ][]) {
      const claimMarkers = taskType === 'legacy_claim' && spec.legacyClaimTask
        ? {
          birth_date_changes: spec.legacyClaimTask.birthDateChanges ?? null,
          last_attempt_opened_at: spec.legacyClaimTask.lastAttemptOpened ? '2026-01-01T00:00:00.000Z' : null,
        }
        : {};
      insertOnboardingTask(db, memberId, taskType, state, claimMarkers);
    }
  } else {
    completeOnboarding(db, memberId);
  }

  if (spec.activePlayer) {
    insertActivePlayerGrant(db, {
      member_id: memberId,
      change_type: 'grant',
      new_active_player_expires_at: activePlayerExpiresAt(spec.activePlayer),
      ...(spec.activePlayer.reasonCode ? { reason_code: spec.activePlayer.reasonCode } : {}),
    });
  }

  // A member holding any current club affiliation holds exactly one primary,
  // and the first current club is that primary unless a spec names another.
  // Deriving it here rather than reading a flag off each entry is what stops a
  // spec that simply omits the flag from seeding a member who is the secondary
  // member of their only club — a state no path through the application can
  // produce, and one the partial unique index cannot catch because it enforces
  // at most one primary, never at least one.
  const specNamesPrimary = (spec.clubs ?? []).some((c) => c.primary && c.current !== false);
  let currentClubsWritten = 0;
  const derivePrimary = (isCurrent: boolean, wantsPrimary: boolean): 0 | 1 => {
    if (!isCurrent) return 0;
    currentClubsWritten += 1;
    if (specNamesPrimary) return wantsPrimary ? 1 : 0;
    return currentClubsWritten === 1 ? 1 : 0;
  };

  let clubId: string | undefined;
  if (spec.club) {
    // Persona clubs are reachable public pages the route-wiring crawl exercises,
    // so they use ordinary public tags; they keep the 'club-test-' id for teardown.
    clubId = insertClub(db, {
      name: spec.club.clubName ?? 'Persona Club',
      publiclyVisible: true,
      ...PERSONA_CLUB_LOCATION,
    });
    insertMemberClubAffiliation(db, memberId, clubId, {
      is_current: 1,
      is_primary: derivePrimary(true, false),
      source: 'member_self_service',
    });
    if (spec.club.leader) {
      // Bootstrap-leader rows join historical_persons on legacy_member_id, so
      // ensure a legacy identity exists to hang the leadership claim on.
      const leaderLegacyId = legacyMemberId ?? `legmem_persona_${spec.slug}_club`;
      if (!legacyMemberId) {
        insertLegacyMember(db, {
          legacy_member_id: leaderLegacyId,
          real_name: spec.realName ?? spec.displayName,
        });
        insertHistoricalPerson(db, {
          legacy_member_id: leaderLegacyId,
          person_name: spec.realName ?? spec.displayName,
        });
      }
      const bootstrapLeaderId = insertClubBootstrapLeader(db, {
        club_id: clubId,
        legacy_member_id: leaderLegacyId,
        claimed_member_id: memberId,
        status: 'claimed',
      });
      insertClubBootstrapLeaderSignal(db, {
        bootstrap_leader_id: bootstrapLeaderId,
        signal_type: 'listed_contact',
        is_present: 1,
      });
    }
    if (spec.club.role) {
      insertClubLeader(db, { club_id: clubId, member_id: memberId });
    }
  }

  for (const c of spec.clubs ?? []) {
    const cid = insertClub(db, {
      name: c.clubName ?? 'Persona Club',
      publiclyVisible: true,
      ...PERSONA_CLUB_LOCATION,
    });
    insertMemberClubAffiliation(db, memberId, cid, {
      is_current: c.current === false ? 0 : 1,
      is_primary: derivePrimary(c.current !== false, c.primary === true),
      is_contact: c.contact ? 1 : 0,
      source: 'member_self_service',
    });
  }

  if (spec.gallery) {
    insertPersonaNamedGallery(db, {
      galleryId: spec.gallery.id ?? `gallery_persona_${spec.slug}`,
      ownerMemberId: memberId,
      ownerSlug: spec.slug,
      name: spec.gallery.name,
      ...(spec.gallery.description !== undefined ? { description: spec.gallery.description } : {}),
    });
  }

  for (const cand of spec.legacyClubCandidates ?? []) {
    if (!personId && !legacyMemberId) {
      throw new Error(
        `persona '${spec.slug}': legacyClubCandidates require a legacy identity (set legacy)`,
      );
    }
    const resolution = cand.resolutionStatus ?? 'pending';
    // confirmed_current must carry a resolved_club_id (schema CHECK), so a
    // resolved card implies a mapped club regardless of the `mapped` flag.
    const needsClub = cand.mapped === true || resolution === 'confirmed_current';
    const mappedClubId = needsClub
      ? insertClub(db, {
          name: cand.clubName ?? 'Legacy Club Candidate',
          publiclyVisible: true,
          ...PERSONA_CLUB_LOCATION,
          ...(cand.city ? { city: cand.city } : {}),
        })
      : undefined;
    const candidateId = insertLegacyClubCandidate(db, {
      display_name: cand.clubName ?? 'Legacy Club Candidate',
      classification: cand.classification ?? 'onboarding_visible',
      ...(cand.city ? { city: cand.city } : {}),
      ...(mappedClubId ? { mapped_club_id: mappedClubId } : {}),
    });
    insertLegacyPersonClubAffiliation(db, {
      legacy_club_candidate_id: candidateId,
      ...(personId ? { historical_person_id: personId } : { legacy_member_id: legacyMemberId }),
      resolution_status: resolution,
      ...(resolution === 'confirmed_current' && mappedClubId
        ? { resolved_club_id: mappedClubId }
        : {}),
      display_name: cand.clubName ?? 'Legacy Club Candidate',
    });
  }

  const mailingLists = spec.mailingList
    ? Array.isArray(spec.mailingList)
      ? spec.mailingList
      : [spec.mailingList]
    : [];
  for (const ml of mailingLists) {
    insertMailingListSubscription(db, {
      member_id: memberId,
      ...(ml.listSlug ? { list_slug: ml.listSlug } : {}),
      ...(ml.listName ? { list_name: ml.listName } : {}),
      ...(ml.status ? { status: ml.status } : {}),
    });
  }

  // The open link-help request an administrator adjudicates. Seeded rather than
  // driven, because raising it means walking the whole wizard first, which is a
  // different persona's job. A question always hangs off one of these, so
  // declaring a question implies the item.
  const wantsLinkHelpItem = spec.linkHelpRequest === true || spec.adminQuestion !== undefined;
  const linkHelpItemId = wantsLinkHelpItem
    ? insertWorkQueueItem(db, {
      entity_id:   memberId,
      task_type:   'member_link_help_request',
      reason_text: 'The member asked for help linking their old account.',
      detail_text: 'The member could not find their record in the wizard and asked an '
        + 'administrator to link it for them.',
    })
    : null;

  if (spec.adminQuestion && linkHelpItemId) {
    insertMemberMessage(db, {
      recipient_member_id:  memberId,
      work_queue_item_id:   linkHelpItemId,
      subject:              spec.adminQuestion.subject,
      body_text:            spec.adminQuestion.body,
      expected_answer_kind: spec.adminQuestion.answerKind,
      answer: spec.adminQuestion.answer
        ? {
          outcome:   spec.adminQuestion.answer.outcome,
          note_text: spec.adminQuestion.answer.note ?? null,
        }
        : undefined,
    });
  }

  // Holding the admin role carries an admin-alerts subscription: that is the
  // steady state every provisioned or granted admin reaches, so a seeded admin
  // matches the invariant and the admin-alerts fan-out has a target to capture.
  // An explicit admin-alerts entry in the spec (a bounced-subscription edge
  // case, say) wins, so seed the default only when none is declared.
  const declaresAdminAlerts = mailingLists.some(
    (ml) => (ml.listSlug ?? 'announce') === 'admin-alerts',
  );
  if (isAdmin === 1 && !declaresAdminAlerts) {
    insertMailingListSubscription(db, {
      member_id: memberId,
      list_slug: 'admin-alerts',
      list_name: 'Admin Alerts',
      status: 'subscribed',
    });
  }

  insertAuditEntry(db, {
    created_by: PERSONA_SEED_CREATED_BY,
    actor_type: 'system',
    action_type: PERSONA_SEED_AUDIT_ACTION_TYPE,
    entity_type: 'member',
    entity_id: memberId,
    category: 'identity',
    reason_text: PERSONA_SEED_REASON_TEXT,
    metadata: { slug: spec.slug, tier: spec.tier },
  });

  return {
    slug: spec.slug,
    memberId,
    tier: spec.tier,
    isAdmin: isAdmin === 1,
    ...(legacyMemberId ? { legacyMemberId } : {}),
    ...(personId ? { personId } : {}),
    ...(clubId ? { clubId } : {}),
  };
}
