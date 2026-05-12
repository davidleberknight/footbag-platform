/**
 * Persona bundlers. Compose insertMember + insertMemberTierGrant +
 * insertHistoricalPerson + createTestSessionJwt into one call so test
 * suites can spin up the canonical four-role seed (admin, tier1, tier0,
 * unlinkedHp) without re-deriving the wiring each time.
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
  insertHistoricalPerson,
  insertClub,
  insertEvent,
  createMemberAtTier,
  createTestSessionJwt,
  type MemberOverrides,
} from './factories';

// Shared timestamp + system actor constants used by the direct-SQL inserts
// below. Kept in lockstep with tests/fixtures/factories.ts; the moment
// dedicated factories for club_leaders / event_organizers land, switch
// these call sites to use them.
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

/** Tier-2 member: governance-eligible, includes tier1 benefits. */
export function seedTier2Member(
  db: BetterSqlite3.Database,
  opts: { slug?: string; overrides?: Omit<MemberOverrides, 'id' | 'slug'> } = {},
): Persona {
  const memberId = `t2-${rand()}`;
  const slug = opts.slug ?? `tier2_${rand()}`;
  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier2',
    memberOverrides: opts.overrides,
  });
  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId, 'member'),
    tier: 'tier2',
    isAdmin: false,
  };
}

/**
 * Tier-3 governance member. Requires `underlying_tier_status` per the
 * createMemberAtTier contract; defaults to tier2 underlying.
 */
export function seedTier3Member(
  db: BetterSqlite3.Database,
  opts: {
    slug?: string;
    underlying?: 'tier1' | 'tier2';
    overrides?: Omit<MemberOverrides, 'id' | 'slug'>;
  } = {},
): Persona {
  const memberId = `t3-${rand()}`;
  const slug = opts.slug ?? `tier3_${rand()}`;
  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier3',
    underlying_tier_status: opts.underlying ?? 'tier2',
    memberOverrides: opts.overrides,
  });
  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId, 'member'),
    tier: 'tier3',
    isAdmin: false,
  };
}

/**
 * Hall of Fame member. is_hof=1 alongside a Tier-1 grant so the persona
 * can exercise both HoF-conditional view rendering and tier-gated POST
 * routes. hof_inducted_year defaults to a known historical value.
 */
export function seedHofMember(
  db: BetterSqlite3.Database,
  opts: { slug?: string; overrides?: Omit<MemberOverrides, 'id' | 'slug' | 'is_hof'> } = {},
): Persona {
  const memberId = `hof-${rand()}`;
  const slug = opts.slug ?? `hof_${rand()}`;
  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier1',
    memberOverrides: { is_hof: 1, ...(opts.overrides ?? {}) },
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
 * BAP (Best Achievement Performance) member. is_bap=1 alongside Tier-1.
 * Mirrors the HoF persona structure for the BAP-conditional render paths.
 */
export function seedBapMember(
  db: BetterSqlite3.Database,
  opts: { slug?: string; overrides?: Omit<MemberOverrides, 'id' | 'slug' | 'is_bap'> } = {},
): Persona {
  const memberId = `bap-${rand()}`;
  const slug = opts.slug ?? `bap_${rand()}`;
  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier1',
    memberOverrides: { is_bap: 1, ...(opts.overrides ?? {}) },
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
 * Club Leader (CL). Tier-1 member + club + row in `club_leaders`.
 * Direct-SQL insert because tests/fixtures/factories.ts does not yet
 * expose an insertClubLeader helper; when it does, swap this body to use
 * it. Returns the persona augmented with the seeded club id.
 */
export function seedClubLeader(
  db: BetterSqlite3.Database,
  opts: {
    slug?: string;
    role?: 'leader' | 'co-leader';
    clubId?: string;
    overrides?: Omit<MemberOverrides, 'id' | 'slug'>;
  } = {},
): Persona & { clubId: string } {
  const memberId = `cl-${rand()}`;
  const slug = opts.slug ?? `cl_${rand()}`;
  const clubId = opts.clubId ?? insertClub(db, { id: `club-cl-${rand()}` });
  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier1',
    memberOverrides: opts.overrides,
  });
  db.prepare(`
    INSERT INTO club_leaders (
      id, created_at, created_by, updated_at, updated_by, version,
      club_id, member_id, role, added_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(
    `cl-row-${rand()}`,
    TS, SYS, TS, SYS,
    clubId, memberId, opts.role ?? 'leader', TS,
  );
  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId, 'member'),
    tier: 'tier1',
    isAdmin: false,
    clubId,
  };
}

/**
 * Event Organizer (EO). Tier-1 member + event + row in `event_organizers`.
 * Direct-SQL insert until an `insertEventOrganizer` factory lands. Returns
 * the persona augmented with the seeded event id.
 */
export function seedEventOrganizer(
  db: BetterSqlite3.Database,
  opts: {
    slug?: string;
    role?: 'organizer' | 'co-organizer';
    eventId?: string;
    overrides?: Omit<MemberOverrides, 'id' | 'slug'>;
  } = {},
): Persona & { eventId: string } {
  const memberId = `eo-${rand()}`;
  const slug = opts.slug ?? `eo_${rand()}`;
  const eventId = opts.eventId ?? insertEvent(db, { id: `event-eo-${rand()}` });
  createMemberAtTier(db, {
    id: memberId,
    slug,
    tier: 'tier1',
    memberOverrides: opts.overrides,
  });
  db.prepare(`
    INSERT INTO event_organizers (
      id, created_at, created_by, updated_at, updated_by, version,
      event_id, member_id, role, added_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `).run(
    `eo-row-${rand()}`,
    TS, SYS, TS, SYS,
    eventId, memberId, opts.role ?? 'organizer', TS,
  );
  return {
    memberId,
    slug,
    cookieHeader: cookieFor(memberId, 'member'),
    tier: 'tier1',
    isAdmin: false,
    eventId,
  };
}

/**
 * Anonymous visitor: not authenticated, no DB row. Useful as a control
 * persona in click-through tests so the "every persona, every page"
 * matrix has a zero-auth row. cookieHeader is empty so supertest /
 * Playwright requests carry no session.
 */
export function visitorPersona(): Persona {
  return {
    memberId: '',
    slug: '',
    cookieHeader: '',
    tier: 'tier0',
    isAdmin: false,
  };
}

/**
 * Unlinked-HP member: a member with a legacy_member_id pointing at a
 * historical_persons row that has not yet been claimed. Surfaces the
 * link-history wizard CTAs (auto-link confirm, HP claim form, etc.).
 */
export function seedUnlinkedHpMember(
  db: BetterSqlite3.Database,
  opts: { slug?: string; legacyMemberId?: string; personName?: string } = {},
): Persona {
  const memberId = `hp-${rand()}`;
  const slug = opts.slug ?? `hp_${rand()}`;
  const legacyMemberId = opts.legacyMemberId ?? `LM-HP-${rand().toUpperCase()}`;
  const personName = opts.personName ?? 'Historical Person';
  // insertMember auto-creates a legacy_members stub when legacy_member_id is set.
  insertMember(db, {
    id: memberId,
    slug,
    legacy_member_id: legacyMemberId,
  });
  const personId = insertHistoricalPerson(db, {
    legacy_member_id: legacyMemberId,
    person_name: personName,
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
