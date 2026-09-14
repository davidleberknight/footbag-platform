/**
 * mediaService.getMemberProfileMedia shapes the profile Media section: a member's
 * named galleries as link cards (name, item count, gallery URL) plus a view-all
 * link. The auto-default Personal Gallery is excluded; the view-all link appears
 * only when the member has uploads; hasContent gates whether the section renders.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import {
  insertMember,
  insertTag,
  insertMediaItem,
  insertMemberGallery,
  insertGalleryCriterionTag,
  attachMediaTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3079');

function insertGallery(d: BetterSqlite3.Database, id: string, ownerId: string, name: string, isDefault: 0 | 1): void {
  insertMemberGallery(d, {
    id,
    owner_member_id: ownerId,
    name,
    description: '',
    is_default: isDefault,
    sort_order: 'upload_desc',
  });
}

let mediaService: typeof import('../../src/services/mediaService').mediaService;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // A: named gallery matching 2 uploads, plus an auto Personal Gallery.
  insertMember(db, { id: 'mem-a', slug: 'mem_a', login_email: 'a@e.com', display_name: 'A' });
  const m1 = insertMediaItem(db, { uploader_member_id: 'mem-a', caption: 'a1' });
  const m2 = insertMediaItem(db, { uploader_member_id: 'mem-a', caption: 'a2' });
  const tagA = insertTag(db, { id: 'tag-a-faves', tag_normalized: '#a_faves', tag_display: '#a_faves' });
  insertGallery(db, 'gal-a-faves', 'mem-a', 'A Faves', 0);
  insertGalleryCriterionTag(db, 'gal-a-faves', tagA);
  attachMediaTag(db, m1, tagA);
  attachMediaTag(db, m2, tagA);
  insertGallery(db, 'gal-a-personal', 'mem-a', 'Personal Gallery', 1);

  // B: uploads but no named gallery.
  insertMember(db, { id: 'mem-b', slug: 'mem_b', login_email: 'b@e.com', display_name: 'B' });
  insertMediaItem(db, { uploader_member_id: 'mem-b', caption: 'b1' });

  // C: nothing.
  insertMember(db, { id: 'mem-c', slug: 'mem_c', login_email: 'c@e.com', display_name: 'C' });

  // D: a named gallery whose criteria match nothing, and no uploads.
  insertMember(db, { id: 'mem-d', slug: 'mem_d', login_email: 'd@e.com', display_name: 'D' });
  const tagD = insertTag(db, { id: 'tag-d-nope', tag_normalized: '#d_nope', tag_display: '#d_nope' });
  insertGallery(db, 'gal-d', 'mem-d', 'D Empty', 0);
  insertGalleryCriterionTag(db, 'gal-d', tagD);

  db.close();
  const mod = await import('../../src/services/mediaService');
  mediaService = mod.mediaService;
});

afterAll(() => cleanupTestDb(dbPath));

describe('mediaService.getMemberProfileMedia', () => {
  it('returns named-gallery cards with counts and hrefs, excluding the Personal Gallery', () => {
    const v = mediaService.getMemberProfileMedia('mem-a', 'mem_a');
    expect(v.galleries).toHaveLength(1);
    expect(v.galleries[0]).toMatchObject({ name: 'A Faves', itemCount: 2, itemCountNoun: 'items', href: '/media/gal-a-faves' });
    expect(v.allMediaHref).toBe('/media/browse?context=by_mem_a');
    expect(v.hasContent).toBe(true);
  });

  it('returns only the view-all link when the member has uploads but no named gallery', () => {
    const v = mediaService.getMemberProfileMedia('mem-b', 'mem_b');
    expect(v.galleries).toHaveLength(0);
    expect(v.allMediaHref).toBe('/media/browse?context=by_mem_b');
    expect(v.hasContent).toBe(true);
  });

  it('has no content when the member has neither galleries nor uploads', () => {
    const v = mediaService.getMemberProfileMedia('mem-c', 'mem_c');
    expect(v.galleries).toHaveLength(0);
    expect(v.allMediaHref).toBeNull();
    expect(v.hasContent).toBe(false);
  });

  it('shows an empty named gallery card but no view-all link when there are no uploads', () => {
    const v = mediaService.getMemberProfileMedia('mem-d', 'mem_d');
    expect(v.galleries).toHaveLength(1);
    expect(v.galleries[0]).toMatchObject({ name: 'D Empty', itemCount: 0, itemCountNoun: 'items' });
    expect(v.allMediaHref).toBeNull();
    expect(v.hasContent).toBe(true);
  });
});
