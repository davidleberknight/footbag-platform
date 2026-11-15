/**
 * Integration tests for the section layout of GET /freestyle/concepts.
 *
 * Freestyle Concepts is one short page of top-level sections with an
 * "On this page" list at the top. Every section is listed there, in page
 * order, and every entry lands on a section, so a reader can always reach
 * each topic from the top of the page. Each section keeps the id that other
 * pages link to.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3571');

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

/** Section ids other pages and the glossary deep-link to, in page order. */
const LINKED_SECTION_IDS = [
  'section-core-concepts',
  'section-surfaces',
  'section-dexterities',
  'section-timing-sets',
  'section-modifiers',
  'section-notation',
  'section-composition',
  'section-sources',
];

function sectionIds(html: string): string[] {
  return [...html.matchAll(/<section class="content-section" id="([^"]+)"/g)].map(m => m[1]);
}

function onThisPageTargets(html: string): string[] {
  const nav = html.match(/<nav aria-label="On this page">([\s\S]*?)<\/nav>/);
  expect(nav, 'on-this-page list').not.toBeNull();
  return [...nav![1].matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
}

describe('Freestyle Concepts — section layout', () => {
  it('renders every linked section, in page order', async () => {
    const html = await concepts();
    const ids = sectionIds(html);
    let prev = -1;
    for (const id of LINKED_SECTION_IDS) {
      const at = ids.indexOf(id);
      expect(at, `${id} is a section`).toBeGreaterThan(-1);
      expect(at, `${id} in page order`).toBeGreaterThan(prev);
      prev = at;
    }
  });

  it('lists every section in the on-this-page list, in page order, and nothing else', async () => {
    const html = await concepts();
    expect(onThisPageTargets(html)).toEqual(sectionIds(html));
  });

  it('gives each section exactly one top-level heading', async () => {
    const html = await concepts();
    const ids = sectionIds(html);
    for (const [i, id] of ids.entries()) {
      const start = html.indexOf(`id="${id}"`);
      const end = i + 1 < ids.length ? html.indexOf(`id="${ids[i + 1]}"`) : html.indexOf('</main>', start);
      const body = html.slice(start, end === -1 ? undefined : end);
      expect((body.match(/<h2[\s>]/g) ?? []).length, `${id} headings`).toBe(1);
    }
  });
});
