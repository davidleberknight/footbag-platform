/**
 * Media featuring a player, kept apart from media they uploaded.
 *
 * A player hashtag says who appears in an item; the uploader hashtag says who
 * shared it. A person's page shows the newest media crediting them as a player
 * in its own block, with their player hashtag under their name linked to all of
 * it: a historical person by their record's folded name, a member by their own
 * slug. Media a member only uploaded never appears in that block. On another
 * member's profile the block is member-visible, like the member's uploads: an
 * anonymous visitor to an honoree's profile sees the honor record only.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  createTestSessionJwt,
  insertFreeformTag,
  insertHistoricalPerson,
  insertMember,
  insertMediaItem,
  attachMediaTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3091');

let createApp: Awaited<ReturnType<typeof importApp>>;
let creditedHistoricalMedia = '';
let creditedMemberMedia = '';
let uploadedOnlyMedia = '';

const HISTORICAL_ID = 'person-tuan-vu';
const QUIET_ID = 'person-quiet-player';
const MEMBER_SLUG = 'kim_lee';
const VIEWER_ID = 'viewer-member';

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role: 'member' })}`;
}

function playerBlock(html: string): string {
  const start = html.indexOf('id="player-media"');
  return start === -1 ? '' : html.slice(start, html.indexOf('</ul>', start));
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const uploader = insertMember(db, {
    id: 'uploader-player-media', slug: 'player_media_uploader',
    login_email: 'player-media-uploader@example.com', display_name: 'Clip Uploader',
  });
  insertMember(db, {
    id: VIEWER_ID, slug: 'viewer_member',
    login_email: 'viewer-member@example.com', display_name: 'Viewer Member',
  });
  const kim = insertMember(db, {
    id: 'member-kim-lee', slug: MEMBER_SLUG, login_email: 'kim-lee@example.com',
    display_name: 'Kim Lee', is_hof: 1,
  });

  insertHistoricalPerson(db, { person_id: HISTORICAL_ID, person_name: 'Tuan Vu' });
  insertHistoricalPerson(db, { person_id: QUIET_ID, person_name: 'Quiet Player' });

  const tuanTag = insertFreeformTag(db, { tag_normalized: '#player_tuan_vu' });
  creditedHistoricalMedia = insertMediaItem(db, { uploader_member_id: uploader, caption: 'Tuan Vu routine' });
  attachMediaTag(db, creditedHistoricalMedia, tuanTag);

  const kimTag = insertFreeformTag(db, { tag_normalized: `#player_${MEMBER_SLUG}` });
  creditedMemberMedia = insertMediaItem(db, { uploader_member_id: uploader, caption: 'Kim Lee shred' });
  attachMediaTag(db, creditedMemberMedia, kimTag);

  // Kim uploaded this but does not appear in it.
  const byKim = insertFreeformTag(db, { tag_normalized: `#by_${MEMBER_SLUG}` });
  uploadedOnlyMedia = insertMediaItem(db, { uploader_member_id: kim, caption: 'Filmed by Kim' });
  attachMediaTag(db, uploadedOnlyMedia, byKim);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('historical player page', () => {
  it('shows media crediting the person and links their player hashtag to it', async () => {
    // Defect caught: a credited player's page shows none of the media they appear in.
    const res = await request(createApp()).get(`/history/${HISTORICAL_ID}`);
    expect(res.status).toBe(200);
    expect(playerBlock(res.text)).toContain(`/media/item/${creditedHistoricalMedia}?`);
    expect(res.text).toMatch(
      /<p class="hero-hashtag"><a href="\/media\/browse\?context&#x3D;player_tuan_vu">#player_tuan_vu<\/a><\/p>/);
  });

  it('shows a plain player hashtag and no block when nothing credits the person', async () => {
    // Defect caught: a gallery button to an empty gallery, or no hashtag to credit them with.
    const res = await request(createApp()).get(`/history/${QUIET_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('id="player-media"');
    expect(res.text).toContain('<p class="hero-hashtag">#player_quiet_player</p>');
  });
});

describe('member profiles', () => {
  it('shows media crediting the member, never media they only uploaded, on their own profile', async () => {
    // Defect caught: "featuring" and "uploaded by" merged, so a member's own
    // uploads are presented as media they appear in, or credits are lost.
    const res = await request(createApp()).get(`/members/${MEMBER_SLUG}`)
      .set('Cookie', cookieFor('member-kim-lee'));
    expect(res.status).toBe(200);
    const block = playerBlock(res.text);
    expect(block).toContain(`/media/item/${creditedMemberMedia}?`);
    expect(block).not.toContain(uploadedOnlyMedia);
    expect(res.text).toContain('href="/media/browse?context&#x3D;player_kim_lee"');
  });

  it('shows the block to another signed-in member', async () => {
    const res = await request(createApp()).get(`/members/${MEMBER_SLUG}`)
      .set('Cookie', cookieFor(VIEWER_ID));
    expect(res.status).toBe(200);
    expect(playerBlock(res.text)).toContain(`/media/item/${creditedMemberMedia}?`);
  });

  it('shows neither the block nor the player hashtag to an anonymous visitor of an honoree', async () => {
    // Defect caught: the honor exception publishing more than the honor record.
    const res = await request(createApp()).get(`/members/${MEMBER_SLUG}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('id="player-media"');
    expect(res.text).not.toContain('#player_kim_lee');
  });
});
