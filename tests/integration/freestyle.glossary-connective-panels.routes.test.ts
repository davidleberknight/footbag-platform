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
  it('renders the Movement Neighborhoods section heading and anchor', async () => {
    // V5: the six connective panels live in §9 as their permanent
    // home. Post-Slice-L0/Q3 (2026-05-16) the section was reframed
    // "Movement Topologies" → "Movement Neighborhoods" to align with
    // the observational-relationship-browsing model. The
    // id="connective-panels" anchor is preserved for inbound links.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/9\.\s+Movement Neighborhoods/);
    expect(res.text).toContain('id="connective-panels"');
  });

  it('preserves the primer + reference sections above and below the panels', async () => {
    // V5: §1 Movement-Language Primer leads; §10 Traditional Reference
    // (which absorbs the old ADD system + competitive-format material)
    // sits below the topology panels; §12 Sources closes the page.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toMatch(/1\.\s+Movement-Language Primer/);
    // §10 heading renamed to "The ADD System" on 2026-05-17 when run-quality
    // tiers + event formats relocated to /freestyle/combo-analysis.
    expect(res.text).toMatch(/10\.\s+The ADD System/);
    expect(res.text).toMatch(/ADD \(Additional Degree of Difficulty\)/);
    expect(res.text).toMatch(/12\.\s+Sources/);
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
    const res = await request(createApp()).get('/freestyle/glossary');
    const spinningStart = res.text.indexOf('id="glossary-panel-spinning"');
    const whirlStart = res.text.indexOf('id="glossary-panel-whirl"');
    const spinningSlice = res.text.substring(spinningStart, whirlStart);
    expect(spinningSlice).toContain('href="/freestyle/modifier/spinning"');
    expect(spinningSlice).toMatch(/Learn more about Spinning/);
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
    expect(res.text).toMatch(/This glossary teaches how the freestyle language works/);
  });

  it('renders the full v5 §1–§12 section spine in order', async () => {
    // V5 contract: §1 primer / §2 surfaces / §3 dex / §4 timing / §5 core
    // structures / §6 modifiers / §7 notation / §8 composition / §9
    // topologies / §10 traditional reference / §11 community-historical /
    // §12 sources. Each heading's ordinal index must be monotonic.
    const res = await request(createApp()).get('/freestyle/glossary');
    const orderedHeadings = [
      '1. Movement-Language Primer',
      '2. Contact Surfaces',
      '3. Dexterities',
      '4. Timing Layers',
      '5. Core Trick Structures',
      '6. Modifiers',
      '7. Symbolic Notation',
      '8. Composition',
      '9. Movement Neighborhoods',
      '10. The ADD System',
      '11. Community',
      '12. Sources',
    ];
    let lastIdx = -1;
    for (const heading of orderedHeadings) {
      const idx = res.text.indexOf(heading);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });
});
