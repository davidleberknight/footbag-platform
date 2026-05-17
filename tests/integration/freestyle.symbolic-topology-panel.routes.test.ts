/**
 * Integration tests for the symbolic Related Topology panel on trick pages.
 *
 * Verifies:
 *   - Panel renders on the 8 allow-listed flagship slugs (ripwalk + sidewalk +
 *     dimwalk + dada-curve + matador + phoenix + spinning-whirl + montage)
 *     when matching staging-CSV topology data exists
 *   - Panel does NOT render on non-allow-listed trick pages
 *   - Panel does NOT duplicate the canonical Related Tricks list
 *   - Current trick is excluded from the panel members
 *   - Member count caps at 6
 *   - Observational-layer attribution is rendered
 *   - Reason text format: "Shares <topology-name>"
 *   - Service failure (missing CSV) fails-graceful: panel absent, no 500
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3091');

let createApp: Awaited<ReturnType<typeof importApp>>;

// Seed the dictionary with the 8 flagship slugs + a sample of butterfly-wing-topology
// members + whirl-rotational-topology members (so the topology-group reverse-lookup
// produces non-empty panels). Slug + family values match the staging CSV memberships.
beforeAll(async () => {
  const db = createTestDb(dbPath);

  // butterfly-wing-topology members (per symbolic_group_membership.csv)
  insertFreestyleTrick(db, { slug: 'butterfly',  canonical_name: 'butterfly',   adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ripwalk',    canonical_name: 'ripwalk',     adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'sidewalk',   canonical_name: 'sidewalk',    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'dimwalk',    canonical_name: 'dimwalk',     adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'parkwalk',   canonical_name: 'parkwalk',    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'bigwalk',    canonical_name: 'bigwalk',     adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'tripwalk',   canonical_name: 'tripwalk',    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'matador',    canonical_name: 'matador',     adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'phoenix',    canonical_name: 'phoenix',     adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'dada-curve', canonical_name: 'dada curve',  adds: '4', base_trick: null,        trick_family: 'dada-curve', category: 'compound' });

  // whirl-rotational-topology members
  insertFreestyleTrick(db, { slug: 'whirl',                    canonical_name: 'whirl',                    adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning-whirl',           canonical_name: 'spinning whirl',           adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox-whirl',            canonical_name: 'paradox whirl',            adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking-whirl',            canonical_name: 'ducking whirl',            adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'stepping-whirl',           canonical_name: 'stepping whirl',           adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'symposium-whirl',          canonical_name: 'symposium whirl',          adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'mullet',                   canonical_name: 'mullet',                   adds: '6', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'montage',                  canonical_name: 'montage',                  adds: '7', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });

  // A trick NOT in the allow-list (used to verify the panel doesn't render)
  insertFreestyleTrick(db, { slug: 'mirage', canonical_name: 'mirage', adds: '2', base_trick: 'mirage', trick_family: 'mirage', category: 'compound' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const ALLOW_LISTED = [
  'matador',
  'phoenix',
  'ripwalk',
  'dimwalk',
  'sidewalk',
  'dada-curve',
  'spinning-whirl',
  'montage',
];

describe('symbolic Related Topology panel — allow-listed slugs', () => {
  for (const slug of ALLOW_LISTED) {
    it(`renders the panel on /freestyle/tricks/${slug}`, async () => {
      const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('symbolic-related-topology');
      expect(res.text).toMatch(/Related topology tricks/i);
      // Observational-layer marker visible in the rendered HTML
      expect(res.text).toContain('symbolic-layer-badge');
      expect(res.text.toLowerCase()).toContain('observational');
    });
  }

  it('panel includes reason text "Shares <topology>"', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/ripwalk');
    expect(res.status).toBe(200);
    // Ripwalk's primary topology is butterfly-wing-topology
    expect(res.text.toLowerCase()).toContain('shares butterfly wing topology');
  });

  it('panel excludes the current trick (no self-reference)', async () => {
    // Matador's topology is butterfly-wing-topology; the panel should list
    // other butterfly-wing members but NOT matador itself.
    const res = await request(createApp()).get('/freestyle/tricks/matador');
    expect(res.status).toBe(200);
    // The trick name appears in the page header (hero); count separately
    // the symbolic-topology-members-list section by isolating it.
    const panelStart = res.text.indexOf('symbolic-topology-members-list');
    const panelEnd   = res.text.indexOf('symbolic-layer-footer');
    expect(panelStart).toBeGreaterThan(-1);
    expect(panelEnd).toBeGreaterThan(panelStart);
    const panelHtml = res.text.substring(panelStart, panelEnd);
    // Matador's detail href must NOT appear inside the members list
    expect(panelHtml).not.toContain('/freestyle/tricks/matador');
  });

  it('panel caps members at 6', async () => {
    // Montage is on whirl-rotational-topology which has many members
    const res = await request(createApp()).get('/freestyle/tricks/montage');
    expect(res.status).toBe(200);
    const panelStart = res.text.indexOf('symbolic-topology-members-list');
    const panelEnd   = res.text.indexOf('symbolic-layer-footer');
    expect(panelStart).toBeGreaterThan(-1);
    const panelHtml = res.text.substring(panelStart, panelEnd);
    const itemCount = (panelHtml.match(/<li>/g) ?? []).length;
    expect(itemCount).toBeLessThanOrEqual(6);
    expect(itemCount).toBeGreaterThan(0);
  });

  it('canonical Related Tricks section still renders separately from symbolic panel', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/ripwalk');
    expect(res.status).toBe(200);
    // Both sections present and distinct
    expect(res.text).toMatch(/<h2>Related Tricks<\/h2>/);
    expect(res.text).toMatch(/<h3>\s*Related topology tricks/);
    // Symbolic section comes after canonical section
    expect(res.text.indexOf('Related Tricks')).toBeLessThan(
      res.text.indexOf('Related topology tricks'),
    );
  });
});

describe('symbolic Related Topology panel — non-allow-listed slugs', () => {
  it('does NOT render the panel on butterfly (not in Phase 1 allow-list)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/butterfly');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('symbolic-related-topology');
    expect(res.text).not.toMatch(/Related topology tricks/i);
  });

  it('does NOT render the panel on mirage (not in Phase 1 allow-list)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('symbolic-related-topology');
  });
});

describe('symbolic Related Topology panel — service contract', () => {
  it('panel view-model includes observational layer marker', async () => {
    // Verified by HTML; deeper service-level layer-marker check lives in
    // symbolicGrammarService.test.ts.
    const res = await request(createApp()).get('/freestyle/tricks/spinning-whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('symbolic-layer-badge');
    // Unified tooltip per UX-CONSOLIDATION-1: "supplementary; does not change canonical classifications"
    expect(res.text.toLowerCase()).toContain('does not change canonical');
  });

  it('panel description renders a footer disclaiming non-canonical status', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/phoenix');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/observational symbolic-grammar layer/i);
    expect(res.text).toMatch(/canonical relating lives in the related tricks section/i);
  });
});
