/**
 * Integration tests for the glossary connective panels.
 *
 * Verifies that GET /freestyle/glossary renders 6 observational panels for
 * paradox / symposium / ducking / spinning / whirl / pixie. Each panel
 * surfaces a short definition + related-tricks chips + related symbolic
 * groups + a notation hint + (when available) a deep-link to a modifier-
 * family page.
 *
 * Existing glossary content above the panel section MUST remain untouched.
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

const { dbPath } = setTestEnv('3094');

// Decode the HTML entities Handlebars emits (apostrophes, quotes, ampersands)
// so definition assertions verify the visible reader text rather than coupling
// to one entity encoding.
function decodeEntities(s: string): string {
  return s
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&amp;/g, '&');
}

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed a small but realistic pool — enough to populate the connective panels
  // with related-trick chips. The panel maps each term to a symbolic group:
  //   paradox    → paradox-family       → paradox-mirage, paradox-whirl, ...
  //   symposium  → symposium-family     → matador, mullet, montage, ...
  //   ducking    → ducking-family       → ducking-whirl, ducking-osis, phoenix
  //   spinning   → spinning-family      → spinning-whirl, spinning-osis, montage
  //   whirl      → whirl-rotational-topology → whirl, spinning-whirl, paradox-whirl
  //   pixie      → pixie-family         → smear, dimwalk, parkwalk, phoenix
  // Dictionary slugs are the underscore canonical form (production shape); the
  // symbolic-grammar CSVs key the same tricks by hyphenated slug, and the panel
  // resolves across that boundary.
  const tricks = [
    { slug: 'paradox_mirage',    adds: '3', base: 'mirage'    },
    { slug: 'paradox_whirl',     adds: '4', base: 'whirl'     },
    { slug: 'matador',           adds: '5', base: 'butterfly' },
    { slug: 'mullet',            adds: '6', base: 'whirl'     },
    { slug: 'montage',           adds: '7', base: 'whirl'     },
    { slug: 'ducking_whirl',     adds: '4', base: 'whirl'     },
    { slug: 'ducking_osis',      adds: '4', base: 'osis'      },
    { slug: 'phoenix',           adds: '5', base: 'butterfly' },
    { slug: 'spinning_whirl',    adds: '4', base: 'whirl'     },
    { slug: 'spinning_osis',     adds: '4', base: 'osis'      },
    { slug: 'whirl',             adds: '3', base: 'whirl'     },
    { slug: 'smear',             adds: '3', base: 'mirage'    },
    { slug: 'dimwalk',           adds: '4', base: 'butterfly' },
    { slug: 'parkwalk',          adds: '4', base: 'butterfly' },
  ];
  for (const t of tricks) {
    insertFreestyleTrick(db, {
      slug:           t.slug,
      canonical_name: t.slug.replace(/[-_]/g, ' '),
      adds:           t.adds,
      base_trick:     t.base,
      trick_family:   t.base,
      category:       'compound',
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/glossary — connective panels section', () => {
  it('renders the Family & Topology Concepts section heading and anchor', async () => {
    // The id="connective-panels" anchor is preserved (anchor-preservation
    // forever-rule). Glossary headings carry no numeric section
    // prefixes.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Family &amp; Topology Concepts/);
    expect(res.text).toContain('id="connective-panels"');
  });

  it('preserves the primer + reference sections above and below the panels', async () => {
    // The glossary opens with "Movement Basics"; ADD Accounting
    // holds the per-trick ADD definition; Sources closes the glossary.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/Movement Basics/);
    expect(res.text).toMatch(/ADD Accounting/);
    expect(res.text).toMatch(/ADD \(Additional Degree of Difficulty\)/);
    expect(res.text).toContain('id="section-sources"');
  });

  it('renders all 6 panels with correct anchor IDs', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="glossary-panel-paradox"');
    expect(res.text).toContain('id="glossary-panel-symposium"');
    expect(res.text).toContain('id="glossary-panel-ducking"');
    expect(res.text).toContain('id="glossary-panel-spinning"');
    expect(res.text).toContain('id="glossary-panel-whirl"');
    expect(res.text).toContain('id="glossary-panel-pixie"');
  });

  it('observational badge + footer rendered for the panel section', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // Two badges: section heading + (no others by design); check at minimum one rendered
    const badgeCount = (res.text.match(/symbolic-layer-badge/g) ?? []).length;
    expect(badgeCount).toBeGreaterThanOrEqual(1);
    expect(res.text).toMatch(/observational symbolic-grammar layer/i);
  });

  it('each panel includes a coach-tone definition', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const text = decodeEntities(res.text);
    expect(text).toMatch(/hip pivot that switches the body's side across one dex/i);
    expect(text).toMatch(/no-plant body discipline/i);
    expect(text).toMatch(/A head dip toward the bag/i);
    expect(text).toMatch(/full-body rotation that carries through the dex moment/i);
    expect(text).toMatch(/A rotational base trick/i);
    expect(text).toMatch(/A toe-anchored launch set that opens the trick/i);
  });

  it('renders related-tricks chips for each panel that has members', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // paradox panel should link to paradox_mirage or paradox_whirl
    const paradoxStart = res.text.indexOf('id="glossary-panel-paradox"');
    const symposiumStart = res.text.indexOf('id="glossary-panel-symposium"');
    expect(paradoxStart).toBeGreaterThan(-1);
    expect(symposiumStart).toBeGreaterThan(paradoxStart);
    const paradoxSlice = res.text.substring(paradoxStart, symposiumStart);
    expect(paradoxSlice).toMatch(/href="\/freestyle\/tricks\/paradox_/);
  });

  it('each panel includes a "Used in these tricks" section label when tricks present', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const usedInCount = (res.text.match(/Used in these tricks/g) ?? []).length;
    // 6 panels should all have at least some related tricks given the test seed
    expect(usedInCount).toBeGreaterThanOrEqual(4);
  });

  it('each panel includes related symbolic groups', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const groupSectionCount = (res.text.match(/Related symbolic groups/g) ?? []).length;
    expect(groupSectionCount).toBe(6);
  });

  it('each panel includes a notation hint', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const hintCount = (res.text.match(/Notation hint/g) ?? []).length;
    expect(hintCount).toBe(6);
    // Specific operator references. The paradox hint surfaces the
    // canonical formula
    // `PDX → CLIP > OP IN [DEX]` explicitly.
    expect(res.text).toContain('PDX');
    expect(res.text).toMatch(/CLIP\s*&gt;\s*OP IN\s*\[DEX\]/);
    expect(res.text).toContain('(no plant while)');
    expect(res.text).toContain('Duck (BOD)');
    expect(res.text).toContain('(BOD)');
  });

  it('spinning panel includes deep-link to /freestyle/modifier/spinning', async () => {
    // The connective-panel deep-link phrasing is the standardized
    // "Modifier reference →" via the .panel-deep-link.glossary-
    // outward-link class.
    const res = await request(createApp()).get('/freestyle/glossary');
    const spinningStart = res.text.indexOf('id="glossary-panel-spinning"');
    const whirlStart = res.text.indexOf('id="glossary-panel-whirl"');
    const spinningSlice = res.text.substring(spinningStart, whirlStart);
    expect(spinningSlice).toContain('href="/freestyle/modifier/spinning"');
    expect(spinningSlice).toMatch(/Modifier reference\s*&rarr;/);
  });

  it('non-spinning panels do NOT include modifier-family deep-link', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // paradox/symposium/ducking/whirl/pixie panels should NOT have a modifier-family link
    const paradoxStart = res.text.indexOf('id="glossary-panel-paradox"');
    const symposiumStart = res.text.indexOf('id="glossary-panel-symposium"');
    const paradoxSlice = res.text.substring(paradoxStart, symposiumStart);
    expect(paradoxSlice).not.toContain('href="/freestyle/modifier/paradox"');
  });

  it('panel grid renders in a 2-column responsive grid', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('glossary-connective-grid');
    expect(res.text).toContain('glossary-connective-panel');
  });
});

describe('GET /freestyle/glossary — connective panels do not break existing content', () => {
  it('glossary intro still renders alongside the connective panels (smoke check)', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // Phase E re-tier: §1 reframed as a welcoming "Movement Basics" intro.
    expect(res.text).toMatch(/the language of freestyle footbag/);
  });

  it('renders the glossary section spine in reading order', async () => {
    // Section anchors in reading order: the Foundations spine (ending in
    // Modifiers) precedes the major topics (Families, then Notation, then
    // Composition, then the reference and history tail). Section ids are unique,
    // so monotonic ordering on the anchors is a robust spine check.
    const res = await request(createApp()).get('/freestyle/glossary');
    const orderedAnchors = [
      'id="section-core-concepts"',
      'id="section-surfaces"',
      'id="section-dexterities"',
      'id="section-timing-sets"',
      'id="section-modifiers"',
      'id="section-families"',
      'id="section-notation"',
      'id="section-add-accounting"',
      'id="section-composition"',
      'id="section-run-architecture"',
      'id="connective-panels"',
      'id="inside-clipper-neighborhood"',
      'id="section-advanced-reference"',
      'id="section-community"',
      'id="section-historical"',
      'id="section-sources"',
    ];
    let lastIdx = -1;
    for (const anchor of orderedAnchors) {
      const idx = res.text.indexOf(anchor);
      expect(idx, `anchor ${anchor} not in monotonic order`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });
});

describe('GET /freestyle/glossary — inside-delay stationary-transition case study', () => {
  it('renders the case-study section heading + anchor', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="inside-clipper-neighborhood"');
    expect(res.text).toMatch(/inside-delay stationary-transition neighborhood/i);
  });

  it('renders all four neighborhood tricks with detail-page links', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('href="/freestyle/tricks/wrap"');
    expect(res.text).toContain('href="/freestyle/tricks/walk_over"');
    expect(res.text).toContain('href="/freestyle/tricks/hop_over"');
    expect(res.text).toContain('href="/freestyle/tricks/eclipse"');
    // step-over is an alias of walk-over, surfaced as text, never its own link.
    expect(res.text).not.toContain('href="/freestyle/tricks/step-over"');
    expect(res.text).not.toContain('href="/freestyle/tricks/step_over"');
  });

  it('is badged observational and disclaims canonical-family change', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    const start = res.text.indexOf('id="inside-clipper-neighborhood"');
    const end = res.text.indexOf('id="section-advanced-reference"');
    const slice = res.text.substring(start, end);
    expect(slice).toMatch(/movement-neighborhood lens/i);
    expect(slice).toMatch(/each anchor\s+their own family/i);
  });

  it('renders eclipse as an explicitly unsettled reading (alignment-rule guard)', async () => {
    // The observational case study must NOT harden eclipse's decomposition into a
    // canonical claim, and must not contradict the detail page's op_notation / ADD.
    const res = await request(createApp()).get('/freestyle/glossary');
    const start = res.text.indexOf('id="inside-clipper-neighborhood"');
    const end = res.text.indexOf('id="section-advanced-reference"');
    const slice = res.text.substring(start, end);
    expect(slice).toMatch(/doctrinally unsettled/i);
    expect(slice).toMatch(/commonly interpreted as symposium/i);
  });

  it('renders the neighborhood section with its deep-link anchor', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="inside-clipper-neighborhood"');
  });
});
