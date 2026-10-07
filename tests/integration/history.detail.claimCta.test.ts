/**
 * Integration tests for /history/:personId, the public historical-record page.
 *
 * The page carries no claim control, for any viewer. Linking a record to an
 * account happens inside the onboarding wizard's claim task and nowhere else,
 * so a signed-out visitor, a registrant part-way through signing up whose
 * surname matches the record, and a member who has finished all see the same
 * page with no claim button and no link to the claim page. A member who still
 * needs a link asks an administrator.
 *
 * Also covered here: the bare /history path is unwired and answers 404 rather
 * than redirecting, and a claimed record redirects to the claimant's profile
 * only when that profile is publicly viewable.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
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
  completeOnboarding,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3093');

let createApp: Awaited<ReturnType<typeof importApp>>;

const HP_HONOR     = 'hp-honor-cta-001';
const HP_NON_HONOR = 'hp-nonhonor-cta-001';

const VIEWER_MATCH = 'mem-viewer-match';

// Records outside the canonical results-derived cohort that nonetheless carry
// an honor flag: a provisional record from club or membership material, and an
// unresolved-name placeholder.
const HP_PROVISIONAL_HOF = 'hp-provisional-hof';
const HP_STUB_BAP        = 'hp-stub-bap';
const MEMBER_VIEWER      = 'mem-scope-viewer';

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
  insertMember(db, { onboarding: 'none',
    id: VIEWER_MATCH,
    slug: 'viewer_match',
    real_name: 'Chris Smith',
    display_name: 'Chris Smith',
    login_email: 'match@example.com',
  });
  insertHistoricalPerson(db, {
    person_id: HP_PROVISIONAL_HOF, person_name: 'Provisional Honoree',
    hof_member: 1, source_scope: 'PROVISIONAL',
  });
  insertHistoricalPerson(db, {
    person_id: HP_STUB_BAP, person_name: 'Stub Honoree',
    bap_member: 1, source_scope: 'UNRESOLVED_STUB',
  });
  insertMember(db, {
    id: MEMBER_VIEWER, slug: 'scope_viewer', display_name: 'Scope Viewer',
    login_email: 'scope-viewer@example.com',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

// ── GET /history (bare) — must NOT redirect ─────────────────────────────────
//
// Redirects that are not auth gates, PRG, or canonical-identity transitions
// are banned. The bare `/history` path is none of those:
// it has no concrete identity to redirect to. The route is intentionally
// unwired; Express's default 404 is the correct response.

describe('GET /history (no id) — unwired, 404 by design', () => {
  it('returns 404 (not a redirect)', async () => {
    const res = await request(createApp()).get('/history');
    expect(res.status).toBe(404);
    expect([301, 302, 303]).not.toContain(res.status);
  });
});

describe('GET /history/:personId — no claim control', () => {
  it('a signed-out visitor sees the record and no claim control', async () => {
    const res = await request(createApp()).get(`/history/${HP_HONOR}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Pat Smith');
    expect(res.text).not.toContain('Claim This Identity');
    expect(res.text).not.toContain(`/history/${HP_HONOR}/claim`);
  });

  it('a registrant part-way through signing up whose surname matches sees no claim control', async () => {
    // This is the viewer every condition of the old browse-page offer was
    // written for. Claiming belongs to the wizard, so even this viewer is given
    // no button here and no link to the claim page.
    const res = await request(createApp())
      .get(`/history/${HP_HONOR}`)
      .set('Cookie', cookieFor(VIEWER_MATCH));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Pat Smith');
    expect(res.text).not.toContain('Claim This Identity');
    expect(res.text).not.toContain(`/history/${HP_HONOR}/claim`);
  });

  it('the same registrant sees no claim control on a record carrying no honor', async () => {
    const res = await request(createApp())
      .get(`/history/${HP_NON_HONOR}`)
      .set('Cookie', cookieFor(VIEWER_MATCH));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Claim This Identity');
    expect(res.text).not.toContain(`/history/${HP_NON_HONOR}/claim`);
  });

  it('a member who has finished signing up and whose surname matches sees no claim control', async () => {
    // After onboarding there is no self-serve linking at all: this member asks
    // an administrator through the identity-link category of the contact form.
    const db = new BetterSqlite3(dbPath);
    const id = 'mem-viewer-complete';
    insertMember(db, { onboarding: 'none',
      id,
      slug: 'viewer_complete',
      real_name: 'Chris Smith',
      display_name: 'Chris Smith',
      login_email: 'complete@example.com',
    });
    completeOnboarding(db, id);
    db.close();

    const res = await request(createApp())
      .get(`/history/${HP_HONOR}`)
      .set('Cookie', cookieFor(id));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Pat Smith');
    expect(res.text).not.toContain('Claim This Identity');
    expect(res.text).not.toContain(`/history/${HP_HONOR}/claim`);
  });
});

describe('GET /history/:personId — auth gate', () => {
  it('a record carrying no honor requires a signed-in viewer (302 to login when anonymous)', async () => {
    const res = await request(createApp()).get(`/history/${HP_NON_HONOR}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });
});

describe('GET /history/:personId — only a canonical record is a public page', () => {
  // The search and the sitemap read the canonical cohort only. An honor flag
  // on a record outside it must not make that record a public page the sitemap
  // never lists, while the member-visible club rosters and result tables that
  // link such records keep resolving for a signed-in member.
  it('sends a signed-out visitor to log in for an honored non-canonical record', async () => {
    for (const id of [HP_PROVISIONAL_HOF, HP_STUB_BAP]) {
      const res = await request(createApp()).get(`/history/${id}`);
      expect(res.status, id).toBe(302);
      expect(res.headers.location, id).toBe(`/login?returnTo=${encodeURIComponent(`/history/${id}`)}`);
    }
  });

  it('still renders that record for a signed-in member who follows a link to it', async () => {
    const res = await request(createApp())
      .get(`/history/${HP_PROVISIONAL_HOF}`)
      .set('Cookie', cookieFor(MEMBER_VIEWER));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Provisional Honoree');
  });
});

describe('GET /history/:personId — claimed-record dispatch', () => {
  // A claim must never take the public historical record offline: only a
  // publicly-viewable member profile (the HoF/BAP exception) may absorb the
  // page via redirect; an ordinary member's claim keeps the HP page rendering.
  it('an honor HP claimed by an ORDINARY member keeps rendering for the anonymous public (no redirect to a profile the public cannot see)', async () => {
    const db = new BetterSqlite3(dbPath);
    const hpId = insertHistoricalPerson(db, {
      person_id: 'hp-claimed-ordinary',
      person_name: 'Quinn Claimedby',
      hof_member: 1,
      country: 'US',
    });
    insertMember(db, { onboarding: 'none',
      id: 'mem-ordinary-claimant',
      slug: 'ordinary_claimant',
      display_name: 'Ordinary Claimant',
      login_email: 'ordinary-claimant@example.com',
    });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?')
      .run(hpId, 'mem-ordinary-claimant');
    db.close();

    const res = await request(createApp()).get(`/history/${hpId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Quinn Claimedby');
  });

  it('an honor HP claimed by a HoF MEMBER still redirects to that member profile (publicly viewable)', async () => {
    const db = new BetterSqlite3(dbPath);
    const hpId = insertHistoricalPerson(db, {
      person_id: 'hp-claimed-honor',
      person_name: 'Hofie Claimedby',
      hof_member: 1,
      country: 'US',
    });
    insertMember(db, { onboarding: 'none',
      id: 'mem-hof-claimant',
      slug: 'hof_claimant',
      display_name: 'Hofie Claimant',
      login_email: 'hof-claimant@example.com',
      is_hof: 1,
    });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?')
      .run(hpId, 'mem-hof-claimant');
    db.close();

    const res = await request(createApp()).get(`/history/${hpId}`);
    // Canonical-identity redirect (permanent).
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/members/hof_claimant');
  });
});
