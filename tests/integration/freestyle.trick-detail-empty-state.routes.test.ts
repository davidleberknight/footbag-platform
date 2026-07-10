/**
 * Trick-detail empty-state rendering.
 *
 * An active trick with zero records and zero media renders a coherent page:
 * the hero and the page footer render, and the records and media sections are
 * omitted rather than rendering an empty table, a broken anchor, or a stub.
 * Complements the family-page empty-state coverage in
 * freestyle.family-detail.routes.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3250');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // A single active trick with valid notation, and deliberately no records and
  // no media seeded, so the detail page must render its empty state.
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl', adds: '3',
    base_trick: 'whirl', trick_family: 'whirl', category: 'dex',
    description: 'Rotational body-spin dex; anchor of the whirl family.',
    operational_notation: 'CLIP > OP IN [DEX] > SAME CLIP [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — empty state (no records, no media)', () => {
  it('renders a coherent 200 page for an active trick with zero records and zero media', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    // The main content rendered (the trick name and the always-present
    // source-note footer), not a 404, a 500, or a bare stub.
    expect(res.text).toContain('whirl');
    expect(res.text).toContain('href="/freestyle/records"');
  });

  it('omits the records section when the trick has no records', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    // The consecutive-records table renders only when recordCount > 0.
    expect(res.text).not.toContain('id="passback-records"');
    expect(res.text).not.toContain('<h2>Consecutive Records</h2>');
  });

  it('omits the media section when the trick has no reference media', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    // The Media section (and its anchor target) renders only when reference
    // media exists, so no dangling #media anchor is left behind.
    expect(res.text).not.toContain('id="media"');
  });
});
