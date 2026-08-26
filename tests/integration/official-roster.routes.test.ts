/**
 * Route contract for the Official IFPA Roster page.
 *
 * The IFPA membership rules make the roster available to Tier 2 (IFPA
 * Organizer Member) and above for official IFPA event and organizer purposes,
 * and require that it stay not public. Site administrators must already hold
 * Tier 2 or Tier 3, so one tier gate serves administrators, directors and
 * organizers alike. Everyone below Tier 2 is refused.
 *
 * The rules grant access and say nothing about taking a copy, so the roster is
 * never downloadable: no response from this route is an attachment.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertMemberTierGrant,
  insertActivePlayerGrant,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4130');

let createApp: Awaited<ReturnType<typeof importApp>>;

const FUTURE_AP = '2099-01-01T00:00:00.000Z';

const ADMIN_ID = 'rr_admin';
const TIER3_ID = 'rr_tier3';
const TIER2_ID = 'rr_tier2';
const TIER1_ID = 'rr_tier1';
const TIER0_AP_ID = 'rr_tier0_ap';
const TIER0_ID = 'rr_tier0';

function cookieFor(memberId: string, role?: 'admin'): string {
  return `__Host-footbag_session=${createTestSessionJwt(role ? { memberId, role } : { memberId })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // An administrator holds Tier 2, which is what the platform requires of the
  // admin role; the tier gate is what actually admits them here.
  insertMember(db, {
    id: ADMIN_ID, slug: 'rr_admin', display_name: 'Rota Admin',
    real_name: 'Rota Admin', login_email: 'rr-admin@example.com', is_admin: 1,
  });
  insertMemberTierGrant(db, {
    member_id: ADMIN_ID, new_tier_status: 'tier2', reason_code: 'purchase.tier2',
  });

  insertMember(db, {
    id: TIER3_ID, slug: 'rr_tier3', display_name: 'Dana Director',
    real_name: 'Dana Director', login_email: 'rr-t3@example.com',
  });
  insertMemberTierGrant(db, {
    member_id: TIER3_ID, new_tier_status: 'tier3', change_type: 'governance_set',
    new_underlying_tier_status: 'tier1', reason_code: 'governance.tier3_set',
    actor_member_id: ADMIN_ID,
  });

  // Opted in to showing their sign-in address to members.
  insertMember(db, {
    id: TIER2_ID, slug: 'rr_tier2', display_name: 'Olive Organizer',
    real_name: 'Olive Organizer', login_email: 'rr-t2@example.com',
  });
  db.prepare(`UPDATE members SET email_visibility = 'members' WHERE id = ?`).run(TIER2_ID);
  insertMemberTierGrant(db, {
    member_id: TIER2_ID, new_tier_status: 'tier2', reason_code: 'purchase.tier2',
  });

  // Left at the default private visibility.
  insertMember(db, {
    id: TIER1_ID, slug: 'rr_tier1', display_name: 'Milo Member',
    real_name: 'Milo Member', login_email: 'rr-t1@example.com',
  });
  insertMemberTierGrant(db, {
    member_id: TIER1_ID, new_tier_status: 'tier1', reason_code: 'purchase.tier1',
  });

  insertMember(db, {
    id: TIER0_AP_ID, slug: 'rr_tier0_ap', display_name: 'Pat Player',
    real_name: 'Pat Player', login_email: 'rr-t0ap@example.com',
  });
  insertActivePlayerGrant(db, {
    member_id: TIER0_AP_ID, change_type: 'grant',
    new_active_player_expires_at: FUTURE_AP,
    reason_code: 'official_event_attendance',
  });

  insertMember(db, {
    id: TIER0_ID, slug: 'rr_tier0', display_name: 'Zoe Zero',
    real_name: 'Zoe Zero', login_email: 'rr-t0@example.com',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /ifpa/roster access', () => {
  it('redirects a signed-out visitor to log in rather than showing the roster', async () => {
    const res = await request(createApp()).get('/ifpa/roster');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('admits an administrator', async () => {
    const res = await request(createApp()).get('/ifpa/roster').set('Cookie', cookieFor(ADMIN_ID, 'admin'));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Official IFPA Roster');
  });

  it('admits a Tier 3 director', async () => {
    const res = await request(createApp()).get('/ifpa/roster').set('Cookie', cookieFor(TIER3_ID));
    expect(res.status).toBe(200);
  });

  it('admits a Tier 2 organizer', async () => {
    const res = await request(createApp()).get('/ifpa/roster').set('Cookie', cookieFor(TIER2_ID));
    expect(res.status).toBe(200);
  });

  it('refuses a Tier 1 member', async () => {
    const res = await request(createApp()).get('/ifpa/roster').set('Cookie', cookieFor(TIER1_ID));
    expect(res.status).toBe(403);
  });

  it('refuses a Tier 0 member holding current Active Player status', async () => {
    const res = await request(createApp()).get('/ifpa/roster').set('Cookie', cookieFor(TIER0_AP_ID));
    expect(res.status).toBe(403);
  });

  it('refuses a Tier 0 member', async () => {
    const res = await request(createApp()).get('/ifpa/roster').set('Cookie', cookieFor(TIER0_ID));
    expect(res.status).toBe(403);
  });
});

describe('GET /ifpa/roster content', () => {
  it('renders the roster and not a governance document, so the literal path wins over the slug route', async () => {
    const res = await request(createApp()).get('/ifpa/roster').set('Cookie', cookieFor(TIER2_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Roster Members');
    expect(res.text).not.toContain('Governance Documents');
  });

  it('lists the roster members and omits those the roster excludes', async () => {
    const res = await request(createApp()).get('/ifpa/roster').set('Cookie', cookieFor(TIER2_ID));
    expect(res.text).toContain('Olive Organizer');
    expect(res.text).toContain('Milo Member');
    expect(res.text).toContain('Dana Director');
    expect(res.text).not.toContain('Zoe Zero');
  });

  it('shows an address the member opted into and withholds one they did not', async () => {
    const res = await request(createApp()).get('/ifpa/roster').set('Cookie', cookieFor(TIER2_ID));
    expect(res.text).toContain('rr-t2@example.com');
    expect(res.text).not.toContain('rr-t1@example.com');
  });

  it('narrows the list to one tier when the tier filter is applied', async () => {
    const res = await request(createApp())
      .get('/ifpa/roster?tier=tier3')
      .set('Cookie', cookieFor(TIER2_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Dana Director');
    expect(res.text).not.toContain('Milo Member');
  });

  it('narrows the list by search term', async () => {
    const res = await request(createApp())
      .get('/ifpa/roster?q=Olive')
      .set('Cookie', cookieFor(TIER2_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Olive Organizer');
    expect(res.text).not.toContain('Dana Director');
  });

  it('shows the empty state rather than an error when nothing matches', async () => {
    const res = await request(createApp())
      .get('/ifpa/roster?q=nobody-by-this-name')
      .set('Cookie', cookieFor(TIER2_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('No roster member matches');
  });

  it('renders a 404 for an unknown tier value rather than ignoring it', async () => {
    const res = await request(createApp())
      .get('/ifpa/roster?tier=tier9')
      .set('Cookie', cookieFor(TIER2_ID));
    expect(res.status).toBe(404);
  });

  it('leaves the governance documents reachable at their own paths', async () => {
    const res = await request(createApp()).get('/ifpa/bylaws');
    expect(res.status).toBe(200);
  });
});

describe('the roster cannot be downloaded', () => {
  it('serves the roster as a page, never as a file attachment', async () => {
    const res = await request(createApp()).get('/ifpa/roster').set('Cookie', cookieFor(ADMIN_ID, 'admin'));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('offers no control that would hand the reader a file', async () => {
    const res = await request(createApp()).get('/ifpa/roster').set('Cookie', cookieFor(ADMIN_ID, 'admin'));
    // Any link or button pointing at a file, and the anchor attribute that
    // turns an ordinary link into a save. The page's prose may say the roster
    // cannot be downloaded; what must not exist is a control that does it.
    const targets = [...res.text.matchAll(/(?:href|action)="([^"]*)"/g)].map((m) => m[1]);
    expect(targets.filter((t) => /\.csv|export|download/i.test(t))).toEqual([]);
    expect(res.text).not.toMatch(/<a\b[^>]*\sdownload[\s=>]/i);
  });

  it('has no export route to reach, whatever an administrator types', async () => {
    for (const path of ['/ifpa/roster/export', '/ifpa/roster.csv', '/ifpa/roster/download']) {
      const res = await request(createApp()).get(path).set('Cookie', cookieFor(ADMIN_ID, 'admin'));
      expect(res.status).toBe(404);
    }
  });
});

describe('the roster page keeps the reader oriented', () => {
  it('keeps the chosen tier when a search is submitted from the page', async () => {
    const res = await request(createApp())
      .get('/ifpa/roster?tier=tier2')
      .set('Cookie', cookieFor(TIER2_ID));
    // The search form carries the tier, so submitting it narrows within the
    // tier rather than silently widening back to every tier.
    expect(res.text).toMatch(/<input type="hidden" name="tier" value="tier2">/);
  });

  it('applies a tier and a search term together', async () => {
    const res = await request(createApp())
      .get('/ifpa/roster?tier=tier2&q=Olive')
      .set('Cookie', cookieFor(TIER2_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Olive Organizer');
    expect(res.text).not.toContain('Dana Director');
  });

  it('offers a way back to the IFPA section', async () => {
    const res = await request(createApp()).get('/ifpa/roster').set('Cookie', cookieFor(TIER2_ID));
    expect(res.text).toContain('Back to IFPA Documents');
  });

  it('scrolls the member table on a narrow screen rather than squeezing it', async () => {
    const res = await request(createApp()).get('/ifpa/roster').set('Cookie', cookieFor(TIER2_ID));
    expect(res.text).toMatch(/<div class="records-table-wrap">\s*<table class="data-table">/);
  });

  it('states the roster access terms on the page the reader is standing on', async () => {
    const res = await request(createApp()).get('/ifpa/roster').set('Cookie', cookieFor(TIER2_ID));
    expect(res.text).toMatch(/not public/i);
    expect(res.text).toMatch(/every visit is recorded/i);
  });
});
