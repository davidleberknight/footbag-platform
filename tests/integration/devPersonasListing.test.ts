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
 * The route renders the in-memory canonical catalog (no DB read), so the
 * assertions below check the rendered catalog directly against CANONICAL_PERSONAS.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';

const { dbPath } = setTestEnv('3437');

// Full, valid FOOTBAG_ENV=staging baseline. Staging requires NODE_ENV=production
// (production-hardening parity), SES_ADAPTER=stub (non-prod must not send real
// mail), and PAYMENT_ADAPTER=live (stub is forbidden once NODE_ENV=production;
// the live adapter is lazy and never constructed by this route, so it stays
// inert). The remaining stub adapters + JWT_SIGNER=local keep boot off AWS.
const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
const PRIOR_NODE_ENV = process.env.NODE_ENV;
process.env.NODE_ENV                  = 'production';
process.env.FOOTBAG_ENV               = 'staging';
process.env.SESSION_SECRET            = 'a'.repeat(48);
process.env.JWT_SIGNER                = 'local';
process.env.SES_ADAPTER               = 'stub';
process.env.SES_FROM_IDENTITY         = 'noreply@test.example.com';
process.env.AWS_REGION                = 'us-east-1';
process.env.SAFE_BROWSING_ADAPTER     = 'stub';
process.env.HTTP_REACHABILITY_ADAPTER = 'stub';
process.env.SECRETS_ADAPTER           = 'stub';
process.env.IMAGE_PROCESSOR_URL       = 'http://image:4000';
process.env.MEDIA_STORAGE_ADAPTER     = 'local';
process.env.PAYMENT_ADAPTER           = 'live';
process.env.STRIPE_WEBHOOK_SECRET     = 'whsec_live_realvalue';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
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
  it('boots under FOOTBAG_ENV=staging', () => {
    expect(createApp()).toBeTypeOf('function');
  });

  it('renders 200 and lists every canonical persona with a Switch link', async () => {
    const res = await request(createApp()).get('/dev/personas');
    expect(res.status).toBe(200);
    for (const spec of CANONICAL_PERSONAS) {
      expect(res.text).toContain(spec.slug);
      // Handlebars HTML-escapes the `=` in the href to &#x3D;; match either form.
      expect(res.text).toMatch(new RegExp(`/dev/switch\\?as(=|&#x3D;)${spec.slug}\\b`));
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

  it('renders an authorization role beyond admin/member (club leader reads as a leader)', async () => {
    const res = await request(createApp()).get('/dev/personas');
    const leader = CANONICAL_PERSONAS.find((p) => p.club?.leader || p.club?.role);
    expect(leader, 'catalog should include at least one club-leader persona').toBeDefined();
    expect(res.text).toContain('club leader');
  });

  it('groups personas under their authorization-axis headings', async () => {
    const res = await request(createApp()).get('/dev/personas');
    const dimensions = new Set(
      CANONICAL_PERSONAS.map((p) => p.dimension).filter((d): d is string => Boolean(d)),
    );
    expect(dimensions.size).toBeGreaterThan(1);
    for (const dimension of dimensions) {
      // Handlebars HTML-escapes '&' in headings to '&amp;'.
      expect(res.text).toContain(dimension.replace(/&/g, '&amp;'));
    }
  });
});
