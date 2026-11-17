/**
 * GET /freestyle/tricks/:slug — held-stall leg-over Movement neighbours overlay.
 *
 * wrap / walk-over / hop-over / eclipse each sit in their own singleton family,
 * so the curated movement-neighbourhood overlay is the only surface that links
 * them. Each of the four lists the other three as its closest relatives, under
 * the lineage rationale.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3534');
let createApp: Awaited<ReturnType<typeof importApp>>;
const getPage = cachedGet(() => createApp());

const t = (slug: string, adds: string, category: 'dex' | 'compound' = 'compound') =>
  ({ slug, canonical_name: slug.replace(/_/g, ' '), adds, base_trick: slug, trick_family: slug, category, is_active: 1 as const });

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const r of [t('wrap', '2', 'dex'), t('walk_over', '2', 'dex'), t('hop_over', '2', 'dex'), t('eclipse', '3')]) {
    insertFreestyleTrick(db, r);
  }
  db.close();
  createApp = await importApp();
});
afterAll(() => cleanupTestDb(dbPath));

async function page(slug: string): Promise<string> {
  const res = await getPage(`/freestyle/tricks/${slug}`);
  expect(res.status).toBe(200);
  return res.text;
}

// The closest-relatives block of a page, from its opening tag to the end of
// its list, so a link found there is one the block itself renders.
function closestRelatives(html: string): string {
  const start = html.indexOf('data-section="closest-relatives"');
  expect(start, 'the page renders no closest relatives').toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('</ul>', start));
}

// Defect caught: the four held-stall leg-overs, each in a family of its own,
// lose the only links between them, or lose the line saying how they relate.
describe('Held-stall leg-over Movement neighbours overlay', () => {
  const all = ['wrap', 'walk_over', 'hop_over', 'eclipse'];
  for (const slug of all) {
    it(`${slug} lists the other three as closest relatives, under the lineage rationale`, async () => {
      const block = closestRelatives(await page(slug));
      expect(block).toContain('class="relationship-why"');
      for (const other of all.filter(s => s !== slug)) {
        expect(block).toContain(`href="/freestyle/tricks/${other}"`);
      }
    });
  }
});
