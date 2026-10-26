/**
 * Integration tests for Freestyle Concepts fragment-anchor support.
 *
 * The Concepts foundational-tricks chapter and the modifier quick-reference
 * subsection carry id="term-{slug}" anchors. Modifier-family pages deep-link
 * to the entry that teaches each term via conceptsHrefForTerm, and the retired
 * connective-panel ids still resolve inside those entries.
 *
 * Covers:
 *   - Concepts page renders id="term-X" anchors for foundational tricks
 *   - Concepts page renders id="term-X" anchors for modifier quick-reference
 *   - Every Concepts link on the modifier pages resolves
 *   - Retired panel ids land inside their replacement entries
 *   - Fallback path: conceptsHrefForTerm returns bare URL for unknown terms
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';
import { conceptsHrefForTerm, LEGACY_PANEL_TARGETS } from '../../src/services/conceptsAnchors';

const { dbPath } = setTestEnv('3094');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed butterfly-based tricks so the pages under test render their links
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
  it('sends each former connective-panel term to the entry that teaches it', () => {
    expect(conceptsHrefForTerm('paradox')).toBe('/freestyle/concepts#term-paradox');
    expect(conceptsHrefForTerm('spinning')).toBe('/freestyle/concepts#term-spinning');
    expect(conceptsHrefForTerm('ducking')).toBe('/freestyle/concepts#term-ducking');
    expect(conceptsHrefForTerm('symposium')).toBe('/freestyle/concepts#term-symposium');
    expect(conceptsHrefForTerm('whirl')).toBe('/freestyle/concepts#term-whirl');
    // Pixie is defined as a launch set in Timing & Sets, not on its one-line card.
    expect(conceptsHrefForTerm('pixie')).toBe('/freestyle/concepts#term-set-launches');
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
    expect(conceptsHrefForTerm('  Paradox  ')).toBe('/freestyle/concepts#term-paradox');
    expect(conceptsHrefForTerm('BUTTERFLY')).toBe('/freestyle/concepts#term-butterfly');
  });
});

describe('GET /freestyle/concepts — fragment anchors render', () => {
  it('renders id="term-X" on all 11 foundational-tricks list items', async () => {
    // The "clipper" foundational atom anchors at slug `clipper_stall`, not
    // `clipper`: the canonical slug is the anchor, and the community
    // shorthand `#clipper` is rendered through a displaySlug override.
    const res = await page('/freestyle/concepts');
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
    const res = await page('/freestyle/concepts');
    expect(res.text).toContain('id="set-modifiers-tier-1"');
    expect(res.text).toContain('id="term-pixie"');
    expect(res.text).toContain('id="term-fairy"');
  });

  it('renders id="term-set-realization" and id="term-standalone-realization" anchors for the two set-role definitions', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.text).toContain('id="term-set-realization"');
    expect(res.text).toContain('id="term-standalone-realization"');
  });

  it('every Concepts deep-link anchor id is unique (no term-/modifier-/panel- shadow)', async () => {
    // Each operator owns exactly one anchor across the Modifiers & Operators
    // surfaces. A duplicated id="term-{slug}" (the set-primitive grid re-rendering
    // an operator already carried by the intermediate-operators list or the
    // body-modifier reference) is invalid HTML and makes the deep-link target
    // ambiguous, so the link-target anchor families must each be collision-free.
    const res = await page('/freestyle/concepts');
    expect(res.status).toBe(200);
    const anchorIds = [...res.text.matchAll(/id="([^"]+)"/g)]
      .map(m => m[1])
      .filter(id => /^(term|modifier|glossary-panel)-/.test(id));
    const counts = new Map<string, number>();
    for (const id of anchorIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    expect(duplicates, `duplicate Concepts anchor id(s): ${duplicates.join(', ')}`).toEqual([]);
  });

  it('every in-page fragment link lands on an element of the page', async () => {
    // A cross-reference that names a section or term the page no longer
    // carries sends the reader nowhere; a trim that removes a target must take
    // its links with it.
    const res = await page('/freestyle/concepts');
    const ids = new Set([...res.text.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    const targets = [...res.text.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
    expect(targets.length).toBeGreaterThan(0);
    const dead = [...new Set(targets.filter(t => !ids.has(t)))];
    expect(dead, `fragment links with no target: ${dead.join(', ')}`).toEqual([]);
  });

  it('renders id="term-X" on the §3 modifier quick-reference subsection', async () => {
    const res = await page('/freestyle/concepts');
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

  it('relative-side subsection explains SAME / OP / paradox coexistence and that OP is not X-Dex', async () => {
    const res = await page('/freestyle/concepts');
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

describe('deep links into Concepts land on an element of the Concepts page', () => {
  async function conceptsIds(): Promise<Set<string>> {
    const res = await page('/freestyle/concepts');
    expect(res.status).toBe(200);
    return new Set([...res.text.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  }

  it('every Concepts link on the modifier pages resolves', async () => {
    // The pages that link into Concepts by term; a link whose fragment the
    // Concepts page does not carry lands the reader at the top of the page.
    const ids = await conceptsIds();
    const sources = [
      '/freestyle/modifier/spinning', '/freestyle/modifier/paradox',
      '/freestyle/modifier/ducking', '/freestyle/modifier/symposium',
    ];
    let checked = 0;
    for (const path of sources) {
      const res = await page(path);
      expect(res.status, path).toBe(200);
      for (const m of res.text.matchAll(/href="\/freestyle\/concepts#([^"]+)"/g)) {
        checked += 1;
        expect(ids.has(m[1]), `${path} links #${m[1]}, which Concepts does not carry`).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('every term the anchor map knows resolves on the Concepts page', async () => {
    const ids = await conceptsIds();
    const terms = ['paradox', 'symposium', 'ducking', 'spinning', 'whirl', 'pixie', 'fairy',
      'clipper', 'mirage', 'legover', 'pickup', 'illusion', 'butterfly', 'swirl', 'osis',
      'around_the_world', 'orbit', 'stepping', 'cross-body', 'jobs-notation'];
    for (const term of terms) {
      const href = conceptsHrefForTerm(term);
      const fragment = href.split('#')[1];
      expect(fragment, `${term} has a fragment`).toBeDefined();
      expect(ids.has(fragment!), `${term} → #${fragment} is not on the page`).toBe(true);
    }
  });

  it('each retired connective-panel id still lands inside the entry that replaced it', async () => {
    // Bookmarks and outside links still carry the old panel ids.
    const res = await page('/freestyle/concepts');
    for (const [legacyId, target] of LEGACY_PANEL_TARGETS) {
      const pattern = new RegExp(`id="${target}"[^>]*>\\s*<span id="${legacyId}"></span>`);
      expect(res.text, `${legacyId} inside #${target}`).toMatch(pattern);
    }
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

  it('links the template tricks by their canonical underscore slug', async () => {
    const res = await page('/freestyle/concepts');
    for (const slug of UNDERSCORE_TARGETS) {
      expect(res.text, `${slug} should link by its canonical underscore slug`).toContain(`href="/freestyle/tricks/${slug}"`);
    }
  });
});
