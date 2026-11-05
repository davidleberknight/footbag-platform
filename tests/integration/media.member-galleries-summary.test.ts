/**
 * The member-galleries list and the media hub read every gallery's item count
 * and newest matching upload in a bounded number of statements that does not
 * grow with the number of galleries, and the count each card shows uses the
 * same match the gallery page renders: active, not an avatar, carrying every
 * criteria tag and no exclude tag.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { countStatementsForGet } from '../fixtures/queryCount';
import {
  insertMember,
  insertMemberGallery,
  insertFreeformTag,
  insertGalleryCriterionTag,
  insertGalleryExcludeTag,
  insertMediaItem,
  attachMediaTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3911');

const OWNER_ID = 'summary-gallery-owner';
const LIST = '/media/member-galleries';
const MATCH_GALLERY = 'gallery_summary_match';
const ALL_EXCLUDED_GALLERY = 'gallery_summary_all_excluded';
// Uploads for the match cases sit later than every gallery the statement-count
// case adds, so those galleries always stay on page one.
const MATCH_AT = '2030-01-01T00:00:00.000Z';

let createApp: Awaited<ReturnType<typeof importApp>>;

function writeDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

function tag(db: BetterSqlite3.Database, body: string): string {
  return insertFreeformTag(db, { tag_normalized: `#${body}`, tag_display: `#${body}` });
}

// One member gallery whose only criterion is its own tag, holding one active
// item uploaded at the given instant.
function seedOneItemGallery(db: BetterSqlite3.Database, id: string, at: string): void {
  const tagId = tag(db, id);
  insertMemberGallery(db, { id, owner_member_id: OWNER_ID, created_by: OWNER_ID, name: `Name ${id}` });
  insertGalleryCriterionTag(db, id, tagId);
  attachMediaTag(db, insertMediaItem(db, { uploader_member_id: OWNER_ID, uploaded_at: at }), tagId);
}

// The item count shown on one gallery's card, or null when the card is absent.
function shownCount(html: string, galleryId: string): number | null {
  const m = new RegExp(
    `href="/media/${galleryId}" class="card-title">[^<]*</a>[\\s\\S]*?<p class="card-meta">(\\d+) item`,
  ).exec(html);
  return m ? Number(m[1]) : null;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: OWNER_ID, slug: 'summary_gallery_owner', display_name: 'Summary Owner' });

  // A gallery needing two criteria tags and refusing one exclude tag. Of the
  // items below only the first matches; each other one breaks the match in
  // exactly one way.
  const a = tag(db, 'summary_a');
  const b = tag(db, 'summary_b');
  const x = tag(db, 'summary_x');
  insertMemberGallery(db, { id: MATCH_GALLERY, owner_member_id: OWNER_ID, created_by: OWNER_ID, name: 'Match Gallery' });
  insertGalleryCriterionTag(db, MATCH_GALLERY, a);
  insertGalleryCriterionTag(db, MATCH_GALLERY, b);
  insertGalleryExcludeTag(db, MATCH_GALLERY, x);
  const item = (o: { is_avatar?: 0 | 1; moderation_status?: 'active' | 'removed_by_admin' }, tags: string[]): void => {
    const id = insertMediaItem(db, { uploader_member_id: OWNER_ID, uploaded_at: MATCH_AT, ...o });
    for (const t of tags) attachMediaTag(db, id, t);
  };
  item({}, [a, b]);
  item({}, [a]);
  item({}, [a, b, x]);
  item({ moderation_status: 'removed_by_admin' }, [a, b]);
  item({ is_avatar: 1 }, [a, b]);

  // A gallery whose every tagged item carries its exclude tag shows nothing,
  // so it is left off the list.
  const y = tag(db, 'summary_y');
  const z = tag(db, 'summary_z');
  insertMemberGallery(db, {
    id: ALL_EXCLUDED_GALLERY, owner_member_id: OWNER_ID, created_by: OWNER_ID, name: 'All Excluded Gallery',
  });
  insertGalleryCriterionTag(db, ALL_EXCLUDED_GALLERY, y);
  insertGalleryExcludeTag(db, ALL_EXCLUDED_GALLERY, z);
  item({}, [y, z]);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media/member-galleries item counts', () => {
  it('counts only the items the gallery page would show, and lists no gallery that shows none', async () => {
    const res = await request(createApp()).get(LIST);
    expect(res.status).toBe(200);
    // A card claiming more items than its gallery shows sends a visitor to a
    // gallery smaller than promised: an item missing a criteria tag, carrying
    // the exclude tag, removed by an administrator, or an avatar is not one.
    expect(shownCount(res.text, MATCH_GALLERY), 'the match gallery card and its count').toBe(1);
    // A gallery whose items are all excluded would open onto an empty page.
    expect(res.text).not.toContain(`href="/media/${ALL_EXCLUDED_GALLERY}"`);
  });
});

describe('member gallery reads do not grow with the number of galleries', () => {
  it('GET /media/member-galleries and GET /media read the same statement count for one gallery or many', async () => {
    const app = createApp();
    const urls = [LIST, '/media'];
    // One request at a time: each count spies on the one shared connection.
    const countAll = async (): Promise<number[]> => {
      const counts: number[] = [];
      for (const url of urls) counts.push(await countStatementsForGet(app, url));
      return counts;
    };
    // Warm up so one-time request-path preparation is not counted.
    await countAll();
    const one = await countAll();

    const db = writeDb();
    for (let i = 0; i < 20; i++) {
      seedOneItemGallery(db, `gallery_summary_more_${String(i).padStart(2, '0')}`, new Date(Date.UTC(2020, 0, i + 1)).toISOString());
    }
    db.close();

    const many = await countAll();
    // A per-gallery read makes a page slower with every gallery a member
    // creates, until the list times out for every visitor.
    urls.forEach((url, i) => {
      expect(many[i], `${url}: statement count must not scale with galleries (N+1)`).toBe(one[i]);
    });
  });
});
