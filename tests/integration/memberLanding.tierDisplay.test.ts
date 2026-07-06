/**
 * Route-level rendering of the membership block on the personal home
 * (M_View_Tier_Status). Personal-home blocks live on the profile at
 * `/members/<slug>`; `/members` is the public welcome page and never
 * carries authenticated tier badges. Confirms the rendered HTML
 * carries the tier badge and AP status correctly across the fixture
 * set, and that the public welcome page never leaks tier-display
 * affordances meant for authenticated members.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertMember,
  insertActivePlayerGrant,
  createMemberAtTier,
  createTier0WithActivePlayer,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3087');

let createApp: Awaited<ReturnType<typeof importApp>>;

const ADMIN_ID = 'admin-mlt-001';
const T0_NOAP_ID = 'member-mlt-t0-noap';
const T0_AP_ID = 'member-mlt-t0-ap';
const T1_ID = 'member-mlt-t1';
const T2_ID = 'member-mlt-t2';
const T3_T1_ID = 'member-mlt-t3-t1';
const T3_T2_ID = 'member-mlt-t3-t2';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'mlt_admin', is_admin: 1 });
  insertMember(db, { id: T0_NOAP_ID, slug: 'mlt_t0_noap', display_name: 'T0 NoAP' });
  createTier0WithActivePlayer(db, {
    id: T0_AP_ID,
    slug: 'mlt_t0_ap',
    expiresAt: '2099-09-15T12:00:00.000Z',
    memberOverrides: { display_name: 'T0 AP' },
  });
  createMemberAtTier(db, { id: T1_ID, slug: 'mlt_t1', tier: 'tier1', memberOverrides: { display_name: 'T1' } });
  createMemberAtTier(db, { id: T2_ID, slug: 'mlt_t2', tier: 'tier2', memberOverrides: { display_name: 'T2' } });
  createMemberAtTier(db, {
    id: T3_T1_ID, slug: 'mlt_t3_t1', tier: 'tier3',
    underlying_tier_status: 'tier1',
    actor_member_id: ADMIN_ID,
    memberOverrides: { display_name: 'T3 (underlying T1)' },
  });
  createMemberAtTier(db, {
    id: T3_T2_ID, slug: 'mlt_t3_t2', tier: 'tier3',
    underlying_tier_status: 'tier2',
    actor_member_id: ADMIN_ID,
    memberOverrides: { display_name: 'T3 (underlying T2)' },
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function cookieFor(memberId: string, role: 'admin' | 'member' = 'member'): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role })}`;
}

const SLUG_BY_ID: Record<string, string> = {
  [T0_NOAP_ID]: 'mlt_t0_noap',
  [T0_AP_ID]:   'mlt_t0_ap',
  [T1_ID]:      'mlt_t1',
  [T2_ID]:      'mlt_t2',
  [T3_T1_ID]:   'mlt_t3_t1',
  [T3_T2_ID]:   'mlt_t3_t2',
};

async function getDashboard(memberId: string): Promise<request.Response> {
  const slug = SLUG_BY_ID[memberId];
  return request(createApp())
    .get(`/members/${slug}`)
    .set('Cookie', cookieFor(memberId));
}

describe('GET /members/<slug> — Membership block rendering on personal home', () => {
  it('tier0 no-AP: renders Tier 0 badge + Tier 1 / Tier 2 upgrade CTAs', async () => {
    const res = await getDashboard(T0_NOAP_ID);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Membership');
    expect(res.text).toContain('Tier 0 Registered Member');
    expect(res.text).toContain('Upgrade to Tier 1');
    expect(res.text).toContain('Upgrade to Tier 2');
    // Blurb uses second-person "You..." form (no tier-name duplication).
    expect(res.text).toContain('You can browse the platform');
    // Rules link points to the IFPA hub.
    expect(res.text).toContain('href="/ifpa"');
    expect(res.text).toContain('View IFPA membership rules');
    // No Active Player badge for the no-AP case.
    expect(res.text).not.toMatch(/Active Player\s*—/);
    // Club-less Tier 0 without Active Player: creating a club requires Tier 1
    // benefits, so the My Clubs block shows the Tier-1 requirement note rather
    // than a create-club action.
    expect(res.text).toContain('You have no club affiliations yet.');
    expect(res.text).not.toContain('Start a New Club');
    expect(res.text).toContain('Creating a club requires IFPA Membership (Tier 1)');
  });

  it('tier0 with current AP: renders Tier 0 badge + Active Player line with formatted expiry', async () => {
    const res = await getDashboard(T0_AP_ID);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Tier 0 Registered Member');
    expect(res.text).toContain('Active Player');
    expect(res.text).toMatch(/Sep.*2099/);
    expect(res.text).toContain('Tier 1 benefits while Active Player');
  });

  it('tier1: only Tier 2 upgrade CTA renders', async () => {
    const res = await getDashboard(T1_ID);
    expect(res.text).toContain('Tier 1 IFPA Member');
    expect(res.text).not.toContain('Upgrade to Tier 1');
    expect(res.text).toContain('Upgrade to Tier 2');
  });

  it('tier2: no upgrade CTAs', async () => {
    const res = await getDashboard(T2_ID);
    expect(res.text).toContain('Tier 2 IFPA Organizer Member');
    expect(res.text).not.toContain('Upgrade to Tier 1');
    expect(res.text).not.toContain('Upgrade to Tier 2');
  });

  it('tier3 underlying tier1: shows underlying-tier reverts text', async () => {
    const res = await getDashboard(T3_T1_ID);
    expect(res.text).toContain('Tier 3 IFPA Director');
    expect(res.text).toContain('Reverts to Tier 1 IFPA Member');
    expect(res.text).not.toContain('Upgrade to Tier');
  });

  it('tier3 underlying tier2: shows underlying-tier reverts text', async () => {
    const res = await getDashboard(T3_T2_ID);
    expect(res.text).toContain('Reverts to Tier 2 IFPA Organizer Member');
  });

  it('quick actions render slug-scoped links for each live surface', async () => {
    const res = await getDashboard(T1_ID);
    expect(res.text).toContain('Quick Actions');
    expect(res.text).toContain('href="/members/mlt_t1/edit"');
    expect(res.text).toContain('href="/members/mlt_t1/galleries"');
    expect(res.text).toContain('href="/members/mlt_t1/media/upload"');
  });

  it('coming-soon features render under their own labeled section', async () => {
    const res = await getDashboard(T1_ID);
    expect(res.text).toContain('More Features');
    expect(res.text).toContain('Coming soon');
    expect(res.text).toContain('My Clubs');
    expect(res.text).toContain('My Events');
    expect(res.text).toContain('Donations');
    expect(res.text).toContain('Voting &amp; HoF');
    expect(res.text).toContain('Email Subscriptions');
    expect(res.text).not.toContain('Account Management');
  });

  it('search section still renders and works (regression check)', async () => {
    const res = await getDashboard(T1_ID);
    expect(res.text).toContain('Find Members');
    expect(res.text).toContain('Search by name');
    expect(res.text).not.toContain('Results'); // no query → no results section
  });
});

describe('GET /ifpa — membership tier display', () => {
  it('renders the tier explainer with canonical labels and prices', async () => {
    const res = await request(createApp()).get('/ifpa');
    expect(res.status).toBe(200);
    expect(res.text).toContain('global governing body for footbag');
    // Tier explainer enumerates all four tiers using the canonical labels.
    expect(res.text).toContain('Tier 0 Registered Member');
    expect(res.text).toContain('Tier 1 IFPA Member');
    expect(res.text).toContain('Tier 2 IFPA Organizer Member');
    expect(res.text).toContain('Tier 3 IFPA Director');
    expect(res.text).toContain('Free');
    expect(res.text).toContain('$10 USD');
    expect(res.text).toContain('$50 USD');
    expect(res.text).toContain('Assigned by IFPA');
  });

  it('renders tier-specific benefits and avoids inaccurate gating claims', async () => {
    const res = await request(createApp()).get('/ifpa');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Vote in IFPA elections');
    expect(res.text).toContain('sanctioned events');
    expect(res.text).toContain('Active Player');
    expect(res.text).toContain('Event Organizer');
    expect(res.text).toContain('Club Leader');
    // Tier 0 members CAN compete in events and join clubs; IFPA was
    // incorporated in 1994; there is no enumerable Tier-1-only area.
    expect(res.text).not.toContain('tournament eligibility');
    expect(res.text).not.toContain('since 1983');
    expect(res.text).not.toContain('IFPA-member-only areas');
  });

  it('shows the Become a Member card and a login link to anonymous visitors', async () => {
    const res = await request(createApp()).get('/ifpa');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Become a Member');
    expect(res.text).toContain('/register');
    expect(res.text).toContain('/login');
  });

  it('shows the same membership tiers to authenticated members, without the join CTAs', async () => {
    const res = await request(createApp())
      .get('/ifpa')
      .set('Cookie', cookieFor(T1_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Tier 0 Registered Member');
    expect(res.text).not.toContain('Become a Member');
  });
});
