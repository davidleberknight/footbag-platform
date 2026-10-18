/**
 * In development, every rendered page names the view that rendered it in an
 * X-Footbag-View response header. The layout check lists each page under the
 * view it claims to exercise and reads this header to prove the claim, so a
 * missing or wrong header would let a listed page silently measure some other
 * template. The staging and production side of the same gate is
 * viewHeader.staging.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4613');

const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
process.env.FOOTBAG_ENV = 'development';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  createTestDb(dbPath).close();
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
  if (PRIOR_FOOTBAG_ENV === undefined) delete process.env.FOOTBAG_ENV;
  else process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
});

describe('X-Footbag-View (development boot)', () => {
  it('names the view a page rendered', async () => {
    // Without it, the layout check could not tell that a listed page renders the template it is listed under.
    const res = await request(createApp()).get('/legal');
    expect(res.status).toBe(200);
    expect(res.headers['x-footbag-view']).toBe('legal/index');
  });
});
