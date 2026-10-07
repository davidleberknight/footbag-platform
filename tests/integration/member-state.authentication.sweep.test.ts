/**
 * A deceased, deleted, erased or unverified account cannot sign in, and a
 * session it already holds is worth nothing.
 *
 * Signing in is refused to all four states, and the session check that runs on
 * every request re-reads the account, so a session issued while the account was
 * live must stop working the moment it leaves that state: a family member who
 * inherits a signed-in laptop, or a member who deleted their account and kept a
 * tab open, must be an anonymous visitor everywhere.
 *
 * The sweep reads every deployed route and keeps the ones that turn an anonymous
 * visitor away to sign in, then asserts each excluded state's session is turned
 * away identically, on its own member key, holding the administrator role. A
 * live administrator's session is the positive control: it must get past those
 * same gates somewhere, or every comparison could pass by comparing two refusals
 * that would have happened anyway.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { loadRouteTable, type RouteEntry } from '../fixtures/routeTable';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';
import { hashTestPassword } from '../fixtures/hashTestPassword';

const { dbPath } = setTestEnv('4457');

let createApp: Awaited<ReturnType<typeof importApp>>;

const PASSWORD = 'AuthSweepPass1!';
const PAST = '2025-01-01T00:00:00.000Z';

type ExcludedState = 'deceased' | 'softDeleted' | 'purged' | 'unverified';

/**
 * Each excluded state as an administrator, so the admin gate is swept too. The
 * purged account keeps no credentials, so it is asked only about a session it
 * held before the purge.
 */
const STATES: Record<ExcludedState, Parameters<typeof insertMember>[1]> = {
  deceased:    { is_deceased: 1, deceased_at: PAST },
  softDeleted: { deleted_at: PAST },
  purged:      { deleted_at: PAST, personal_data_purged_at: PAST },
  unverified:  { email_verified_at: null },
};

const idOf = (state: string) => `auth-sweep-${state}`;
const slugOf = (state: string) => `auth_sweep_${state.toLowerCase()}`;
const emailOf = (state: string) => `auth-sweep-${state.toLowerCase()}@example.test`;

let gatedRoutes: RouteEntry[] = [];

function urlFor(route: RouteEntry, state: string): string {
  return route.path.replace(':memberKey', slugOf(state)).replace(/:[^/]+/g, 'ph');
}

function isLoginRedirect(res: { status: number; headers: Record<string, unknown> }): boolean {
  const loc = res.headers.location;
  return res.status === 302 && typeof loc === 'string' && loc.startsWith('/login');
}

async function fire(route: RouteEntry, url: string, cookie?: string) {
  const app = createApp();
  const req = route.method === 'GET' ? request(app).get(url) : request(app).post(url);
  if (cookie) req.set('Cookie', cookie);
  return route.method === 'GET' ? req : req.send({});
}

function sessionFor(state: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: idOf(state), role: 'admin' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const hash = await hashTestPassword(PASSWORD);
  insertMember(db, { id: idOf('live'), slug: slugOf('live'), login_email: emailOf('live'), password_hash: hash, is_admin: 1 });
  for (const [state, overrides] of Object.entries(STATES)) {
    insertMember(db, {
      id: idOf(state), slug: slugOf(state), login_email: emailOf(state), password_hash: hash, is_admin: 1,
      ...overrides,
    });
  }
  db.close();
  createApp = await importApp();

  // The gated set is derived, never listed: a route is in it when an anonymous
  // visitor is sent to sign in, so a gated route added tomorrow is swept too.
  const table = await loadRouteTable();
  const candidates = table.allRoutes.filter((r) => r.method === 'GET' || r.method === 'POST');
  for (const route of candidates) {
    const anon = await fire(route, urlFor(route, 'live'));
    if (isLoginRedirect(anon)) gatedRoutes.push(route);
  }
  gatedRoutes = gatedRoutes.sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
});

afterAll(() => cleanupTestDb(dbPath));

describe('member-state authentication sweep', () => {
  // Defect caught: the sign-in lookup forgets a state, so a deceased, deleted
  // or unverified account signs in with its own correct password.
  it('refuses a correct password for every excluded state that still holds one, and accepts it for a live account', async () => {
    const issued = async (state: string) => {
      const res = await request(createApp()).post('/login').type('form')
        .send({ email: emailOf(state), password: PASSWORD });
      const cookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
      return cookies.some((c) => c.startsWith('__Host-footbag_session=') && !/__Host-footbag_session=;/.test(c));
    };
    expect(await issued('live'), 'a live account with the right password signs in').toBe(true);
    const signedIn: string[] = [];
    for (const state of ['deceased', 'softDeleted', 'unverified'] as const) {
      if (await issued(state)) signedIn.push(state);
    }
    expect(signedIn).toEqual([]);
  });

  // Positive control: a live administrator's session gets past the gate on the
  // administrator home page, so a refusal below is the session's state and not
  // a cookie the app never honours.
  it('honours a live administrator\'s session, and finds the gated routes to sweep', async () => {
    expect(gatedRoutes.length, 'routes that require signing in').toBeGreaterThan(100);
    expect(gatedRoutes.some((r) => r.path.startsWith('/admin')), 'administrator routes are among them').toBe(true);
    const control = await request(createApp()).get('/admin').set('Cookie', sessionFor('live'));
    expect(control.status, 'live administrator session is honoured').toBe(200);
  });

  for (const state of Object.keys(STATES) as ExcludedState[]) {
    // Defect caught: the per-request session check stops re-reading the
    // account, so a session issued while the account was live keeps working
    // after it leaves that state, administrator role included.
    it(`turns a ${state} account's session away from every gated route exactly as it turns away an anonymous visitor`, async () => {
      const admitted: string[] = [];
      for (const route of gatedRoutes) {
        const res = await fire(route, urlFor(route, state), sessionFor(state));
        if (!isLoginRedirect(res)) admitted.push(`${route.method} ${route.path}: ${res.status}`);
      }
      expect(admitted).toEqual([]);
    });
  }
});
