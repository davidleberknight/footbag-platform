/**
 * The /media/browse suggested-tags surface pins the curated starter seeds while
 * the community is quiet, then phases them out as people make new uploads: a tag
 * two distinct members share ranks above the pinned seeds, and curator-published
 * tags backfill only the slots left after community tags and seeds.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertTag, insertMediaItem } from '../fixtures/factories';

const { dbPath } = setTestEnv('3079');
const TS = '2025-01-01T00:00:00.000Z';

let createApp: Awaited<ReturnType<typeof importApp>>;

function insertMediaTag(db: BetterSqlite3.Database, id: string, mediaId: string, tagId: string, tagDisplay: string): void {
  db.prepare(`
    INSERT INTO media_tags (
      id, created_at, created_by, updated_at, updated_by, version,
      media_id, tag_id, tag_display
    ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?)
  `).run(id, TS, TS, mediaId, tagId, tagDisplay);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // A curator tag: public because it rides system content, but only one
  // distinct member, so it backfills behind the seeds.
  const curator = insertMember(db, {
    id: 'member-curator', slug: 'footbag_hacky', is_system: 1,
    login_email: 'curator@example.com', real_name: 'Footbag Hacky', display_name: 'Footbag Hacky',
  });
  const curatorTag = insertTag(db, { id: 'tag-pbr', tag_normalized: '#passback_records', tag_display: '#passback_records' });
  const cm = insertMediaItem(db, { uploader_member_id: curator, caption: 'curated' });
  insertMediaTag(db, 'mt-cur', cm, curatorTag, '#passback_records');

  // A real community tag two distinct ordinary members share. This is the
  // people-are-uploading signal that ranks above the pinned seeds.
  const memberA = insertMember(db, { id: 'member-a', slug: 'player_a', login_email: 'a@example.com', real_name: 'Player A', display_name: 'Player A' });
  const memberB = insertMember(db, { id: 'member-b', slug: 'player_b', login_email: 'b@example.com', real_name: 'Player B', display_name: 'Player B' });
  const sharedTag = insertTag(db, { id: 'tag-shared', tag_normalized: '#community_fav', tag_display: '#community_fav' });
  const ma = insertMediaItem(db, { uploader_member_id: memberA, caption: 'a' });
  const mb = insertMediaItem(db, { uploader_member_id: memberB, caption: 'b' });
  insertMediaTag(db, 'mt-a', ma, sharedTag, '#community_fav');
  insertMediaTag(db, 'mt-b', mb, sharedTag, '#community_fav');

  db.close();

  createApp = await importApp();
  const mod = await import('../../src/services/hashtagDiscoveryService');
  mod.hashtagDiscoveryService.rebuildTagStats();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media/browse — suggested-tags phase-out', () => {
  it('ranks the two-member community tag above the pinned seeds', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(res.status).toBe(200);
    const community = res.text.indexOf('#community_fav');
    const seed = res.text.indexOf('#club_wellington');
    expect(community).toBeGreaterThan(-1);
    expect(seed).toBeGreaterThan(-1);
    expect(community).toBeLessThan(seed);
  });

  it('still shows the pinned seeds while community usage is light', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(res.text).toContain('#club_wellington');
    expect(res.text).toContain('#event_2026_worlds_japan');
    expect(res.text).toContain('#chinlone');
  });

  it('backfills the curator-published tag behind the seeds', async () => {
    const res = await request(createApp()).get('/media/browse');
    const seed = res.text.indexOf('#chinlone');
    const curator = res.text.indexOf('#passback_records');
    expect(curator).toBeGreaterThan(-1);
    expect(curator).toBeGreaterThan(seed);
  });
});
