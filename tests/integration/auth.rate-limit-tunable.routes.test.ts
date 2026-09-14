/**
 * The login rate-limit ceiling keyed on the (email, address) pair is
 * configuration, not a constant. This lowers it to a value reachable in a
 * handful of requests and proves the limiter honours the configured number
 * rather than a hard-coded one.
 *
 * Own file, own database, and only one ceiling lowered in it. The ceilings live
 * in an append-only config table, so a case that lowers one cannot put it back,
 * only append a further row, and any case sharing the database afterwards reads
 * whatever the last append left. The account-keyed ceiling has a file of its
 * own for the same reason, and because two lowered ceilings in one database
 * means the lower of them always refuses first and the other is never measured.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertSystemConfig } from '../fixtures/factories';

const { dbPath } = setTestEnv('4206');

const CONFIGURED_CAP = 2;

let app: Express.Application;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertSystemConfig(db, {
    config_key: 'login_rate_limit_max_attempts',
    value_json: String(CONFIGURED_CAP),
    reason_text: 'Lowered so the ceiling is reachable in a few requests',
  });
  db.close();

  const createApp = await importApp();
  app = createApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('POST /login — the per-(email, address) ceiling is read from configuration', () => {
  it('refuses the attempt after the configured ceiling, with a Retry-After', async () => {
    const EMAIL = 'tune-test@example.com';
    for (let i = 0; i < CONFIGURED_CAP; i++) {
      const ok = await request(app)
        .post('/login').type('form')
        .send({ email: EMAIL, password: 'wrong-password' });
      expect(ok.status, `attempt ${i + 1} of ${CONFIGURED_CAP} is under the ceiling`).toBe(200);
    }
    const blocked = await request(app)
      .post('/login').type('form')
      .send({ email: EMAIL, password: 'wrong-password' });
    expect(blocked.status).toBe(429);
    expect(blocked.text).toContain('Too many failed login attempts');
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});
