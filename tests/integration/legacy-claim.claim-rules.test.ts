/**
 * Claim rules that hold on every self-serve path.
 *
 * The surname rule binds the legacy-account claim as it binds the record
 * claim, so a family's shared email address cannot hand one spouse the other's
 * old account, record and tier. The two no-account answers are recorded as the
 * facts they are. A concurrent claim answers as the synchronous check does.
 * Names with accented capitals are found. A record held by an erased honoree
 * still counts as held. Repeating a confirmation that already succeeded
 * reports that success. Claim confirmations are rate-limited.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  insertHistoricalPerson,
  insertOnboardingTask,
  insertMemberDeclaredAnchor,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4245');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/identityAccessService').identityAccessService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let onboarding: typeof import('../../src/services/memberOnboardingService').memberOnboardingService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let errors: typeof import('../../src/services/serviceErrors');

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
  svc = (await import('../../src/services/identityAccessService')).identityAccessService;
  onboarding = (await import('../../src/services/memberOnboardingService')).memberOnboardingService;
  errors = await import('../../src/services/serviceErrors');
});

afterEach(() => vi.restoreAllMocks());

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

let _seq = 0;
function tag(prefix: string): string {
  _seq += 1;
  return `lcr_${prefix}_${_seq.toString().padStart(3, '0')}`;
}

/** A registrant past personal details, in the claim step. */
function registrant(t: string, name: string, email = `${t}@example.com`): string {
  const memberId = insertMember(db, {
    id: `${t}_member`, slug: `slug_${t}`, login_email: email,
    real_name: name, display_name: name, birth_date: '1980-01-01', onboarding: 'none',
  });
  insertOnboardingTask(db, memberId, 'personal_details', 'completed');
  return memberId;
}

function memberLinks(memberId: string): { legacy_member_id: string | null; historical_person_id: string | null } {
  return db.prepare('SELECT legacy_member_id, historical_person_id FROM members WHERE id = ?')
    .get(memberId) as { legacy_member_id: string | null; historical_person_id: string | null };
}

describe('the surname rule on a legacy-account claim', () => {
  it('refuses a shared family address whose old account carries another surname, and offers no plain claim', async () => {
    // One spouse's old account kept the family address; the other spouse
    // registers with it.
    const t = tag('shared');
    const email = `${t}@example.com`;
    insertLegacyMember(db, { legacy_member_id: `${t}_leg`, legacy_email: email, real_name: 'Robin Ashdown' });
    insertHistoricalPerson(db, { person_id: `${t}_hp`, person_name: 'Robin Ashdown', legacy_member_id: `${t}_leg` });
    const memberId = registrant(t, 'Sam Brightwater', email);

    // A matching email does not hand over the account, its record and tier.
    expect(() => svc.claimLegacyAccount(memberId, `${t}_leg`, 'currently_controls_modern_email_matching_legacy'))
      .toThrow(/does not match this record/);
    expect(memberLinks(memberId)).toEqual({ legacy_member_id: null, historical_person_id: null });

    // The card says the surname differs and asks the member to name it; it
    // never offers the plain claim the rule would refuse.
    const view = await svc.getLinkHistoryViewForWizard(memberId);
    const card = view!.candidates.find((c) => c.accountId === `${t}_leg`);
    expect(card?.cardKind).toBe('claim_with_surname');
    expect(card?.differingSurname).toBe('Ashdown');
  });

  it('a declared former surname satisfies the rule, as it does on the record claim', () => {
    const t = tag('former');
    const email = `${t}@example.com`;
    insertLegacyMember(db, { legacy_member_id: `${t}_leg`, legacy_email: email, real_name: 'Jo Hartwell' });
    const memberId = registrant(t, 'Jo Penrose', email);
    insertMemberDeclaredAnchor(db, { member_id: memberId, anchor_type: 'former_surname', anchor_value: 'Hartwell' });

    svc.claimLegacyAccount(memberId, `${t}_leg`, 'currently_controls_modern_email_matching_legacy');
    expect(memberLinks(memberId).legacy_member_id).toBe(`${t}_leg`);
  });
});

describe('the two no-account answers are different facts', () => {
  it('"I had one but cannot find it" is recorded as that, not as never having had one', async () => {
    const t = tag('cantfind');
    const name = `Casey ${t}`;
    insertLegacyMember(db, { legacy_member_id: `${t}_leg`, legacy_email: `${t}@example.com`, real_name: name });
    insertHistoricalPerson(db, { person_id: `${t}_hp`, person_name: name, legacy_member_id: `${t}_leg` });
    const memberId = registrant(t, name);

    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ no_link_answer: 'cannot_find_it' });
    expect(res.status).toBe(303);

    // The ledger is permanent; recording the opposite answer could never be undone.
    const actions = (db.prepare(
      `SELECT action_type, metadata_json FROM audit_entries WHERE entity_type = 'member' AND entity_id = ?`,
    ).all(memberId) as Array<{ action_type: string; metadata_json: string }>);
    expect(actions.map((a) => a.action_type)).toContain('wizard.legacy_claim.cannot_find_record');
    expect(actions.map((a) => a.action_type)).not.toContain('wizard.legacy_claim.never_had_account');
    const answered = actions.find((a) => a.action_type === 'legacy.claim_step_answered');
    expect(JSON.parse(answered!.metadata_json).answer).toBe('cannot_find_it');
  });
});

describe('a concurrent competition-record claim', () => {
  it('answers the losing side with the already-claimed response, not an error page', async () => {
    const t = tag('race');
    const name = `Casey ${t}`;
    insertHistoricalPerson(db, { person_id: `${t}_hp`, person_name: name });
    const memberId = registrant(t, name);
    // The unique index catching a concurrent winner surfaces as this error.
    vi.spyOn(onboarding, 'claimHistoricalPersonAndCompleteTask').mockImplementation(() => {
      throw new errors.ConflictError('This historical record has already been claimed by another member.');
    });

    const res = await request(createApp())
      .post(`/history/${t}_hp/claim/confirm`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});
    expect(res.status).toBe(422);
    expect(res.text).toContain('already been claimed');
  });
});

describe('finding a record by name', () => {
  it('finds a record whose name carries an accented capital', async () => {
    const t = tag('accent');
    insertHistoricalPerson(db, { person_id: `${t}_hp`, person_name: `Élodie Durand${t}` });
    const memberId = registrant(t, `Élodie Durand${t}`);
    const view = await svc.getLinkHistoryViewForWizard(memberId);
    expect(view!.candidates.map((c) => c.recordId)).toContain(`${t}_hp`);
  });
});

describe('who counts as holding a record', () => {
  it('a record held by an erased honoree still raises the conflict prompt', async () => {
    const t = tag('honoree');
    const name = `Casey Holdfast${t}`;
    insertHistoricalPerson(db, { person_id: `${t}_hp`, person_name: name });
    insertMember(db, {
      id: `${t}_holder`, slug: `slug_${t}_holder`, login_email: `${t}-holder@example.com`,
      real_name: name, is_hof: 1, historical_person_id: `${t}_hp`,
      deleted_at: '2026-01-01T00:00:00.000Z',
    });
    const memberId = registrant(t, `Pat Holdfast${t}`);

    // An honoree keeps the record through erasure, so the claim refuses it;
    // the prompt that offers the dispute path must agree that it is held.
    const view = await svc.getLinkHistoryViewForWizard(memberId);
    expect(view!.conflictPrompt).not.toBeNull();
  });
});

describe('repeating a confirmation that already succeeded', () => {
  it('a second press of This Is Me reports the success rather than an "already linked" refusal', async () => {
    const t = tag('twice');
    const name = `Casey ${t}`;
    const email = `${t}@example.com`;
    insertLegacyMember(db, { legacy_member_id: `${t}_leg`, legacy_email: email, real_name: name });
    insertHistoricalPerson(db, { person_id: `${t}_hp`, person_name: name, legacy_member_id: `${t}_leg` });
    const memberId = registrant(t, name, email);
    onboarding.startTaskList(memberId);

    const first = await request(createApp())
      .post('/register/wizard/legacy_claim/claim')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ accountId: `${t}_leg`, recordId: `${t}_hp` });
    const second = await request(createApp())
      .post('/register/wizard/legacy_claim/claim')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ accountId: `${t}_leg`, recordId: `${t}_hp` });
    expect(first.status).toBe(303);
    expect(second.status).toBe(303);
    // The repeat lands where the claim already sent the member, never on a
    // refusal; if it goes by way of the completed step, that step sends on.
    let landing = second.headers.location;
    if (landing !== first.headers.location) {
      const hop = await request(createApp()).get(landing).set('Cookie', cookieFor(memberId));
      expect(hop.status).toBe(303);
      landing = hop.headers.location;
    }
    expect(landing).toBe(first.headers.location);
    const claims = db.prepare(
      `SELECT COUNT(*) AS c FROM audit_entries WHERE entity_id = ? AND action_type = 'claim.legacy_account'`,
    ).get(memberId) as { c: number };
    expect(claims.c).toBe(1);
  });
});

describe('claim confirmations are rate-limited', () => {
  it('a confirmation over the limit is refused with 429 and claims nothing', async () => {
    const t = tag('limit');
    const name = `Casey ${t}`;
    const email = `${t}@example.com`;
    insertLegacyMember(db, { legacy_member_id: `${t}_leg`, legacy_email: email, real_name: name });
    insertHistoricalPerson(db, { person_id: `${t}_hp`, person_name: name, legacy_member_id: `${t}_leg` });
    const memberId = registrant(t, name, email);
    vi.spyOn(svc, 'enforceHistoricalPersonClaimLimit').mockImplementation(() => {
      throw new errors.RateLimitedError('Too many claim attempts. Please try again later.', 60);
    });

    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/claim')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ accountId: `${t}_leg`, recordId: `${t}_hp` });
    expect(res.status).toBe(429);
    expect(memberLinks(memberId).historical_person_id).toBeNull();
  });
});

describe('claim attempts at one record are bounded across accounts', () => {
  it('a record targeted from many accounts and addresses is refused once its own ceiling is reached', () => {
    // Each attempt comes from a different member and address, so only a
    // per-record bucket can stop a spread-out run at one record.
    const target = tag('target');
    const ceiling = 5; // hp_claim_rate_limit_max_per_member, as seeded
    for (let i = 0; i < ceiling; i++) {
      svc.enforceHistoricalPersonClaimLimit(`${target}_m${i}`, `198.51.100.${i + 1}`, target);
    }
    expect(() => svc.enforceHistoricalPersonClaimLimit(`${target}_m99`, '198.51.100.99', target))
      .toThrow(errors.RateLimitedError);
  });
});
