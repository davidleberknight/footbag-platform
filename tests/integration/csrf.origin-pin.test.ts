/**
 * End-to-end verification of the Origin-header CSRF pin (DD §3.3).
 *
 * This file imports `supertest` directly (not the auto-Origin helper at
 * tests/fixtures/supertestWithOrigin.ts) so it can drive the full Origin /
 * Referer matrix by hand.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3192');
const SAME_ORIGIN = process.env.PUBLIC_BASE_URL!;
const ATTACKER    = 'https://attacker.example';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('CSRF Origin pin — GET requests are not gated', () => {
  it('GET / returns a non-403 response (Origin not consulted)', async () => {
    const app = createApp();
    const res = await request(app).get('/');
    expect(res.status).not.toBe(403);
  });

  it('GET / with an attacker Origin still passes (Origin not consulted on GET)', async () => {
    const app = createApp();
    const res = await request(app).get('/').set('Origin', ATTACKER);
    expect(res.status).not.toBe(403);
  });
});

describe('CSRF Origin pin — POST matrix', () => {
  it('matching Origin reaches the controller (no 403)', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/login')
      .set('Origin', SAME_ORIGIN)
      .type('form')
      .send({ email: 'no-such-user@example.com', password: 'whatever' });
    expect(res.status).not.toBe(403);
  });

  it('mismatched Origin → 403 forbidden', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/login')
      .set('Origin', ATTACKER)
      .type('form')
      .send({ email: 'a@b.com', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.text).toMatch(/Forbidden/i);
  });

  it('Origin literal "null" → 403', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/login')
      .set('Origin', 'null')
      .type('form')
      .send({ email: 'a@b.com', password: 'x' });
    expect(res.status).toBe(403);
  });

  it('no Origin, matching Referer → passes', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/login')
      .set('Referer', `${SAME_ORIGIN}/login`)
      .type('form')
      .send({ email: 'a@b.com', password: 'x' });
    expect(res.status).not.toBe(403);
  });

  it('no Origin, mismatched Referer → 403', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/login')
      .set('Referer', `${ATTACKER}/page`)
      .type('form')
      .send({ email: 'a@b.com', password: 'x' });
    expect(res.status).toBe(403);
  });

  it('no Origin, no Referer → 403', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ email: 'a@b.com', password: 'x' });
    expect(res.status).toBe(403);
  });

  it('Origin present-but-mismatched + matching Referer → still 403 (no fallback)', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/login')
      .set('Origin',  ATTACKER)
      .set('Referer', `${SAME_ORIGIN}/login`)
      .type('form')
      .send({ email: 'a@b.com', password: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('CSRF Origin pin — /ipc/* exemption', () => {
  it('POST /ipc/job-events with attacker Origin still reaches the IPC controller', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/ipc/job-events')
      .set('Origin', ATTACKER)
      .send({ kind: 'noop' });
    // Reaches the controller's inline shared-secret check; missing
    // X-Internal-Secret → 401, not 403. The 401 proves the pin exempted /ipc/.
    expect(res.status).toBe(401);
  });

  it('POST /ipc/job-events without any Origin reaches the IPC controller', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/ipc/job-events')
      .send({ kind: 'noop' });
    expect(res.status).toBe(401);
  });
});

describe('CSRF Origin pin — verb coverage', () => {
  for (const verb of ['put', 'patch', 'delete'] as const) {
    it(`${verb.toUpperCase()} with mismatched Origin → 403`, async () => {
      const app = createApp();
      const res = await request(app)
        [verb]('/admin')
        .set('Origin', ATTACKER);
      expect(res.status).toBe(403);
    });
  }
});
