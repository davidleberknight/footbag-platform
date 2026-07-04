/**
 * Route-by-persona authorization matrix.
 *
 * Crosses the deployed authorization-gated route inventory with the canonical
 * persona catalog and asserts the expected gate outcome for every cell: an
 * allow cell for each authorized persona and a deny cell for each unauthorized
 * one. The deny half is the point — a route that only proves its allow cells
 * has not been tested for authorization. The adjacent-owner personas (a member
 * who owns a resource of the same type but not this one) are what catch broken
 * object-level authorization: an owner-only route that silently serves any
 * authenticated member passes every positive test but fails its deny cell here.
 *
 * Cookies are minted through the same persona-switch primitive a real session
 * uses (GET /dev/switch?as=<slug>), so a cell measures the production auth
 * middleware, never a test-only bypass. Personas whose account cannot hold a
 * session (email-unverified, deceased, soft-deleted) cannot switch at all; that
 * is itself an authentication-state property the matrix asserts, and those
 * personas then behave as anonymous against every gated route.
 *
 * Scope: deployed routes crossed with seeded personas. Persona classes whose
 * routes are not built (event organizer, group owner, vote eligibility, the
 * banned claimed-legacy subject) are out of scope because there is no route to
 * assert against; they are tracked separately, not relaxed here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedPersona } from '../../src/testkit/personaFactory';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';
import type { PersonaSpec } from '../../src/testkit/personaFactory';

const { dbPath } = setTestEnv('3414');

// The /dev/switch persona-switch route mounts only under development/staging;
// pin development before importApp boots the frozen config singleton.
const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
process.env.FOOTBAG_ENV = 'development';

// The curator surfaces touch the media roots at render time; point both at a
// temp dir so no cell reaches a repo path.
const MEDIA_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-authz-matrix-'));
const PRIOR_MEDIA_DIR = process.env.FOOTBAG_MEDIA_DIR;
const PRIOR_CURATED_DIR = process.env.FOOTBAG_CURATED_MEDIA_DIR;
process.env.FOOTBAG_MEDIA_DIR = MEDIA_TMP;
process.env.FOOTBAG_CURATED_MEDIA_DIR = MEDIA_TMP;

let createApp: Awaited<ReturnType<typeof importApp>>;

// Per-persona session cookie for the personas that can hold a session.
const cookies = new Map<string, string>();
// Public club keys of the two club-leader personas, resolved from seeded rows.
let leaderClubKey = '';
let coleaderClubKey = '';

/**
 * A persona can hold a session only if its account is active, email-verified,
 * and not deceased — the same predicate the auth middleware and persona-switch
 * route apply. Registered-unverified, deceased, and soft-deleted personas
 * cannot authenticate and act as anonymous against every gated route.
 */
function canHoldSession(p: PersonaSpec): boolean {
  return p.emailVerified !== false && !p.isDeceased && !p.deletionState;
}

/** Tier-1 benefits without the Active-Player nuance: admin or any paid tier. */
function hasTier1Benefits(p: PersonaSpec): boolean {
  return Boolean(p.isAdmin) || p.tier !== 'tier0';
}

/**
 * Create-club bootstrap eligibility: Tier-1 benefits, OR a Tier 0 member who
 * has never held Active Player (creating a first club grants the one-time
 * period). The tier-candidate set below carries no Active-Player spec, so every
 * Tier 0 candidate is never-AP and thus eligible for the first-club bootstrap.
 */
function mayCreateClub(p: PersonaSpec): boolean {
  return hasTier1Benefits(p) || p.tier === 'tier0';
}

function isLoginRedirect(res: { status: number; headers: Record<string, unknown> }): boolean {
  const loc = res.headers['location'];
  return res.status === 302 && typeof loc === 'string' && loc.startsWith('/login');
}

function sessionCookieFrom(setCookie: string[] | undefined): string {
  const entry = (setCookie ?? []).find((c) => c.startsWith('footbag_session='));
  if (!entry) throw new Error('no footbag_session cookie issued');
  return entry.split(';')[0];
}

function memberId(slug: string): string {
  return `member_persona_${slug}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const persona of CANONICAL_PERSONAS) {
    seedPersona(db, persona);
  }

  // Resolve each club-leader persona's club to its public key (the hashtag tag
  // without the leading '#'); the content-edit route addresses clubs by key.
  const clubKeyForLeader = (slug: string): string => {
    const row = db
      .prepare(
        `SELECT t.tag_normalized AS tag
           FROM club_leaders cl
           JOIN clubs c ON c.id = cl.club_id
           JOIN tags  t ON t.id = c.hashtag_tag_id
          WHERE cl.member_id = ?
          LIMIT 1`,
      )
      .get(memberId(slug)) as { tag: string } | undefined;
    if (!row) throw new Error(`no club leadership row seeded for ${slug}`);
    return row.tag.slice(1);
  };
  leaderClubKey = clubKeyForLeader('club_leader');
  coleaderClubKey = clubKeyForLeader('club_coleader');
  db.close();

  // Both keys must match the public club-key shape or the route would 404 on
  // shape before ever reaching the authorization gate.
  expect(leaderClubKey, 'leader club key shape').toMatch(/^club_[a-z0-9_]+$/);
  expect(coleaderClubKey, 'co-leader club key shape').toMatch(/^club_[a-z0-9_]+$/);

  createApp = await importApp();

  for (const persona of CANONICAL_PERSONAS) {
    if (!canHoldSession(persona)) continue;
    const res = await request(createApp()).get(`/dev/switch?as=${persona.slug}`);
    expect(res.status, `switch ${persona.slug}`).toBe(302);
    cookies.set(persona.slug, sessionCookieFrom(res.headers['set-cookie'] as unknown as string[]));
  }
});

afterAll(() => {
  cleanupTestDb(dbPath);
  fs.rmSync(MEDIA_TMP, { recursive: true, force: true });
  if (PRIOR_FOOTBAG_ENV === undefined) delete process.env.FOOTBAG_ENV;
  else process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
  if (PRIOR_MEDIA_DIR === undefined) delete process.env.FOOTBAG_MEDIA_DIR;
  else process.env.FOOTBAG_MEDIA_DIR = PRIOR_MEDIA_DIR;
  if (PRIOR_CURATED_DIR === undefined) delete process.env.FOOTBAG_CURATED_MEDIA_DIR;
  else process.env.FOOTBAG_CURATED_MEDIA_DIR = PRIOR_CURATED_DIR;
});

describe('authentication-state axis', () => {
  it('email-unverified, deceased, and soft-deleted personas cannot obtain a session', async () => {
    const cannot = CANONICAL_PERSONAS.filter((p) => !canHoldSession(p));
    // The four account-state personas the catalog carries for this purpose.
    expect(cannot.map((p) => p.slug).sort()).toEqual(
      ['deceased', 'del_grace_elapsed', 'del_grace_open', 'unverified'],
    );
    for (const p of cannot) {
      const res = await request(createApp()).get(`/dev/switch?as=${p.slug}`);
      expect(res.status, `switch denied for ${p.slug}`).toBe(404);
    }
  });
});

describe('admin gate — GET (allow admin only, deny everyone else)', () => {
  const ADMIN_GET_ROUTES = [
    '/admin',
    '/admin/work-queue',
    '/admin/club-cleanup',
    '/admin/curator/media',
  ];

  it('serves admins, 403s authenticated non-admins, redirects the unauthenticated', async () => {
    for (const route of ADMIN_GET_ROUTES) {
      for (const p of CANONICAL_PERSONAS) {
        const cookie = cookies.get(p.slug);
        const req = request(createApp()).get(route);
        if (cookie) req.set('Cookie', cookie);
        const res = await req;
        const cell = `${p.slug} -> GET ${route}`;
        if (!cookie) {
          expect(isLoginRedirect(res), `${cell} (anonymous → login)`).toBe(true);
        } else if (p.isAdmin) {
          expect(res.status, `${cell} (admin allow)`).toBe(200);
        } else {
          expect(res.status, `${cell} (non-admin deny)`).toBe(403);
        }
      }
    }
  });
});

describe('owner gate — member self-edit (BOLA)', () => {
  // A stable session-holding victim whose edit page every other persona must
  // be denied (404 anti-enumeration), proving the gate is object-level.
  const VICTIM = 't1_paid';

  it('serves a member its own edit page', async () => {
    for (const p of CANONICAL_PERSONAS) {
      const cookie = cookies.get(p.slug);
      if (!cookie) continue;
      const res = await request(createApp()).get(`/members/${p.slug}/edit`).set('Cookie', cookie);
      expect(res.status, `${p.slug} -> own /edit (allow)`).toBe(200);
    }
  });

  it("404s a member on another member's edit page, and redirects the unauthenticated", async () => {
    for (const p of CANONICAL_PERSONAS) {
      const cookie = cookies.get(p.slug);
      const req = request(createApp()).get(`/members/${VICTIM}/edit`);
      if (cookie) req.set('Cookie', cookie);
      const res = await req;
      if (!cookie) {
        expect(isLoginRedirect(res), `${p.slug} -> victim /edit (anonymous → login)`).toBe(true);
      } else if (p.slug === VICTIM) {
        expect(res.status, `${p.slug} -> own /edit`).toBe(200);
      } else {
        expect(res.status, `${p.slug} -> victim /edit (cross-owner deny)`).toBe(404);
      }
    }
  });
});

describe('owner gate — club content edit (adjacent-owner BOLA)', () => {
  const body = { description: 'Authorization matrix probe' };

  it('lets a club leader edit its own club content', async () => {
    const res = await request(createApp())
      .post(`/clubs/${leaderClubKey}/content/edit`)
      .set('Cookie', cookies.get('club_leader')!)
      .send(body);
    expect(res.status, 'club_leader -> own club (allow)').toBe(303);
  });

  it('lets a club co-leader edit its own club content', async () => {
    const res = await request(createApp())
      .post(`/clubs/${coleaderClubKey}/content/edit`)
      .set('Cookie', cookies.get('club_coleader')!)
      .send(body);
    expect(res.status, 'club_coleader -> own club (allow)').toBe(303);
  });

  it('denies the adjacent-owner leader on a club it does not lead', async () => {
    const res = await request(createApp())
      .post(`/clubs/${leaderClubKey}/content/edit`)
      .set('Cookie', cookies.get('club_leader_b')!)
      .send(body);
    // The leader of a different club holds a leadership row, just not for this
    // club: the gate must key on the specific club, not on "any leadership".
    expect(res.status, 'club_leader_b -> adjacent club (BOLA deny)').toBe(422);
  });

  it('denies an authenticated non-leader and redirects the unauthenticated', async () => {
    const nonLeader = await request(createApp())
      .post(`/clubs/${leaderClubKey}/content/edit`)
      .set('Cookie', cookies.get('t1_paid')!)
      .send(body);
    expect(nonLeader.status, 't1_paid -> club content (non-leader deny)').toBe(422);

    const anon = await request(createApp())
      .post(`/clubs/${leaderClubKey}/content/edit`)
      .send(body);
    expect(isLoginRedirect(anon), 'anonymous -> club content (login)').toBe(true);
  });
});

describe('tier gate — POST /clubs/create (create-club bootstrap eligibility)', () => {
  // The onboarding gate redirects not-yet-onboarded members off /clubs paths
  // before the tier gate runs, and the Active-Player personas turn on time;
  // both are held out so each cell isolates the tier decision.
  const tierCandidates = CANONICAL_PERSONAS.filter(
    (p) =>
      canHoldSession(p) &&
      p.onboardingComplete === true &&
      !p.activePlayer,
  );

  it('lets eligible members past the gate and 403s ineligible members', async () => {
    for (const p of tierCandidates) {
      const res = await request(createApp())
        .post('/clubs/create')
        .set('Cookie', cookies.get(p.slug)!)
        .send({});
      const cell = `${p.slug} -> POST /clubs/create`;
      if (mayCreateClub(p)) {
        // Past the tier gate: the empty body fails business validation (422),
        // never the 403 the gate would emit.
        expect(res.status, `${cell} (eligible → past gate)`).not.toBe(403);
        expect(isLoginRedirect(res), `${cell} (not a login redirect)`).toBe(false);
      } else {
        expect(res.status, `${cell} (ineligible deny)`).toBe(403);
      }
    }
  });

  it('redirects the unauthenticated to login', async () => {
    const res = await request(createApp()).post('/clubs/create').send({});
    expect(isLoginRedirect(res), 'anonymous -> POST /clubs/create (login)').toBe(true);
  });
});
