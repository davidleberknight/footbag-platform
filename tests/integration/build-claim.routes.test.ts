/**
 * GET /dev/build-claim — request-shape guards (dev/staging-only affordance).
 *
 * The route builds a claimed account for a real legacy record and signs the
 * caller in as it. Building the account drives the real register → verify →
 * claim journey, whose verify step reads a drained stub-SES outbox that only a
 * running stack produces, so the full build is exercised by the operator-run
 * real-claim crawl (tests/dev/real-claim-crawl.dev.test.ts), not here. This file
 * owns the build-free guards: a missing or malformed legacy id is refused before
 * any account is built, so the affordance never acts on a bad request. The
 * production-refusal case lives in devRoutes.prodGate.test.ts (the whole /dev
 * router is unmounted in production).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3436');

// The /dev router mounts only under development/staging; pin development before
// importApp freezes the config singleton.
const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
process.env.FOOTBAG_ENV = 'development';

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const { insertLegacyMember } = await import('../fixtures/factories');
  // A record the dataset holds but cannot register under: one name word, and no
  // canonical historical person to supply a fuller one.
  insertLegacyMember(db, { legacy_member_id: '900101', real_name: null, display_name: 'Solo' });
  db.close();
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
  if (PRIOR_FOOTBAG_ENV === undefined) delete process.env.FOOTBAG_ENV;
  else process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
});

describe('GET /dev/build-claim — request-shape guards', () => {
  it('400s a missing legacy id, building nothing', async () => {
    const res = await request(createApp()).get('/dev/build-claim').redirects(0);
    expect(res.status).toBe(400);
    // A guard refusal issues no session, so no member was built or signed in.
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('400s a malformed legacy id, building nothing', async () => {
    const res = await request(createApp())
      .get(`/dev/build-claim?as=${encodeURIComponent('not a valid id!!')}`)
      .redirects(0);
    expect(res.status).toBe(400);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('400s an over-long legacy id, building nothing', async () => {
    const res = await request(createApp())
      .get(`/dev/build-claim?as=${'x'.repeat(65)}`)
      .redirects(0);
    expect(res.status).toBe(400);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('404s a well-formed id the loaded dataset does not hold, naming the record', async () => {
    const res = await request(createApp()).get('/dev/build-claim?as=900999').redirects(0);
    expect(res.status).toBe(404);
    expect(res.text).toContain('900999');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('409s a record that cannot be registered under its own name, naming the record', async () => {
    const res = await request(createApp()).get('/dev/build-claim?as=900101').redirects(0);
    expect(res.status).toBe(409);
    expect(res.text).toContain('900101');
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});
