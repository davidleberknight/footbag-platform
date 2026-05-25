/**
 * Emerging Vocabulary governance-lane bucketing.
 *
 * 2026-05-24 governance/polish slice. The observational page now
 * renders 4 explicit lanes (curator-authored governanceLane field on
 * each ObservationalTrick entry; default 'source-only'):
 *
 *   - Promotion queue
 *   - Formula review needed
 *   - Doctrine / policy blocked
 *   - Source-only documented
 *
 * No keyword heuristics — entries land in the lane their governanceLane
 * field names (or 'source-only' if the field is absent).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3220');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  // No DB seeding needed — observational entries are content-module-
  // driven via src/content/freestyleObservationalTricks.ts. The
  // production module currently has all entries defaulting to the
  // 'source-only' lane (no curator hand-promotion yet), so all lanes
  // except 'source-only' will be empty in this test.
  createTestDb(dbPath).close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/observational', () => {
  it('returns 200', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.status).toBe(200);
  });

  it('count strip references the total observational entry count, then routes to lanes', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.text).toContain('observed-count-strip');
    expect(res.text).toContain('observational tricks pending canonical review');
    expect(res.text).toContain('grouped into four governance lanes');
  });

  it('renders the Source-only documented lane (default lane for all uncurated entries)', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    expect(res.text).toContain('observed-lane--source-only');
    expect(res.text).toContain('id="lane-source-only"');
    expect(res.text).toContain('<h2>Source-only documented</h2>');
  });

  it('lane sections only render when they have at least one entry (no empty-lane noise)', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    // Promotion queue, Formula review, Doctrine-blocked are all currently
    // empty (no curator-authored lane field on any production entry).
    // They should NOT render as empty sections.
    expect(res.text).not.toContain('observed-lane--promotion-queue');
    expect(res.text).not.toContain('observed-lane--formula-review');
    expect(res.text).not.toContain('observed-lane--doctrine-blocked');
  });

  it('each observational card carries data-governance-lane attribute', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    // Every observational card is rendered through the
    // observed-card-fields partial; should expose its governance lane.
    expect(res.text).toMatch(/data-governance-lane="source-only"/);
  });

  it('card body fields are preserved (tracked-tag chip, source badge, optional reading)', async () => {
    const res = await request(await createApp()).get('/freestyle/observational');
    // Spot-check a representative observational entry's chips / labels
    // are still rendered after the lane-section refactor.
    expect(res.text).toContain('observed-card-source-badge');
    expect(res.text).toContain('tracked-tag');
  });
});
