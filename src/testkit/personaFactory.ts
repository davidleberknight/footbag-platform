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
  insertRecurringDonationSubscription,
  insertGivenNameVariant,
  insertMemberDeclaredAnchor,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertPersonaNamedGallery,
  setOnboardingHeldAnswer,
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
   * Stripe subscription id carried on the payment row. It marks the charge as
   * one made by a subscription; the recurring donation itself, which the
   * payments page lists and cancels, is the separate `recurringDonation` spec.
   */
  stripeSubscriptionId?: string;
  /**
   * The checkout session the payment came from. The page a member returns to
   * from an abandoned or failed checkout is addressed by this id, so a failed
   * payment without one cannot reach its Try Again page.
   */
  checkoutSessionId?: string;
}

/**
 * A recurring donation the payment provider is still collecting. The payments
 * page lists and cancels recurring donations from their own table, so a
 * persona needs this row, not only a payment carrying a subscription id.
 */
export interface PersonaRecurringDonationSpec {
  amountCents?: number;
  status?: 'active' | 'past_due' | 'canceled';
}

/**
 * Profile choices and contact state on the member row, each a gate some page
 * reads: who may find the member in search, which contact details other
 * members see, whether gender and competition history show, and whether mail
 * to the login address is still delivered.
 */
export interface PersonaProfileSpec {
  searchable?: boolean;
  emailVisibility?: 'private' | 'members';
  phone?: string;
  phoneVisible?: boolean;
  whatsapp?: string;
  whatsappVisible?: boolean;
  gender?: 'male' | 'female' | 'undisclosed';
  showGender?: boolean;
  showCompetitiveResults?: boolean;
  showFirstCompetitionYear?: boolean;
  emailStatus?: 'ok' | 'bounced' | 'complained' | 'suppressed';
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
   * Sets legacy_members.legacy_is_admin=1 on this persona's legacy row. With
   * `linked: true` it seeds the claimed-legacy-admin case: the legacy admin flag
   * must never confer a live admin role, so the member's own is_admin stays 0.
   */
  legacyIsAdmin?: boolean;
  /**
   * Flags the persona's record as belonging to someone who has died. A deceased
   * record is never offered for a claim, and an administrator can revert the
   * flag.
   */
  recordDeceased?: boolean;
  /**
   * The old account's billing history shows a lifetime Tier 1 membership, so a
   * claim of it grants Tier 1. Applied when onboarding completes, before the
   * club answers, which is how a new member can lead a club in the same step.
   */
  everPaidTier1Lifetime?: boolean;
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
  /** The club's lifecycle state; an inactive club is one a co-leader can reactivate. */
  status?: 'active' | 'inactive';
  /**
   * Hold this affiliation and role in the club another persona's `club`
   * seeded, by that persona's slug, instead of a club of its own: two
   * co-leaders of one club. That persona must come earlier in the catalog.
   */
  ofPersona?: string;
}

/**
 * A plain (non-leader) club affiliation. The `clubs` array lets a persona hold
 * several memberships at once, each current or former. The richer pending /
 * declined / junk legacy-club-candidate states are the separate
 * `legacyClubCandidates` dimension below.
 */
export interface PersonaClubAffiliationSpec {
  clubName?: string;
  /**
   * Join the club another persona's `club` seeded, by that persona's slug,
   * instead of creating a club of its own: the only way to put a plain member
   * and a co-leader in the same club. That persona must come earlier in the
   * catalog.
   */
  ofPersona?: string;
  /** Current membership (is_current=1) when true/omitted; former (0) when false. */
  current?: boolean;
  primary?: boolean;
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
  /**
   * Country and state on the candidate. A candidate with no live club yet is
   * created as a club when its card is confirmed, which needs a country and,
   * where the country is divided, a state; without them the card can only be
   * declined.
   */
  country?: string;
  region?: string;
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

/** A single member-owned named gallery seeded for this persona. It seeds empty:
 *  its media comes from a real upload, so the upload path is exercised rather
 *  than faked with a row that has no stored file. */
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
   * How long ago the member was marked deceased. Omitted means at seed time.
   * Past the configured revert window an administrator can no longer undo the
   * mark.
   */
  deceasedDaysAgo?: number;
  /** Profile choices and contact state; see PersonaProfileSpec. */
  profile?: PersonaProfileSpec;
  /** A recurring donation still being collected; see PersonaRecurringDonationSpec. */
  recurringDonation?: PersonaRecurringDonationSpec;
  /**
   * Story ids this persona serves (for example `M_Edit_Profile`), the same key
   * the success-criterion ledger uses, so a test can pick the personas for a
   * story without reading prose.
   */
  stories?: string[];
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
  /** One member-owned named gallery, seeded empty. */
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
   * Seed an open link-help request with no question on it. Only a member files
   * one, so this needs a completed onboarding. Implied by `adminQuestion`,
   * since a question always hangs off one of these.
   */
  linkHelpRequest?: boolean;
  /**
   * A prospective member holding a claim on another persona's old account, by
   * that account's legacy id. When the other persona already holds the account,
   * completing onboarding cannot apply the claim, which is the case that shows
   * the completion page's not-applied notice.
   */
  heldClaimOnAccount?: string;
  /**
   * Leadership cards for a prospective legacy-linked persona: a live club, and a
   * provisional bootstrap-leader row naming the persona's old account, which the
   * club step offers as a leadership card. Loader data, not a member-held row.
   */
  legacyLeadershipCandidates?: { clubName: string }[];
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
const PERSONA_CLUB_LOCATION = { region: 'CO', country: 'United States' } as const;

/** The id of the club a persona's `club` spec seeds. */
export function personaClubId(slug: string): string {
  return `club-test-persona-${slug}`;
}

/** Another persona's seeded club, which must exist already. */
function existingPersonaClub(db: BetterSqlite3.Database, slug: string, ofPersona: string): string {
  const id = personaClubId(ofPersona);
  if (!db.prepare(`SELECT 1 FROM clubs WHERE id = ?`).get(id)) {
    throw new Error(`persona '${slug}': joins the club of '${ofPersona}', which must be seeded first`);
  }
  return id;
}

/** The member-row columns a profile spec sets; the schema defaults hold otherwise. */
function profileColumns(p: PersonaProfileSpec | undefined) {
  if (!p) return {};
  const flag = (v: boolean | undefined) => (v === undefined ? undefined : (v ? 1 as const : 0 as const));
  const cols = {
    searchable: flag(p.searchable),
    email_visibility: p.emailVisibility,
    phone: p.phone,
    phone_visible: flag(p.phoneVisible),
    whatsapp: p.whatsapp,
    whatsapp_visible: flag(p.whatsappVisible),
    gender: p.gender,
    show_gender: flag(p.showGender),
    show_competitive_results: flag(p.showCompetitiveResults),
    show_first_competition_year: flag(p.showFirstCompetitionYear),
    email_status: p.emailStatus,
  };
  return Object.fromEntries(Object.entries(cols).filter(([, v]) => v !== undefined));
}

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
        ...(spec.legacy.everPaidTier1Lifetime ? { legacy_ever_paid_tier1_lifetime: 1 as const } : {}),
      });
    }
    const recordDeceased = spec.legacy.recordDeceased ? { is_deceased: 1 as const } : {};
    if (shape === 'pair') {
      personId = insertHistoricalPerson(db, {
        legacy_member_id: legacyMemberId,
        person_name: recordName,
        ...recordDeceased,
      });
    } else if (shape === 'record_only' || spec.legacy.separateRecord) {
      // A record with no account behind it: the persona's own record, or the
      // half of a split pair the pipeline never linked to its account.
      const recordId = insertHistoricalPerson(db, {
        person_id: `person_persona_${spec.slug}_rec`,
        person_name: recordName,
        ...recordDeceased,
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

  // A persona whose onboarding is not complete is a prospective member, who
  // holds nothing in a shared table: a claim and club answers are held on the
  // onboarding task rows, as the wizard holds them, and a club or leadership row
  // is a state no prospective member can be in.
  const prospective = spec.onboardingTasks !== undefined
    && (['personal_details', 'legacy_claim', 'club_affiliations'] as const)
      .some((t) => spec.onboardingTasks?.[t] !== 'completed');
  if (prospective && (spec.club || spec.clubs?.length)) {
    throw new Error(
      `persona '${spec.slug}': a prospective member holds no club or leadership rows; `
      + 'express club answers as legacyClubCandidates instead',
    );
  }
  const linkedNow = Boolean(spec.legacy?.linked) && !prospective;
  const personalDetailsAnswered = spec.onboardingTasks === undefined
    || spec.onboardingTasks.personal_details === 'completed';

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
    ...(spec.isDeceased
      ? {
        is_deceased: 1 as const,
        deceased_at: new Date(Date.now() - (spec.deceasedDaysAgo ?? 0) * DAY_MS).toISOString(),
      }
      : {}),
    ...profileColumns(spec.profile),
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
    // their own; the rest get a plausible default. Registration collects none
    // of the personal details, so a persona that has not yet answered that
    // step holds no date of birth and no location, as a real one does.
    ...(personalDetailsAnswered
      ? { birth_date: spec.legacy?.birthDate ?? '1985-07-21' }
      : { birth_date: null, city: null, region: null, country: null }),
    // A real claim takes the account and the record the pipeline linked to it
    // together, so a linked persona holds both. A prospective member's claim is
    // held instead, below.
    ...(linkedNow && legacyMemberId ? { legacy_member_id: legacyMemberId } : {}),
    ...(linkedNow && personId ? { historical_person_id: personId } : {}),
  });

  // Complete the account claim now that the member exists (upsert updates the
  // existing legacy_members row in place).
  if (linkedNow && spec.legacy && legacyMemberId) {
    const legacyEmail = spec.legacy.legacyEmailIsLogin ? memberLoginEmail : spec.legacy.legacyEmail;
    // The upsert rewrites every column it is given, so the account's date of
    // birth is passed again or the claim would erase it.
    const accountBirthDate = spec.legacy.legacyBirthDate ?? spec.legacy.birthDate;
    insertLegacyMember(db, {
      legacy_member_id: legacyMemberId,
      real_name: legacyDisplayName,
      ...(legacyEmail ? { legacy_email: legacyEmail.toLowerCase() } : {}),
      ...(accountBirthDate ? { birth_date: accountBirthDate } : {}),
      ...(spec.legacy.legacyIsAdmin ? { legacy_is_admin: 1 as const } : {}),
      ...(spec.legacy.everPaidTier1Lifetime ? { legacy_ever_paid_tier1_lifetime: 1 as const } : {}),
      claimed_by_member_id: memberId,
      claimed_at: new Date().toISOString(),
    });
  }

  for (const anchor of spec.declaredAnchors ?? []) {
    insertMemberDeclaredAnchor(db, {
      member_id: memberId,
      anchor_type: anchor.type,
      anchor_value: anchor.type === 'old_email' ? anchor.value.toLowerCase() : anchor.value,
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
      ...(p.checkoutSessionId !== undefined
        ? { stripe_checkout_session_id: p.checkoutSessionId }
        : {}),
    });
  }

  if (spec.recurringDonation) {
    insertRecurringDonationSubscription(db, {
      member_id: memberId,
      stripe_subscription_id: `sub_persona_${spec.slug}`,
      stripe_customer_id: `cus_persona_${spec.slug}`,
      status: spec.recurringDonation.status ?? 'active',
      ...(spec.recurringDonation.amountCents !== undefined
        ? { amount_cents: spec.recurringDonation.amountCents }
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
          last_attempt_opened_at: spec.legacyClaimTask.lastAttemptOpened ? new Date().toISOString() : null,
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
    // A deterministic id, so another persona can join this club by slug.
    clubId = spec.club.ofPersona
      ? existingPersonaClub(db, spec.slug, spec.club.ofPersona)
      : insertClub(db, {
        id: personaClubId(spec.slug),
        name: spec.club.clubName ?? 'Persona Club',
        publiclyVisible: true,
        ...PERSONA_CLUB_LOCATION,
        ...(spec.club.status ? { status: spec.club.status } : {}),
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
    let cid: string;
    if (c.ofPersona) {
      cid = existingPersonaClub(db, spec.slug, c.ofPersona);
    } else {
      cid = insertClub(db, {
        name: c.clubName ?? 'Persona Club',
        publiclyVisible: true,
        ...PERSONA_CLUB_LOCATION,
      });
    }
    insertMemberClubAffiliation(db, memberId, cid, {
      is_current: c.current === false ? 0 : 1,
      is_primary: derivePrimary(c.current !== false, c.primary === true),
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

  // A prospective member's answered cards are held answers on the club step,
  // in the order the spec lists them; the suggestion rows themselves stay
  // pending, because nothing is written until onboarding completes.
  const heldCardAnswers: unknown[] = [];
  for (const cand of spec.legacyClubCandidates ?? []) {
    if (!personId && !legacyMemberId) {
      throw new Error(
        `persona '${spec.slug}': legacyClubCandidates require a legacy identity (set legacy)`,
      );
    }
    const answered = cand.resolutionStatus ?? 'pending';
    const resolution = prospective ? 'pending' : answered;
    // confirmed_current must carry a resolved_club_id (schema CHECK), so a
    // resolved card implies a mapped club regardless of the `mapped` flag.
    const needsClub = cand.mapped === true || answered === 'confirmed_current';
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
      ...(cand.country ? { country: cand.country } : {}),
      ...(cand.region ? { region: cand.region } : {}),
      ...(mappedClubId ? { mapped_club_id: mappedClubId } : {}),
    });
    const affiliationId = insertLegacyPersonClubAffiliation(db, {
      legacy_club_candidate_id: candidateId,
      ...(personId ? { historical_person_id: personId } : { legacy_member_id: legacyMemberId }),
      resolution_status: resolution,
      ...(resolution === 'confirmed_current' && mappedClubId
        ? { resolved_club_id: mappedClubId }
        : {}),
      display_name: cand.clubName ?? 'Legacy Club Candidate',
    });
    if (prospective && answered !== 'pending') {
      heldCardAnswers.push({
        kind: 'card',
        card: 'membership',
        candidateId: affiliationId,
        userDecision: answered === 'confirmed_current' ? 'confirm' : 'decline',
        activitySignal: 'active',
        insightNote: null,
        promotion: null,
        heldAt: new Date().toISOString(),
      });
    }
  }

  // The prospective member's held answers, on the task rows seeded above.
  if (prospective && spec.legacy?.linked && legacyMemberId) {
    setOnboardingHeldAnswer(db, memberId, 'legacy_claim', {
      claim: {
        target: { accountId: legacyMemberId, recordId: null },
        withSurname: false,
        heldAt: new Date().toISOString(),
      },
    });
  }
  if (heldCardAnswers.length > 0) {
    setOnboardingHeldAnswer(db, memberId, 'club_affiliations', { answers: heldCardAnswers });
  }
  if (spec.heldClaimOnAccount) {
    if (!prospective) {
      throw new Error(`persona '${spec.slug}': heldClaimOnAccount needs an incomplete onboarding`);
    }
    setOnboardingHeldAnswer(db, memberId, 'legacy_claim', {
      claim: {
        target: { accountId: spec.heldClaimOnAccount, recordId: null },
        withSurname: false,
        heldAt: new Date().toISOString(),
      },
    });
  }
  for (const lead of spec.legacyLeadershipCandidates ?? []) {
    if (!prospective || !legacyMemberId) {
      throw new Error(
        `persona '${spec.slug}': legacyLeadershipCandidates need a prospective, legacy-linked persona`,
      );
    }
    const leadClubId = insertClub(db, {
      name: lead.clubName,
      publiclyVisible: true,
      ...PERSONA_CLUB_LOCATION,
    });
    const bootstrapLeaderId = insertClubBootstrapLeader(db, {
      club_id: leadClubId,
      legacy_member_id: legacyMemberId,
      status: 'provisional',
    });
    insertClubBootstrapLeaderSignal(db, {
      bootstrap_leader_id: bootstrapLeaderId,
      signal_type: 'listed_contact',
      is_present: 1,
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
