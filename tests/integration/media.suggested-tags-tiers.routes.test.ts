/**
 * The /media/browse suggested-tags surface composes two tiers: a tag two
 * distinct members share is the people-are-uploading signal and leads, and
 * curator-published tags backfill the slots left after it. Both tiers come from
 * recorded usage, so the surface never offers a tag nothing carries.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertFreeformTag, insertMediaItem, attachMediaTag } from '../fixtures/factories';

const { dbPath } = setTestEnv('3079');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // A curator tag: public because it rides system content, but only one
  // distinct member, so it backfills behind the community tier.
  const curator = insertMember(db, {
    id: 'member-curator', slug: 'footbag_hacky', is_system: 1,
    login_email: 'curator@example.com', real_name: 'Footbag Hacky', display_name: 'Footbag Hacky',
  });
  const curatorTag = insertFreeformTag(db, { tag_normalized: '#passback_records', tag_display: '#passback_records' });
  attachMediaTag(db, insertMediaItem(db, { uploader_member_id: curator, caption: 'curated' }), curatorTag);

  // A real community tag two distinct ordinary members share. This is the
  // people-are-uploading signal that leads the list.
  const memberA = insertMember(db, { id: 'member-a', slug: 'player_a', login_email: 'a@example.com', real_name: 'Player A', display_name: 'Player A' });
  const memberB = insertMember(db, { id: 'member-b', slug: 'player_b', login_email: 'b@example.com', real_name: 'Player B', display_name: 'Player B' });
  const sharedTag = insertFreeformTag(db, { tag_normalized: '#community_fav', tag_display: '#community_fav' });
  attachMediaTag(db, insertMediaItem(db, { uploader_member_id: memberA, caption: 'a' }), sharedTag);
  attachMediaTag(db, insertMediaItem(db, { uploader_member_id: memberB, caption: 'b' }), sharedTag);

  db.close();

  createApp = await importApp();
  const mod = await import('../../src/services/hashtagDiscoveryService');
  mod.hashtagDiscoveryService.rebuildTagStats();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media/browse — suggested-tag tiers', () => {
  it('ranks the two-member community tag above the curator-published one', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(res.status).toBe(200);
    const community = res.text.indexOf('#community_fav');
    const curator = res.text.indexOf('#passback_records');
    expect(community).toBeGreaterThan(-1);
    expect(curator).toBeGreaterThan(-1);
    expect(community).toBeLessThan(curator);
  });

  it('offers no tag the platform holds no media for', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(res.text).not.toContain('#club_wellington');
    expect(res.text).not.toContain('#event_2026_worlds_japan');
    expect(res.text).not.toContain('#chinlone');
  });
});
