/**
 * GET /dev/personas — tester-facing persona catalog listing.
 *
 * The /dev router mounts when config.footbagEnv is 'development' or 'staging'
 * (never production). This file pins 'staging' — the harder, production-hardened
 * boot (NODE_ENV=production, stub adapters) that a real staging box runs — to
 * prove the page is reachable there, since staging is where testers exercise the
 * harness. The development arm of the same mount condition is covered by
 * devSwitchRoute.test.ts; the production-refusal (404) case by
 * devRoutes.prodGate.test.ts.
 *
 * The route renders the in-memory canonical catalog as a grid of persona cards
 * and probes the DB per persona: a Switch button appears only when the session
 * lookup the switch route runs resolves the persona, so a seeded-but-login-
 * blocked persona (unverified, deceased, soft-deleted) offers a Log In button
 * that runs the real login attempt instead of a Switch link that would 404, and
 * a blocked or unseeded one renders greyed with no link. beforeAll seeds the
 * backed catalog so the Switch-link assertions hold.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';
import { seedPersona } from '../../src/testkit/personaFactory';
const { dbPath } = setTestEnv('3437');

// Full, valid FOOTBAG_ENV=staging baseline. Staging requires NODE_ENV=production
// (production-hardening parity), SES_ADAPTER=stub (non-prod must not send real
// mail), and PAYMENT_ADAPTER=stub with its own generated signing secret (the
// live payment SDK is refused below production). The remaining stub adapters
// + JWT_SIGNER=local keep boot off AWS.
const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
const PRIOR_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV                  = 'production';
process.env.FOOTBAG_ENV               = 'staging';
// A deployed environment refuses curator save-file writes, which the shared
// test setup turns on, so a staging boot turns them back off.
process.env.ALLOW_CURATED_SIDECAR_WRITES = '0';
process.env.SESSION_SECRET            = 'a'.repeat(48);
process.env.JWT_SIGNER                = 'local';
process.env.SES_ADAPTER               = 'stub';
process.env.SES_FROM_IDENTITY         = 'noreply@test.example.com';
process.env.AWS_REGION                = 'us-east-1';
process.env.SAFE_BROWSING_ADAPTER     = 'stub';
process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
process.env.SECRETS_ADAPTER           = 'stub';
process.env.CAPTCHA_ADAPTER           = 'stub'; // mandatory-explicit under prod-mode boots; staging runs the stub by design
process.env.IMAGE_PROCESSOR_URL       = 'http://image:4000';
process.env.MEDIA_STORAGE_ADAPTER     = 'local';
process.env.PAYMENT_ADAPTER           = 'stub';
process.env.STRIPE_WEBHOOK_SECRET_STUB = 'whsec_stub_abababababababababababababababababababababababab';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const spec of CANONICAL_PERSONAS.filter((p) => !p.blockedBy)) {
    seedPersona(db, spec);
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
  if (PRIOR_FOOTBAG_ENV === undefined) delete process.env.FOOTBAG_ENV;
  else process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
  if (PRIOR_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = PRIOR_NODE_ENV;
});

describe('GET /dev/personas (staging boot)', () => {
  // A backed persona is switchable unless its own state blocks login. The switch
  // route's session lookup excludes unverified, deceased, and soft-deleted rows,
  // so those render "Not switchable" rather than a Switch link that would 404.
  const isSwitchable = (p: (typeof CANONICAL_PERSONAS)[number]) =>
    !p.blockedBy && p.emailVerified !== false && !p.isDeceased && !p.deletionState;

  it('lists every persona; only session-eligible personas get a Switch link', async () => {
    const res = await request(createApp()).get('/dev/personas');
    expect(res.status).toBe(200);
    // Every persona, switchable or not, is listed in the catalog.
    for (const spec of CANONICAL_PERSONAS) {
      expect(res.text, spec.slug).toContain(spec.slug);
    }
    // Switchable personas offer a Switch link (Handlebars escapes `=` to &#x3D;).
    for (const spec of CANONICAL_PERSONAS.filter(isSwitchable)) {
      expect(res.text, spec.slug).toMatch(new RegExp(`/dev/switch\\?as(=|&#x3D;)${spec.slug}\\b`));
    }
    // Seeded-but-login-blocked personas offer a Log in link (the real login
    // attempt) instead of a Switch link: an exercisable link, not a dead row.
    const loginBlocked = CANONICAL_PERSONAS.filter((p) => !p.blockedBy && !isSwitchable(p));
    expect(loginBlocked.length, 'catalog should include login-blocked personas').toBeGreaterThan(0);
    for (const spec of loginBlocked) {
      expect(res.text, spec.slug).not.toMatch(new RegExp(`/dev/switch\\?as(=|&#x3D;)${spec.slug}\\b`));
      expect(res.text, spec.slug).toMatch(new RegExp(`/dev/login\\?as(=|&#x3D;)${spec.slug}\\b`));
    }
    // Blocked (unbuilt-feature) personas show their blocker reason and no link.
    for (const spec of CANONICAL_PERSONAS.filter((p) => p.blockedBy)) {
      expect(res.text, spec.slug).toContain(spec.blockedBy as string);
      expect(res.text, spec.slug).not.toMatch(new RegExp(`/dev/switch\\?as(=|&#x3D;)${spec.slug}\\b`));
    }
  });

  it('renders persona cards, not a table', async () => {
    const res = await request(createApp()).get('/dev/personas');
    expect(res.status).toBe(200);
    // The legacy table layout is gone.
    expect(res.text).not.toContain('<table');
    // One card per catalog persona (backed, login-blocked, and blocked all render).
    const cardCount = (res.text.match(/class="card[ "]/g) ?? []).length;
    expect(cardCount).toBeGreaterThanOrEqual(CANONICAL_PERSONAS.length);
  });

  it('gives every persona a switch-style control matching its login state', async () => {
    const res = await request(createApp()).get('/dev/personas');
    // Switchable personas get a primary Switch button.
    for (const spec of CANONICAL_PERSONAS.filter(isSwitchable)) {
      expect(res.text, spec.slug).toMatch(
        new RegExp(`btn btn-primary" href="[^"]*${spec.slug}\\b`),
      );
    }
    // Seeded-but-login-blocked personas get an outline Log In button instead.
    const loginBlocked = CANONICAL_PERSONAS.filter(
      (p) => !p.blockedBy && !isSwitchable(p),
    );
    for (const spec of loginBlocked) {
      expect(res.text, spec.slug).toMatch(
        new RegExp(`btn btn-outline" href="[^"]*/dev/login[^"]*${spec.slug}\\b`),
      );
    }
  });

  it('shows a shaped tier label, the role, purpose, and coverage for a representative persona', async () => {
    const res = await request(createApp()).get('/dev/personas');
    const admin = CANONICAL_PERSONAS.find((p) => p.isAdmin);
    expect(admin, 'catalog should include at least one admin persona').toBeDefined();
    // Tier renders as a shaped label, not the raw domain code in the tier cell.
    expect(res.text).toContain('Tier 2');
    expect(res.text).toContain('admin');
    // The persona's purpose (its why) and a coverage note both render.
    expect(res.text).toContain(admin!.purpose);
    expect(res.text).toContain(CANONICAL_PERSONAS[0].coverageNotes[0]);
  });

  it('renders an authorization role beyond admin/member (club leader reads as a co-leader)', async () => {
    const res = await request(createApp()).get('/dev/personas');
    const leader = CANONICAL_PERSONAS.find((p) => p.club?.leader || p.club?.role);
    expect(leader, 'catalog should include at least one club-leader persona').toBeDefined();
    expect(res.text).toContain('club co-leader');
  });

  // Defect caught: the page offers testers a control that builds and claims an
  // account for a real member, a change on shared staging the persona refresh
  // never undoes. The build-claim route stays for the real-data tests alone.
  it('offers no control that builds an account for a real member', async () => {
    const res = await request(createApp()).get('/dev/personas');
    expect(res.status).toBe(200);
    expect(res.text).toContain('action="/dev/personas/refresh"');
    expect(res.text).not.toContain('/dev/build-claim');
  });
  it('groups personas under their authorization-axis headings', async () => {
    const res = await request(createApp()).get('/dev/personas');
    // Start here and the collapsed section take their personas out of their
    // own dimension's group, so a heading exists for every dimension left.
    const dimensions = new Set(
      CANONICAL_PERSONAS.filter((p) => !p.listing && !p.blockedBy)
        .map((p) => p.dimension).filter((d): d is string => Boolean(d)),
    );
    expect(dimensions.size).toBeGreaterThan(1);
    for (const dimension of dimensions) {
      // Handlebars HTML-escapes '&' in headings to '&amp;'.
      expect(res.text).toContain(dimension.replace(/&/g, '&amp;'));
    }
  });

  /** The slugs rendered inside one region of the page, in order. */
  const slugsIn = (html: string): string[] =>
    [...html.matchAll(/<code class="font-mono">([a-z0-9_]+)<\/code>/g)].map((m) => m[1]);
  const region = (html: string, startId: string, endId?: string): string => {
    const start = html.indexOf(`id="${startId}"`);
    const end = endId ? html.indexOf(`id="${endId}"`) : html.length;
    expect(start, `region ${startId} rendered`).toBeGreaterThan(-1);
    return html.slice(start, end > start ? end : html.length);
  };

  // Defect caught: a tester opening the page meets the specialist groups first
  // and cannot tell which handful of personas covers everyday testing.
  it('opens with the guidance, then a Start here group holding exactly the everyday personas', async () => {
    const res = await request(createApp()).get('/dev/personas');
    const guidance = res.text.indexOf('id="dev-personas-guidance"');
    const startHereAt = res.text.indexOf('id="dev-personas-start-here"');
    expect(guidance).toBeGreaterThan(-1);
    expect(guidance).toBeLessThan(startHereAt);
    const startHere = slugsIn(region(res.text, 'dev-personas-start-here', 'dev-personas-groups'));
    expect(startHere).toEqual(
      CANONICAL_PERSONAS.filter((p) => p.listing === 'start_here').map((p) => p.slug),
    );
    expect(startHere.length).toBeGreaterThanOrEqual(10);
  });

  // Defect caught: regression-only and blocked personas sit among the cards a
  // tester works through, or the collapsed section needs JavaScript to open.
  it('puts regression-only and blocked personas in one collapsed section at the bottom', async () => {
    const res = await request(createApp()).get('/dev/personas');
    const bottom = region(res.text, 'dev-personas-regression');
    expect(bottom.startsWith('id="dev-personas-regression"')).toBe(true);
    expect(res.text).toMatch(/<details[^>]*id="dev-personas-regression"/);
    const expected = CANONICAL_PERSONAS
      .filter((p) => p.listing === 'regression' || p.blockedBy).map((p) => p.slug).sort();
    expect(slugsIn(bottom).sort()).toEqual(expected);
    const middle = slugsIn(region(res.text, 'dev-personas-groups', 'dev-personas-regression'));
    expect(middle.filter((s) => expected.includes(s))).toEqual([]);
  });

  // Defect caught: a persona journey fails during a refresh and the tester
  // sees nothing, then trusts a card whose state was never built.
  it('names the personas whose journey failed, and only real catalog personas', async () => {
    const res = await request(createApp()).get('/dev/personas?journeys_failed=purged_member,not_a_persona');
    const banner = res.text.match(/<div class="form-error-banner" role="alert">([\s\S]*?)<\/div>/);
    expect(banner, 'a refusal banner is shown').not.toBeNull();
    expect(banner![1]).toContain('Perry Purged');
    expect(banner![1]).not.toContain('not_a_persona');
    const clean = await request(createApp()).get('/dev/personas');
    expect(clean.text).not.toContain('form-error-banner');
  });

  // Defect caught: once its journey erases the account (which clears the slug),
  // the erased persona's card greys out as never seeded, so the tester cannot
  // try its refused sign-in. Kept last: it erases a persona the cases above read.
  it('keeps an erased persona listed as seeded, with its Log In control', async () => {
    const { memberService } = await import('../../src/services/memberService');
    await memberService.purgeAccountPII('member_persona_purged_member');
    const res = await request(createApp()).get('/dev/personas');
    expect(res.text).toMatch(/\/dev\/login\?as(=|&#x3D;)purged_member\b/);
  });
});
