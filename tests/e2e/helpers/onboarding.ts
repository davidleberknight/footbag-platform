/**
 * Shared helpers for onboarding wizard E2E tests.
 * Provides DB assertion helpers and persona composition functions
 * that build on the existing factory/persona infrastructure.
 */
import BetterSqlite3 from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
  insertGivenNameVariant,
  insertMemberDeclaredAnchor,
  insertTag,
  insertClub,
  insertClubLeader,
  insertClubBootstrapLeader,
  insertClubBootstrapLeaderSignal,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertOnboardingTask,
  createMemberAtTier,
  createTestSessionJwt,
  insertSystemConfig,
} from '../../fixtures/factories';
import {
  seedBrandNewPlayer as _seedBrandNewPlayer,
  seedTier0Member as _seedTier0Member,
  seedTier1Member as _seedTier1Member,
  seedMemberMidWizard as _seedMemberMidWizard,
  seedMemberWithPendingClubAffiliation as _seedMemberWithPendingClubAffiliation,
  type Persona,
} from '../../fixtures/personas';

const TS = '2025-01-01T00:00:00.000Z';

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${rand()}-${Date.now()}@example.com`;
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

// ── E2E DB setup ─────────────────────────────────────────────────────────────

// Raises the claim-confirmation and anchor-addition buckets, which the browser
// suite shares across every spec in one run.
export function raiseClaimRateLimits(db: BetterSqlite3.Database): void {
  const now = new Date().toISOString();
  const keys = [
    'hp_claim_rate_limit_max_per_ip',
    'hp_claim_rate_limit_max_per_member',
    'declared_anchor_rate_limit_max_per_member',
  ];
  for (const key of keys) {
    const id = `sc-e2e-${key}`;
    // The original statement used OR IGNORE because this helper runs once per
    // spec against a stack that may already carry the row; the lookup keeps that
    // repeat-safe behaviour, which the factory does not provide.
    const existing = db.prepare('SELECT 1 FROM system_config WHERE id = ?').get(id);
    if (existing) continue;
    insertSystemConfig(db, {
      id,
      created_at: now,
      config_key: key,
      value_json: '999',
      reason_text: 'e2e rate limit raise',
    });
  }
}

// ── DB assertion helpers ─────────────────────────────────────────────────────

export function getTaskState(db: BetterSqlite3.Database, memberId: string, taskType: string): string | null {
  const row = db.prepare(
    'SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = ?',
  ).get(memberId, taskType) as { state: string } | undefined;
  return row?.state ?? null;
}

export function getMemberField(db: BetterSqlite3.Database, memberId: string, field: string): unknown {
  const row = db.prepare(`SELECT ${field} FROM members WHERE id = ?`).get(memberId) as Record<string, unknown> | undefined;
  return row?.[field] ?? null;
}

export function isLegacyClaimed(db: BetterSqlite3.Database, legacyMemberId: string): boolean {
  const row = db.prepare(
    'SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?',
  ).get(legacyMemberId) as { claimed_by_member_id: string | null } | undefined;
  return row?.claimed_by_member_id != null;
}

export function countTierGrants(db: BetterSqlite3.Database, memberId: string, reasonCode: string): number {
  return (db.prepare(
    'SELECT COUNT(*) AS c FROM member_tier_grants WHERE member_id = ? AND reason_code = ?',
  ).get(memberId, reasonCode) as { c: number }).c;
}

export function getAffiliationStatus(db: BetterSqlite3.Database, affiliationId: string): string | null {
  const row = db.prepare(
    'SELECT resolution_status FROM legacy_person_club_affiliations WHERE id = ?',
  ).get(affiliationId) as { resolution_status: string } | undefined;
  return row?.resolution_status ?? null;
}

// Marks personal_details complete for a member. The legacy_claim and
// club_affiliations steps only render once personal_details is on file, so a
// spec that drives those steps directly (without walking the personal_details
// form first) seeds this so the wizard does not redirect back to it.
export function completePersonalDetails(db: BetterSqlite3.Database, memberId: string): void {
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
}

// Marks everything before the club step complete. The steps are answered in
// order, so a spec that drives the club step directly seeds both of the steps
// ahead of it or the wizard sends it back to the first one still unanswered.
export function completeThroughLegacyClaim(
  db: BetterSqlite3.Database,
  memberId: string,
): void {
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
  insertOnboardingTask(db, memberId, 'legacy_claim', 'completed');
}

// ── Claim-step persona composition ───────────────────────────────────────────
//
// The claim step's name key scans every account and record in the database,
// and the whole browser suite shares one database, so every name a seed uses
// is a fresh letters-only word: a digit-free name is a valid legal name, and a
// unique one keeps one spec's records from appearing as another member's cards.

export function nameWord(): string {
  const letters = Array.from(randomBytes(9)).map((b) => String.fromCharCode(97 + (b % 26))).join('');
  return `Q${letters}`;
}

// A pending registrant past personal details, so the claim step renders.
function seedPendingClaimant(
  db: BetterSqlite3.Database,
  prefix: string,
  overrides: { real_name: string; login_email?: string; birth_date?: string | null },
): Persona {
  const memberId = `${prefix}-${rand()}`;
  const slug = `${prefix}_${rand()}`;
  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier0',
    memberOverrides: {
      onboarding: 'none',
      login_email: overrides.login_email ?? uniqueEmail(prefix),
      real_name: overrides.real_name,
      birth_date: overrides.birth_date ?? '1990-06-15',
    },
  });
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
  return { memberId, slug, cookieHeader: cookieFor(memberId), tier: 'tier0', isAdmin: false };
}

// A competition record with no old account behind it under the member's name,
// or, with `nickname`, under a nickname of the member's first name (seeded as a
// curated pair), which the record's confirmation page flags as a first-name
// difference.
export function seedMemberWithRecordOnly(
  db: BetterSqlite3.Database,
  opts: { nickname?: boolean; personalDetailsDone?: boolean } = {},
): Persona & { personId: string; personName: string } {
  const first = nameWord();
  const surname = nameWord();
  const recordFirst = opts.nickname ? nameWord() : first;
  if (opts.nickname) {
    insertGivenNameVariant(db, {
      short_form_normalized: recordFirst.toLowerCase(),
      long_form_normalized: first.toLowerCase(),
    });
  }
  const personName = `${recordFirst} ${surname}`;
  const personId = insertHistoricalPerson(db, {
    person_id: `hp-ro-${rand()}`,
    person_name: personName,
    country: 'US',
    first_year: 2003,
  });
  const persona = opts.personalDetailsDone === false
    ? seedRegistrantBeforePersonalDetails(db, `${first} ${surname}`)
    : seedPendingClaimant(db, 'ro', { real_name: `${first} ${surname}` });
  return { ...persona, personId, personName };
}

function seedRegistrantBeforePersonalDetails(db: BetterSqlite3.Database, realName: string): Persona {
  const memberId = `pre-${rand()}`;
  const slug = `pre_${rand()}`;
  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier0',
    memberOverrides: { onboarding: 'none', login_email: uniqueEmail('pre'), real_name: realName },
  });
  return { memberId, slug, cookieHeader: cookieFor(memberId), tier: 'tier0', isAdmin: false };
}

// An old account carrying the member's login address under a different
// surname: the card offers to record that surname as one used before and claim.
export function seedMemberWithSurnameDifferingAccount(
  db: BetterSqlite3.Database,
): Persona & { legacyMemberId: string; oldSurname: string } {
  const first = nameWord();
  const oldSurname = nameWord();
  const loginEmail = uniqueEmail('sd').toLowerCase();
  const legacyMemberId = `LM-SD-${rand().toUpperCase()}`;
  insertLegacyMember(db, {
    legacy_member_id: legacyMemberId,
    legacy_email: loginEmail,
    real_name: `${first} ${oldSurname}`,
    country: 'US',
  });
  const persona = seedPendingClaimant(db, 'sd', { real_name: `${first} ${nameWord()}`, login_email: loginEmail });
  return { ...persona, legacyMemberId, oldSurname };
}

// An old account under the member's name that nothing of theirs corroborates:
// it carries an old address the member does not sign in with and no date of
// birth, so the card shows no claim control until the member adds that address.
export function seedMemberWithNameOnlyAccount(
  db: BetterSqlite3.Database,
): Persona & { legacyMemberId: string; oldEmail: string; accountName: string } {
  const accountName = `${nameWord()} ${nameWord()}`;
  const oldEmail = uniqueEmail('old').toLowerCase();
  const legacyMemberId = `LM-NO-${rand().toUpperCase()}`;
  insertLegacyMember(db, { legacy_member_id: legacyMemberId, legacy_email: oldEmail, real_name: accountName });
  const persona = seedPendingClaimant(db, 'no', { real_name: accountName });
  return { ...persona, legacyMemberId, oldEmail, accountName };
}

// An old account under the member's name whose date of birth is the member's
// with day and month swapped, and no address: found by name alone until the
// member corrects their date in the last attempt, when the date corroborates it.
export function seedMemberWithMisdatedAccount(
  db: BetterSqlite3.Database,
): Persona & { legacyMemberId: string; accountName: string } {
  const accountName = `${nameWord()} ${nameWord()}`;
  const legacyMemberId = `LM-MD-${rand().toUpperCase()}`;
  insertLegacyMember(db, { legacy_member_id: legacyMemberId, real_name: accountName, birth_date: '1984-03-09' });
  const persona = seedPendingClaimant(db, 'md', { real_name: accountName, birth_date: '1984-09-03' });
  return { ...persona, legacyMemberId, accountName };
}

// One member whose claim step shows every card kind at once: an old account
// with its linked record reached by the login address (claim), a record with no
// account under a nickname of the member's first name (record confirmation
// page), an account reached by a declared old address under another surname
// (claim under that surname), and an account under the member's name that
// nothing corroborates (no claim control).
export function seedMemberWithEveryCardKind(
  db: BetterSqlite3.Database,
): Persona & { recordOnlyId: string } {
  const first = nameWord();
  const nickname = nameWord();
  const surname = nameWord();
  const memberName = `${first} ${surname}`;
  const loginEmail = uniqueEmail('every').toLowerCase();
  const oldEmail = uniqueEmail('everyold').toLowerCase();

  const pairAccount = `LM-EV-${rand().toUpperCase()}`;
  insertLegacyMember(db, { legacy_member_id: pairAccount, legacy_email: loginEmail, real_name: memberName });
  insertHistoricalPerson(db, { person_id: `hp-ev-${rand()}`, legacy_member_id: pairAccount, person_name: memberName, first_year: 2001 });

  insertGivenNameVariant(db, { short_form_normalized: nickname.toLowerCase(), long_form_normalized: first.toLowerCase() });
  const recordOnlyId = insertHistoricalPerson(db, { person_id: `hp-evr-${rand()}`, person_name: `${nickname} ${surname}` });

  insertLegacyMember(db, { legacy_member_id: `LM-EVS-${rand().toUpperCase()}`, legacy_email: oldEmail, real_name: `${first} ${nameWord()}` });
  insertLegacyMember(db, { legacy_member_id: `LM-EVA-${rand().toUpperCase()}`, real_name: memberName });

  const persona = seedPendingClaimant(db, 'every', { real_name: memberName, login_email: loginEmail });
  insertMemberDeclaredAnchor(db, { member_id: persona.memberId, anchor_type: 'old_email', anchor_value: oldEmail });
  return { ...persona, recordOnlyId };
}

// A registrant who answered "I had one but cannot find it", so the claim step is
// complete and its one last attempt at the match is open.
export function seedMemberInLastAttempt(db: BetterSqlite3.Database): Persona {
  const persona = seedPendingClaimant(db, 'la', { real_name: `${nameWord()} ${nameWord()}` });
  insertOnboardingTask(db, persona.memberId, 'legacy_claim', 'completed', { last_attempt_opened_at: TS });
  return persona;
}

// ── Persona composition helpers ──────────────────────────────────────────────

export function seedMemberWithClubCards(
  db: BetterSqlite3.Database,
  opts: { slug?: string; clubCount?: number; withCoLeader?: boolean; city?: string } = {},
): Persona & { candidateIds: string[]; affiliationIds: string[]; clubIds: string[] } {
  const memberId = `clubs-${rand()}`;
  const slug = opts.slug ?? `clubs_${rand()}`;
  const legacyMemberId = `LM-CLUBS-${rand().toUpperCase()}`;
  const count = opts.clubCount ?? 2;

  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier0',
    // Mid-wizard on the club step, so the factory's member-by-default task
    // rows are suppressed; the two preceding tasks are seeded below.
    memberOverrides: { onboarding: 'none', login_email: uniqueEmail('clubs'), legacy_member_id: legacyMemberId },
  });

  const personId = insertHistoricalPerson(db, {
    person_id: `hp-clubs-${rand()}`,
    legacy_member_id: legacyMemberId,
    person_name: 'Club Member',
  });

  const candidateIds: string[] = [];
  const affiliationIds: string[] = [];
  const clubIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const tagId = insertTag(db, { id: `tag-mc-${rand()}`, tag_normalized: `#club_e2e_${rand()}`, standard_type: 'club' });
    const clubId = insertClub(db, { id: `club-mc-${rand()}`, hashtag_tag_id: tagId, name: `Test Club ${i + 1}`, city: opts.city ?? `City${i + 1}` });
    clubIds.push(clubId);

    // An existing co-leader keeps the club non-leaderless, so confirming
    // membership (which grants the first-affiliation Active Player period, and
    // with it Tier-1 benefits) does not surface a path-2 leadership offer. Lets
    // a membership-confirm test isolate plain affiliation completion.
    if (opts.withCoLeader) {
      const coLeaderId = `clubs-cl-${rand()}`;
      insertMember(db, {
        id: coLeaderId,
        slug: `clubs_cl_${rand()}`,
        login_email: uniqueEmail('clubcl'),
        real_name: 'Existing Co-leader',
      });
      insertClubLeader(db, { club_id: clubId, member_id: coLeaderId });
    }

    const candidateId = insertLegacyClubCandidate(db, {
      id: `lcc-mc-${rand()}`,
      legacy_club_key: `legacy_club_mc_${rand()}`,
      classification: 'pre_populate',
      mapped_club_id: clubId,
      display_name: `Test Club ${i + 1}`,
    });
    candidateIds.push(candidateId);

    const affiliationId = insertLegacyPersonClubAffiliation(db, {
      id: `lpca-mc-${rand()}`,
      historical_person_id: personId,
      legacy_member_id: legacyMemberId,
      legacy_club_candidate_id: candidateId,
      inferred_role: 'member',
    });
    affiliationIds.push(affiliationId);
  }

  // Pre-complete personal_details and legacy_claim so the wizard starts at
  // club_affiliations (both precede it and gate its rendering).
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
  insertOnboardingTask(db, memberId, 'legacy_claim', 'completed');

  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId),
    tier: 'tier0',
    isAdmin: false,
    candidateIds,
    affiliationIds,
    clubIds,
  };
}

export function seedMemberWithLeadershipCard(
  db: BetterSqlite3.Database,
  opts: { slug?: string } = {},
): Persona & { candidateId: string; clubId: string } {
  const memberId = `ldr-${rand()}`;
  const slug = opts.slug ?? `ldr_${rand()}`;
  const legacyMemberId = `LM-LDR-${rand().toUpperCase()}`;

  const ldrTagId = insertTag(db, { id: `tag-ldr-${rand()}`, tag_normalized: `#club_e2e_ldr_${rand()}`, standard_type: 'club' });
  const clubId = insertClub(db, { id: `club-ldr-${rand()}`, hashtag_tag_id: ldrTagId, name: 'Leader Club' });

  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier1',
    memberOverrides: { onboarding: 'none', login_email: uniqueEmail('ldr'), legacy_member_id: legacyMemberId },
  });

  insertHistoricalPerson(db, {
    person_id: `hp-ldr-${rand()}`,
    legacy_member_id: legacyMemberId,
    person_name: 'Leader Person',
  });

  const candidateId = insertClubBootstrapLeader(db, {
    id: `cbl-ldr-${rand()}`,
    club_id: clubId,
    legacy_member_id: legacyMemberId,
    role: 'leader',
    status: 'provisional',
  });
  insertClubBootstrapLeaderSignal(db, {
    id: `cbls-ldr-${rand()}`,
    bootstrap_leader_id: candidateId,
    signal_type: 'listed_contact',
    is_present: 1,
  });
  insertClubBootstrapLeaderSignal(db, {
    id: `cbls-ldr2-${rand()}`,
    bootstrap_leader_id: candidateId,
    signal_type: 'affiliation',
    is_present: 1,
  });

  // Pre-complete personal_details and legacy_claim so the wizard starts at
  // club_affiliations (both precede it and gate its rendering).
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
  insertOnboardingTask(db, memberId, 'legacy_claim', 'completed');

  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId),
    tier: 'tier1',
    isAdmin: false,
    candidateId,
    clubId,
  };
}

export function seedAllTasksCompleted(
  db: BetterSqlite3.Database,
  opts: { slug?: string; linked?: boolean } = {},
): Persona {
  const memberId = `done-${rand()}`;
  const slug = opts.slug ?? `done_${rand()}`;

  // With linked, the persona carries both identity links (legacy account and
  // historical person), the state a claim of a linked account leaves behind.
  let memberOverrides: Record<string, unknown> = { login_email: uniqueEmail('done') };
  if (opts.linked) {
    const legacyMemberId = `LM-DONE-${rand().toUpperCase()}`;
    const personId = insertHistoricalPerson(db, {
      person_id: `hp-done-${rand()}`,
      legacy_member_id: legacyMemberId,
      person_name: 'Done Linked Person',
    });
    memberOverrides = { ...memberOverrides, legacy_member_id: legacyMemberId, historical_person_id: personId };
  }

  createMemberAtTier(db, { id: memberId, slug, tier: 'tier0', memberOverrides });

  if (opts.linked) {
    insertLegacyMember(db, {
      legacy_member_id: memberOverrides.legacy_member_id as string,
      real_name: 'Done Linked Person',
      claimed_by_member_id: memberId,
      claimed_at: TS,
    });
  }

  // Onboarding-complete means all three tasks completed, which the member
  // factory already seeds by default; nothing further to insert here.

  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId),
    tier: 'tier0',
    isAdmin: false,
  };
}

// ── E2E-safe persona wrappers ────────────────────────────────────────────────
// The shared E2E DB persists across spec files, but the uid() counter in
// factories.ts resets on each import, causing email collisions. These
// wrappers inject a unique email so every persona gets a collision-free row.

export function seedBrandNewPlayer(db: BetterSqlite3.Database, opts: { slug?: string } = {}) {
  return _seedBrandNewPlayer(db, { slug: opts.slug, overrides: { login_email: uniqueEmail('bnp') } });
}

export function seedTier0Member(db: BetterSqlite3.Database, opts: { slug?: string; overrides?: Record<string, unknown> } = {}) {
  // Wizard specs need a pending registrant (the factory default is a full
  // member); explicit task states are seeded by the individual spec.
  return _seedTier0Member(db, { slug: opts.slug, overrides: { onboarding: 'none', login_email: uniqueEmail('t0'), ...opts.overrides } as any });
}

export function seedTier1Member(db: BetterSqlite3.Database, opts: { slug?: string } = {}) {
  return _seedTier1Member(db, { slug: opts.slug, overrides: { login_email: uniqueEmail('t1') } });
}

// An old account carrying the member's login address and the record the
// pipeline linked to it, under the member's name: one strong, claimable card.
export function seedMemberWithEmailMatchedPair(
  db: BetterSqlite3.Database,
  opts: { slug?: string; personName?: string } = {},
): Persona & { legacyMemberId: string; personId: string } {
  const memberId = `al-${rand()}`;
  const slug = opts.slug ?? `pair_${rand()}`;
  const legacyMemberId = `LM-AL-${rand().toUpperCase()}`;
  const loginEmail = uniqueEmail('al');
  // Unique per seed: every such persona shares one database in the E2E run, so
  // a shared word in the name makes the records namesakes and each member is
  // shown the others' cards as well as their own. Both words are crypto-random.
  const personName = opts.personName ?? `${nameWord()} ${nameWord()}`;

  insertLegacyMember(db, {
    legacy_member_id: legacyMemberId,
    legacy_email: loginEmail,
    real_name: personName,
    country: 'US',
  });

  const personId = insertHistoricalPerson(db, {
    person_id: `hp-al-${rand()}`,
    legacy_member_id: legacyMemberId,
    person_name: personName,
    country: 'US',
    first_year: 2005,
  });

  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier0',
    memberOverrides: {
      onboarding: 'none',
      login_email: loginEmail,
      real_name: personName,
    },
  });

  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId),
    tier: 'tier0',
    isAdmin: false,
    legacyMemberId,
    personId,
  };
}

export function seedMemberMidWizard(db: BetterSqlite3.Database, opts: { slug?: string } = {}) {
  return _seedMemberMidWizard(db, { slug: opts.slug, overrides: { login_email: uniqueEmail('mid') } });
}

export function seedMemberWithPendingClubAffiliation(db: BetterSqlite3.Database, opts: { slug?: string; classification?: 'pre_populate' | 'onboarding_visible' | 'dormant' } = {}) {
  return _seedMemberWithPendingClubAffiliation(db, { slug: opts.slug, classification: opts.classification, overrides: { login_email: uniqueEmail('pca') } });
}
