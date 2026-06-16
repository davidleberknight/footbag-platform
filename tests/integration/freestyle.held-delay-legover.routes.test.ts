/**
 * GET /freestyle/tricks/:slug — held-delay leg-over Movement neighbours overlay.
 *
 * wrap / walk-over / hop-over / eclipse each sit in their own singleton family,
 * so the curated movement-neighbourhood overlay is the only surface that links
 * them. Each of the four lists the other three under "Movement neighbours" with
 * the lineage rationale.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3534');
let createApp: Awaited<ReturnType<typeof importApp>>;

const t = (slug: string, adds: string, category: 'dex' | 'compound' = 'compound') =>
  ({ slug, canonical_name: slug.replace(/-/g, ' '), adds, base_trick: slug, trick_family: slug, category, is_active: 1 as const });

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const r of [t('wrap', '2', 'dex'), t('walk-over', '2', 'dex'), t('hop-over', '2', 'dex'), t('eclipse', '3')]) {
    insertFreestyleTrick(db, r);
  }
  db.close();
  createApp = await importApp();
});
afterAll(() => cleanupTestDb(dbPath));

async function page(slug: string): Promise<string> {
  const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
  expect(res.status).toBe(200);
  return res.text;
}

const RATIONALE = 'Continuous-control held-delay leg-over lineage. Walk-over is the stepping variant, Hop-over the jumping variant, and Eclipse the airborne extension.';

describe('Held-delay leg-over Movement neighbours overlay', () => {
  const all = ['wrap', 'walk-over', 'hop-over', 'eclipse'];
  for (const slug of all) {
    it(`${slug} lists the other three under Movement neighbours with the lineage rationale`, async () => {
      const html = await page(slug);
      expect(html).toContain('Movement neighbours');
      expect(html).toContain(RATIONALE);
      for (const other of all.filter(s => s !== slug)) {
        expect(html).toContain(`href="/freestyle/tricks/${other}"`);
      }
    });
  }
});
