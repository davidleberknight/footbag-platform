/**
 * Integration test for the Consecutives page when no records are loaded.
 *
 * Covers:
 *   GET /consecutives — with an empty consecutive kicks records table
 *
 * Verifies:
 *   - the page still renders its orientation sections
 *   - no records section renders
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('4735');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  createTestDb(dbPath).close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /consecutives with no records loaded', () => {
  // Defect caught: an empty records table breaks the page or leaves empty
  // records sections behind.
  it('renders the orientation sections and no records section', async () => {
    const res = await request(createApp()).get('/consecutives');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="competitions"');
    expect(res.text).not.toContain('id="world-records"');
    expect(res.text).not.toContain('<table');
    // No clip is seeded here, so no empty video frame is drawn.
    expect(res.text).not.toContain('class="demo-video');
  });
});
