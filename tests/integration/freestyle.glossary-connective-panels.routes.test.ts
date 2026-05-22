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
  const tricks = [
    { slug: 'paradox-mirage',    adds: '3', base: 'mirage'    },
    { slug: 'paradox-whirl',     adds: '4', base: 'whirl'     },
    { slug: 'matador',           adds: '5', base: 'butterfly' },
    { slug: 'mullet',            adds: '6', base: 'whirl'     },
    { slug: 'montage',           adds: '7', base: 'whirl'     },
    { slug: 'ducking-whirl',     adds: '4', base: 'whirl'     },
    { slug: 'ducking-osis',      adds: '4', base: 'osis'      },
    { slug: 'phoenix',           adds: '5', base: 'butterfly' },
    { slug: 'spinning-whirl',    adds: '4', base: 'whirl'     },
    { slug: 'spinning-osis',     adds: '4', base: 'osis'      },
    { slug: 'whirl',             adds: '3', base: 'whirl'     },
    { slug: 'smear',             adds: '3', base: 'mirage'    },
    { slug: 'dimwalk',           adds: '4', base: 'butterfly' },
    { slug: 'parkwalk',          adds: '4', base: 'butterfly' },
  ];
  for (const t of tricks) {
    insertFreestyleTrick(db, {
      slug:           t.slug,
      canonical_name: t.slug.replace(/-/g, ' '),
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
    // forever-rule). Phase E (2026-05-22) re-tiered the glossary and
    // dropped numeric section prefixes from headings.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Family &amp; Topology Concepts/);
    expect(res.text).toContain('id="connective-panels"');
  });

  it('preserves the primer + reference sections above and below the panels', async () => {
    // Phase E re-tier: §1 reframed as "Movement Basics"; ADD Accounting
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
    expect(res.text).toMatch(/hip leads.+dex follows along the pivot/i);
    expect(res.text).toMatch(/no-plant body discipline/i);
    expect(res.text).toMatch(/A head dip toward the bag/i);
    expect(res.text).toMatch(/full-body rotation that carries through the dex moment/i);
    expect(res.text).toMatch(/A rotational base trick/i);
    expect(res.text).toMatch(/A set modifier that tightens the dex moment/i);
  });

  it('renders related-tricks chips for each panel that has members', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // paradox panel should link to paradox-mirage or paradox-whirl
    const paradoxStart = res.text.indexOf('id="glossary-panel-paradox"');
    const symposiumStart = res.text.indexOf('id="glossary-panel-symposium"');
    expect(paradoxStart).toBeGreaterThan(-1);
    expect(symposiumStart).toBeGreaterThan(paradoxStart);
    const paradoxSlice = res.text.substring(paradoxStart, symposiumStart);
    expect(paradoxSlice).toMatch(/href="\/freestyle\/tricks\/paradox-/);
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
    // Specific operator references. Paradox hint updated 2026-05-17
    // (Formula Accountability Slice) to surface the canonical formula
    // `PDX → CLIP > OP IN [DEX]` explicitly instead of the prior
    // `(PDX) flag on a dex beat` framing.
    expect(res.text).toContain('PDX');
    expect(res.text).toMatch(/CLIP\s*&gt;\s*OP IN\s*\[DEX\]/);
    expect(res.text).toContain('(no plant while)');
    expect(res.text).toContain('Duck (BOD)');
    expect(res.text).toContain('(BOD)');
  });

  it('spinning panel includes deep-link to /freestyle/modifier/spinning', async () => {
    // GA Phase 6 (2026-05-21) standardized the connective-panel deep-
    // link phrasing from "Learn more about {displayName} →" to
    // "Modifier reference →" via the .panel-deep-link.glossary-
    // outward-link class. The href destination is unchanged.
    const res = await request(createApp()).get('/freestyle/glossary');
    const spinningStart = res.text.indexOf('id="glossary-panel-spinning"');
    const whirlStart = res.text.indexOf('id="glossary-panel-whirl"');
    const spinningSlice = res.text.substring(spinningStart, whirlStart);
    expect(spinningSlice).toContain('href="/freestyle/modifier/spinning"');
    expect(spinningSlice).toMatch(/Modifier reference\s*&rarr;/);
  });

  it('non-spinning panels do NOT include modifier-family deep-link (Phase 6 pilot)', async () => {
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

  it('renders the glossary section spine in re-tiered order', async () => {
    // Phase E (2026-05-22) re-tier: section anchors in progressive-disclosure
    // order, with the relocated "Advanced Reference Concepts" section between
    // Family & Topology Concepts and Community Vocabulary. Section ids are
    // unique, so monotonic ordering on the anchors is a robust spine check.
    const res = await request(createApp()).get('/freestyle/glossary');
    const orderedAnchors = [
      'id="section-core-concepts"',
      'id="section-surfaces"',
      'id="section-dexterities"',
      'id="section-timing-sets"',
      'id="section-families"',
      'id="section-modifiers"',
      'id="section-notation"',
      'id="section-add-accounting"',
      'id="section-composition"',
      'id="section-run-architecture"',
      'id="connective-panels"',
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
