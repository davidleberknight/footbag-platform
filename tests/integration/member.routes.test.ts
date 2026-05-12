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
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
  createTestSessionJwt,
} from '../fixtures/factories';

const TEST_DB_PATH      = path.join(process.cwd(), `test-member-profile-${Date.now()}.db`);

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
  const schema = fs.readFileSync(
    path.join(process.cwd(), 'database', 'schema.sql'),
    'utf8',
  );
  const db = new BetterSqlite3(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(schema);

  insertMember(db, { id: OWN_ID,   slug: OWN_SLUG,   display_name: 'Test Member',  login_email: 'testmember@example.com' });
  insertMember(db, { id: OTHER_ID, slug: OTHER_SLUG, display_name: 'Other Member', login_email: 'othermember@example.com' });

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
    expect(res.text).toContain('Why join?');
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

  it("another member's profile → 404", async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${OWN_SLUG}`)
      .set('Cookie', otherCookie());
    expect(res.status).toBe(404);
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
    expect(res.text).toContain(`href="/members/${OWN_SLUG}/link-history"`);
    expect(res.text).toContain('Link your history');
  });

  it('fully-linked member: link-history CTA is hidden', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${LINKED_SLUG}/edit`)
      .set('Cookie', linkedCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('/link-history');
    expect(res.text).not.toContain('Link your history');
    expect(res.text).not.toContain('Link your past account');
    expect(res.text).not.toContain('Link your competition record');
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
    expect(res.status).toBe(302);
  });

  it('valid input → 302 redirect to own profile (slug unchanged)', async () => {
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
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/members/${OWN_SLUG}`);
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
