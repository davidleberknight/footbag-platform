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
import Database from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { loadRouteTable } from '../fixtures/routeTable';
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
 * Create-club eligibility: Tier-1 benefits only (Tier 1+, admin, or a Tier 0
 * member with a current Active Player period). A Tier 0 member without current
 * Active Player status cannot create a club. The tier-candidate set below
 * carries no Active-Player spec, so every Tier 0 candidate is without Active
 * Player and thus cannot create.
 */
function mayCreateClub(p: PersonaSpec): boolean {
  return hasTier1Benefits(p);
}

function isLoginRedirect(res: { status: number; headers: Record<string, unknown> }): boolean {
  const loc = res.headers['location'];
  return res.status === 302 && typeof loc === 'string' && loc.startsWith('/login');
}

function sessionCookieFrom(setCookie: string[] | undefined): string {
  const entry = (setCookie ?? []).find((c) => c.startsWith('__Host-footbag_session='));
  if (!entry) throw new Error('no session cookie issued');
  return entry.split(';')[0];
}

function memberId(slug: string): string {
  return `member_persona_${slug}`;
}

// Membership is an authorization level above authentication: a persona whose
// spec leaves any onboarding task short of completed is a pending registrant,
// and the requireMember guard routes it to the wizard before any member
// capability, admin gate, or ownership check runs. Personas with no explicit
// onboardingTasks are seeded onboarding-complete by the factory.
const ALL_TASKS = ['personal_details', 'legacy_claim', 'club_affiliations'] as const;
function isPendingPersona(p: (typeof CANONICAL_PERSONAS)[number]): boolean {
  if (p.onboardingTasks === undefined) return false;
  return !ALL_TASKS.every((t) => p.onboardingTasks?.[t] === 'completed');
}
function isWizardRedirect(res: { status: number; headers: Record<string, string> }): boolean {
  return res.status === 303 && (res.headers.location ?? '').includes('/register/wizard/');
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

  // The curator upload/list pages resolve the curated root at render time; point
  // it at the temp dir through the service's explicit test seam so the admin
  // allow cells render instead of tripping the write-into-repo guard.
  const curatorSvc = await import('../../src/services/curatorMediaService');
  curatorSvc.setCuratedRootDirForTests(MEDIA_TMP);

  createApp = await importApp();

  for (const persona of CANONICAL_PERSONAS) {
    if (!canHoldSession(persona)) continue;
    const res = await request(createApp()).get(`/dev/switch?as=${persona.slug}`);
    expect(res.status, `switch ${persona.slug}`).toBe(302);
    cookies.set(persona.slug, sessionCookieFrom(res.headers['set-cookie'] as unknown as string[]));
  }
});

afterAll(async () => {
  const curatorSvc = await import('../../src/services/curatorMediaService');
  curatorSvc.resetCuratedRootDirForTests();
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
    '/admin/admin-roles',
    '/admin/work-queue',
    '/admin/audit-log',
    '/admin/audit-log/export',
    '/admin/email-log',
    '/admin/payments',
    '/admin/payments/reconciliation',
    '/admin/clubs/leadership',
    '/admin/club-cleanup',
    '/admin/curator/media',
    '/admin/curator/galleries',
    '/admin/curator/upload',
    '/admin/freestyle/tricks',
    '/admin/freestyle/records',
    '/admin/freestyle/consecutive-records',
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
        } else if (isPendingPersona(p)) {
          expect(isWizardRedirect(res), `${cell} (pending → wizard)`).toBe(true);
        } else if (p.isAdmin) {
          expect(res.status, `${cell} (admin allow)`).toBe(200);
        } else {
          expect(res.status, `${cell} (non-admin deny)`).toBe(403);
        }
      }
    }
  }, 120_000);
});

describe('admin gate — parameterized GET (the payment-detail route sits behind the gate)', () => {
  // The payment-detail route is addressed by a path parameter, so it cannot
  // join the allow-200 sweep above: a placeholder id never resolves and an
  // admin gets 404, not 200. The gate still runs before the handler, so the
  // deny cells prove the route is protected, and the admin's 404 (rather than a
  // leak) proves the gate passed before the id was ever looked up.
  const route = '/admin/payments/ph';

  it('redirects the unauthenticated, 403s a non-admin, and 404s an admin on a placeholder id', async () => {
    const anon = await request(createApp()).get(route);
    expect(isLoginRedirect(anon), 'anonymous → login').toBe(true);

    const nonAdmin = await request(createApp()).get(route).set('Cookie', cookies.get('t1_paid')!);
    expect(nonAdmin.status, 't1_paid → non-admin deny').toBe(403);

    const admin = await request(createApp()).get(route).set('Cookie', cookies.get('admin_t2')!);
    expect(admin.status, 'admin → gate passes, placeholder id 404s').toBe(404);
  });
});

describe('admin gate — POST (every state-changing admin route sits behind the gate)', () => {
  // The admin router applies requireAuth then requireAdmin to every route below
  // the bootstrap-claim exception, so the deny outcome fires before any handler
  // and is independent of the placeholder ids. The GET cells above already sweep
  // the full persona set through this same gate; here one authenticated
  // non-admin plus the anonymous case proves each state-changing POST route is
  // mounted behind the gate, not accidentally above it the way bootstrap-claim
  // deliberately is.
  const ADMIN_POST_ROUTES = [
    '/admin/admin-roles/grant',
    '/admin/admin-roles/grant/confirm',
    '/admin/admin-roles/ph/revoke',
    '/admin/admin-roles/ph/revoke/confirm',
    '/admin/work-queue/ph/resolve',
    '/admin/work-queue/ph/dismiss',
    '/admin/work-queue/ph/link-help/approve',
    '/admin/work-queue/ph/link-help/reject',
    '/admin/work-queue/ph/link-help/dispute-revert',
    '/admin/payments/reconciliation/ph/resolve',
    '/admin/clubs/ph/leadership/assign',
    '/admin/clubs/ph/leadership/demote',
    '/admin/club-cleanup/claim',
    '/admin/club-cleanup/bulk-resolve',
    '/admin/club-cleanup/ph/resolve',
    '/admin/club-cleanup/ph/contact-members',
    '/admin/club-cleanup/ph/delist-residue',
    '/admin/club-cleanup/candidates/ph/promote',
    '/admin/club-cleanup/candidates/ph/resolve',
    '/admin/freestyle/records',
    '/admin/freestyle/records/ph/edit',
    '/admin/freestyle/consecutive-records',
    '/admin/freestyle/consecutive-records/ph/edit',
    '/admin/freestyle/consecutive-records/ph/delete',
    '/admin/freestyle/tricks/ph/edit',
    '/admin/curator/media/ph/edit',
    '/admin/curator/media/ph/delete',
    '/admin/curator/galleries',
    '/admin/curator/galleries/ph/edit',
    '/admin/curator/galleries/ph/delete',
  ];

  it('403s an authenticated non-admin and redirects the unauthenticated', async () => {
    for (const route of ADMIN_POST_ROUTES) {
      const nonAdmin = await request(createApp())
        .post(route)
        .set('Cookie', cookies.get('t1_paid')!)
        .send({});
      expect(nonAdmin.status, `t1_paid -> POST ${route} (non-admin deny)`).toBe(403);

      const anon = await request(createApp()).post(route).send({});
      expect(isLoginRedirect(anon), `anonymous -> POST ${route} (login)`).toBe(true);
    }
  });
});

describe('owner gate — member self-edit (BOLA)', () => {
  // A stable session-holding victim whose edit page every other persona must
  // be denied (404 anti-enumeration), proving the gate is object-level.
  const VICTIM = 't1_paid';

  it('serves a member its own edit page; a pending registrant is routed to the wizard instead', async () => {
    for (const p of CANONICAL_PERSONAS) {
      const cookie = cookies.get(p.slug);
      if (!cookie) continue;
      const res = await request(createApp()).get(`/members/${p.slug}/edit`).set('Cookie', cookie);
      if (isPendingPersona(p)) {
        expect(isWizardRedirect(res), `${p.slug} -> own /edit (pending → wizard)`).toBe(true);
      } else {
        expect(res.status, `${p.slug} -> own /edit (allow)`).toBe(200);
      }
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
      } else if (isPendingPersona(p)) {
        // Membership is checked before ownership, so a pending registrant is
        // routed to the wizard rather than receiving the anti-enumeration 404.
        expect(isWizardRedirect(res), `${p.slug} -> victim /edit (pending → wizard)`).toBe(true);
      } else if (p.slug === VICTIM) {
        expect(res.status, `${p.slug} -> own /edit`).toBe(200);
      } else {
        expect(res.status, `${p.slug} -> victim /edit (cross-owner deny)`).toBe(404);
      }
    }
  });
});

describe('owner gate — member-owned routes (BOLA anti-enumeration)', () => {
  // The controllers 404 when the authenticated user's slug does not match
  // :memberKey, an anti-enumeration deny identical for every non-owner. VICTIM
  // owns the target routes; CROSS_OWNER is a different session-holding member
  // whose every attempt on VICTIM's routes must 404, never leak or act.
  const VICTIM = 't1_paid';
  const CROSS_OWNER = 't2_paid';

  // The member-owned cells come from the deployed router rather than a list
  // kept by hand here. A hand-kept list is a ledger that cannot notice its own
  // gaps: a member-owned route added tomorrow is simply absent, and absence
  // asserts nothing and fails nothing. Reading the router means a new route
  // arrives in this sweep on the day it ships.
  const MEMBER_PREFIX = '/members/:memberKey';

  // Every member-key route deliberately left out, each with the reason it is
  // covered elsewhere or is not an ownership cell at all. An exclusion is a
  // decision someone made; a missing line is an oversight, and the difference
  // has to be visible.
  const EXCLUDED = new Map<string, string>([
    ['GET ', 'the public profile page: readable by any signed-in member, so not an ownership cell'],
    ['GET /edit', 'covered by the self-edit describe above, which also asserts the pending-registrant branch'],
    ['GET /:section', 'the unknown-section catch-all, which answers not-found on shape before ownership is reached'],
  ]);

  type OwnedRoute = { method: 'get' | 'post'; path: string; hasResourceId: boolean };
  let ownedRoutes: OwnedRoute[] = [];

  beforeAll(async () => {
    const table = await loadRouteTable();
    ownedRoutes = table.allRoutes
      .filter((r) => r.path === MEMBER_PREFIX || r.path.startsWith(`${MEMBER_PREFIX}/`))
      .map((r) => ({
        method: r.method.toLowerCase() as 'get' | 'post',
        suffix: r.path.slice(MEMBER_PREFIX.length),
      }))
      .filter(({ method, suffix }) => !EXCLUDED.has(`${method.toUpperCase()} ${suffix}`))
      .map(({ method, suffix }) => ({
        method,
        // A sub-resource id that does not exist: the deny half still lands,
        // because ownership is checked before the resource is looked up.
        path: suffix.replace(/:[^/]+/g, 'ph'),
        hasResourceId: /:[^/]+/.test(suffix),
      }));

    // A router that failed to import would leave this empty and every loop
    // below would pass by doing nothing.
    expect(ownedRoutes.length, 'derived member-owned routes').toBeGreaterThan(15);
    // The cell the hand-kept list had lost: cancelling a recurring donation is
    // member-owned, and it was defended only because a payments test happened
    // to cover it while this ledger showed no gap at all. Naming it keeps the
    // reason the derivation exists legible.
    expect(
      ownedRoutes.some((r) => r.path.includes('/recurring-donations/')),
      'recurring-donation cancel appears among the derived cells',
    ).toBe(true);
    // The exclusions must still name real routes; a stale one silently widens
    // the hole it was written to describe.
    const deployed = new Set(
      table.allRoutes
        .filter((r) => r.path === MEMBER_PREFIX || r.path.startsWith(`${MEMBER_PREFIX}/`))
        .map((r) => `${r.method.toUpperCase()} ${r.path.slice(MEMBER_PREFIX.length)}`),
    );
    for (const key of EXCLUDED.keys()) {
      expect(deployed.has(key), `excluded route still deployed: ${key}`).toBe(true);
    }
  });

  const fire = (method: 'get' | 'post', url: string, cookie?: string) => {
    const t = method === 'get' ? request(createApp()).get(url) : request(createApp()).post(url);
    if (cookie) t.set('Cookie', cookie);
    return method === 'post' ? t.send({}) : t;
  };

  it('404s a non-owner and redirects the unauthenticated on every member-owned route', async () => {
    for (const { method, path } of ownedRoutes) {
      const url = `/members/${VICTIM}${path}`;
      const cross = await fire(method, url, cookies.get(CROSS_OWNER)!);
      expect(cross.status, `${CROSS_OWNER} -> ${method.toUpperCase()} ${url} (cross-owner deny)`).toBe(404);
      const anon = await fire(method, url);
      expect(isLoginRedirect(anon), `anonymous -> ${method.toUpperCase()} ${url} (login)`).toBe(true);
    }
  });

  it('admits the owner past the ownership gate on key-addressed routes', async () => {
    // A sub-resource id that does not exist answers not-found for the owner too,
    // so only routes addressed by member key alone can show the owner passing
    // the gate. The two multipart upload POSTs reject an empty JSON probe body
    // before the handler resolves, so their owner-allow path is exercised by
    // their own upload suites; the deny cells above still cover them.
    const ownerAllow = ownedRoutes.filter(
      (r) => !r.hasResourceId
        && !(r.method === 'post' && (r.path === '/avatar' || r.path === '/media/upload')),
    );
    for (const { method, path } of ownerAllow) {
      const url = `/members/${VICTIM}${path}`;
      const own = await fire(method, url, cookies.get(VICTIM)!);
      expect(own.status, `${VICTIM} -> ${method.toUpperCase()} ${url} (owner not 404)`).not.toBe(404);
      expect(isLoginRedirect(own), `${VICTIM} -> ${method.toUpperCase()} ${url} (owner not login)`).toBe(false);
    }
  });
});

describe('owner gate — member-owned gallery by resource id (adjacent-owner BOLA)', () => {
  // The member-key gate cannot reach this case: the caller passes their OWN
  // profile key and only the gallery id belongs to someone else. Personas that
  // own a real seeded gallery are what make the cell assertable at all; a
  // placeholder id 404s for owner and stranger alike and proves nothing.
  const OWN_GALLERY = 'gallery_persona_gallery_owner';
  const ADJACENT = 'gallery_owner_b';
  const body = { name: 'Authorization matrix probe' };

  it("serves the owner its own gallery's edit page", async () => {
    const res = await request(createApp())
      .get(`/members/gallery_owner/galleries/${OWN_GALLERY}/edit`)
      .set('Cookie', cookies.get('gallery_owner')!);
    expect(res.status, 'gallery_owner -> own gallery edit (allow)').toBe(200);
  });

  it("404s a member reading another member's gallery under their own profile key", async () => {
    const res = await request(createApp())
      .get(`/members/${ADJACENT}/galleries/${OWN_GALLERY}/edit`)
      .set('Cookie', cookies.get(ADJACENT)!);
    expect(res.status, 'gallery_owner_b -> adjacent gallery read (BOLA deny)').toBe(404);
  });

  it("404s a member writing another member's gallery under their own profile key", async () => {
    const res = await request(createApp())
      .post(`/members/${ADJACENT}/galleries/${OWN_GALLERY}/edit`)
      .set('Cookie', cookies.get(ADJACENT)!)
      .send(body);
    expect(res.status, 'gallery_owner_b -> adjacent gallery write (BOLA deny)').toBe(404);

    // confirmed=1 is required to reach the authorization branch at all: without
    // it the handler answers with its delete-confirmation redirect, which is
    // decided before ownership and so proves nothing either way.
    const del = await request(createApp())
      .post(`/members/${ADJACENT}/galleries/${OWN_GALLERY}/delete`)
      .set('Cookie', cookies.get(ADJACENT)!)
      .send({ confirmed: '1' });
    expect(del.status, 'gallery_owner_b -> adjacent gallery delete (BOLA deny)').toBe(404);
  });
});

describe('tier gate — an owned gallery outliving the benefits that created it', () => {
  // Membership tiers do not expire and Active Player does, so this is the only
  // state where the permission to edit lapses while the resource survives. The
  // read must still work: losing benefits does not dispossess a member of what
  // they already own.
  const SLUG = 'gallery_owner_ap_expired';
  const GALLERY = 'gallery_persona_gallery_owner_ap_expired';

  it('still serves the owner its own gallery after the Active Player grant expired', async () => {
    const res = await request(createApp())
      .get(`/members/${SLUG}/galleries/${GALLERY}/edit`)
      .set('Cookie', cookies.get(SLUG)!);
    expect(res.status, 'expired Active Player -> own gallery read (allow)').toBe(200);
  });

  it('denies the write once the Active Player grant that conferred the benefits expired', async () => {
    const res = await request(createApp())
      .post(`/members/${SLUG}/galleries/${GALLERY}/edit`)
      .set('Cookie', cookies.get(SLUG)!)
      .send({ name: 'Authorization matrix probe' });
    expect(res.status, 'expired Active Player -> own gallery write (tier deny)').toBe(403);

    const del = await request(createApp())
      .post(`/members/${SLUG}/galleries/${GALLERY}/delete`)
      .set('Cookie', cookies.get(SLUG)!)
      .send({ confirmed: '1' });
    expect(del.status, 'expired Active Player -> own gallery delete (tier deny)').toBe(403);
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
  // The membership gate routes a pending registrant to the wizard before the
  // tier gate runs, and the Active-Player personas turn on time; both are held
  // out so each cell isolates the tier decision. A persona declaring per-task
  // onboarding state is the pending kind; every other persona is a member.
  const tierCandidates = CANONICAL_PERSONAS.filter(
    (p) =>
      canHoldSession(p) &&
      !p.onboardingTasks &&
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

describe('owner gate — club-leader actions (adjacent-owner BOLA)', () => {
  // These actions mutate club state, so the allow (leader) cell lives in the club
  // suites, not here. The deny property is what this asserts: a leader of a
  // DIFFERENT club (the adjacent owner) is treated exactly as a plain non-leader
  // on this club, proving the gate keys on the specific club rather than on
  // holding any leadership, and neither one performs the action.
  const LEADER_ACTIONS = ['step-down', 'mark-inactive', 'reactivate', 'hashtag', 'invite'];

  it('treats an adjacent-club leader as a non-leader and redirects the unauthenticated', async () => {
    for (const action of LEADER_ACTIONS) {
      const url = `/clubs/${leaderClubKey}/${action}`;
      const adjacent = await request(createApp())
        .post(url)
        .set('Cookie', cookies.get('club_leader_b')!)
        .send({});
      const nonLeader = await request(createApp())
        .post(url)
        .set('Cookie', cookies.get('t1_paid')!)
        .send({});
      expect(adjacent.status, `club_leader_b == t1_paid on ${url} (adjacent owner is not this club's leader)`)
        .toBe(nonLeader.status);
      expect(isLoginRedirect(adjacent), `club_leader_b -> ${url} (a deny, not an auth failure)`).toBe(false);

      const anon = await request(createApp()).post(url).send({});
      expect(isLoginRedirect(anon), `anonymous -> ${url} (login)`).toBe(true);
    }
  });
});

describe('tier gate — POST /clubs/:key/volunteer (co-lead eligibility)', () => {
  it('403s a Tier 0 member without Active Player and redirects the unauthenticated', async () => {
    const url = `/clubs/${leaderClubKey}/volunteer`;
    const tier0 = await request(createApp()).post(url).set('Cookie', cookies.get('t0_fresh')!).send({});
    expect(tier0.status, `t0_fresh -> ${url} (tier deny)`).toBe(403);

    const anon = await request(createApp()).post(url).send({});
    expect(isLoginRedirect(anon), `anonymous -> ${url} (login)`).toBe(true);
  });
});

describe('above the admin gate — POST /admin/bootstrap-claim self-grants nothing', () => {
  it('lets an authenticated non-admin reach the handler but confers no admin without the token', async () => {
    const res = await request(createApp())
      .post('/admin/bootstrap-claim')
      .set('Cookie', cookies.get('t1_paid')!)
      .send({});
    // The claim route sits above requireAdmin by design (the claimant is not yet
    // an admin), so the outcome is neither the admin-gate 403 nor a login redirect.
    expect(res.status, 'reaches the handler past requireAuth').not.toBe(403);
    expect(isLoginRedirect(res), 'not redirected to login').toBe(false);

    // The load-bearing guarantee: a tokenless claim grants nothing. Read the row
    // straight from the DB rather than trusting the response shape.
    const probe = new Database(dbPath, { readonly: true });
    const row = probe
      .prepare('SELECT is_admin FROM members WHERE id = ?')
      .get(memberId('t1_paid')) as { is_admin: number } | undefined;
    probe.close();
    expect(row?.is_admin, 't1_paid was not granted admin by a tokenless bootstrap-claim').toBe(0);
  });
});
