/**
 * Freestyle Concepts set-taxonomy home.
 *
 * Timing & Sets is the home for set vocabulary, not Operators & Modifiers.
 * Operators & Modifiers points at Timing & Sets for set definitions rather
 * than carrying them.
 *
 * Set role is a function of a movement's structure, not a timing instant: a set
 * realization performs the dex as part of the launch, a standalone realization
 * performs it after the launch. Both single-home definitions live in Timing &
 * Sets, and no public Concepts sentence presents miraging or illusioning as a
 * reusable modifier or scored operator.
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

const { dbPath } = setTestEnv('3616');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, { slug: 'whirl', canonical_name: 'whirl', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'dex', is_active: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function concepts(): Promise<string> {
  const res = await page('/freestyle/concepts');
  expect(res.status).toBe(200);
  return res.text;
}

/** The definition that follows the term anchored at `id`, up to its closing tag. */
function termEntry(text: string, id: string): string {
  const start = text.indexOf(`id="${id}"`);
  expect(start, id).toBeGreaterThan(-1);
  return text.slice(start, text.indexOf('</dd>', start));
}

describe('GET /freestyle/concepts — Timing & Sets is the set-vocabulary home', () => {
  it('teaches that a set launches the trick', async () => {
    const text = await concepts();
    expect(termEntry(text, 'term-set')).toMatch(/launch/i);
  });

  it('defines set realization and standalone realization as the single home for the two roles', async () => {
    const text = await concepts();
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
    // Each role carries its own pair of names: the set role is Quantum and
    // Atomic, the standalone role (after the launch) is Mirage and Illusion.
    const setRole = termEntry(text, 'term-set-realization');
    expect(setRole).toMatch(/Quantum and Atomic/);
    const standalone = termEntry(text, 'term-standalone-realization');
    expect(standalone).toMatch(/launch/);
    expect(standalone).toMatch(/Mirage and Illusion/);
    expect(standalone).not.toMatch(/Quantum|Atomic/);
    // Role follows structure, not a single timing instant.
    expect(timingChapter).toContain('not a single timing instant');
  });

  it('never presents miraging or illusioning as a reusable modifier or scored operator', async () => {
    const text = await concepts();
    // No sentence places either name immediately before "modifier"/"operator"
    // (the presenting-as-operator shape) or after them.
    expect(text).not.toMatch(/(illusioning|miraging)\s+(modifier|operator)/i);
    expect(text).not.toMatch(/(modifier|operator)\s+(illusioning|miraging)/i);
  });

  it('Operators & Modifiers points set definitions to Timing & Sets rather than carrying them', async () => {
    const text = await concepts();
    const modifiersIdx = text.indexOf('id="section-modifiers"');
    const familiesIdx = text.indexOf('id="section-families"');
    expect(modifiersIdx).toBeGreaterThan(0);
    const modifiersChapter = familiesIdx > modifiersIdx ? text.slice(modifiersIdx, familiesIdx) : text.slice(modifiersIdx);
    expect(modifiersChapter).toContain('href="#section-timing-sets"');
    // ...and does not carry its own copies of the set definitions.
    for (const anchor of ['term-set', 'term-set-realization', 'term-standalone-realization']) {
      expect(modifiersChapter).not.toContain(`id="${anchor}"`);
    }
  });
});
