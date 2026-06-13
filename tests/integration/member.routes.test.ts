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

describe('GET /members — landing page', () => {
  it('unauthenticated → 200 with welcome page', async () => {
    const app = createApp();
    const res = await request(app).get('/members');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sign Up');
    expect(res.text).toContain('/register');
  });

  it('renders tier prices in USD', async () => {
    const app = createApp();
    const res = await request(app).get('/members');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Free');
    expect(res.text).toContain('$10 USD');
    expect(res.text).toContain('$50 USD');
    expect(res.text).toContain('Assigned by IFPA');
  });

  it('renders tier-specific benefits from IFPA structure and purchase stories', async () => {
    const app = createApp();
    const res = await request(app).get('/members');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Vote in IFPA elections');
    expect(res.text).toContain('sanctioned events');
    expect(res.text).toContain('Active Player');
    expect(res.text).toContain('Event Organizer');
    expect(res.text).toContain('Club Leader');
  });

  it('does NOT make inaccurate tier-gating claims', async () => {
    const app = createApp();
    const res = await request(app).get('/members');
    expect(res.status).toBe(200);
    // Tier 0 members CAN compete in events and join clubs per
    // M_Register_For_Event.
    expect(res.text).not.toContain('tournament eligibility');
    // IFPA was incorporated in 1994, not 1983.
    expect(res.text).not.toContain('since 1983');
    // The vague "IFPA-member-only areas" filler from M_Purchase_Tier_1 has no
    // enumerable Tier-1-only area in the code or docs; concrete benefits
    // (media uploads, club/event creation, voting) cover the actual gating.
    expect(res.text).not.toContain('IFPA-member-only areas');
  });

  it('renders Membership Tiers section BELOW the join CTAs (unauthenticated)', async () => {
    const app = createApp();
    const res = await request(app).get('/members');
    expect(res.status).toBe(200);
    const ctaIdx = res.text.indexOf('Become a Member');
    const tiersIdx = res.text.indexOf('Membership Tiers');
    expect(ctaIdx).toBeGreaterThan(-1);
    expect(tiersIdx).toBeGreaterThan(-1);
    expect(ctaIdx).toBeLessThan(tiersIdx);
  });

  it('authenticated → 200 with welcome page (tier explainer, no join CTAs)', async () => {
    // Personal-home affordances (Welcome banner, Membership, Quick Actions,
    // Find Members, Coming Soon) live on the profile at /members/<slug>;
    // /members renders the same public welcome to everyone, with the join
    // CTAs hidden for authenticated visitors.
    const app = createApp();
    const res = await request(app)
      .get('/members')
      .set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Why join?');
    expect(res.text).toContain('Tier 0 Registered Member');
    expect(res.text).not.toContain('Welcome,');
    expect(res.text).not.toContain('Become a Member');
    expect(res.text).not.toContain('Quick Actions');
    expect(res.text).not.toContain('Find Members');
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

  it('unlinked member: renders link-history wizard CTA', async () => {
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
      .send({ bio: '', city: '', region: '', country: '', phone: '', emailVisibility: 'private' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/login?returnTo=%2Fmembers%2F${OWN_SLUG}%2Fedit`);
  });

  it("another member's profile edit → 404 (cross-member write guard)", async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', otherCookie())
      .type('form')
      .send({ bio: '', city: '', region: '', country: '', phone: '', emailVisibility: 'private' });
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
        city:            '',
        region:          '',
        country:         '',
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

  // Sex is editable to one of the three stored values. A save that omits or
  // sends an unrecognized value must leave the existing value intact rather
  // than clearing it (the control is not re-confirmed on every unrelated save).
  function sexOf(id: string): string | null {
    const db = new BetterSqlite3(TEST_DB_PATH, { readonly: true });
    try {
      const row = db.prepare('SELECT sex FROM members WHERE id = ?').get(id) as { sex: string | null } | undefined;
      return row ? row.sex : null;
    } finally {
      db.close();
    }
  }
  function setSex(id: string, sex: string | null): void {
    const db = new BetterSqlite3(TEST_DB_PATH);
    try {
      db.prepare('UPDATE members SET sex = ? WHERE id = ?').run(sex, id);
    } finally {
      db.close();
    }
  }

  it('saves a selected sex value', async () => {
    setSex(OWN_ID, null);
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', ownCookie())
      .type('form')
      .send({ bio: '', city: '', region: '', country: '', phone: '', emailVisibility: 'private', sex: 'female' });
    expect(res.status).toBe(303);
    expect(sexOf(OWN_ID)).toBe('female');
  });

  it('omitting sex leaves the stored value unchanged', async () => {
    setSex(OWN_ID, 'male');
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', ownCookie())
      .type('form')
      .send({ bio: '', city: '', region: '', country: '', phone: '', emailVisibility: 'private' });
    expect(res.status).toBe(303);
    expect(sexOf(OWN_ID)).toBe('male');
  });

  it('an unrecognized sex value leaves the stored value unchanged', async () => {
    setSex(OWN_ID, 'undisclosed');
    const app = createApp();
    const res = await request(app)
      .post(`/members/${OWN_SLUG}/edit`)
      .set('Cookie', ownCookie())
      .type('form')
      .send({ bio: '', city: '', region: '', country: '', phone: '', emailVisibility: 'private', sex: 'nonsense' });
    expect(res.status).toBe(303);
    expect(sexOf(OWN_ID)).toBe('undisclosed');
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
      const validBody = { bio: '', city: '', region: '', country: '', phone: '', emailVisibility: 'private' };
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
