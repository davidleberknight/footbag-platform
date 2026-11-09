/**
 * Set Encyclopedia category intros: routes and rendering.
 *
 * Each category heading on the sets surface carries a one-line curator-authored
 * intro beneath it, so a reader meets framing rather than a bare heading. The
 * intros are authored once in the canonical set specs and surfaced here; these
 * cases pin that the page renders them under their own heading.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3183');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('/freestyle/sets — subtype intro one-liners', () => {
  it('intro renders after the h2 + count header (positional check)', async () => {
    const res = await page('/freestyle/sets');
    expect(res.status).toBe(200);
    // The h2 + count cluster is wrapped in sets-encyclopedia-subtype-head;
    // the intro paragraph follows immediately after the head closes.
    expect(res.text).toMatch(/<\/div>\s*<p class="sets-encyclopedia-subtype-intro">/);
  });
});
