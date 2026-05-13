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
  insertFreestyleTrick(db, { slug: 'dada-curve', canonical_name: 'dada curve', adds: '4', base_trick: null,        trick_family: 'dada-curve', category: 'compound' });
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
  it('renders id="term-X" on all 12 §10 foundational-tricks list items', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="term-clipper"');
    expect(res.text).toContain('id="term-mirage"');
    expect(res.text).toContain('id="term-legover"');
    expect(res.text).toContain('id="term-pickup"');
    expect(res.text).toContain('id="term-illusion"');
    expect(res.text).toContain('id="term-whirl"');
    expect(res.text).toContain('id="term-butterfly"');
    expect(res.text).toContain('id="term-swirl"');
    expect(res.text).toContain('id="term-osis"');
    expect(res.text).toContain('id="term-pixie"');
    expect(res.text).toContain('id="term-fairy"');
    expect(res.text).toContain('id="term-around-the-world"');
  });

  it('renders id="term-X" on the §3 modifier quick-reference subsection', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('id="modifier-reference"');
    expect(res.text).toContain('id="term-stepping"');
    expect(res.text).toContain('id="term-paradox"');
    expect(res.text).toContain('id="term-spinning"');
    expect(res.text).toContain('id="term-ducking"');
    expect(res.text).toContain('id="term-symposium"');
    expect(res.text).toContain('id="term-cross-body"');
  });

  it('§3 modifier quick-reference cross-links to §13 connective panels for paradox / spinning / ducking', async () => {
    const res = await request(createApp()).get('/freestyle/glossary');
    expect(res.text).toContain('href="#glossary-panel-paradox"');
    expect(res.text).toContain('href="#glossary-panel-spinning"');
    expect(res.text).toContain('href="#glossary-panel-ducking"');
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
