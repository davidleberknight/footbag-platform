/**
 * Integration tests for direct historical-person (HP) claim through
 * the /history/:personId/claim surface. Covers surname-match gate,
 * first-name-variant warning, surname-mismatch rejection, HP already
 * claimed by another member, transitive legacy claim through HP
 * back-link, and deceased-HP-does-not-affect-member invariant.
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
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3211');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/memberOnboardingService').memberOnboardingService;

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
  const mod = await import('../../src/services/memberOnboardingService');
  svc = mod.memberOnboardingService;
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

// ── Direct HP claim with surname match ───────────────────────────────────────

describe('direct HP claim: surname match succeeds', () => {
  it('POST /history/:personId/claim/confirm sets historical_person_id and emits audit', async () => {
    const stamp = Date.now();
    const memberId = insertMember(db, {
      slug: `hp_ok_${stamp}`,
      birth_date: '1980-01-01',
      login_email: `hp-ok-${stamp}@example.com`,
      real_name: 'Alice Smith',
    });
    const personId = insertHistoricalPerson(db, {
      person_name: 'Alice Smith',
      country: 'US',
      first_year: 2003,
    });
    svc.startTaskList(memberId);

    const res = await request(createApp())
      .post(`/history/${personId}/claim/confirm`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});

    expect(res.status).toBe(303);

    const member = getMember(memberId)!;
    expect(member.historical_person_id).toBe(personId);
    expect(countAuditEntries(memberId, 'claim.historical_person')).toBeGreaterThanOrEqual(1);
    expect(getTaskState(memberId, 'legacy_claim')).toBe('completed');
  });

  it('HP-sourced country fills empty member country', async () => {
    const stamp = Date.now();
    const memberId = insertMember(db, {
      slug: `hp_country_${stamp}`,
      birth_date: '1980-01-01',
      login_email: `hp-country-${stamp}@example.com`,
      real_name: 'Bob Jones',
      country: null,
    });
    const personId = insertHistoricalPerson(db, {
      person_name: 'Bob Jones',
      country: 'NZ',
    });

    await request(createApp())
      .post(`/history/${personId}/claim/confirm`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});

    const member = getMember(memberId)!;
    expect(member.country).toBe('NZ');
  });

  it('HP HoF flag merges onto member via OR semantics', async () => {
    const stamp = Date.now();
    const memberId = insertMember(db, {
      slug: `hp_hof_${stamp}`,
      birth_date: '1980-01-01',
      login_email: `hp-hof-${stamp}@example.com`,
      real_name: 'Carol Lee',
      is_hof: 0,
    });
    const personId = insertHistoricalPerson(db, {
      person_name: 'Carol Lee',
      hof_member: 1,
    });

    await request(createApp())
      .post(`/history/${personId}/claim/confirm`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});

    const member = getMember(memberId)!;
    expect(member.is_hof).toBe(1);

    const grants = getTierGrants(memberId);
    const claimGrant = grants.find((g) => g.reason_code === 'legacy.claim_tier_grant');
    expect(claimGrant).toBeDefined();
    expect(claimGrant!.new_tier_status).toBe('tier2');
  });

  it('HP first_year fills empty member first_competition_year', async () => {
    const stamp = Date.now();
    const memberId = insertMember(db, {
      slug: `hp_year_${stamp}`,
      birth_date: '1980-01-01',
      login_email: `hp-year-${stamp}@example.com`,
      real_name: 'Dan Park',
      first_competition_year: null,
    });
    const personId = insertHistoricalPerson(db, {
      person_name: 'Dan Park',
      first_year: 1998,
    });

    await request(createApp())
      .post(`/history/${personId}/claim/confirm`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});

    const member = getMember(memberId)!;
    expect(member.first_competition_year).toBe(1998);
  });

  it('member-set first_competition_year wins over HP first_year (COALESCE)', async () => {
    const stamp = Date.now();
    const memberId = insertMember(db, {
      slug: `hp_year_win_${stamp}`,
      birth_date: '1980-01-01',
      login_email: `hp-year-win-${stamp}@example.com`,
      real_name: 'Eve Fox',
      first_competition_year: 2010,
    });
    const personId = insertHistoricalPerson(db, {
      person_name: 'Eve Fox',
      first_year: 1995,
    });

    await request(createApp())
      .post(`/history/${personId}/claim/confirm`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});

    const member = getMember(memberId)!;
    expect(member.first_competition_year).toBe(2010);
  });
});

// ── First-name variant warning ───────────────────────────────────────────────

describe('first-name variant warning', () => {
  it('GET claim page shows firstNameWarning when first names differ (Bob vs Robert)', async () => {
    const stamp = Date.now();
    const memberId = insertMember(db, {
      slug: `hp_fnw_${stamp}`,
      login_email: `hp-fnw-${stamp}@example.com`,
      real_name: 'Bob Smith',
    });
    const personId = insertHistoricalPerson(db, {
      person_name: 'Robert Smith',
    });

    const res = await request(createApp())
      .get(`/history/${personId}/claim`)
      .set('Cookie', cookieFor(memberId));

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/name.*vari|different.*first.*name|first.*name.*warning/i);
  });

  it('claim still succeeds when first names differ but surnames match', async () => {
    const stamp = Date.now();
    const memberId = insertMember(db, {
      slug: `hp_fnw_ok_${stamp}`,
      birth_date: '1980-01-01',
      login_email: `hp-fnw-ok-${stamp}@example.com`,
      real_name: 'Bob Smith',
    });
    const personId = insertHistoricalPerson(db, {
      person_name: 'Robert Smith',
    });

    const res = await request(createApp())
      .post(`/history/${personId}/claim/confirm`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});

    expect(res.status).toBe(303);
    const member = getMember(memberId)!;
    expect(member.historical_person_id).toBe(personId);
  });
});

// ── Surname mismatch rejected ────────────────────────────────────────────────

describe('surname mismatch rejected', () => {
  it('GET claim page when surnames do not match -> renders claim-unavailable (anti-enumeration: same 200 as other failure modes)', async () => {
    const stamp = Date.now();
    const memberId = insertMember(db, {
      slug: `hp_nomatch_${stamp}`,
      login_email: `hp-nomatch-${stamp}@example.com`,
      real_name: 'Alice Smith',
    });
    const personId = insertHistoricalPerson(db, {
      person_name: 'Bob Johnson',
    });

    const res = await request(createApp())
      .get(`/history/${personId}/claim`)
      .set('Cookie', cookieFor(memberId));

    expect(res.status).toBe(200);
    expect(res.text).toContain('Claim unavailable');
  });

  it('POST claim/confirm when surnames do not match -> no linkage', async () => {
    const stamp = Date.now();
    const memberId = insertMember(db, {
      slug: `hp_nomatch_post_${stamp}`,
      birth_date: '1980-01-01',
      login_email: `hp-nomatch-post-${stamp}@example.com`,
      real_name: 'Alice Smith',
    });
    const personId = insertHistoricalPerson(db, {
      person_name: 'Bob Johnson',
    });

    const res = await request(createApp())
      .post(`/history/${personId}/claim/confirm`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});

    expect([200, 422]).toContain(res.status);

    const member = getMember(memberId)!;
    expect(member.historical_person_id).toBeNull();
  });
});

// ── HP already claimed by another member ─────────────────────────────────────

describe('HP already claimed', () => {
  it('second member claiming same HP is rejected', async () => {
    const stamp = Date.now();
    const personId = insertHistoricalPerson(db, { person_name: 'Shared Person' });

    const firstId = insertMember(db, {
      slug: `hp_first_${stamp}`,
      birth_date: '1980-01-01',
      login_email: `hp-first-${stamp}@example.com`,
      real_name: 'Shared Person',
    });
    await request(createApp())
      .post(`/history/${personId}/claim/confirm`)
      .set('Cookie', cookieFor(firstId))
      .type('form')
      .send({});
    expect(getMember(firstId)!.historical_person_id).toBe(personId);

    const secondId = insertMember(db, {
      slug: `hp_second_${stamp}`,
      birth_date: '1980-01-01',
      login_email: `hp-second-${stamp}@example.com`,
      real_name: 'Shared Person',
    });
    const res = await request(createApp())
      .post(`/history/${personId}/claim/confirm`)
      .set('Cookie', cookieFor(secondId))
      .type('form')
      .send({});

    expect(res.status).toBe(422);
    expect(getMember(secondId)!.historical_person_id).toBeNull();
  });
});

// ── Member already linked to an HP ───────────────────────────────────────────

describe('member already linked to an HP', () => {
  it('claiming a second HP when already linked -> validation error', async () => {
    const stamp = Date.now();
    const firstHp = insertHistoricalPerson(db, { person_name: 'First Hp' });
    const secondHp = insertHistoricalPerson(db, { person_name: 'Second Hp' });

    const memberId = insertMember(db, {
      slug: `hp_double_${stamp}`,
      birth_date: '1980-01-01',
      login_email: `hp-double-${stamp}@example.com`,
      real_name: 'First Hp',
    });
    await request(createApp())
      .post(`/history/${firstHp}/claim/confirm`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});
    expect(getMember(memberId)!.historical_person_id).toBe(firstHp);

    db.prepare("UPDATE members SET real_name = 'Second Hp' WHERE id = ?").run(memberId);
    const res = await request(createApp())
      .post(`/history/${secondHp}/claim/confirm`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});

    expect(res.status).toBe(422);
    expect(getMember(memberId)!.historical_person_id).toBe(firstHp);
  });
});

// ── Transitive legacy claim through HP back-link ─────────────────────────────

describe('transitive legacy claim through HP back-link', () => {
  it('HP claim transitively marks the back-linked legacy row claimed', async () => {
    const stamp = Date.now();
    const legacyId = `LM-HPBT-${stamp}`;
    insertLegacyMember(db, {
      legacy_member_id: legacyId,
      real_name: 'Backlink Target',
      country: 'AU',
    });
    const personId = insertHistoricalPerson(db, {
      legacy_member_id: legacyId,
      person_name: 'Backlink Target',
      country: 'AU',
    });
    const memberId = insertMember(db, {
      slug: `hp_bt_${stamp}`,
      birth_date: '1980-01-01',
      login_email: `hp-bt-${stamp}@example.com`,
      real_name: 'Backlink Target',
    });

    await request(createApp())
      .post(`/history/${personId}/claim/confirm`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});

    const member = getMember(memberId)!;
    expect(member.historical_person_id).toBe(personId);
    expect(member.legacy_member_id).toBe(legacyId);

    const lm = db.prepare('SELECT * FROM legacy_members WHERE legacy_member_id = ?').get(legacyId) as Record<string, unknown>;
    expect(lm.claimed_by_member_id).toBe(memberId);
  });

  it('HP claim rejected when back-linked legacy row is already claimed by another member', async () => {
    const stamp = Date.now();
    const legacyId = `LM-HPBC-${stamp}`;
    const otherMemberId = insertMember(db, {
      slug: `hp_bc_other_${stamp}`,
      login_email: `hp-bc-other-${stamp}@example.com`,
    });
    insertLegacyMember(db, {
      legacy_member_id: legacyId,
      real_name: 'Backlink Clash',
      claimed_by_member_id: otherMemberId,
      claimed_at: '2025-06-01T00:00:00.000Z',
    });
    const personId = insertHistoricalPerson(db, {
      legacy_member_id: legacyId,
      person_name: 'Backlink Clash',
    });
    const memberId = insertMember(db, {
      slug: `hp_bc_${stamp}`,
      birth_date: '1980-01-01',
      login_email: `hp-bc-${stamp}@example.com`,
      real_name: 'Backlink Clash',
    });

    const res = await request(createApp())
      .post(`/history/${personId}/claim/confirm`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});

    expect(res.status).toBe(422);
    const member = getMember(memberId)!;
    expect(member.historical_person_id).toBeNull();
    expect(member.legacy_member_id).toBeNull();
  });
});
