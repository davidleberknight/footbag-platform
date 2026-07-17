/**
 * Integration tests for auth-gating of club member lists.
 *
 * Club detail pages are public, but the members section is only rendered
 * for authenticated users. Unauthenticated responses must not include
 * member names in the HTML body.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { createTestDb } from '../fixtures/testDb';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  insertTag,
  insertClub,
  insertMember,
  insertHistoricalPerson,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertMemberTierGrant,
  createTestSessionJwt,
  completeOnboarding,
} from '../fixtures/factories';

const TEST_DB_PATH      = path.join(os.tmpdir(), `footbag-test-clubs-auth-${Date.now()}.db`);

// JWT/SES env vars come from tests/setup-env.ts (per-vitest-worker defaults).
process.env.FOOTBAG_DB_PATH          = TEST_DB_PATH;
process.env.PORT                     = '3002';
process.env.NODE_ENV                 = 'test';
process.env.LOG_LEVEL                = 'error';
process.env.PUBLIC_BASE_URL          = 'http://localhost:3002';
process.env.SESSION_SECRET           = 'test-secret-clubs-auth';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

function authCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: 'test-user', role: 'admin' })}`;
}

beforeAll(async () => {
  const db = createTestDb(TEST_DB_PATH);
  // Admin test-user for authCookie()
  insertMember(db, {
    id: 'test-user',
    slug: 'test_user_admin',
    login_email: 'test-user@example.com',
    display_name: 'Test Admin',
    is_admin: 1,
  });
  completeOnboarding(db, 'test-user');

  // Club with a known tag key
  const clubId = insertClub(db, {
    id:   'club-auth-test-001',
    name: 'Evergreen Footbag Club',
    city: 'Seattle',
    country: 'USA',
    hashtag_tag_id: insertTag(db, {
      tag_normalized: '#club_evergreen',
      tag_display:    '#club_evergreen',
      standard_type:  'club',
    }),
  });

  // Historical person who is a confirmed member of that club
  const personId = insertHistoricalPerson(db, {
    person_id:   'person-confirmed-001',
    person_name: 'Zephyr Kickflip',
    country:     'US',
  });

  // Legacy candidate mapped to the club
  const candidateId = insertLegacyClubCandidate(db, {
    legacy_club_key: 'legacy_evergreen_001',
    display_name:    'Evergreen Footbag Club',
    mapped_club_id:  clubId,
  });

  // Confirmed affiliation
  insertLegacyPersonClubAffiliation(db, {
    historical_person_id:     personId,
    legacy_club_candidate_id: candidateId,
    resolution_status:        'confirmed_current',
    resolved_club_id:         clubId,
  });

  // The confirmed person has claimed a live, search-visible member account:
  // their roster entry must link to the member profile, not the history page.
  insertMember(db, {
    id:           'member-zephyr',
    slug:         'zephyr_kickflip',
    login_email:  'zephyr@example.com',
    display_name: 'Zephyr Kickflip',
  });
  db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?')
    .run(personId, 'member-zephyr');
  // Roster-badge data for the claimed member: Tier 1, honor flags, location.
  insertMemberTierGrant(db, { member_id: 'member-zephyr', new_tier_status: 'tier1' });
  db.prepare(
    "UPDATE members SET is_hof = 1, is_bap = 1, is_board = 1, city = 'Portland', country = 'CA' WHERE id = ?",
  ).run('member-zephyr');

  // Confirmed person WITHOUT a claimed member account: roster entry links to
  // the historical-person page instead.
  const unclaimedPersonId = insertHistoricalPerson(db, {
    person_id:   'person-confirmed-002',
    person_name: 'Yara Unclaimed',
    country:     'US',
  });
  insertLegacyPersonClubAffiliation(db, {
    historical_person_id:     unclaimedPersonId,
    legacy_club_candidate_id: candidateId,
    resolution_status:        'confirmed_current',
    resolved_club_id:         clubId,
  });

  // Second person with a 'pending' (unresolved) affiliation — must never appear
  const pendingPersonId = insertHistoricalPerson(db, {
    person_id:   'person-pending-001',
    person_name: 'Phantom Unresolved',
    country:     'US',
  });
  insertLegacyPersonClubAffiliation(db, {
    historical_person_id:     pendingPersonId,
    legacy_club_candidate_id: candidateId,
    resolution_status:        'pending',
  });

  // A club whose legacy free-text description embeds a member list and contact
  // handles: the same class of data the roster gate protects.
  insertClub(db, {
    id:   'club-legacy-desc-001',
    name: 'Roster Blurb Club',
    city: 'Los Angeles',
    country: 'USA',
    description:
      'Members: Mike Stoler Greg Grandy Sam Gregory Chad Devlahovich. ' +
      'Contact Chris Pinkus to get in touch, or by AIM: toeshred.',
    hashtag_tag_id: insertTag(db, {
      tag_normalized: '#club_rosterblurb',
      tag_display:    '#club_rosterblurb',
      standard_type:  'club',
    }),
  });

  // A club with an ordinary description that names no individuals: stays public.
  insertClub(db, {
    id:   'club-clean-desc-001',
    name: 'Clean Blurb Club',
    city: 'Denver',
    country: 'USA',
    description: 'We meet every Saturday at the park for casual kicking. All levels welcome.',
    hashtag_tag_id: insertTag(db, {
      tag_normalized: '#club_cleanblurb',
      tag_display:    '#club_cleanblurb',
      standard_type:  'club',
    }),
  });

  // Corpus-audit fixtures. Prose rich in capitalized place / event names but with
  // no roster label or contact must stay public (the old name-pair proxy withheld
  // these by mistake).
  insertClub(db, {
    id:   'club-placenames-001',
    name: 'Placenames Club',
    city: 'Erie',
    country: 'USA',
    description: 'We kick around Erie Pennsylvania, New Jersey, and New York. Footbag Worlds and Four Square are a blast.',
    hashtag_tag_id: insertTag(db, { tag_normalized: '#club_placenames', tag_display: '#club_placenames', standard_type: 'club' }),
  });

  // A bare social-media URL id is not a phone number, so it must stay public.
  insertClub(db, {
    id:   'club-fburl-001',
    name: 'Facebook URL Club',
    city: 'Austin',
    country: 'USA',
    description: 'Find us on Facebook at https://www.facebook.com/groups/216661849514732 and come kick.',
    hashtag_tag_id: insertTag(db, { tag_normalized: '#club_fburl', tag_display: '#club_fburl', standard_type: 'club' }),
  });

  // A named contact after a colon is a real contact-person leak and is withheld.
  insertClub(db, {
    id:   'club-contactcolon-001',
    name: 'Contact Colon Club',
    city: 'Joplin',
    country: 'USA',
    description: 'Come kick with us. Contact: Todd to get together in the Joplin area.',
    hashtag_tag_id: insertTag(db, { tag_normalized: '#club_contactcolon', tag_display: '#club_contactcolon', standard_type: 'club' }),
  });

  db.close();
  const mod = await import('../../src/app');
  createApp = mod.createApp;
});

afterAll(() => {
  for (const f of [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

describe('GET /clubs/club_evergreen — unauthenticated', () => {
  it('returns 200 (club detail is public)', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_evergreen');
    expect(res.status).toBe(200);
  });

  it('shows club name and city', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_evergreen');
    expect(res.text).toContain('Evergreen Footbag Club');
    expect(res.text).toContain('Seattle');
  });

  it('does not include member names in the response body', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_evergreen');
    expect(res.text).not.toContain('Zephyr Kickflip');
    expect(res.text).not.toContain('Yara Unclaimed');
  });

  it('shows a login prompt in place of the members list', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_evergreen');
    expect(res.text).toContain('Log in');
    expect(res.text).toContain('/login');
  });

  it('does not expose members with unresolved affiliation status', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_evergreen');
    expect(res.text).not.toContain('Phantom Unresolved');
  });
});

describe('legacy club description privacy', () => {
  it('withholds a description that embeds a member list or contact data from anonymous viewers', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_rosterblurb');
    expect(res.status).toBe(200);
    // None of the embedded personal data reaches the anonymous shell.
    expect(res.text).not.toContain('Mike Stoler');
    expect(res.text).not.toContain('Chris Pinkus');
    expect(res.text).not.toContain('toeshred');
    expect(res.text).not.toContain('AIM');
    // In its place, an archival note.
    expect(res.text).toContain('imported historical description that names individual people');
  });

  it('shows the full legacy description to a logged-in member', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/clubs/club_rosterblurb')
      .set('Cookie', authCookie());
    expect(res.text).toContain('Mike Stoler');
    expect(res.text).toContain('Chris Pinkus');
  });

  it('leaves an ordinary description that names no individuals public', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_cleanblurb');
    expect(res.text).toContain('every Saturday at the park');
    expect(res.text).not.toContain('imported historical description');
  });

  it('keeps prose with capitalized place and event names public (not a member roster)', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_placenames');
    expect(res.text).toContain('Erie Pennsylvania');
    expect(res.text).not.toContain('imported historical description');
  });

  it('does not treat a bare social-media URL id as a phone number', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_fburl');
    expect(res.text).toContain('facebook.com/groups/216661849514732');
    expect(res.text).not.toContain('imported historical description');
  });

  it('withholds a named contact after a colon from anonymous viewers', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_contactcolon');
    expect(res.text).not.toContain('Contact: Todd');
    expect(res.text).toContain('imported historical description that names individual people');
  });
});

describe('GET /clubs/club_evergreen — authenticated', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/clubs/club_evergreen')
      .set('Cookie', authCookie());
    expect(res.status).toBe(200);
  });

  it('shows confirmed member names', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/clubs/club_evergreen')
      .set('Cookie', authCookie());
    expect(res.text).toContain('Zephyr Kickflip');
  });

  it('does not show the login prompt', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/clubs/club_evergreen')
      .set('Cookie', authCookie());
    expect(res.text).not.toContain('Log in to see club members');
  });

  it('shows tier badge, honor flags, and location for a claimed roster member; unclaimed rows carry none', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/clubs/club_evergreen')
      .set('Cookie', authCookie());
    expect(res.status).toBe(200);
    // Claimed member (Zephyr, Tier 1 + HoF/BAP/Board, Portland CA) is enriched.
    expect(res.text).toContain('Tier 1');
    expect(res.text).toContain('HoF');
    expect(res.text).toContain('BAP');
    expect(res.text).toContain('Board');
    expect(res.text).toContain('Portland, CA');
    // The unclaimed historical row still renders, without member enrichment.
    expect(res.text).toContain('Yara Unclaimed');
  });

  it('shows an opted-in member gender on the roster', async () => {
    const db = new BetterSqlite3(TEST_DB_PATH);
    db.prepare("UPDATE members SET gender = 'male', show_gender = 1 WHERE id = 'member-zephyr'").run();
    db.close();
    const app = createApp();
    const res = await request(app)
      .get('/clubs/club_evergreen')
      .set('Cookie', authCookie());
    expect(res.text).toContain('Zephyr Kickflip');
    expect(res.text).toContain('Male');
  });

  it('hides roster gender when the member has not opted in', async () => {
    const db = new BetterSqlite3(TEST_DB_PATH);
    db.prepare("UPDATE members SET gender = 'male', show_gender = 0 WHERE id = 'member-zephyr'").run();
    db.close();
    const app = createApp();
    const res = await request(app)
      .get('/clubs/club_evergreen')
      .set('Cookie', authCookie());
    expect(res.text).not.toContain('Male');
  });

  it('does not expose a hashtag-edit form on the public club hero', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/clubs/club_evergreen')
      .set('Cookie', authCookie());
    expect(res.text).not.toContain('name="newSlug"');
    expect(res.text).not.toContain('/clubs/club_evergreen/hashtag');
    expect(res.text).not.toContain('Update hashtag');
  });

  it('renders one Club members list, not the old split sections', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/clubs/club_evergreen')
      .set('Cookie', authCookie());
    expect(res.text).toContain('Club members');
    expect(res.text).not.toContain('Possible members from legacy records');
    expect(res.text).not.toContain('have not yet confirmed their membership in onboarding');
  });

  it('links a confirmed member with a claimed account to their member profile', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/clubs/club_evergreen')
      .set('Cookie', authCookie());
    expect(res.text).toMatch(/<a href="\/members\/zephyr_kickflip">Zephyr Kickflip<\/a>/);
  });

  it('links a confirmed member without a claimed account to the history page', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/clubs/club_evergreen')
      .set('Cookie', authCookie());
    expect(res.text).toMatch(/<a href="\/history\/person-confirmed-002">Yara Unclaimed<\/a>/);
  });

  // Pending legacy affiliations are surfaced honestly: shown to authenticated
  // members in the same list, labeled per entry as unconfirmed, never presented
  // as confirmed current membership. Other excluded statuses (former_only,
  // not_mine, needs_review, rejected, superseded) stay hidden.
  it('links a pending member to the history page with an unconfirmed status note', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/clubs/club_evergreen')
      .set('Cookie', authCookie());
    expect(res.text).toMatch(/<a href="\/history\/person-pending-001">Phantom Unresolved<\/a>/);
    expect(res.text).toMatch(/Phantom Unresolved<\/a>\s*<span class="text-muted fs-sm">\(historical member, unconfirmed current\)<\/span>/);
  });

  it('does not attach the unconfirmed status note to confirmed members', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/clubs/club_evergreen')
      .set('Cookie', authCookie());
    expect(res.text).not.toMatch(/Zephyr Kickflip<\/a>\s*<span class="text-muted fs-sm">\(historical member/);
    expect(res.text).not.toMatch(/Yara Unclaimed<\/a>\s*<span class="text-muted fs-sm">\(historical member/);
  });
});
