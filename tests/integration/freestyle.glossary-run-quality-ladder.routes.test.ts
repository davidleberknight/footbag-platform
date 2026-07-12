/**
 * Integration tests for the run-quality ladder in the glossary's ADD philosophy
 * section.
 *
 * The ladder defines Tiltless through Godly by the minimum ADD every trick in a
 * run must reach, states that the lowest-ADD trick sets the tier, and gives one
 * mixed-ADD example. Genuine and BOP are named separately because they are not
 * floor-of-ADD rungs. Combo Analysis remains the application surface. The tier
 * definitions come from the combo-analysis authority, so the copy is static.
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

describe('Glossary — run-quality ladder', () => {
  it('renders the ladder and states that the lowest-ADD trick sets the tier', async () => {
    const html = await glossary();
    expect(html).toContain('Run-quality ladder');
    expect(html).toContain('lowest-ADD trick in the run sets the tier');
  });

  it('defines Tiltless through Godly by the minimum ADD of every trick', async () => {
    const html = await glossary();
    for (const tier of ['Tiltless', 'Guiltless', 'Tripless', 'Fearless', 'Beastly', 'Godly']) {
      expect(html, tier).toContain(`<dt>${tier}</dt>`);
    }
    // The floor thresholds are rendered from the authority definitions.
    expect(html).toContain('at least ADD 2'); // Tiltless
    expect(html).toContain('at least ADD 7'); // Godly
  });

  it('gives one mixed-ADD example resolved by the lowest trick', async () => {
    const html = await glossary();
    expect(html).toContain('a run of ADD 5, 3, and 6 tricks is');
    expect(html).toContain('because the ADD-3 trick is');
  });

  it('treats Genuine and BOP separately, not as rungs of the numeric ladder', async () => {
    const html = await glossary();
    expect(html).toContain('rungs of this numeric ladder');
    expect(html).toContain('Genuine is Guiltless excluding BOP tricks');
    // The numeric ladder itself does not list Genuine or BOP as tiers.
    const start = html.indexOf('Run-quality ladder');
    const ladder = html.slice(start, html.indexOf('a run of ADD 5, 3, and 6', start));
    expect(ladder).toContain('<dt>Godly</dt>');
    expect(ladder).not.toContain('<dt>Genuine</dt>');
    expect(ladder).not.toContain('<dt>BOP</dt>');
  });

  it('keeps Combo Analysis as the application surface', async () => {
    const html = await glossary();
    expect(html).toContain('href="/freestyle/combo-analysis"');
  });
});
