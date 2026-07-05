/**
 * Integration tests for onboarding wizard legacy-claim side effects,
 * merge rules, tier grants, and idempotency. Exercises the email-equality
 * fast path (login email == legacy_email), the token-based claim path,
 * merge-rule field copying (COALESCE, OR-merge, fill-if-empty, active wins),
 * tier grant mapping, claim idempotency, and transitive HP claim (Case E).
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
  createTestSessionJwt,
  insertMemberTierGrant,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3210');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
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

function getTaskState(memberId: string, taskType: string): string | null {
  const row = db.prepare(
    'SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = ?',
  ).get(memberId, taskType) as { state: string } | undefined;
  return row?.state ?? null;
}

function countAuditEntries(memberId: string, actionType: string): number {
  return (db.prepare(
    "SELECT COUNT(*) AS c FROM audit_entries WHERE actor_member_id = ? AND action_type = ?",
  ).get(memberId, actionType) as { c: number }).c;
}

// ── Captcha gate on claim initiation ─────────────────────────────────────────

describe('captcha gate on legacy_claim/find', () => {
  it('rejects with a generic 422 and performs no lookup when the captcha token is invalid', async () => {
    // Imported lazily: a top-level import of captchaAdapter would load
    // src/config/env before setTestEnv runs, pinning the wrong origin.
    const { STUB_CAPTCHA_FAIL_TOKEN } = await import('../../src/adapters/captchaAdapter');
    const stamp = Date.now();
    const email = `captcha-${stamp}@example.com`;
    const legacyId = insertLegacyMember(db, {
      legacy_member_id: `LM-CAP-${stamp}`,
      legacy_email: email,
      real_name: 'Captcha Probe',
    });
    const memberId = insertMember(db, {
      slug: `cap_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Captcha Probe',
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: email, 'cf-turnstile-response': STUB_CAPTCHA_FAIL_TOKEN });

    expect(res.status).toBe(422);
    expect(res.text).toContain('verification');
    // Anti-enumeration: a failed challenge runs no lookup, so the matching legacy
    // account is neither linked nor claimed (identical to a no-result).
    expect(getMember(memberId)!.legacy_member_id).toBeNull();
    expect(getLegacyMember(legacyId)!.claimed_by_member_id).toBeNull();
    expect(getTaskState(memberId, 'legacy_claim')).not.toBe('completed');
  });
});

// ── Email-equality fast path ─────────────────────────────────────────────────

describe('email-equality fast path (login email == legacy_email)', () => {
  it('auto-links, sets legacy_member_id, marks legacy row claimed, completes task', async () => {
    const stamp = Date.now();
    const email = `fast-${stamp}@example.com`;
    const legacyId = insertLegacyMember(db, {
      legacy_member_id: `LM-FAST-${stamp}`,
      legacy_email: email,
      real_name: 'Fast Claim',
      bio: 'legacy bio',
      country: 'CA',
    });
    const memberId = insertMember(db, {
      slug: `fast_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Fast Claim',
      bio: '',
      country: null,
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: email });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');

    const member = getMember(memberId)!;
    expect(member.legacy_member_id).toBe(legacyId);

    const lm = getLegacyMember(legacyId)!;
    expect(lm.claimed_by_member_id).toBe(memberId);
    expect(lm.claimed_at).toBeTruthy();

    expect(getTaskState(memberId, 'legacy_claim')).toBe('completed');
  });

  it('auto-links when the login email matches the legacy secondary email (legacy_email2)', async () => {
    const stamp = Date.now();
    const primary   = `primary2-${stamp}@example.com`;
    const secondary = `secondary2-${stamp}@example.com`;
    const legacyId = insertLegacyMember(db, {
      legacy_member_id: `LM-FAST2-${stamp}`,
      legacy_email: primary,
      legacy_email2: secondary,
      real_name: 'Fast Two',
    });
    const memberId = insertMember(db, {
      slug: `fast2_${stamp}`,
      birth_date: '1980-01-01',
      login_email: secondary,
      real_name: 'Fast Two',
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: secondary });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
    expect(getMember(memberId)!.legacy_member_id).toBe(legacyId);
    expect(getLegacyMember(legacyId)!.claimed_by_member_id).toBe(memberId);
    expect(getTaskState(memberId, 'legacy_claim')).toBe('completed');
  });

  it('auto-links when the login email matches the legacy tertiary email (legacy_email3)', async () => {
    const stamp = Date.now();
    const primary  = `primary3-${stamp}@example.com`;
    const tertiary = `tertiary3-${stamp}@example.com`;
    const legacyId = insertLegacyMember(db, {
      legacy_member_id: `LM-FAST3-${stamp}`,
      legacy_email: primary,
      legacy_email3: tertiary,
      real_name: 'Fast Three',
    });
    const memberId = insertMember(db, {
      slug: `fast3_${stamp}`,
      birth_date: '1980-01-01',
      login_email: tertiary,
      real_name: 'Fast Three',
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: tertiary });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
    expect(getMember(memberId)!.legacy_member_id).toBe(legacyId);
    expect(getLegacyMember(legacyId)!.claimed_by_member_id).toBe(memberId);
    expect(getTaskState(memberId, 'legacy_claim')).toBe('completed');
  });

  it('merge: fill-if-empty bio from legacy', async () => {
    const stamp = Date.now();
    const email = `merge-bio-${stamp}@example.com`;
    insertLegacyMember(db, {
      legacy_member_id: `LM-BIO-${stamp}`,
      legacy_email: email,
      real_name: 'Bio Merge',
      bio: 'legacy bio content',
    });
    const memberId = insertMember(db, {
      slug: `merge_bio_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Bio Merge',
      bio: '',
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: email });

    const member = getMember(memberId)!;
    expect(member.bio).toBe('legacy bio content');
  });

  it('merge: active account wins for real_name', async () => {
    const stamp = Date.now();
    const email = `merge-name-${stamp}@example.com`;
    insertLegacyMember(db, {
      legacy_member_id: `LM-NAME-${stamp}`,
      legacy_email: email,
      real_name: 'Legacy Name',
    });
    const memberId = insertMember(db, {
      slug: `merge_name_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Active Name',
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: email });

    const member = getMember(memberId)!;
    expect(member.real_name).toBe('Active Name');
  });

  it('merge: fill-if-empty country from legacy', async () => {
    const stamp = Date.now();
    const email = `merge-country-${stamp}@example.com`;
    insertLegacyMember(db, {
      legacy_member_id: `LM-COUNTRY-${stamp}`,
      legacy_email: email,
      real_name: 'Country Merge',
      country: 'FR',
    });
    const memberId = insertMember(db, {
      slug: `merge_country_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Country Merge',
      country: null,
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: email });

    const member = getMember(memberId)!;
    expect(member.country).toBe('FR');
  });

  it('merge: OR semantics for is_hof (legacy=1 member=0 -> 1)', async () => {
    const stamp = Date.now();
    const email = `merge-hof-${stamp}@example.com`;
    insertLegacyMember(db, {
      legacy_member_id: `LM-HOF-${stamp}`,
      legacy_email: email,
      real_name: 'Hof Merge',
      is_hof: 1,
    });
    const memberId = insertMember(db, {
      slug: `merge_hof_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Hof Merge',
      is_hof: 0,
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: email });

    const member = getMember(memberId)!;
    expect(member.is_hof).toBe(1);
  });

  it('merge: OR semantics for is_bap (legacy=1 member=0 -> 1)', async () => {
    const stamp = Date.now();
    const email = `merge-bap-${stamp}@example.com`;
    insertLegacyMember(db, {
      legacy_member_id: `LM-BAP-${stamp}`,
      legacy_email: email,
      real_name: 'Bap Merge',
      is_bap: 1,
    });
    const memberId = insertMember(db, {
      slug: `merge_bap_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Bap Merge',
      is_bap: 0,
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: email });

    const member = getMember(memberId)!;
    expect(member.is_bap).toBe(1);
  });

  it('tier grant: writes legacy.claim_tier_grant row', async () => {
    const stamp = Date.now();
    const email = `tier-grant-${stamp}@example.com`;
    insertLegacyMember(db, {
      legacy_member_id: `LM-TG-${stamp}`,
      legacy_email: email,
      real_name: 'Tier Grant',
    });
    const memberId = insertMember(db, {
      slug: `tier_grant_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Tier Grant',
    });

    const grantsBefore = getTierGrants(memberId);

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: email });

    const grantsAfter = getTierGrants(memberId);
    expect(grantsAfter.length).toBe(grantsBefore.length + 1);
    const newGrant = grantsAfter[grantsAfter.length - 1];
    expect(newGrant.reason_code).toBe('legacy.claim_tier_grant');
    expect(newGrant.change_type).toBe('grant');
  });

  it('tier grant: HoF legacy -> tier2 grant', async () => {
    const stamp = Date.now();
    const email = `tier-hof-${stamp}@example.com`;
    insertLegacyMember(db, {
      legacy_member_id: `LM-TH-${stamp}`,
      legacy_email: email,
      real_name: 'Tier Hof',
      is_hof: 1,
    });
    const memberId = insertMember(db, {
      slug: `tier_hof_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Tier Hof',
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: email });

    const grants = getTierGrants(memberId);
    const claimGrant = grants.find((g) => g.reason_code === 'legacy.claim_tier_grant');
    expect(claimGrant).toBeDefined();
    expect(claimGrant!.new_tier_status).toBe('tier2');
  });
});

// ── Transitive HP claim (Case E) ─────────────────────────────────────────────

describe('transitive HP claim through legacy back-link (Case E)', () => {
  it('claiming legacy row that back-links to HP sets both members.legacy_member_id and members.historical_person_id', async () => {
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
    const memberId = insertMember(db, {
      slug: `trans_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Trans Claim',
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: email });

    const member = getMember(memberId)!;
    expect(member.legacy_member_id).toBe(legacyId);
    expect(member.historical_person_id).toBe(personId);
  });

  it('HP-sourced fields merge onto member (country fill-if-empty, first_competition_year COALESCE)', async () => {
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
    const memberId = insertMember(db, {
      slug: `hp_merge_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Hp Merge',
      country: null,
      first_competition_year: null,
      is_hof: 0,
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: email });

    const member = getMember(memberId)!;
    expect(member.country).toBe('JP');
    expect(member.first_competition_year).toBe(1999);
    expect(member.is_hof).toBe(1);
  });
});

// ── Claim idempotency ────────────────────────────────────────────────────────

describe('claim idempotency', () => {
  it('re-submitting after a completed claim does not duplicate links or tier grants', async () => {
    const stamp = Date.now();
    const email = `idemp-${stamp}@example.com`;
    insertLegacyMember(db, {
      legacy_member_id: `LM-IDEMP-${stamp}`,
      legacy_email: email,
      real_name: 'Idemp Claim',
    });
    const memberId = insertMember(db, {
      slug: `idemp_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Idemp Claim',
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));

    // First claim
    await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: email });

    const grantsAfterFirst = getTierGrants(memberId);
    const memberAfterFirst = getMember(memberId)!;

    // Second attempt
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: email });

    expect(res.status).toBe(303);
    const grantsAfterSecond = getTierGrants(memberId);
    const memberAfterSecond = getMember(memberId)!;

    expect(grantsAfterSecond.length).toBe(grantsAfterFirst.length);
    expect(memberAfterSecond.legacy_member_id).toBe(memberAfterFirst.legacy_member_id);
  });
});

// ── Back-linked legacy already claimed by another member ─────────────────────

describe('back-linked legacy already claimed', () => {
  it('fast-path claim on already-claimed legacy row returns 303 (non-revealing) and writes no new linkage', async () => {
    const stamp = Date.now();
    const email = `clash-${stamp}@example.com`;
    const legacyId = `LM-CLASH-${stamp}`;

    const firstMemberId = insertMember(db, {
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

    const secondMemberId = insertMember(db, {
      slug: `clash_second_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Clash Legacy',
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(secondMemberId));
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(secondMemberId))
      .type('form')
      .send({ identifier: email });

    expect(res.status).toBe(303);

    const member = getMember(secondMemberId)!;
    expect(member.legacy_member_id).toBeNull();
  });
});

// ── Audit entries ────────────────────────────────────────────────────────────

describe('claim audit trail', () => {
  it('fast-path claim emits a claim.legacy_account audit entry', async () => {
    const stamp = Date.now();
    const email = `audit-${stamp}@example.com`;
    insertLegacyMember(db, {
      legacy_member_id: `LM-AUDIT-${stamp}`,
      legacy_email: email,
      real_name: 'Audit Claim',
    });
    const memberId = insertMember(db, {
      slug: `audit_${stamp}`,
      birth_date: '1980-01-01',
      login_email: email,
      real_name: 'Audit Claim',
    });

    const before = countAuditEntries(memberId, 'claim.legacy_account');

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: email });

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
    const memberId = insertMember(db, {
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
    expect(page.text).toContain('Matched via declared old email.');
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
    insertLegacyMember(db, {
      legacy_member_id: `LM-AMBIG-U-${stamp}`,
      legacy_user_id: collide,
      real_name: `Ambiguous User ${stamp}`,
    });
    const memberId = insertMember(db, {
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

  it('de-duplicates a legacy-only row reachable from two declared anchors', async () => {
    const stamp = Date.now();
    const email = `dup-${stamp}@example.com`;
    const username = `dupuser-${stamp}`;
    insertLegacyMember(db, {
      legacy_member_id: `LM-DUP-${stamp}`,
      legacy_email: email,
      legacy_user_id: username,
      real_name: `Dup Person ${stamp}`,
    });
    const memberId = insertMember(db, {
      slug: `anchor_dup_${stamp}`,
      login_email: `cur-dup-${stamp}@example.com`,
      real_name: `Dup Now ${stamp}`,
    });

    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    for (const value of [email, username]) {
      await request(createApp())
        .post('/register/wizard/legacy_claim/anchors/add')
        .set('Cookie', cookieFor(memberId))
        .type('form')
        .send({ anchorType: 'old_email', anchorValue: value });
    }

    const page = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    const occurrences = page.text.split(`Dup Person ${stamp}`).length - 1;
    expect(occurrences).toBe(1);
  });
});
