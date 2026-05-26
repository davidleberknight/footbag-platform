/**
 * Per-route assertion of the Origin-pin CSRF perimeter.
 *
 * The perimeter is mounted as a single app-level middleware before all
 * route registrations. A cross-cutting matrix exercises the middleware
 * itself (Origin-present, mismatched, Referer-fallback, verb coverage) in
 * `csrf.origin-pin.test.ts`. This file complements that matrix with one
 * assertion per deployed state-changing route, so a regression that mounts
 * a sub-router outside the global middleware would fail HERE on the
 * route's own test, not silently slip past the cross-cutting suite.
 *
 * An authenticated session JWT is attached for routes that sit behind
 * `requireAuth`, so that a perimeter bypass cannot be masked by the auth
 * gate's 302-to-login redirect: a non-403 response under these conditions
 * is unambiguous evidence that the perimeter did not fire.
 *
 * Tier-gated routes (`requireTier1Benefits`) and slug-owner checks are
 * intentionally NOT satisfied here: the perimeter runs before those gates,
 * so the 403 must arrive regardless of tier or ownership state.
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';
import { expectCsrfReject } from '../fixtures/expectCsrfReject';

const { dbPath } = setTestEnv('3193');

const MEMBER_ID   = 'csrf-per-route-001';
const MEMBER_SLUG = 'csrf_per_route';
const MEMBER_EMAIL = 'csrf-per-route@example.com';

let createApp: Awaited<ReturnType<typeof importApp>>;
let authCookie: string;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: MEMBER_ID,
    slug: MEMBER_SLUG,
    login_email: MEMBER_EMAIL,
    display_name: 'Csrf Per Route',
  });
  db.close();
  createApp = await importApp();
  authCookie = `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
});

afterAll(() => cleanupTestDb(dbPath));

type Method = 'post' | 'put' | 'patch' | 'delete';
interface Row {
  name: string;
  method: Method;
  path: string;
  body?: Record<string, unknown>;
  requiresAuth?: boolean;
}

// Inventory: deployed state-changing public routes whose perimeter membership
// is load-bearing. Owner-only routes use `MEMBER_SLUG`; the perimeter rejects
// before slug ownership is consulted, so the rejection holds even when the
// authenticated cookie matches the slug.
const ROUTES: readonly Row[] = [
  // Unauthenticated auth surface.
  { name: 'login',           method: 'post', path: '/login',                    body: { email: 'a@b.com', password: 'x' } },
  { name: 'register',        method: 'post', path: '/register',                 body: { realName: 'X', email: 'a@b.com', password: 'pass1234', confirmPassword: 'pass1234' } },
  { name: 'verify-resend',   method: 'post', path: '/verify/resend',            body: { email: 'a@b.com' } },
  { name: 'password-forgot', method: 'post', path: '/password/forgot',          body: { email: 'a@b.com' } },
  { name: 'password-reset',  method: 'post', path: '/password/reset/sometoken', body: { newPassword: 'pass1234', confirmPassword: 'pass1234' } },
  { name: 'logout',          method: 'post', path: '/logout',                   body: {} },

  // Member-owner surface (requireAuth).
  { name: 'profile-edit',    method: 'post', path: `/members/${MEMBER_SLUG}/edit`,          body: { displayName: 'X' }, requiresAuth: true },
  { name: 'password-change', method: 'post', path: `/members/${MEMBER_SLUG}/edit/password`, body: { oldPassword: 'x', newPassword: 'y', confirmPassword: 'y' }, requiresAuth: true },
  { name: 'avatar-upload',   method: 'post', path: `/members/${MEMBER_SLUG}/avatar`,        body: {}, requiresAuth: true },
  { name: 'contact-admin',   method: 'post', path: `/members/${MEMBER_SLUG}/contact-admin`, body: { subject: 'x', message: 'x' }, requiresAuth: true },

  // Tier-gated gallery surface (requireAuth + requireTier1Benefits).
  { name: 'gallery-create',  method: 'post', path: `/members/${MEMBER_SLUG}/galleries`,                body: { title: 'x' }, requiresAuth: true },
  { name: 'gallery-edit',    method: 'post', path: `/members/${MEMBER_SLUG}/galleries/g1/edit`,        body: { title: 'x' }, requiresAuth: true },
  { name: 'gallery-delete',  method: 'post', path: `/members/${MEMBER_SLUG}/galleries/g1/delete`,      body: {}, requiresAuth: true },

  // Tier-gated media surface (requireAuth + requireTier1Benefits).
  { name: 'media-upload',    method: 'post', path: `/members/${MEMBER_SLUG}/media/upload`,             body: {}, requiresAuth: true },
  { name: 'media-edit',      method: 'post', path: `/members/${MEMBER_SLUG}/media/m1/edit`,            body: { title: 'x' }, requiresAuth: true },

  // Auto-link surface (requireAuth, /me).
  { name: 'auto-link-confirm', method: 'post', path: '/members/me/auto-link/confirm',          body: {}, requiresAuth: true },
  { name: 'auto-link-dismiss', method: 'post', path: '/members/me/auto-link/dismiss',          body: {}, requiresAuth: true },
  { name: 'auto-link-report',  method: 'post', path: '/members/me/auto-link/report-incorrect', body: {}, requiresAuth: true },

  // Onboarding wizard submits (requireAuth).
  { name: 'wizard-claim-find',     method: 'post', path: '/register/wizard/legacy_claim/find',                 body: { identifier: 'LM-1' }, requiresAuth: true },
  { name: 'wizard-claim-autolink', method: 'post', path: '/register/wizard/legacy_claim/auto-link/confirm',    body: { token: 'x' }, requiresAuth: true },
  { name: 'wizard-claim-confirm',  method: 'post', path: '/register/wizard/legacy_claim/claim/confirm',        body: { token: 'x' }, requiresAuth: true },
  { name: 'wizard-club-affil',     method: 'post', path: '/register/wizard/club_affiliations/submit',         body: {}, requiresAuth: true },
  { name: 'wizard-skip',           method: 'post', path: '/register/wizard/legacy_claim/skip',                body: {}, requiresAuth: true },
];

describe('CSRF perimeter is enforced per state-changing route', () => {
  for (const row of ROUTES) {
    it(`${row.method.toUpperCase()} ${row.path} (${row.name}) rejects mismatched and missing Origin`, async () => {
      const app = createApp();
      await expectCsrfReject(app, row.method, row.path, {
        body: row.body,
        cookie: row.requiresAuth ? authCookie : undefined,
      });
    });
  }
});
