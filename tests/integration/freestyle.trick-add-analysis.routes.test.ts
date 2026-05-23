/**
 * Integration tests for Tier-4 ADD-analysis disclosure on trick-detail
 * pages (/freestyle/tricks/:slug).
 *
 * Contract:
 *   - The disclosure renders only for slugs in
 *     src/content/freestyleResolvedFormulas.ts (RESOLVED_FORMULAS_SPRINT_1).
 *   - Slugs without a curator-published resolved formula render the
 *     detail page silently (no disclosure section). This is the
 *     Tier-3 silent-absence contract.
 *   - The disclosure exposes ONLY the human-readable `derivation` line
 *     and the `totalAdd` value; provenance is curator-internal and
 *     never renders publicly.
 *   - Tier-4 patterns ('paradox(+1) + mirage(2) = 3 ADD', xbody(N),
 *     dex(N), stall(N), spin(N)) remain forbidden on browse cards and
 *     landing (verified by sibling test files
 *     freestyle.portal.routes.test.ts +
 *     freestyle.dictionary-trick-card.routes.test.ts).
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

const { dbPath } = setTestEnv('3140');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // paradox-mirage: in RESOLVED_FORMULAS_SPRINT_1 with derivation
  // 'paradox(+1) + mirage(2) = 3 ADD'. Trick-detail must render the
  // Tier-4 disclosure.
  insertFreestyleTrick(db, {
    slug: 'paradox-mirage',
    canonical_name: 'paradox mirage',
    trick_family: 'mirage',
    category: 'compound',
    adds: '3',
    is_active: 1,
  });

  // mirage: NOT in resolved-formulas (it is the 2-ADD core atom, not a
  // compound). Trick-detail must render WITHOUT the disclosure
  // (Tier-3 silent suppression).
  insertFreestyleTrick(db, {
    slug: 'mirage',
    canonical_name: 'mirage',
    trick_family: 'mirage',
    category: 'dex',
    adds: '2',
    is_active: 1,
  });

  // whirl: NOT in resolved-formulas. Same Tier-3 silent contract.
  insertFreestyleTrick(db, {
    slug: 'whirl',
    canonical_name: 'whirl',
    trick_family: 'whirl',
    category: 'dex',
    adds: '3',
    is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Trick-detail Tier-4 ADD-analysis disclosure — resolved-formula slugs', () => {
  it('renders the disclosure section on paradox-mirage', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="trick-add-analysis-disclosure"/);
  });

  it('renders the curator-published derivation verbatim', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    // Handlebars HTML-escapes '=' as '&#x3D;'; otherwise the derivation
    // renders verbatim from the resolved-formulas content module.
    expect(res.text).toMatch(
      /class="trick-add-analysis-derivation"[^>]*>\s*<code>paradox\(\+1\) \+ mirage\(2\) &#x3D; 3 ADD<\/code>/,
    );
  });

  it('renders the total ADD value in the disclosure summary', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    // The summary label includes the integer total ('How this 3-ADD total breaks down').
    expect(res.text).toMatch(
      /class="trick-add-analysis-summary-title"[^>]*>\s*How this 3-ADD total breaks down/,
    );
  });

  it('disclosure is collapsed by default (no [open] attribute)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    // No open attribute should appear on the disclosure on initial render.
    expect(res.text).not.toMatch(/class="trick-add-analysis-disclosure"\s+open/);
    expect(res.text).not.toMatch(/<details[^>]+class="trick-add-analysis-disclosure"[^>]*\sopen/);
  });

  it('does NOT render curator-internal provenance on the public page', async () => {
    // The ResolvedFormula.provenance field carries curator-audit
    // language ("canonical inventory", "pt6 2026-05-04", "Red", etc.)
    // and must NEVER reach a public trick-detail page.
    // paradox-mirage's provenance string starts with "paradox = +1 body modifier".
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(res.text).not.toContain('canonical inventory');
    expect(res.text).not.toContain('+1 body modifier');
  });
});

describe('Trick-detail Tier-4 ADD-analysis disclosure — silent suppression', () => {
  it('omits the disclosure entirely on mirage (core atom, no resolved formula)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-add-analysis-disclosure"/);
    expect(res.text).not.toMatch(/class="trick-add-analysis-summary-title"/);
  });

  it('omits the disclosure entirely on whirl (core atom, no resolved formula)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-add-analysis-disclosure"/);
  });
});

describe('Trick-detail Tier-4 ADD-analysis disclosure — 4-tier hierarchy contract', () => {
  it('trick-detail ADD-analysis disclosure is absent from the dictionary browse view', async () => {
    // /freestyle/tricks is the By ADD ladder of registry cards; the
    // trick-detail Tier-4 executable-accounting disclosure renders only
    // on trick-detail pages, never on the browse ladder.
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-add-analysis-disclosure"/);
  });

  it('Tier-4 derivation pattern absent from /freestyle/tricks?view=add browse OUTSIDE first-class cards', async () => {
    // Note: as of the FC pilot (2026-05-19), the compact first-class
    // secondary row deliberately renders ADD-breakdown patterns on the
    // 5 pilot browse cards (osis / paradox-mirage / symposium-mirage /
    // atomic-butterfly / ripwalk). The contract still forbids Tier-4
    // patterns on the general non-first-class cohort. We strip the
    // first-class card regions before sweeping for leakage.
    const FIRST_CLASS_PILOT_SLUGS = ['osis', 'paradox-mirage', 'symposium-mirage', 'atomic-butterfly', 'ripwalk'];
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    let sweep = res.text;
    for (const slug of FIRST_CLASS_PILOT_SLUGS) {
      sweep = sweep.replace(new RegExp(`<article[^>]*data-trick-slug="${slug}"[\\s\\S]*?</article>`, 'g'), '');
    }
    expect(sweep).not.toMatch(/paradox\(\+1\) \+ mirage\(2\) (=|&#x3D;) 3 ADD/);
    expect(sweep).not.toMatch(/class="trick-add-analysis-disclosure"/);
  });
});
