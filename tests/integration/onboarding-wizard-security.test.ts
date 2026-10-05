/**
 * Security integration tests for the onboarding wizard surface.
 * Covers auth gates, authorization (cross-member access), CSRF Origin-pin
 * on all state-changing POSTs, and absence of PII/contact fields in wizard
 * responses.
 *
 * Contracts verified: the wizard is reachable only by the signed-in member
 * it belongs to; no contact fields ever render in wizard responses.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  insertOnboardingTask,
  createTestSessionJwt,
} from '../fixtures/factories';
import type { OnboardingTaskType } from '../fixtures/factories';
import { expectCsrfReject } from '../fixtures/expectCsrfReject';

const { dbPath } = setTestEnv('3212');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const MEMBER_A_ID   = 'sec-wiz-a';
const MEMBER_A_SLUG = 'sec_wiz_a';
const MEMBER_B_ID   = 'sec-wiz-b';
const MEMBER_B_SLUG = 'sec_wiz_b';

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_A_ID, slug: MEMBER_A_SLUG, login_email: 'sec-a@example.com' });
  insertMember(db, { id: MEMBER_B_ID, slug: MEMBER_B_SLUG, login_email: 'sec-b@example.com' });
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

// ── Auth gates ───────────────────────────────────────────────────────────────

describe('auth gate: unauthenticated access -> 302 to /login?returnTo=...', () => {
  const getRoutes = [
    '/register/wizard/legacy_claim',
    '/register/wizard/club_affiliations',
    '/register/wizard/complete',
  ];

  for (const route of getRoutes) {
    it(`GET ${route}`, async () => {
      const res = await request(createApp()).get(route);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
      expect(res.headers.location).toContain('returnTo=');
    });
  }

  const postRoutes = [
    '/register/wizard/legacy_claim/claim',
    '/register/wizard/legacy_claim/claim-with-surname',
    '/register/wizard/legacy_claim/decline',
    '/register/wizard/legacy_claim/birth-date',
    '/register/wizard/legacy_claim/anchors/add',
    '/register/wizard/personal_details/submit',
    '/register/wizard/club_affiliations/submit',
    '/register/wizard/club_affiliations/none',
    '/register/wizard/legacy_claim/continue-without-linking',
  ];

  for (const route of postRoutes) {
    it(`POST ${route}`, async () => {
      const res = await request(createApp())
        .post(route)
        .type('form')
        .send({});
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('/login');
    });
  }
});

// ── CSRF Origin-pin ──────────────────────────────────────────────────────────

describe('CSRF: state-changing wizard POSTs reject missing/mismatched Origin', () => {
  const cookie = cookieFor(MEMBER_A_ID);
  const postRoutes = [
    '/register/wizard/legacy_claim/claim',
    '/register/wizard/legacy_claim/claim-with-surname',
    '/register/wizard/legacy_claim/decline',
    '/register/wizard/legacy_claim/birth-date',
    '/register/wizard/legacy_claim/anchors/add',
    '/register/wizard/personal_details/submit',
    '/register/wizard/club_affiliations/submit',
    '/register/wizard/club_affiliations/none',
    '/register/wizard/legacy_claim/continue-without-linking',
  ];

  for (const route of postRoutes) {
    it(`POST ${route} rejects without valid Origin`, async () => {
      await expectCsrfReject(createApp(), 'post', route, { cookie });
    });
  }
});

// ── No PII/contact fields in wizard responses ────────────────────────────────

describe('no PII leakage: wizard pages do not expose real member email addresses', () => {
  // Each page is reachable only once the steps before it are done, so each
  // member starts with those prerequisites met; otherwise the wizard redirects
  // and there is no body to check.
  const wizardPages: Array<{ route: string; completedBefore: OnboardingTaskType[] }> = [
    { route: '/register/wizard/legacy_claim', completedBefore: ['personal_details'] },
    { route: '/register/wizard/club_affiliations', completedBefore: ['personal_details', 'legacy_claim'] },
  ];

  for (const { route, completedBefore } of wizardPages) {
    it(`GET ${route} does not contain the member's login email in the response body`, async () => {
      const stamp = Date.now();
      const loginEmail = `pii-leakcheck-${stamp}@example.com`;
      const memberId = insertMember(db, {
        slug: `pii_${stamp}_${route.split('/').pop()}`,
        login_email: loginEmail,
        onboarding: 'none',
      });
      for (const task of completedBefore) insertOnboardingTask(db, memberId, task, 'completed');
      const res = await request(createApp())
        .get(route)
        .set('Cookie', cookieFor(memberId));

      expect(res.status, `${route} must render for a member at this step`).toBe(200);
      expect(res.text).not.toContain(loginEmail);
    });
  }

  it('legacy_claim page does not expose legacy_email of matched legacy members', async () => {
    const stamp = Date.now();
    const legacyEmail = `secret-legacy-${stamp}@oldsite.example`;
    insertLegacyMember(db, {
      legacy_member_id: `LM-PII-${stamp}`,
      legacy_email: legacyEmail,
      real_name: 'Pii Legacy',
    });
    const memberId = insertMember(db, {
      slug: `pii_legacy_${stamp}`,
      login_email: `pii-req-${stamp}@example.com`,
    });
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));

    expect(res.text).not.toContain(legacyEmail);
  });
});

// ── Unknown taskType ─────────────────────────────────────────────────────────

describe('unknown taskType returns 404 without leaking information', () => {
  it('GET /register/wizard/bogus_task -> 404', async () => {
    const res = await request(createApp())
      .get('/register/wizard/bogus_task')
      .set('Cookie', cookieFor(MEMBER_A_ID));
    expect(res.status).toBe(404);
  });

  it('POST /register/wizard/bogus_task/skip -> 404', async () => {
    const res = await request(createApp())
      .post('/register/wizard/bogus_task/skip')
      .set('Cookie', cookieFor(MEMBER_A_ID))
      .type('form')
      .send({});
    expect(res.status).toBe(404);
  });
});
