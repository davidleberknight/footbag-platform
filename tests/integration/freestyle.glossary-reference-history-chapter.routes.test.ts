/**
 * Integration tests for the Reference & History chapter on GET /freestyle/glossary:
 * the fourth and final architectural chapter, folding the post-pedagogy reference
 * and history tail (observational panels, the movement-neighborhood case study,
 * advanced reference concepts, media-claim scope, community and historical
 * vocabulary, and sources) into one collapsible chapter.
 *
 * A concise "why history and sources matter" intro stays visible; the detail
 * folds into one chapter details. The tail sections keep their ids and order, so
 * every anchor, link, and citation is preserved; the former "End of Pedagogy"
 * tier-break divider is replaced by the chapter.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3569');

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

describe('Glossary — Reference & History chapter (final architectural chapter)', () => {
  it('keeps a visible intro and folds the reference/history tail into one chapter', async () => {
    const html = await glossary();

    const introAt   = html.indexOf('id="section-reference-history"');
    const chapterAt = html.indexOf('id="chapter-reference-history"');
    const firstTail = html.indexOf('id="connective-panels"');
    const lastTail  = html.indexOf('id="section-sources"');
    const chapterEnd = html.indexOf('</details>', lastTail);

    // the chapter section and its visible heading exist
    expect(introAt).toBeGreaterThan(-1);
    expect(html).toContain('Reference &amp; History');
    // the chapter details opens after the visible intro
    expect(chapterAt).toBeGreaterThan(introAt);
    // the first and last tail sections live inside the chapter
    expect(firstTail).toBeGreaterThan(chapterAt);
    expect(lastTail).toBeGreaterThan(firstTail);
    expect(chapterEnd).toBeGreaterThan(lastTail);
  });

  it('preserves every tail anchor and their order', async () => {
    const html = await glossary();
    const order = [
      'connective-panels',
      'inside-clipper-neighborhood',
      'section-advanced-reference',
      'section-media-claim-scope',
      'section-community',
      'section-historical',
      'section-sources',
    ];
    let prev = -1;
    for (const id of order) {
      const at = html.indexOf(`id="${id}"`);
      expect(at, `${id} present`).toBeGreaterThan(-1);
      expect(at, `${id} in order`).toBeGreaterThan(prev);
      prev = at;
    }
    // a deep-link target inside the folded tail is still present
    expect(html).toContain('id="tracking-vs-canonization"');
  });

  it('replaces the End of Pedagogy tier-break divider', async () => {
    const html = await glossary();
    expect(html).not.toContain('End of Pedagogy');
  });
});
