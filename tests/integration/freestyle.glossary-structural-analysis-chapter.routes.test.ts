/**
 * Integration tests for the Structural Analysis topic on GET /freestyle/glossary:
 * the former Notation and ADD Accounting sections, merged into one section and
 * presented as a major topic behind a destination card.
 *
 * The whole section (its notation framing, the ADD concept card, the notation
 * reference, and the ADD accounting) lives inside the topic. The former sections'
 * anchors are preserved (section-notation on the merged section, section-add-accounting
 * on a div inside it, plus traditional-reference and run-quality). The ADD expansion
 * is reconciled to one term and the bracket-count checksum is stated once (in the
 * concept card reveal), not duplicated in the accounting prose.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3567');

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

describe('Glossary — Structural Analysis chapter (Notation + ADD merge)', () => {
  it('folds the notation and ADD reference into one topic behind a destination card', async () => {
    const html = await glossary();

    const topicAt       = html.indexOf('id="chapter-structural-analysis"');
    const cardAt        = html.indexOf('id="concept-add"');
    const premiseAt     = html.indexOf('id="compositional-premise"');
    const accountingAt  = html.indexOf('id="section-add-accounting"');
    const topicEnd      = html.indexOf('</section>', topicAt);

    expect(topicAt).toBeGreaterThan(-1);
    expect(html).toContain('class="glossary-topic-card-title"');
    // the ADD concept card, the notation reference, and the ADD accounting all live inside the topic
    expect(cardAt).toBeGreaterThan(topicAt);
    expect(cardAt).toBeLessThan(topicEnd);
    expect(premiseAt).toBeGreaterThan(topicAt);
    expect(premiseAt).toBeLessThan(topicEnd);
    expect(accountingAt).toBeGreaterThan(topicAt);
    expect(accountingAt).toBeLessThan(topicEnd);
  });

  it('preserves the merged sections\' anchors and inbound-link targets', async () => {
    const html = await glossary();
    expect(html).toContain('id="section-notation"');       // merged section keeps this id
    expect(html).toContain('id="section-add-accounting"');  // preserved on a div
    expect(html).toContain('id="traditional-reference"');   // history.hbs inbound link
    expect(html).toContain('id="run-quality"');
    expect(html).toContain('ADD Accounting');               // demoted heading text
  });

  it('reconciles the ADD expansion to one term and states the checksum only once', async () => {
    const html = await glossary();
    // single reconciled expansion
    expect(html).toContain('ADD (Additional Degree of Difficulty)');
    // the accounting prose no longer restates the bracket-count checksum
    expect(html).not.toContain('contributes 1 ADD');
    // the checksum lives in the card reveal
    const cardMatch = html.match(/id="concept-add"[\s\S]*?<\/div>/);
    expect(cardMatch![0]).toContain('the bracket count is the ADD');
  });
});
