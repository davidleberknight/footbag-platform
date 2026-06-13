/**
 * Per-field contact-PII visibility on the member profile.
 *
 *   - Phone and WhatsApp are off by default and opt-in per field; when opted in
 *     they render to authenticated members only, never to an anonymous viewer.
 *   - WhatsApp is member-editable.
 *   - A member who co-leads a club cannot set contact-email visibility below
 *     members-only: the edit is forced to 'members' server-side.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertClub, insertClubLeader, insertMemberClubAffiliation, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3201');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const OWNER_ID = 'pii-owner';
const OWNER_SLUG = 'pii_owner';
const VIEWER_ID = 'pii-viewer';
const COLEAD_ID = 'pii-colead';
const COLEAD_SLUG = 'pii_colead';

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: OWNER_ID, slug: OWNER_SLUG, display_name: 'Pii Owner', login_email: 'pii-owner@example.com' });
  insertMember(db, { id: VIEWER_ID, slug: 'pii_viewer', display_name: 'Pii Viewer' });
  insertMember(db, { id: COLEAD_ID, slug: COLEAD_SLUG, display_name: 'Pii Colead', login_email: 'pii-colead@example.com' });
  const clubId = insertClub(db, { id: 'pii-club', name: 'Pii Club' });
  insertClubLeader(db, { club_id: clubId, member_id: COLEAD_ID });
  insertMemberClubAffiliation(db, COLEAD_ID, clubId);
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

const cookieFor = (id: string) => `footbag_session=${createTestSessionJwt({ memberId: id })}`;

function editOwner(fields: Record<string, string>): request.Test {
  return request(createApp())
    .post(`/members/${OWNER_SLUG}/edit`)
    .set('Cookie', cookieFor(OWNER_ID))
    .type('form')
    .send(fields);
}

describe('per-field contact-PII visibility', () => {
  it('opted-in phone and WhatsApp render to an authenticated member', async () => {
    await editOwner({
      phone: '555-0101', whatsapp: '555-0202',
      phoneVisible: '1', whatsappVisible: '1', emailVisibility: 'private',
    }).expect(303);

    const res = await request(createApp()).get(`/members/${OWNER_SLUG}`).set('Cookie', cookieFor(VIEWER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('555-0101');
    expect(res.text).toContain('555-0202');
  });

  it('opted-out phone and WhatsApp are hidden from an authenticated member', async () => {
    await editOwner({
      phone: '555-0101', whatsapp: '555-0202', emailVisibility: 'private',
    }).expect(303);

    const res = await request(createApp()).get(`/members/${OWNER_SLUG}`).set('Cookie', cookieFor(VIEWER_ID));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('555-0101');
    expect(res.text).not.toContain('555-0202');
  });

  it('opted-in contact PII never reaches an anonymous viewer (the profile is not anon-visible at all)', async () => {
    await editOwner({
      phone: '555-0101', phoneVisible: '1', emailVisibility: 'members',
    }).expect(303);

    const res = await request(createApp()).get(`/members/${OWNER_SLUG}`);
    expect(res.status).toBe(302);
    expect(res.text).not.toContain('555-0101');
  });

  it('a co-leader cannot set contact-email visibility below members-only', async () => {
    await request(createApp())
      .post(`/members/${COLEAD_SLUG}/edit`)
      .set('Cookie', cookieFor(COLEAD_ID))
      .type('form')
      .send({ emailVisibility: 'private' })
      .expect(303);

    const row = db.prepare('SELECT email_visibility FROM members WHERE id = ?').get(COLEAD_ID) as { email_visibility: string };
    expect(row.email_visibility).toBe('members');
  });
});

describe('discoverable-in-member-search toggle', () => {
  const searchableOf = (id: string): number =>
    (db.prepare('SELECT searchable FROM members WHERE id = ?').get(id) as { searchable: number }).searchable;

  const inSearchableView = (id: string): boolean =>
    db.prepare('SELECT 1 FROM members_searchable WHERE id = ?').get(id) != null;

  it('renders the toggle on the owner edit form', async () => {
    const res = await request(createApp()).get(`/members/${OWNER_SLUG}/edit`).set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="searchable"');
    expect(res.text).toContain('Allow other members to find me in member search');
  });

  it('opting in keeps the member in the searchable view', async () => {
    await editOwner({ searchable: '1', emailVisibility: 'private' }).expect(303);
    expect(searchableOf(OWNER_ID)).toBe(1);
    expect(inSearchableView(OWNER_ID)).toBe(true);
  });

  it('opting out (toggle unchecked) excludes the member from the searchable view', async () => {
    // An unchecked checkbox posts only the hidden "0"; the form omits no field.
    await editOwner({ emailVisibility: 'private' }).expect(303);
    expect(searchableOf(OWNER_ID)).toBe(0);
    expect(inSearchableView(OWNER_ID)).toBe(false);
  });

  it('re-enabling the toggle restores searchable inclusion', async () => {
    await editOwner({ searchable: '1', emailVisibility: 'private' }).expect(303);
    expect(searchableOf(OWNER_ID)).toBe(1);
    expect(inSearchableView(OWNER_ID)).toBe(true);
  });

  it('records searchable among the changed fields in the profile-update audit row', async () => {
    await editOwner({ emailVisibility: 'private' }).expect(303);
    const row = db.prepare(
      `SELECT metadata_json FROM audit_entries
        WHERE entity_id = ? AND action_type = 'member.profile_updated'
        ORDER BY created_at DESC, id DESC LIMIT 1`,
    ).get(OWNER_ID) as { metadata_json: string };
    expect(JSON.parse(row.metadata_json).fields).toContain('searchable');
  });
});
