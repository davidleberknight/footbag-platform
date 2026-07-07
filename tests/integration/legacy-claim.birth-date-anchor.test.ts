/**
 * Date-of-birth handling on the legacy-claim flow.
 *
 * Date of birth is collected once, in the personal_details step, which is a
 * prerequisite for the legacy-claim step: none of the legacy-claim resolving
 * actions run until personal_details is completed, and reaching the step early
 * routes the member back to personal_details.
 *
 * Every legacy claim records the member-versus-record birth-date comparison
 * outcome in its audit metadata (identical / near_miss / mismatch, or which side
 * was absent). Any discrepancy between two present dates, a typo-shaped near-miss
 * as much as a hard mismatch, raises a claim_dob_mismatch_review work-queue item
 * for admin review, on both the legacy-account claim path and the direct
 * historical-person claim path; the comparison never blocks a claim. Among tied
 * same-name candidates, only an identical date narrows the match; a near-miss does
 * not. An admin closes the review item with a dismissal that resolves the row and
 * records an audit entry, sending no member email.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertHistoricalPerson,
  insertOnboardingTask,
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
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
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

function mismatchQueueItems(memberId: string): Array<Record<string, unknown>> {
  return db.prepare(
    "SELECT * FROM work_queue_items WHERE task_type = 'claim_dob_mismatch_review' AND entity_id = ?",
  ).all(memberId) as Array<Record<string, unknown>>;
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
  insertMember(db, {
    id: memberId,
    slug: `slug_${memberId}`,
    login_email: email,
    real_name: opts.realName ?? `Casey ${memberId}`,
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
    const memberId = insertMember(db, {
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
      .send({ city: 'Portland', country: 'US', birthDate: '1984-11-13' });
    expect(submit.status).toBe(303);

    const after = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(after.status).toBe(200);
    expect(after.text).toContain('action="/register/wizard/legacy_claim/find"');
    expect(memberBirthDate(memberId)).toBe('1984-11-13');
  });

  it('a manual search does not run until personal_details is completed', async () => {
    const memberId = insertMember(db, {
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
    const memberId = insertMember(db, {
      slug: `slug_${nextId('gate')}`,
      login_email: `${nextId('gate')}@example.com`,
      real_name: 'Gate Skip',
    });
    // Even with the never-had-an-account attestation, the decision does not
    // resolve while personal details are still outstanding.
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/skip')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ no_old_account: '1' });
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
    const memberId = insertMember(db, {
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
    expect(mismatchQueueItems(memberId)).toHaveLength(0);
  });

  it('a typo-shaped near-miss records near_miss, raises the admin queue item, and never blocks the claim', () => {
    const { memberId, legacyId } = claimFixture({
      memberBirthDate: '1985-03-07',
      legacyBirthDate: '1985-07-03',
    });
    svc.claimLegacyAccount(memberId, legacyId);
    expect(claimAuditMetadata(memberId).dob_comparison).toBe('near_miss');
    // A near-miss is treated as a discrepancy: it flags for review just like a
    // hard mismatch, and both conflicting dates land in the admin-only detail.
    const items = mismatchQueueItems(memberId);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('open');
    expect(String(items[0].detail_text)).toContain('1985-03-07');
    expect(String(items[0].detail_text)).toContain('1985-07-03');
    // The claim still went through; the discrepancy never blocks it.
    const legacy = db.prepare('SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?')
      .get(legacyId) as { claimed_by_member_id: string | null };
    expect(legacy.claimed_by_member_id).toBe(memberId);
  });

  it('a hard mismatch records mismatch, raises the admin queue item, and never blocks the claim', () => {
    const { memberId, legacyId, hpId } = claimFixture({
      memberBirthDate: '1985-07-10',
      legacyBirthDate: '1962-01-28',
    });
    svc.claimLegacyAccount(memberId, legacyId);
    expect(claimAuditMetadata(memberId).dob_comparison).toBe('mismatch');
    const items = mismatchQueueItems(memberId);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe('open');
    expect(items[0].queue_category).toBe('membership');
    expect(String(items[0].detail_text)).toContain('1985-07-10');
    expect(String(items[0].detail_text)).toContain('1962-01-28');
    // Enriched so an admin can adjudicate without hunting: a member profile
    // pointer and the linked historical record.
    expect(String(items[0].detail_text)).toContain(`/members/slug_${memberId}`);
    expect(String(items[0].detail_text)).toContain(hpId);
    // The claim itself went through: the legacy row is marked claimed.
    const legacy = db.prepare('SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?')
      .get(legacyId) as { claimed_by_member_id: string | null };
    expect(legacy.claimed_by_member_id).toBe(memberId);
    // The member's own entered date is preserved, not overwritten by the legacy value.
    expect(memberBirthDate(memberId)).toBe('1985-07-10');
  });

  it('records which side was absent, and the legacy value still fills an absent member date', () => {
    const { memberId, legacyId } = claimFixture({
      memberBirthDate: null,
      legacyBirthDate: '1985-07-10',
    });
    svc.claimLegacyAccount(memberId, legacyId);
    expect(claimAuditMetadata(memberId).dob_comparison).toBe('member_dob_absent');
    expect(mismatchQueueItems(memberId)).toHaveLength(0);
    expect(memberBirthDate(memberId)).toBe('1985-07-10');
  });

  it('records legacy_dob_absent when only the member has a date', () => {
    const { memberId, legacyId } = claimFixture({
      memberBirthDate: '1985-07-10',
      legacyBirthDate: null,
    });
    svc.claimLegacyAccount(memberId, legacyId);
    expect(claimAuditMetadata(memberId).dob_comparison).toBe('legacy_dob_absent');
    expect(mismatchQueueItems(memberId)).toHaveLength(0);
  });
});

describe('historical-record claim flags a birth-date discrepancy for review', () => {
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

  it('a mismatch through the transitive legacy account records mismatch, raises the queue item, and never blocks the claim', () => {
    const { memberId, hpId } = claimFixture({
      memberBirthDate: '1985-07-10',
      legacyBirthDate: '1962-01-28',
    });
    svc.claimHistoricalPerson(memberId, hpId);
    expect(hpClaimMetadata(memberId).dob_comparison).toBe('mismatch');
    // The direct historical-person path flags the discrepancy for admin review,
    // the same as the legacy-account path, with both dates in the detail.
    const items = mismatchQueueItems(memberId);
    expect(items).toHaveLength(1);
    expect(String(items[0].detail_text)).toContain('1985-07-10');
    expect(String(items[0].detail_text)).toContain('1962-01-28');
    // The claim still went through: the member is linked to the historical person.
    expect(memberHistoricalPersonId(memberId)).toBe(hpId);
  });

  it('a typo-shaped near-miss through the transitive legacy account also raises the queue item', () => {
    const { memberId, hpId } = claimFixture({
      memberBirthDate: '1985-03-07',
      legacyBirthDate: '1985-07-03',
    });
    svc.claimHistoricalPerson(memberId, hpId);
    expect(hpClaimMetadata(memberId).dob_comparison).toBe('near_miss');
    expect(mismatchQueueItems(memberId)).toHaveLength(1);
    expect(memberHistoricalPersonId(memberId)).toBe(hpId);
  });

  it('an identical date through the transitive legacy account records identical and raises no queue item', () => {
    const { memberId, hpId } = claimFixture({
      memberBirthDate: '1985-07-10',
      legacyBirthDate: '1985-07-10',
    });
    svc.claimHistoricalPerson(memberId, hpId);
    expect(hpClaimMetadata(memberId).dob_comparison).toBe('identical');
    expect(mismatchQueueItems(memberId)).toHaveLength(0);
  });
});

describe('birth-date disambiguation among tied same-name candidates', () => {
  function tiedFixture(memberDob: string | null, legacyDob: string): string {
    const stamp = nextId('tied');
    const name = `Pat ${stamp}`;
    const email = `${stamp}@example.com`;
    const memberId = insertMember(db, {
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

  it('a near-miss birth date does not narrow the tie', () => {
    const memberId = tiedFixture('1985-07-09', '1985-07-10');
    const c = svc.getAutoLinkClassificationForMember(memberId);
    // Only an identical date corroborates a tied same-name candidate; a
    // typo-shaped near-miss no longer narrows, so the tie stays low.
    expect(c.confidence).toBe('low');
  });

  it('a hard mismatch does not narrow the tie', () => {
    const memberId = tiedFixture('1962-01-28', '1985-07-10');
    const c = svc.getAutoLinkClassificationForMember(memberId);
    expect(c.confidence).toBe('low');
  });
});

describe('admin review of a birth-date-conflict work-queue item', () => {
  function outboxCount(): number {
    return (db.prepare('SELECT COUNT(*) AS c FROM outbox_emails').get() as { c: number }).c;
  }
  function dobConflictAuditCount(memberId: string): number {
    return (db.prepare(
      "SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'legacy.dob_conflict_reviewed' AND entity_id = ?",
    ).get(memberId) as { c: number }).c;
  }

  it('renders the conflict with both dates and a Mark Reviewed control, then a dismissal resolves it with an audit entry and no member email', async () => {
    const { memberId, legacyId } = claimFixture({
      memberBirthDate: '1985-07-10',
      legacyBirthDate: '1962-01-28',
    });
    svc.claimLegacyAccount(memberId, legacyId);
    const items = mismatchQueueItems(memberId);
    expect(items).toHaveLength(1);
    const queueItemId = String(items[0].id);

    // The admin work-queue page renders the flagged item with both conflicting
    // dates and the Mark Reviewed dismissal control.
    const page = await request(createApp())
      .get('/admin/work-queue')
      .set('Cookie', adminCookie());
    expect(page.status).toBe(200);
    expect(page.text).toContain('1985-07-10');
    expect(page.text).toContain('1962-01-28');
    expect(page.text).toContain(`/members/slug_${memberId}`);
    expect(page.text).toContain('Mark Reviewed');
    expect(page.text).toContain(`/admin/work-queue/${queueItemId}/dismiss`);

    const outboxBefore = outboxCount();
    const dismiss = await request(createApp())
      .post(`/admin/work-queue/${queueItemId}/dismiss`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ note: 'Confirmed the claim looks legitimate.' });
    expect(dismiss.status).toBe(303);

    // The row is closed, not left open.
    const row = db.prepare('SELECT status FROM work_queue_items WHERE id = ?')
      .get(queueItemId) as { status: string };
    expect(row.status).toBe('resolved');
    // The dismissal records its audit entry and sends no member email.
    expect(dobConflictAuditCount(memberId)).toBe(1);
    expect(outboxCount()).toBe(outboxBefore);
  });

  it('a non-admin cannot dismiss a birth-date-conflict item', async () => {
    const { memberId, legacyId } = claimFixture({
      memberBirthDate: '1985-07-10',
      legacyBirthDate: '1962-01-28',
    });
    svc.claimLegacyAccount(memberId, legacyId);
    const queueItemId = String(mismatchQueueItems(memberId)[0].id);

    // A plain member session (no admin role) is refused by the admin gate, and
    // the review item is left open.
    const res = await request(createApp())
      .post(`/admin/work-queue/${queueItemId}/dismiss`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ note: 'not allowed' });
    expect(res.status).toBe(403);
    const row = db.prepare('SELECT status FROM work_queue_items WHERE id = ?')
      .get(queueItemId) as { status: string };
    expect(row.status).toBe('open');
  });
});

describe('a birth-date conflict stays admin-only and never alters the member-facing response', () => {
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

    // The only difference between the two claimants is the admin-side flag.
    expect(mismatchQueueItems(cleanMember)).toHaveLength(0);
    expect(mismatchQueueItems(conflictedMember)).toHaveLength(1);

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
