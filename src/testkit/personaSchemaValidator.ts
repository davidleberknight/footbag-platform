/**
 * Schema validation for per-developer .local/test-personas.json entries.
 *
 * The canonical catalog (canonicalPersonas.ts) is maintainer-curated and
 * type-checked at compile time, so it never reaches this validator's throw
 * paths. The .local extension is hand-edited JSON with no compiler behind it;
 * a typo'd field or a stale enum value would otherwise surface as an opaque DB
 * constraint violation deep inside seedPersona. This validator runs first and
 * fails loudly, naming the offending slug and field, so the tester fixes the
 * JSON instead of reading a SQLite error.
 *
 * The allowed-value sets below are derived from the PersonaSpec nested types via
 * `satisfies Record<Union, true>`: adding a variant to a union without adding it
 * here is a compile error, so the validator cannot silently drift from the spec.
 *
 * loadLocalPersonas is the single loader shared by the seed runner (seeds the
 * merged catalog) and the /dev/personas listing route (renders it), so the page
 * always reflects exactly what a seed would load.
 */
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { stripJsonComments, TEST_PERSONA_DEV_FILE_PATH } from './seedCli';
import type {
  PersonaSpec,
  PersonaTier,
  PersonaPaymentSpec,
  PersonaAutoLinkConfidence,
  PersonaLegacyClubCandidateSpec,
} from './personaFactory';
import type {
  OnboardingTaskType,
  OnboardingTaskState,
  MailingListSubscriptionStatus,
  LegacyClubCandidateClassification,
} from './personaRowBuilders';

// ── Allowed-value sets (kept in lock-step with the PersonaSpec unions) ────────

type PaymentType = NonNullable<PersonaPaymentSpec['type']>;
type PaymentStatus = NonNullable<PersonaPaymentSpec['status']>;

const TIERS = ['tier0', 'tier1', 'tier2', 'tier3'] satisfies PersonaTier[];
const UNDERLYING_TIERS = ['tier1', 'tier2'] as const;
const PAYMENT_TYPES = Object.keys({
  membership: true,
  donation: true,
  event_registration: true,
} satisfies Record<PaymentType, true>) as PaymentType[];
const PAYMENT_STATUSES = Object.keys({
  pending: true,
  succeeded: true,
  failed: true,
  canceled: true,
  refunded: true,
} satisfies Record<PaymentStatus, true>) as PaymentStatus[];
const PURCHASED_TIERS = ['tier1', 'tier2'] as const;
const ONBOARDING_TASK_TYPES = Object.keys({
  personal_details: true,
  legacy_claim: true,
  club_affiliations: true,
} satisfies Record<OnboardingTaskType, true>) as OnboardingTaskType[];
const ONBOARDING_TASK_STATES = Object.keys({
  pending: true,
  in_progress_paused: true,
  skipped: true,
  completed: true,
  not_applicable: true,
} satisfies Record<OnboardingTaskState, true>) as OnboardingTaskState[];
const MAILING_LIST_STATUSES = Object.keys({
  subscribed: true,
  unsubscribed: true,
  bounced: true,
  complained: true,
  suppressed: true,
} satisfies Record<MailingListSubscriptionStatus, true>) as MailingListSubscriptionStatus[];
const AUTO_LINK_CONFIDENCES = Object.keys({
  high: true,
  medium: true,
  low: true,
} satisfies Record<PersonaAutoLinkConfidence, true>) as PersonaAutoLinkConfidence[];
const LEGACY_CLUB_CLASSIFICATIONS = Object.keys({
  pre_populate: true,
  onboarding_visible: true,
  dormant: true,
  junk: true,
} satisfies Record<LegacyClubCandidateClassification, true>) as LegacyClubCandidateClassification[];
type ClubCandidateResolution = NonNullable<PersonaLegacyClubCandidateSpec['resolutionStatus']>;
const CLUB_CANDIDATE_RESOLUTIONS = Object.keys({
  pending: true,
  confirmed_current: true,
  rejected: true,
} satisfies Record<ClubCandidateResolution, true>) as ClubCandidateResolution[];

const DELETION_STATES = ['grace_open', 'grace_elapsed'] as const;
const CLUB_ROLES = ['leader', 'co-leader'] as const;

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'slug',
  'displayName',
  'realName',
  'loginEmail',
  'tier',
  'underlyingTier',
  'isAdmin',
  'emailVerified',
  'isDeceased',
  'deletionState',
  'honors',
  'dimension',
  'purpose',
  'negative',
  'onboardingComplete',
  'onboardingTasks',
  'payments',
  'legacy',
  'club',
  'clubs',
  'legacyClubCandidates',
  'activePlayer',
  'mailingList',
  'coverageNotes',
]);

// ── Small assertion helpers ───────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function quoteList(values: readonly string[]): string {
  return values.join('|');
}

// ── Per-entry validation ──────────────────────────────────────────────────────

/**
 * Validate one parsed entry against the PersonaSpec contract, throwing a single
 * Error naming the slug + the failing field on the first violation. Returns the
 * entry typed as PersonaSpec on success. `label` locates the entry (e.g. the
 * file path + array index) for messages where the slug itself is missing.
 */
export function validatePersonaSpec(entry: unknown, label: string): PersonaSpec {
  if (!isObject(entry)) {
    throw new Error(`${label}: must be an object`);
  }
  const e = entry;

  // slug first: it is both a required field and the identifier every later
  // message carries, so validate it before anything else can reference it.
  if (!isNonEmptyString(e.slug)) {
    throw new Error(`${label}: slug must be a non-empty string`);
  }
  const slug = e.slug;
  const fail = (msg: string): never => {
    throw new Error(`${label} (slug=${slug}): ${msg}`);
  };

  for (const key of Object.keys(e)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      fail(`unknown field '${key}'`);
    }
  }

  if (!isNonEmptyString(e.displayName)) fail('displayName must be a non-empty string');
  if (e.realName !== undefined && !isNonEmptyString(e.realName)) {
    fail('realName must be a non-empty string when present');
  }
  if (e.loginEmail !== undefined && !isNonEmptyString(e.loginEmail)) {
    fail('loginEmail must be a non-empty string when present');
  }
  if (!TIERS.includes(e.tier as PersonaTier)) {
    fail(`tier must be one of ${quoteList(TIERS)}`);
  }
  if (e.tier === 'tier3') {
    if (!UNDERLYING_TIERS.includes(e.underlyingTier as (typeof UNDERLYING_TIERS)[number])) {
      fail(`underlyingTier is required for tier3 and must be one of ${quoteList(UNDERLYING_TIERS)}`);
    }
  } else if (
    e.underlyingTier !== undefined &&
    !UNDERLYING_TIERS.includes(e.underlyingTier as (typeof UNDERLYING_TIERS)[number])
  ) {
    fail(`underlyingTier must be one of ${quoteList(UNDERLYING_TIERS)} when present`);
  }
  if (e.isAdmin !== undefined && typeof e.isAdmin !== 'boolean') {
    fail('isAdmin must be a boolean when present');
  }
  if (e.onboardingComplete !== undefined && typeof e.onboardingComplete !== 'boolean') {
    fail('onboardingComplete must be a boolean when present');
  }
  if (e.emailVerified !== undefined && typeof e.emailVerified !== 'boolean') {
    fail('emailVerified must be a boolean when present');
  }
  if (e.isDeceased !== undefined && typeof e.isDeceased !== 'boolean') {
    fail('isDeceased must be a boolean when present');
  }
  if (
    e.deletionState !== undefined &&
    !DELETION_STATES.includes(e.deletionState as (typeof DELETION_STATES)[number])
  ) {
    fail(`deletionState must be one of ${quoteList(DELETION_STATES)} when present`);
  }
  if (e.honors !== undefined) {
    if (!isObject(e.honors)) fail('honors must be an object');
    for (const [key, val] of Object.entries(e.honors as Record<string, unknown>)) {
      if (!['hof', 'bap', 'board'].includes(key)) fail(`honors key '${key}' must be one of hof|bap|board`);
      if (typeof val !== 'boolean') fail(`honors.${key} must be a boolean`);
    }
  }
  if (e.dimension !== undefined && !isNonEmptyString(e.dimension)) {
    fail('dimension must be a non-empty string when present');
  }
  if (e.purpose !== undefined && !isNonEmptyString(e.purpose)) {
    fail('purpose must be a non-empty string when present');
  }
  if (e.negative !== undefined && typeof e.negative !== 'boolean') {
    fail('negative must be a boolean when present');
  }

  if (e.onboardingTasks !== undefined) {
    if (!isObject(e.onboardingTasks)) fail('onboardingTasks must be an object');
    for (const [taskType, state] of Object.entries(e.onboardingTasks as Record<string, unknown>)) {
      if (!ONBOARDING_TASK_TYPES.includes(taskType as OnboardingTaskType)) {
        fail(`onboardingTasks key '${taskType}' must be one of ${quoteList(ONBOARDING_TASK_TYPES)}`);
      }
      if (!ONBOARDING_TASK_STATES.includes(state as OnboardingTaskState)) {
        fail(`onboardingTasks.${taskType} must be one of ${quoteList(ONBOARDING_TASK_STATES)}`);
      }
    }
  }

  if (e.payments !== undefined) {
    if (!Array.isArray(e.payments)) fail('payments must be an array');
    (e.payments as unknown[]).forEach((p, i) => {
      if (!isObject(p)) fail(`payments[${i}] must be an object`);
      const pay = p as Record<string, unknown>;
      if (pay.type !== undefined && !PAYMENT_TYPES.includes(pay.type as PaymentType)) {
        fail(`payments[${i}].type must be one of ${quoteList(PAYMENT_TYPES)}`);
      }
      if (pay.status !== undefined && !PAYMENT_STATUSES.includes(pay.status as PaymentStatus)) {
        fail(`payments[${i}].status must be one of ${quoteList(PAYMENT_STATUSES)}`);
      }
      if (pay.amountCents !== undefined && typeof pay.amountCents !== 'number') {
        fail(`payments[${i}].amountCents must be a number when present`);
      }
      if (
        pay.purchasedTier !== undefined &&
        pay.purchasedTier !== null &&
        !PURCHASED_TIERS.includes(pay.purchasedTier as (typeof PURCHASED_TIERS)[number])
      ) {
        fail(`payments[${i}].purchasedTier must be one of ${quoteList(PURCHASED_TIERS)} or null`);
      }
    });
  }

  if (e.legacy !== undefined) {
    if (!isObject(e.legacy)) fail('legacy must be an object');
    const legacy = e.legacy as Record<string, unknown>;
    if (legacy.linked !== undefined && typeof legacy.linked !== 'boolean') {
      fail('legacy.linked must be a boolean when present');
    }
    if (legacy.realName !== undefined && !isNonEmptyString(legacy.realName)) {
      fail('legacy.realName must be a non-empty string when present');
    }
    if (legacy.legacyEmail !== undefined && !isNonEmptyString(legacy.legacyEmail)) {
      fail('legacy.legacyEmail must be a non-empty string when present');
    }
    if (
      legacy.autoLinkConfidence !== undefined &&
      !AUTO_LINK_CONFIDENCES.includes(legacy.autoLinkConfidence as PersonaAutoLinkConfidence)
    ) {
      fail(`legacy.autoLinkConfidence must be one of ${quoteList(AUTO_LINK_CONFIDENCES)} when present`);
    }
    if (legacy.autoLinkConfidence !== undefined && legacy.linked === true) {
      fail('legacy.autoLinkConfidence requires an unlinked match (omit legacy.linked)');
    }
    if (legacy.legacyIsAdmin !== undefined && typeof legacy.legacyIsAdmin !== 'boolean') {
      fail('legacy.legacyIsAdmin must be a boolean when present');
    }
  }

  if (e.club !== undefined) {
    if (!isObject(e.club)) fail('club must be an object');
    const club = e.club as Record<string, unknown>;
    if (club.clubName !== undefined && !isNonEmptyString(club.clubName)) {
      fail('club.clubName must be a non-empty string when present');
    }
    if (club.leader !== undefined && typeof club.leader !== 'boolean') {
      fail('club.leader must be a boolean when present');
    }
    if (club.role !== undefined && !CLUB_ROLES.includes(club.role as (typeof CLUB_ROLES)[number])) {
      fail(`club.role must be one of ${quoteList(CLUB_ROLES)} when present`);
    }
  }

  if (e.clubs !== undefined) {
    if (!Array.isArray(e.clubs)) fail('clubs must be an array');
    (e.clubs as unknown[]).forEach((c, i) => {
      if (!isObject(c)) fail(`clubs[${i}] must be an object`);
      const club = c as Record<string, unknown>;
      if (club.clubName !== undefined && !isNonEmptyString(club.clubName)) {
        fail(`clubs[${i}].clubName must be a non-empty string when present`);
      }
      for (const flag of ['current', 'primary', 'contact'] as const) {
        if (club[flag] !== undefined && typeof club[flag] !== 'boolean') {
          fail(`clubs[${i}].${flag} must be a boolean when present`);
        }
      }
    });
  }

  if (e.legacyClubCandidates !== undefined) {
    if (!Array.isArray(e.legacyClubCandidates)) fail('legacyClubCandidates must be an array');
    if (e.legacy === undefined) {
      fail('legacyClubCandidates require a legacy identity (set legacy)');
    }
    (e.legacyClubCandidates as unknown[]).forEach((c, i) => {
      if (!isObject(c)) fail(`legacyClubCandidates[${i}] must be an object`);
      const cand = c as Record<string, unknown>;
      if (cand.clubName !== undefined && !isNonEmptyString(cand.clubName)) {
        fail(`legacyClubCandidates[${i}].clubName must be a non-empty string when present`);
      }
      if (
        cand.classification !== undefined &&
        !LEGACY_CLUB_CLASSIFICATIONS.includes(cand.classification as LegacyClubCandidateClassification)
      ) {
        fail(`legacyClubCandidates[${i}].classification must be one of ${quoteList(LEGACY_CLUB_CLASSIFICATIONS)}`);
      }
      if (
        cand.resolutionStatus !== undefined &&
        !CLUB_CANDIDATE_RESOLUTIONS.includes(cand.resolutionStatus as ClubCandidateResolution)
      ) {
        fail(`legacyClubCandidates[${i}].resolutionStatus must be one of ${quoteList(CLUB_CANDIDATE_RESOLUTIONS)}`);
      }
      if (cand.mapped !== undefined && typeof cand.mapped !== 'boolean') {
        fail(`legacyClubCandidates[${i}].mapped must be a boolean when present`);
      }
    });
  }

  if (e.activePlayer !== undefined) {
    if (!isObject(e.activePlayer)) fail('activePlayer must be an object');
    const ap = e.activePlayer as Record<string, unknown>;
    if (!isNonEmptyString(ap.expiresAt)) {
      fail('activePlayer.expiresAt must be a non-empty ISO timestamp string');
    }
    if (ap.reasonCode !== undefined && !isNonEmptyString(ap.reasonCode)) {
      fail('activePlayer.reasonCode must be a non-empty string when present');
    }
  }

  if (e.mailingList !== undefined) {
    const lists = Array.isArray(e.mailingList) ? e.mailingList : [e.mailingList];
    lists.forEach((ml, i) => {
      const where = Array.isArray(e.mailingList) ? `mailingList[${i}]` : 'mailingList';
      if (!isObject(ml)) fail(`${where} must be an object`);
      const list = ml as Record<string, unknown>;
      if (list.listSlug !== undefined && !isNonEmptyString(list.listSlug)) {
        fail(`${where}.listSlug must be a non-empty string when present`);
      }
      if (list.listName !== undefined && !isNonEmptyString(list.listName)) {
        fail(`${where}.listName must be a non-empty string when present`);
      }
      if (
        list.status !== undefined &&
        !MAILING_LIST_STATUSES.includes(list.status as MailingListSubscriptionStatus)
      ) {
        fail(`${where}.status must be one of ${quoteList(MAILING_LIST_STATUSES)}`);
      }
    });
  }

  if (!Array.isArray(e.coverageNotes) || e.coverageNotes.length === 0) {
    fail('coverageNotes must be a non-empty array');
  }
  (e.coverageNotes as unknown[]).forEach((note, i) => {
    if (!isNonEmptyString(note)) fail(`coverageNotes[${i}] must be a non-empty string`);
  });

  return e as unknown as PersonaSpec;
}

// ── File loader ───────────────────────────────────────────────────────────────

/**
 * Read .local/test-personas.json (JSONC-tolerant), validating every entry. The
 * file is per-developer and gitignored, so it is absent on a staging box (and
 * on a fresh clone) — in which case this returns []. A present-but-malformed
 * file throws, naming the file and the failing entry.
 */
export function loadLocalPersonas(repoRoot: string): PersonaSpec[] {
  const fullPath = path.join(repoRoot, TEST_PERSONA_DEV_FILE_PATH);
  if (!existsSync(fullPath)) return [];
  const raw = readFileSync(fullPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(raw));
  } catch (err) {
    throw new Error(`${TEST_PERSONA_DEV_FILE_PATH}: not valid JSON (${(err as Error).message})`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${TEST_PERSONA_DEV_FILE_PATH}: top-level must be an array of persona specs`);
  }
  return parsed.map((entry, i) => validatePersonaSpec(entry, `${TEST_PERSONA_DEV_FILE_PATH}[${i}]`));
}
