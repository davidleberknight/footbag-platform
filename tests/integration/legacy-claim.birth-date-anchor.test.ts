/**
 * Birth-date evidence on the legacy-claim surface.
 *
 * The wizard claim task accepts the member's date of birth as a declared
 * anchor: it fills members.birth_date only when absent (personal details owns
 * later edits), re-runs candidate matching on the next render, and shows a
 * state-independent notice. Every legacy claim records the member-versus-
 * legacy birth-date comparison outcome in its audit metadata (identical /
 * near_miss / mismatch, or which side was absent); a hard mismatch raises a
 * claim_dob_mismatch_review work-queue item for admin review; the comparison
 * never blocks a claim. Among tied same-name candidates, an identical date
 * narrows at high confidence, a typo-shaped near-miss only at medium.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertHistoricalPerson,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3247');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/identityAccessService').identityAccessService;

beforeAll(async () => {
  db = createTestDb(dbPath);
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

function memberBirthDate(memberId: string): string | null {
  return (db.prepare('SELECT birth_date FROM members WHERE id = ?').get(memberId) as
    { birth_date: string | null }).birth_date;
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

describe('POST /register/wizard/legacy_claim/anchors/birth-date', () => {
  it('stores a valid date, redirects with the state-independent saved notice', async () => {
    const memberId = insertMember(db, {
      slug: `slug_${nextId('route')}`,
      login_email: `${nextId('route')}@example.com`,
      real_name: 'Anchor Route',
    });
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/anchors/birth-date')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ anchorValue: '1984-11-13' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/legacy_claim?anchor=saved');
    expect(memberBirthDate(memberId)).toBe('1984-11-13');
  });

  it('rejects an invalid date with a 422 re-render and stores nothing', async () => {
    const memberId = insertMember(db, {
      slug: `slug_${nextId('route')}`,
      login_email: `${nextId('route')}@example.com`,
      real_name: 'Anchor Invalid',
    });
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/anchors/birth-date')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ anchorValue: '1984-02-30' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('not a valid calendar date');
    expect(memberBirthDate(memberId)).toBeNull();
  });

  it('never overwrites a birth date already on file', async () => {
    const memberId = insertMember(db, {
      slug: `slug_${nextId('route')}`,
      login_email: `${nextId('route')}@example.com`,
      real_name: 'Anchor Refill',
    });
    db.prepare('UPDATE members SET birth_date = ? WHERE id = ?').run('1970-05-05', memberId);
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/anchors/birth-date')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ anchorValue: '1984-11-13' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('already on file');
    expect(memberBirthDate(memberId)).toBe('1970-05-05');
  });

  it('requires authentication', async () => {
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/anchors/birth-date')
      .type('form')
      .send({ anchorValue: '1984-11-13' });
    expect([302, 303]).toContain(res.status);
  });
});

describe('birth-date requirement on the claim task', () => {
  it('shows the required entry form while absent, then the read-only line once on file', async () => {
    const memberId = insertMember(db, {
      slug: `slug_${nextId('vis')}`,
      login_email: `${nextId('vis')}@example.com`,
      real_name: 'Anchor Visible',
    });
    const before = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(before.status).toBe(200);
    expect(before.text).toContain('/register/wizard/legacy_claim/anchors/birth-date');
    expect(before.text).not.toContain('Date of birth on file:');

    db.prepare('UPDATE members SET birth_date = ? WHERE id = ?').run('1984-11-13', memberId);
    const after = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(after.status).toBe(200);
    expect(after.text).not.toContain('/register/wizard/legacy_claim/anchors/birth-date');
    expect(after.text).toContain('Date of birth on file: 1984-11-13');
  });

  it('blocks the manual search until a birth date is on file', async () => {
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
    expect(res.status).toBe(422);
    expect(res.text).toContain('Enter your date of birth first');
  });

  it('blocks the continue-without-linking decision until a birth date is on file', async () => {
    const memberId = insertMember(db, {
      slug: `slug_${nextId('gate')}`,
      login_email: `${nextId('gate')}@example.com`,
      real_name: 'Gate Skip',
    });
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/skip')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});
    expect(res.status).toBe(422);
    expect(res.text).toContain('Enter your date of birth first');

    db.prepare('UPDATE members SET birth_date = ? WHERE id = ?').run('1984-11-13', memberId);
    const ok = await request(createApp())
      .post('/register/wizard/legacy_claim/skip')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});
    expect(ok.status).toBe(303);
  });

  it('blocks a suggested-match confirmation until a birth date is on file', async () => {
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
    expect(res.status).toBe(422);
    expect(res.text).toContain('Enter your date of birth first');
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

  it('a typo-shaped near-miss records near_miss and raises no queue item', () => {
    const { memberId, legacyId } = claimFixture({
      memberBirthDate: '1985-03-07',
      legacyBirthDate: '1985-07-03',
    });
    svc.claimLegacyAccount(memberId, legacyId);
    expect(claimAuditMetadata(memberId).dob_comparison).toBe('near_miss');
    expect(mismatchQueueItems(memberId)).toHaveLength(0);
  });

  it('a hard mismatch records mismatch, raises the admin queue item, and never blocks the claim', () => {
    const { memberId, legacyId } = claimFixture({
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

  it('a near-miss birth date narrows the tie only at medium confidence', () => {
    const memberId = tiedFixture('1985-07-09', '1985-07-10');
    const c = svc.getAutoLinkClassificationForMember(memberId);
    expect(c.confidence).toBe('medium');
  });

  it('a hard mismatch does not narrow the tie', () => {
    const memberId = tiedFixture('1962-01-28', '1985-07-10');
    const c = svc.getAutoLinkClassificationForMember(memberId);
    expect(c.confidence).toBe('low');
  });
});
