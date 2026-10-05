/**
 * Integration tests for legacy-account claim side effects, merge rules, tier
 * grants, and idempotency, plus declared-anchor matching in the wizard claim
 * step. The claim runs at the login-email tier (the member's verified login
 * email matches an address on the old account) and exercises merge-rule field
 * copying (COALESCE, OR-merge, fill-if-empty, active wins), tier grant mapping,
 * claim idempotency, and the transitive competition-record claim.
 *
 * User story anchors: M_Claim_Legacy_Account, M_Complete_Onboarding_Wizard.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
  insertOnboardingTask,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3210');

let createApp: Awaited<ReturnType<typeof importApp>>;
let identity: typeof import('../../src/services/identityAccessService');
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
  identity = await import('../../src/services/identityAccessService');
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

// Inserts a member with personal_details already completed, so the legacy-claim
// step (which runs only after personal details are on file) is reachable.
function insertMemberReady(dbh: BetterSqlite3.Database, o: Parameters<typeof insertMember>[1] = {}): string {
  const id = insertMember(dbh, { onboarding: 'none', ...o });
  insertOnboardingTask(dbh, id, 'personal_details', 'completed');
  return id;
}

// The member's verified login email matches an address on the old account,
// so the claim carries the modern-email tier.
function claimAtLoginEmailTier(memberId: string, legacyMemberId: string): void {
  identity.identityAccessService.claimLegacyAccount(
    memberId, legacyMemberId, 'currently_controls_modern_email_matching_legacy',
  );
}

function getMember(memberId: string) {
  return db.prepare('SELECT * FROM members WHERE id = ?').get(memberId) as Record<string, unknown> | undefined;
}

function getLegacyMember(legacyMemberId: string) {
  return db.prepare('SELECT * FROM legacy_members WHERE legacy_member_id = ?').get(legacyMemberId) as Record<string, unknown> | undefined;
}

function getTierGrants(memberId: string) {
  return db.prepare(
    "SELECT * FROM member_tier_grants WHERE member_id = ? ORDER BY created_at",
  ).all(memberId) as Array<Record<string, unknown>>;
}

function countAuditEntries(memberId: string, actionType: string): number {
  return (db.prepare(
    "SELECT COUNT(*) AS c FROM audit_entries WHERE actor_member_id = ? AND action_type = ?",
  ).get(memberId, actionType) as { c: number }).c;
}

// ── Legacy-account claim at the login-email tier ─────────────────────────────

describe('legacy-account claim (login email matches an old address)', () => {
  it('sets legacy_member_id and marks the legacy row claimed', () => {
    const stamp = Date.now();
    const email = `fast-${stamp}@example.com`;
    const legacyId = insertLegacyMember(db, {
      legacy_member_id: `LM-FAST-${stamp}`,
      legacy_email: email,
      real_name: 'Fast Claim',
      bio: 'legacy bio',
      country: 'CA',
    });
    const memberId = insertMemberReady(db, {
      slug: `fast_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Fast Claim',
      bio: '',
      country: null,
    });

    claimAtLoginEmailTier(memberId, legacyId);

    const member = getMember(memberId)!;
    expect(member.legacy_member_id).toBe(legacyId);

    const lm = getLegacyMember(legacyId)!;
    expect(lm.claimed_by_member_id).toBe(memberId);
    expect(lm.claimed_at).toBeTruthy();
  });

  it('merge: fill-if-empty bio from legacy', () => {
    const stamp = Date.now();
    const email = `merge-bio-${stamp}@example.com`;
    const legacyId = insertLegacyMember(db, {
      legacy_member_id: `LM-BIO-${stamp}`,
      legacy_email: email,
      real_name: 'Bio Merge',
      bio: 'legacy bio content',
    });
    const memberId = insertMemberReady(db, {
      slug: `merge_bio_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Bio Merge',
      bio: '',
    });

    claimAtLoginEmailTier(memberId, legacyId);

    expect(getMember(memberId)!.bio).toBe('legacy bio content');
  });

  it('merge: active account wins for real_name', () => {
    const stamp = Date.now();
    const email = `merge-name-${stamp}@example.com`;
    const legacyId = insertLegacyMember(db, {
      legacy_member_id: `LM-NAME-${stamp}`,
      legacy_email: email,
      real_name: 'Legacy Name',
    });
    const memberId = insertMemberReady(db, {
      slug: `merge_name_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Active Name',
    });

    claimAtLoginEmailTier(memberId, legacyId);

    expect(getMember(memberId)!.real_name).toBe('Active Name');
  });

  it('merge: fill-if-empty country from legacy', () => {
    const stamp = Date.now();
    const email = `merge-country-${stamp}@example.com`;
    const legacyId = insertLegacyMember(db, {
      legacy_member_id: `LM-COUNTRY-${stamp}`,
      legacy_email: email,
      real_name: 'Country Merge',
      country: 'FR',
    });
    const memberId = insertMemberReady(db, {
      slug: `merge_country_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Country Merge',
      country: null,
    });

    claimAtLoginEmailTier(memberId, legacyId);

    // The claim merge holds imported location to the same rules the member's
    // own forms apply, so the legacy record's ISO code lands as the one name
    // the picker offers for that country.
    expect(getMember(memberId)!.country).toBe('France');
  });

  it('merge: OR semantics for is_hof (legacy=1 member=0 -> 1)', () => {
    const stamp = Date.now();
    const email = `merge-hof-${stamp}@example.com`;
    const legacyId = insertLegacyMember(db, {
      legacy_member_id: `LM-HOF-${stamp}`,
      legacy_email: email,
      real_name: 'Hof Merge',
      is_hof: 1,
    });
    const memberId = insertMemberReady(db, {
      slug: `merge_hof_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Hof Merge',
      is_hof: 0,
    });

    claimAtLoginEmailTier(memberId, legacyId);

    expect(getMember(memberId)!.is_hof).toBe(1);
  });

  it('merge: OR semantics for is_bap (legacy=1 member=0 -> 1)', () => {
    const stamp = Date.now();
    const email = `merge-bap-${stamp}@example.com`;
    const legacyId = insertLegacyMember(db, {
      legacy_member_id: `LM-BAP-${stamp}`,
      legacy_email: email,
      real_name: 'Bap Merge',
      is_bap: 1,
    });
    const memberId = insertMemberReady(db, {
      slug: `merge_bap_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Bap Merge',
      is_bap: 0,
    });

    claimAtLoginEmailTier(memberId, legacyId);

    expect(getMember(memberId)!.is_bap).toBe(1);
  });

  it('tier grant: writes legacy.claim_tier_grant row', () => {
    const stamp = Date.now();
    const email = `tier-grant-${stamp}@example.com`;
    const legacyId = insertLegacyMember(db, {
      legacy_member_id: `LM-TG-${stamp}`,
      legacy_email: email,
      real_name: 'Tier Grant',
    });
    const memberId = insertMemberReady(db, {
      slug: `tier_grant_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Tier Grant',
    });

    const grantsBefore = getTierGrants(memberId);

    claimAtLoginEmailTier(memberId, legacyId);

    const grantsAfter = getTierGrants(memberId);
    expect(grantsAfter.length).toBe(grantsBefore.length + 1);
    const newGrant = grantsAfter[grantsAfter.length - 1];
    expect(newGrant.reason_code).toBe('legacy.claim_tier_grant');
    expect(newGrant.change_type).toBe('grant');
  });

  it('tier grant: HoF legacy -> tier2 grant', () => {
    const stamp = Date.now();
    const email = `tier-hof-${stamp}@example.com`;
    const legacyId = insertLegacyMember(db, {
      legacy_member_id: `LM-TH-${stamp}`,
      legacy_email: email,
      real_name: 'Tier Hof',
      is_hof: 1,
    });
    const memberId = insertMemberReady(db, {
      slug: `tier_hof_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Tier Hof',
    });

    claimAtLoginEmailTier(memberId, legacyId);

    const claimGrant = getTierGrants(memberId).find((g) => g.reason_code === 'legacy.claim_tier_grant');
    expect(claimGrant).toBeDefined();
    expect(claimGrant!.new_tier_status).toBe('tier2');
  });
});

// ── Transitive competition-record claim ──────────────────────────────────────

describe('transitive competition-record claim through the legacy back-link', () => {
  it('claiming a legacy row that back-links to a record sets both members.legacy_member_id and members.historical_person_id', () => {
    const stamp = Date.now();
    const email = `trans-${stamp}@example.com`;
    const legacyId = `LM-TRANS-${stamp}`;

    insertLegacyMember(db, {
      legacy_member_id: legacyId,
      legacy_email: email,
      real_name: 'Trans Claim',
      country: 'DE',
      first_competition_year: 2001,
    });
    const personId = insertHistoricalPerson(db, {
      legacy_member_id: legacyId,
      person_name: 'Trans Claim',
      country: 'DE',
      first_year: 2001,
    });
    const memberId = insertMemberReady(db, {
      slug: `trans_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Trans Claim',
    });

    claimAtLoginEmailTier(memberId, legacyId);

    const member = getMember(memberId)!;
    expect(member.legacy_member_id).toBe(legacyId);
    expect(member.historical_person_id).toBe(personId);
  });

  it('record-sourced fields merge onto the member (country fill-if-empty, first_competition_year COALESCE)', () => {
    const stamp = Date.now();
    const email = `hp-merge-${stamp}@example.com`;
    const legacyId = `LM-HPM-${stamp}`;

    insertLegacyMember(db, {
      legacy_member_id: legacyId,
      legacy_email: email,
      real_name: 'Hp Merge',
    });
    insertHistoricalPerson(db, {
      legacy_member_id: legacyId,
      person_name: 'Hp Merge',
      country: 'JP',
      first_year: 1999,
      hof_member: 1,
    });
    const memberId = insertMemberReady(db, {
      slug: `hp_merge_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Hp Merge',
      country: null,
      first_competition_year: null,
      is_hof: 0,
    });

    claimAtLoginEmailTier(memberId, legacyId);

    const member = getMember(memberId)!;
    expect(member.country).toBe('Japan');
    expect(member.first_competition_year).toBe(1999);
    expect(member.is_hof).toBe(1);
  });
});

// ── Claim idempotency ────────────────────────────────────────────────────────

describe('claim idempotency', () => {
  it('a second claim after a completed one is refused and duplicates no links or tier grants', () => {
    const stamp = Date.now();
    const email = `idemp-${stamp}@example.com`;
    const legacyId = insertLegacyMember(db, {
      legacy_member_id: `LM-IDEMP-${stamp}`,
      legacy_email: email,
      real_name: 'Idemp Claim',
    });
    const memberId = insertMemberReady(db, {
      slug: `idemp_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Idemp Claim',
    });

    claimAtLoginEmailTier(memberId, legacyId);
    const grantsAfterFirst = getTierGrants(memberId);
    const memberAfterFirst = getMember(memberId)!;

    expect(() => claimAtLoginEmailTier(memberId, legacyId)).toThrow(/already linked/);

    expect(getTierGrants(memberId).length).toBe(grantsAfterFirst.length);
    expect(getMember(memberId)!.legacy_member_id).toBe(memberAfterFirst.legacy_member_id);
  });
});

// ── Legacy row already claimed by another member ─────────────────────────────

describe('legacy row already claimed', () => {
  it('a claim of an account another member holds is refused and writes no new linkage', () => {
    const stamp = Date.now();
    const email = `clash-${stamp}@example.com`;
    const legacyId = `LM-CLASH-${stamp}`;

    const firstMemberId = insertMemberReady(db, {
      slug: `clash_first_${stamp}`,
      login_email: `clash-first-${stamp}@example.com`,
    });
    insertLegacyMember(db, {
      legacy_member_id: legacyId,
      legacy_email: email,
      real_name: 'Clash Legacy',
      claimed_by_member_id: firstMemberId,
      claimed_at: '2025-01-01T00:00:00.000Z',
    });

    const secondMemberId = insertMemberReady(db, {
      slug: `clash_second_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Clash Legacy',
    });

    expect(() => claimAtLoginEmailTier(secondMemberId, legacyId)).toThrow(/already been claimed/);

    expect(getMember(secondMemberId)!.legacy_member_id).toBeNull();
    expect(getLegacyMember(legacyId)!.claimed_by_member_id).toBe(firstMemberId);
  });
});

// ── Audit entries ────────────────────────────────────────────────────────────

describe('claim audit trail', () => {
  it('a legacy-account claim emits a claim.legacy_account audit entry', () => {
    const stamp = Date.now();
    const email = `audit-${stamp}@example.com`;
    const legacyId = insertLegacyMember(db, {
      legacy_member_id: `LM-AUDIT-${stamp}`,
      legacy_email: email,
      real_name: 'Audit Claim',
    });
    const memberId = insertMemberReady(db, {
      slug: `audit_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Audit Claim',
    });

    const before = countAuditEntries(memberId, 'claim.legacy_account');

    claimAtLoginEmailTier(memberId, legacyId);

    expect(countAuditEntries(memberId, 'claim.legacy_account')).toBe(before + 1);
  });
});

// ── Declared-anchor matching (old email / former surname) ────────────────────

describe('declared-anchor matching in the wizard claim task', () => {
  it('surfaces a candidate from a declared old email stored case-insensitively', async () => {
    const stamp = Date.now();
    insertLegacyMember(db, {
      legacy_member_id: `LM-ANCHOR-${stamp}`,
      legacy_email: `Anchor.Case-${stamp}@Example.COM`,
      real_name: `Anchor Email ${stamp}`,
      country: 'CA',
    });
    const memberId = insertMemberReady(db, {
      slug: `anchor_email_${stamp}`,
      login_email: `current-${stamp}@example.com`,
      real_name: `Different Now ${stamp}`,
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    const addRes = await request(createApp())
      .post('/register/wizard/legacy_claim/anchors/add')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ anchorType: 'old_email', anchorValue: `anchor.case-${stamp}@example.com` });
    expect(addRes.status).toBe(303);

    const page = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    // The card says what kind of evidence found it, never the address itself.
    expect(page.text).toContain('found through an email address');
    expect(page.text).not.toContain(`anchor.case-${stamp}@example.com</div>`);
    expect(page.text).toContain(`Anchor Email ${stamp}`);
  });

  it('surfaces no candidate and reveals nothing when a declared email is ambiguous', async () => {
    const stamp = Date.now();
    const collide = `ambig-${stamp}@example.com`;
    insertLegacyMember(db, {
      legacy_member_id: `LM-AMBIG-E-${stamp}`,
      legacy_email: collide,
      real_name: `Ambiguous Email ${stamp}`,
    });
    // The same address on a second account, in a secondary slot.
    insertLegacyMember(db, {
      legacy_member_id: `LM-AMBIG-U-${stamp}`,
      legacy_email2: collide,
      real_name: `Ambiguous User ${stamp}`,
    });
    const memberId = insertMemberReady(db, {
      slug: `anchor_ambig_${stamp}`,
      login_email: `cur-ambig-${stamp}@example.com`,
      real_name: `Ambig Now ${stamp}`,
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    await request(createApp())
      .post('/register/wizard/legacy_claim/anchors/add')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ anchorType: 'old_email', anchorValue: collide });

    const page = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(page.status).toBe(200);
    expect(page.text).not.toContain(`Ambiguous Email ${stamp}`);
    expect(page.text).not.toContain(`Ambiguous User ${stamp}`);
  });

  it('de-duplicates an account reachable from two declared anchors', async () => {
    const stamp = Date.now();
    const email = `dup-${stamp}@example.com`;
    const email2 = `dup2-${stamp}@example.com`;
    insertLegacyMember(db, {
      legacy_member_id: `LM-DUP-${stamp}`,
      legacy_email: email,
      legacy_email2: email2,
      real_name: `Dup Person ${stamp}`,
    });
    const memberId = insertMemberReady(db, {
      slug: `anchor_dup_${stamp}`,
      login_email: `cur-dup-${stamp}@example.com`,
      real_name: `Dup Now ${stamp}`,
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    for (const value of [email, email2]) {
      await request(createApp())
        .post('/register/wizard/legacy_claim/anchors/add')
        .set('Cookie', cookieFor(memberId))
        .type('form')
        .send({ anchorType: 'old_email', anchorValue: value });
    }

    const page = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    const occurrences = page.text.split(`<div class="candidate-card-name">Dup Person ${stamp}</div>`).length - 1;
    expect(occurrences).toBe(1);
  });
});
