/**
 * Integration tests for the Runs & Sequences topic on GET /freestyle/glossary:
 * the former Symbolic Composition and Run Architecture sections, merged into one
 * section and presented as a major topic behind a destination card.
 *
 * The whole section (the used-vs-defined distinction, the core run vocabulary,
 * the decomposition table, the vocabulary-relationships reference, and the
 * run-architecture detail) lives inside the topic. Run Architecture folds from a
 * section into a div (preserving section-run-architecture), the section is renamed
 * away from "Composition" so it no longer collides with the trick-level Composition
 * concept card, and the duplicated run framing is removed.
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
  it('renames the section away from Composition and folds it into one topic', async () => {
    const html = await glossary();

    // renamed heading (resolves the collision with the trick-level Composition card);
    // the old "Symbolic Composition" name is gone from the page entirely (heading and
    // the cross-reference that named it)
    expect(html).toContain('Runs &amp; Sequences');
    expect(html).not.toContain('Symbolic Composition');

    const topicAt      = html.indexOf('id="chapter-runs-sequences"');
    const distinctionAt= html.indexOf('how tricks are <em>used</em>');
    const atlasAt       = html.indexOf('id="derivation-atlas"');
    const runArchAt     = html.indexOf('id="section-run-architecture"');
    const topicEnd      = html.indexOf('</section>', topicAt);

    expect(topicAt).toBeGreaterThan(-1);
    // the used-vs-defined distinction and run vocabulary now live inside the topic
    expect(distinctionAt).toBeGreaterThan(topicAt);
    expect(distinctionAt).toBeLessThan(topicEnd);
    // the decomposition table and the folded run architecture live inside the topic
    expect(atlasAt).toBeGreaterThan(topicAt);
    expect(atlasAt).toBeLessThan(topicEnd);
    expect(runArchAt).toBeGreaterThan(topicAt);
    expect(runArchAt).toBeLessThan(topicEnd);
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
