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
  createTier0WithActivePlayer,
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
    expect(vm.content.membership!.activePlayer).toEqual({ isCurrent: false, expiresAtDisplay: null, hasLapsed: false, currentExplanation: null, lapsedExplanation: null });
    expect(vm.content.membership!.underlyingTierBadgeText).toBeNull();
    expect(vm.content.membership!.showTier1Upgrade).toBe(true);
    expect(vm.content.membership!.showTier2Upgrade).toBe(true);
    expect(vm.content.membership!.benefitsBlurb).toMatch(/You can browse the platform/);
    // Never held the status, so the one-time club-join grant is still open to
    // them and the text says so as a fact rather than as a condition to resolve.
    expect(vm.content.membership!.benefitsBlurb).toMatch(/once by joining your first club/);
    expect(vm.content.membership!.tier1PriceDisplay).toBe('$10 USD');
    expect(vm.content.membership!.tier2PriceDisplay).toBe('$50 USD');
  });

  it('tier0 who has held Active Player before: the club route is not offered again', () => {
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
    // The one-time grant reaches only a member who has never held the status,
    // so naming it here would advertise a route that would refuse them.
    expect(vm.content.membership!.benefitsBlurb).not.toMatch(/joining your first club/);
    expect(vm.content.membership!.benefitsBlurb).toMatch(/attending a qualifying event/);
    expect(vm.content.membership!.benefitsBlurb).toMatch(/can also vouch for you/);
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
    // The tier description and the Active Player description are separate
    // fields: a Tier 0 Active Player reads both, because the status is
    // temporary and the tier under it is not.
    expect(vm.content.membership!.benefitsBlurb).toMatch(/You can browse the platform/);
    expect(vm.content.membership!.activePlayer?.currentExplanation)
      .toMatch(/Tier 1 benefits while Active Player/);
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

/**
 * The membership block renders its paragraphs consecutively, so the roster line
 * is stated only where no neighbouring sentence already answers it. Each
 * suppression case below also asserts the sentence that earns the suppression:
 * reword that neighbour to drop the roster and the case goes red, rather than
 * leaving the member with no answer at all.
 */
describe('getOwnProfile().content.membership.rosterStatusText', () => {
  it('tells a Tier 0 member who has never held Active Player status where they stand', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    insertMember(db, { id: m.id, slug: m.slug });
    db.close();
    const membership = memberServiceMod.memberService.getOwnProfile(m.slug).content.membership!;
    expect(membership.rosterStatusText).toBe(
      'You are not on the Official IFPA Roster. Tier 1 membership or current Active Player status puts you on it.',
    );
  });

  it('stays silent for a current Active Player, whose status sentence already says it', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    createTier0WithActivePlayer(db, {
      id: m.id, slug: m.slug, expiresAt: '2099-09-15T12:00:00.000Z',
    });
    db.close();
    const membership = memberServiceMod.memberService.getOwnProfile(m.slug).content.membership!;
    expect(membership.activePlayer?.isCurrent).toBe(true);
    expect(membership.activePlayer?.currentExplanation).toMatch(/Official IFPA Roster/);
    expect(membership.rosterStatusText).toBeNull();
  });

  it('stays silent for a lapsed Active Player, whose lapse sentence already says it', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    createTier0WithActivePlayer(db, {
      id: m.id, slug: m.slug, expiresAt: '2020-06-01T00:00:00.000Z',
    });
    db.close();
    const membership = memberServiceMod.memberService.getOwnProfile(m.slug).content.membership!;
    expect(membership.activePlayer?.hasLapsed).toBe(true);
    expect(membership.activePlayer?.lapsedExplanation).toMatch(/Official IFPA Roster/);
    expect(membership.rosterStatusText).toBeNull();
  });

  it('stays silent for Tier 1, whose benefits sentence already says it', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    createMemberAtTier(db, { id: m.id, slug: m.slug, tier: 'tier1' });
    db.close();
    const membership = memberServiceMod.memberService.getOwnProfile(m.slug).content.membership!;
    expect(membership.benefitsBlurb).toMatch(/listed on the Official IFPA Roster/);
    expect(membership.rosterStatusText).toBeNull();
  });

  it('tells a Tier 2 member they are on it, which their benefits sentence does not', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    createMemberAtTier(db, { id: m.id, slug: m.slug, tier: 'tier2' });
    db.close();
    const membership = memberServiceMod.memberService.getOwnProfile(m.slug).content.membership!;
    // Tier 2's benefits sentence offers the roster to read, never says the
    // member is listed on it, which is why the line is worth its space here.
    expect(membership.benefitsBlurb).not.toMatch(/listed on the Official IFPA Roster/);
    expect(membership.rosterStatusText).toBe('You are on the Official IFPA Roster.');
  });

  it('tells a Tier 3 director they are on it, which their governance sentence does not', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    createMemberAtTier(db, {
      id: m.id, slug: m.slug, tier: 'tier3',
      underlying_tier_status: 'tier2',
      actor_member_id: ADMIN_ID,
    });
    db.close();
    const membership = memberServiceMod.memberService.getOwnProfile(m.slug).content.membership!;
    expect(membership.benefitsBlurb).not.toMatch(/Official IFPA Roster/);
    expect(membership.rosterStatusText).toBe('You are on the Official IFPA Roster.');
  });
});

describe('getOwnProfile().content.quickActions', () => {
  it('offers nothing to a member whose every shortcut has a home elsewhere', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    createMemberAtTier(db, { id: m.id, slug: m.slug, tier: 'tier1' });
    db.close();
    const vm = memberServiceMod.memberService.getOwnProfile(m.slug);
    // The profile editor is reached from the sidebar button, and both media
    // routes from the Media section, which is where a member looks for their
    // own photos and videos. Repeating either here would put one destination
    // on the page twice.
    expect(vm.content.quickActions).toEqual([]);
  });

  it('offers the announcement shortcut to an organizer-tier member', () => {
    const db = new BetterSqlite3(dbPath);
    const m = nextMember();
    createMemberAtTier(db, { id: m.id, slug: m.slug, tier: 'tier2' });
    db.close();
    const vm = memberServiceMod.memberService.getOwnProfile(m.slug);
    expect(vm.content.quickActions).toEqual([
      { label: 'Send an Announcement', href: `/members/${m.slug}/announce` },
    ]);
  });

  it('gives a member the media routes in the Media section, gated on the benefit', () => {
    const db = new BetterSqlite3(dbPath);
    const paid = nextMember();
    createMemberAtTier(db, { id: paid.id, slug: paid.slug, tier: 'tier1' });
    const free = nextMember();
    insertMember(db, { id: free.id, slug: free.slug });
    db.close();

    const held = memberServiceMod.memberService.getOwnProfile(paid.slug).content.media!;
    expect(held.galleriesHref).toBe(`/members/${paid.slug}/galleries`);
    expect(held.uploadMediaHref).toBe(`/members/${paid.slug}/media/upload`);
    expect(held.benefitNotice).toBeNull();

    // Without the benefit there is no upload route to offer, so the section
    // carries the card explaining what unlocks it instead.
    const missing = memberServiceMod.memberService.getOwnProfile(free.slug).content.media!;
    expect(missing.galleriesHref).toBe(`/members/${free.slug}/galleries`);
    expect(missing.uploadMediaHref).toBeNull();
    expect(missing.benefitNotice?.lead).toBe('Sharing media is a Tier 1 benefit.');
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
