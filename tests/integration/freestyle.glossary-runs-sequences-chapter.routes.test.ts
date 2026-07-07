/**
 * Integration tests for the Runs & Sequences chapter on GET /freestyle/glossary:
 * the merge of the former Symbolic Composition and Run Architecture sections into
 * one collapsible chapter (third chapter-disclosure pilot).
 *
 * The "tricks combine into runs; this is how tricks are used, not defined"
 * distinction and the core run vocabulary stay visible; the decomposition table,
 * the vocabulary-relationships reference, and the run-architecture detail fold
 * into one chapter details. Run Architecture folds from a section into a div
 * (preserving section-run-architecture), the section is renamed away from
 * "Composition" so it no longer collides with the trick-level Composition concept
 * card, and the duplicated run framing is removed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3568');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function glossary(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/glossary');
  expect(res.status).toBe(200);
  return res.text;
}

describe('Glossary — Runs & Sequences chapter (Composition + Run Architecture merge)', () => {
  it('renames the section away from Composition and folds both into one chapter', async () => {
    const html = await glossary();

    // renamed heading (resolves the collision with the trick-level Composition card);
    // the old "Symbolic Composition" name is gone from the page entirely (heading and
    // the cross-reference that named it)
    expect(html).toContain('Runs &amp; Sequences');
    expect(html).not.toContain('Symbolic Composition');

    const chapterAt    = html.indexOf('id="chapter-runs-sequences"');
    const distinctionAt= html.indexOf('how tricks are <em>used</em>');
    const atlasAt       = html.indexOf('id="derivation-atlas"');
    const runArchAt     = html.indexOf('id="section-run-architecture"');
    const chapterEnd    = html.indexOf('</section>', chapterAt);

    expect(chapterAt).toBeGreaterThan(-1);
    // the used-vs-defined distinction stays visible, before the chapter
    expect(distinctionAt).toBeGreaterThan(-1);
    expect(distinctionAt).toBeLessThan(chapterAt);
    // the decomposition table and the folded run architecture live inside the chapter
    expect(atlasAt).toBeGreaterThan(chapterAt);
    expect(atlasAt).toBeLessThan(chapterEnd);
    expect(runArchAt).toBeGreaterThan(chapterAt);
    expect(runArchAt).toBeLessThan(chapterEnd);
  });

  it('preserves the merged anchors, facts, and the combo-analysis link', async () => {
    const html = await glossary();
    expect(html).toContain('id="section-composition"');       // merged section keeps this id
    expect(html).toContain('id="section-run-architecture"');   // preserved on a div
    expect(html).toContain('id="derivation-atlas"');
    expect(html).toContain('id="vocabulary-relationships"');
    expect(html).toContain('Tiltless');                        // run-quality tiers preserved
    expect(html).toContain('Shred Circle');                    // run vocabulary preserved
    expect(html).toContain('href="/freestyle/combo-analysis"');
  });

  it('removes the duplicated run framing (stated once now)', async () => {
    const html = await glossary();
    const matches = html.match(/Above the single-trick level/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
