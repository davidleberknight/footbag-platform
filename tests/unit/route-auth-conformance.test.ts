/**
 * Membership-authorization conformance for the route table.
 *
 * The permanent contract: membership is an authorization level above
 * authentication. An account is pending from registration until every
 * onboarding task completes, and a pending registrant holds a session but no
 * member authorization. Every member-capability route therefore carries the
 * requireMember guard, and bare requireAuth appears only on the surfaces a
 * pending registrant legitimately uses: the wizard's own routes, and the
 * historical-record claim routes (claiming is part of finishing onboarding).
 * Admin authority sits above member authority rather than beside it, so both
 * admin-gated routers require membership before the admin check runs.
 *
 * This test reads the route sources statically, so a new route lands in the
 * suite whether it carries the weaker guard or no guard at all. A missing
 * guard is the worse of the two failures and is the one a scan keyed on the
 * guard name cannot see, which is why registrations are parsed whole and
 * checked for the presence of a guard rather than only for its spelling.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function readRoutes(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'src', 'routes', file), 'utf8');
}

const PUBLIC_ROUTES   = readRoutes('publicRoutes.ts');
const ADMIN_ROUTES    = readRoutes('adminRoutes.ts');
const INTERNAL_ROUTES = readRoutes('internalRoutes.ts');

// The only path prefixes a pending registrant may reach while authenticated.
const PENDING_ALLOWED = [
  '/register/wizard/',
  '/history/:personId/claim',
];

// Routes that sit under a pending-reachable prefix and are nonetheless
// member-only, each with the reason. An entry here is a decision someone made;
// silence would be an oversight, and the difference has to be visible.
// The set is empty: the wizard belongs to signing up, so every route under it
// is reachable by the registrant who has to get through it, and a capability
// only a member holds lives on a member surface instead of being gated in
// place. The two tests below hold that line from both directions.
const PENDING_SURFACE_MEMBER_ONLY = new Map<string, string>();

// State-changing routes that are unguarded by design: each is either a
// pre-session flow an anonymous visitor must be able to post to, or a
// server-to-server webhook that authenticates its caller in the controller (by
// payload signature or shared secret) because there is no session to gate on.
// Adding to this list is a deliberate decision about a publicly postable
// surface, which is the point of making it explicit here.
const UNGUARDED_BY_DESIGN = new Set([
  '/login',
  '/register',
  '/verify/resend',
  '/password/forgot',
  '/password/reset/:token',
  '/logout',
  'STRIPE_WEBHOOK_PATH',
  'SES_FEEDBACK_WEBHOOK_PATH',
  'ALARM_WEBHOOK_PATH',
]);

interface Registration {
  line: number;
  method: string;
  /** The first argument: a quoted path, or the identifier naming one. */
  target: string;
  /** The whole registration, however many source lines it spans. */
  text: string;
}

// A registration may wrap across several lines, so accumulate from the opening
// call until its parentheses balance. Reading only the first line would miss a
// guard sitting on the next one, and would miss the call entirely when the
// path is a constant rather than a literal.
function registrations(source: string): Registration[] {
  const lines = source.split('\n');
  const found: Registration[] = [];
  for (let i = 0; i < lines.length; i++) {
    const opener = lines[i].match(/\b\w*[Rr]outer\.(get|post|put|delete)\(/);
    if (!opener) continue;
    let text = '';
    let depth = 0;
    let started = false;
    for (let j = i; j < lines.length; j++) {
      text += (j > i ? '\n' : '') + lines[j];
      for (const ch of lines[j]) {
        if (ch === '(') { depth++; started = true; }
        else if (ch === ')') depth--;
      }
      if (started && depth <= 0) break;
    }
    const quoted = text.match(/\(\s*'([^']+)'/);
    const ident  = text.match(/\(\s*([A-Z][A-Z0-9_]*)\s*,/);
    found.push({
      line: i + 1,
      method: opener[1],
      target: quoted?.[1] ?? ident?.[1] ?? '',
      text,
    });
  }
  return found;
}

const isPendingSurface = (target: string): boolean =>
  PENDING_ALLOWED.some((p) => target.startsWith(p));

const hasGuard = (text: string): boolean =>
  /\brequireAuth\b/.test(text) || /\brequireMember\b/.test(text);

describe('membership-authorization route conformance', () => {
  const publicRegistrations = registrations(PUBLIC_ROUTES);

  it('parses the public route table (guards the parser itself against silent drift)', () => {
    // A parser that quietly matched nothing would pass every assertion below,
    // so pin that it still finds the table it is meant to police.
    expect(publicRegistrations.length).toBeGreaterThan(50);
    expect(publicRegistrations.some((r) => r.target === '/clubs/:key')).toBe(true);
  });

  it('bare requireAuth appears only on the wizard and claim routes', () => {
    const offenders = publicRegistrations
      .filter((r) => /\brequireAuth\b/.test(r.text) && !isPendingSurface(r.target))
      .map((r) => `line ${r.line}: ${r.method.toUpperCase()} ${r.target}`);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the wizard and claim routes use bare requireAuth, never requireMember', () => {
    // A pending registrant has to reach these to stop being pending. The named
    // exceptions above are the routes under these prefixes that are member-only
    // anyway, each for a reason recorded beside it.
    const offenders = publicRegistrations
      .filter((r) => isPendingSurface(r.target)
        && !PENDING_SURFACE_MEMBER_ONLY.has(r.target)
        && /\brequireMember\b/.test(r.text))
      .map((r) => `line ${r.line}: ${r.method.toUpperCase()} ${r.target}`);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('every named pending-surface exception is deployed and is actually member-gated', () => {
    // A stale exception silently widens the hole it was written to describe, and
    // an exception that lost its guard would read as covered while being open.
    // The set is empty today, which the test below is what actually holds; this
    // one exists so that an entry added later cannot rot unnoticed.
    for (const [target, reason] of PENDING_SURFACE_MEMBER_ONLY) {
      const found = publicRegistrations.filter((r) => r.target === target);
      expect(found.length, `exception no longer deployed: ${target} (${reason})`).toBeGreaterThan(0);
      for (const r of found) {
        expect(
          /\brequireMember\b/.test(r.text),
          `line ${r.line}: ${r.method.toUpperCase()} ${target} lost requireMember`,
        ).toBe(true);
      }
    }
  });

  it('no wizard route is member-gated, because the wizard belongs to signing up', () => {
    // The positive form of the empty exception set above, which would otherwise
    // assert nothing at all. A capability only a member holds lives on a member
    // surface; gating it inside the wizard instead would put it where the person
    // it is gated against is the only one who ever goes.
    const gated = publicRegistrations
      .filter((r) => isPendingSurface(r.target) && /\brequireMember\b/.test(r.text))
      .map((r) => `line ${r.line}: ${r.method.toUpperCase()} ${r.target}`);
    expect(gated, gated.join('\n')).toEqual([]);
  });

  it('every state-changing public route carries a guard unless it is unguarded by design', () => {
    // The check a guard-name scan cannot make: a route registered with no
    // guard at all is open to anonymous visitors, which is a worse failure
    // than carrying the weaker guard.
    const offenders = publicRegistrations
      .filter((r) => r.method !== 'get')
      .filter((r) => !UNGUARDED_BY_DESIGN.has(r.target))
      .filter((r) => !hasGuard(r.text))
      .map((r) => `line ${r.line}: ${r.method.toUpperCase()} ${r.target}`);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the admin router gates on requireMember before requireAdmin', () => {
    expect(ADMIN_ROUTES).toMatch(/adminRouter\.use\(\s*requireMember\s*,\s*requireAdmin\s*\)/);
    expect(ADMIN_ROUTES).not.toMatch(/\brequireAuth\b/);
  });

  // Matching the gate anywhere in the file says only that it is present. A route
  // registered above it is ungated, and the bootstrap claim proves that position
  // is a real place for a route to sit, so a new one added a line too high would
  // reach every signed-in member with the check still green.
  it('no admin route is registered above the gate, except the bootstrap claim', () => {
    // The bootstrap claim is deliberately above it: the claimant is by
    // definition not yet an administrator, so requiring the role would close the
    // only path that creates one.
    const ABOVE_GATE_BY_DESIGN = new Set(['/bootstrap-claim']);
    const gateLine = ADMIN_ROUTES.split('\n')
      .findIndex((l) => /adminRouter\.use\(\s*requireMember\s*,\s*requireAdmin\s*\)/.test(l)) + 1;
    expect(gateLine).toBeGreaterThan(0);

    const offenders = registrations(ADMIN_ROUTES)
      .filter((r) => r.line < gateLine)
      .filter((r) => !ABOVE_GATE_BY_DESIGN.has(r.target))
      .map((r) => `line ${r.line}: ${r.method.toUpperCase()} ${r.target}`);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the internal operator router gates on requireMember before requireAdmin', () => {
    expect(INTERNAL_ROUTES).toMatch(/internalRouter\.use\(\s*requireMember\s*,\s*requireAdmin\s*\)/);
    expect(INTERNAL_ROUTES).not.toMatch(/\brequireAuth\b/);
  });
});
