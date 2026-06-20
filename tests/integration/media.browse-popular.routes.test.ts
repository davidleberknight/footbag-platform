/**
 * The /media/browse landing (no query) leads with discovery: the Popular-tags
 * chip cloud renders the real most-used public tags and precedes the filter
 * form. The old hardcoded "Try one" fallback chips are gone now that popular
 * tags populate from curated/system content.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertTag, insertMediaItem } from '../fixtures/factories';

const { dbPath } = setTestEnv('3075');
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
  // Single curator/system account: its catalog tags are public and popular.
  const curator = insertMember(db, {
    id: 'member-curator', slug: 'footbag_hacky', is_system: 1,
    login_email: 'curator@example.com', real_name: 'Footbag Hacky', display_name: 'Footbag Hacky',
  });
  const tag = insertTag(db, { id: 'tag-pbr', tag_normalized: '#passback_records', tag_display: '#passback_records' });
  for (let i = 0; i < 3; i += 1) {
    const m = insertMediaItem(db, { uploader_member_id: curator, caption: `curated-${i}` });
    insertMediaTag(db, `mt-${i}`, m, tag, '#passback_records');
  }
  db.close();

  createApp = await importApp();
  // Populate tag_stats so the discovery surface has data, mirroring the seed/reset flow.
  const mod = await import('../../src/services/hashtagDiscoveryService');
  mod.hashtagDiscoveryService.rebuildTagStats();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media/browse landing — search leads, suggested tags follow', () => {
  it('renders the real curated tag in the Suggested tags section', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Suggested tags');
    expect(res.text).toContain('#passback_records');
  });

  it('drops the hardcoded fallback chips and the separate club/event sections', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(res.text).not.toContain('/media/browse?tag=demo_net');
    expect(res.text).not.toContain('Try one:');
    expect(res.text).not.toContain('browse-standard-section');
  });

  it('leads with the search form, ahead of the suggested tags', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(res.text.indexOf('browse-search-form')).toBeGreaterThan(-1);
    expect(res.text.indexOf('browse-search-form')).toBeLessThan(res.text.indexOf('browse-popular-section'));
  });
});
