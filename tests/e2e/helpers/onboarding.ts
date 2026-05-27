/**
 * Shared helpers for onboarding wizard E2E tests.
 * Provides DB assertion helpers and persona composition functions
 * that build on the existing factory/persona infrastructure.
 */
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
  insertTag,
  insertClub,
  insertClubBootstrapLeader,
  insertClubBootstrapLeaderSignal,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  createMemberAtTier,
  createTestSessionJwt,
} from '../../fixtures/factories';
import {
  seedBrandNewPlayer as _seedBrandNewPlayer,
  seedTier0Member as _seedTier0Member,
  seedTier1Member as _seedTier1Member,
  seedMemberWithAutoLinkCandidate as _seedMemberWithAutoLinkCandidate,
  seedMemberMidWizard as _seedMemberMidWizard,
  seedMemberWithPendingClubAffiliation as _seedMemberWithPendingClubAffiliation,
  type Persona,
} from '../../fixtures/personas';

const TS = '2025-01-01T00:00:00.000Z';
const SYS = 'system';

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${rand()}-${Date.now()}@example.com`;
}

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

// ── E2E DB setup ─────────────────────────────────────────────────────────────

export function raiseClaimRateLimits(db: BetterSqlite3.Database): void {
  const now = new Date().toISOString();
  const keys = ['legacy_claim_init_rate_limit_max_per_ip', 'legacy_claim_init_rate_limit_max_per_member'];
  for (const key of keys) {
    db.prepare(`
      INSERT OR IGNORE INTO system_config (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
      VALUES (?, ?, ?, '999', ?, 'e2e rate limit raise', NULL)
    `).run(`sc-e2e-${key}`, now, key, now);
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

// ── Persona composition helpers ──────────────────────────────────────────────

export function seedMemberWithLegacyDiffEmail(
  db: BetterSqlite3.Database,
  opts: { slug?: string } = {},
): Persona & { legacyMemberId: string; legacyEmail: string } {
  const memberId = `enq-${rand()}`;
  const slug = opts.slug ?? `enq_${rand()}`;
  const legacyMemberId = `LM-ENQ-${rand().toUpperCase()}`;
  const legacyEmail = `legacy-${rand()}@oldsite.example`;

  insertLegacyMember(db, {
    legacy_member_id: legacyMemberId,
    legacy_email: legacyEmail,
    real_name: 'Enqueued Claim',
    display_name: 'Enqueued Claim',
  });

  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier0',
    memberOverrides: {
      login_email: uniqueEmail('enq'),
      real_name: 'Enqueued Claim',
    },
  });

  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId),
    tier: 'tier0',
    isAdmin: false,
    legacyMemberId,
    legacyEmail,
  };
}

export function seedMemberWithHpMatch(
  db: BetterSqlite3.Database,
  opts: { slug?: string; personName?: string; memberName?: string } = {},
): Persona & { personId: string } {
  const memberId = `hp-${rand()}`;
  const slug = opts.slug ?? `hp_${rand()}`;
  const surname = 'Testplayer';
  const personName = opts.personName ?? `Robert ${surname}`;
  const memberName = opts.memberName ?? `Bob ${surname}`;

  const personId = insertHistoricalPerson(db, {
    person_id: `hp-hpm-${rand()}`,
    person_name: personName,
    country: 'US',
    first_year: 2003,
  });

  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier0',
    memberOverrides: {
      login_email: uniqueEmail('hp'),
      real_name: memberName,
    },
  });

  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId),
    tier: 'tier0',
    isAdmin: false,
    personId,
  };
}

export function seedMemberWithClubCards(
  db: BetterSqlite3.Database,
  opts: { slug?: string; clubCount?: number } = {},
): Persona & { candidateIds: string[]; affiliationIds: string[]; clubIds: string[] } {
  const memberId = `clubs-${rand()}`;
  const slug = opts.slug ?? `clubs_${rand()}`;
  const legacyMemberId = `LM-CLUBS-${rand().toUpperCase()}`;
  const count = opts.clubCount ?? 2;

  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier0',
    memberOverrides: { login_email: uniqueEmail('clubs'), legacy_member_id: legacyMemberId },
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
    const tagId = insertTag(db, { tag_normalized: `#club_e2e_${rand()}`, standard_type: 'club' });
    const clubId = insertClub(db, { id: `club-mc-${rand()}`, hashtag_tag_id: tagId, name: `Test Club ${i + 1}`, city: `City${i + 1}` });
    clubIds.push(clubId);

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

  // Pre-complete legacy_claim so wizard starts at club_affiliations
  const taskId = `mot-${rand()}`;
  db.prepare(`
    INSERT INTO member_onboarding_tasks (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, task_type, state, completed_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, 'legacy_claim', 'completed', ?)
  `).run(taskId, TS, SYS, TS, SYS, memberId, TS);

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

  const ldrTagId = insertTag(db, { tag_normalized: `#club_e2e_ldr_${rand()}`, standard_type: 'club' });
  const clubId = insertClub(db, { id: `club-ldr-${rand()}`, hashtag_tag_id: ldrTagId, name: 'Leader Club' });

  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier1',
    memberOverrides: { login_email: uniqueEmail('ldr'), legacy_member_id: legacyMemberId },
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

  // Pre-complete legacy_claim
  const taskId = `mot-ldr-${rand()}`;
  db.prepare(`
    INSERT INTO member_onboarding_tasks (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, task_type, state, completed_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, 'legacy_claim', 'completed', ?)
  `).run(taskId, TS, SYS, TS, SYS, memberId, TS);

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
  opts: { slug?: string } = {},
): Persona {
  const memberId = `done-${rand()}`;
  const slug = opts.slug ?? `done_${rand()}`;

  createMemberAtTier(db, { id: memberId, slug, tier: 'tier0', memberOverrides: { login_email: uniqueEmail('done') } });

  const tasks = ['personal_details', 'legacy_claim', 'club_affiliations'];
  for (const taskType of tasks) {
    const taskId = `mot-done-${rand()}`;
    const state = taskType === 'club_affiliations' ? 'not_applicable' : 'completed';
    db.prepare(`
      INSERT INTO member_onboarding_tasks (
        id, created_at, created_by, updated_at, updated_by, version,
        member_id, task_type, state, completed_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(taskId, TS, SYS, TS, SYS, memberId, taskType, state, state === 'completed' ? TS : null);
  }

  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId),
    tier: 'tier0',
    isAdmin: false,
  };
}

export function seedMixedTaskState(
  db: BetterSqlite3.Database,
  opts: { slug?: string } = {},
): Persona {
  const memberId = `mix-${rand()}`;
  const slug = opts.slug ?? `mix_${rand()}`;

  createMemberAtTier(db, { id: memberId, slug, tier: 'tier0', memberOverrides: { login_email: uniqueEmail('mix') } });

  const taskStates: Array<[string, string]> = [
    ['personal_details', 'pending'],
    ['legacy_claim', 'completed'],
    ['club_affiliations', 'skipped'],
  ];
  for (const [taskType, state] of taskStates) {
    const taskId = `mot-mix-${rand()}`;
    db.prepare(`
      INSERT INTO member_onboarding_tasks (
        id, created_at, created_by, updated_at, updated_by, version,
        member_id, task_type, state, completed_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).run(taskId, TS, SYS, TS, SYS, memberId, taskType, state, state === 'completed' ? TS : null);
  }

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
  return _seedTier0Member(db, { slug: opts.slug, overrides: { login_email: uniqueEmail('t0'), ...opts.overrides } as any });
}

export function seedTier1Member(db: BetterSqlite3.Database, opts: { slug?: string } = {}) {
  return _seedTier1Member(db, { slug: opts.slug, overrides: { login_email: uniqueEmail('t1') } });
}

export function seedMemberWithAutoLinkCandidate(
  db: BetterSqlite3.Database,
  opts: { slug?: string; personName?: string } = {},
): ReturnType<typeof _seedMemberWithAutoLinkCandidate> {
  const memberId = `al-${rand()}`;
  const slug = opts.slug ?? `autolink_${rand()}`;
  const legacyMemberId = `LM-AL-${rand().toUpperCase()}`;
  const loginEmail = uniqueEmail('al');
  const personName = opts.personName ?? 'Test Autolink';

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
