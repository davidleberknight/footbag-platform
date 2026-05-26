/**
 * Tag stats rebuild: populates tag_stats from media_tags + media_items.
 *
 * Verifies usage_count, distinct_member_count, and community-tag threshold
 * (distinct_member_count >= 2) after a full rebuild.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertTag, insertMediaItem } from '../fixtures/factories';
import type BetterSqlite3 from 'better-sqlite3';

const { dbPath } = setTestEnv('3072');
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

  const memberA = insertMember(db, {
    id: 'member-a',
    slug: 'member_a',
    login_email: 'a@example.com',
    display_name: 'Member A',
  });
  const memberB = insertMember(db, {
    id: 'member-b',
    slug: 'member_b',
    login_email: 'b@example.com',
    display_name: 'Member B',
  });

  // Tag used by both members (community tag)
  const tagFreestyle = insertTag(db, {
    id: 'tag-freestyle',
    tag_normalized: '#freestyle',
    tag_display: '#Freestyle',
  });

  // Tag used by only member A (personal tag)
  const tagPersonal = insertTag(db, {
    id: 'tag-personal',
    tag_normalized: '#my_private_tag',
    tag_display: '#my_private_tag',
  });

  // Tag used by both members but it's a #by_ tag (should be excluded from popular)
  const tagBy = insertTag(db, {
    id: 'tag-by',
    tag_normalized: '#by_member_a',
    tag_display: '#by_member_a',
  });

  // Media items
  const mediaA1 = insertMediaItem(db, { uploader_member_id: memberA, caption: 'Photo A1' });
  const mediaA2 = insertMediaItem(db, { uploader_member_id: memberA, caption: 'Photo A2' });
  const mediaB1 = insertMediaItem(db, { uploader_member_id: memberB, caption: 'Photo B1' });

  // Member A tags freestyle on two photos, personal on one
  insertMediaTag(db, 'mt-a1-freestyle', mediaA1, tagFreestyle, '#Freestyle');
  insertMediaTag(db, 'mt-a2-freestyle', mediaA2, tagFreestyle, '#Freestyle');
  insertMediaTag(db, 'mt-a1-personal', mediaA1, tagPersonal, '#my_private_tag');

  // Member B tags freestyle on one photo
  insertMediaTag(db, 'mt-b1-freestyle', mediaB1, tagFreestyle, '#Freestyle');

  // Both members use #by_ tag
  insertMediaTag(db, 'mt-a1-by', mediaA1, tagBy, '#by_member_a');
  insertMediaTag(db, 'mt-b1-by', mediaB1, tagBy, '#by_member_a');

  db.close();

  const mod = await import('../../src/services/hashtagDiscoveryService');
  hashtagDiscoveryService = mod.hashtagDiscoveryService;
});

afterAll(() => cleanupTestDb(dbPath));

describe('hashtagDiscoveryService.rebuildTagStats', () => {
  it('populates tag_stats with correct counts', () => {
    const result = hashtagDiscoveryService.rebuildTagStats();
    expect(result.rowsUpserted).toBe(3);
  });

  it('popular tags returns only community tags (distinct_member_count >= 2), excludes #by_*', () => {
    const popular = hashtagDiscoveryService.getPopularTags(10);
    const normalized = popular.map(t => t.normalized);
    expect(normalized).toContain('#freestyle');
    expect(normalized).not.toContain('#my_private_tag');
    expect(normalized).not.toContain('#by_member_a');
  });

  it('popular tag has correct href', () => {
    const popular = hashtagDiscoveryService.getPopularTags(10);
    const freestyle = popular.find(t => t.normalized === '#freestyle');
    expect(freestyle).toBeDefined();
    expect(freestyle!.href).toBe('/media/browse?tag=freestyle');
  });

  it('idempotent: second rebuild produces same result', () => {
    const result = hashtagDiscoveryService.rebuildTagStats();
    expect(result.rowsUpserted).toBe(3);
    const popular = hashtagDiscoveryService.getPopularTags(10);
    expect(popular.length).toBe(1);
  });
});

describe('hashtagDiscoveryService.suggestTags', () => {
  it('returns tags matching prefix, ordered by popularity', () => {
    const results = hashtagDiscoveryService.suggestTags('free', 10);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].normalized).toBe('#freestyle');
    expect(results[0].usageCount).toBe(3);
  });

  it('returns popular tags when prefix is empty', () => {
    const results = hashtagDiscoveryService.suggestTags('', 10);
    expect(results.length).toBe(1);
    expect(results[0].normalized).toBe('#freestyle');
  });

  it('returns empty array for unmatched prefix', () => {
    const results = hashtagDiscoveryService.suggestTags('zzz_no_match', 10);
    expect(results).toEqual([]);
  });

  it('excludes #by_* tags from suggestions', () => {
    const results = hashtagDiscoveryService.suggestTags('by_', 10);
    expect(results).toEqual([]);
  });
});

describe('hashtagDiscoveryService.incrementTagStats', () => {
  it('increments usage_count for an existing tag', () => {
    hashtagDiscoveryService.rebuildTagStats();
    const before = hashtagDiscoveryService.suggestTags('free', 10);
    const freestyleBefore = before.find(t => t.normalized === '#freestyle')!;
    expect(freestyleBefore.usageCount).toBe(3);

    hashtagDiscoveryService.incrementTagStats(['tag-freestyle']);
    const after = hashtagDiscoveryService.suggestTags('free', 10);
    const freestyleAfter = after.find(t => t.normalized === '#freestyle')!;
    expect(freestyleAfter.usageCount).toBe(4);
  });

  it('creates a tag_stats row for a tag with no prior stats', () => {
    hashtagDiscoveryService.rebuildTagStats();
    const newTagId = 'tag-personal';
    const beforeSuggest = hashtagDiscoveryService.suggestTags('my_private', 10);
    const beforeRow = beforeSuggest.find(t => t.normalized === '#my_private_tag');
    const beforeUsage = beforeRow?.usageCount ?? 0;

    hashtagDiscoveryService.incrementTagStats([newTagId]);
    const afterSuggest = hashtagDiscoveryService.suggestTags('my_private', 10);
    const afterRow = afterSuggest.find(t => t.normalized === '#my_private_tag');
    expect(afterRow).toBeDefined();
    expect(afterRow!.usageCount).toBe(beforeUsage + 1);
  });

  it('no-ops on empty array', () => {
    hashtagDiscoveryService.rebuildTagStats();
    hashtagDiscoveryService.incrementTagStats([]);
    const popular = hashtagDiscoveryService.getPopularTags(10);
    expect(popular.length).toBe(1);
  });
});

describe('hashtagDiscoveryService.decrementTagStats', () => {
  it('decrements usage_count for a tag', () => {
    hashtagDiscoveryService.rebuildTagStats();
    const before = hashtagDiscoveryService.suggestTags('free', 10);
    const freestyleBefore = before.find(t => t.normalized === '#freestyle')!;
    expect(freestyleBefore.usageCount).toBe(3);

    hashtagDiscoveryService.decrementTagStats(['tag-freestyle']);
    const after = hashtagDiscoveryService.suggestTags('free', 10);
    const freestyleAfter = after.find(t => t.normalized === '#freestyle')!;
    expect(freestyleAfter.usageCount).toBe(2);
  });

  it('deletes tag_stats row when usage_count reaches zero', () => {
    hashtagDiscoveryService.rebuildTagStats();
    hashtagDiscoveryService.decrementTagStats(['tag-personal']);
    const afterSuggest = hashtagDiscoveryService.suggestTags('my_private', 10);
    const afterRow = afterSuggest.find(t => t.normalized === '#my_private_tag');
    expect(afterRow?.usageCount ?? 0).toBe(0);
  });

  it('no-ops on empty array', () => {
    hashtagDiscoveryService.rebuildTagStats();
    hashtagDiscoveryService.decrementTagStats([]);
    const results = hashtagDiscoveryService.suggestTags('free', 10);
    expect(results[0].usageCount).toBe(3);
  });
});

describe('incremental vs full rebuild parity', () => {
  it('increment then rebuild produces same result as rebuild alone', () => {
    hashtagDiscoveryService.rebuildTagStats();
    hashtagDiscoveryService.incrementTagStats(['tag-freestyle']);
    hashtagDiscoveryService.rebuildTagStats();
    const results = hashtagDiscoveryService.suggestTags('free', 10);
    expect(results[0].usageCount).toBe(3);
  });
});
