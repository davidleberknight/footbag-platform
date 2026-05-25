/**
 * Integration tests for the default trick-dictionary surface at
 * /freestyle/tricks.
 *
 * Phase D (2026-05-22): the prior six-card browse-mode "gate" was
 * removed. /freestyle/tricks now opens directly on the By ADD ladder —
 * real tricks immediately. Advanced browse modes (Family, Movement
 * System, Movement Neighborhoods, Operators, Observed Tricks) are
 * reachable from a secondary view-toggle, not a gate. There is no
 * coverage / governance block and no publication-state stat strip.
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
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3120');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Two active tricks at different ADD values + one modifier.
  insertFreestyleTrick(db, {
    slug:           'mirage',
    canonical_name: 'mirage',
    adds:           '2',
    base_trick:     'mirage',
    trick_family:   'mirage',
    category:       'dex',
  });
  insertFreestyleTrick(db, {
    slug:           'whirl',
    canonical_name: 'whirl',
    adds:           '3',
    base_trick:     'whirl',
    trick_family:   'whirl',
    category:       'dex',
  });
  insertFreestyleTrickModifier(db, {
    slug:          'paradox',
    modifier_name: 'paradox',
    add_bonus:     1,
    modifier_type: 'body',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks — default By ADD ladder', () => {
  it('returns 200 and opens directly on the ADD browse view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    // The browse-view chain renders immediately — no gate.
    expect(res.text).toContain('class="trick-view-toggle"');
    expect(res.text).toMatch(/class="trick-view-toggle-active">By ADD</);
    // Real tricks shown immediately as dictionary cards.
    expect(res.text).toContain('data-trick-slug=');
  });

  it('does not render the retired browse-mode gate', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).not.toContain('class="landing-card-grid"');
    expect(res.text).not.toContain('class="landing-stat-strip"');
    expect(res.text).not.toContain('class="landing-primer-callout"');
    expect(res.text).not.toContain('data-card-slug=');
  });

  it('opens with the plain movement-first dictionary intro + glossary link', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).toContain('class="browse-view-intro"');
    // 2026-05-24 governance/polish slice: vague "vast and growing movement
    // vocabulary" replaced with a dynamic canonical-tricks count. Assertion
    // updated to match new "{N} canonical tricks documented to date" prose.
    expect(res.text).toMatch(/\d+ canonical tricks documented to date/);
    expect(res.text).toContain('class="dictionary-intro-glossary-link"');
    expect(res.text).toContain('href="/freestyle/glossary"');
  });

  it('does not render the coverage / governance block', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).not.toContain('class="trick-coverage-summary"');
    expect(res.text).not.toContain('class="dict-note"');
    expect(res.text).not.toContain('shown for transparency');
    // 2026-05-24: the "no lead count" assertion was reversed by the
    // governance/polish slice — dynamic canonical-trick counts now ARE
    // surfaced in the dictionary intro (replacing vague "hundreds of
    // named tricks" prose).
  });

  it('the view-toggle offers every browse system as secondary navigation', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const navStart = res.text.indexOf('class="trick-view-toggle"');
    const navEnd = res.text.indexOf('</nav>', navStart);
    expect(navStart).toBeGreaterThan(-1);
    const nav = res.text.slice(navStart, navEnd);
    expect(nav).toContain('By ADD');
    expect(nav).toContain('By family');
    expect(nav).toContain('By movement system');
    expect(nav).toContain('Movement Neighborhoods');
    // 2026-05-24 governance/polish slice: "By set" added as a primary
    // browse axis; "Operators & Modifiers" REMOVED from the toggle row
    // (operators/modifiers are reference vocabulary, not a dictionary
    // grouping axis). The /freestyle/operators reference page is still
    // reachable via the aside line below the toggle.
    expect(nav).toContain('By set');
    expect(nav).not.toContain('href="/freestyle/operators"');
    // 2026-05-23: the duplicate Observed Tricks link was removed from
    // the dictionary browse strip. Observed Tricks remains reachable
    // from the freestyle landing's Go Deeper card.
    expect(nav).not.toContain('href="/freestyle/observational"');
    // The retired "‹ Dictionary" back-link is gone.
    expect(nav).not.toContain('trick-view-toggle-back');
  });

  it('Operators & Modifiers reference link is preserved in the toggle aside (not in the toggle nav)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    // Operators & Modifiers stays reachable via an explanatory aside line
    // BELOW the toggle row, framed as reference vocabulary.
    expect(res.text).toContain('trick-view-toggle-aside');
    expect(res.text).toContain('href="/freestyle/operators"');
    // The aside text explicitly frames it as not-a-dictionary-axis.
    expect(res.text).toContain('not a dictionary browse axis');
  });

  it('groups tricks by ADD value, with the gentlest first', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const twoIdx   = res.text.indexOf('2 ADD');
    const threeIdx = res.text.indexOf('3 ADD');
    expect(twoIdx).toBeGreaterThan(-1);
    expect(threeIdx).toBeGreaterThan(twoIdx);
    expect(res.text).toContain('data-trick-slug="mirage"');
    expect(res.text).toContain('data-trick-slug="whirl"');
  });
});

describe('GET /freestyle/tricks — browse views', () => {
  it('?view=add renders the same ADD ladder', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="trick-view-toggle-active">By ADD</);
  });

  it('?view=family renders the family browse view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="trick-view-toggle-active">By family</);
  });

  it('?family= renders the family-filtered view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?family=whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="trick-view-toggle"');
    expect(res.text).toContain('family-filter-pill');
  });

  it('an unknown ?view= falls back to the ADD ladder', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=nonsense');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="trick-view-toggle-active">By ADD</);
  });
});
