/**
 * Integration tests for Freestyle Concepts fragment-anchor support.
 *
 * The Concepts foundational-tricks chapter and the modifier quick-reference
 * subsection carry id="term-{slug}" anchors. The connective panels
 * carry id="glossary-panel-{term}" anchors. Progression / modifier-
 * family pages deep-link to those anchors via conceptsHrefForTerm.
 *
 * Covers:
 *   - Concepts page renders id="term-X" anchors for foundational tricks
 *   - Concepts page renders id="term-X" anchors for modifier quick-reference
 *   - Walking-progression page concept links deep-link via fragments
 *   - Modifier-family pages conceptsHref deep-links to connective-panel anchors
 *   - Fallback path: conceptsHrefForTerm returns bare URL for unknown terms
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
import { conceptsHrefForTerm } from '../../src/services/conceptsAnchors';

const { dbPath } = setTestEnv('3094');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed walking-progression chain (so the page renders + emits concept links)
  insertFreestyleTrick(db, { slug: 'butterfly',  canonical_name: 'butterfly',  adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ripwalk',    canonical_name: 'ripwalk',    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'dimwalk',    canonical_name: 'dimwalk',    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'sidewalk',   canonical_name: 'sidewalk',   adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'dada_curve', canonical_name: 'dada curve', adds: '4', base_trick: null,        trick_family: 'dada_curve', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'matador',    canonical_name: 'matador',    adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'phoenix',    canonical_name: 'phoenix',    adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });

  // Seed enough of the spinning + paradox + ducking modifier-family chains so
  // those routes return 200 and their conceptsHref deep-links can be asserted.
  insertFreestyleTrick(db, { slug: 'whirl',                    canonical_name: 'whirl',                    adds: '3', base_trick: 'whirl',  trick_family: 'whirl',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning-whirl',           canonical_name: 'spinning whirl',           adds: '4', base_trick: 'whirl',  trick_family: 'whirl',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning-symposium-whirl', canonical_name: 'spinning symposium whirl', adds: '5', base_trick: 'whirl',  trick_family: 'whirl',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'montage',                  canonical_name: 'montage',                  adds: '7', base_trick: 'whirl',  trick_family: 'whirl',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'mirage',                   canonical_name: 'mirage',                   adds: '2', base_trick: 'mirage', trick_family: 'mirage', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox-mirage',           canonical_name: 'paradox mirage',           adds: '3', base_trick: 'mirage', trick_family: 'mirage', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox-whirl',            canonical_name: 'paradox whirl',            adds: '4', base_trick: 'whirl',  trick_family: 'whirl',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox-symposium-whirl',  canonical_name: 'paradox symposium whirl',  adds: '5', base_trick: 'whirl',  trick_family: 'whirl',  category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking-butterfly',        canonical_name: 'ducking butterfly',        adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking-whirl',            canonical_name: 'ducking whirl',            adds: '4', base_trick: 'whirl',  trick_family: 'whirl',  category: 'compound' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('conceptsHrefForTerm (pure function)', () => {
  it('returns §13 connective-panel URL for terms with a panel', () => {
    expect(conceptsHrefForTerm('paradox')).toBe('/freestyle/concepts#glossary-panel-paradox');
    expect(conceptsHrefForTerm('spinning')).toBe('/freestyle/concepts#glossary-panel-spinning');
    expect(conceptsHrefForTerm('ducking')).toBe('/freestyle/concepts#glossary-panel-ducking');
    expect(conceptsHrefForTerm('symposium')).toBe('/freestyle/concepts#glossary-panel-symposium');
    expect(conceptsHrefForTerm('whirl')).toBe('/freestyle/concepts#glossary-panel-whirl');
    expect(conceptsHrefForTerm('pixie')).toBe('/freestyle/concepts#glossary-panel-pixie');
  });

  it('returns §10 / §3 inline-term URL for foundational + modifier terms', () => {
    expect(conceptsHrefForTerm('butterfly')).toBe('/freestyle/concepts#term-butterfly');
    expect(conceptsHrefForTerm('clipper')).toBe('/freestyle/concepts#term-clipper');
    expect(conceptsHrefForTerm('mirage')).toBe('/freestyle/concepts#term-mirage');
    expect(conceptsHrefForTerm('stepping')).toBe('/freestyle/concepts#term-stepping');
    expect(conceptsHrefForTerm('cross-body')).toBe('/freestyle/concepts#term-cross-body');
  });

  it('resolves around-the-world to its underscore anchor in every written form', () => {
    // The foundational list renders id="term-around_the_world" (underscore
    // slug), so the hyphenated and spaced display forms must resolve there too;
    // emitting #term-around-the-world lands on no element.
    expect(conceptsHrefForTerm('around-the-world')).toBe('/freestyle/concepts#term-around_the_world');
    expect(conceptsHrefForTerm('around the world')).toBe('/freestyle/concepts#term-around_the_world');
    expect(conceptsHrefForTerm('around_the_world')).toBe('/freestyle/concepts#term-around_the_world');
  });

  it('returns bare URL fallback for unknown terms', () => {
    expect(conceptsHrefForTerm('does-not-exist')).toBe('/freestyle/concepts');
    expect(conceptsHrefForTerm('')).toBe('/freestyle/concepts');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(conceptsHrefForTerm('  Paradox  ')).toBe('/freestyle/concepts#glossary-panel-paradox');
    expect(conceptsHrefForTerm('BUTTERFLY')).toBe('/freestyle/concepts#term-butterfly');
  });
});

describe('GET /freestyle/concepts — fragment anchors render', () => {
  it('renders id="term-X" on all 11 foundational-tricks list items', async () => {
    // The "clipper" foundational atom anchors at slug `clipper_stall`, not
    // `clipper`: the canonical slug is the anchor, and the community
    // shorthand `#clipper` is rendered through a displaySlug override.
    const res = await request(createApp()).get('/freestyle/concepts');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="term-clipper_stall"');
    expect(res.text).toContain('id="term-mirage"');
    expect(res.text).toContain('id="term-legover"');
    expect(res.text).toContain('id="term-pickup"');
    expect(res.text).toContain('id="term-illusion"');
    expect(res.text).toContain('id="term-whirl"');
    expect(res.text).toContain('id="term-butterfly"');
    expect(res.text).toContain('id="term-swirl"');
    expect(res.text).toContain('id="term-osis"');
    expect(res.text).toContain('id="term-around_the_world"');
    expect(res.text).toContain('id="term-orbit"');
  });

  it('preserves id="term-pixie" and id="term-fairy" anchors in the set-modifiers subsection (cross-link integrity)', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
    expect(res.text).toContain('id="set-modifiers-tier-1"');
    expect(res.text).toContain('id="term-pixie"');
    expect(res.text).toContain('id="term-fairy"');
  });

  it('renders id="term-set-realization" and id="term-standalone-realization" anchors for the two set-role definitions', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
    expect(res.text).toContain('id="term-set-realization"');
    expect(res.text).toContain('id="term-standalone-realization"');
  });

  it('every Concepts deep-link anchor id is unique (no term-/modifier-/panel- shadow)', async () => {
    // Each operator owns exactly one anchor across the Modifiers & Operators
    // surfaces. A duplicated id="term-{slug}" (the set-primitive grid re-rendering
    // an operator already carried by the intermediate-operators list or the
    // body-modifier reference) is invalid HTML and makes the deep-link target
    // ambiguous, so the link-target anchor families must each be collision-free.
    const res = await request(createApp()).get('/freestyle/concepts');
    expect(res.status).toBe(200);
    const anchorIds = [...res.text.matchAll(/id="([^"]+)"/g)]
      .map(m => m[1])
      .filter(id => /^(term|modifier|glossary-panel)-/.test(id));
    const counts = new Map<string, number>();
    for (const id of anchorIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    expect(duplicates, `duplicate Concepts anchor id(s): ${duplicates.join(', ')}`).toEqual([]);
  });

  it('renders id="term-X" on the §3 modifier quick-reference subsection', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
    expect(res.text).toContain('id="modifier-reference"');
    expect(res.text).toContain('id="term-stepping"');
    expect(res.text).toContain('id="term-paradox"');
    expect(res.text).toContain('id="term-spinning"');
    expect(res.text).toContain('id="term-symposium"');
    expect(res.text).toContain('id="term-cross-body"');
    // Ducking's term-anchor lives with its foundational duck-direction family
    // (ducking / weaving / diving / zulu); the §6 body-modifier entry delegates
    // to the connective panel rather than carrying a second term-ducking anchor.
    expect(res.text).toContain('id="term-ducking"');
  });

  it('§3 modifier quick-reference cross-links to §13 connective panels for paradox / spinning / ducking', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
    expect(res.text).toContain('href="#glossary-panel-paradox"');
    expect(res.text).toContain('href="#glossary-panel-spinning"');
    expect(res.text).toContain('href="#glossary-panel-ducking"');
  });

  it('relative-side subsection explains SAME / OP / paradox coexistence and that OP is not X-Dex', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
    // The consolidated relative-side explainer is present with anchored terms.
    expect(res.text).toContain('Relative-side relationships');
    expect(res.text).toContain('id="term-same-side"');
    expect(res.text).toContain('id="term-opposite-side"');
    expect(res.text).toContain('id="term-op-not-xdex"');
    // Side is component-relative (read against the most recent side-bearing component), not near/far.
    expect(res.text).toContain('acts on the same leg as the most recent side-bearing component');
    expect(res.text).toContain('acts on the opposite leg from the most recent side-bearing component');
    // Paradox is not a third SAME/OP value; it coexists with the side qualifier rather than replacing it.
    expect(res.text).toContain('not a third SAME/OP value');
    expect(res.text).toContain('can coexist with');
    // Far / opposite is distinct from the receiver-gated X-Dex bonus, and the
    // explainer deep-links to the X-Dex term rather than restating it.
    expect(res.text).toContain('is not X-Dex');
    expect(res.text).toContain('href="#term-x-dex"');
  });
});

describe('walking-progression page — concept links deep-link via fragments', () => {
  it('butterfly references go to /freestyle/concepts#term-butterfly', async () => {
    const res = await request(createApp()).get('/freestyle/progression/walking-family');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/concepts#term-butterfly"');
  });

  it('paradox references go to the §13 connective panel anchor', async () => {
    const res = await request(createApp()).get('/freestyle/progression/walking-family');
    expect(res.text).toContain('href="/freestyle/concepts#glossary-panel-paradox"');
  });

  it('stepping / pixie references go to /freestyle/concepts#term-{slug}', async () => {
    const res = await request(createApp()).get('/freestyle/progression/walking-family');
    expect(res.text).toContain('href="/freestyle/concepts#term-stepping"');
    // pixie has a §13 connective panel, so it deep-links there
    expect(res.text).toContain('href="/freestyle/concepts#glossary-panel-pixie"');
  });

  it('ducking references go to the §13 connective panel anchor', async () => {
    const res = await request(createApp()).get('/freestyle/progression/walking-family');
    expect(res.text).toContain('href="/freestyle/concepts#glossary-panel-ducking"');
  });

  it('no concept links remain at the bare /freestyle/concepts URL', async () => {
    const res = await request(createApp()).get('/freestyle/progression/walking-family');
    // Match Related-concepts links specifically (the step concept-links region).
    // Any "Related concepts:" link should carry a fragment.
    const stepLinksRegion = res.text.match(/Related concepts:[\s\S]*?<\/p>/g) ?? [];
    expect(stepLinksRegion.length).toBeGreaterThan(0);
    for (const region of stepLinksRegion) {
      const hasBareLink = /href="\/freestyle\/concepts"/.test(region);
      expect(hasBareLink, `step concept-links region should not contain a bare /freestyle/concepts link: ${region}`).toBe(false);
    }
  });
});

describe('modifier-family pages — conceptsHref deep-links to connective-panel anchors', () => {
  it('/freestyle/modifier/spinning concepts link goes to #glossary-panel-spinning', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/concepts#glossary-panel-spinning"');
  });

  it('/freestyle/modifier/paradox concepts link goes to #glossary-panel-paradox', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/concepts#glossary-panel-paradox"');
  });

  it('/freestyle/modifier/ducking concepts link goes to #glossary-panel-ducking', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/concepts#glossary-panel-ducking"');
  });
});

describe('Concepts trick links use canonical underscore slugs (no dead hyphenated links)', () => {
  // The X-Dex term, the equivalence readings, and the whirl-mirror-pair note
  // hand-author these trick links in the template; a hyphenated slug never
  // resolves. Each of these must render as the canonical underscore slug.
  const UNDERSCORE_TARGETS = [
    'atom_smasher', 'atomic_miraging_butterfly', 'dada_curve', 'double_leg_over',
    'gyro_ducking_symposium_torque', 'gyro_whirl', 'hop_over', 'paradox_whirl',
    'quantum_illusion', 'quantum_mirage', 'rev_whirl', 'spinning_whirl', 'walk_over',
  ];

  it('links the formerly-hyphenated template tricks by their canonical underscore slug', async () => {
    const res = await request(createApp()).get('/freestyle/concepts');
    for (const slug of UNDERSCORE_TARGETS) {
      expect(res.text, `${slug} should link by its canonical underscore slug`).toContain(`href="/freestyle/tricks/${slug}"`);
    }
  });
});
