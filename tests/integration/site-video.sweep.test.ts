/**
 * Every video a public page plays is a stored media item: a curated item with
 * hashtags, found by browsing media like any other video. A video written into
 * page code (a static file, or a YouTube id in a service) carries no hashtags
 * and never appears in browsing. So, with no media stored at all, no public
 * page may play a single video; any player that still renders came from code.
 *
 * The sweep reads the live public route table, so a page added later is held to
 * the same rule on the day it ships.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { loadRouteTable } from '../fixtures/routeTable';

const { dbPath } = setTestEnv('3962');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;
let pagePaths: string[];

beforeAll(async () => {
  createTestDb(dbPath).close();
  createApp = await importApp();
  const table = await loadRouteTable();
  pagePaths = [...new Set(
    table.allRoutes
      .filter((r) => r.method === 'GET' && !r.path.includes(':') && !r.path.startsWith('/admin'))
      .map((r) => r.path),
  )].sort();
});

afterAll(() => cleanupTestDb(dbPath));

describe('public pages with no media stored', () => {
  // Defect caught: a page plays a video its code supplies rather than a stored
  // media item, so a visitor browsing media by its sport, event or player
  // never finds it.
  it('play no video at all', async () => {
    const app = createApp();
    const players: string[] = [];
    let rendered = 0;
    for (const path of pagePaths) {
      const res = await request(app).get(path);
      if (res.status !== 200 || !/text\/html/.test(res.headers['content-type'] ?? '')) continue;
      rendered += 1;
      if (/<video\b/.test(res.text) || res.text.includes('class="video-facade"')) players.push(path);
    }
    // The sweep is only evidence if it reached the section landings that
    // feature videos once their media is stored.
    for (const landing of ['/net', '/freestyle', '/consecutives', '/golf', '/sideline', '/x-square']) {
      expect(pagePaths, `sweep never reaches ${landing}`).toContain(landing);
    }
    expect(rendered).toBeGreaterThan(20);
    expect(players).toEqual([]);
  });
});
