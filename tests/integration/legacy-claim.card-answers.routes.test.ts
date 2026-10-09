/**
 * The claim step's answers, through the wizard routes.
 *
 * A card the member's own evidence makes claimable is claimed whole from its
 * card: the account and the record the pipeline linked to it, the tier grant,
 * the evidence-tagged claim audit, and the step completes. The non-claiming
 * answers complete the step and record the cards passed over. A target the
 * step does not offer is refused uniformly, recorded, and writes nothing.
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

const { dbPath } = setTestEnv('3096');

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
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function auditRows(memberId: string, actionType: string): Array<{ metadata_json: string }> {
  return db.prepare(
    `SELECT metadata_json FROM audit_entries
     WHERE entity_type = 'member' AND entity_id = ? AND action_type = ?`,
  ).all(memberId, actionType) as Array<{ metadata_json: string }>;
}

function taskState(memberId: string): string | undefined {
  return (db.prepare(
    `SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = 'legacy_claim'`,
  ).get(memberId) as { state: string } | undefined)?.state;
}

// A surname no other case uses, letters only so the name fold keeps it whole.
let seq = 0;
function surname(): string {
  seq += 1;
  return `Zq${String.fromCharCode(97 + (seq % 26))}${String.fromCharCode(97 + Math.floor(seq / 26) % 26)}card`;
}

/** A registrant whose login email sits on an old account linked to a record. */
function seedPair(): { memberId: string; legacyId: string; personId: string; name: string } {
  const name = `Card ${surname()}`;
  const tag = name.toLowerCase().replace(/\s+/g, '-');
  const email = `${tag}@example.com`;
  const legacyId = `LM-${tag}`;
  const personId = `HP-${tag}`;
  insertLegacyMember(db, { legacy_member_id: legacyId, legacy_email: email, real_name: name, display_name: name });
  insertHistoricalPerson(db, { person_id: personId, person_name: name, legacy_member_id: legacyId });
  const memberId = insertMember(db, {
    slug: `m_${tag.replace(/-/g, '_')}`, login_email: email, real_name: name, display_name: name,
    birth_date: '1981-05-06', onboarding: 'none',
  });
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
  return { memberId, legacyId, personId, name };
}

describe('a claimable card', () => {
  // Defect caught: the card the member's evidence reaches is missing, or its
  // claim form carries no target, so the member cannot claim it.
  it('renders its claim form carrying the candidate ids', async () => {
    const t = seedPair();
    const res = await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(t.memberId));
    expect(res.status).toBe(200);
    expect(res.text).toContain('action="/register/wizard/legacy_claim/claim"');
    expect(res.text).toContain(`value="${t.legacyId}"`);
    expect(res.text).toContain(`value="${t.personId}"`);
  });

  // Defect caught: a claim takes the account but not its linked record, skips
  // the tier grant, records the wrong tier, or leaves the step pending.
  it('claims the account and its record whole and completes the step', async () => {
    const t = seedPair();
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/claim')
      .set('Cookie', cookieFor(t.memberId))
      .type('form')
      .send({ accountId: t.legacyId, recordId: t.personId });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');

    const mem = db.prepare('SELECT legacy_member_id, historical_person_id FROM members WHERE id = ?')
      .get(t.memberId) as Record<string, unknown>;
    expect(mem).toEqual({ legacy_member_id: t.legacyId, historical_person_id: t.personId });
    expect(taskState(t.memberId)).toBe('completed');
    const grants = db.prepare(`SELECT COUNT(*) AS c FROM member_tier_grants WHERE member_id = ? AND reason_code = 'legacy.claim_tier_grant'`)
      .get(t.memberId) as { c: number };
    expect(grants.c).toBe(1);

    const claims = auditRows(t.memberId, 'claim.legacy_account');
    expect(claims).toHaveLength(1);
    const meta = JSON.parse(claims[0].metadata_json);
    expect(meta.evidence_strength).toBe('currently_controls_modern_email_matching_legacy');
    expect(meta.evidence).toMatchObject({ account_id: t.legacyId, record_id: t.personId, corroborated: true });
    expect(claims[0].metadata_json).not.toContain(t.name);
  });

  // Defect caught: a double submit after the claim landed shows an error page
  // or writes a second claim.
  it('a repeated claim reports the success it already had and writes nothing more', async () => {
    const t = seedPair();
    const post = () => request(createApp())
      .post('/register/wizard/legacy_claim/claim')
      .set('Cookie', cookieFor(t.memberId))
      .type('form')
      .send({ accountId: t.legacyId, recordId: t.personId });
    expect((await post()).status).toBe(303);
    const again = await post();
    expect(again.status).toBe(303);
    expect(auditRows(t.memberId, 'claim.legacy_account')).toHaveLength(1);
  });
});

describe('the non-claiming answers', () => {
  // Defect caught: answering "I never had an old account" leaves the step
  // pending, or records nothing about the cards that were passed over.
  it('complete the step and record the cards that were shown', async () => {
    const t = seedPair();
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', cookieFor(t.memberId))
      .type('form')
      .send({ no_link_answer: 'never_had_one' });
    expect(res.status).toBe(303);
    expect(taskState(t.memberId)).toBe('completed');
    const answered = auditRows(t.memberId, 'legacy.claim_step_answered');
    expect(answered).toHaveLength(1);
    const meta = JSON.parse(answered[0].metadata_json);
    expect(meta.answer).toBe('never_had_one');
    expect(meta.shown).toHaveLength(1);
    expect(meta.shown[0]).toMatchObject({ account_id: t.legacyId, record_id: t.personId });
    expect(auditRows(t.memberId, 'wizard.legacy_claim.never_had_account')).toHaveLength(1);
  });

  // Defect caught: a missing answer completes the step anyway.
  it('without an answer change nothing', async () => {
    const t = seedPair();
    await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', cookieFor(t.memberId))
      .type('form')
      .send({});
    expect(taskState(t.memberId)).not.toBe('completed');
    expect(auditRows(t.memberId, 'legacy.claim_step_answered')).toHaveLength(0);
  });
});

describe('a claim the step does not offer', () => {
  // Defect caught: a forged or surname-differing target is claimed from the
  // claim route, or the refusal leaves no trace for an administrator.
  it('is refused uniformly, recorded, and writes nothing', async () => {
    const t = seedPair();
    const stranger = `Card ${surname()}`;
    insertHistoricalPerson(db, { person_id: 'HP-not-offered', person_name: stranger });
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/claim')
      .set('Cookie', cookieFor(t.memberId))
      .type('form')
      .send({ recordId: 'HP-not-offered' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('This record is no longer available to claim.');
    const mem = db.prepare('SELECT historical_person_id FROM members WHERE id = ?').get(t.memberId) as Record<string, unknown>;
    expect(mem.historical_person_id).toBeNull();
    const refused = auditRows(t.memberId, 'claim.refused');
    expect(refused).toHaveLength(1);
    expect(JSON.parse(refused[0].metadata_json)).toMatchObject({ record_id: 'HP-not-offered', refusal: 'not_reached' });
  });
});
