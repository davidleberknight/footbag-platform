/**
 * The administrator's member find reaching every person the platform holds.
 *
 * The contract: one query lists member accounts, old footbag.org accounts
 * (claimed or not) and historical competition records, each kind in a group of
 * its own so no row is mistaken for another kind. A name matches in each of its
 * curated nickname forms, so a search for "David" reaches a record filed as
 * "Dave". An old account is found by part of its name, its username, its old
 * account id or an exact email address, never an email fragment. A claimed old
 * account or record names the member who holds it and links to their record.
 * The historical-records lookup matches nicknames the same way.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, completeOnboarding, createTestSessionJwt, insertLegacyMember, insertHistoricalPerson,
  insertGivenNameVariant,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4001');

const ADMIN_ID = 'fe_admin_001';
const HOLDER_ID = 'fe_holder_001';
const OLD_UNCLAIMED = 'fe-legacy-unclaimed';
const OLD_CLAIMED = 'fe-legacy-claimed';
const RECORD_NICKNAME = 'fe-person-dave';
const RECORD_CLAIMED = 'fe-person-claimed';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

async function find(query: string, path = '/admin/members'): Promise<string> {
  const res = await request(createApp()).get(`${path}?q=${encodeURIComponent(query)}`).set('Cookie', adminCookie());
  expect(res.status, `query ${query}`).toBe(200);
  return res.text;
}

/** The markup of the div with this id, through its matching close tag; fails when absent. */
function groupOf(html: string, id: string): string {
  const start = html.indexOf(`<div id="${id}"`);
  expect(start, `group #${id} is on the page`).toBeGreaterThanOrEqual(0);
  const tags = /<div\b|<\/div>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  throw new Error(`group #${id} never closes`);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: ADMIN_ID, slug: 'fe_admin', display_name: 'Fe Admin', login_email: 'fe-admin@example.com', is_admin: 1,
  });
  completeOnboarding(db, ADMIN_ID);
  insertHistoricalPerson(db, { person_id: RECORD_CLAIMED, person_name: 'Morgan Quillfeather', country: 'USA' });
  insertMember(db, {
    id: HOLDER_ID, slug: 'morgan_quillfeather', display_name: 'Morgan Quillfeather',
    login_email: 'morgan@example.com', historical_person_id: RECORD_CLAIMED,
  });
  completeOnboarding(db, HOLDER_ID);
  insertLegacyMember(db, {
    legacy_member_id: OLD_UNCLAIMED, legacy_user_id: 'oldquill', real_name: 'Rowan Quillfeather',
    legacy_email: 'rowan@old.example', city: 'Eugene', country: 'United States',
  });
  insertLegacyMember(db, {
    legacy_member_id: OLD_CLAIMED, legacy_user_id: 'mquill', real_name: 'Morgan Quillfeather',
    claimed_by_member_id: HOLDER_ID, claimed_at: '2026-01-02T00:00:00.000Z',
  });
  insertGivenNameVariant(db, { short_form_normalized: 'dave', long_form_normalized: 'david' });
  insertHistoricalPerson(db, { person_id: RECORD_NICKNAME, person_name: 'Dave Quillfeather', country: 'USA' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the member find across every kind of person record', () => {
  // Defect caught: an administrator searching a surname finds only modern
  // accounts and cannot reach an old account or a historical record, or a row
  // lands in the wrong group and is mistaken for another kind.
  it('lists member accounts, old accounts and historical records, each in its own group', async () => {
    const html = await find('Quillfeather');
    const members = groupOf(html, 'member-accounts');
    const old = groupOf(html, 'old-accounts');
    const records = groupOf(html, 'historical-records');
    expect(members).toContain(`/admin/members/${HOLDER_ID}`);
    expect(members).not.toContain('Rowan Quillfeather');
    expect(old).toContain('Rowan Quillfeather');
    expect(old).toContain('oldquill');
    expect(old).not.toContain('Dave Quillfeather');
    expect(records).toContain(`/admin/historical-records?q=${RECORD_NICKNAME}`);
    expect(records).toContain(`/history/${RECORD_NICKNAME}`);
    expect(records).not.toContain('Rowan Quillfeather');
  });

  // Defect caught: a claimed old account or record does not say who holds it,
  // so the administrator corrects the wrong home, or cannot reach the member.
  it('names and links the member who holds a claimed old account or record', async () => {
    const html = await find('Morgan Quillfeather');
    expect(groupOf(html, 'old-accounts')).toContain(`href="/admin/members/${HOLDER_ID}"`);
    expect(groupOf(html, 'historical-records')).toContain(`href="/admin/members/${HOLDER_ID}"`);
    const unclaimed = groupOf(await find('Rowan'), 'old-accounts');
    expect(unclaimed).toContain('Rowan Quillfeather');
    expect(unclaimed).not.toContain('/admin/members/');
  });

  // Defect caught: a search under the name a person goes by misses the record
  // filed under its other form ("David" for a record filed as "Dave").
  it('matches a name in each of its curated nickname forms, here and on the historical-records lookup', async () => {
    expect(groupOf(await find('David Quillfeather'), 'historical-records'))
      .toContain(`/admin/historical-records?q=${RECORD_NICKNAME}`);
    expect(await find('David Quillfeather', '/admin/historical-records')).toContain(RECORD_NICKNAME);
    expect(groupOf(await find('Davida Quillfeather'), 'historical-records'))
      .not.toContain(RECORD_NICKNAME);
  });

  // Defect caught: the find turns into a way to browse archived email
  // addresses by fragment, or an exact old email or old account id misses.
  it('finds an old account by exact email or old account id, never by an email fragment', async () => {
    expect(groupOf(await find('rowan@old.example'), 'old-accounts')).toContain('Rowan Quillfeather');
    expect(groupOf(await find(OLD_UNCLAIMED), 'old-accounts')).toContain('Rowan Quillfeather');
    expect(groupOf(await find('@old.example'), 'old-accounts')).not.toContain('Rowan Quillfeather');
  });
});
