/**
 * The mailbox-link send-verification endpoint is rate-limited per member: once a
 * member exceeds the per-member cap within the window, the endpoint returns 429
 * with a Retry-After header rather than issuing another verification email. The
 * per-member bucket is the one that surfaces to the caller (the per-IP and
 * per-target buckets stay silent for anti-enumeration), so this pins the HTTP
 * contract the legitimate member sees.
 *
 * Own DB + own file so the process-global rate-limit bucket is not perturbed by
 * the other mailbox-verification tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertSystemConfig, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3093');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let identity: typeof import('../../src/services/identityAccessService');

const MEMBER_ID = 'mlrl-member';
let anchorId: string;

beforeAll(async () => {
  db = createTestDb(dbPath);
  // Lower the per-member cap to 2 so the 3rd send is blocked. The per-IP (10)
  // and per-target (3) defaults stay un-hit across three sends to one anchor.
  insertSystemConfig(db, { config_key: 'mailbox_link_rate_limit_max_per_member', value_json: '2' });
  insertMember(db, {
    id: MEMBER_ID, slug: 'mlrl_member', login_email: 'mlrl@example.com',
    real_name: 'Mlrl Tester', display_name: 'Mlrl Tester',
  });
  db.close();
  createApp = await importApp();
  identity = await import('../../src/services/identityAccessService');
  identity.identityAccessService.declareAnchor(MEMBER_ID, 'old_email', 'mlrl-old@old.example.com');
  anchorId = identity.identityAccessService.listDeclaredAnchors(MEMBER_ID)[0].id;
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}

function send() {
  return request(createApp())
    .post('/register/wizard/legacy_claim/anchors/send-verification')
    .set('Cookie', cookie())
    .type('form')
    .send({ anchorId });
}

describe('POST /register/wizard/legacy_claim/anchors/send-verification — rate limiting', () => {
  it('blocks with 429 + Retry-After once the per-member cap is exceeded', async () => {
    // The first two sends are under the cap.
    for (let i = 0; i < 2; i++) {
      const res = await send();
      expect(res.status).toBe(303);
      expect(res.headers.location).toContain('anchor_verification=sent');
    }

    // The third send trips the per-member cap.
    const blocked = await send();
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
  });
});
