/**
 * The lockout that follows the login ceiling is an administrator-configurable
 * duration, and it outlasts the window that counted up to it.
 *
 * Without a cooldown the refusal lasts only the remainder of the counting
 * window, so exhausting the attempts late in a window costs an attacker seconds
 * while doing it early costs them the whole window. The configured cooldown is
 * what makes the penalty the same either way, and it reaches the member as the
 * Retry-After on the refusal.
 *
 * Runs in its own database because it lowers the login thresholds for the whole
 * file; the shared login suite depends on the seeded defaults.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertSystemConfig } from '../fixtures/factories';

const { dbPath } = setTestEnv('4190');

const MAX_ATTEMPTS = 2;
const WINDOW_MINUTES = 1;
const COOLDOWN_MINUTES = 30;

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db: BetterSqlite3.Database = createTestDb(dbPath);
  insertSystemConfig(db, {
    config_key: 'login_rate_limit_max_attempts', value_json: String(MAX_ATTEMPTS),
  });
  insertSystemConfig(db, {
    config_key: 'login_rate_limit_window_minutes', value_json: String(WINDOW_MINUTES),
  });
  insertSystemConfig(db, {
    config_key: 'login_cooldown_minutes', value_json: String(COOLDOWN_MINUTES),
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
});

/** An address that was never registered: anti-enumeration means the attempt
 *  counts exactly as one against a real account would. */
function failedLogin(email: string) {
  return request(createApp())
    .post('/login')
    .type('form')
    .send({ email, password: 'wrong-password' });
}

describe('login lockout after the attempt ceiling', () => {
  it('holds the refusal for the configured cooldown, not the counting window', async () => {
    const email = 'cooldown-case@example.com';
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await failedLogin(email)).status).toBe(200);
    }
    const blocked = await failedLogin(email);
    expect(blocked.status).toBe(429);
    expect(blocked.text).toContain('Too many failed login attempts');

    // The one-minute counting window has at most 60 seconds left to run. A
    // Retry-After near the 30-minute cooldown is the only thing that can produce
    // this number, so it is proof the configured value was read and applied.
    const retryAfter = Number(blocked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(WINDOW_MINUTES * 60);
    expect(retryAfter).toBeLessThanOrEqual(COOLDOWN_MINUTES * 60);
    expect(retryAfter).toBeGreaterThan(COOLDOWN_MINUTES * 60 - 60);
  });

  it('keeps refusing a second time rather than forgiving on the next attempt', async () => {
    const email = 'cooldown-repeat@example.com';
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await failedLogin(email)).status).toBe(200);
    }
    expect((await failedLogin(email)).status).toBe(429);
    expect((await failedLogin(email)).status).toBe(429);
  });

  it('locks out one address without touching another', async () => {
    const locked = 'cooldown-locked@example.com';
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await failedLogin(locked)).status).toBe(200);
    }
    expect((await failedLogin(locked)).status).toBe(429);
    expect((await failedLogin('cooldown-untouched@example.com')).status).toBe(200);
  });
});
