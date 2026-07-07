/**
 * Integration tests for the Structural Analysis chapter on GET /freestyle/glossary:
 * the merge of the former Notation and ADD Accounting sections into one collapsible
 * chapter (the second chapter-disclosure pilot).
 *
 * The notation framing and the ADD concept card stay visible; the notation
 * reference (compositional premise, grammar, worked examples, abbreviations,
 * operational reference) and the whole ADD accounting fold into one chapter
 * details. The two former sections' anchors are preserved (section-notation on
 * the merged section, section-add-accounting on a div inside it, plus
 * traditional-reference and run-quality). The ADD expansion is reconciled to one
 * term and the bracket-count checksum is stated once (in the card reveal), not
 * duplicated in the accounting prose.
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
  it('keeps the ADD card visible and folds both sections\' reference into one chapter', async () => {
    const html = await glossary();

    const cardAt        = html.indexOf('id="concept-add"');
    const chapterAt     = html.indexOf('id="chapter-structural-analysis"');
    const premiseAt     = html.indexOf('id="compositional-premise"');
    const accountingAt  = html.indexOf('id="section-add-accounting"');
    const chapterEnd    = html.indexOf('</section>', chapterAt);

    expect(chapterAt).toBeGreaterThan(-1);
    // the ADD concept card is the visible lead, before the chapter opens
    expect(cardAt).toBeGreaterThan(-1);
    expect(cardAt).toBeLessThan(chapterAt);
    // both the notation reference and the folded ADD accounting live inside the chapter
    expect(premiseAt).toBeGreaterThan(chapterAt);
    expect(premiseAt).toBeLessThan(chapterEnd);
    expect(accountingAt).toBeGreaterThan(chapterAt);
    expect(accountingAt).toBeLessThan(chapterEnd);
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
