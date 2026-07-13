/**
 * Glossary set-taxonomy home.
 *
 * Timing & Sets is the home for confirmed set vocabulary, not Operators &
 * Modifiers. The confirmed sets (pixie, fairy, stepping, atomic, quantum,
 * furious) are defined here; the related terms that are not launch sets
 * (illusioning, miraging, barraging, barrage) render with stable non-set anchors
 * that the old /freestyle/sets/:slug routes redirect to. Operators & Modifiers
 * points at Timing & Sets for set definitions rather than carrying them.
 *
 * Set role is a function of a movement's structure, not a timing instant: a set
 * realization performs the dex as part of the launch, a standalone realization
 * performs it after the launch. Both single-home definitions live in Timing &
 * Sets, and no public glossary sentence presents miraging or illusioning as a
 * reusable modifier or scored operator.
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

const { dbPath } = setTestEnv('3616');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, { slug: 'whirl', canonical_name: 'whirl', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'dex', is_active: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function glossary(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/glossary');
  expect(res.status).toBe(200);
  return res.text;
}

describe('GET /freestyle/glossary — Timing & Sets is the set-vocabulary home', () => {
  it('teaches that a set launches the trick', async () => {
    const text = await glossary();
    expect(text).toContain('A set launches the trick');
  });

  it('defines the confirmed named sets in Timing & Sets, including Furious', async () => {
    const text = await glossary();
    const timingIdx = text.indexOf('id="section-timing-sets"');
    const modifiersIdx = text.indexOf('id="section-modifiers"');
    expect(timingIdx).toBeGreaterThan(0);
    expect(modifiersIdx).toBeGreaterThan(timingIdx);
    const timingChapter = text.slice(timingIdx, modifiersIdx);
    // The confirmed set vocabulary is anchored here, not in Operators & Modifiers.
    for (const anchor of ['term-set-atomic', 'term-set-quantum', 'term-set-furious', 'term-set-launches']) {
      expect(timingChapter).toContain(`id="${anchor}"`);
    }
    expect(timingChapter).toContain('The outward dex realized as a set');          // atomic
    expect(timingChapter).toContain('A two-dex set beginning from clipper');       // furious
  });

  it('defines set realization and standalone realization as the single home for the two roles', async () => {
    const text = await glossary();
    const timingIdx = text.indexOf('id="section-timing-sets"');
    const modifiersIdx = text.indexOf('id="section-modifiers"');
    const timingChapter = text.slice(timingIdx, modifiersIdx);
    // Both role definitions are anchored here, next to the plain Set definition.
    for (const anchor of ['term-set', 'term-set-realization', 'term-standalone-realization']) {
      expect(timingChapter).toContain(`id="${anchor}"`);
    }
    // Set realization: performed as part of the launch, may terminate on a toe.
    expect(timingChapter).toContain('A dex performed as part of launching and positioning the bag');
    expect(timingChapter).toContain('terminate immediately on a toe and still be a genuine set');
    // Standalone realization: performed independently after the launch.
    expect(timingChapter).toContain('A dex movement realized independently after the bag is launched');
    // Role follows structure, not a single timing instant.
    expect(timingChapter).toContain('not a single timing instant');
  });

  it('never presents miraging or illusioning as a reusable modifier or scored operator', async () => {
    const text = await glossary();
    // No sentence places either name immediately before "modifier"/"operator"
    // (the presenting-as-operator shape) or after them.
    expect(text).not.toMatch(/(illusioning|miraging)\s+(modifier|operator)/i);
    expect(text).not.toMatch(/(modifier|operator)\s+(illusioning|miraging)/i);
    // The definitions state the disclaimer explicitly.
    expect(text).toContain('Illusioning is not a reusable scored operator');
    expect(text).toContain('Miraging is not a launch set or a reusable scored operator');
  });

  it('renders the not-set timing terms with their own non-set anchors', async () => {
    const text = await glossary();
    for (const anchor of ['term-illusioning', 'term-miraging-not-a-set', 'term-barraging-not-a-set', 'term-barrage-not-a-set']) {
      expect(text).toContain(`id="${anchor}"`);
    }
    expect(text).toContain('It is not equivalent to Atomic');   // illusioning vs atomic
    expect(text).toContain('not the same as Barraging');        // barrage vs barraging
  });

  it('Operators & Modifiers points set definitions to Timing & Sets rather than carrying them', async () => {
    const text = await glossary();
    const modifiersIdx = text.indexOf('id="section-modifiers"');
    const familiesIdx = text.indexOf('id="section-families"');
    expect(modifiersIdx).toBeGreaterThan(0);
    const modifiersChapter = familiesIdx > modifiersIdx ? text.slice(modifiersIdx, familiesIdx) : text.slice(modifiersIdx);
    expect(modifiersChapter).toContain('defined in the');
    expect(modifiersChapter).toContain('Timing &amp; Sets section');
  });
});
