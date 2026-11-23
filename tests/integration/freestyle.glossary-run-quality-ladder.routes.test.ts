/**
 * Integration tests for the run-quality ladder in the Freestyle Concepts ADD
 * philosophy section.
 *
 * The ladder defines Tiltless through Godly by the minimum ADD every trick in a
 * string must reach. Genuine and BOP are named separately because they are not
 * floor-of-ADD rungs. Combo Analysis remains the application surface. The tier
 * definitions come from the combo-analysis authority.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3567');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function concepts(): Promise<string> {
  const res = await page('/freestyle/concepts');
  expect(res.status).toBe(200);
  return res.text;
}

describe('Freestyle Concepts — run-quality ladder', () => {
  // Defect caught: the ladder's section, which other pages link to by its
  // anchor, is missing from the Concepts page.
  it('renders the ladder at its anchor', async () => {
    const html = await concepts();
    expect(html).toContain('id="run-quality"');
  });

  it('defines Tiltless through Godly by the minimum ADD of every trick', async () => {
    const html = await concepts();
    for (const tier of ['Tiltless', 'Guiltless', 'Tripless', 'Fearless', 'Beastly', 'Godly']) {
      expect(html, tier).toContain(`<dt>${tier}</dt>`);
    }
    // The floor thresholds are rendered from the authority definitions.
    expect(html).toContain('at least ADD 2'); // Tiltless
    expect(html).toContain('at least ADD 7'); // Godly
  });

  it('treats Genuine and BOP separately, not as rungs of the numeric ladder', async () => {
    const html = await concepts();
    // The numeric ladder itself does not list Genuine or BOP as tiers.
    const start = html.indexOf('id="run-quality"');
    const ladder = html.slice(start, html.indexOf('</dl>', start));
    expect(ladder).toContain('<dt>Godly</dt>');
    expect(ladder).not.toContain('<dt>Genuine</dt>');
    expect(ladder).not.toContain('<dt>BOP</dt>');
  });

  it('keeps Combo Analysis as the application surface', async () => {
    const html = await concepts();
    expect(html).toContain('href="/freestyle/combo-analysis"');
  });
});
