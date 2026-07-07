/**
 * Stage-and-confirm candidate lifecycle through the onboarding wizard:
 * a staged candidate renders as a wizard card; confirming it runs the
 * ordinary claim transaction (linkage + tier grant + evidence-tagged claim
 * audit) and resolves the staged row; declining resolves the row terminally
 * and the card never returns; resolution is non-revealing for foreign
 * candidate ids. Cross-path resolution: a claim that arrives through a
 * different path (email-equality fast path) confirms the matching staged
 * row too, and its claim audit row carries the evidence-strength tag.
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
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let identity: typeof import('../../src/services/identityAccessService');

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
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

function stagedRows(memberId: string): Array<Record<string, unknown>> {
  return db.prepare(
    'SELECT * FROM auto_link_staged_candidates WHERE member_id = ? ORDER BY created_at, id',
  ).all(memberId) as Array<Record<string, unknown>>;
}

function auditRows(memberId: string, actionType: string): Array<Record<string, unknown>> {
  return db.prepare(
    `SELECT id, metadata_json FROM audit_entries
     WHERE entity_type = 'member' AND entity_id = ? AND action_type = ?
     ORDER BY created_at, id`,
  ).all(memberId, actionType) as Array<Record<string, unknown>>;
}

let _seq = 0;
function seedStaged(prefix: string, name: string): {
  memberId: string; legacyId: string; personId: string; candidateId: string;
} {
  _seq += 1;
  const tag = `${prefix}-${_seq}`;
  const email = `${tag}@example.com`;
  const legacyId = `LM-${tag}`;
  const personId = `HP-${tag}`;
  insertLegacyMember(db, {
    legacy_member_id: legacyId, legacy_email: email,
    real_name: name, display_name: name,
  });
  insertHistoricalPerson(db, { person_id: personId, person_name: name, legacy_member_id: legacyId });
  const memberId = insertMember(db, {
    slug: `m_${tag.replace(/-/g, '_')}`, login_email: email,
    real_name: name, display_name: name,
    birth_date: '1980-01-01',
  });
  // The legacy-claim step is reachable only once personal details are on file.
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
  const staged = identity.identityAccessService.stageAutoLinkCandidate(
    memberId,
    { confidence: 'high', personId, personName: name },
    'batch',
  );
  if (staged.status !== 'staged') throw new Error(`fixture staging failed: ${staged.status}`);
  return { memberId, legacyId, personId, candidateId: staged.candidateId };
}

describe('wizard staged-candidate card', () => {
  it('GET legacy_claim renders the staged card with confirm and decline affordances', async () => {
    const t = seedStaged('card', 'Card Tester');
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(t.memberId));
    expect(res.status).toBe(200);
    expect(res.text).toContain('This Is Me, Link My History');
    expect(res.text).toContain('/register/wizard/legacy_claim/auto-link/decline');
    expect(res.text).toContain(t.candidateId);
  });

  it('confirm runs the claim, resolves the staged row, and tags the claim audit with the proposed evidence', async () => {
    const t = seedStaged('confirm', 'Confirm Tester');
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/auto-link/confirm')
      .set('Cookie', cookieFor(t.memberId))
      .type('form')
      .send({ personId: t.personId });
    expect(res.status).toBe(303);

    const mem = db.prepare('SELECT * FROM members WHERE id = ?').get(t.memberId) as Record<string, unknown>;
    expect(mem.legacy_member_id).toBe(t.legacyId);
    expect(mem.historical_person_id).toBe(t.personId);
    const lm = db.prepare('SELECT * FROM legacy_members WHERE legacy_member_id = ?').get(t.legacyId) as Record<string, unknown>;
    expect(lm.claimed_by_member_id).toBe(t.memberId);

    const rows = stagedRows(t.memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('confirmed');
    expect(rows[0].resolved_at).not.toBeNull();

    const confirmed = auditRows(t.memberId, 'legacy.auto_link_candidate_confirmed');
    expect(confirmed).toHaveLength(1);
    expect(JSON.parse(String(confirmed[0].metadata_json)).candidate_id).toBe(t.candidateId);

    const claims = auditRows(t.memberId, 'claim.historical_person');
    expect(claims).toHaveLength(1);
    expect(JSON.parse(String(claims[0].metadata_json)).evidence_strength)
      .toBe('currently_controls_modern_email_matching_legacy');
  });

  it('decline resolves the row terminally; the card does not return and the member stays unlinked', async () => {
    const t = seedStaged('decline', 'Decline Tester');
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/auto-link/decline')
      .set('Cookie', cookieFor(t.memberId))
      .type('form')
      .send({ candidateId: t.candidateId });
    expect(res.status).toBe(303);

    const rows = stagedRows(t.memberId);
    expect(rows[0].status).toBe('declined');
    expect(auditRows(t.memberId, 'legacy.auto_link_candidate_declined')).toHaveLength(1);

    const mem = db.prepare('SELECT * FROM members WHERE id = ?').get(t.memberId) as Record<string, unknown>;
    expect(mem.legacy_member_id).toBeNull();

    const after = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(t.memberId));
    expect(after.text).not.toContain(t.candidateId);
  });

  it('declining a foreign candidate id is non-revealing and changes nothing', async () => {
    const owner = seedStaged('victim', 'Victim Tester');
    const attacker = insertMember(db, {
      slug: 'attacker_decline', login_email: 'attacker-decline@example.com',
      real_name: 'Attacker', display_name: 'Attacker',
    });
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/auto-link/decline')
      .set('Cookie', cookieFor(attacker))
      .type('form')
      .send({ candidateId: owner.candidateId });
    expect(res.status).toBe(303);

    const rows = stagedRows(owner.memberId);
    expect(rows[0].status).toBe('staged');
  });
});

describe('cross-path staged resolution and evidence tagging', () => {
  it('the email-equality fast path resolves a matching staged row and tags claim.legacy_account', async () => {
    const t = seedStaged('xpath', 'Xpath Tester');
    // Member claims via the manual-identifier flow; login email matches the
    // legacy email so the merge runs synchronously.
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(t.memberId))
      .type('form')
      .send({ identifier: t.legacyId });
    expect(res.status).toBe(303);

    const rows = stagedRows(t.memberId);
    expect(rows[0].status).toBe('confirmed');
    expect(auditRows(t.memberId, 'legacy.auto_link_candidate_confirmed')).toHaveLength(1);

    const claims = auditRows(t.memberId, 'claim.legacy_account');
    expect(claims).toHaveLength(1);
    expect(JSON.parse(String(claims[0].metadata_json)).evidence_strength)
      .toBe('currently_controls_modern_email_matching_legacy');
  });

  it('a surname-rule rejection rolls the claim back but the blocked audit row survives', async () => {
    insertHistoricalPerson(db, { person_id: 'HP-blocked-1', person_name: 'Zelda Different' });
    const memberId = insertMember(db, {
      slug: 'blocked_claimant', login_email: 'blocked-claimant@example.com',
      real_name: 'Yannick Other', display_name: 'Yannick Other',
    });
    expect(() =>
      identity.identityAccessService.claimHistoricalPerson(memberId, 'HP-blocked-1'),
    ).toThrow(/does not match/);

    const mem = db.prepare('SELECT historical_person_id FROM members WHERE id = ?').get(memberId) as Record<string, unknown>;
    expect(mem.historical_person_id).toBeNull();

    const blocked = auditRows(memberId, 'claim.historical_person_blocked');
    expect(blocked).toHaveLength(1);
    expect(JSON.parse(String(blocked[0].metadata_json)).reason).toBe('surname_mismatch');
  });
});

describe('auto-link confirm drift banner', () => {
  it('a drifting confirm 303s to legacy_claim and the receiving GET renders the drift notice once', async () => {
    const memberId = insertMember(db, {
      slug: 'autolink_drift',
      login_email: 'autolink-drift@example.com',
      birth_date: '1980-01-01',
    });
    // The legacy-claim step is reachable only once personal details are on file.
    insertOnboardingTask(db, memberId, 'personal_details', 'completed');

    // A confirm whose suggested match no longer resolves (a stale form
    // posting a person the classifier no longer produces) takes the drift
    // fallback: 303 back to the task carrying the drift flash, never the
    // standalone confirm template.
    const post = await request(createApp())
      .post('/register/wizard/legacy_claim/auto-link/confirm')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ personId: 'HP-drifted-away' });
    expect(post.status).toBe(303);
    expect(post.headers.location).toBe('/register/wizard/legacy_claim');

    const setCookies = (post.headers['set-cookie'] ?? []) as unknown as string[];
    const flashCookie = setCookies
      .map((c) => c.split(';')[0])
      .find((c) => c.startsWith('footbag_flash='));
    expect(flashCookie).toBeDefined();

    const withFlash = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', `${cookieFor(memberId)}; ${flashCookie}`);
    expect(withFlash.status).toBe(200);
    expect(withFlash.text).toContain('Your suggested match is no longer applicable');

    // The drift flash is one-shot: a fresh GET without it does not show the banner.
    const without = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(without.text).not.toContain('Your suggested match is no longer applicable');
  });
});
