/**
 * Deployed route-table introspection for generative coverage sweeps.
 *
 * Enumerates the routes registered on the always-mounted production routers by
 * walking each router's own layer stack, so a cross-cutting sweep (CSRF
 * Origin-pin, authorization) can assert a property across EVERY deployed route
 * rather than a hand-maintained array that a newly added route silently escapes.
 *
 * The routers are pulled in by dynamic import inside `loadRouteTable`, never as
 * a static top-level import: importing them eagerly would load the frozen
 * `config` singleton before a test's `setTestEnv` runs, pinning the wrong
 * `publicBaseUrl`. Callers invoke this after `importApp()` has booted the app
 * with the test environment in place.
 *
 * `loadRouteTable` lists only the public and admin routers, so the CSRF and
 * authorization sweeps reflect the real public attack surface. `loadServedRoutes`
 * lists every router the app mounts, for the crawl's reach coverage.
 */
import type { Router } from 'express';

export interface RouteEntry {
  method: string;
  path: string;
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface RouterLayer {
  route?: {
    path: string | string[];
    methods?: Record<string, boolean>;
  };
}

function collect(router: Router, prefix: string, out: RouteEntry[]): void {
  const stack = (router as unknown as { stack: RouterLayer[] }).stack ?? [];
  for (const layer of stack) {
    const route = layer.route;
    if (!route) continue; // a use()-mounted middleware layer, not a route
    // Mutation routes in this app are always registered with a single string
    // path; array-path registrations are read-only legacy redirects.
    if (typeof route.path !== 'string') continue;
    const methods = route.methods ?? {};
    for (const m of Object.keys(methods)) {
      if (methods[m]) out.push({ method: m.toUpperCase(), path: prefix + route.path });
    }
  }
}

export interface RouteTable {
  allRoutes: RouteEntry[];
  mutationRoutes: RouteEntry[];
  /** Paths the Origin-pin perimeter exempts (signature/secret-authenticated). */
  exemptExact: string[];
  /** Path prefixes the Origin-pin perimeter exempts (shared-secret mounts). */
  exemptPrefixes: string[];
}

export async function loadRouteTable(): Promise<RouteTable> {
  const pub = await import('../../src/routes/publicRoutes');
  const adm = await import('../../src/routes/adminRoutes');
  const pin = await import('../../src/middleware/requireOriginPin');
  const out: RouteEntry[] = [];
  collect(pub.publicRouter, '', out);
  collect(adm.adminRouter, '/admin', out);
  return {
    allRoutes: out,
    mutationRoutes: out.filter((r) => MUTATION_METHODS.has(r.method)),
    exemptExact: [...pin.EXEMPT_EXACT],
    exemptPrefixes: [...pin.EXEMPT_PREFIXES],
  };
}

// ── Every served route, for reach coverage ───────────────────────────────────
//
// The sweeps above judge the production attack surface, so they read only the
// public and admin routers. A crawl that proves every route was reached has to
// see every router the app mounts in the environment it boots: health, the
// search-engine files, the internal hook and the development harness as well.
// Each route keeps its own compiled matcher, so a requested path is attributed
// to the route that would serve it, parameters and array paths included,
// without re-deriving Express's path syntax here.

export type RouterName = 'public' | 'admin' | 'health' | 'seo' | 'ipc' | 'dev';

export interface ServedRoute {
  method: string;
  /** The registered pattern with its mount prefix, as a readable key. */
  path: string;
  router: RouterName;
  /** Whether this route's own matcher accepts a request path (no query). */
  matches(requestPath: string): boolean;
}

interface MatchableLayer {
  regexp?: RegExp;
  route?: { path: string | string[]; methods?: Record<string, boolean> };
}

function collectServed(router: Router, prefix: string, name: RouterName, out: ServedRoute[]): void {
  const stack = (router as unknown as { stack: MatchableLayer[] }).stack ?? [];
  for (const layer of stack) {
    const route = layer.route;
    const regexp = layer.regexp;
    if (!route || !regexp) continue;
    const shown = Array.isArray(route.path) ? route.path.join('|') : route.path;
    const matches = (requestPath: string): boolean => {
      if (prefix && requestPath !== prefix && !requestPath.startsWith(`${prefix}/`)) return false;
      const rel = requestPath.slice(prefix.length) || '/';
      regexp.lastIndex = 0;
      return regexp.test(rel);
    };
    for (const [m, on] of Object.entries(route.methods ?? {})) {
      if (!on) continue;
      out.push({ method: m === '_all' ? 'ALL' : m.toUpperCase(), path: prefix + shown, router: name, matches });
    }
  }
}

/**
 * Every route the app mounts when it boots in development, in mount order. The
 * development harness is included only when its module exports a router, which
 * it does in every build that mounts it.
 */
export async function loadServedRoutes(): Promise<ServedRoute[]> {
  const health = await import('../../src/routes/healthRoutes');
  const seo = await import('../../src/routes/seoRoutes');
  const ipc = await import('../../src/routes/ipcRoutes');
  const adm = await import('../../src/routes/adminRoutes');
  const dev = await import('../../src/testkit/devRoutes');
  const pub = await import('../../src/routes/publicRoutes');
  const out: ServedRoute[] = [];
  collectServed(health.healthRouter, '/health', 'health', out);
  collectServed(seo.seoRouter, '', 'seo', out);
  collectServed(ipc.ipcRouter, '/ipc', 'ipc', out);
  collectServed(adm.adminRouter, '/admin', 'admin', out);
  if (dev.devRouter) collectServed(dev.devRouter, '/dev', 'dev', out);
  collectServed(pub.publicRouter, '', 'public', out);
  return out;
}

/** Replace `:param` segments with a concrete value so the path is requestable. */
export function fillParams(path: string): string {
  return path.replace(/:[^/]+/g, 'placeholder');
}
