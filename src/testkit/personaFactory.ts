/**
 * Persona composition primitive.
 *
 * seedPersona builds a member plus all supporting rows from a single structured
 * PersonaSpec, composing the row-building primitives in personaRowBuilders.ts.
 * A persona's row shape is therefore identical whether instantiated in-process
 * for a Vitest test or seeded into the dev database for a browser session.
 *
 * Supported spec dimensions: tier grant + governance tier3, payment history,
 * onboarding progress (whole-wizard complete or per-task partial/skipped/
 * in-progress state), legacy-claim linkage (linked vs unlinked, optional
 * legacy_email for the email-equality fast path), graded auto-link confidence
 * (high/medium/low on the single-candidate path), club affiliation + bootstrap
 * leadership, additional plain club memberships (current/former), legacy-club-
 * candidate cards (pending/declined/resolved/junk), a recently-expired (or
 * active) Active Player grant, and mailing-list subscription state. The
 * exhaustive auto-link branch matrix (every low sub-reason) lives at the test
 * layer in tests/fixtures/autoLinkScenarios.ts.
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
  insertNameVariant,
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

/** Graded auto-link confidence bucket a persona instantiates. */
export type PersonaAutoLinkConfidence = 'high' | 'medium' | 'low';

/**
 * Normalize a name the way the auto-link classifier does for the matrix that
 * matters here: lowercase, strip combining diacritics, collapse whitespace.
 * Used only to write name_variants rows for the `medium` bucket; the persona's
 * classification is asserted against the real classifier in the coverage test,
 * which fails the build if this drifts from the service normalizer.
 */
export function normalizeNameForVariant(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The historical_persons.person_name to seed so the classifier resolves the
 * requested bucket against the member's real_name (single-candidate path):
 *   - high   → exact match (same name)
 *   - medium → same surname, an inserted middle token, linked by a
 *              name_variants row (the caller writes that row)
 *   - low    → an unrelated provenance name so no name candidate is found
 */
function autoLinkHpName(
  conf: PersonaAutoLinkConfidence,
  memberRealName: string,
  slug: string,
): string {
  if (conf === 'high') return memberRealName;
  if (conf === 'medium') {
    const parts = memberRealName.split(/\s+/);
    return parts.length > 1
      ? `${parts[0]} Middle ${parts.slice(1).join(' ')}`
      : `${memberRealName} Middle`;
  }
  return `Unmatched Provenance ${slug}`;
}

export interface PersonaPaymentSpec {
  type?: 'membership' | 'donation' | 'event_registration';
  status?: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded';
  amountCents?: number;
  purchasedTier?: 'tier1' | 'tier2' | null;
}

export interface PersonaLegacySpec {
  /** Display name on the legacy_members / historical_persons rows. */
  realName?: string;
  /**
   * When true, member.legacy_member_id is set and the legacy row is claimed by
   * this member (a completed claim). When false/omitted, the legacy match
   * exists but is unlinked (claim available to confirm).
   */
  linked?: boolean;
  /**
   * Seeds legacy_members.legacy_email. With an email present, the unlinked
   * persona exercises the email-equality claim fast path (and the
   * /claim/confirm/:token flow via the simulated-email card); null-email stubs
   * remain claimable through the historical-person card-confirm path.
   */
  legacyEmail?: string;
  /**
   * Seed the rows so the auto-link classifier resolves this (unlinked) persona
   * into the named confidence bucket on the single-candidate path: `high`
   * (exact name match), `medium` (same-surname variant via a name_variants
   * row), or `low` (no name candidate). Forces legacy_email to equal the
   * member's login email (the classifier's anchor) and seeds the historical_
   * persons provenance accordingly. Mutually exclusive with `linked` (an
   * already-claimed account is never re-offered). The exhaustive branch matrix
   * — including every low sub-reason — lives at the test layer in
   * tests/fixtures/autoLinkScenarios.ts.
   */
  autoLinkConfidence?: PersonaAutoLinkConfidence;
  /**
   * Seed this many extra historical_persons rows sharing the member's real_name
   * (no legacy back-link), on top of the provenance person. With the email
   * anchor in place the auto-link candidate query then returns more than one
   * match, so the classifier routes to the multiple-candidate review path the
   * onboarding wizard disambiguates. Pairs with autoLinkConfidence 'high' (whose
   * provenance person carries the exact member name), which supplies the anchor.
   */
  competingNameCandidates?: number;
  /**
   * Seeds the same date of birth on the member row and the legacy_members row,
   * so the auto-link classifier's date-of-birth tie-breaker fires. Paired with
   * competingNameCandidates, a matching birth date narrows a tied same-name
   * candidate set down to the provenance person (resolving what would otherwise
   * be a multiple-candidate review). The classifier compares member against
   * legacy only; historical_persons carries no birth date.
   */
  birthDate?: string;
  /**
   * Seeds a DIFFERENT date of birth on the legacy_members row than the member
   * carries (the member keeps birthDate). Confirming the claim links the account
   * anyway — a date-of-birth discrepancy never blocks — and raises a
   * claim_dob_mismatch_review work-queue item, so a maintainer can see a flagged
   * conflict end to end. Requires birthDate (the member side) to be set too, or
   * there is nothing to compare.
   */
  legacyBirthDate?: string;
  /**
   * Sets legacy_members.legacy_is_admin=1 on this persona's legacy row. With
   * `linked: true` it seeds the claimed-legacy-admin case: the legacy admin flag
   * must never confer a live admin role, so the member's own is_admin stays 0.
   */
  legacyIsAdmin?: boolean;
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
 * An Active Player grant. A past `expiresAt` models a recently-expired Active
 * Player status (exercising M_Active_Player_Expiry). Active Player lives on its
 * own ledger; membership tiers do not expire.
 */
export interface PersonaActivePlayerSpec {
  /** ISO timestamp for active_player_grants.new_active_player_expires_at. */
  expiresAt: string;
  reasonCode?: string;
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
   * Soft-deletion lifecycle position. 'grace_open' is within the restoration
   * window (login offers restore); 'grace_elapsed' is past the window, pre-purge
   * (login permanently rejected). The boundary pair around member_cleanup_grace_days.
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
   * CUTOVER-REMOVE. Non-prod (dev + staging) special user (David Leberknight)
   * built by real flows on first Switch rather than seeded: the seed/refresh
   * runners skip it, and the listing points its "Switch" at /dev/build-switch.
   */
  buildOnSwitch?: boolean;
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
  onboardingComplete?: boolean;
  /**
   * Per-task onboarding state (partial / skipped / in-progress). Takes
   * precedence over onboardingComplete when both are set; unlisted tasks are
   * left absent (the wizard treats a missing row as pending).
   */
  onboardingTasks?: Partial<Record<OnboardingTaskType, OnboardingTaskState>>;
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

  // Legacy match rows first (without the claim) so the member can FK-link to
  // them on insert. The claim back-reference (legacy_members.claimed_by_member_id
  // → members.id) is applied after the member row exists.
  if (spec.legacy) {
    const conf = spec.legacy.autoLinkConfidence;
    if (conf && spec.legacy.linked) {
      throw new Error(
        `persona '${spec.slug}': autoLinkConfidence requires an unlinked legacy match (omit linked)`,
      );
    }
    legacyMemberId = `legmem_persona_${spec.slug}`;
    // For a graded-confidence persona the HP provenance name is derived from
    // the bucket and the legacy email must equal the member's login email (the
    // classifier's anchor); otherwise both come straight from the spec.
    legacyDisplayName = conf
      ? autoLinkHpName(conf, memberRealName, spec.slug)
      : (spec.legacy.realName ?? memberRealName);
    const legacyEmail = conf ? memberLoginEmail : spec.legacy.legacyEmail;
    insertLegacyMember(db, {
      legacy_member_id: legacyMemberId,
      real_name: legacyDisplayName,
      ...(legacyEmail ? { legacy_email: legacyEmail } : {}),
      ...((spec.legacy.legacyBirthDate ?? spec.legacy.birthDate)
        ? { birth_date: spec.legacy.legacyBirthDate ?? spec.legacy.birthDate }
        : {}),
      ...(spec.legacy.legacyIsAdmin ? { legacy_is_admin: 1 as const } : {}),
    });
    personId = insertHistoricalPerson(db, {
      legacy_member_id: legacyMemberId,
      person_name: legacyDisplayName,
    });
    if (conf === 'medium') {
      // Link the member's real_name to the HP's middle-token form so the
      // classifier resolves a same-surname variant (not an exact) candidate.
      insertNameVariant(db, {
        canonical_normalized: normalizeNameForVariant(legacyDisplayName),
        variant_normalized: normalizeNameForVariant(memberRealName),
      });
    }
    // Extra same-name historical_persons with no legacy back-link turn the
    // single candidate into a competing set, so the candidate query returns more
    // than one match and the classifier hands the member a disambiguation choice.
    const competing = spec.legacy.competingNameCandidates ?? 0;
    for (let i = 0; i < competing; i++) {
      insertHistoricalPerson(db, {
        person_id: `person_persona_${spec.slug}_alt_${i + 1}`,
        person_name: legacyDisplayName,
      });
    }
  }

  // Soft-deletion lifecycle timestamps are relative to the seeding moment so the
  // restoration window resolves correctly whenever the persona is loaded: an open
  // grace is restorable on login, an elapsed one is past the window (pre-purge).
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
    ...(spec.emailVerified === false ? { email_verified_at: null } : {}),
    ...(spec.isDeceased ? { is_deceased: 1 as const, deceased_at: '2025-06-01T00:00:00.000Z' } : {}),
    ...(spec.honors?.hof ? { is_hof: 1 as const } : {}),
    ...(spec.honors?.bap ? { is_bap: 1 as const } : {}),
    ...(spec.honors?.board ? { is_board: 1 as const } : {}),
    ...deletionFields,
    ...(opts.passwordHash ? { password_hash: opts.passwordHash } : {}),
    ...(spec.legacy?.birthDate ? { birth_date: spec.legacy.birthDate } : {}),
    ...(spec.legacy?.linked ? { legacy_member_id: legacyMemberId } : {}),
  });

  // Complete the claim now that the member exists (upsert updates the existing
  // legacy_members row in place).
  if (spec.legacy?.linked) {
    insertLegacyMember(db, {
      legacy_member_id: legacyMemberId!,
      real_name: legacyDisplayName,
      ...(spec.legacy.legacyEmail ? { legacy_email: spec.legacy.legacyEmail } : {}),
      ...(spec.legacy.legacyIsAdmin ? { legacy_is_admin: 1 as const } : {}),
      claimed_by_member_id: memberId,
      claimed_at: '2025-01-01T00:00:00.000Z',
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
    });
  }

  if (spec.onboardingTasks) {
    for (const [taskType, state] of Object.entries(spec.onboardingTasks) as [
      OnboardingTaskType,
      OnboardingTaskState,
    ][]) {
      insertOnboardingTask(db, memberId, taskType, state);
    }
  } else if (spec.onboardingComplete) {
    completeOnboarding(db, memberId);
  }

  if (spec.activePlayer) {
    insertActivePlayerGrant(db, {
      member_id: memberId,
      change_type: 'grant',
      new_active_player_expires_at: spec.activePlayer.expiresAt,
      ...(spec.activePlayer.reasonCode ? { reason_code: spec.activePlayer.reasonCode } : {}),
    });
  }

  let clubId: string | undefined;
  if (spec.club) {
    clubId = insertClub(db, { name: spec.club.clubName ?? 'Persona Club' });
    insertMemberClubAffiliation(db, memberId, clubId, {
      is_current: 1,
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
    const cid = insertClub(db, { name: c.clubName ?? 'Persona Club' });
    insertMemberClubAffiliation(db, memberId, cid, {
      is_current: c.current === false ? 0 : 1,
      is_primary: c.primary ? 1 : 0,
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
      ? insertClub(db, { name: cand.clubName ?? 'Legacy Club Candidate' })
      : undefined;
    const candidateId = insertLegacyClubCandidate(db, {
      display_name: cand.clubName ?? 'Legacy Club Candidate',
      classification: cand.classification ?? 'onboarding_visible',
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
