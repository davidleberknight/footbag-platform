/**
 * Mailbox-control round-trip for declared old emails: requesting
 * verification enqueues a single-use link to the DECLARED address with the
 * issued audit event; clicking it while signed in to the same account
 * stamps the anchor verified, records the consumed event, and upgrades the
 * evidence tier the staging pass proposes for matches through that anchor;
 * a foreign session's click proves nothing; re-use and unknown tokens are
 * non-revealing; requests are rate-limited per member.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3087');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let identity: typeof import('../../src/services/identityAccessService');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let ops: typeof import('../../src/services/operationsPlatformService');

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
  identity = await import('../../src/services/identityAccessService');
  ops = await import('../../src/services/operationsPlatformService');
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

function outboxFor(memberId: string): Array<{ recipient_email: string; body_text: string }> {
  return db.prepare(
    `SELECT recipient_email, body_text FROM outbox_emails WHERE recipient_member_id = ? ORDER BY created_at`,
  ).all(memberId) as Array<{ recipient_email: string; body_text: string }>;
}

function extractToken(body: string): string {
  const m = body.match(/anchors\/verify\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error(`no verification link in body: ${body}`);
  return m[1];
}

let _n = 0;
function seedMemberWithAnchor(): { memberId: string; anchorId: string } {
  _n += 1;
  const memberId = insertMember(db, {
    id: `mv-${_n}`, slug: `mv_${_n}`, login_email: `mv-${_n}@example.com`,
    real_name: `Mv Tester${_n}`, display_name: `Mv Tester${_n}`,
  });
  identity.identityAccessService.declareAnchor(memberId, 'old_email', `mv-${_n}-old@old.example.com`);
  const anchor = identity.identityAccessService.listDeclaredAnchors(memberId)[0];
  return { memberId, anchorId: anchor.id };
}

describe('round trip', () => {
  it('issues the link to the declared address, click-while-signed-in verifies, both events recorded', async () => {
    const { memberId, anchorId } = seedMemberWithAnchor();

    const send = await request(createApp())
      .post('/register/wizard/legacy_claim/anchors/send-verification')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ anchorId });
    expect(send.status).toBe(303);
    expect(send.headers.location).toContain('anchor_verification=sent');

    const mail = outboxFor(memberId);
    expect(mail).toHaveLength(1);
    expect(mail[0].recipient_email).toBe(`mv-${_n}-old@old.example.com`);
    const token = extractToken(mail[0].body_text);

    const issued = db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = ? AND action_type = 'legacy.mailbox_link_token_issued'`,
    ).get(memberId) as { n: number };
    expect(issued.n).toBe(1);

    const click = await request(createApp())
      .get(`/register/wizard/legacy_claim/anchors/verify/${token}`)
      .set('Cookie', cookieFor(memberId));
    expect(click.status).toBe(303);
    expect(click.headers.location).toContain('anchor_verification=verified');

    const anchor = db.prepare(
      `SELECT verified_via_link_click_at, verification_token_id FROM member_declared_anchors WHERE id = ?`,
    ).get(anchorId) as Record<string, unknown>;
    expect(anchor.verified_via_link_click_at).not.toBeNull();
    expect(anchor.verification_token_id).not.toBeNull();

    const consumed = db.prepare(
      `SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'legacy.mailbox_link_token_consumed'`,
    ).all(memberId) as Array<{ metadata_json: string }>;
    expect(consumed).toHaveLength(1);
    expect(JSON.parse(consumed[0].metadata_json).evidence_strength).toBe('mailbox_control_via_link_click');

    // A second click of the same single-use token is non-revealing.
    const replay = await request(createApp())
      .get(`/register/wizard/legacy_claim/anchors/verify/${token}`)
      .set('Cookie', cookieFor(memberId));
    expect(replay.headers.location).toContain('anchor_verification=invalid');
  });

  it("a foreign session's click proves nothing and the anchor stays unverified", async () => {
    const owner = seedMemberWithAnchor();
    const attacker = insertMember(db, {
      id: 'mv-attacker', slug: 'mv_attacker', login_email: 'mv-attacker@example.com',
    });

    await request(createApp())
      .post('/register/wizard/legacy_claim/anchors/send-verification')
      .set('Cookie', cookieFor(owner.memberId))
      .type('form')
      .send({ anchorId: owner.anchorId });
    const token = extractToken(outboxFor(owner.memberId)[0].body_text);

    const res = await request(createApp())
      .get(`/register/wizard/legacy_claim/anchors/verify/${token}`)
      .set('Cookie', cookieFor(attacker));
    expect(res.headers.location).toContain('anchor_verification=invalid');

    const anchor = db.prepare(
      `SELECT verified_via_link_click_at FROM member_declared_anchors WHERE id = ?`,
    ).get(owner.anchorId) as Record<string, unknown>;
    expect(anchor.verified_via_link_click_at).toBeNull();

    // The owner can still consume it afterwards: the foreign click did not
    // burn the token.
    const ownerClick = await request(createApp())
      .get(`/register/wizard/legacy_claim/anchors/verify/${token}`)
      .set('Cookie', cookieFor(owner.memberId));
    expect(ownerClick.headers.location).toContain('anchor_verification=verified');
  });

  it('an unknown token is non-revealing', async () => {
    const { memberId } = seedMemberWithAnchor();
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim/anchors/verify/not-a-real-token')
      .set('Cookie', cookieFor(memberId));
    expect(res.headers.location).toContain('anchor_verification=invalid');
  });
});

describe('verified anchor upgrades staged evidence', () => {
  it('a batch match through a VERIFIED declared old email proposes the hard mailbox tier', async () => {
    insertLegacyMember(db, {
      legacy_member_id: 'LM-mv-upgrade', legacy_email: 'upgrade-old@old.example.com',
      real_name: 'Upgrade Tester', display_name: 'Upgrade Tester',
    });
    insertHistoricalPerson(db, {
      person_id: 'HP-mv-upgrade', person_name: 'Upgrade Tester', legacy_member_id: 'LM-mv-upgrade',
    });
    const memberId = insertMember(db, {
      id: 'mv-upgrade', slug: 'mv_upgrade', login_email: 'upgrade-new@example.com',
      real_name: 'Upgrade Tester', display_name: 'Upgrade Tester',
    });
    identity.identityAccessService.declareAnchor(memberId, 'old_email', 'upgrade-old@old.example.com');
    const anchorId = identity.identityAccessService.listDeclaredAnchors(memberId)[0].id;

    await request(createApp())
      .post('/register/wizard/legacy_claim/anchors/send-verification')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ anchorId });
    const token = extractToken(outboxFor(memberId)[0].body_text);
    await request(createApp())
      .get(`/register/wizard/legacy_claim/anchors/verify/${token}`)
      .set('Cookie', cookieFor(memberId));

    await ops.operationsPlatformService.runBatchAutoLink();

    const staged = db.prepare(
      `SELECT proposed_evidence_strength FROM auto_link_staged_candidates WHERE member_id = ?`,
    ).all(memberId) as Array<Record<string, unknown>>;
    expect(staged).toHaveLength(1);
    expect(staged[0].proposed_evidence_strength).toBe('mailbox_control_via_link_click');
  });
});
