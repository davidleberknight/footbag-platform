/**
 * The administrator's lookup over the old footbag.org accounts nobody has
 * claimed.
 *
 * The queue asks an administrator to type a legacy account id when they approve
 * a member's link-help request, and no admin surface could produce one: the
 * member lookup searches member accounts, the historical-record lookup searches
 * competition records, and every legacy path matches an exact identifier the
 * member themselves supplied. This is the surface that answers "which account
 * are they talking about".
 *
 * Covers the admin gate, the search keys (name fragment, exact id, exact
 * username, exact email), that a claimed account is not offered, the minimum
 * query length, and that an email is matched whole rather than by fragment.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3462');

const ADMIN_ID  = 'la_admin_001';
const MEMBER_ID = 'la_member_001';
const HOLDER_ID = 'la_holder_001';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'la_admin', display_name: 'LA Admin', login_email: 'la-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'la_member', display_name: 'LA Member', login_email: 'la-member@example.com' });

  insertLegacyMember(db, {
    legacy_member_id: 'LM-unclaimed-1',
    legacy_user_id:   'shredder92',
    legacy_email:     'unclaimed.one@old.example.com',
    real_name:        'Wilhelmina Shred',
    display_name:     'Willa Shred',
    birth_date:       '1979-04-02',
    city:             'Portland',
    country:          'USA',
    first_competition_year: 1996,
  });
  insertLegacyMember(db, {
    legacy_member_id: 'LM-unclaimed-2',
    legacy_email:     'unclaimed.two@old.example.com',
    real_name:        'Wilhelmina Other',
    display_name:     'Wilhelmina Other',
  });
  insertLegacyMember(db, {
    legacy_member_id: 'LM-claimed-1',
    legacy_email:     'claimed.one@old.example.com',
    real_name:        'Wilhelmina Claimed',
    display_name:     'Wilhelmina Claimed',
  });
  // A claimed account is reached from its holder's member record, and there is
  // nothing left to decide about it here.
  insertMember(db, {
    id: HOLDER_ID, slug: 'la_holder', display_name: 'LA Holder',
    login_email: 'la-holder@example.com', legacy_member_id: 'LM-claimed-1',
  });
  db.prepare(
    `UPDATE legacy_members SET claimed_by_member_id = ?, claimed_at = '2026-01-01T00:00:00.000Z'
     WHERE legacy_member_id = 'LM-claimed-1'`,
  ).run(HOLDER_ID);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /admin/legacy-accounts', () => {
  it('redirects an unauthenticated visitor to sign in', async () => {
    const res = await request(createApp()).get('/admin/legacy-accounts');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('refuses a member who is not an administrator', async () => {
    const res = await request(createApp())
      .get('/admin/legacy-accounts')
      .set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('invites a search and lists nothing before one is made', async () => {
    const res = await request(createApp())
      .get('/admin/legacy-accounts')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Search the old accounts nobody has claimed');
    expect(res.text).not.toContain('LM-unclaimed-1');
  });

  it('finds accounts by part of a name, with the id the approve form takes', async () => {
    const res = await request(createApp())
      .get('/admin/legacy-accounts?q=wilhelmina')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('LM-unclaimed-1');
    expect(res.text).toContain('LM-unclaimed-2');
    // Claimed accounts are somebody's already; they belong to the member record.
    expect(res.text).not.toContain('LM-claimed-1');
  });

  it('finds one account by its exact id, username, or email address', async () => {
    for (const q of ['LM-unclaimed-1', 'shredder92', 'unclaimed.one@old.example.com']) {
      const res = await request(createApp())
        .get(`/admin/legacy-accounts?q=${encodeURIComponent(q)}`)
        .set('Cookie', adminCookie());
      expect(res.status).toBe(200);
      expect(res.text, `searching ${q}`).toContain('LM-unclaimed-1');
      expect(res.text, `searching ${q}`).toContain('One account matches.');
    }
  });

  it('shows the date of birth on the account, which is what a claim is checked against', async () => {
    const res = await request(createApp())
      .get('/admin/legacy-accounts?q=LM-unclaimed-1')
      .set('Cookie', adminCookie());
    expect(res.text).toContain('1979-04-02');
  });

  it('matches an email whole, so the page cannot be used to browse addresses', async () => {
    const res = await request(createApp())
      .get('/admin/legacy-accounts?q=old.example.com')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('No unclaimed legacy account matches that search.');
  });

  it('asks for more than one character rather than answering with the whole table', async () => {
    const res = await request(createApp())
      .get('/admin/legacy-accounts?q=w')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Enter at least 2 characters');
    expect(res.text).not.toContain('LM-unclaimed-1');
  });
});
