/**
 * Generative CSRF Origin-pin sweep over the whole deployed route table.
 *
 * The Origin-pin perimeter is a single app-level middleware ahead of every
 * router, so the security property is global: every state-changing request
 * whose Origin does not match the site's own origin is refused, except a small
 * set of server-to-server endpoints that authenticate by signature or shared
 * secret and legitimately carry no Origin. A per-route array would let a newly
 * added mutation route slip the perimeter unnoticed; this sweep enumerates the
 * live route table instead, so a new POST/PUT/PATCH/DELETE route is covered by
 * construction and an accidental exemption fails here.
 *
 * No src module is imported statically: doing so would freeze the config
 * singleton (and its publicBaseUrl) before setTestEnv runs. The route table is
 * loaded dynamically after importApp.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import rawRequest from 'supertest';
import originRequest from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { loadRouteTable, fillParams, type RouteEntry } from '../fixtures/routeTable';

const { dbPath } = setTestEnv('3415');

const BAD_ORIGIN = 'http://attacker.example';

let createApp: Awaited<ReturnType<typeof importApp>>;
let mutationRoutes: RouteEntry[];
let exemptExact: Set<string>;

// The Origin-pin perimeter also exempts the server-to-server `/ipc/*` prefix.
function isExempt(path: string): boolean {
  return exemptExact.has(path) || path.startsWith('/ipc/');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function send(app: any, method: string, path: string): any {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  return rawRequest(app)[method.toLowerCase()](path);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
  const table = await loadRouteTable();
  mutationRoutes = table.mutationRoutes;
  exemptExact = new Set(table.exemptExact);
});

afterAll(() => cleanupTestDb(dbPath));

describe('CSRF Origin-pin perimeter — generative sweep over deployed routes', () => {
  it('refuses a mismatched Origin on every non-exempt deployed mutation route', async () => {
    const routes = mutationRoutes.filter((r) => !isExempt(r.path));
    // Guard against a silent introspection failure that would make the sweep
    // vacuously pass.
    expect(routes.length, 'discovered mutation routes').toBeGreaterThan(20);
    for (const r of routes) {
      const path = fillParams(r.path);
      const out = await send(createApp(), r.method, path).set('Origin', BAD_ORIGIN).send({});
      expect(out.status, `${r.method} ${path} must be refused (403) on a foreign Origin`).toBe(403);
    }
  });

  it('does not refuse a matching Origin (the perimeter is not a blanket block)', async () => {
    // Contrast case: the same route accepts the request past the perimeter when
    // the Origin matches the site origin, proving the 403s above come from the
    // Origin check rather than a universal rejection.
    const refused = await rawRequest(createApp()).post('/logout').set('Origin', BAD_ORIGIN).send({});
    expect(refused.status, 'foreign Origin refused').toBe(403);
    const allowed = await originRequest(createApp()).post('/logout').send({});
    expect(allowed.status, 'matching Origin passes the perimeter').not.toBe(403);
  });

  it('exempts only the signature-authenticated webhooks (Origin-independent)', async () => {
    // An exempt route's outcome does not depend on the Origin header: the same
    // malformed body yields the same status whether the Origin is foreign or
    // matching, because the perimeter never runs for it.
    for (const path of exemptExact) {
      const bad = await rawRequest(createApp()).post(path).set('Origin', BAD_ORIGIN).send('{}');
      const good = await originRequest(createApp()).post(path).send('{}');
      expect(bad.status, `${path} is Origin-independent (exempt)`).toBe(good.status);
    }
  });
});
