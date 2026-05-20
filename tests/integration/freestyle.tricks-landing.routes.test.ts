/**
 * Integration tests for the dictionary landing surface on /freestyle/tricks
 * (CR-1 of exploration/dictionary-coherence-2026-05-18/).
 *
 * Surface contract under test:
 *   - GET /freestyle/tricks (no ?view=, no ?family=) renders the
 *     landing template (NOT the browse-view chain).
 *   - All six browse cards render (ADD / Family / Movement System /
 *     Movement Neighborhoods / Observed Tricks / Operators & Components).
 *   - Cards 4 + 5 (Movement Neighborhoods + Observed Tricks) carry the
 *     observational badge; cards 1-3 + 6 do not.
 *   - Movement System card (card 3) carries the Footbag Sets sub-link
 *     deep-linking to the movement-axis-set-uptime anchor.
 *   - Observed Tricks card (card 5) hrefs to /freestyle/observational.
 *   - Glossary primer callout ("New to the notation?") renders adjacent
 *     to the operators card.
 *   - Notation philosophy paragraph renders.
 *   - Stat row renders 3 chips: canonical / observational / modifiers.
 *   - "Back to Dictionary" link prepended to the view-toggle row on
 *     browse views (regression check that the landing is reachable from
 *     any browse view).
 *   - GET /freestyle/tricks?view=add still renders the ADD browse view
 *     (regression on the controller branch).
 *   - GET /freestyle/tricks?family=whirl still renders the family-
 *     filtered browse view (no landing inadvertently triggered).
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

  // Minimal seed: two active tricks + one modifier so the stat row has
  // non-zero counts. The landing renders independently of trick volume;
  // these exist so the controller branch test (?view=add) below
  // produces a non-empty page.
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

describe('GET /freestyle/tricks — dictionary landing surface', () => {
  it('returns 200 and renders the landing markup (not the browse-view chain)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    // Landing-specific container (composed with .wrapper).
    expect(res.text).toContain('dictionary-landing');
    // Landing-only structural surfaces.
    expect(res.text).toContain('class="landing-card-grid"');
    expect(res.text).toContain('class="landing-stat-strip"');
    expect(res.text).toContain('class="landing-primer-callout"');
    expect(res.text).toContain('class="notation-philosophy"');
    // Browse-view scaffolding does NOT render on landing.
    expect(res.text).not.toContain('class="trick-view-toggle"');
    expect(res.text).not.toContain('data-trick-slug=');
  });

  it('renders all six browse cards in order', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const expectedOrder = ['add', 'family', 'movement-system', 'neighborhoods', 'observed', 'operators'];
    const positions = expectedOrder.map(slug =>
      res.text.indexOf(`data-card-slug="${slug}"`),
    );
    // Every card found.
    for (let i = 0; i < expectedOrder.length; i++) {
      expect(positions[i], `card '${expectedOrder[i]}' not found`).toBeGreaterThan(0);
    }
    // Strict ascending order.
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]!).toBeGreaterThan(positions[i - 1]!);
    }
  });

  // Helper: slice the markup of a single card by data-card-slug. The
  // card wrapper is a <div>; ending slice at the NEXT data-card-slug=
  // (or end-of-section) gives the full card including the optional
  // sub-link sibling anchor.
  function sliceCard(html: string, slug: string): string {
    const start = html.indexOf(`data-card-slug="${slug}"`);
    if (start < 0) return '';
    const nextSlug = html.indexOf('data-card-slug=', start + 1);
    const sectionEnd = html.indexOf('</section>', start);
    const end = nextSlug > 0 && (sectionEnd < 0 || nextSlug < sectionEnd)
      ? nextSlug
      : (sectionEnd > 0 ? sectionEnd : html.length);
    return html.slice(start, end);
  }

  it('cards 4 + 5 (Movement Neighborhoods + Observed Tricks) carry the observational badge', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    for (const slug of ['neighborhoods', 'observed']) {
      const card = sliceCard(res.text, slug);
      expect(card).toContain('symbolic-layer-badge');
      expect(card).toContain('landing-card--observational');
    }
  });

  it('canonical cards (ADD, Family, Movement System, Operators) do NOT carry the observational badge', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    for (const slug of ['add', 'family', 'movement-system', 'operators']) {
      const card = sliceCard(res.text, slug);
      expect(card, `${slug} card should not carry observational badge`).not.toContain('symbolic-layer-badge');
      expect(card).not.toContain('landing-card--observational');
    }
  });

  it('Movement System card carries the Footbag Sets sub-link deep-linking to the Set/Uptime axis', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const card = sliceCard(res.text, 'movement-system');
    expect(card).toContain('landing-card-sub-link');
    expect(card).toContain('Footbag Sets');
  });

  it('Movement System card href targets ?view=movement-system; sub-link targets the axis anchor', async () => {
    // Handlebars HTML-escapes `=` to `&#x3D;` in attribute output. The
    // accept-both regex matches the rendered form regardless.
    const eq = '(?:=|&#x3D;)';
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).toMatch(new RegExp(`href="/freestyle/tricks\\?view${eq}movement-system"`));
    expect(res.text).toMatch(new RegExp(`href="/freestyle/tricks\\?view${eq}movement-system#movement-axis-set-uptime"`));
  });

  it('Observed Tricks card hrefs to /freestyle/observational (NOT a renamed route)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const card = sliceCard(res.text, 'observed');
    expect(card).toContain('href="/freestyle/observational"');
  });

  it('Operators & Components card hrefs to /freestyle/operators (canonical reference home)', async () => {
    // LP2 audit (2026-05-20): Card 6's main link targets the canonical
    // operator reference page, not the broader glossary. The glossary
    // primer callout below the card grid still surfaces broader-
    // glossary discoverability via its own href.
    const res = await request(createApp()).get('/freestyle/tricks');
    const card = sliceCard(res.text, 'operators');
    expect(card).toContain('href="/freestyle/operators"');
    expect(card).not.toContain('href="/freestyle/glossary"');
  });

  it('glossary primer callout renders with the locked headline and a glossary anchor link', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).toContain('class="landing-primer-callout"');
    expect(res.text).toMatch(/New to the notation\?/);
    expect(res.text).toContain('href="/freestyle/glossary#notation"');
  });

  it('does NOT render any "What\'s new" / churn-panel content (locked decision: timeless landing)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.text).not.toMatch(/what['’]s new/i);
    expect(res.text).not.toMatch(/recently added/i);
    expect(res.text).not.toMatch(/release notes?/i);
  });

  it('stat row renders three chips with non-zero canonical + modifier counts', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const stripStart = res.text.indexOf('class="landing-stat-strip"');
    expect(stripStart).toBeGreaterThan(-1);
    const stripEnd = res.text.indexOf('</section>', stripStart);
    const strip = res.text.slice(stripStart, stripEnd);
    expect(strip).toContain('canonical tricks');
    expect(strip).toContain('observational');
    expect(strip).toContain('modifiers');
    // 3 chip wrappers total.
    const chipMatches = strip.match(/class="landing-stat-chip"/g) ?? [];
    expect(chipMatches.length).toBe(3);
  });

  it('notation philosophy paragraph appears below the card grid', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    const gridIdx = res.text.indexOf('class="landing-card-grid"');
    const philosophyIdx = res.text.indexOf('class="notation-philosophy"');
    expect(gridIdx).toBeGreaterThan(-1);
    expect(philosophyIdx).toBeGreaterThan(gridIdx);
    expect(res.text).toMatch(/symbolic-first approach/);
  });
});

describe('GET /freestyle/tricks — controller branching regression', () => {
  it('?view=add bypasses the landing and renders the ADD browse view', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="dictionary-landing"');
    expect(res.text).toContain('class="trick-view-toggle"');
    expect(res.text).toMatch(/class="trick-view-toggle-active">By ADD</);
  });

  it('?family= alone bypasses the landing (defaults to family-filtered ADD)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?family=whirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="dictionary-landing"');
    expect(res.text).toContain('class="trick-view-toggle"');
  });

  it('"Back to Dictionary" link renders on browse views, hrefing to /freestyle/tricks', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toContain('class="trick-view-toggle-back"');
    expect(res.text).toMatch(/<a class="trick-view-toggle-back" href="\/freestyle\/tricks">/);
  });
});
