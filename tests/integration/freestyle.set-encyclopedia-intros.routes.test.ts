/**
 * Set Encyclopedia category intros: routes and rendering.
 * one-liners. The /freestyle/sets surface previously rendered six
 * bare h2 category headings with no inline framing. The curator-
 * authored intros already exist in SET_SUBTYPE_SPECS in
 * freestyleCanonicalSets.ts; this slice surfaces them under each h2.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3183');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('/freestyle/sets — subtype intro one-liners', () => {
  it('each subtype section renders an intro paragraph under the h2', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.status).toBe(200);
    // The new class is the data-bearing tripwire
    expect(res.text).toContain('class="sets-encyclopedia-subtype-intro"');
  });

  it('the hero intro opens with a beginner-plain definition of a set', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.text).toContain('A set is how a freestyle trick begins');
  });

  it('intros for each curator-authored subtype are present in the rendered output', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    // Spot-check a phrase from each subtype's intro (sourced verbatim
    // from SET_SUBTYPE_SPECS in freestyleCanonicalSets.ts)
    expect(res.text).toMatch(/Foundational single-dex primitives/i);          // true-core
    expect(res.text).toMatch(/Multi-dex chains and derived entry topologies/i); // composite-derived
    expect(res.text).toMatch(/SPIN body token inside the set chain/i);          // rotational
    expect(res.text).toMatch(/CLIP-anchored cross-body rotational sets/i);      // whirl-swirl
    expect(res.text).toMatch(/initial contact is something other than TOE or CLIP/i); // uns
    expect(res.text).toMatch(/setting foot stays on the ground/i);             // rooted-antisymposium
  });

  it('intro renders after the h2 + count header (positional check)', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    // The h2 + count cluster is wrapped in sets-encyclopedia-subtype-head;
    // the intro paragraph follows immediately after the head closes.
    expect(res.text).toMatch(/<\/div>\s*<p class="sets-encyclopedia-subtype-intro">/);
  });
});
