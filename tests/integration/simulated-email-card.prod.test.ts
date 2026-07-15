/**
 * Integration tests for production-mode rendering of /register/check-email.
 *
 * Simulates real prod: SES_ADAPTER=live. No card is rendered (neither the
 * dev table nor the staging warning). This is the permanent contract for
 * what end users see when the live SES transport is active.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3073');

process.env.SES_ADAPTER       = 'live';
process.env.SES_FROM_IDENTITY = 'noreply@test.example.com';
process.env.AWS_REGION        = 'us-east-1';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /register/check-email — production mode (SES_ADAPTER=live)', () => {
  it('renders the page but no simulated-email or sandbox-warning card', async () => {
    const app = createApp();
    const res = await request(app).get('/register/check-email');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Registration successful!');
    expect(res.text).not.toContain('Simulated email (dev)');
    expect(res.text).not.toContain('Staging: email delivery is restricted');
    expect(res.text).not.toContain('simulator.amazonses.com');
  });

  it('retired /internal/dev-outbox no longer serves the dev view in production mode', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/dev-outbox');
    expect(res.status).not.toBe(200);
    expect(res.text).not.toContain('Dev Outbox');
  });
});

describe('member-login sent pages — production mode (SES_ADAPTER=live)', () => {
  it('the password-reset sent page renders no card and never surfaces a reset link', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/password/forgot')
      .type('form')
      .send({ email: 'anyone@example.com' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('If an account exists');
    expect(res.text).not.toContain('Simulated email (dev)');
    expect(res.text).not.toMatch(/\/password\/reset\/[A-Za-z0-9_-]+/);
  });

  it('the verify-resend page renders no card and never surfaces a verify link', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/verify/resend')
      .type('form')
      .send({ email: 'anyone@example.com' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('new verification link has been sent');
    expect(res.text).not.toContain('Simulated email (dev)');
    expect(res.text).not.toMatch(/\/verify\/[A-Za-z0-9_-]+">CLICK THIS LINK</);
  });
});
