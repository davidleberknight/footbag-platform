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
 * Only the routers that ship in the production image are listed here; the
 * development-only `/dev` and `/internal` surfaces are covered by their own
 * targeted tests and are intentionally excluded so the sweep reflects the real
 * public attack surface.
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
}

export async function loadRouteTable(): Promise<RouteTable> {
  const pub = await import('../../src/routes/publicRoutes');
  const adm = await import('../../src/routes/adminRoutes');
  const out: RouteEntry[] = [];
  collect(pub.publicRouter, '', out);
  collect(adm.adminRouter, '/admin', out);
  return {
    allRoutes: out,
    mutationRoutes: out.filter((r) => MUTATION_METHODS.has(r.method)),
    exemptExact: [pub.STRIPE_WEBHOOK_PATH, pub.SES_FEEDBACK_WEBHOOK_PATH],
  };
}

/** Replace `:param` segments with a concrete value so the path is requestable. */
export function fillParams(path: string): string {
  return path.replace(/:[^/]+/g, 'placeholder');
}
