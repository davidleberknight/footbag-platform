/**
 * Integration tests for the Reference & History topic on GET /freestyle/glossary:
 * the reference and history material (observational panels, the movement-neighborhood
 * case study, advanced reference concepts, media-claim scope, community and historical
 * vocabulary, and sources) presented as a major topic behind a destination card.
 *
 * The whole section, including its "why history and sources matter" intro, lives
 * inside the topic. The tail sections keep their ids and order, so every anchor,
 * link, and citation is preserved; no tier-break divider precedes the topic.
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

describe('Glossary — Reference & History topic (destination card + in-topic tail)', () => {
  it('folds the whole reference and history section into one topic behind a card', async () => {
    const html = await glossary();

    const topicAt   = html.indexOf('id="chapter-reference-history"');
    const sectionAt = html.indexOf('id="section-reference-history"');
    const firstTail = html.indexOf('id="connective-panels"');
    const lastTail  = html.indexOf('id="section-sources"');
    const topicEnd  = html.indexOf('</details>', lastTail);

    // the topic wrapper and the section heading both exist
    expect(topicAt).toBeGreaterThan(-1);
    expect(html).toContain('Reference &amp; History');
    // the topic details opens BEFORE the section it now wraps
    expect(sectionAt).toBeGreaterThan(topicAt);
    // the tail sections live inside the topic, in order, and the topic closes after them
    expect(firstTail).toBeGreaterThan(sectionAt);
    expect(lastTail).toBeGreaterThan(firstTail);
    expect(topicEnd).toBeGreaterThan(lastTail);
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
