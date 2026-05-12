/**
 * Dev autologin middleware bypass — integration verification.
 *
 * The branch in src/middleware/auth.ts authMiddleware() activates only
 * when FOOTBAG_ENV === 'development' AND FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID
 * is set. This file pins three runtime cases:
 *
 *   1. Both gates set + valid member id: protected route serves 200
 *      (autologin populated req.user; downstream owner check passes).
 *   2. Both gates set + unknown member id: protected route redirects
 *      to /login (autologin no-op; cookie path also skipped per the
 *      middleware's "explicit opt-in is authoritative" rule).
 *   3. Var unset: protected route redirects to /login (no autologin,
 *      no cookie — equivalent to the pre-Phase-7 baseline).
 *
 * The boot-time guard in src/config/env.ts is covered separately by
 * tests/unit/env-config.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertMember, insertMemberTierGrant } from '../fixtures/factories';

const { dbPath } = setTestEnv('3085');
// Required for the middleware's dev branch; env.ts reads this at module
// load and populates config.footbagEnv. Set before importApp(). Captured
// here so afterAll can restore the prior value (don't leak 'development'
// into a downstream worker that expects FOOTBAG_ENV unset).
const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
process.env.FOOTBAG_ENV = 'development';

let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID = 'member-da-valid';
const MEMBER_SLUG = 'da_valid';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG });
  // Tier 1 so the requireTier1Benefits gate on POST routes passes; not
  // strictly required for GET /members/:slug/galleries but keeps the
  // member realistic for any future test extension.
  insertMemberTierGrant(db, { member_id: MEMBER_ID, new_tier_status: 'tier1' });
  db.close();
  createApp = await importApp();
});

afterAll(() => {
  delete process.env.FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID;
  delete process.env.FOOTBAG_DEV_AUTOLOGIN_PASSWORD_VERSION;
  if (PRIOR_FOOTBAG_ENV === undefined) {
    delete process.env.FOOTBAG_ENV;
  } else {
    process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
  }
  cleanupTestDb(dbPath);
});

afterEach(() => {
  delete process.env.FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID;
  delete process.env.FOOTBAG_DEV_AUTOLOGIN_PASSWORD_VERSION;
});

describe('dev autologin middleware bypass', () => {
  it('FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID set to a valid id: protected route serves 200', async () => {
    process.env.FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID = MEMBER_ID;
    const res = await request(createApp()).get(`/members/${MEMBER_SLUG}/galleries`);
    expect(res.status).toBe(200);
  });

  it('FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID set to an unknown id: protected route redirects to /login', async () => {
    process.env.FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID = 'member-does-not-exist';
    const res = await request(createApp()).get(`/members/${MEMBER_SLUG}/galleries`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });

  it('FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID unset: protected route redirects to /login (no cookie)', async () => {
    // Sanity check that turning off the autologin returns the cookie-only
    // baseline. Without a session cookie the request is unauthenticated.
    const res = await request(createApp()).get(`/members/${MEMBER_SLUG}/galleries`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });

  it('autologin populates req.user.role from is_admin (admin route 403 for non-admin autologin\'d member)', async () => {
    // Concrete signal that req.user was actually populated, not just
    // bypassed: an admin-only route returns 403 (authenticated but not
    // admin) rather than 302 (unauthenticated).
    process.env.FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID = MEMBER_ID;
    const res = await request(createApp()).get('/admin');
    expect(res.status).toBe(403);
  });

  it('FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID set to a slug: dev fallback resolves and serves 200', async () => {
    // The env var canonically holds a raw id, but the dev branch falls back
    // to a slug lookup so a maintainer can paste a human-readable identifier
    // copied from a profile URL during local testing.
    process.env.FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID = MEMBER_SLUG;
    const res = await request(createApp()).get(`/members/${MEMBER_SLUG}/galleries`);
    expect(res.status).toBe(200);
  });

  it('FOOTBAG_DEV_AUTOLOGIN_PASSWORD_VERSION mismatch: autologin refuses, falls through to cookie-less unauthenticated', async () => {
    // Mirror prod's password-version invalidation in dev. When the env var
    // is set and does not match the row's password_version, the dev branch
    // refuses the autologin so test scenarios that rotate passwords behave
    // the same way they would behind a live cookie.
    process.env.FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID = MEMBER_ID;
    process.env.FOOTBAG_DEV_AUTOLOGIN_PASSWORD_VERSION = '99';
    const res = await request(createApp()).get(`/members/${MEMBER_SLUG}/galleries`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/login/);
  });

  it('FOOTBAG_DEV_AUTOLOGIN_PASSWORD_VERSION matches row: autologin accepts and serves 200', async () => {
    // Row's password_version is the factory default (typically 1). Set the
    // env var to the matching value and confirm autologin still works.
    process.env.FOOTBAG_DEV_AUTOLOGIN_MEMBER_ID = MEMBER_ID;
    process.env.FOOTBAG_DEV_AUTOLOGIN_PASSWORD_VERSION = '1';
    const res = await request(createApp()).get(`/members/${MEMBER_SLUG}/galleries`);
    expect(res.status).toBe(200);
  });
});
