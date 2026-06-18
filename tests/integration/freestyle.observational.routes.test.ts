/**
 * Emerging Vocabulary — observational governance surface (/freestyle/observational).
 *
 * The page derives mechanically from the generated observational universe
 * (src/content/freestyleObservationalUniverse.ts), which is overlap-safe by
 * construction (in_db=false, governance_state∉{1,2}). It renders as a
 * governance surface: a statistics banner, a Ready-for-Promotion section
 * grouped by ecosystem with confidence cards, doctrine-bottleneck clusters,
 * and summarized folk-name / parser-uncertainty sections with full lists
 * behind disclosure.
 *
 * Layer-separation contract (asserted below): observational entries carry a
 * tracked tag, NOT a canonical hashtag; they NEVER link to a canonical trick
 * detail page; provisional ADD is labelled "extrapolated", never canonical.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  OBSERVATIONAL_UNIVERSE,
  OBSERVATIONAL_UNIVERSE_STATS,
} from '../../src/content/freestyleObservationalUniverse';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3220');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  // The frontier sections are content-module-driven. The external/unadjudicated
  // section reads the DB, so seed a couple of in-DB external placeholders
  // (is_active=0 + review_status='pending') to exercise it.
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'pending-zorblax', canonical_name: 'pending zorblax', adds: '4',
    category: 'compound', review_status: 'pending', is_active: 0,
  });
  insertFreestyleTrick(db, {
    slug: 'pending-quasar', canonical_name: 'pending quasar', adds: '',
    category: 'compound', review_status: 'pending', is_active: 0,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function page(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/observational');
  expect(res.status).toBe(200);
  return res.text;
}

describe('GET /freestyle/observational — governance surface', () => {
  it('returns 200', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.status).toBe(200);
  });

  it('renders the six frontier-health metrics (status-first; no ecosystem stats)', async () => {
    const html = await page();
    expect(html).toContain('observed-stats');
    expect(html).toContain('observed-stat-value');
    for (const label of ['Awaiting Ruling', 'Needs Authoring', 'Doctrine Blocked',
                         'Folk / Unresolved', 'Alias / Duplicate', 'Structurally Understood']) {
      expect(html).toContain(label);
    }
    // The prior ecosystem-centric stat labels are gone.
    expect(html).not.toContain('Lexical archive');
    expect(html).not.toContain('Canonical tricks');
    // % structurally understood is shown.
    expect(html).toMatch(/\d+%/);
  });

  it('makes Awaiting Ruling the first content section, above the metric strip', async () => {
    const html = await page();
    const readyIdx = html.indexOf('id="promotion-ready"');
    const metricsIdx = html.indexOf('observed-stats');
    expect(readyIdx).toBeGreaterThan(-1);
    expect(readyIdx).toBeLessThan(metricsIdx);
  });

  it('keeps the count framing honest and the intake buckets reconciled', async () => {
    const html = await page();
    expect(html).toMatch(/duplicates a published canonical trick/);
    expect(html).not.toMatch(/observational tricks/i);
    const ib = OBSERVATIONAL_UNIVERSE_STATS.intakeBuckets;
    const sum = Object.values(ib).reduce((a, b) => a + b.names, 0);
    expect(sum).toBe(OBSERVATIONAL_UNIVERSE_STATS.total);
  });

  it('groups Awaiting Ruling + Needs Authoring by derived ADD (lowest first, Unknown last)', async () => {
    const html = await page();
    expect(html).toContain('id="promotion-ready"');
    expect(html).toContain('id="needs-authoring"');
    expect(html).toContain('observed-eco-group');
    // ADD-group headings replace ecosystem headings.
    expect(html).toMatch(/observed-eco-heading">\d+ ADD/);
    // Provisional ADD stays labelled extrapolated, never canonical.
    expect(html).toMatch(/ADD \d+ \(extrapolated\)/);
    // Lowest ADD precedes higher ADD inside Awaiting Ruling.
    const block = html.slice(html.indexOf('id="promotion-ready"'), html.indexOf('observed-stats'));
    const nums = [...block.matchAll(/observed-eco-heading">(\d+) ADD/g)].map(m => Number(m[1]));
    expect(nums.length).toBeGreaterThan(0);
    expect(nums).toEqual([...nums].sort((a, b) => a - b));
  });

  it('preserves Doctrine Blocked as clusters with a blocking question', async () => {
    const html = await page();
    expect(html).toContain('id="doctrine-blocked"');
    expect(html).toContain('observed-cluster');
    // Blocker-precise clusters: blurry is split from furious (furious is resolved
    // and no longer a blocker), and DOD/DDD is its own card.
    expect(html).toContain('Blurry transitivity');
    expect(html).toContain('DOD / DDD policy');
  });

  it('surfaces the Alias / Duplicate archive collapsed, with the ecosystem matrix demoted to a disclosure', async () => {
    const html = await page();
    expect(html).toContain('Alias / duplicate archive');
    expect(html).toContain('id="alias-archive"');
    expect(html).toContain('observed-disclosure');
    // The ecosystem matrix is now a collapsible, not a primary section.
    expect(html).toContain('observed-matrix');
  });

  it('renders folk + parser summary sections with full lists behind disclosure', async () => {
    const html = await page();
    expect(html).toContain('id="folk-unresolved"');
    expect(html).toContain('id="parser-uncertainty"');
    expect(html).toContain('observed-fulllist');
    expect(html).toContain('Show all');
  });

  // ── Overlap-safety / layer-separation guard ──
  it('never emits a canonical hashtag chip or a canonical trick-detail link', async () => {
    const html = await page();
    // Observational entries use a tracked tag, never a canonical #hashtag chip.
    expect(html).toContain('tracked-tag');
    expect(html).not.toContain('hero-hashtag');
    // No entry links into a canonical trick DETAIL page (/freestyle/tricks/<slug>).
    // The canonical cross-links point at the index (/freestyle/tricks) only.
    expect(html).not.toMatch(/href="\/freestyle\/tricks\/[a-z]/);
  });

  it('the generated universe is overlap-safe: only unresolved-observational sections', async () => {
    const allowed = new Set(['ready', 'frontier', 'doctrine', 'folk', 'parser']);
    for (const row of OBSERVATIONAL_UNIVERSE) {
      expect(allowed.has(row.section)).toBe(true);
    }
    // Sanity: the universe is non-empty and the stats know the canonical layer
    // exists separately (so the surface is a true subset, not the whole world).
    expect(OBSERVATIONAL_UNIVERSE.length).toBeGreaterThan(0);
    expect(OBSERVATIONAL_UNIVERSE_STATS.canonicalPublished).toBeGreaterThan(0);
    expect(OBSERVATIONAL_UNIVERSE_STATS.total).toBe(OBSERVATIONAL_UNIVERSE.length);
  });

  // ── External / unadjudicated in-DB entries (Emerging Vocabulary home) ──
  it('surfaces in-DB external/unadjudicated rows in their own section', async () => {
    const html = await page();
    expect(html).toContain('External / unadjudicated (database-tracked)');
    expect(html).toContain('id="external-unadjudicated"');
    // The seeded external rows appear by name.
    expect(html).toContain('pending zorblax');
    expect(html).toContain('pending quasar');
    // They carry the tracked tag, never a canonical trick-detail link.
    expect(html).not.toMatch(/href="\/freestyle\/tricks\/pending-zorblax"/);
  });
});
