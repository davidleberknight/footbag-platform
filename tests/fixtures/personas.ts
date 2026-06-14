/**
 * Persona bundlers. Compose insertMember + insertMemberTierGrant +
 * insertHistoricalPerson + createTestSessionJwt into one call so test
 * suites can spin up the canonical seed roles (admin, tier1, tier0)
 * without re-deriving the wiring each time.
 *
 * Used by:
 *   - tests/integration/adapter-misconfig.test.ts (the new failure-mode suite)
 *   - tests/e2e/click-through.spec.ts (the Playwright click-through layer)
 *
 * Returns a Persona record carrying the cookie header so callers can
 * .set('Cookie', persona.cookieHeader) on supertest, or pass it to
 * Playwright's context.addCookies via splitCookieHeader.
 */
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
  insertClub,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  createMemberAtTier,
  createTestSessionJwt,
  type MemberOverrides,
} from './factories';

const TS = '2025-01-01T00:00:00.000Z';
const SYS = 'system';

export type PersonaTier = 'tier0' | 'tier1' | 'tier2' | 'tier3';

export interface Persona {
  memberId: string;
  slug: string;
  cookieHeader: string;        // 'footbag_session=<jwt>'
  tier: PersonaTier;
  isAdmin: boolean;
  legacyMemberId?: string;     // set for unlinkedHp + linked-HP personas
  personId?: string;           // set for unlinkedHp + linked-HP personas
}

function rand(): string {
  return Math.random().toString(36).slice(2, 10);
}

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role })}`;
}

/**
 * Admin: is_admin=1 with an implicit Tier 2 grant. The tier grant is
 * what gates the requireTier1Benefits middleware on POST routes; admins
 * pass it because tier2 implies tier1+.
 */
export function seedAdmin(
  db: BetterSqlite3.Database,
  opts: { slug?: string; overrides?: Omit<MemberOverrides, 'id' | 'slug' | 'is_admin'> } = {},
): Persona {
  const memberId = `admin-${rand()}`;
  const slug = opts.slug ?? `admin_${rand()}`;
  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier2',
    memberOverrides: { is_admin: 1, ...(opts.overrides ?? {}) },
  });
  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId, 'admin'),
    tier: 'tier2',
    isAdmin: true,
  };
}

/** Tier-1 member: passes requireTier1Benefits, not admin. */
export function seedTier1Member(
  db: BetterSqlite3.Database,
  opts: { slug?: string; overrides?: Omit<MemberOverrides, 'id' | 'slug'> } = {},
): Persona {
  const memberId = `t1-${rand()}`;
  const slug = opts.slug ?? `tier1_${rand()}`;
  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier1',
    memberOverrides: opts.overrides,
  });
  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId, 'member'),
    tier: 'tier1',
    isAdmin: false,
  };
}

/**
 * Tier-0 member: a fresh signup, no tier grant. Used to exercise the
 * requireTier1Benefits 403 path and the unlinked-claim wizard.
 */
export function seedTier0Member(
  db: BetterSqlite3.Database,
  opts: { slug?: string; overrides?: Omit<MemberOverrides, 'id' | 'slug'> } = {},
): Persona {
  const memberId = `t0-${rand()}`;
  const slug = opts.slug ?? `tier0_${rand()}`;
  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier0',
    memberOverrides: opts.overrides,
  });
  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId, 'member'),
    tier: 'tier0',
    isAdmin: false,
  };
}

// ── Onboarding wizard personas ──────────────────────────────────────────────

/**
 * Brand-new player with no legacy identity. Email matches nothing in
 * legacy_members or historical_persons. Used to test the skip path for
 * the legacy_claim task and the no-match club affiliation exit.
 */
export function seedBrandNewPlayer(
  db: BetterSqlite3.Database,
  opts: { slug?: string; overrides?: Omit<MemberOverrides, 'id' | 'slug'> } = {},
): Persona {
  const memberId = `new-${rand()}`;
  const slug = opts.slug ?? `new_${rand()}`;
  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier0',
    memberOverrides: opts.overrides,
  });
  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId, 'member'),
    tier: 'tier0',
    isAdmin: false,
  };
}

/**
 * Member with a staged auto-link candidate. Login email matches
 * legacy_members.legacy_email, and the legacy row back-links to a
 * historical_persons row. The auto-link classifier returns high
 * confidence for this setup.
 */
export function seedMemberWithAutoLinkCandidate(
  db: BetterSqlite3.Database,
  opts: {
    slug?: string;
    personName?: string;
    overrides?: Omit<MemberOverrides, 'id' | 'slug' | 'legacy_member_id'>;
  } = {},
): Persona & { legacyMemberId: string; personId: string } {
  const memberId = `al-${rand()}`;
  const slug = opts.slug ?? `autolink_${rand()}`;
  const legacyMemberId = `LM-AL-${rand().toUpperCase()}`;
  const loginEmail = `test-autolink-${rand()}@example.com`;
  const personName = opts.personName ?? 'Test Autolink';

  insertLegacyMember(db, {
    legacy_member_id: legacyMemberId,
    legacy_email: loginEmail,
    real_name: personName,
    country: 'US',
  });

  const personId = insertHistoricalPerson(db, {
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
      ...(opts.overrides ?? {}),
    },
  });

  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId, 'member'),
    tier: 'tier0',
    isAdmin: false,
    legacyMemberId,
    personId,
  };
}

/**
 * Member with pending club affiliations at a specific stage. Seeds a
 * legacy_person_club_affiliation row in 'pending' status linked to a
 * legacy_club_candidate of the requested classification.
 */
export function seedMemberWithPendingClubAffiliation(
  db: BetterSqlite3.Database,
  opts: {
    slug?: string;
    classification?: 'pre_populate' | 'onboarding_visible' | 'dormant';
    overrides?: Omit<MemberOverrides, 'id' | 'slug'>;
  } = {},
): Persona & { candidateId: string; affiliationId: string; clubId: string | null } {
  const memberId = `club-${rand()}`;
  const slug = opts.slug ?? `club_${rand()}`;
  const legacyMemberId = `LM-CLUB-${rand().toUpperCase()}`;
  const classification = opts.classification ?? 'pre_populate';

  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier0',
    memberOverrides: opts.overrides,
  });

  const personId = insertHistoricalPerson(db, {
    legacy_member_id: legacyMemberId,
    person_name: 'Test Club Member',
  });

  let clubId: string | null = null;
  if (classification === 'pre_populate') {
    clubId = insertClub(db, { id: `club-pp-${rand()}` });
  }

  const candidateId = insertLegacyClubCandidate(db, {
    classification,
    mapped_club_id: clubId,
  });

  const affiliationId = insertLegacyPersonClubAffiliation(db, {
    historical_person_id: personId,
    legacy_member_id: legacyMemberId,
    legacy_club_candidate_id: candidateId,
  });

  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId, 'member'),
    tier: 'tier0',
    isAdmin: false,
    candidateId,
    affiliationId,
    clubId,
  };
}

/**
 * Member mid-wizard: legacy_claim completed, remaining tasks pending.
 * Used to test wizard resumption at the club_affiliations step.
 */
export function seedMemberMidWizard(
  db: BetterSqlite3.Database,
  opts: { slug?: string; overrides?: Omit<MemberOverrides, 'id' | 'slug'> } = {},
): Persona {
  const memberId = `mid-${rand()}`;
  const slug = opts.slug ?? `mid_${rand()}`;
  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier0',
    memberOverrides: opts.overrides,
  });
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
    cookieHeader: cookieFor(memberId, 'member'),
    tier: 'tier0',
    isAdmin: false,
  };
}

/**
 * Split a 'name=value' cookie header into the shape Playwright's
 * context.addCookies expects. Useful when wiring a persona into a
 * Playwright browser context.
 */
export function personaToPlaywrightCookies(
  persona: Persona,
  opts: { domain: string; path?: string },
): Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; sameSite: 'Lax' }> {
  const [name, value] = persona.cookieHeader.split('=', 2);
  return [
    {
      name,
      value,
      domain: opts.domain,
      path: opts.path ?? '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ];
}
