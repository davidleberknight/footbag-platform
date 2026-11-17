/**
 * Cross-link resolution on freestyle dictionary surfaces: a cross-link is emitted
 * only when its target page actually resolves, so no surface renders a link that
 * 404s.
 *
 * The path pinned:
 *   - Modifier-page "Related modifiers": a related system that is a canonical set
 *     with no modifier page links to its set-encyclopedia page, never to a dead
 *     /freestyle/modifier/<slug> URL. Zulu's related system (weaving) comes from
 *     the canonical-set content module.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedStagedSets } from '../fixtures/stagedSets';
import { insertFreestyleTrickModifier } from '../fixtures/factories';

const { dbPath } = setTestEnv('3129');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedSets(db);

  // zulu: a ducking set registered as a body modifier, so its modifier page
  // renders; its related system (weaving) is read from the canonical-set content
  // module and is a canonical set with no modifier page here.
  insertFreestyleTrickModifier(db, { slug: 'zulu', modifier_name: 'zulu', add_bonus: 1, modifier_type: 'body' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('modifier-page related systems link to a surface that exists', () => {
  it('links a set-only related system to its set page, never a dead modifier URL', async () => {
    const res = await request(await createApp()).get('/freestyle/modifier/zulu');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/freestyle/sets/weaving');
    expect(res.text).not.toContain('/freestyle/modifier/weaving');
  });
});
