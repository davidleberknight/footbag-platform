/**
 * The net landing page before any net results exist.
 *
 * Contract verified:
 *   - an explore card whose section would open empty (teams, events) is left
 *     off rather than shown greyed out, so the page never promises a section it
 *     cannot open
 *   - the cards that always have a destination (rules, equipment) still render
 *     and link to it
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4739');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  createTestDb(dbPath).close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /net with no net results', () => {
  // Defect caught: a visitor is shown a Teams or Events card for a section with
  // nothing in it, either as a dead "coming soon" card or as a link to an empty
  // page.
  it('leaves off the teams and events cards and keeps rules and equipment', async () => {
    const res = await request(createApp()).get('/net');

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('href="/net/teams"');
    expect(res.text).not.toContain('href="/net/events"');
    expect(res.text).not.toMatch(/coming soon/i);
    expect(res.text).toContain('href="/rules/net/footbag-net"');
    expect(res.text).toContain('href="/equipment#net"');
  });
});
