/**
 * Popular tags surface the most-used PUBLIC tags for media discovery: a tag is
 * public when 2+ distinct members use it (community adoption) OR it appears on
 * curator/system-uploaded content. A single non-system member's personal tags
 * stay out so they never leak into discovery. This pins the curated-catalog
 * case: a tag used only by the single system curator account must still appear,
 * even though its distinct-member count is one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertTag, insertMediaItem } from '../fixtures/factories';

const { dbPath } = setTestEnv('3074');
const TS = '2025-01-01T00:00:00.000Z';

function insertMediaTag(db: BetterSqlite3.Database, id: string, mediaId: string, tagId: string, tagDisplay: string): void {
  db.prepare(`
    INSERT INTO media_tags (
      id, created_at, created_by, updated_at, updated_by, version,
      media_id, tag_id, tag_display
    ) VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?)
  `).run(id, TS, TS, mediaId, tagId, tagDisplay);
}

let hashtagDiscoveryService: typeof import('../../src/services/hashtagDiscoveryService').hashtagDiscoveryService;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // The single curator/system account: all its content is public by design.
  const curator = insertMember(db, {
    id: 'member-curator', slug: 'footbag_hacky', is_system: 1,
    login_email: 'curator@example.com', real_name: 'Footbag Hacky', display_name: 'Footbag Hacky',
  });
  const memberA = insertMember(db, { id: 'member-a', slug: 'member_a', login_email: 'a@example.com', display_name: 'Member A' });
  const memberB = insertMember(db, { id: 'member-b', slug: 'member_b', login_email: 'b@example.com', display_name: 'Member B' });

  // Curated tag carried only by the single system uploader (the catalog case
  // that the old community-only rule wrongly excluded). Most-used.
  const tagCurated = insertTag(db, { id: 'tag-curated', tag_normalized: '#passback_records', tag_display: '#passback_records' });
  // Community tag used by two distinct members.
  const tagCommunity = insertTag(db, { id: 'tag-community', tag_normalized: '#community_combo', tag_display: '#community_combo' });
  // Personal tag used by a single non-system member: must stay private.
  const tagPersonal = insertTag(db, { id: 'tag-personal', tag_normalized: '#my_private_tag', tag_display: '#my_private_tag' });
  // Uploader tag: always excluded.
  const tagBy = insertTag(db, { id: 'tag-by', tag_normalized: '#by_member_a', tag_display: '#by_member_a' });

  // Three system-uploaded items carry the curated tag (usage_count = 3).
  for (let i = 0; i < 3; i += 1) {
    const m = insertMediaItem(db, { uploader_member_id: curator, caption: `curated-${i}` });
    insertMediaTag(db, `mt-cur-${i}`, m, tagCurated, '#passback_records');
  }
  // Two items from two different members carry the community tag (usage_count = 2).
  const mA = insertMediaItem(db, { uploader_member_id: memberA, caption: 'a-combo' });
  const mB = insertMediaItem(db, { uploader_member_id: memberB, caption: 'b-combo' });
  insertMediaTag(db, 'mt-a-combo', mA, tagCommunity, '#community_combo');
  insertMediaTag(db, 'mt-b-combo', mB, tagCommunity, '#community_combo');
  // One item from a single member carries the personal tag, plus the #by_ tag.
  insertMediaTag(db, 'mt-a-personal', mA, tagPersonal, '#my_private_tag');
  insertMediaTag(db, 'mt-a-by', mA, tagBy, '#by_member_a');

  db.close();

  const mod = await import('../../src/services/hashtagDiscoveryService');
  hashtagDiscoveryService = mod.hashtagDiscoveryService;
});

afterAll(() => cleanupTestDb(dbPath));

describe('hashtagDiscoveryService.getPopularTags (public usage incl. curated)', () => {
  it('includes a curated tag carried only by the single system uploader', () => {
    hashtagDiscoveryService.rebuildTagStats();
    const normalized = hashtagDiscoveryService.getPopularTags(20).map((t) => t.normalized);
    expect(normalized).toContain('#passback_records');
  });

  it('includes a community tag used by 2+ members', () => {
    hashtagDiscoveryService.rebuildTagStats();
    const normalized = hashtagDiscoveryService.getPopularTags(20).map((t) => t.normalized);
    expect(normalized).toContain('#community_combo');
  });

  it('excludes a single non-system member personal tag (privacy preserved)', () => {
    hashtagDiscoveryService.rebuildTagStats();
    const normalized = hashtagDiscoveryService.getPopularTags(20).map((t) => t.normalized);
    expect(normalized).not.toContain('#my_private_tag');
  });

  it('excludes uploader (#by_*) tags', () => {
    hashtagDiscoveryService.rebuildTagStats();
    const normalized = hashtagDiscoveryService.getPopularTags(20).map((t) => t.normalized);
    expect(normalized).not.toContain('#by_member_a');
  });

  it('orders by usage_count, so the most-used tag leads', () => {
    hashtagDiscoveryService.rebuildTagStats();
    const normalized = hashtagDiscoveryService.getPopularTags(20).map((t) => t.normalized);
    // Curated tag (usage 3) ranks ahead of the community tag (usage 2).
    expect(normalized.indexOf('#passback_records')).toBeLessThan(normalized.indexOf('#community_combo'));
  });
});
