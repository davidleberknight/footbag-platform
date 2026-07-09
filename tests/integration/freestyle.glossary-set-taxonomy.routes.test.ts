/**
 * Glossary set-taxonomy home.
 *
 * Timing & Sets is the home for confirmed set vocabulary, not Operators &
 * Modifiers. The confirmed sets (pixie, fairy, stepping, atomic, quantum,
 * furious) are defined here; the related timing terms that are not sets
 * (illusioning, miraging, barraging, barrage) render with stable non-set anchors
 * that the old /freestyle/sets/:slug routes redirect to. Operators & Modifiers
 * points at Timing & Sets for set definitions rather than carrying them.
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
    expect(timingChapter).toContain('An uptime set built around a single outward dex'); // atomic
    expect(timingChapter).toContain('two-dex uptime set');                         // furious
  });

  it('renders the not-set timing terms with their own non-set anchors', async () => {
    const text = await glossary();
    for (const anchor of ['term-illusioning', 'term-miraging-not-a-set', 'term-barraging-not-a-set', 'term-barrage-not-a-set']) {
      expect(text).toContain(`id="${anchor}"`);
    }
    expect(text).toContain('not an equivalent name for Atomic and not a set'); // illusioning
    expect(text).toContain('not the same as Barraging');                       // barrage vs barraging
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
