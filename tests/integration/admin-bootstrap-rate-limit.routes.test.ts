/**
 * Regression: POST /admin/bootstrap-claim must throttle by caller IP with a
 * 429, the same uniform rate-limit response the per-member bucket produces. An
 * IP that exceeds its bucket is blocked before token processing, and the body
 * stays the non-revealing 'invalid' shape.
 *
 * Own DB + own file so the process-global rate-limit bucket is not perturbed by
 * other bootstrap tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3093');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: 'rl-claimer', slug: 'rl_claimer', login_email: 'rl@example.com' });
  // Lower the per-IP bucket to 2 per window so the 3rd attempt is blocked.
  db.prepare(`
    INSERT INTO system_config
      (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
    VALUES (?, ?, 'bootstrap_claim_rate_limit_max_per_ip', '2', ?, 'Test tunable', NULL)
  `).run('test-bootstrap-ip-rl', '2026-05-22T00:00:00.000Z', '2026-05-22T00:00:00.000Z');
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function cookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: 'rl-claimer' })}`;
}

describe('POST /admin/bootstrap-claim — IP rate limiting', () => {
  it('blocks with 429 + Retry-After once the per-IP cap is exceeded', async () => {
    const app = createApp();

    // First two attempts from this IP are under the cap (not rate-limited).
    for (let i = 1; i <= 2; i++) {
      const res = await request(app)
        .post('/admin/bootstrap-claim')
        .set('Cookie', cookie())
        .type('form')
        .send({ token: 'anything' });
      expect(res.status).not.toBe(429);
    }

    // Third attempt from the same IP is throttled before token processing,
    // with the same 429 the per-member bucket produces.
    const blocked = await request(app)
      .post('/admin/bootstrap-claim')
      .set('Cookie', cookie())
      .type('form')
      .send({ token: 'anything' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});
