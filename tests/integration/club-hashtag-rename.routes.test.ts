/**
 * A club's hashtag is its permanent handle and the address its public page sits
 * at, so no member path renames it, the club's own co-leader included. Only an
 * administrator moves a hashtag, through the club correction screens, which
 * preview the move and warn that the old address stops working.
 *
 * A member door onto the rename would move the club's address with no preview
 * and nothing redirecting from the old one, breaking every link already shared.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertClub, insertClubLeader, insertTag, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('4146');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

beforeAll(async () => {
  db = createTestDb(dbPath);
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

const cookieFor = (id: string) => `__Host-footbag_session=${createTestSessionJwt({ memberId: id })}`;

function tagRow(tagId: string): Record<string, unknown> {
  return db.prepare(
    'SELECT tag_normalized, tag_display, updated_at, updated_by, version FROM tags WHERE id = ?',
  ).get(tagId) as Record<string, unknown>;
}

describe('POST /clubs/:key/hashtag', () => {
  it("refuses the club's own co-leader and leaves the hashtag and the club address as they were", async () => {
    const tagId = insertTag(db, {
      tag_normalized: '#club_chr_kept',
      tag_display: '#club_chr_kept',
      standard_type: 'club',
    });
    insertClub(db, { id: 'chr-club', name: 'CHR Club', hashtag_tag_id: tagId, country: 'USA' });
    insertMember(db, { id: 'chr-leader', slug: 'chr_leader', login_email: 'chr-leader@example.com' });
    insertClubLeader(db, { id: 'chr-cl', club_id: 'chr-club', member_id: 'chr-leader' });
    const before = tagRow(tagId);

    const res = await request(createApp())
      .post('/clubs/club_chr_kept/hashtag')
      .set('Cookie', cookieFor('chr-leader'))
      .type('form')
      .send({ newSlug: 'renamed_by_leader' });

    expect(res.status).toBe(404);
    expect(tagRow(tagId)).toEqual(before);
    const page = await request(createApp()).get('/clubs/club_chr_kept');
    expect(page.status).toBe(200);
  });
});
