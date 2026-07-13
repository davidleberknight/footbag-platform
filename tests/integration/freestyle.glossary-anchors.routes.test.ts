/**
 * Integration tests for glossary fragment-anchor support.
 *
 * Glossary §10 (foundational tricks) and a new §3 modifier quick-reference
 * subsection carry id="term-{slug}" anchors. The §13 connective panels
 * already carry id="glossary-panel-{term}" anchors. Progression / modifier-
 * family pages deep-link to those anchors via glossaryHrefForTerm.
 *
 * Covers:
 *   - Glossary page renders id="term-X" anchors for foundational tricks
 *   - Glossary page renders id="term-X" anchors for modifier quick-reference
 *   - Walking-progression page glossary links deep-link via fragments
 *   - Modifier-family pages glossaryHref deep-links to §13 panel anchors
 *   - Fallback path: glossaryHrefForTerm returns bare URL for unknown terms
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
import { glossaryHrefForTerm } from '../../src/services/glossaryAnchors';

const { dbPath } = setTestEnv('3094');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed walking-progression chain (so the page renders + emits glossary links)
  insertFreestyleTrick(db, { slug: 'butterfly',  canonical_name: 'butterfly',  adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ripwalk',    canonical_name: 'ripwalk',    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'dimwalk',    canonical_name: 'dimwalk',    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'sidewalk',   canonical_name: 'sidewalk',   adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'dada_curve', canonical_name: 'dada curve', adds: '4', base_trick: null,        trick_family: 'dada_curve', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'matador',    canonical_name: 'matador',    adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'phoenix',    canonical_name: 'phoenix',    adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });

  // Seed enough of the spinning + paradox + ducking modifier-family chains so
  // those routes return 200 and their glossaryHref deep-links can be asserted.
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

describe('glossaryHrefForTerm (pure function)', () => {
  it('returns §13 connective-panel URL for terms with a panel', () => {
    expect(glossaryHrefForTerm('paradox')).toBe('/freestyle/glossary#glossary-panel-paradox');
    expect(glossaryHrefForTerm('spinning')).toBe('/freestyle/glossary#glossary-panel-spinning');
    expect(glossaryHrefForTerm('ducking')).toBe('/freestyle/glossary#glossary-panel-ducking');
    expect(glossaryHrefForTerm('symposium')).toBe('/freestyle/glossary#glossary-panel-symposium');
    expect(glossaryHrefForTerm('whirl')).toBe('/freestyle/glossary#glossary-panel-whirl');
    expect(glossaryHrefForTerm('pixie')).toBe('/freestyle/glossary#glossary-panel-pixie');
  });

  it('returns §10 / §3 inline-term URL for foundational + modifier terms', () => {
    expect(glossaryHrefForTerm('butterfly')).toBe('/freestyle/glossary#term-butterfly');
    expect(glossaryHrefForTerm('clipper')).toBe('/freestyle/glossary#term-clipper');
    expect(glossaryHrefForTerm('mirage')).toBe('/freestyle/glossary#term-mirage');
    expect(glossaryHrefForTerm('stepping')).toBe('/freestyle/glossary#term-stepping');
    expect(glossaryHrefForTerm('cross-body')).toBe('/freestyle/glossary#term-cross-body');
  });

  it('returns bare URL fallback for unknown terms', () => {
    expect(glossaryHrefForTerm('does-not-exist')).toBe('/freestyle/glossary');
    expect(glossaryHrefForTerm('')).toBe('/freestyle/glossary');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(glossaryHrefForTerm('  Paradox  ')).toBe('/freestyle/glossary#glossary-panel-paradox');
    expect(glossaryHrefForTerm('BUTTERFLY')).toBe('/freestyle/glossary#term-butterfly');
  });
});

describe('GET /freestyle/glossary — fragment anchors render', () => {
  it('renders id="term-X" on all 11 §10 foundational-tricks list items', async () => {
    // CORE-ATOM-CANONICAL-RECONCILE-1 (2026-05-15): the "clipper" foundational
    // atom is now anchored at slug `clipper-stall` (community shorthand
    // `#clipper` rendered via displaySlug override). The DB anchor moved
    // from `term-clipper` to `term-clipper-stall`.
    const res = await request(createApp()).get('/freestyle/glossary');
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
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="set-modifiers-tier-1"');
    expect(res.text).toContain('id="term-pixie"');
    expect(res.text).toContain('id="term-fairy"');
  });

  it('renders id="term-set-realization" and id="term-standalone-realization" anchors for the two set-role definitions', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="term-set-realization"');
    expect(res.text).toContain('id="term-standalone-realization"');
  });

  it('every glossary deep-link anchor id is unique (no term-/modifier-/panel- shadow)', async () => {
    // Each operator owns exactly one anchor across the Modifiers & Operators
    // surfaces. A duplicated id="term-{slug}" (the set-primitive grid re-rendering
    // an operator already carried by the intermediate-operators list or the
    // body-modifier reference) is invalid HTML and makes the deep-link target
    // ambiguous, so the link-target anchor families must each be collision-free.
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    const anchorIds = [...res.text.matchAll(/id="([^"]+)"/g)]
      .map(m => m[1])
      .filter(id => /^(term|modifier|glossary-panel)-/.test(id));
    const counts = new Map<string, number>();
    for (const id of anchorIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    expect(duplicates, `duplicate glossary anchor id(s): ${duplicates.join(', ')}`).toEqual([]);
  });

  it('renders id="term-X" on the §3 modifier quick-reference subsection', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
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
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('href="#glossary-panel-paradox"');
    expect(res.text).toContain('href="#glossary-panel-spinning"');
    expect(res.text).toContain('href="#glossary-panel-ducking"');
  });

  it('relative-side subsection explains SAME / OP / paradox coexistence and that OP is not X-Dex', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    // The consolidated relative-side explainer is present with anchored terms.
    expect(res.text).toContain('Relative-side relationships');
    expect(res.text).toContain('id="term-same-side"');
    expect(res.text).toContain('id="term-opposite-side"');
    expect(res.text).toContain('id="term-op-not-xdex"');
    // Side is encoded as near / same-side vs far / opposite.
    expect(res.text).toContain('near / same-side');
    expect(res.text).toContain('far / opposite');
    // Paradox coexists with the side qualifier rather than replacing it.
    expect(res.text).toContain('coexists with');
    // Far / opposite is distinct from the receiver-gated X-Dex bonus, and the
    // explainer deep-links to the X-Dex term rather than restating it.
    expect(res.text).toContain('is not X-Dex');
    expect(res.text).toContain('href="#term-x-dex"');
  });
});

describe('walking-progression page — glossary links deep-link via fragments', () => {
  it('butterfly references go to /freestyle/glossary#term-butterfly', async () => {
    const res = await request(createApp()).get('/freestyle/progression/walking-family');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/glossary#term-butterfly"');
  });

  it('paradox references go to the §13 connective panel anchor', async () => {
    const res = await request(createApp()).get('/freestyle/progression/walking-family');
    expect(res.text).toContain('href="/freestyle/glossary#glossary-panel-paradox"');
  });

  it('stepping / pixie references go to /freestyle/glossary#term-{slug}', async () => {
    const res = await request(createApp()).get('/freestyle/progression/walking-family');
    expect(res.text).toContain('href="/freestyle/glossary#term-stepping"');
    // pixie has a §13 connective panel, so it deep-links there
    expect(res.text).toContain('href="/freestyle/glossary#glossary-panel-pixie"');
  });

  it('ducking references go to the §13 connective panel anchor', async () => {
    const res = await request(createApp()).get('/freestyle/progression/walking-family');
    expect(res.text).toContain('href="/freestyle/glossary#glossary-panel-ducking"');
  });

  it('no glossary links remain at the bare /freestyle/glossary URL', async () => {
    const res = await request(createApp()).get('/freestyle/progression/walking-family');
    // Match Related-glossary-term links specifically (the step-glossary-links region).
    // Any "Related glossary terms:" link should carry a fragment.
    const stepLinksRegion = res.text.match(/Related glossary terms:[\s\S]*?<\/p>/g) ?? [];
    expect(stepLinksRegion.length).toBeGreaterThan(0);
    for (const region of stepLinksRegion) {
      const hasBareLink = /href="\/freestyle\/glossary"/.test(region);
      expect(hasBareLink, `step-glossary region should not contain a bare /freestyle/glossary link: ${region}`).toBe(false);
    }
  });
});

describe('modifier-family pages — glossaryHref deep-links to §13 panel anchors', () => {
  it('/freestyle/modifier/spinning glossary link goes to #glossary-panel-spinning', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/spinning');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/glossary#glossary-panel-spinning"');
  });

  it('/freestyle/modifier/paradox glossary link goes to #glossary-panel-paradox', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/paradox');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/glossary#glossary-panel-paradox"');
  });

  it('/freestyle/modifier/ducking glossary link goes to #glossary-panel-ducking', async () => {
    const res = await request(createApp()).get('/freestyle/modifier/ducking');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/glossary#glossary-panel-ducking"');
  });
});

describe('glossary trick links use canonical underscore slugs (no dead hyphenated links)', () => {
  // The X-Dex term, the equivalence readings, and the whirl-mirror-pair note
  // hand-author these trick links in the template; a hyphenated slug never
  // resolves. Each of these must render as the canonical underscore slug.
  const UNDERSCORE_TARGETS = [
    'atom_smasher', 'atomic_miraging_butterfly', 'dada_curve', 'double_leg_over',
    'gyro_ducking_symposium_torque', 'gyro_whirl', 'hop_over', 'paradox_whirl',
    'quantum_illusion', 'quantum_mirage', 'rev_whirl', 'spinning_whirl', 'walk_over',
  ];

  it('links the formerly-hyphenated template tricks by their canonical underscore slug', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    for (const slug of UNDERSCORE_TARGETS) {
      expect(res.text, `${slug} should link by its canonical underscore slug`).toContain(`href="/freestyle/tricks/${slug}"`);
    }
  });
});
