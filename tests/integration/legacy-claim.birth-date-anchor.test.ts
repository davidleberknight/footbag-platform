/**
 * Date-of-birth handling on the legacy-claim flow.
 *
 * Date of birth is collected once, in the personal_details step, which is a
 * prerequisite for the legacy-claim step: none of the legacy-claim resolving
 * actions run until personal_details is completed, and reaching the step early
 * routes the member back to personal_details.
 *
 * The date of birth only ever helps a member. An identical date corroborates a
 * match and narrows a tie between same-name candidates; a date that does not
 * match simply fails to corroborate. It never blocks a claim, never weakens one,
 * and never raises work for an administrator, on either the legacy-account claim
 * path or the direct historical-person claim path.
 *
 * Every claim records the member-versus-record comparison outcome in its audit
 * metadata (identical or mismatch, or which side was absent). That ledger entry
 * is the whole downstream consumer: it is where a disputed link is reconstructed
 * from, and it is exempt from erasure, so it carries no free text.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertHistoricalPerson,
  insertOnboardingTask,
  insertNameVariant,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3247');

const ADMIN_ID = 'bda_admin';

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/identityAccessService').identityAccessService;

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'bda_admin', login_email: 'bda-admin@example.com', is_admin: 1 });
  createApp = await importApp();
  svc = (await import('../../src/services/identityAccessService')).identityAccessService;
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

function memberBirthDate(memberId: string): string | null {
  return (db.prepare('SELECT birth_date FROM members WHERE id = ?').get(memberId) as
    { birth_date: string | null }).birth_date;
}

function getTaskState(memberId: string, taskType: string): string | null {
  const row = db.prepare('SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = ?')
    .get(memberId, taskType) as { state: string } | undefined;
  return row?.state ?? null;
}

function claimAuditMetadata(memberId: string): Record<string, unknown> {
  const row = db.prepare(
    "SELECT metadata_json FROM audit_entries WHERE action_type = 'claim.legacy_account' AND actor_member_id = ? ORDER BY created_at DESC LIMIT 1",
  ).get(memberId) as { metadata_json: string } | undefined;
  expect(row, 'claim.legacy_account audit row').toBeTruthy();
  return JSON.parse(row!.metadata_json);
}

/**
 * Every queue item standing against this member, whatever its type. Asserted
 * empty rather than filtered to one type, so re-introducing a birth-date review
 * under any name fails here instead of passing a filter that no longer matches.
 */
function queueItemsFor(memberId: string): Array<Record<string, unknown>> {
  return db.prepare(
    'SELECT * FROM work_queue_items WHERE entity_type = ? AND entity_id = ?',
  ).all('member', memberId) as Array<Record<string, unknown>>;
}

let _seq = 0;
function nextId(prefix: string): string {
  _seq += 1;
  return `bda_${prefix}_${_seq.toString().padStart(3, '0')}`;
}

/** Member plus an email-matched legacy row back-linked to a historical person. */
function claimFixture(opts: {
  memberBirthDate?: string | null;
  legacyBirthDate?: string | null;
  personName?: string;
  realName?: string;
}): { memberId: string; legacyId: string; hpId: string } {
  const memberId = nextId('mem');
  const legacyId = nextId('leg');
  const hpId = nextId('hp');
  const email = `${memberId}@example.com`;
  // Still signing up: the claim surface lives in the wizard, which closes to a
  // member who has finished.
  insertMember(db, {
    id: memberId,
    slug: `slug_${memberId}`,
    login_email: email,
    real_name: opts.realName ?? `Casey ${memberId}`,
    onboarding: 'none',
  });
  if (opts.memberBirthDate) {
    db.prepare('UPDATE members SET birth_date = ? WHERE id = ?').run(opts.memberBirthDate, memberId);
  }
  insertHistoricalPerson(db, {
    person_id: hpId,
    person_name: opts.personName ?? opts.realName ?? `Casey ${memberId}`,
    legacy_member_id: legacyId,
  });
  db.prepare('UPDATE legacy_members SET legacy_email = ?, birth_date = ? WHERE legacy_member_id = ?')
    .run(email, opts.legacyBirthDate ?? null, legacyId);
  return { memberId, legacyId, hpId };
}

describe('personal_details is a prerequisite for the legacy-claim step', () => {
  it('routes an early legacy_claim GET to personal_details, then renders once personal details are on file', async () => {
    const memberId = insertMember(db, { onboarding: 'none',
      slug: `slug_${nextId('gate')}`,
      login_email: `${nextId('gate')}@example.com`,
      real_name: 'Gate Landing',
    });
    const early = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(early.status).toBe(303);
    expect(early.headers.location).toBe('/register/wizard/personal_details');

    // Completing personal details, which is where date of birth is collected,
    // clears the prerequisite and the legacy-claim step renders.
    const submit = await request(createApp())
      .post('/register/wizard/personal_details/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ city: 'Portland', region: 'OR', country: 'US', birthDay: '13', birthMonth: '11', birthYear: '1984' });
    expect(submit.status).toBe(303);

    const after = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(after.status).toBe(200);
    expect(after.text).toContain('action="/register/wizard/legacy_claim/find"');
    expect(memberBirthDate(memberId)).toBe('1984-11-13');
  });

  it('a manual search does not run until personal_details is completed', async () => {
    const memberId = insertMember(db, { onboarding: 'none',
      slug: `slug_${nextId('gate')}`,
      login_email: `${nextId('gate')}@example.com`,
      real_name: 'Gate Search',
    });
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: 'someone', 'cf-turnstile-response': 'stub-pass' });
    // The action is a no-op that bounces back to the legacy-claim step, which in
    // turn routes the member to personal_details.
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/legacy_claim');
    const bounce = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(bounce.status).toBe(303);
    expect(bounce.headers.location).toBe('/register/wizard/personal_details');
  });

  it('the continue-without-linking decision does not resolve until personal_details is completed', async () => {
    const memberId = insertMember(db, { onboarding: 'none',
      slug: `slug_${nextId('gate')}`,
      login_email: `${nextId('gate')}@example.com`,
      real_name: 'Gate Skip',
    });
    // Even with the never-had-an-account attestation, the decision does not
    // resolve while personal details are still outstanding.
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/continue-without-linking')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ no_link_answer: 'never_had_one' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/legacy_claim');
    expect(getTaskState(memberId, 'legacy_claim')).not.toBe('completed');
    const bounce = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(bounce.status).toBe(303);
    expect(bounce.headers.location).toBe('/register/wizard/personal_details');
  });

  it('a suggested-match confirmation does not run until personal_details is completed', async () => {
    const memberId = insertMember(db, { onboarding: 'none',
      slug: `slug_${nextId('gate')}`,
      login_email: `${nextId('gate')}@example.com`,
      real_name: 'Gate Confirm',
    });
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/auto-link/confirm')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ personId: 'hp_whatever' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/legacy_claim');
    const bounce = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(bounce.status).toBe(303);
    expect(bounce.headers.location).toBe('/register/wizard/personal_details');
  });
});

describe('claim-time birth-date comparison in audit metadata', () => {
  it('identical dates record identical and raise no queue item', () => {
    const { memberId, legacyId } = claimFixture({
      memberBirthDate: '1985-07-10',
      legacyBirthDate: '1985-07-10',
    });
    svc.claimLegacyAccount(memberId, legacyId);
    expect(claimAuditMetadata(memberId).dob_comparison).toBe('identical');
    expect(queueItemsFor(memberId)).toHaveLength(0);
  });

  it('a typo-shaped date is a plain mismatch, and raises nothing for an administrator', () => {
    const { memberId, legacyId } = claimFixture({
      memberBirthDate: '1985-03-07',
      legacyBirthDate: '1985-07-03',
    });
    svc.claimLegacyAccount(memberId, legacyId);
    // A day/month transposition is not tolerated as a benign typo, and it is not
    // graded apart from any other non-match either: it simply fails to
    // corroborate, and failing to corroborate costs the member nothing.
    expect(claimAuditMetadata(memberId).dob_comparison).toBe('mismatch');
    expect(queueItemsFor(memberId)).toHaveLength(0);
    const legacy = db.prepare('SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?')
      .get(legacyId) as { claimed_by_member_id: string | null };
    expect(legacy.claimed_by_member_id).toBe(memberId);
  });

  it('a hard mismatch records mismatch, raises nothing, and never blocks the claim', () => {
    const { memberId, legacyId } = claimFixture({
      memberBirthDate: '1985-07-10',
      legacyBirthDate: '1962-01-28',
    });
    svc.claimLegacyAccount(memberId, legacyId);
    expect(claimAuditMetadata(memberId).dob_comparison).toBe('mismatch');
    expect(queueItemsFor(memberId)).toHaveLength(0);
    // The claim itself went through: the legacy row is marked claimed.
    const legacy = db.prepare('SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?')
      .get(legacyId) as { claimed_by_member_id: string | null };
    expect(legacy.claimed_by_member_id).toBe(memberId);
    // The member's own entered date is preserved, not overwritten by the legacy value.
    expect(memberBirthDate(memberId)).toBe('1985-07-10');
  });

  it('the conflicting dates never reach the append-only ledger, only the outcome', () => {
    const { memberId, legacyId } = claimFixture({
      memberBirthDate: '1985-07-10',
      legacyBirthDate: '1962-01-28',
    });
    svc.claimLegacyAccount(memberId, legacyId);
    // The ledger is exempt from the erasure purge, so a date of birth written
    // into it would survive an account erasure. The outcome carries the meaning;
    // the values themselves stay on the purgeable member row.
    const raw = db.prepare(
      "SELECT metadata_json FROM audit_entries WHERE action_type = 'claim.legacy_account' AND actor_member_id = ?",
    ).get(memberId) as { metadata_json: string };
    expect(raw.metadata_json).toContain('mismatch');
    expect(raw.metadata_json).not.toContain('1985-07-10');
    expect(raw.metadata_json).not.toContain('1962-01-28');
  });

  it('records which side was absent, and the legacy value still fills an absent member date', () => {
    const { memberId, legacyId } = claimFixture({
      memberBirthDate: null,
      legacyBirthDate: '1985-07-10',
    });
    svc.claimLegacyAccount(memberId, legacyId);
    expect(claimAuditMetadata(memberId).dob_comparison).toBe('member_dob_absent');
    expect(queueItemsFor(memberId)).toHaveLength(0);
    expect(memberBirthDate(memberId)).toBe('1985-07-10');
  });

  it('records legacy_dob_absent when only the member has a date', () => {
    const { memberId, legacyId } = claimFixture({
      memberBirthDate: '1985-07-10',
      legacyBirthDate: null,
    });
    svc.claimLegacyAccount(memberId, legacyId);
    expect(claimAuditMetadata(memberId).dob_comparison).toBe('legacy_dob_absent');
    expect(queueItemsFor(memberId)).toHaveLength(0);
  });
});

describe('historical-record claim records the comparison and raises nothing', () => {
  function hpClaimMetadata(memberId: string): Record<string, unknown> {
    const row = db.prepare(
      "SELECT metadata_json FROM audit_entries WHERE action_type = 'claim.historical_person' AND actor_member_id = ? ORDER BY created_at DESC LIMIT 1",
    ).get(memberId) as { metadata_json: string } | undefined;
    expect(row, 'claim.historical_person audit row').toBeTruthy();
    return JSON.parse(row!.metadata_json);
  }

  function memberHistoricalPersonId(memberId: string): string | null {
    return (db.prepare('SELECT historical_person_id FROM members WHERE id = ?')
      .get(memberId) as { historical_person_id: string | null }).historical_person_id;
  }

  it('a mismatch through the transitive legacy account records mismatch, raises nothing, and never blocks the claim', () => {
    const { memberId, hpId } = claimFixture({
      memberBirthDate: '1985-07-10',
      legacyBirthDate: '1962-01-28',
    });
    svc.claimHistoricalPerson(memberId, hpId);
    expect(hpClaimMetadata(memberId).dob_comparison).toBe('mismatch');
    // The direct historical-person path behaves the same as the legacy-account
    // path: the outcome is recorded and nothing is routed to anyone.
    expect(queueItemsFor(memberId)).toHaveLength(0);
    // The claim still went through: the member is linked to the historical person.
    expect(memberHistoricalPersonId(memberId)).toBe(hpId);
  });

  it('a typo-shaped date through the transitive legacy account is a plain mismatch too', () => {
    const { memberId, hpId } = claimFixture({
      memberBirthDate: '1985-03-07',
      legacyBirthDate: '1985-07-03',
    });
    svc.claimHistoricalPerson(memberId, hpId);
    expect(hpClaimMetadata(memberId).dob_comparison).toBe('mismatch');
    expect(queueItemsFor(memberId)).toHaveLength(0);
    expect(memberHistoricalPersonId(memberId)).toBe(hpId);
  });

  it('an identical date through the transitive legacy account records identical and raises no queue item', () => {
    const { memberId, hpId } = claimFixture({
      memberBirthDate: '1985-07-10',
      legacyBirthDate: '1985-07-10',
    });
    svc.claimHistoricalPerson(memberId, hpId);
    expect(hpClaimMetadata(memberId).dob_comparison).toBe('identical');
    expect(queueItemsFor(memberId)).toHaveLength(0);
  });
});

describe('a corroborating date strengthens a name-variant match', () => {
  function variantFixture(memberDob: string | null, recordDob: string | null): string {
    const stamp = nextId('variant');
    const email = `${stamp}@example.com`;
    // The two names fold to the same normalized form but are not identical, so
    // this is a variant match rather than an exact one.
    const memberId = insertMember(db, { onboarding: 'none',
      id: `${stamp}_member`, slug: `slug_${stamp}`, login_email: email,
      real_name: `Rene Varianto${stamp}`, display_name: `Rene Varianto${stamp}`,
    });
    if (memberDob) {
      db.prepare('UPDATE members SET birth_date = ? WHERE id = ?').run(memberDob, memberId);
    }
    insertHistoricalPerson(db, {
      person_id: `${stamp}_hp`,
      person_name: `René Varianto${stamp}`,
      legacy_member_id: `${stamp}_leg`,
    });
    insertNameVariant(db, {
      canonical_normalized: `rené varianto${stamp}`.toLowerCase(),
      variant_normalized:   `rene varianto${stamp}`.toLowerCase(),
    });
    db.prepare('UPDATE legacy_members SET legacy_email = ?, real_name = ? WHERE legacy_member_id = ?')
      .run(email, `René Varianto${stamp}`, `${stamp}_leg`);
    if (recordDob) {
      db.prepare('UPDATE legacy_members SET birth_date = ? WHERE legacy_member_id = ?')
        .run(recordDob, `${stamp}_leg`);
    }
    return memberId;
  }

  it('lifts a variant match to high when the date agrees', () => {
    // The date is the strongest signal the platform holds and the governance
    // document says it corroborates a claim, not merely that it separates tied
    // ones. Leaving a variant match weak while the best evidence available says
    // it is right was the gap.
    const memberId = variantFixture('1977-02-02', '1977-02-02');
    const c = svc.getAutoLinkClassificationForMember(memberId);
    expect(c.confidence).toBe('high');
    // Raising the confidence must not lose how the match was found.
    expect(c.confidence === 'high' && c.matchedVariantNormalized).toBeTruthy();
  });

  it('leaves a variant match where the name put it when the date does not agree', () => {
    // Never downward. A date that disagrees fails to corroborate and does
    // nothing else; it must not cost the member the confidence the name earned.
    const mismatched = svc.getAutoLinkClassificationForMember(variantFixture('1977-02-02', '1961-09-09'));
    expect(mismatched.confidence).toBe('medium');
    const recordSilent = svc.getAutoLinkClassificationForMember(variantFixture('1977-02-02', null));
    expect(recordSilent.confidence).toBe('medium');
    const memberSilent = svc.getAutoLinkClassificationForMember(variantFixture(null, '1977-02-02'));
    expect(memberSilent.confidence).toBe('medium');
  });
});

describe('birth-date disambiguation among tied same-name candidates', () => {
  function tiedFixture(memberDob: string | null, legacyDob: string): string {
    const stamp = nextId('tied');
    const name = `Pat ${stamp}`;
    const email = `${stamp}@example.com`;
    const memberId = insertMember(db, { onboarding: 'none',
      id: `${stamp}_member`,
      slug: `slug_${stamp}`,
      login_email: email,
      real_name: name,
    });
    if (memberDob) {
      db.prepare('UPDATE members SET birth_date = ? WHERE id = ?').run(memberDob, memberId);
    }
    // The email-matched legacy account, back-linked to its historical person.
    insertHistoricalPerson(db, {
      person_id: `${stamp}_hp_a`,
      person_name: name,
      legacy_member_id: `${stamp}_leg_a`,
    });
    db.prepare('UPDATE legacy_members SET legacy_email = ?, birth_date = ? WHERE legacy_member_id = ?')
      .run(email, legacyDob, `${stamp}_leg_a`);
    // A second, unrelated historical person with the identical name ties the match.
    insertHistoricalPerson(db, {
      person_id: `${stamp}_hp_b`,
      person_name: name,
      legacy_member_id: `${stamp}_leg_b`,
    });
    return memberId;
  }

  it('no birth date on file: tied candidates stay low confidence', () => {
    const memberId = tiedFixture(null, '1985-07-10');
    const c = svc.getAutoLinkClassificationForMember(memberId);
    expect(c.confidence).toBe('low');
  });

  it('identical birth date narrows the tie at high confidence', () => {
    const memberId = tiedFixture('1985-07-10', '1985-07-10');
    const c = svc.getAutoLinkClassificationForMember(memberId);
    expect(c.confidence).toBe('high');
  });

  it('a date one day out does not narrow the tie', () => {
    const memberId = tiedFixture('1985-07-09', '1985-07-10');
    const c = svc.getAutoLinkClassificationForMember(memberId);
    // Only an identical date corroborates a tied same-name candidate. Nearness
    // buys nothing: a date one day out is treated exactly like an unrelated one,
    // so the tie stays low and the member is never auto-sent to a candidate the
    // date argues against.
    expect(c.confidence).toBe('low');
  });

  it('a hard mismatch does not narrow the tie', () => {
    const memberId = tiedFixture('1962-01-28', '1985-07-10');
    const c = svc.getAutoLinkClassificationForMember(memberId);
    expect(c.confidence).toBe('low');
  });

  it('narrows to the candidate whose own date agrees, not the one provenance points at', () => {
    // Comparing the member's date against the single account they were found
    // through says the same thing about every tied candidate, so it cannot tell
    // them apart. Only each candidate's own date can. Here the found-through
    // account carries a different date, and the tie is settled by the other
    // candidate's date agreeing.
    const stamp = nextId('percand');
    const name = `Percand ${stamp}`;
    const email = `${stamp}@example.com`;
    const memberId = insertMember(db, { onboarding: 'none',
      id: `${stamp}_member`, slug: `slug_${stamp}`, login_email: email, real_name: name,
    });
    db.prepare('UPDATE members SET birth_date = ? WHERE id = ?').run('1979-03-04', memberId);

    insertHistoricalPerson(db, {
      person_id: `${stamp}_hp_a`, person_name: name, legacy_member_id: `${stamp}_leg_a`,
    });
    db.prepare('UPDATE legacy_members SET legacy_email = ?, birth_date = ? WHERE legacy_member_id = ?')
      .run(email, '1990-11-11', `${stamp}_leg_a`);

    insertHistoricalPerson(db, {
      person_id: `${stamp}_hp_b`, person_name: name, legacy_member_id: `${stamp}_leg_b`,
    });
    db.prepare('UPDATE legacy_members SET birth_date = ? WHERE legacy_member_id = ?')
      .run('1979-03-04', `${stamp}_leg_b`);

    const c = svc.getAutoLinkClassificationForMember(memberId);
    expect(c.confidence).toBe('high');
    expect(c.confidence === 'high' && c.personId).toBe(`${stamp}_hp_b`);
  });

  it('leaves the tie alone when two candidates carry the same date', () => {
    // Two agreeing is no narrower than none, and picking one would be a guess.
    const stamp = nextId('twoagree');
    const name = `Twoagree ${stamp}`;
    const email = `${stamp}@example.com`;
    const memberId = insertMember(db, { onboarding: 'none',
      id: `${stamp}_member`, slug: `slug_${stamp}`, login_email: email, real_name: name,
    });
    db.prepare('UPDATE members SET birth_date = ? WHERE id = ?').run('1981-05-05', memberId);

    insertHistoricalPerson(db, {
      person_id: `${stamp}_hp_a`, person_name: name, legacy_member_id: `${stamp}_leg_a`,
    });
    db.prepare('UPDATE legacy_members SET legacy_email = ?, birth_date = ? WHERE legacy_member_id = ?')
      .run(email, '1981-05-05', `${stamp}_leg_a`);
    insertHistoricalPerson(db, {
      person_id: `${stamp}_hp_b`, person_name: name, legacy_member_id: `${stamp}_leg_b`,
    });
    db.prepare('UPDATE legacy_members SET birth_date = ? WHERE legacy_member_id = ?')
      .run('1981-05-05', `${stamp}_leg_b`);

    // The older provenance test still settles it, because the found-through
    // account's date agrees; what must not happen is picking between the two on
    // the strength of a date they both carry.
    const c = svc.getAutoLinkClassificationForMember(memberId);
    expect(c.confidence === 'high' && c.personId).toBe(`${stamp}_hp_a`);
  });

  it('a tie the date cannot narrow still leaves the member a self-serve path', async () => {
    // Failing to narrow must not strand anyone: the email-anchored legacy card
    // is composed independently of the classifier, so a member whose date does
    // not corroborate still has a card to act on and never waits on an
    // administrator. Losing that is what would make a non-matching date costly.
    const memberId = tiedFixture('1962-01-28', '1985-07-10');
    const view = await svc.getLinkHistoryViewForWizard(memberId, {
      submitted: false, hpPersonId: null, autoLinkDrift: false,
    });
    expect(view).toBeTruthy();
    expect(view!.candidates.some((c) => c.claimMode === 'legacy_claim')).toBe(true);
  });
});

describe('a conflicting date reaches no administrator surface at all', () => {
  it('the work queue is untouched by a claim whose dates conflict, and no member email goes out', async () => {
    const outboxBefore = (db.prepare('SELECT COUNT(*) AS c FROM outbox_emails')
      .get() as { c: number }).c;
    const { memberId, legacyId } = claimFixture({
      memberBirthDate: '1985-07-10',
      legacyBirthDate: '1962-01-28',
    });
    svc.claimLegacyAccount(memberId, legacyId);

    // Nothing queued, so nothing for a volunteer administrator to read and
    // clear. The dates do not reach the page either, by way of having no row to
    // render them on.
    expect(queueItemsFor(memberId)).toHaveLength(0);
    const page = await request(createApp())
      .get('/admin/work-queue')
      .set('Cookie', adminCookie());
    expect(page.status).toBe(200);
    expect(page.text).not.toContain('1962-01-28');
    expect(page.text).not.toContain(`/members/slug_${memberId}`);
    expect((db.prepare('SELECT COUNT(*) AS c FROM outbox_emails')
      .get() as { c: number }).c).toBe(outboxBefore);
  });
});

describe('a conflicting date never alters the member-facing response', () => {
  function completedClaim(opts: { memberBirthDate: string; legacyBirthDate: string }): string {
    const { memberId, legacyId } = claimFixture(opts);
    // The claimant has finished personal details, so the legacy-claim surface is
    // reachable (the prerequisite gate does not redirect it away).
    insertOnboardingTask(db, memberId, 'personal_details', 'completed');
    svc.claimLegacyAccount(memberId, legacyId);
    return memberId;
  }

  it('a matching and a conflicting claim yield the identical member-facing response, and the conflict never leaks to the member', async () => {
    const cleanMember = completedClaim({ memberBirthDate: '1985-07-10', legacyBirthDate: '1985-07-10' });
    const conflictedMember = completedClaim({ memberBirthDate: '1985-07-10', legacyBirthDate: '1962-01-28' });

    // Neither claimant differs on the administrator side either: the conflict
    // is recorded in the ledger and nowhere else.
    expect(queueItemsFor(cleanMember)).toHaveLength(0);
    expect(queueItemsFor(conflictedMember)).toHaveLength(0);

    const cleanRes = await request(createApp())
      .get('/register/wizard/legacy_claim').set('Cookie', cookieFor(cleanMember));
    const conflictedRes = await request(createApp())
      .get('/register/wizard/legacy_claim').set('Cookie', cookieFor(conflictedMember));

    // Date of birth never alters the anti-enumeration response: the member-facing
    // result does not diverge on the conflict (same status, same redirect target),
    // and the conflicting legacy date and the admin review label never appear on
    // the member's own surface.
    expect(conflictedRes.status).toBe(cleanRes.status);
    expect(conflictedRes.headers.location).toBe(cleanRes.headers.location);
    expect(conflictedRes.text).not.toContain('1962-01-28');
    expect(conflictedRes.text).not.toContain('Birth-date conflict');
  });
});
