/**
 * Payment page routes: history, success, and cancel, plus the webhook body
 * guard. These are the production payment surfaces (the stub-only checkout
 * pass-through is exercised elsewhere). Each is owner-scoped and returns 404 on
 * a slug or member mismatch (anti-enumeration), and the success and cancel
 * pages resolve their payment by checkout-session id.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedPersona } from '../../src/testkit/personaFactory';
import { insertPayment, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3420');

const OWNER = 'pay_owner';
const OTHER = 'pay_other';
const OWNER_ID = `member_persona_${OWNER}`;
const OTHER_ID = `member_persona_${OTHER}`;
const OWNER_SESSION = 'cs_test_owner_session';
const OTHER_SESSION = 'cs_test_other_session';
const TS = '2024-01-01T00:00:00.000Z';

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookie(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId, ttlSeconds: 24 * 60 * 60 })}`;
}

function insertPaymentWithSession(
  db: BetterSqlite3.Database,
  o: { id: string; memberId: string; sessionId: string; status: string },
): void {
  db.prepare(
    `INSERT INTO payments (
       id, created_at, created_by, updated_at, updated_by, version,
       member_id, payment_type, amount_cents, currency, status, descriptor,
       purchased_tier_status, stripe_checkout_session_id
     ) VALUES (?, ?, 'system', ?, 'system', 1, ?, 'membership', 1000, 'USD', ?,
       'IFPA Tier 1 Membership', 'tier1', ?)`,
  ).run(o.id, TS, TS, o.memberId, o.status, o.sessionId);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedPersona(db, { slug: OWNER, displayName: 'Pay Owner', tier: 'tier1', onboardingComplete: true, coverageNotes: ['payment routes owner'] });
  seedPersona(db, { slug: OTHER, displayName: 'Pay Other', tier: 'tier1', onboardingComplete: true, coverageNotes: ['payment routes other'] });
  // History rows (resolved by member, not session).
  insertPayment(db, { id: 'pay-hist-1', member_id: OWNER_ID, status: 'succeeded' });
  // Session-backed rows for the success and cancel pages.
  insertPaymentWithSession(db, { id: 'pay-ok', memberId: OWNER_ID, sessionId: OWNER_SESSION, status: 'succeeded' });
  insertPaymentWithSession(db, { id: 'pay-other', memberId: OTHER_ID, sessionId: OTHER_SESSION, status: 'failed' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /members/:memberKey/payments (owner-only history)', () => {
  it('serves the owner their own history', async () => {
    const res = await request(createApp()).get(`/members/${OWNER}/payments`).set('Cookie', cookie(OWNER_ID));
    expect(res.status).toBe(200);
  });
  it('404s a member viewing another member history', async () => {
    const res = await request(createApp()).get(`/members/${OTHER}/payments`).set('Cookie', cookie(OWNER_ID));
    expect(res.status).toBe(404);
  });
  it('redirects the unauthenticated to login', async () => {
    const res = await request(createApp()).get(`/members/${OWNER}/payments`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });
});

describe('GET /payments/success', () => {
  it('renders the success page for the owning member', async () => {
    const res = await request(createApp()).get(`/payments/success?session_id=${OWNER_SESSION}`).set('Cookie', cookie(OWNER_ID));
    expect(res.status).toBe(200);
  });
  it('404s an unknown session id', async () => {
    const res = await request(createApp()).get('/payments/success?session_id=cs_nope').set('Cookie', cookie(OWNER_ID));
    expect(res.status).toBe(404);
  });
  it('404s when the session belongs to another member', async () => {
    const res = await request(createApp()).get(`/payments/success?session_id=${OTHER_SESSION}`).set('Cookie', cookie(OWNER_ID));
    expect(res.status).toBe(404);
  });
});

describe('GET /payments/cancel', () => {
  it('renders the cancel page with no session id', async () => {
    const res = await request(createApp()).get('/payments/cancel').set('Cookie', cookie(OWNER_ID));
    expect(res.status).toBe(200);
  });
  it('renders the cancel page for the owning member with a session id', async () => {
    const res = await request(createApp()).get(`/payments/cancel?session_id=${OTHER_SESSION}`).set('Cookie', cookie(OTHER_ID));
    expect(res.status).toBe(200);
  });
  it('404s when the session belongs to another member', async () => {
    const res = await request(createApp()).get(`/payments/cancel?session_id=${OTHER_SESSION}`).set('Cookie', cookie(OWNER_ID));
    expect(res.status).toBe(404);
  });
});

describe('POST /payments/webhook (body guard)', () => {
  it('400s on an empty body', async () => {
    const res = await request(createApp()).post('/payments/webhook');
    expect(res.status).toBe(400);
  });
});
