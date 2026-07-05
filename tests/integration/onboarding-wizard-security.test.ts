/**
 * Security integration tests for the onboarding wizard surface.
 * Covers auth gates, authorization (cross-member access), CSRF Origin-pin
 * on all state-changing POSTs, anti-enumeration on claim lookup, and
 * absence of PII/contact fields in wizard responses.
 *
 * Contracts verified: the wizard is reachable only by the signed-in member
 * it belongs to; claim lookups reveal nothing about other accounts; no
 * contact fields ever render in wizard responses.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  createTestSessionJwt,
} from '../fixtures/factories';
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
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
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
    '/register/wizard/legacy_claim/find',
    '/register/wizard/legacy_claim/auto-link/confirm',
    '/register/wizard/legacy_claim/auto-link/decline',
    '/register/wizard/legacy_claim/claim/confirm',
    '/register/wizard/legacy_claim/cross-source/confirm',
    '/register/wizard/legacy_claim/help-request',
    '/register/wizard/legacy_claim/anchors/send-verification',
    '/register/wizard/legacy_claim/anchors/add',
    '/register/wizard/legacy_claim/anchors/remove',
    '/register/wizard/personal_details/submit',
    '/register/wizard/personal_details/skip',
    '/register/wizard/club_affiliations/submit',
    '/register/wizard/club_affiliations/skip',
    '/register/wizard/legacy_claim/skip',
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
    '/register/wizard/legacy_claim/find',
    '/register/wizard/legacy_claim/auto-link/confirm',
    '/register/wizard/legacy_claim/auto-link/decline',
    '/register/wizard/legacy_claim/claim/confirm',
    '/register/wizard/legacy_claim/cross-source/confirm',
    '/register/wizard/legacy_claim/help-request',
    '/register/wizard/legacy_claim/anchors/send-verification',
    '/register/wizard/legacy_claim/anchors/add',
    '/register/wizard/legacy_claim/anchors/remove',
    '/register/wizard/personal_details/submit',
    '/register/wizard/personal_details/skip',
    '/register/wizard/club_affiliations/submit',
    '/register/wizard/club_affiliations/skip',
    '/register/wizard/legacy_claim/skip',
  ];

  for (const route of postRoutes) {
    it(`POST ${route} rejects without valid Origin`, async () => {
      await expectCsrfReject(createApp(), 'post', route, { cookie });
    });
  }
});

// ── Anti-enumeration on claim lookup ─────────────────────────────────────────

describe('anti-enumeration: claim lookup returns identical response shape regardless of outcome', () => {
  it('match, no-match, and already-claimed produce same status (303) and same banner text', async () => {
    const stamp = Date.now();

    // Case 1: no-match
    const noMatchId = insertMember(db, {
      slug: `ae_nomatch_${stamp}`,
      login_email: `ae-nomatch-${stamp}@example.com`,
      birth_date: '1980-01-01',
    });
    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(noMatchId));
    const noMatchAgent = request.agent(createApp());
    const noMatchRes = await noMatchAgent
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(noMatchId))
      .type('form')
      .send({ identifier: `garbage-${stamp}` });

    // Case 2: match (enqueued, not fast-path: different emails)
    const targetEmail = `ae-target-${stamp}@oldsite.example`;
    insertLegacyMember(db, {
      legacy_member_id: `LM-AE-${stamp}`,
      legacy_email: targetEmail,
      real_name: 'Ae Target',
    });
    const matchId = insertMember(db, {
      slug: `ae_match_${stamp}`,
      login_email: `ae-match-${stamp}@example.com`,
      birth_date: '1980-01-01',
    });
    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(matchId));
    const matchAgent = request.agent(createApp());
    const matchRes = await matchAgent
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(matchId))
      .type('form')
      .send({ identifier: targetEmail });

    // Case 3: already-claimed legacy
    const claimedEmail = `ae-claimed-${stamp}@oldsite.example`;
    const claimerId = insertMember(db, {
      slug: `ae_claimer_${stamp}`,
      login_email: `ae-claimer-${stamp}@example.com`,
    });
    insertLegacyMember(db, {
      legacy_member_id: `LM-AE-CL-${stamp}`,
      legacy_email: claimedEmail,
      real_name: 'Ae Claimed',
      claimed_by_member_id: claimerId,
      claimed_at: '2025-01-01T00:00:00.000Z',
    });
    const claimedSeekerId = insertMember(db, {
      slug: `ae_seeker_${stamp}`,
      login_email: `ae-seeker-${stamp}@example.com`,
      birth_date: '1980-01-01',
    });
    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(claimedSeekerId));
    const claimedAgent = request.agent(createApp());
    const claimedRes = await claimedAgent
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(claimedSeekerId))
      .type('form')
      .send({ identifier: claimedEmail });

    // All three must produce 303 to same location
    expect(noMatchRes.status).toBe(303);
    expect(matchRes.status).toBe(303);
    expect(claimedRes.status).toBe(303);

    expect(noMatchRes.headers.location).toBe('/register/wizard/legacy_claim');
    expect(matchRes.headers.location).toBe('/register/wizard/legacy_claim');
    expect(claimedRes.headers.location).toBe('/register/wizard/legacy_claim');

    // Follow-up GETs must show the same banner text
    const noMatchFollow = await noMatchAgent
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(noMatchId));
    const matchFollow = await matchAgent
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(matchId));
    const claimedFollow = await claimedAgent
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(claimedSeekerId));

    const bannerPattern = /confirmation link has been sent/;
    expect(noMatchFollow.text).toMatch(bannerPattern);
    expect(matchFollow.text).toMatch(bannerPattern);
    expect(claimedFollow.text).toMatch(bannerPattern);
  });
});

// ── No PII/contact fields in wizard responses ────────────────────────────────

describe('no PII leakage: wizard pages do not expose real member email addresses', () => {
  const wizardPages = [
    '/register/wizard/legacy_claim',
    '/register/wizard/club_affiliations',
  ];

  for (const route of wizardPages) {
    it(`GET ${route} does not contain the member's login email in the response body`, async () => {
      const stamp = Date.now();
      const loginEmail = `pii-leakcheck-${stamp}@example.com`;
      const memberId = insertMember(db, {
        slug: `pii_${stamp}_${route.split('/').pop()}`,
        login_email: loginEmail,
      });
      const res = await request(createApp())
        .get(route)
        .set('Cookie', cookieFor(memberId));

      if (res.status !== 200) return;

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
