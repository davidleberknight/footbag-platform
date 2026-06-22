/**
 * Trick-detail notation rendering hygiene.
 *
 * When a trick's Movement notation (the JOB string) is byte-identical to its
 * Execution notation (the operational string), the two notation blocks would
 * render the same tokens. The detail page suppresses the Movement block and
 * keeps the Execution block. When the two strings differ, both blocks render.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3327');
let createApp: Awaited<ReturnType<typeof importApp>>;

const IDENTICAL = 'CLIP > OP IN [DEX] > OP TOE [DEL]';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'toe-stall', canonical_name: 'toe stall', adds: '1',
    base_trick: 'toe-stall', trick_family: 'toe-stall', category: 'surface',
    review_status: 'expert_reviewed', is_active: 1,
  });
  // Movement == Execution (byte-identical): Movement block must be suppressed.
  insertFreestyleTrick(db, {
    slug: 'dedup-identical', canonical_name: 'dedup identical', adds: '2',
    base_trick: 'toe-stall', trick_family: 'toe-stall', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
    notation: IDENTICAL, operational_notation: IDENTICAL,
  });
  // Movement != Execution: both blocks render.
  insertFreestyleTrick(db, {
    slug: 'dedup-distinct', canonical_name: 'dedup distinct', adds: '2',
    base_trick: 'toe-stall', trick_family: 'toe-stall', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
    notation: 'DEDUP DISTINCT', operational_notation: IDENTICAL,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('trick-detail notation block dedup', () => {
  it('suppresses the Movement block when it is byte-identical to Execution', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/dedup-identical');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Execution notation');
    expect(res.text).not.toContain('Movement notation');
  });

  it('renders both blocks when Movement and Execution differ', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/dedup-distinct');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Movement notation');
    expect(res.text).toContain('Execution notation');
  });
});
