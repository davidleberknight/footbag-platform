/**
 * Every route the booted app serves carries a guard, or is public by a named
 * decision.
 *
 * The rule: a route's guard is required whether or not any page links to it,
 * so a missing guard is a defect on its own. The route-auth conformance test
 * reads two route files as text and checks only the state-changing routes; this
 * one walks the app the way Express does, every mounted router and every route
 * registered on the app itself, reads page reads as well as writes, and
 * recognises a guard by the middleware function itself rather than by its name
 * in the source.
 *
 * A guard counts when it sits in the route's own chain or is registered on its
 * router ahead of it, which is how the admin router gates every route below
 * its gate. A router the app mounts that this test does not know fails, so a
 * new router is classified on the day it is added.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Express, RequestHandler } from 'express';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4893');

interface Layer {
  name?: string;
  handle: RequestHandler & { stack?: Layer[] };
  route?: { path: string | string[]; methods: Record<string, boolean>; stack: Layer[] };
}

/**
 * Routes reachable with no guard, each with the reason it is open. A route
 * here is a decision about a surface anyone can reach, which is why each
 * carries its reason rather than sitting in silence.
 */
const PUBLIC_BY_DESIGN: Record<string, string> = {};
function open(reason: string, ...keys: string[]): void {
  for (const k of keys) PUBLIC_BY_DESIGN[k] = reason;
}

open('the site stylesheet, which every page loads before anyone signs in',
  'GET /css/style.css');
open('a browser posts its content-security-policy violations with no session; only the report key is logged',
  'POST /csp-report');
open('the load balancer and monitoring probe health with no session',
  'GET /health/live', 'GET /health/ready');
open('crawlers read these with no session',
  'GET /robots.txt', 'GET /sitemap.xml', 'GET /llms.txt');
open('the public site: pages any visitor reads, with member-only enhancements shaped by the service',
  'GET /', 'GET /forum', 'GET /clubs', 'GET /clubs/:key',
  'GET /media', 'GET /media/browse', 'GET /media/freestyle-tutorials', 'GET /media/member-galleries',
  'GET /media/item/:mediaId', 'GET /media/:galleryId', 'GET /media/:galleryId/:mediaId',
  'GET /hof', 'GET /bap',
  'GET /freestyle', 'GET /freestyle/records', 'GET /freestyle/search', 'GET /freestyle/media',
  'GET /freestyle/leaders', 'GET /freestyle/competition', 'GET /freestyle/partnerships',
  'GET /freestyle/history', 'GET /freestyle/about', 'GET /freestyle/add-analysis',
  'GET /freestyle/combo-analysis', 'GET /freestyle/sets/:slug', 'GET /freestyle/sets',
  'GET /freestyle/glossary', 'GET /freestyle/concepts', 'GET /freestyle/notation-article',
  'GET /freestyle/operators', 'GET /freestyle/observational', 'GET /freestyle/tricks',
  'GET /freestyle/by-the-numbers', 'GET /freestyle/start', 'GET /freestyle/modifier/:slug',
  'GET /freestyle/families/:slug', 'GET /freestyle/tricks/:add(\\d+)', 'GET /freestyle/tricks/:slug',
  'GET /net', 'GET /x-square', 'GET /golf', 'GET /consecutives', 'GET /sideline',
  'GET /rules', 'GET /rules/:categorySlug/:ruleSlug', 'GET /ifpa', 'GET /ifpa/:docSlug',
  'GET /events', 'GET /events/year/:year', 'GET /events/:eventKey',
  'GET /history/:personId', 'GET /legal', 'GET /equipment');
open('typeahead over public vocabulary (tags, events, clubs, tricks); no member is ever matched',
  'GET /tags/suggest', 'GET /freestyle/search/suggest');
open('an honoree profile is public; the controller sends any other visitor to sign in, the same way for an unknown address',
  'GET /members/:memberKey');
open('signing in, joining and recovering an account happen before there is a session to guard on',
  'GET /login', 'POST /login', 'GET /register', 'POST /register', 'GET /register/check-email',
  'GET /verify/:token', 'POST /verify/resend', 'GET /password/forgot', 'POST /password/forgot',
  'GET /password/reset/:token', 'POST /password/reset/:token', 'POST /logout');
open('Stripe calls this with no session; the controller verifies the payload signature before any write',
  'POST /payments/webhook');
open('a mail client follows or posts this with no session; the signed token names one member and audience and is verified before any write',
  'GET /email/unsubscribe', 'POST /email/unsubscribe');

/** Whole routers that are open by design, by name, with the reason. */
const PUBLIC_ROUTERS: Record<string, string> = {
  dev: 'the development harness, mounted only in development and staging',
};

interface ServedRoute {
  key: string;
  router: string;
  guarded: boolean;
}

let routes: ServedRoute[] = [];
let unknownRouters: string[] = [];

beforeAll(async () => {
  createTestDb(dbPath).close();
  const createApp = await importApp();
  const app = createApp() as Express;

  const { requireAuth, requireMember } = await import('../../src/middleware/auth');
  const { requireAdmin } = await import('../../src/middleware/requireAdmin');
  const { requireInternalSecret } = await import('../../src/middleware/requireInternalSecret');
  const guards = new Set<unknown>([requireAuth, requireMember, requireAdmin, requireInternalSecret]);

  const known = new Map<unknown, { name: string; prefix: string }>();
  known.set((await import('../../src/routes/healthRoutes')).healthRouter, { name: 'health', prefix: '/health' });
  known.set((await import('../../src/routes/seoRoutes')).seoRouter, { name: 'seo', prefix: '' });
  known.set((await import('../../src/routes/ipcRoutes')).ipcRouter, { name: 'ipc', prefix: '/ipc' });
  known.set((await import('../../src/routes/adminRoutes')).adminRouter, { name: 'admin', prefix: '/admin' });
  known.set((await import('../../src/routes/publicRoutes')).publicRouter, { name: 'public', prefix: '' });
  const dev = (await import('../../src/testkit/devRoutes')).devRouter;
  if (dev) known.set(dev, { name: 'dev', prefix: '/dev' });

  const collect = (stack: Layer[], router: string, prefix: string): void => {
    // Guards registered on the router itself apply to every route after them.
    let inherited = false;
    for (const layer of stack) {
      if (layer.route) {
        const own = layer.route.stack.some((l) => guards.has(l.handle));
        const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
        for (const [method, on] of Object.entries(layer.route.methods)) {
          if (!on) continue;
          for (const p of paths) {
            routes.push({ key: `${method.toUpperCase()} ${prefix}${p}`, router, guarded: own || inherited });
          }
        }
      } else if (layer.name === 'router' && layer.handle.stack) {
        const mounted = known.get(layer.handle);
        if (!mounted) { unknownRouters.push(String(layer.handle.name || 'anonymous router')); continue; }
        collect(layer.handle.stack, mounted.name, mounted.prefix);
      } else if (guards.has(layer.handle)) {
        inherited = true;
      }
    }
  };
  const appStack = (app as unknown as { _router: { stack: Layer[] } })._router.stack;
  collect(appStack, 'app', '');
  routes = routes.filter((r, i) => routes.findIndex((o) => o.key === r.key) === i);
  unknownRouters = [...new Set(unknownRouters)];
});

afterAll(() => cleanupTestDb(dbPath));

describe('route guard presence', () => {
  // Defect caught: a walk that matched nothing would pass every case below.
  it('finds the routes the app serves, in every router it mounts', () => {
    expect(routes.length).toBeGreaterThan(200);
    for (const name of ['app', 'health', 'seo', 'ipc', 'admin', 'public']) {
      expect(routes.some((r) => r.router === name), `no routes found in the ${name} router`).toBe(true);
    }
    expect(routes.find((r) => r.key === 'GET /admin/members')?.guarded).toBe(true);
  });

  // Defect caught: a router mounted after this test was written whose routes
  // nobody classified.
  it('knows every router the app mounts', () => {
    expect(unknownRouters, unknownRouters.join('\n')).toEqual([]);
  });

  // Defect caught: a page or form handler added with no guard, reachable by an
  // anonymous visitor, because nothing checks for a guard that is absent.
  it('every route carries a guard unless it is public by design', () => {
    const offenders = routes
      .filter((r) => !r.guarded && !(r.router in PUBLIC_ROUTERS) && !(r.key in PUBLIC_BY_DESIGN))
      .map((r) => r.key);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  // Defect caught: a public entry that outlived its route, which would excuse
  // whatever route next took that address.
  it('every public-by-design entry names a route the app serves', () => {
    const stale = Object.keys(PUBLIC_BY_DESIGN).filter((k) => !routes.some((r) => r.key === k));
    expect(stale, stale.join('\n')).toEqual([]);
  });

  // Defect caught: a route listed as public that has since gained a guard, so
  // the list overstates what anyone can reach.
  it('no public-by-design entry is in fact guarded', () => {
    const guardedAnyway = Object.keys(PUBLIC_BY_DESIGN)
      .filter((k) => routes.some((r) => r.key === k && r.guarded));
    expect(guardedAnyway, guardedAnyway.join('\n')).toEqual([]);
  });
});
