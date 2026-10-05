/**
 * Integration tests for pre-dump email-collision safety.
 *
 * Verifies that duplicate legacy_email rows never produce a silent
 * mis-claim. The lookup returns `{ kind: 'ambiguous_email' }`, and in the
 * claim step an address reaching two accounts reaches neither, and is
 * reported to the administrator instead.
 *
 * Also asserts existing 0-match and 1-match behavior is unchanged, and
 * that no DB rows are mutated during any of these paths.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
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
// The email columns are non-unique by design; the claim lookup matches across
// them, so cross-column ambiguity is the realistic collision shape the lookup
// must surface as ambiguous rather than silently picking a row.
const AMBIG_EMAIL  = 'shared@example.com';
const LM_AMBIG_A   = 'lm-ambig-a';
const LM_AMBIG_B   = 'lm-ambig-b';

// Scenario: a member arrives under a legacy account's SECONDARY email. A legacy
// row carries the address in legacy_email2 / legacy_email3 (not the primary);
// the lookup must still resolve to that single row.
const SECONDARY_EMAIL = 'Second.Address@Example.com'; // mixed case: matches case-insensitively
const LM_SECONDARY    = 'lm-secondary';
const MEM_SECONDARY   = 'mem-secondary';
const TERTIARY_EMAIL  = 'third.address@example.com';
const LM_TERTIARY     = 'lm-tertiary';
const MEM_TERTIARY    = 'mem-tertiary';

// Scenario: a cross-account collision where one address is the PRIMARY on one
// legacy row and a SECONDARY on another. The legacy-data validation gate is the
// a-priori catch; this proves the match-time backstop when an address slips it.
const XCOL_EMAIL = 'crosscol@example.com';
const LM_XCOL_A  = 'lm-xcol-a';
const LM_XCOL_B  = 'lm-xcol-b';
const MEM_XCOL   = 'mem-xcol';

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
    birth_date: '1980-01-01',
    onboarding: 'none',
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

  // Secondary-email match: the address lives in legacy_email2, the primary is a
  // different address. A member logging in under the secondary still links.
  insertLegacyMember(db, {
    legacy_member_id: LM_SECONDARY,
    legacy_email: 'primary-of-secondary@example.com',
    legacy_email2: SECONDARY_EMAIL,
  });
  insertMember(db, {
    id: MEM_SECONDARY,
    slug: 'mem_secondary',
    login_email: SECONDARY_EMAIL.toLowerCase(),
    real_name: 'Secondary Arrival',
    email_verified_at: null,
  });

  // Tertiary-email match: same shape against legacy_email3.
  insertLegacyMember(db, {
    legacy_member_id: LM_TERTIARY,
    legacy_email: 'primary-of-tertiary@example.com',
    legacy_email3: TERTIARY_EMAIL,
  });
  insertMember(db, {
    id: MEM_TERTIARY,
    slug: 'mem_tertiary',
    login_email: TERTIARY_EMAIL,
    real_name: 'Tertiary Arrival',
    email_verified_at: null,
  });

  // Cross-account collision across columns: XCOL_EMAIL is the primary on row A
  // and a secondary on row B.
  insertLegacyMember(db, { legacy_member_id: LM_XCOL_A, legacy_email: XCOL_EMAIL });
  insertLegacyMember(db, { legacy_member_id: LM_XCOL_B, legacy_email2: XCOL_EMAIL });
  // Verified, so the address is a matching key in the claim step.
  insertMember(db, {
    id: MEM_XCOL,
    slug: 'mem_xcol',
    login_email: XCOL_EMAIL,
    real_name: 'Cross Column',
    onboarding: 'none',
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

  it('matches an address held in a legacy account\'s secondary email column', () => {
    const lookup = identitySvc.identityAccessService
      .lookupLegacyAccount(MEM_SECONDARY, SECONDARY_EMAIL.toLowerCase());
    expect(lookup.kind).toBe('single');
    if (lookup.kind === 'single') {
      expect(lookup.result.legacyMemberId).toBe(LM_SECONDARY);
    }
  });

  it('matches an address held in a legacy account\'s tertiary email column', () => {
    const lookup = identitySvc.identityAccessService
      .lookupLegacyAccount(MEM_TERTIARY, TERTIARY_EMAIL);
    expect(lookup.kind).toBe('single');
    if (lookup.kind === 'single') {
      expect(lookup.result.legacyMemberId).toBe(LM_TERTIARY);
    }
  });

  it('returns kind:"ambiguous_email" when an address is primary on one row and secondary on another', () => {
    const lookup = identitySvc.identityAccessService
      .lookupLegacyAccount(MEM_XCOL, XCOL_EMAIL);
    expect(lookup.kind).toBe('ambiguous_email');
    if (lookup.kind === 'ambiguous_email') {
      expect(lookup.count).toBe(2);
    }
  });
});

describe('claim step — an address two old accounts share', () => {
  // Defect caught: an address that slipped the legacy-data validation hands the
  // member one of two accounts, or the administrator is not told why neither
  // can be assumed theirs.
  it('reaches neither account and reports the address to the administrator', async () => {
    const matching = (await import('../../src/services/legacyMatchingService')).legacyMatchingService;
    const evidence = matching.readMemberEvidence(MEM_XCOL)!;
    const result = matching.match(evidence);
    expect(result.candidates.filter((c) => c.accountId === LM_XCOL_A || c.accountId === LM_XCOL_B)).toEqual([]);
    expect(result.ambiguousAddresses).toEqual([{ address: { kind: 'login' }, accountCount: 2 }]);
    expect(identitySvc.identityAccessService.getLinkCandidatesForAdmin(MEM_XCOL).ambiguousAnchors)
      .toEqual(['their sign-in address']);
  });
});

describe('verify → routing for ambiguous email', () => {
  it('routes ambiguous-email verify into the onboarding wizard, landing on the first outstanding task', async () => {
    const token = issueVerifyToken(MEM_AMBIG);
    const res = await request(createApp()).get(`/verify/${token}`);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/personal_details');
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
    // Exercise all three paths without ever submitting a claim confirm, then
    // render the claim step for the ambiguous member: drawing the candidates
    // must write nothing.
    for (const id of [MEM_AMBIG, MEM_SINGLE, MEM_NONE]) {
      const token = issueVerifyToken(id);
      await request(app).get(`/verify/${token}`);
    }
    const cookie = `__Host-footbag_session=${createTestSessionJwt({ memberId: MEM_AMBIG })}`;
    await request(app).get('/register/wizard/legacy_claim').set('Cookie', cookie);

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
