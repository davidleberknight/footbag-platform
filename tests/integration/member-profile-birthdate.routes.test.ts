/**
 * A member owns their own date of birth.
 *
 * The date is what matches a member to their legacy account and their
 * competition records, so a member who registered with a wrong one has to be
 * able to correct it themselves. These tests pin that the edit surface is
 * owner-only, that the three entered parts become the stored date, that a
 * rejection names the part at fault and hands back what was typed, and that
 * correcting the date is an ordinary profile edit that raises nothing for an
 * administrator to clear.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertLegacyMember,
  insertWorkQueueItem,
  createTestSessionJwt,
} from '../fixtures/factories';
import { expectCsrfReject } from '../fixtures/expectCsrfReject';

const { dbPath } = setTestEnv('3163');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID    = 'dob-owner-001';
const MEMBER_SLUG  = 'dob_owner';
const OTHER_ID     = 'dob-other-001';
const OTHER_SLUG   = 'dob_other';
const LEGACY_ID    = 'legacy-dob-001';

function ownCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}
function otherCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: OTHER_ID })}`;
}

function openDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

function storedBirthDate(): string | null {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT birth_date FROM members WHERE id = ?')
    .get(MEMBER_ID) as { birth_date: string | null };
  db.close();
  return row.birth_date;
}

/** The edit form carries every mandatory field; a case overrides what it tests. */
function postEdit(fields: Record<string, string>): request.Test {
  return request(createApp())
    .post(`/members/${MEMBER_SLUG}/edit`)
    .set('Cookie', ownCookie())
    .type('form')
    .send({
      city: 'Portland', region: 'OR', country: 'USA',
      birthDay: '14', birthMonth: '3', birthYear: '1978',
      ...fields,
    });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: MEMBER_ID, slug: MEMBER_SLUG,
    display_name: 'Dob Owner', login_email: 'dobowner@example.com',
    city: 'Portland', region: 'OR', country: 'USA',
    birth_date: '1978-03-14',
  });
  insertMember(db, {
    id: OTHER_ID, slug: OTHER_SLUG,
    display_name: 'Dob Other', login_email: 'dobother@example.com',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  const db = openDb();
  db.prepare('UPDATE members SET birth_date = ? WHERE id = ?').run('1978-03-14', MEMBER_ID);
  db.prepare('DELETE FROM work_queue_items').run();
  db.close();
});

describe('GET /members/:slug/edit renders the date as three parts', () => {
  it('shows the stored date in its parts, with the month preselected', async () => {
    const res = await request(createApp())
      .get(`/members/${MEMBER_SLUG}/edit`)
      .set('Cookie', ownCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="birthDay"');
    expect(res.text).toContain('name="birthMonth"');
    expect(res.text).toContain('name="birthYear"');
    expect(res.text).toContain('value="14"');
    expect(res.text).toContain('value="1978"');
    expect(res.text).toContain('<option value="3" selected>March</option>');
  });

  it('offers all twelve months by name', async () => {
    const res = await request(createApp())
      .get(`/members/${MEMBER_SLUG}/edit`)
      .set('Cookie', ownCookie());
    ['January', 'June', 'December'].forEach((m) => expect(res.text).toContain(`>${m}<`));
  });

  it('is not reachable by another member, and does not reveal the slug exists', async () => {
    const res = await request(createApp())
      .get(`/members/${MEMBER_SLUG}/edit`)
      .set('Cookie', otherCookie());
    expect(res.status).toBe(404);
  });

  it('redirects an unauthenticated visitor to sign in', async () => {
    const res = await request(createApp()).get(`/members/${MEMBER_SLUG}/edit`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });
});

describe('POST /members/:slug/edit stores the entered date', () => {
  it('assembles the three parts into the stored date', async () => {
    const res = await postEdit({ birthDay: '9', birthMonth: '12', birthYear: '1974' });
    expect(res.status).toBe(303);
    expect(storedBirthDate()).toBe('1974-12-09');
  });

  it('accepts a day typed without a leading zero', async () => {
    await postEdit({ birthDay: '5', birthMonth: '1', birthYear: '1990' });
    expect(storedBirthDate()).toBe('1990-01-05');
  });

  it('accepts a leap day in a leap year', async () => {
    await postEdit({ birthDay: '29', birthMonth: '2', birthYear: '2000' });
    expect(storedBirthDate()).toBe('2000-02-29');
  });

  it('records the change in the audit trail without recording the date', async () => {
    await postEdit({ birthDay: '9', birthMonth: '12', birthYear: '1974' });
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      `SELECT metadata_json FROM audit_entries
       WHERE action_type = 'member.profile_updated' AND entity_id = ?
       ORDER BY occurred_at DESC LIMIT 1`,
    ).get(MEMBER_ID) as { metadata_json: string } | undefined;
    db.close();
    expect(row).toBeDefined();
    expect(row!.metadata_json).toContain('birthDate');
    // The ledger is exempt from the erasure purge, so the value itself must
    // never reach it; only the fact that the field changed.
    expect(row!.metadata_json).not.toContain('1974-12-09');
  });

  it('rejects a state-changing post with no CSRF protection', async () => {
    await expectCsrfReject(createApp(), 'post', `/members/${MEMBER_SLUG}/edit`, {
      cookie: ownCookie(),
      body: {
        city: 'Portland', region: 'OR', country: 'USA',
        birthDay: '9', birthMonth: '12', birthYear: '1974',
      },
    });
    expect(storedBirthDate()).toBe('1978-03-14');
  });

  it('cannot be posted against another member', async () => {
    const res = await request(createApp())
      .post(`/members/${MEMBER_SLUG}/edit`)
      .set('Cookie', otherCookie())
      .type('form')
      .send({ city: 'Portland', region: 'OR', country: 'USA', birthDay: '1', birthMonth: '1', birthYear: '1990' });
    expect(res.status).toBe(404);
    expect(storedBirthDate()).toBe('1978-03-14');
  });

  it('ignores privileged columns smuggled into the form body', async () => {
    const res = await postEdit({ is_admin: '1', slug: 'stolen_slug', id: 'other-id' });
    expect(res.status).toBe(303);
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare('SELECT is_admin, slug FROM members WHERE id = ?')
      .get(MEMBER_ID) as { is_admin: number; slug: string };
    const conjured = db.prepare('SELECT id FROM members WHERE slug = ?').get('stolen_slug');
    db.close();
    expect(row.is_admin).toBe(0);
    expect(row.slug).toBe(MEMBER_SLUG);
    expect(conjured).toBeUndefined();
  });
});

describe('POST /members/:slug/edit rejects a date it cannot accept', () => {
  it('names the missing part rather than calling the date invalid', async () => {
    const res = await postEdit({ birthMonth: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('include a month');
    expect(storedBirthDate()).toBe('1978-03-14');
  });

  it('names the day when the day is out of range', async () => {
    const res = await postEdit({ birthDay: '32' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Day of birth');
  });

  it('requires a four-digit year', async () => {
    const res = await postEdit({ birthYear: '78' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('four digits');
  });

  it('rejects a day that does not exist in that month, and stores nothing', async () => {
    const res = await postEdit({ birthDay: '30', birthMonth: '2', birthYear: '2023' });
    expect(res.status).toBe(422);
    expect(storedBirthDate()).toBe('1978-03-14');
  });

  it('rejects a date in the future and one before 1900', async () => {
    expect((await postEdit({ birthYear: '2999' })).status).toBe(422);
    expect((await postEdit({ birthYear: '1899' })).status).toBe(422);
    expect(storedBirthDate()).toBe('1978-03-14');
  });

  it('hands back the parts the member typed so they correct one box', async () => {
    const res = await postEdit({ birthDay: '32', birthMonth: '7', birthYear: '1981' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('value="32"');
    expect(res.text).toContain('value="1981"');
    expect(res.text).toContain('<option value="7" selected>July</option>');
  });

  it('refuses a submission that blanks the whole date', async () => {
    const res = await postEdit({ birthDay: '', birthMonth: '', birthYear: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Enter your date of birth');
    expect(storedBirthDate()).toBe('1978-03-14');
  });

  it('rejects parts that are not digits', async () => {
    expect((await postEdit({ birthDay: 'ten' })).status).toBe(422);
    expect((await postEdit({ birthYear: '19x8' })).status).toBe(422);
    expect(storedBirthDate()).toBe('1978-03-14');
  });
});

describe('correcting the date is the member’s own business and reaches no administrator', () => {
  function seedClaimedLegacy(legacyBirthDate: string | null): void {
    const db = openDb();
    insertLegacyMember(db, {
      legacy_member_id: LEGACY_ID,
      claimed_by_member_id: MEMBER_ID,
      claimed_at: '2026-01-01T00:00:00.000Z',
      birth_date: legacyBirthDate,
    });
    db.close();
  }

  function queueItemCount(): number {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      'SELECT COUNT(*) AS c FROM work_queue_items WHERE entity_type = ? AND entity_id = ?',
    ).get('member', MEMBER_ID) as { c: number };
    db.close();
    return row.c;
  }

  // The member owns this field, so fixing it is a plain profile edit. A date
  // that ends up disagreeing with the record they claimed raises nothing:
  // nobody is required to act on it, so queueing it would only cost a volunteer
  // administrator the work of clearing a row that changes nothing.
  it('a correction that still disagrees with the claimed record queues nothing', async () => {
    seedClaimedLegacy('1974-12-09');
    const res = await postEdit({ birthDay: '1', birthMonth: '1', birthYear: '1990' });
    expect(res.status).toBe(303);
    expect(storedBirthDate()).toBe('1990-01-01');
    expect(queueItemCount()).toBe(0);
  });

  it('a correction that brings the two into agreement queues nothing either', async () => {
    seedClaimedLegacy('1974-12-09');
    await postEdit({ birthDay: '9', birthMonth: '12', birthYear: '1974' });
    expect(storedBirthDate()).toBe('1974-12-09');
    expect(queueItemCount()).toBe(0);
  });

  it('a correction by a member holding no claimed record is an ordinary save', async () => {
    const res = await postEdit({ birthDay: '9', birthMonth: '12', birthYear: '1974' });
    expect(res.status).toBe(303);
    expect(storedBirthDate()).toBe('1974-12-09');
    expect(queueItemCount()).toBe(0);
  });
});
