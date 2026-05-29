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

const { dbPath } = setTestEnv('3220');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  // Content-module-driven; no DB seeding needed. Empty DB is sufficient.
  createTestDb(dbPath).close();
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

  it('renders the three-layer ontology banner (canonical / frontier / archive)', async () => {
    const html = await page();
    expect(html).toContain('observed-stats');
    expect(html).toContain('observed-stat-value');
    expect(html).toContain('Canonical tricks');
    expect(html).toContain('Promotion frontier');
    expect(html).toContain('Lexical archive');
    // The three layer values come straight from the generated stats.
    expect(html).toContain(String(OBSERVATIONAL_UNIVERSE_STATS.canonicalOntology));
    expect(html).toContain(String(OBSERVATIONAL_UNIVERSE_STATS.promotionFrontier));
    expect(html).toContain(String(OBSERVATIONAL_UNIVERSE_STATS.lexicalArchive));
  });

  it('frames the promotion frontier as a substantial governed expansion program', async () => {
    const html = await page();
    expect(html).toMatch(/mature canonical ontology with a substantial, governed expansion frontier/);
    expect(html).toMatch(/mechanically coherent candidate structures/);
    expect(html).toMatch(/governed expansion\s+program, not a cleanup queue/);
    // Frontier = promotion_ready + doctrine_pending + unresolved_candidate (distinct).
    const ib = OBSERVATIONAL_UNIVERSE_STATS.intakeBuckets;
    const frontierDistinct = ib.promotion_ready.distinctStructures
      + ib.doctrine_pending.distinctStructures
      + ib.unresolved_candidate.distinctStructures;
    expect(frontierDistinct).toBe(OBSERVATIONAL_UNIVERSE_STATS.promotionFrontier);
    // The 8 intake buckets reconcile (by names) to the intake total.
    const sum = Object.values(ib).reduce((a, b) => a + b.names, 0);
    expect(sum).toBe(OBSERVATIONAL_UNIVERSE_STATS.total);
  });

  it('frames counts honestly: the archive is documented vocabulary, never unique tricks', async () => {
    const html = await page();
    // The archive is explicitly not unique tricks.
    expect(html).toMatch(/documented vocabulary, not unique tricks|not unique tricks/);
    // Aliases, duplicates, single-source noise stay OUT of the frontier.
    expect(html).toMatch(/collapse\s+to an existing trick/);
    expect(html).toMatch(/single-source uncorroborated names/);
    // Never present a lexical total as "tricks".
    expect(html).not.toMatch(/observational tricks/i);
    expect(html).not.toMatch(/\b1701\s+tricks/i);
  });

  it('renders Ready-for-Promotion grouped by ecosystem with confidence cards', async () => {
    const html = await page();
    expect(html).toContain('id="ready-for-promotion"');
    expect(html).toContain('observed-eco-group');
    expect(html).toContain('observed-eco-heading');
    expect(html).toContain('observed-card');
    // Confidence is surfaced, parser and doctrine kept separate.
    expect(html).toContain('observed-conf');
    expect(html).toMatch(/parser:\s*(high|medium|low)/);
    // Provisional ADD is labelled extrapolated, never as canonical ADD.
    expect(html).toContain('(extrapolated, not canonical)');
    expect(html).toMatch(/ADD \d+ \(extrapolated\)/);
  });

  it('renders the ecosystem frontier matrix', async () => {
    const html = await page();
    expect(html).toContain('id="ecosystem-frontiers"');
    expect(html).toContain('observed-matrix');
    expect(html).toContain('Ecosystem');
  });

  it('renders Doctrine Bottlenecks as clusters with a blocking question', async () => {
    const html = await page();
    expect(html).toContain('id="doctrine-bottlenecks"');
    expect(html).toContain('observed-cluster');
    expect(html).toContain('Blurry / Furious');
    expect(html).toContain('rotational bases');
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
});
