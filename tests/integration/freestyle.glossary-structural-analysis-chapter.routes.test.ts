/**
 * Integration tests for the two structural chapters on GET /freestyle/concepts:
 * Structural Analysis (how a trick name is written and read) and ADD Accounting
 * (where a trick's difficulty number comes from), each its own top-level chapter
 * card.
 *
 * Notation framing, the ADD concept card and the notation reference live in the
 * Structural Analysis chapter; the ADD accounting is a chapter of its own, so a
 * reader looking for what an ADD number means finds it from the closed state
 * instead of having to open a chapter labelled for notation. Every anchor is
 * preserved across the two (section-notation and section-add-accounting on the
 * chapter sections, plus traditional-reference and run-quality). The ADD
 * expansion is reconciled to one term and the bracket-count checksum is stated
 * once (in the concept card reveal), not duplicated in the accounting prose.
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

async function concepts(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/concepts');
  expect(res.status).toBe(200);
  return res.text;
}

describe('Freestyle Concepts — Structural Analysis and ADD Accounting chapters', () => {
  it('keeps the notation material in the Structural Analysis chapter', async () => {
    const html = await concepts();

    const topicAt   = html.indexOf('id="chapter-structural-analysis"');
    const cardAt    = html.indexOf('id="concept-add"');
    const premiseAt = html.indexOf('id="compositional-premise"');
    const topicEnd  = html.indexOf('id="chapter-add-accounting"');

    expect(topicAt).toBeGreaterThan(-1);
    expect(html).toContain('class="dict-tile-title"');
    // the ADD concept card and the notation reference live inside that chapter
    expect(cardAt).toBeGreaterThan(topicAt);
    expect(cardAt).toBeLessThan(topicEnd);
    expect(premiseAt).toBeGreaterThan(topicAt);
    expect(premiseAt).toBeLessThan(topicEnd);
  });

  it('gives the ADD accounting a top-level chapter card of its own', async () => {
    const html = await concepts();

    const chapterAt    = html.indexOf('id="chapter-add-accounting"');
    const accountingAt = html.indexOf('id="section-add-accounting"');
    const notationEnd  = html.indexOf('id="chapter-add-accounting"');

    expect(chapterAt).toBeGreaterThan(-1);
    expect(html).toContain('<details class="dict-tile" id="chapter-add-accounting">');
    // the accounting section is the chapter's own body, not a block inside the notation chapter
    expect(accountingAt).toBeGreaterThan(chapterAt);
    expect(html.indexOf('id="section-notation"')).toBeLessThan(notationEnd);
    // its title and description name the subject, so it is findable while closed
    expect(html).toContain('>ADD Accounting<');
    expect(html).toContain("Where a trick's difficulty number comes from, and how the weights add up.");
  });

  it('preserves both chapters\' anchors and inbound-link targets', async () => {
    const html = await concepts();
    expect(html).toContain('id="section-notation"');        // notation chapter section
    expect(html).toContain('id="section-add-accounting"');  // ADD chapter section
    expect(html).toContain('id="traditional-reference"');   // history.hbs inbound link
    expect(html).toContain('id="run-quality"');
    expect(html).toContain('ADD Accounting');
  });

  it('reconciles the ADD expansion to one term and states the checksum only once', async () => {
    const html = await concepts();
    // single reconciled expansion
    expect(html).toContain('ADD (Additional Degree of Difficulty)');
    // the accounting prose no longer restates the bracket-count checksum
    expect(html).not.toContain('contributes 1 ADD');
    // the checksum lives in the card reveal, stated over scoring brackets: an
    // action marker sits in brackets and carries no weight, so a plain bracket
    // count is not the ADD
    const cardMatch = html.match(/id="concept-add"[\s\S]*?<\/div>/);
    expect(cardMatch![0]).toContain('the scoring-bracket count is the ADD');
  });
});
