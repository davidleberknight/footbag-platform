/**
 * Forum short link: /forum sends every visitor, signed in or not, to the
 * off-site community forum, and nothing in the request can change the target.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4099');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  createTestDb(dbPath).close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /forum — off-site forum link', () => {
  it('redirects an anonymous visitor to the forum', async () => {
    const res = await request(createApp()).get('/forum');
    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe('https://modified.in/');
  });

  it('ignores request query input when building the redirect target', async () => {
    const res = await request(createApp())
      .get('/forum?redirect=https://attacker.example&path=/evil');
    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe('https://modified.in/');
  });

  // A visitor who cannot see a way to the forum from the site chrome never finds it.
  it('is linked from the site navigation on every page', async () => {
    const res = await request(createApp()).get('/clubs');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<a href="\/forum">/);
  });

  // A home-page visitor scanning the section cards would never learn the forum exists.
  it('is featured as a card button on the home page', async () => {
    const res = await request(createApp()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<a href="\/forum" class="btn /);
  });
});
