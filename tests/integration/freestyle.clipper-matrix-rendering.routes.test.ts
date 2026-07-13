/**
 * GET /freestyle/tricks/:slug — clipper-terminal matrix rendering.
 *
 * The public trick page renders each matrix trick's canonical database
 * notation. A hand-authored core-trick specification also supplies atom
 * display strings, so this pins that what reaches the page is the canonical
 * value: if the spec ever drifts from the database again, the rendered page
 * stops matching the seeded canonical notation and this fails.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3661');

let createApp: Awaited<ReturnType<typeof importApp>>;

const MATRIX = [
  { slug: 'whirl',     name: 'whirl',     notation: 'SET > OP IN [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'rev_whirl', name: 'rev whirl', notation: 'SET > OP OUT [DEX] > OP CLIP [XBD] [DEL]' },
  { slug: 'swirl',     name: 'swirl',     notation: 'SET > SAME OUT [DEX] > SAME CLIP [XBD] [DEL]' },
  { slug: 'rev_swirl', name: 'rev swirl', notation: 'SET > SAME IN [DEX] > SAME CLIP [XBD] [DEL]' },
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const m of MATRIX) {
    insertFreestyleTrick(db, {
      slug: m.slug, canonical_name: m.name, adds: '3',
      base_trick: m.slug === 'rev_whirl' || m.slug === 'rev_swirl' ? 'whirl' : m.slug,
      trick_family: 'whirl', category: 'dex', is_active: 1,
      operational_notation: m.notation,
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// The notation renders token-highlighted (each token in its own span, angle
// brackets HTML-escaped), so assertions compare against the tag-stripped text.
function pageText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

describe('clipper-terminal matrix tricks render their canonical notation', () => {
  for (const m of MATRIX) {
    it(`${m.slug} page shows the canonical database notation`, async () => {
      const res = await request(await createApp()).get(`/freestyle/tricks/${m.slug}`);
      expect(res.status).toBe(200);
      expect(pageText(res.text)).toContain(m.notation);
      expect(res.text).not.toContain('BACK SWIRL');
    });
  }
});
