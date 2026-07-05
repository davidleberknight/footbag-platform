/**
 * Integration tests for member profile routes.
 *
 * Covers:
 *   GET  /members                     — landing redirect
 *   GET  /members/:memberKey           — profile view (own vs other)
 *   GET  /members/:memberKey/edit      — edit form (own vs other)
 *   POST /members/:memberKey/edit      — save profile (validation, auth, cross-member guard)
 *   GET  /members/:memberKey/:section  — stub pages (own vs other, known vs unknown section)
 *
 * All routes require auth. Each unauthenticated test asserts a 302 redirect to
 * /login with a returnTo param.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { createTestDb } from '../fixtures/testDb';
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
  createTestSessionJwt,
  completeOnboarding,
} from '../fixtures/factories';

const TEST_DB_PATH      = path.join(os.tmpdir(), `footbag-test-member-profile-${Date.now()}.db`);

// Set env vars BEFORE any module that reads them is imported.
// JWT/SES env vars come from tests/setup-env.ts (per-vitest-worker defaults).
process.env.FOOTBAG_DB_PATH          = TEST_DB_PATH;
process.env.PORT                     = '3003';
process.env.NODE_ENV                 = 'test';
process.env.LOG_LEVEL                = 'error';
process.env.PUBLIC_BASE_URL          = 'http://localhost:3003';
process.env.SESSION_SECRET           = 'member-profile-test-secret';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

const OWN_ID      = 'member-profile-test-001';
const OWN_SLUG    = 'test_member';
const OTHER_ID    = 'member-other-test-001';
const OTHER_SLUG  = 'other_member';
const LINKED_ID   = 'member-profile-test-linked';
const LINKED_SLUG = 'linked_member';

function ownCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: OWN_ID })}`;
}

function otherCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: OTHER_ID })}`;
}

function linkedCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: LINKED_ID })}`;
}

beforeAll(async () => {
  const db = createTestDb(TEST_DB_PATH);
  insertMember(db, { id: OWN_ID,   slug: OWN_SLUG,   display_name: 'Test Member',  login_email: 'testmember@example.com' });
  completeOnboarding(db, OWN_ID);
  insertMember(db, { id: OTHER_ID, slug: OTHER_SLUG, display_name: 'Other Member', login_email: 'othermember@example.com' });
  completeOnboarding(db, OTHER_ID);

  // Fully-linked fixture: legacy account claimed + historical person attached.
  const linkedLegacy = insertLegacyMember(db, { real_name: 'Linked Legacy' });
  const linkedHp = insertHistoricalPerson(db, { person_name: 'Linked Historical' });
  insertMember(db, {
    id: LINKED_ID,
    slug: LINKED_SLUG,
    display_name: 'Linked Member',
    login_email: 'linkedmember@example.com',
    legacy_member_id: linkedLegacy,
  });
  completeOnboarding(db, LINKED_ID);
  db.prepare(
    'UPDATE legacy_members SET claimed_by_member_id = ?, claimed_at = ? WHERE legacy_member_id = ?',
  ).run(LINKED_ID, '2024-01-12T10:00:00.000Z', linkedLegacy);
  db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(linkedHp, LINKED_ID);

  db.close();

  const mod = await import('../../src/app');
  createApp = mod.createApp;
});

afterAll(() => {
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB_PATH + ext); } catch { /* ignore */ }
  }
});

// ── GET /members ───────────────────────────────────────────────────────────────

describe('GET /members — removed (no landing page)', () => {
  it('returns 404; membership lives on /ifpa and authentication on /login', async () => {
    const app = createApp();
    const res = await request(app).get('/members');
    expect(res.status).toBe(404);
  });

  it('returns 404 even for an authenticated member', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/members')
      .set('Cookie', ownCookie());
    expect(res.status).toBe(404);
  });
});

// ── GET /members/:memberKey ─────────────────────────────────────────────────────

describe('GET /members/:memberKey — profile view', () => {
  it('unauthenticated → 302 to /login with returnTo', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${OWN_SLUG}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/login?returnTo=%2Fmembers%2F${OWN_SLUG}`);
  });

  it('own profile → 200', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWN_SLUG}`)
      .set('Cookie', ownCookie());
    expect(res.status).toBe(200);
  });

  it("another member's profile → 200 read-only view for an authenticated viewer (no edit links, no payment/audit surfaces)", async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWN_SLUG}`)
      .set('Cookie', otherCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Test Member');
    // Read-only: the own-profile affordances must not leak to other viewers.
    expect(res.text).not.toContain(`/members/${OWN_SLUG}/edit`);
    expect(res.text).not.toContain('Change Password');
  });

  it("another member's profile shows the login email only when the owner opted in (email_visibility)", async () => {
    const app = createApp();

    // Default email_visibility is 'private': no email for other viewers.
    const hidden = await request(app)
      .get(`/members/${OWN_SLUG}`)
      .set('Cookie', otherCookie());
    expect(hidden.status).toBe(200);
    expect(hidden.text).not.toContain('testmember@example.com');

    const db = new BetterSqlite3(TEST_DB_PATH);
    db.prepare("UPDATE members SET email_visibility = 'members' WHERE id = ?").run(OWN_ID);
    db.close();
    try {
      const shown = await request(app)
        .get(`/members/${OWN_SLUG}`)
        .set('Cookie', otherCookie());
      expect(shown.status).toBe(200);
      expect(shown.text).toContain('testmember@example.com');
    } finally {
      const restore = new BetterSqlite3(TEST_DB_PATH);
      restore.prepare("UPDATE members SET email_visibility = 'private' WHERE id = ?").run(OWN_ID);
      restore.close();
    }
  });

  it('an anonymous visitor still cannot see an ordinary member profile (redirects to login), and a public HoF profile never carries the email even when visibility is members-only', async () => {
    const app = createApp();
    const anon = await request(app).get(`/members/${OWN_SLUG}`);
    expect(anon.status).toBe(302);

    const db = new BetterSqlite3(TEST_DB_PATH);
    db.prepare("UPDATE members SET is_hof = 1, email_visibility = 'members' WHERE id = ?").run(OTHER_ID);
    db.close();
    try {
      const hof = await request(app).get(`/members/${OTHER_SLUG}`);
      expect(hof.status).toBe(200);
      // Contact fields never reach an unauthenticated page.
      expect(hof.text).not.toContain('othermember@example.com');
      // Tier badges are member-visible only.
      expect(hof.text).not.toContain('badge-tier');

      // The same profile viewed by a logged-in member carries both.
      const authed = await request(app)
        .get(`/members/${OTHER_SLUG}`)
        .set('Cookie', ownCookie());
      expect(authed.status).toBe(200);
      expect(authed.text).toContain('othermember@example.com');
      expect(authed.text).toContain('badge-tier');
    } finally {
      const restore = new BetterSqlite3(TEST_DB_PATH);
      restore.prepare("UPDATE members SET is_hof = 0, email_visibility = 'private' WHERE id = ?").run(OTHER_ID);
      restore.close();
    }
  });

  it('nonexistent member key → 404', async () => {
    const app = createApp();
    // Authenticate as a real member; the URL slug is what must not exist.
    const res = await request(app)
      .get('/members/does-not-exist')
      .set('Cookie', ownCookie());
    expect(res.status).toBe(404);
  });

  it('own profile renders a Change Password link to /edit/password', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWN_SLUG}`)
      .set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain(`href="/members/${OWN_SLUG}/edit/password"`);
    expect(res.text).toContain('Change Password');
  });

  it('shows "Competing since {year}" on the profile when first_competition_year is set', async () => {
    const db = new BetterSqlite3(TEST_DB_PATH);
    db.prepare('UPDATE members SET first_competition_year = 2010, show_first_competition_year = 1 WHERE id = ?').run(OWN_ID);
    db.close();
    try {
      const app = createApp();
      const res = await request(app)
        .get(`/members/${OWN_SLUG}`)
        .set('Cookie', ownCookie());
      expect(res.status).toBe(200);
      expect(res.text).toContain('Competing since 2010');
    } finally {
      const restore = new BetterSqlite3(TEST_DB_PATH);
      restore.prepare('UPDATE members SET first_competition_year = NULL, show_first_competition_year = 0 WHERE id = ?').run(OWN_ID);
      restore.close();
    }
  });

  it('shows the linked historical name as an "Also known as" line when it differs from the display name', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${LINKED_SLUG}`)
      .set('Cookie', otherCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Also known as Linked Historical in competition records');
  });

  it('a history-only claimant (historical-person link, no legacy account) shows the historical name and HoF induction year', async () => {
    const db = new BetterSqlite3(TEST_DB_PATH);
    const CASEC_ID = 'member-casec';
    const CASEC_SLUG = 'member_casec';
    const hp = insertHistoricalPerson(db, {
      person_name: 'Casey Halloffamer', hof_member: 1, hof_induction_year: 2015,
    });
    insertMember(db, {
      id: CASEC_ID, slug: CASEC_SLUG, display_name: 'Casey C',
      login_email: 'casec@example.com',
    });
    completeOnboarding(db, CASEC_ID);
    // Historical-person link only, no legacy account claimed: the profile read
    // must still surface the historical name and honor year.
    db.prepare('UPDATE members SET historical_person_id = ?, is_hof = 1 WHERE id = ?').run(hp, CASEC_ID);
    db.close();

    const app = createApp();
    const res = await request(app)
      .get(`/members/${CASEC_SLUG}`)
      .set('Cookie', otherCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Also known as Casey Halloffamer in competition records');
    expect(res.text).toContain('Member of the Footbag Hall of Fame (2015)');
  });

  it('shows the IFPA Board line on a board member profile', async () => {
    const db = new BetterSqlite3(TEST_DB_PATH);
    const BOARD_ID = 'member-board';
    const BOARD_SLUG = 'member_board';
    insertMember(db, {
      id: BOARD_ID, slug: BOARD_SLUG, display_name: 'Board Member',
      login_email: 'boardmember@example.com',
    });
    completeOnboarding(db, BOARD_ID);
    db.prepare('UPDATE members SET is_board = 1 WHERE id = ?').run(BOARD_ID);
    db.close();

    const app = createApp();
    const res = await request(app)
      .get(`/members/${BOARD_SLUG}`)
      .set('Cookie', otherCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Member of the IFPA Board of Directors');
  });

  it('own profile links to the shipped Payment History page and no longer lists it as coming soon', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWN_SLUG}`)
      .set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain(`href="/members/${OWN_SLUG}/payments"`);
    expect(res.text).toContain('Payment History');
    // The coming-soon card no longer promises payment history as unbuilt.
    expect(res.text).not.toContain('Payments &amp; Donations');
  });
});

// ── GET /members/:memberKey/edit ────────────────────────────────────────────────

describe('GET /members/:memberKey/edit — edit form', () => {
  it('unauthenticated → 302 to /login with returnTo', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${OWN_SLUG}/edit`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/login?returnTo=%2Fmembers%2F${OWN_SLUG}%2Fedit`);
  });

  it('own profile → 200 with form fields', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('emailVisibility');
    expect(res.text).not.toContain('name="displayName"');
  });

  it('a member with no gender set sees the gender control default to undisclosed', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text, 'undisclosed is preselected').toMatch(/name="gender" value="undisclosed"[^>]*checked/);
    expect(res.text, 'male is not preselected').not.toMatch(/name="gender" value="male"[^>]*checked/);
  });

  it("another member's edit page → 404", async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', otherCookie());
    expect(res.status).toBe(404);
  });

  it('/edit is not swallowed as :section — route resolves to edit form, not stub', async () => {
    // If route ordering is wrong, /edit would hit getStub and return 404 (not in STUB_SEGMENTS).
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Edit Profile');
  });

  it('unlinked but onboarding-complete member: the claim-task link persists', async () => {
    // The wizard's claim task is the sole claim and anchor surface, reached
    // from the profile during onboarding and afterward alike, so an unlinked
    // member keeps the link after completing onboarding.
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/register/wizard/legacy_claim"');
    expect(res.text).toContain('Link your legacy account, results, and clubs');
  });

  it('fully-linked member: link-history CTA is hidden', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${LINKED_SLUG}/edit`)
      .set('Cookie', linkedCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('/register/wizard/legacy_claim');
    expect(res.text).not.toContain('Link your legacy account, results, and clubs');
    expect(res.text).not.toContain('Link your old footbag.org account');
    expect(res.text).not.toContain('Link your competition history');
  });

  it('shows the stored date of birth as a read-only identity field', async () => {
    const app = createApp();
    const db = new BetterSqlite3(TEST_DB_PATH);
    db.prepare('UPDATE members SET birth_date = ? WHERE id = ?').run('1990-03-15', OWN_ID);
    db.close();
    try {
      const res = await request(app)
        .get(`/members/${OWN_SLUG}/edit`)
        .set('Cookie', ownCookie());
      expect(res.status).toBe(200);
      expect(res.text).toContain('Date of birth');
      expect(res.text).toContain('15 March 1990');
    } finally {
      const restore = new BetterSqlite3(TEST_DB_PATH);
      restore.prepare('UPDATE members SET birth_date = NULL WHERE id = ?').run(OWN_ID);
      restore.close();
    }
  });

  it('Save is wired to the profile form — form not nested, submit associated', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    // A nested <form> closes the outer form at the first </form> and orphans the
    // Save button, so the profile silently submits nothing. Guard against it.
    let depth = 0;
    let maxDepth = 0;
    for (const m of res.text.matchAll(/<form\b|<\/form>/g)) {
      if (m[0] === '</form>') depth -= 1;
      else { depth += 1; if (depth > maxDepth) maxDepth = depth; }
    }
    expect(maxDepth).toBeLessThanOrEqual(1);
    // Save belongs to the profile form (rendered inside it or via the form= attribute).
    expect(res.text).toMatch(/<form\b[^>]*\bid="profileEditForm"/);
    expect(res.text).toMatch(/<button[^>]*\bform="profileEditForm"[^>]*>\s*Save/);
  });
});

// ── POST /members/:memberKey/edit ───────────────────────────────────────────────

describe('POST /members/:memberKey/edit — save profile', () => {
  it('unauthenticated → 302 to /login with returnTo', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit`)
      .type('form')
      .send({ bio: '', city: 'Portland', region: '', country: 'US', phone: '', emailVisibility: 'private' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/login?returnTo=%2Fmembers%2F${OWN_SLUG}%2Fedit`);
  });

  it("another member's profile edit → 404 (cross-member write guard)", async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', otherCookie())
      .type('form')
      .send({ bio: '', city: 'Portland', region: '', country: 'US', phone: '', emailVisibility: 'private' });
    expect(res.status).toBe(404);
  });

  it('bio exceeding 1000 characters → 422 with error message', async () => {
    const app = createApp();
    const longBio = 'B'.repeat(1001);
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', ownCookie())
      .type('form')
      .send({ bio: longBio, city: '', region: '', country: '', phone: '', emailVisibility: 'private' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('1000 characters');
  });

  it('invalid emailVisibility value is silently coerced to private — no 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', ownCookie())
      .type('form')
      .send({
        bio:             '',
        city:            'Portland',
        region:          '',
        country:         'US',
        phone:           '',
        emailVisibility: 'bad-value',
      });
    // Service coerces bad visibility to 'private' — no validation error.
    expect(res.status).toBe(303);
  });

  it('valid input → 303 redirect to own profile (slug unchanged)', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', ownCookie())
      .type('form')
      .send({
        bio:             'A short bio.',
        city:            'Portland',
        region:          'OR',
        country:         'US',
        phone:           '',
        emailVisibility: 'members',
      });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${OWN_SLUG}`);
  });

  // Gender is editable to one of the three stored values. A save that omits or
  // sends an unrecognized value must leave the existing value intact rather
  // than clearing it (the control is not re-confirmed on every unrelated save).
  function genderOf(id: string): string | null {
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const row = db.prepare('SELECT gender FROM members WHERE id = ?').get(id) as { gender: string | null } | undefined;
      return row ? row.gender : null;
    } finally {
      db.close();
    }
  }
  function setGender(id: string, gender: string | null): void {
    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      db.prepare('UPDATE members SET gender = ? WHERE id = ?').run(gender, id);
    } finally {
      db.close();
    }
  }

  it('saves a selected gender value', async () => {
    setGender(OWN_ID, null);
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', ownCookie())
      .type('form')
      .send({ bio: '', city: 'Portland', region: '', country: 'US', phone: '', emailVisibility: 'private', gender: 'female' });
    expect(res.status).toBe(303);
    expect(genderOf(OWN_ID)).toBe('female');
  });

  it('omitting gender leaves the stored value unchanged', async () => {
    setGender(OWN_ID, 'male');
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', ownCookie())
      .type('form')
      .send({ bio: '', city: 'Portland', region: '', country: 'US', phone: '', emailVisibility: 'private' });
    expect(res.status).toBe(303);
    expect(genderOf(OWN_ID)).toBe('male');
  });

  it('an unrecognized gender value leaves the stored value unchanged', async () => {
    setGender(OWN_ID, 'undisclosed');
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', ownCookie())
      .type('form')
      .send({ bio: '', city: 'Portland', region: '', country: 'US', phone: '', emailVisibility: 'private', gender: 'nonsense' });
    expect(res.status).toBe(303);
    expect(genderOf(OWN_ID)).toBe('undisclosed');
  });

  // Profile edit was unlimited per session, allowing DB
  // write amplification + audit-table inflation. Limit gates the controller
  // entry before any service work; tunable via system_config_current.
  it('member exceeding profile-edit rate-limit → 429 with Retry-After', async () => {
    const rlMod = await import('../../src/services/rateLimitService');
    rlMod.resetRateLimitForTests();
    const tuneDb = new BetterSqlite3(TEST_DB_PATH);
    tuneDb.prepare(`
      INSERT INTO system_config
        (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
      VALUES (?, ?, 'profile_edit_rate_limit_per_hour', '2', ?, 'Test tunable', NULL)
    `).run('test-profile-edit-rl', '2026-05-22T00:00:00.000Z', '2026-05-22T00:00:00.000Z');
    tuneDb.close();
    try {
      const app = createApp();
      const validBody = { bio: '', city: 'Portland', region: '', country: 'US', phone: '', emailVisibility: 'private' };
      for (let i = 0; i < 2; i++) {
        const ok = await request(app)
          .post(`/members/${OWN_SLUG}/edit`)
          .set('Cookie', ownCookie())
          .type('form')
          .send(validBody);
        expect(ok.status).toBe(303);
      }
      const blocked = await request(app)
        .post(`/members/${OWN_SLUG}/edit`)
        .set('Cookie', ownCookie())
        .type('form')
        .send(validBody);
      expect(blocked.status).toBe(429);
      expect(blocked.headers['retry-after']).toBeDefined();
    } finally {
      rlMod.resetRateLimitForTests();
    }
  });
});

// ── Gender public visibility (opt-in) ───────────────────────────────────────

describe('gender public visibility', () => {
  function setGenderCols(id: string, gender: string | null, showGender: 0 | 1): void {
    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      db.prepare('UPDATE members SET gender = ?, show_gender = ? WHERE id = ?').run(gender, showGender, id);
    } finally {
      db.close();
    }
  }

  it('shows an opted-in member gender to an authenticated viewer', async () => {
    setGenderCols(OTHER_ID, 'female', 1);
    const app = createApp();
    const res = await request(app).get(`/members/${OTHER_SLUG}`).set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Gender: Female');
  });

  it('hides gender when the member has not opted in', async () => {
    setGenderCols(OTHER_ID, 'female', 0);
    const app = createApp();
    const res = await request(app).get(`/members/${OTHER_SLUG}`).set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Gender:');
  });

  it('shows nothing when opted in but the value is undisclosed', async () => {
    setGenderCols(OTHER_ID, 'undisclosed', 1);
    const app = createApp();
    const res = await request(app).get(`/members/${OTHER_SLUG}`).set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Gender:');
  });

  it('hides an opted-in gender from an unauthenticated viewer but shows it to a signed-in one', async () => {
    // A HoF member profile is reachable anonymously; gender stays member-only.
    const hofId = 'member-gender-hof';
    const hofSlug = 'gender_hof_member';
    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      insertMember(db, {
        id: hofId, slug: hofSlug, display_name: 'Gender Hof',
        login_email: 'genderhof@example.com', is_hof: 1, gender: 'male', show_gender: 1,
      });
    } finally {
      db.close();
    }
    const app = createApp();
    const anon = await request(app).get(`/members/${hofSlug}`);
    expect(anon.status).toBe(200);
    expect(anon.text).not.toContain('Gender:');
    const authed = await request(app).get(`/members/${hofSlug}`).set('Cookie', ownCookie());
    expect(authed.text).toContain('Gender: Male');
  });

  it('persists the show_gender toggle from profile edit', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', ownCookie())
      .type('form')
      .send({ bio: '', city: 'Portland', region: '', country: 'US', phone: '', emailVisibility: 'private', gender: 'male', showGender: '1' });
    expect(res.status).toBe(303);
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    const row = db.prepare('SELECT gender, show_gender FROM members WHERE id = ?').get(OWN_ID) as { gender: string; show_gender: number };
    db.close();
    expect(row.gender).toBe('male');
    expect(row.show_gender).toBe(1);
  });

  it('shows an opted-in member gender in search results', async () => {
    setGenderCols(OTHER_ID, 'female', 1);
    const app = createApp();
    const res = await request(app).get(`/members/${OWN_SLUG}?q=Other`).set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Female');
  });
});

// ── GET /members/:memberKey/:section — stub pages ───────────────────────────────

describe('GET /members/:memberKey/:section — stub pages', () => {
  // `password` is no longer a stub section — it has a real form at
  // /members/:slug/edit/password.
  const VALID_SECTIONS = ['media', 'settings', 'download', 'delete'];

  it('unauthenticated → 302 to /login with returnTo', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${OWN_SLUG}/settings`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/login?returnTo=%2Fmembers%2F${OWN_SLUG}%2Fsettings`);
  });

  for (const section of VALID_SECTIONS) {
    it(`own profile /${section} → 200`, async () => {
      const app = createApp();
      const res = await request(app)
        .get(`/members/${OWN_SLUG}/${section}`)
        .set('Cookie', ownCookie());
      expect(res.status).toBe(200);
      expect(res.text).toContain('coming soon');
    });
  }

  it("another member's stub page → 404", async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWN_SLUG}/settings`)
      .set('Cookie', otherCookie());
    expect(res.status).toBe(404);
  });

  it('unknown section → 404', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWN_SLUG}/not-a-real-section`)
      .set('Cookie', ownCookie());
    expect(res.status).toBe(404);
  });
});
