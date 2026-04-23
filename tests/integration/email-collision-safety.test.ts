/**
 * Integration tests for pre-dump email-collision safety.
 *
 * Verifies that duplicate legacy_email rows never produce a silent
 * mis-claim. The service returns `{ kind: 'ambiguous_email' }` and the
 * verify-time classification degrades to
 * `tier3 / ambiguous_email_anchor`. The manual claim form surfaces a
 * helpful message instead of picking an arbitrary row.
 *
 * Also asserts existing 0-match and 1-match behavior is unchanged, and
 * that no DB rows are mutated during any of these paths.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertHistoricalPerson,
  insertLegacyMember,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3104');

let createApp: Awaited<ReturnType<typeof importApp>>;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let identitySvc: typeof import('../../src/services/identityAccessService');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let tokenSvc: typeof import('../../src/services/accountTokenService');

// Scenario: the same identifier string appears in DIFFERENT columns across
// two legacy rows (e.g. an email on row A and a legacy_user_id on row B).
// The DB's partial UNIQUE index on legacy_email prevents same-column email
// duplicates, but findByIdentifier matches across columns, so cross-column
// ambiguity is the realistic collision shape the hardening must handle.
const AMBIG_EMAIL  = 'shared@example.com';
const LM_AMBIG_A   = 'lm-ambig-a';
const LM_AMBIG_B   = 'lm-ambig-b';

// Scenario: clean single-match member — email anchors to one legacy row with
// HP provenance; classifier must still emit tier1.
const MEM_SINGLE   = 'mem-single-ok';
const LM_SINGLE    = 'lm-single-ok';
const HP_SINGLE    = 'hp-single-ok';

// Scenario: no email match at all — classification stays 'none'.
const MEM_NONE     = 'mem-no-anchor';

// Scenario: ambiguous email — verify classification must be tier3/ambiguous.
const MEM_AMBIG    = 'mem-ambig';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Row A holds the email. Row B holds the same string in legacy_user_id.
  // Both individually satisfy the partial UNIQUE constraints but together
  // they produce a 2-row match through findAllByIdentifier.
  insertLegacyMember(db, { legacy_member_id: LM_AMBIG_A, legacy_email: AMBIG_EMAIL });
  insertLegacyMember(db, { legacy_member_id: LM_AMBIG_B, legacy_user_id: AMBIG_EMAIL });
  insertMember(db, {
    id: MEM_AMBIG,
    slug: 'mem_ambig',
    login_email: AMBIG_EMAIL,
    real_name: 'Ambig Target',
    email_verified_at: null,
  });

  insertLegacyMember(db, { legacy_member_id: LM_SINGLE, legacy_email: 'single@example.com' });
  insertHistoricalPerson(db, {
    person_id: HP_SINGLE,
    person_name: 'Clean Single',
    legacy_member_id: LM_SINGLE,
  });
  insertMember(db, {
    id: MEM_SINGLE,
    slug: 'mem_single',
    login_email: 'single@example.com',
    real_name: 'Clean Single',
    email_verified_at: null,
  });

  insertMember(db, {
    id: MEM_NONE,
    slug: 'mem_none',
    login_email: 'alone@example.com',
    real_name: 'No Anchor',
    email_verified_at: null,
  });

  db.close();
  createApp = await importApp();
  identitySvc = await import('../../src/services/identityAccessService');
  tokenSvc = await import('../../src/services/accountTokenService');
});

afterAll(() => cleanupTestDb(dbPath));

function issueVerifyToken(memberId: string): string {
  return tokenSvc.accountTokenService.issueToken({
    memberId,
    tokenType: 'email_verify',
    ttlHours: 24,
  }).rawToken;
}

describe('lookupLegacyAccount — union shape', () => {
  it('returns kind:"single" for exactly one match (unchanged behavior)', () => {
    const lookup = identitySvc.identityAccessService
      .lookupLegacyAccount(MEM_SINGLE, 'single@example.com');
    expect(lookup.kind).toBe('single');
    if (lookup.kind === 'single') {
      expect(lookup.result.legacyMemberId).toBe(LM_SINGLE);
    }
  });

  it('returns kind:"none" for zero matches (unchanged behavior)', () => {
    const lookup = identitySvc.identityAccessService
      .lookupLegacyAccount(MEM_NONE, 'alone@example.com');
    expect(lookup.kind).toBe('none');
  });

  it('returns kind:"ambiguous_email" when two legacy rows share the email', () => {
    const lookup = identitySvc.identityAccessService
      .lookupLegacyAccount(MEM_AMBIG, AMBIG_EMAIL);
    expect(lookup.kind).toBe('ambiguous_email');
    if (lookup.kind === 'ambiguous_email') {
      expect(lookup.count).toBe(2);
    }
  });
});

describe('verifyEmailByToken — ambiguous-email classification', () => {
  it('classifies ambiguous email as tier3/ambiguous_email_anchor with legacyMatch=null', async () => {
    const token = issueVerifyToken(MEM_AMBIG);
    const result = await identitySvc.identityAccessService.verifyEmailByToken(token);
    expect(result).not.toBeNull();
    expect(result!.legacyMatch).toBeNull();
    expect(result!.autoLinkClassification).toEqual({
      tier: 'tier3',
      reason: 'ambiguous_email_anchor',
    });
  });

  it('still classifies a clean single-match member as tier1 (regression check)', async () => {
    const token = issueVerifyToken(MEM_SINGLE);
    const result = await identitySvc.identityAccessService.verifyEmailByToken(token);
    expect(result!.autoLinkClassification.tier).toBe('tier1');
  });

  it('still classifies no-anchor member as none (regression check)', async () => {
    const token = issueVerifyToken(MEM_NONE);
    const result = await identitySvc.identityAccessService.verifyEmailByToken(token);
    expect(result!.autoLinkClassification).toEqual({ tier: 'none' });
  });
});

describe('verify → routing for ambiguous email', () => {
  it('routes ambiguous-email verify to /history/claim (manual disambiguation)', async () => {
    const token = issueVerifyToken(MEM_AMBIG);
    const res = await request(createApp()).get(`/verify/${token}`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/history/claim');
  });
});

describe('manual claim form — ambiguous email error', () => {
  it('renders a helpful error when the submitted identifier matches multiple rows', async () => {
    const cookie = `footbag_session=${createTestSessionJwt({ memberId: MEM_AMBIG })}`;
    const res = await request(createApp())
      .post('/history/claim')
      .set('Cookie', cookie)
      .type('form')
      .send({ identifier: AMBIG_EMAIL });
    expect(res.status).toBe(200);
    expect(res.text).toContain('matches multiple legacy accounts');
    expect(res.text).toContain('username or member ID');
  });

  it('does NOT render the confirm page on ambiguous email', async () => {
    const cookie = `footbag_session=${createTestSessionJwt({ memberId: MEM_AMBIG })}`;
    const res = await request(createApp())
      .post('/history/claim')
      .set('Cookie', cookie)
      .type('form')
      .send({ identifier: AMBIG_EMAIL });
    expect(res.text).not.toContain('Confirm Legacy Account Link');
  });
});

describe('no-write invariant — no legacy_members or members row changes during any ambiguous-path call', () => {
  it('DB row counts stay constant across ambiguous and clean flows', async () => {
    const before = new BetterSqlite3(dbPath, { readonly: true });
    const counts = {
      lm: (before.prepare('SELECT COUNT(*) AS n FROM legacy_members').get() as { n: number }).n,
      lmClaimed: (before.prepare(
        "SELECT COUNT(*) AS n FROM legacy_members WHERE claimed_by_member_id IS NOT NULL",
      ).get() as { n: number }).n,
      members: (before.prepare('SELECT COUNT(*) AS n FROM members').get() as { n: number }).n,
      membersLinked: (before.prepare(
        'SELECT COUNT(*) AS n FROM members WHERE legacy_member_id IS NOT NULL',
      ).get() as { n: number }).n,
    };
    before.close();

    const app = createApp();
    // Exercise all three paths without ever submitting a claim confirm.
    for (const id of [MEM_AMBIG, MEM_SINGLE, MEM_NONE]) {
      const token = issueVerifyToken(id);
      await request(app).get(`/verify/${token}`);
    }
    const cookie = `footbag_session=${createTestSessionJwt({ memberId: MEM_AMBIG })}`;
    await request(app).post('/history/claim').set('Cookie', cookie)
      .type('form').send({ identifier: AMBIG_EMAIL });

    const after = new BetterSqlite3(dbPath, { readonly: true });
    const counts2 = {
      lm: (after.prepare('SELECT COUNT(*) AS n FROM legacy_members').get() as { n: number }).n,
      lmClaimed: (after.prepare(
        "SELECT COUNT(*) AS n FROM legacy_members WHERE claimed_by_member_id IS NOT NULL",
      ).get() as { n: number }).n,
      members: (after.prepare('SELECT COUNT(*) AS n FROM members').get() as { n: number }).n,
      membersLinked: (after.prepare(
        'SELECT COUNT(*) AS n FROM members WHERE legacy_member_id IS NOT NULL',
      ).get() as { n: number }).n,
    };
    after.close();
    expect(counts2).toEqual(counts);
  });
});
