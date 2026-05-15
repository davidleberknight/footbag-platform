/**
 * Integration tests for the conditional Claim CTA on /history/:personId.
 *
 * The CTA is rendered only when:
 *   - viewer is authenticated;
 *   - viewer has no historical_person_id linked yet;
 *   - viewer's real_name surname matches the HP's person_name surname; and
 *   - the HP is not already claimed by another member (already-claimed HPs
 *     redirect to that member's profile, so the detail page never renders).
 *
 * Anonymous visitors hitting a public-honor HP see the page without the CTA.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertMember,
  insertHistoricalPerson,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3093');

let createApp: Awaited<ReturnType<typeof importApp>>;

const HP_HONOR     = 'hp-honor-cta-001';
const HP_NON_HONOR = 'hp-nonhonor-cta-001';

const VIEWER_MATCH      = 'mem-viewer-match';
const VIEWER_MISMATCH   = 'mem-viewer-mismatch';
const VIEWER_ALREADY_HP = 'mem-viewer-with-hp';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertHistoricalPerson(db, {
    person_id: HP_HONOR,
    person_name: 'Pat Smith',
    hof_member: 1,
    country: 'US',
  });
  insertHistoricalPerson(db, {
    person_id: HP_NON_HONOR,
    person_name: 'Pat Smith',
    hof_member: 0,
    bap_member: 0,
    country: 'US',
  });

  insertMember(db, {
    id: VIEWER_MATCH,
    slug: 'viewer_match',
    real_name: 'Chris Smith',
    display_name: 'Chris Smith',
    login_email: 'match@example.com',
  });
  insertMember(db, {
    id: VIEWER_MISMATCH,
    slug: 'viewer_mismatch',
    real_name: 'Chris Jones',
    display_name: 'Chris Jones',
    login_email: 'mismatch@example.com',
  });
  insertMember(db, {
    id: VIEWER_ALREADY_HP,
    slug: 'viewer_with_hp',
    real_name: 'Chris Smith',
    display_name: 'Chris Smith',
    login_email: 'with-hp@example.com',
  });
  // Pre-link this viewer to a different HP so historical_person_id is set.
  const OTHER_HP = insertHistoricalPerson(db, { person_name: 'Other Person' });
  db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?')
    .run(OTHER_HP, VIEWER_ALREADY_HP);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

// ── GET /history (bare) — must NOT redirect ─────────────────────────────────
//
// DD §5.2 categorically bans redirects that are not auth gates, PRG, or
// canonical-identity transitions. The bare `/history` path is none of those:
// it has no concrete identity to redirect to. The route is intentionally
// unwired; Express's default 404 is the correct response.

describe('GET /history (no id) — unwired, 404 by design', () => {
  it('returns 404 (not a redirect)', async () => {
    const res = await request(createApp()).get('/history');
    expect(res.status).toBe(404);
    expect([301, 302, 303]).not.toContain(res.status);
  });
});

describe('GET /history/:personId — conditional Claim CTA', () => {
  it('anonymous viewer on a HoF HP: page renders without the CTA', async () => {
    const res = await request(createApp()).get(`/history/${HP_HONOR}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Pat Smith');
    expect(res.text).not.toContain('Claim this identity');
  });

  it('authenticated viewer with surname match + no HP link: CTA visible with correct href', async () => {
    const res = await request(createApp())
      .get(`/history/${HP_HONOR}`)
      .set('Cookie', cookieFor(VIEWER_MATCH));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Claim this identity');
    expect(res.text).toContain(`href="/history/${HP_HONOR}/claim"`);
  });

  it('authenticated viewer with surname mismatch: no CTA', async () => {
    const res = await request(createApp())
      .get(`/history/${HP_HONOR}`)
      .set('Cookie', cookieFor(VIEWER_MISMATCH));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Claim this identity');
  });

  it('authenticated viewer who already has historical_person_id set: no CTA', async () => {
    const res = await request(createApp())
      .get(`/history/${HP_HONOR}`)
      .set('Cookie', cookieFor(VIEWER_ALREADY_HP));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Claim this identity');
  });

  it('non-honor HP requires auth (302 to login when anonymous)', async () => {
    const res = await request(createApp()).get(`/history/${HP_NON_HONOR}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('authenticated viewer with surname match on a non-honor HP: CTA visible', async () => {
    const res = await request(createApp())
      .get(`/history/${HP_NON_HONOR}`)
      .set('Cookie', cookieFor(VIEWER_MATCH));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Claim this identity');
  });
});
