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
  const schema = fs.readFileSync(path.join(process.cwd(), 'database', 'schema.sql'), 'utf8');
  const db = new BetterSqlite3(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);

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
