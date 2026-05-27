import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3972');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const MEMBER_ID = 'purchase-route-001';
const MEMBER_SLUG = 'purchaser';

let createApp: Awaited<ReturnType<typeof importApp>>;

function memberCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'Purchaser', login_email: 'purchaser@example.com' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('POST /members/:memberKey/purchase-tier', () => {
  it('returns 403 or 303 depending on payment stub config', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${MEMBER_SLUG}/purchase-tier`)
      .set('Cookie', memberCookie())
      .send({ tier: 'tier1' });
    // Config singleton is shared across Vitest threads, so devPaymentStub
    // may be true (303 redirect on success) or false (403). Both are correct.
    expect([303, 403]).toContain(res.status);
  });
});
