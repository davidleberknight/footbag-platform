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

  it('renders the statistics banner reflecting the classified universe', async () => {
    const html = await page();
    expect(html).toContain('observed-stats');
    expect(html).toContain('observed-stat-value');
    expect(html).toContain('Unresolved structures');
    expect(html).toContain('Intake queue');
    expect(html).toContain('Aliases &amp; duplicates');
    expect(html).toContain('Doctrine-blocked');
    expect(html).toContain('Canonical published');
    // The headline total comes straight from the generated stats.
    expect(html).toContain(String(OBSERVATIONAL_UNIVERSE_STATS.total));
  });

  it('surfaces the Phase-1 intake-bucket frontier metric (unresolved unique structures)', async () => {
    const html = await page();
    // The scholarly frontier metric: distinct genuinely-unresolved structures.
    expect(html).toContain(String(OBSERVATIONAL_UNIVERSE_STATS.unresolvedStructures));
    expect(html).toMatch(/no canonical home yet/);
    // The statsNote tells the collapse story: tracked names -> a small frontier.
    expect(html).toMatch(/genuinely unresolved unique structures/);
    expect(html).toMatch(/collapse to an existing trick/);
    // The 7 buckets reconcile to the intake total.
    const ib = OBSERVATIONAL_UNIVERSE_STATS.intakeBuckets;
    const sum = Object.values(ib).reduce((a, b) => a + b.names, 0);
    expect(sum).toBe(OBSERVATIONAL_UNIVERSE_STATS.total);
  });

  it('frames counts honestly per the unique-trick doctrine (lexical totals are never tricks)', async () => {
    const html = await page();
    // The intake-queue size is labelled as tracked names under review, not tricks.
    expect(html).toMatch(/tracked names under review, not unique tricks/);
    // The published count is paired with distinct-structure context (name vs structure).
    expect(html).toMatch(/distinct structures/);
    // Explicit "not unique tricks" disclaimer accompanies the visible lexical totals.
    expect(html).toMatch(/documented names, not unique tricks/);
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
