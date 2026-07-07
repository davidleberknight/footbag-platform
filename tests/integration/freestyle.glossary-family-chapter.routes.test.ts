/**
 * Integration tests for the Family Encyclopedia topic on GET /freestyle/glossary.
 *
 * After Foundations the glossary presents a shelf of major topics. Each topic is
 * a details whose summary is a destination card; opening the card unfolds the
 * whole topic section in place. The Family Encyclopedia topic wraps the entire
 * families section (its teaching prose and its reference bulk together) behind
 * one card. This suite pins that structure: the card exists, the section content
 * lives inside the topic, and nothing was dropped by the wrapping.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3566');

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

describe('Glossary — Family Encyclopedia topic (destination card + in-topic content)', () => {
  it('wraps the whole family section in a topic details behind a destination card', async () => {
    const html = await glossary();

    const topicAt     = html.indexOf('id="chapter-family-encyclopedia"');
    const teachingAt  = html.indexOf('What makes a family?');
    const edgeCasesAt = html.indexOf('id="edge-cases-special-structures"');
    const nextTopicAt = html.indexOf('id="chapter-structural-analysis"');

    // the topic wrapper exists and is a details with a destination card
    expect(topicAt).toBeGreaterThan(-1);
    expect(html).toContain('class="glossary-topic"');
    expect(html).toContain('class="glossary-topic-card-title"');

    // the teaching lead now lives INSIDE the topic (after the card), not above it
    expect(teachingAt).toBeGreaterThan(topicAt);
    expect(teachingAt).toBeLessThan(nextTopicAt);

    // the reference bulk (edge cases, roster) lives inside the same topic
    expect(edgeCasesAt).toBeGreaterThan(teachingAt);
    expect(edgeCasesAt).toBeLessThan(nextTopicAt);
  });

  it('keeps all the family reference content present (nothing dropped by wrapping)', async () => {
    const html = await glossary();
    expect(html).toContain('id="edge-cases-special-structures"');
    expect(html).toContain('Other foundational atoms');
    expect(html).toContain('id="section-families"'); // the section element is preserved
  });
});
