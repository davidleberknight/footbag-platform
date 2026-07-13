/**
 * Paradox and Miraging doctrine on the live teaching surfaces.
 *
 * Paradox is a hip and plant relationship applied to a single dexterity; it
 * never adds a second dex, so no active teaching surface may describe it as
 * happening "between two dexes". Miraging is descriptive standalone-movement
 * language; the paradox modifier page (the last place that presented it as a
 * scored uptime set) must never present it as a set or ADD-bearing operator.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3664');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function page(path: string): Promise<string> {
  const res = await request(await createApp()).get(path);
  expect(res.status).toBe(200);
  return res.text;
}

describe('paradox is a single-dex relationship on every live teaching surface', () => {
  for (const path of [
    '/freestyle/modifier/paradox',
    '/freestyle/modifier/spinning',
    '/freestyle/learn',
    '/freestyle/glossary',
  ]) {
    it(`${path} never describes paradox as happening between two dexes`, async () => {
      const html = await page(path);
      expect(html).not.toMatch(/between two dex/i);
    });
  }

  it('the paradox page teaches the single-dex relationship', async () => {
    const html = await page('/freestyle/modifier/paradox');
    expect(html).toMatch(/dex still happens once|single dex/i);
  });
});

describe('miraging never reappears as a scored set on the paradox page', () => {
  it('the related-concepts entry frames miraging as descriptive, not a set', async () => {
    const html = await page('/freestyle/modifier/paradox');
    expect(html).not.toMatch(/miraging[^.<]{0,60}(uptime dex set|\+1 uptime)/i);
    expect(html).toMatch(/not a launch set and not a scored operator/i);
  });
});
