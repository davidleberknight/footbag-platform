/**
 * Renaming a club's hashtag: the hashtag is the club's public URL key, so a
 * rename moves the club's address and rewrites the tag row behind it. A leader
 * may rename it, a member who does not lead the club may not, and a hashtag
 * another club already holds is refused with the row left alone.
 *
 * The rewritten tag row carries the metadata stamp of the leader who renamed
 * it. Without that the row keeps naming whoever last changed something else
 * about it, which reads as an answer rather than as a gap, and every column the
 * page renders looks right while the record of who acted is wrong.
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

let _n = 0;
function seedClubWithLeader(): {
  clubKey: string; tagId: string; leaderId: string; outsiderId: string;
} {
  _n += 1;
  const clubId = `chr-club-${_n}`;
  const leaderId = `chr-leader-${_n}`;
  const outsiderId = `chr-outsider-${_n}`;
  // The public club key is the stored hashtag minus '#'.
  const tagId = insertTag(db, {
    tag_normalized: `#club_chr_${_n}`,
    tag_display: `#club_chr_${_n}`,
    standard_type: 'club',
  });
  insertClub(db, { id: clubId, name: `CHR Club ${_n}`, hashtag_tag_id: tagId, country: 'USA' });
  insertMember(db, { id: leaderId, slug: `chr_leader_${_n}`, login_email: `${leaderId}@example.com` });
  insertMember(db, { id: outsiderId, slug: `chr_outsider_${_n}`, login_email: `${outsiderId}@example.com` });
  insertClubLeader(db, { id: `chr-cl-${_n}`, club_id: clubId, member_id: leaderId });
  return { clubKey: `club_chr_${_n}`, tagId, leaderId, outsiderId };
}

function tagRow(tagId: string): {
  tag_normalized: string; tag_display: string;
  updated_at: string; updated_by: string; version: number;
} {
  return db.prepare(
    'SELECT tag_normalized, tag_display, updated_at, updated_by, version FROM tags WHERE id = ?',
  ).get(tagId) as {
    tag_normalized: string; tag_display: string;
    updated_at: string; updated_by: string; version: number;
  };
}

function rename(clubKey: string, memberId: string, newSlug: string) {
  return request(createApp())
    .post(`/clubs/${clubKey}/hashtag`)
    .set('Cookie', cookieFor(memberId))
    .type('form')
    .send({ newSlug });
}

describe('POST /clubs/:key/hashtag', () => {
  it('a leader renames the hashtag, and the tag row records that leader as the last to change it', async () => {
    const { clubKey, tagId, leaderId } = seedClubWithLeader();
    const before = tagRow(tagId);

    const res = await rename(clubKey, leaderId, 'renamed_by_leader');

    // The hashtag is the URL key, so success lands on the new address.
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/clubs/club_renamed_by_leader');

    const after = tagRow(tagId);
    expect(after.tag_normalized).toBe('#club_renamed_by_leader');
    expect(after.tag_display).toBe('#club_renamed_by_leader');
    expect(after.updated_by).toBe(leaderId);
    expect(after.version).toBe(before.version + 1);
    expect(after.updated_at > before.updated_at).toBe(true);
  });

  it('a member who does not lead the club cannot rename it, and the row is untouched', async () => {
    const { clubKey, tagId, outsiderId } = seedClubWithLeader();
    const before = tagRow(tagId);

    const res = await rename(clubKey, outsiderId, 'taken_by_outsider');

    expect(res.status).toBe(404);
    expect(tagRow(tagId)).toEqual(before);
  });

  it('a hashtag another club already holds is refused, and the row is untouched', async () => {
    const first = seedClubWithLeader();
    const second = seedClubWithLeader();
    const before = tagRow(second.tagId);
    const takenSlug = tagRow(first.tagId).tag_normalized.replace('#club_', '');

    const res = await rename(second.clubKey, second.leaderId, takenSlug);

    // The refusal returns the leader to the club's existing address.
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/clubs/${second.clubKey}`);
    expect(tagRow(second.tagId)).toEqual(before);
  });
});
