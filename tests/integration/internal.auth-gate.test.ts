/**
 * Router-level auth + admin gate on /internal/*.
 *
 * All routes under /internal inherit `requireAuth, requireAdmin` at the
 * router level (see src/routes/internalRoutes.ts):
 *  - Unauthenticated requests redirect to /login (any verb).
 *  - Authenticated non-admin requests get 403.
 *  - Authenticated admin requests pass through to the controller.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3116');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID = 'member-internal-gate';
const ADMIN_ID  = 'admin-internal-gate';
const MEMBER_COOKIE = `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
const ADMIN_COOKIE  = `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID })}`;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_ID, slug: 'member-internal-gate', display_name: 'Member' });
  insertMember(db, { id: ADMIN_ID,  slug: 'admin-internal-gate',  display_name: 'Admin', is_admin: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('/internal/* GET requires admin', () => {
  it('redirects unauthenticated to /login', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/persons/qc');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/^\/login\?returnTo=/);
  });

  it('returns 403 for non-admin authenticated members', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/persons/qc').set('Cookie', MEMBER_COOKIE);
    expect(res.status).toBe(403);
  });

  it('serves the page for admin members', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/persons/qc').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
  });
});

describe('/internal/* state-changing POST requires admin', () => {
  it('redirects unauthenticated POST to /login', async () => {
    const app = createApp();
    const res = await request(app).post('/internal/net/team-corrections/test-id/decision');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/^\/login\?returnTo=/);
  });

  it('returns 403 for non-admin authenticated POST', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/internal/net/team-corrections/test-id/decision')
      .set('Cookie', MEMBER_COOKIE);
    expect(res.status).toBe(403);
  });
});
