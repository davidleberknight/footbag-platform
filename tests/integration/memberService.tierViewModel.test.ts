/**
 * Service-level shape assertions for memberService.getOwnProfile's
 * personal-home composition (M_View_Tier_Status). The route-level
 * rendering is verified separately by memberLanding.tierDisplay.test.ts;
 * this file pins the view-model output shape without going through
 * HTTP / HBS.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertActivePlayerGrant,
  createMemberAtTier,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3086');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let memberServiceMod: typeof import('../../src/services/memberService');

const ADMIN_ID = 'admin-tvm-001';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'tvm_admin', is_admin: 1 });
  db.close();
  memberServiceMod = await import('../../src/services/memberService');
});

afterAll(() => cleanupTestDb(dbPath));

let counter = 0;
function nextMember(): { id: string; slug: string; displayName: string } {
  counter += 1;
  return {
    id: `member-tvm-${counter}`,
    slug: `tvm_${counter}`,
    displayName: `TVM Member ${counter}`,
  };
}

describe('getOwnProfile().content.membership', () => {
  it('tier0 no-AP: tier badge + tier0 blurb + Tier1/Tier2 upgrade CTAs', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    insertMember(db, { id: m.id, slug: m.slug });
    db.close();
    const vm = memberServiceMod.memberService.getOwnProfile(m.slug);
    expect(vm.content.membership!.tierBadgeText).toBe('Tier 0 Registered Member');
    expect(vm.content.membership!.activePlayer).toEqual({ isCurrent: false, expiresAtDisplay: null, hasLapsed: false, lapsedExplanation: null });
    expect(vm.content.membership!.underlyingTierBadgeText).toBeNull();
    expect(vm.content.membership!.showTier1Upgrade).toBe(true);
    expect(vm.content.membership!.showTier2Upgrade).toBe(true);
    expect(vm.content.membership!.benefitsBlurb).toMatch(/You can browse the platform/);
  });

  it('tier0 with current AP: AP block carries the formatted expiry date', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    insertMember(db, { id: m.id, slug: m.slug });
    insertActivePlayerGrant(db, {
      member_id: m.id,
      change_type: 'grant',
      new_active_player_expires_at: '2099-09-15T12:00:00.000Z',
      reason_code: 'official_event_attendance',
    });
    db.close();
    const vm = memberServiceMod.memberService.getOwnProfile(m.slug);
    expect(vm.content.membership!.activePlayer?.isCurrent).toBe(true);
    // Locale-aware format includes year + month abbreviation + day.
    expect(vm.content.membership!.activePlayer?.expiresAtDisplay).toMatch(/2099/);
    expect(vm.content.membership!.activePlayer?.expiresAtDisplay).toMatch(/Sep/);
    expect(vm.content.membership!.benefitsBlurb).toMatch(/Tier 1 benefits while Active Player/);
  });

  it('tier1: no AP block; only Tier 2 upgrade CTA', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    createMemberAtTier(db, { id: m.id, slug: m.slug, tier: 'tier1' });
    db.close();
    const vm = memberServiceMod.memberService.getOwnProfile(m.slug);
    expect(vm.content.membership!.tierBadgeText).toBe('Tier 1 IFPA Member');
    expect(vm.content.membership!.activePlayer).toBeNull();
    expect(vm.content.membership!.showTier1Upgrade).toBe(false);
    expect(vm.content.membership!.showTier2Upgrade).toBe(true);
  });

  it('tier2: no upgrade CTAs', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    createMemberAtTier(db, { id: m.id, slug: m.slug, tier: 'tier2' });
    db.close();
    const vm = memberServiceMod.memberService.getOwnProfile(m.slug);
    expect(vm.content.membership!.tierBadgeText).toBe('Tier 2 IFPA Organizer Member');
    expect(vm.content.membership!.showTier1Upgrade).toBe(false);
    expect(vm.content.membership!.showTier2Upgrade).toBe(false);
  });

  it('tier3 with underlying tier1: underlying badge text references Tier 1', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    createMemberAtTier(db, {
      id: m.id, slug: m.slug, tier: 'tier3',
      underlying_tier_status: 'tier1',
      actor_member_id: ADMIN_ID,
    });
    db.close();
    const vm = memberServiceMod.memberService.getOwnProfile(m.slug);
    expect(vm.content.membership!.tierBadgeText).toBe('Tier 3 IFPA Director');
    expect(vm.content.membership!.underlyingTierBadgeText).toMatch(/Reverts to Tier 1 IFPA Member/);
    expect(vm.content.membership!.activePlayer).toBeNull();
    expect(vm.content.membership!.showTier1Upgrade).toBe(false);
    expect(vm.content.membership!.showTier2Upgrade).toBe(false);
  });

  it('tier3 with underlying tier2: underlying badge text references Tier 2', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    createMemberAtTier(db, {
      id: m.id, slug: m.slug, tier: 'tier3',
      underlying_tier_status: 'tier2',
      actor_member_id: ADMIN_ID,
    });
    db.close();
    const vm = memberServiceMod.memberService.getOwnProfile(m.slug);
    expect(vm.content.membership!.underlyingTierBadgeText).toMatch(/Reverts to Tier 2 IFPA Organizer Member/);
  });
});

describe('getOwnProfile().content.quickActions', () => {
  it('always renders three live actions linking to slug-scoped routes', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    insertMember(db, { id: m.id, slug: m.slug });
    db.close();
    const vm = memberServiceMod.memberService.getOwnProfile(m.slug);
    expect(vm.content.quickActions).toEqual([
      { label: 'My Profile',   href: `/members/${m.slug}/edit` },
      { label: 'My Galleries', href: `/members/${m.slug}/galleries` },
      { label: 'Upload Media', href: `/members/${m.slug}/media/upload` },
    ]);
  });
});

describe('getOwnProfile().content.comingSoon', () => {
  it('lists every coming-soon surface with a description', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    insertMember(db, { id: m.id, slug: m.slug });
    db.close();
    const vm = memberServiceMod.memberService.getOwnProfile(m.slug);
    const labels = vm.content.comingSoon!.map((f) => f.label);
    expect(labels).toEqual([
      'My Events',
      'Payments & Donations',
      'Voting & HoF',
      'Email Subscriptions',
    ]);
    for (const f of vm.content.comingSoon!) {
      expect(f.description.length).toBeGreaterThan(0);
    }
  });
});

describe('getOwnProfile().content.search', () => {
  it('no query → form rendered, hasQuery false, results empty', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    insertMember(db, { id: m.id, slug: m.slug });
    db.close();
    const vm = memberServiceMod.memberService.getOwnProfile(m.slug);
    expect(vm.content.search!.formAction).toBe(`/members/${m.slug}`);
    expect(vm.content.search!.hasQuery).toBe(false);
    expect(vm.content.search!.results).toEqual([]);
    expect(vm.content.search!.tooShort).toBe(false);
  });

  it('query passed → searchMembers invoked, hasQuery true', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    insertMember(db, { id: m.id, slug: m.slug });
    db.close();
    const vm = memberServiceMod.memberService.getOwnProfile(m.slug, { query: 'no-match-zzzzz' });
    expect(vm.content.search!.hasQuery).toBe(true);
    expect(vm.content.search!.query).toBe('no-match-zzzzz');
    expect(vm.content.search!.tooShort).toBe(false);
  });
});
