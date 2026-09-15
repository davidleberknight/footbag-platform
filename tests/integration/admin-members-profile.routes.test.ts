/**
 * Administrator correction of a member's profile details, from the member
 * record.
 *
 * The member's own profile is the ordinary path for these fields; this surface
 * is the backstop for when they cannot use it. So the suite pins that the
 * correction obeys the member's own rules rather than a looser set, that the
 * reason is mandatory, that the audit row records each changed value before and
 * after rather than only which fields moved, and that the member's written
 * biography is unreachable from here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, completeOnboarding, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3439');

const ADMIN_ID = 'pc_admin';
const TARGET_ID = 'pc_target';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

function db<T>(fn: (conn: BetterSqlite3.Database) => T): T {
  const conn = new BetterSqlite3(dbPath);
  try {
    return fn(conn);
  } finally {
    conn.close();
  }
}

function targetRow(): {
  city: string | null; region: string | null; country: string | null;
  bio: string | null; phone: string | null; searchable: number;
} {
  return db((conn) => conn.prepare(
    'SELECT city, region, country, bio, phone, searchable FROM members WHERE id = ?',
  ).get(TARGET_ID)) as {
    city: string | null; region: string | null; country: string | null;
    bio: string | null; phone: string | null; searchable: number;
  };
}

function corrections(): Array<{ reason_text: string; metadata_json: string }> {
  return db((conn) => conn.prepare(
    "SELECT reason_text, metadata_json FROM audit_entries WHERE action_type = 'member.profile_corrected' AND entity_id = ? ORDER BY id",
  ).all(TARGET_ID)) as Array<{ reason_text: string; metadata_json: string }>;
}

/** The whole profile, as the form posts it, with one field overridden. */
function submission(over: Record<string, string> = {}): Record<string, string> {
  return {
    city: 'Wellington',
    region: '',
    country: 'New Zealand',
    phone: '',
    whatsapp: '',
    emailVisibility: 'private',
    phoneVisible: '0',
    whatsappVisible: '0',
    searchable: '1',
    firstCompetitionYear: '',
    birthDay: '4',
    birthMonth: '7',
    birthYear: '1990',
    showCompetitiveResults: '1',
    showFirstCompetitionYear: '0',
    showGender: '0',
    gender: 'undisclosed',
    reason: 'Member reported the wrong city at registration.',
    ...over,
  };
}

beforeAll(async () => {
  const conn = createTestDb(dbPath);
  insertMember(conn, {
    id: ADMIN_ID, slug: 'pc-admin', display_name: 'Ada Admin', real_name: 'Ada Admin',
    login_email: 'pc-admin@example.com', is_admin: 1,
  });
  insertMember(conn, {
    id: TARGET_ID, slug: 'pc-target', display_name: 'Tam Target', real_name: 'Tam Target',
    login_email: 'pc-target@example.com', city: 'Aukland', country: 'New Zealand',
  });
  completeOnboarding(conn, ADMIN_ID);
  completeOnboarding(conn, TARGET_ID);
  // Seeded to match the baseline submission below, so a test that varies one
  // field is varying exactly one field. Without this every submission also
  // carries a first-time birth date and gender, and no case can distinguish a
  // real change from the fixture catching up.
  conn.prepare(
    "UPDATE members SET bio = ?, birth_date = '1990-07-04', gender = 'undisclosed',"
    + " region = NULL, show_first_competition_year = 0 WHERE id = ?",
  ).run('My own words about me.', TARGET_ID);
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the record offers the correction form on the current values', () => {
  it('prefills what the record holds, so an untouched field is not cleared', async () => {
    const res = await request(createApp())
      .get(`/admin/members/${TARGET_ID}`)
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Correct the Profile Details');
    expect(res.text).toContain('value="Aukland"');
    expect(res.text).toContain('value="New Zealand"');
  });

  it('does not offer the biography, which is the member\'s own words', async () => {
    const res = await request(createApp())
      .get(`/admin/members/${TARGET_ID}`)
      .set('Cookie', adminCookie());
    expect(res.text).not.toContain('My own words about me.');
  });
});

describe('the preview writes nothing and reports what would move', () => {
  it('names the changed field with its value before and after', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${TARGET_ID}/profile`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission());

    expect(res.status).toBe(200);
    expect(res.text).toContain('City');
    expect(res.text).toContain('Aukland');
    expect(res.text).toContain('Wellington');
    expect(targetRow().city).toBe('Aukland');
    expect(corrections()).toHaveLength(0);
  });

  it('reports a submission that changes nothing as changing nothing', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${TARGET_ID}/profile`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({ city: 'Aukland' }));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Nothing would change');
  });
});

describe('the correction obeys the rules the member\'s own form applies', () => {
  it('refuses a country the member\'s own save would refuse, writing nothing', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${TARGET_ID}/profile/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({ country: 'Freedonia', region: '' }));
    expect(res.status).toBe(422);
    expect(targetRow().country).toBe('New Zealand');
  });

  it('refuses a blank city, which is a required profile field', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${TARGET_ID}/profile/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({ city: '' }));
    expect(res.status).toBe(422);
    expect(targetRow().city).toBe('Aukland');
  });

  it('refuses a correction with no reason, writing nothing', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${TARGET_ID}/profile/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({ reason: '   ' }));
    expect(res.status).toBe(422);
    expect(targetRow().city).toBe('Aukland');
    expect(corrections()).toHaveLength(0);
  });
});

describe('the correction writes the values and records them', () => {
  it('applies the change and audits each moved field before and after', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${TARGET_ID}/profile/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({ phone: '+64 21 555 0100', searchable: '0' }));
    expect(res.status).toBe(303);
    expect(res.headers['location']).toBe(`/admin/members/${TARGET_ID}`);

    const row = targetRow();
    expect(row.city).toBe('Wellington');
    expect(row.phone).toBe('+64 21 555 0100');
    expect(row.searchable).toBe(0);

    const rows = corrections();
    expect(rows).toHaveLength(1);
    expect(rows[0].reason_text).toBe('Member reported the wrong city at registration.');
    const meta = JSON.parse(rows[0].metadata_json) as {
      fields: string[]; before: Record<string, unknown>; after: Record<string, unknown>;
    };
    expect(meta.fields).toContain('city');
    expect(meta.before.city).toBe('Aukland');
    expect(meta.after.city).toBe('Wellington');
    // The flags are recorded as stored, so the trail says what the value was.
    expect(meta.before.searchable).toBe(1);
    expect(meta.after.searchable).toBe(0);
  });

  it('tells the member what changed and why, without sending the values', () => {
    const mail = db((conn) =>
      conn.prepare(`
        SELECT template_key, body_text FROM outbox_emails
        WHERE recipient_member_id = ? AND template_key = 'member_record_corrected'
      `).get(TARGET_ID)) as { template_key: string; body_text: string } | undefined;

    expect(mail?.template_key).toBe('member_record_corrected');
    expect(mail?.body_text).toContain('your city');
    expect(mail?.body_text).toContain('Member reported the wrong city at registration.');
    // The values stay off the wire: the address on file may be exactly what was
    // wrong, which is a common reason for the correction in the first place.
    expect(mail?.body_text).not.toContain('Wellington');
    expect(mail?.body_text).not.toContain('+64 21 555 0100');
  });

  it('leaves the biography exactly as the member wrote it', () => {
    expect(targetRow().bio).toBe('My own words about me.');
  });

  it('records nothing further when the same submission is applied again', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${TARGET_ID}/profile/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({ city: 'Wellington', phone: '+64 21 555 0100', searchable: '0' }));
    expect(res.status).toBe(303);
    expect(corrections()).toHaveLength(1);
  });
});

describe('a crafted submission cannot reach past the profile fields', () => {
  it('ignores a posted biography and extra privileged columns', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${TARGET_ID}/profile/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({
        city: 'Dunedin',
        bio: 'Words an administrator put in their mouth.',
        is_admin: '1',
        slug: 'taken-over',
      }));
    expect(res.status).toBe(303);

    expect(targetRow().bio).toBe('My own words about me.');
    const member = db((conn) =>
      conn.prepare('SELECT is_admin, slug FROM members WHERE id = ?').get(TARGET_ID)) as
      { is_admin: number; slug: string };
    expect(member.is_admin).toBe(0);
    expect(member.slug).toBe('pc-target');
  });
});

/**
 * Deletion is final: a member who wants to come back opens a new account and
 * asks an administrator to link it, rather than the old record being edited
 * back into use. And an account whose personal data has been erased has nothing
 * left to correct, so a correction there would write erased data back onto a
 * record the platform has already promised to have cleared.
 */
describe('a deleted or erased account is not correctable', () => {
  const DELETED_ID = 'pc_deleted';
  const PURGED_ID = 'pc_purged';

  beforeAll(() => {
    db((conn) => {
      insertMember(conn, {
        id: DELETED_ID, slug: 'pc-deleted', display_name: 'Del Eted', real_name: 'Del Eted',
        login_email: 'pc-deleted@example.com', city: 'Wellington', country: 'New Zealand',
      });
      insertMember(conn, {
        id: PURGED_ID, slug: 'pc-purged', display_name: 'Pur Ged', real_name: 'Pur Ged',
        login_email: 'pc-purged@example.com', city: 'Wellington', country: 'New Zealand',
      });
      completeOnboarding(conn, DELETED_ID);
      completeOnboarding(conn, PURGED_ID);
      conn.prepare("UPDATE members SET deleted_at = '2026-09-01T00:00:00.000Z' WHERE id = ?")
        .run(DELETED_ID);
      // A purged row as the erasure path actually leaves it: the schema refuses
      // one that keeps its credentials, so a fixture that set the marker alone
      // would be a state the platform can never reach.
      conn.prepare(
        "UPDATE members SET personal_data_purged_at = '2026-09-01T00:00:00.000Z',"
        + ' login_email = NULL, login_email_normalized = NULL, password_hash = NULL,'
        + ' password_changed_at = NULL, city = NULL, region = NULL, phone = NULL,'
        + " whatsapp = NULL, birth_date = NULL, bio = '' WHERE id = ?",
      ).run(PURGED_ID);
    });
  });

  it('does not offer the form on a deleted account', async () => {
    const res = await request(createApp())
      .get(`/admin/members/${DELETED_ID}`)
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Correct the Profile Details');
  });

  it('does not offer the form on an erased account', async () => {
    const res = await request(createApp())
      .get(`/admin/members/${PURGED_ID}`)
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Correct the Profile Details');
  });

  it('refuses a crafted correction on a deleted account', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${DELETED_ID}/profile/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({ city: 'Dunedin' }));
    expect(res.status).toBe(422);

    const row = db((conn) =>
      conn.prepare('SELECT city FROM members WHERE id = ?').get(DELETED_ID)) as { city: string };
    expect(row.city).toBe('Wellington');
  });

  it('refuses a crafted correction on an erased account, so nothing is written back', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${PURGED_ID}/profile/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send(submission({ city: 'Dunedin' }));
    expect(res.status).toBe(422);

    const row = db((conn) =>
      conn.prepare('SELECT city FROM members WHERE id = ?').get(PURGED_ID)) as { city: string | null };
    // Still erased. This is the assertion the whole case exists for.
    expect(row.city).toBeNull();
  });
});

describe('the route is administrator-only', () => {
  it('refuses an authenticated non-administrator', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${TARGET_ID}/profile/confirm`)
      .set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId: TARGET_ID, role: 'member' })}`)
      .type('form')
      .send(submission());
    expect(res.status).toBe(403);
  });
});
