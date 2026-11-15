/**
 * Freestyle Concepts public-prose guard.
 *
 * GET /freestyle/concepts is read by visitors, so its copy never carries the
 * working vocabulary of curation or promises about content still to come, and
 * it never brings back a chart or a hand-entered count that would put a second,
 * drifting copy of the By the Numbers figures in front of readers.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { seedStagedFamilies } from '../fixtures/stagedFamilies';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3528');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);
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

describe('Freestyle Concepts public prose', () => {
  it('keeps internal vocabulary and promises about later out of the page copy', async () => {
    const html = await concepts();
    expect(html).toContain('id="section-core-concepts"');
    for (const phrase of [
      'display tier', 'claim scope', 'teaching layer', 'teaches without resolving',
      'interpretation doctrine', 'editorial equivalence', 'embodied cousins',
      'difficulty frontier', 'cohort test', 'Forthcoming', 'not yet built', 'Will expand', 'Reference Media',
    ]) {
      expect(html, phrase).not.toContain(phrase);
    }
  });

  it('exposes no ruling tags, sprint labels or curator field names', async () => {
    const html = await concepts();
    expect(html).toContain('id="section-core-concepts"');
    expect(html).not.toMatch(/\bpt\d+\b/i);
    expect(html).not.toMatch(/Wave[- ]?\d/i);
    expect(html).not.toMatch(/Slice [A-Z]\b/);
    expect(html).not.toMatch(/Sprint/i);
    expect(html).not.toMatch(/curatorConfirmPending/i);
    expect(html).not.toMatch(/curatorNote/i);
  });

  it('carries no bar charts and no hand-entered counts', async () => {
    const html = await concepts();
    expect(html).toContain('id="section-core-concepts"');
    expect(html).not.toMatch(/class="[^"]*(gloss-histogram|gloss-bar)/);
    expect(html).not.toContain('id="how-widely-systems-appear"');
    for (const frozen of ['(207)', '(197)', '(328)', '(252)']) {
      expect(html, `hand-entered count ${frozen}`).not.toContain(frozen);
    }
  });
});
