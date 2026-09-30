/**
 * Emerging-view redirect: routes.
 *
 * Replaces silent fall-through (?view=emerging rendered as default
 * add view) with explicit 302 redirect to /freestyle/observational
 * (the dedicated Emerging Vocabulary page).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3182');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('/freestyle/tricks?view=emerging redirect', () => {
  it('redirects to /freestyle/observational with status 302', async () => {
    const res = await page('/freestyle/tricks?view=emerging');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/freestyle/observational');
  });

  it('does NOT render the tricks-list HTML (no silent fall-through)', async () => {
    const res = await page('/freestyle/tricks?view=emerging');
    // 302 body is short; should not contain trick-list markup
    expect(res.text).not.toContain('id="add-bucket-');
    expect(res.text).not.toContain('class="dict-card');
  });

  it('valid views still render normally (regression check on view=add)', async () => {
    const res = await page('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Trick Dictionary');
  });

  it('unknown views OTHER than "emerging" still fall through to default add view (no regression)', async () => {
    const res = await page('/freestyle/tricks?view=garbage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Trick Dictionary');
  });
});
