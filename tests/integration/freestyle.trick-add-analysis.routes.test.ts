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

describe('Trick-detail Tier-4 ADD block — resolved-formula slugs', () => {
  // 2026-05-23 curator-rendered-output audit: the previously-collapsed
  // <details> disclosure was replaced with an expand-by-default <dl>
  // "ADD"-labeled row. The contract now mirrors the Notation Summary
  // card's ADD slot (visible-by-default labeled formula).

  it('renders the ADD block on paradox-mirage (non-first-class compound)', async () => {
    // Note: paradox-mirage may be first-class and render via the
    // Notation Summary instead; assert the derivation text is present
    // somewhere on the page rather than which container holds it.
    // Slice D 2026-05-26: trailing `= 3 ADD` is stripped on trick-detail
    // surfaces (the hero ADD chip is the authoritative total).
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/paradox\(\+1\) \+ mirage\(2\)/);
  });

  it('renders the curator-published derivation verbatim inside a <code> element', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    // Either the ADD-block dl OR the Notation Summary derivation slot
    // carries the derivation; assert presence within a <code> tag.
    expect(res.text).toMatch(
      /<code[^>]*>paradox\(\+1\) \+ mirage\(2\)<\/code>/,
    );
  });

  it('ADD block renders expand-by-default (no <details> collapse remaining)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    // The collapsed <details> pattern was retired 2026-05-23.
    expect(res.text).not.toMatch(/class="trick-add-analysis-disclosure"/);
    expect(res.text).not.toMatch(/Click to expand/);
  });

  it('does NOT render curator-internal provenance on the public page', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(res.text).not.toContain('canonical inventory');
    expect(res.text).not.toContain('+1 body modifier');
  });
});

describe('Trick-detail Tier-4 ADD block — silent suppression', () => {
  it('omits the ADD-analysis block entirely on mirage (core atom, no resolved formula)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-add-analysis-fields"/);
    expect(res.text).not.toMatch(/class="trick-add-analysis-derivation"/);
  });

  it('omits the ADD-analysis block entirely on whirl (core atom, no resolved formula)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-add-analysis-fields"/);
  });
});

describe('Trick-detail Tier-4 ADD-analysis disclosure — 4-tier hierarchy contract', () => {
  it('trick-detail ADD-analysis disclosure is absent from the dictionary browse view', async () => {
    // /freestyle/tricks is the By ADD ladder of registry cards; the
    // trick-detail Tier-4 executable-accounting disclosure renders only
    // on trick-detail pages, never on the browse ladder.
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-add-analysis-fields"/);
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
    // Slice D 2026-05-26: the `= 3 ADD` terminator is stripped from
    // trick-detail + first-class browse breakdowns, so this negative
    // assertion is now trivially satisfied; it still pins the contract
    // that the Tier-4 derivation-fields class is browse-card-forbidden.
    expect(sweep).not.toMatch(/paradox\(\+1\) \+ mirage\(2\) (=|&#x3D;) 3 ADD/);
    expect(sweep).not.toMatch(/class="trick-add-analysis-fields"/);
  });
});
