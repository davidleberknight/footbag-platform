/**
 * Outside production the registration page still shows the early-access /
 * account-volatility warning, because development and staging accounts are
 * genuinely disposable. The default test harness runs as a non-production
 * environment (FOOTBAG_ENV unset), so config.footbagEnv is not 'production'.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3214');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /register — non-production shows the early-access notice', () => {
  it('renders the account-volatility warning outside production', async () => {
    const res = await request(createApp()).get('/register');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Early access notice');
    expect(res.text).toContain('under active development');
  });
});
