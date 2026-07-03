/**
 * Emerging Vocabulary — observational governance surface (/freestyle/observational).
 *
 * The page renders the nine-state distance-to-canonical ladder stamped on the
 * generated observational universe (src/content/freestyleObservationalUniverse.ts,
 * row field evState): ready for curation, needs authoring, awaiting doctrine,
 * awaiting curator review, awaiting identification, awaiting parser resolution,
 * undefined operator, folk / unrecoverable, alias archive. Every row is in
 * exactly one state; every rendered count comes from the generated data (the
 * service re-derives nothing at request time), and the nine sections partition
 * the universe exactly.
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
  // The ladder sections are content-module-driven. The external/unadjudicated
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

// The nine ladder states, closest to canonical publication first.
const LADDER_STATES = [
  'ready', 'authoring', 'doctrine', 'governance', 'identification',
  'parser', 'undefined_operator', 'folk', 'alias',
] as const;

const stateCount = (s: string): number =>
  OBSERVATIONAL_UNIVERSE.filter(r => r.evState === s).length;

describe('GET /freestyle/observational — nine-state ladder surface', () => {
  it('returns 200', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.status).toBe(200);
  });

  it('opens with the orientation line: this is the not-yet-official side of the canonical line', async () => {
    const html = await page();
    expect(html).toContain('waiting room of the freestyle dictionary');
    expect(html).toContain('Nothing on this page is an official trick yet');
    expect(html).toMatch(/how close each one is to publication/);
  });

  // ── The single-source-of-truth contract ──
  it('the nine states partition the universe: counts sum to the total with zero overlap', async () => {
    // Every row carries exactly one of the nine ladder states.
    for (const r of OBSERVATIONAL_UNIVERSE) {
      expect(LADDER_STATES.includes(r.evState as (typeof LADDER_STATES)[number]),
        `unknown evState "${r.evState}" on ${r.slug}`).toBe(true);
    }
    const sum = LADDER_STATES.reduce((n, s) => n + stateCount(s), 0);
    expect(sum).toBe(OBSERVATIONAL_UNIVERSE.length);
    expect(OBSERVATIONAL_UNIVERSE_STATS.total).toBe(OBSERVATIONAL_UNIVERSE.length);
  });

  it('every rendered section count equals the generated per-state count (no hardcoded magnitudes)', async () => {
    const html = await page();
    // Full card sections carry <h2> + section-count.
    const sectionCount = (title: string): number => {
      const m = html.match(new RegExp(`<h2>${title}</h2>\\s*<span class="section-count">(\\d+)</span>`));
      expect(m, `section "${title}" with count not found`).not.toBeNull();
      return Number(m![1]);
    };
    // Disclosure sections carry the count in the summary line.
    const disclosureCount = (label: string): number => {
      const m = html.match(new RegExp(`${label} <span class="text-muted">\\((\\d+)\\)</span>`));
      expect(m, `disclosure "${label}" with count not found`).not.toBeNull();
      return Number(m![1]);
    };
    expect(sectionCount('Ready for Curation')).toBe(stateCount('ready'));
    expect(sectionCount('Needs Authoring')).toBe(stateCount('authoring'));
    expect(sectionCount('Awaiting Doctrine')).toBe(stateCount('doctrine'));
    expect(sectionCount('Awaiting Curator Review')).toBe(stateCount('governance'));
    expect(sectionCount('Awaiting Identification')).toBe(stateCount('identification'));
    expect(disclosureCount('Awaiting parser resolution')).toBe(stateCount('parser'));
    expect(disclosureCount('Undefined operator')).toBe(stateCount('undefined_operator'));
    expect(disclosureCount('Folk / unrecoverable')).toBe(stateCount('folk'));
    expect(disclosureCount('Alias / duplicate archive')).toBe(stateCount('alias'));
  });

  it('the health tiles render one tile per ladder step 1-8, values from the generated data', async () => {
    const html = await page();
    expect(html).toContain('observed-stats');
    const tile = (label: string): number => {
      const m = html.match(new RegExp(
        `<span class="observed-stat-value">(\\d+)</span>\\s*<span class="observed-stat-label">${label}</span>`));
      expect(m, `tile "${label}" not found`).not.toBeNull();
      return Number(m![1]);
    };
    expect(tile('Ready for curation')).toBe(stateCount('ready'));
    expect(tile('Needs authoring')).toBe(stateCount('authoring'));
    expect(tile('Awaiting doctrine')).toBe(stateCount('doctrine'));
    expect(tile('Awaiting curator review')).toBe(stateCount('governance'));
    expect(tile('Awaiting identification')).toBe(stateCount('identification'));
    expect(tile('Awaiting parser resolution')).toBe(stateCount('parser'));
    expect(tile('Undefined operator')).toBe(stateCount('undefined_operator'));
    expect(tile('Folk / unrecoverable')).toBe(stateCount('folk'));
    // Aliases are NOT a frontier-health tile: a name that resolves to an existing
    // trick is not frontier work, so it lives only in the archive section.
    expect(html).not.toMatch(/observed-stat-label">Alias/);
  });

  it('renders the generator-computed progress metric, and its math checks out', async () => {
    const html = await page();
    const p = OBSERVATIONAL_UNIVERSE_STATS.evProgress;
    // The generated metric is internally consistent with the row data.
    expect(p.numerator).toBe(stateCount('ready') + stateCount('authoring'));
    expect(p.denominator).toBe(OBSERVATIONAL_UNIVERSE.length - stateCount('alias'));
    expect(p.pct).toBe(Math.round((100 * p.numerator) / p.denominator));
    // The page renders exactly the generated numbers.
    expect(html).toContain(
      `${p.pct}% of the non-alias frontier (${p.numerator} of ${p.denominator} names) ` +
      'is a candidate or one authoring step away.');
  });

  it('sections render in ladder order, closest to canonical first', async () => {
    const html = await page();
    const anchors = [
      'id="ready-for-curation"', 'id="needs-authoring"', 'id="awaiting-doctrine"',
      'id="awaiting-curator-review"', 'id="awaiting-identification"',
      'id="awaiting-parser-resolution"', 'id="undefined-operator"',
      'id="folk-names"', 'id="alias-archive"',
    ];
    const positions = anchors.map(a => html.indexOf(a));
    for (let i = 0; i < anchors.length; i++) {
      expect(positions[i], `${anchors[i]} missing`).toBeGreaterThan(-1);
    }
    for (let i = 1; i < anchors.length; i++) {
      expect(positions[i]!, `${anchors[i]} out of ladder order`).toBeGreaterThan(positions[i - 1]!);
    }
  });

  it('groups Ready for Curation + Needs Authoring by derived ADD (lowest first, extrapolated label)', async () => {
    const html = await page();
    expect(html).toContain('observed-eco-group');
    // ADD-group headings carry the derived ADD (or the trailing ADD Unknown group).
    expect(html).toMatch(/observed-eco-heading">(\d+ ADD|ADD Unknown)/);
    // Provisional ADD stays labelled extrapolated, never canonical.
    expect(html).toMatch(/ADD \d+ \(extrapolated\)/);
    // Within each card section, numeric ADD groups ascend (ADD Unknown sorts last).
    for (const [from, to] of [
      ['id="ready-for-curation"', 'id="needs-authoring"'],
      ['id="needs-authoring"', 'id="awaiting-doctrine"'],
    ] as const) {
      const block = html.slice(html.indexOf(from), html.indexOf(to));
      const heads = [...block.matchAll(/observed-eco-heading">(\d+ ADD|ADD Unknown)/g)].map(m => m[1]!);
      expect(heads.length, `${from} has no ADD groups`).toBeGreaterThan(0);
      const nums = heads.filter(h => h !== 'ADD Unknown').map(h => Number.parseInt(h, 10));
      expect(nums).toEqual([...nums].sort((a, b) => a - b));
      if (heads.includes('ADD Unknown')) {
        expect(heads[heads.length - 1]).toBe('ADD Unknown');
      }
    }
  });

  // ── Doctrine-hold copy reflects the CURRENT open questions ──
  it('the doctrine section names the live gates and drops the stale weaving framing', async () => {
    const html = await page();
    // The current expert-ruling gates.
    expect(html).toMatch(/blurry-named trick carries the extra paradox element/);
    expect(html).toMatch(/terraging chain/);
    expect(html).toMatch(/cross-body rake base/);
    expect(html).toMatch(/repeated operator inside one compound/);
    expect(html).toMatch(/side conventions for foundational positions/);
    // The page must not claim weaving as the one open doctrine blocker:
    // weaving compounds author mechanically from their ducking mirrors.
    expect(html).not.toMatch(/Weaving is the one movement operator still awaiting a ruling/);
    expect(html).not.toContain('Doctrine &amp; Curator Holds');
    // No rendered category names the rules expert directly.
    expect(html).not.toContain('Red doctrine');
    expect(html).not.toContain('Awaiting Ruling');
  });

  it('curator review and identification are separate ladder steps with their own framing', async () => {
    const html = await page();
    expect(html).toMatch(/editorial or verification call/);
    expect(html).toMatch(/down-family names awaiting a per-trick check/);
    expect(html).toMatch(/which movement it refers to is not yet confirmed/);
  });

  it('keeps the count framing honest and the intake buckets reconciled', async () => {
    const html = await page();
    expect(html).toMatch(/duplicates a published canonical trick/);
    expect(html).not.toMatch(/observational tricks/i);
    const ib = OBSERVATIONAL_UNIVERSE_STATS.intakeBuckets;
    const sum = Object.values(ib).reduce((a, b) => a + b.names, 0);
    expect(sum).toBe(OBSERVATIONAL_UNIVERSE_STATS.total);
  });

  it('surfaces the alias archive and long-tail steps collapsed, with the ecosystem matrix demoted', async () => {
    const html = await page();
    expect(html).toContain('Alias / duplicate archive');
    expect(html).toContain('observed-disclosure');
    expect(html).toContain('observed-fulllist');
    expect(html).toContain('Show all');
    expect(html).toContain('observed-matrix');
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
  it('surfaces in-DB external/unadjudicated rows in their own section, outside the ladder counts', async () => {
    const html = await page();
    expect(html).toContain('External / unadjudicated (database-tracked)');
    expect(html).toContain('id="external-unadjudicated"');
    // The seeded external rows appear by name.
    expect(html).toContain('pending zorblax');
    expect(html).toContain('pending quasar');
    // They carry the tracked tag, never a canonical trick-detail link.
    expect(html).not.toMatch(/href="\/freestyle\/tricks\/pending-zorblax"/);
    // And they are not universe rows, so the ladder never double-counts them.
    expect(OBSERVATIONAL_UNIVERSE.some(r => r.slug === 'pending-zorblax')).toBe(false);
  });
});
