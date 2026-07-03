/**
 * Dex-count browse view (?view=dex-count) — Phase 4.1 prototype.
 *
 * The notation-display audit (2026-05-24) recommended `?view=dex-count`
 * as the highest-priority new browse axis. Buckets canonical tricks by
 * the number of [DEX] tokens in their operational_notation:
 *
 *   0 dex events  — kicks / stalls / set primitives
 *   1 dex event   — single-dex tricks (mirage, illusion, fairy)
 *   2 dex events  — most named compounds
 *   3+ dex events — deep compounds
 *
 * Those four buckets are the whole view: a trick without operational notation
 * is not dex-countable and does not render here at all. It stays visible in
 * the other browse views with the INCOMPLETE badge, and the view intro
 * reports the derived pending count.
 *
 * Uses the shared dictionary-trick-card partial; card shapes identical
 * to the ADD view.
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

const { dbPath } = setTestEnv('3215');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // 0-dex: kick / stall primitive
  insertFreestyleTrick(db, {
    slug: 'toe-stall', canonical_name: 'toe stall', adds: '1',
    base_trick: 'toe-stall', trick_family: 'toe-stall', category: 'surface',
    operational_notation: '[set] > toe',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // 1-dex: classic single-dex base
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage', adds: '2',
    base_trick: 'mirage', trick_family: 'mirage', category: 'dex',
    operational_notation: 'SET > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // 2-dex: typical compound (eggbeater = two opposite-out dexes terminating in toe-stall)
  insertFreestyleTrick(db, {
    slug: 'eggbeater-fixture', canonical_name: 'eggbeater fixture', adds: '3',
    base_trick: 'eggbeater-fixture', trick_family: 'eggbeater-fixture', category: 'compound',
    operational_notation: 'TOE >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // 3+ dex: deep compound (3 [DEX] tokens)
  insertFreestyleTrick(db, {
    slug: 'ripwalk-deep', canonical_name: 'ripwalk deep', adds: '4',
    base_trick: 'ripwalk-deep', trick_family: 'ripwalk-deep', category: 'compound',
    operational_notation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // No op_notation — not dex-countable, so absent from this view entirely
  insertFreestyleTrick(db, {
    slug: 'mystery-trick', canonical_name: 'mystery trick', adds: '3',
    base_trick: 'mystery-trick', trick_family: 'mystery-trick', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks?view=dex-count', () => {
  it('returns 200', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
  });

  it('renders the view-toggle link as active when ?view=dex-count', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.text).toContain('<span class="trick-view-toggle-active">By dex count</span>');
  });

  it('renders the view-toggle link as inactive when on a different view', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).toContain('href="/freestyle/tricks?view=dex-count"');
    expect(res.text).toContain('>By dex count</a>');
  });

  it('renders the dex-count intro line on the dex-count view only', async () => {
    const dexRes = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    expect(dexRes.text).toContain('how many dexterity moves they involve');
    const addRes = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(addRes.text).not.toContain('how many dexterity moves they involve');
  });

  it('groups tricks into the four dex buckets only (no unresolved bucket)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    // Bucket headings (pre-shaped labels)
    expect(res.text).toContain('<h2>0 dex events</h2>');
    expect(res.text).toContain('<h2>1 dex event</h2>');
    expect(res.text).toContain('<h2>2 dex events</h2>');
    expect(res.text).toContain('<h2>3+ dex events</h2>');
    // mystery-trick cannot be dex-counted, so no unresolved section renders for it.
    expect(res.text).not.toMatch(/<h2>Needs authoring/);
    expect(res.text).not.toContain('id="dex-unknown"');
    expect(res.text).not.toContain('id="dex-needs-authoring"');
    // The intro reports the derived pending count instead.
    expect(res.text).toContain('1 canonical trick awaits notation authoring');
  });

  it('places each seeded trick in the right bucket via section id; uncountable rows absent', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=dex-count');
    // Section ids match #dex-{count}.
    expect(res.text).toMatch(/id="dex-0"[^>]*>[\s\S]*?data-trick-slug="toe-stall"/);
    expect(res.text).toMatch(/id="dex-1"[^>]*>[\s\S]*?data-trick-slug="mirage"/);
    expect(res.text).toMatch(/id="dex-2"[^>]*>[\s\S]*?data-trick-slug="eggbeater-fixture"/);
    expect(res.text).toMatch(/id="dex-3"[^>]*>[\s\S]*?data-trick-slug="ripwalk-deep"/);
    expect(res.text).not.toContain('data-trick-slug="mystery-trick"');
  });

  it('does NOT render dex-count sections on the ADD view (avoids cross-view leakage)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).not.toContain('<h2>0 dex events</h2>');
    expect(res.text).not.toContain('<h2>1 dex event</h2>');
    expect(res.text).not.toContain('<h2>2 dex events</h2>');
    expect(res.text).not.toContain('id="dex-0"');
  });

  it('unknown query value falls back to the default ADD view (validation)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=does-not-exist');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<span class="trick-view-toggle-active">By ADD</span>');
    expect(res.text).not.toContain('<h2>0 dex events</h2>');
  });
});
