/**
 * Ordering and paging of the public member-galleries list.
 *
 * The list leads with the gallery whose newest matching item was uploaded most
 * recently, so fresh work rises and abandoned galleries sink, whatever order the
 * galleries were created in. Only active, non-avatar items count toward that
 * instant, the gallery id breaks ties so page boundaries are stable, and the
 * list pages at the shared page size with previous and next links.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { cachedGet } from '../fixtures/cachedGet';
import {
  insertMember,
  insertMemberGallery,
  insertFreeformTag,
  insertGalleryCriterionTag,
  insertMediaItem,
  attachMediaTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3129');

const OWNER_ID = 'order-gallery-owner';
const LIST = '/media/member-galleries';

let createApp: Awaited<ReturnType<typeof importApp>>;
let page: (path: string) => Promise<request.Response>;
let pageSize = 0;
let fillerIds: string[] = [];

// One member gallery whose only criterion is its own tag, with one item per
// upload instant given. Returns the gallery id.
function seedGallery(
  db: BetterSqlite3.Database,
  id: string,
  createdAt: string,
  uploads: Array<{ at: string; removed?: boolean }>,
): string {
  const tagId = insertFreeformTag(db, { tag_normalized: `#${id}`, tag_display: `#${id}` });
  insertMemberGallery(db, { id, owner_member_id: OWNER_ID, created_by: OWNER_ID, created_at: createdAt, name: `Name ${id}` });
  insertGalleryCriterionTag(db, id, tagId);
  for (const u of uploads) {
    const mediaId = insertMediaItem(db, {
      uploader_member_id: OWNER_ID,
      uploaded_at: u.at,
      moderation_status: u.removed ? 'removed_by_admin' : 'active',
    });
    attachMediaTag(db, mediaId, tagId);
  }
  return id;
}

// Positions of the given gallery links in a rendered list, in the order given.
function positions(html: string, ids: string[]): number[] {
  return ids.map((id) => html.indexOf(`href="/media/${id}"`));
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: OWNER_ID, slug: 'order_gallery_owner', display_name: 'Order Owner' });

  // Three galleries whose creation order disagrees with their newest-upload
  // order in every direction: oldest-created-first reads C A B, newest-created
  // first reads B A C, and newest upload first reads A C B.
  seedGallery(db, 'gallery_order_a', '2024-01-01T00:00:00.000Z', [{ at: '2026-09-01T00:00:00.000Z' }]);
  seedGallery(db, 'gallery_order_b', '2026-01-01T00:00:00.000Z', [{ at: '2025-01-01T00:00:00.000Z' }]);
  seedGallery(db, 'gallery_order_c', '2023-01-01T00:00:00.000Z', [
    { at: '2022-01-01T00:00:00.000Z' },
    { at: '2025-06-01T00:00:00.000Z' },
  ]);
  // Its newest item was removed by an administrator, so its active newest
  // upload is older than B's and it ranks after B.
  seedGallery(db, 'gallery_order_d', '2023-06-01T00:00:00.000Z', [
    { at: '2024-06-01T00:00:00.000Z' },
    { at: '2026-10-01T00:00:00.000Z', removed: true },
  ]);

  // Enough older galleries to spill exactly two onto a second page. The page
  // size is the service's own, read after the test database is in place.
  ({ PAGE_SIZE: pageSize } = await import('../../src/services/mediaService'));
  const fillerCount = pageSize - 4 + 2;
  fillerIds = [];
  for (let i = 0; i < fillerCount; i++) {
    const n = String(i).padStart(2, '0');
    // The two newest fillers share an upload instant, so the id decides them.
    const day = Math.min(i, fillerCount - 2) + 1;
    const at = new Date(Date.UTC(2020, 0, day)).toISOString();
    fillerIds.push(seedGallery(db, `gallery_order_filler_${n}`, '2021-01-01T00:00:00.000Z', [{ at }]));
  }
  db.close();
  createApp = await importApp();
  page = cachedGet(() => createApp());
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media/member-galleries ordering', () => {
  it('leads with the newest matching upload, not creation order', async () => {
    const res = await page(LIST);
    expect(res.status).toBe(200);
    const [a, c, b, d] = positions(res.text, ['gallery_order_a', 'gallery_order_c', 'gallery_order_b', 'gallery_order_d']);
    expect(a, 'gallery A listed').toBeGreaterThan(-1);
    // ordering-is-the-contract: newest upload first.
    expect(a).toBeLessThan(c);
    expect(c).toBeLessThan(b);
    expect(b, 'a removed item does not lift its gallery').toBeLessThan(d);
  });

  it('breaks a tie on the newest upload by gallery id, highest first', async () => {
    const res = await page(LIST);
    const last = fillerIds[fillerIds.length - 1];
    const secondLast = fillerIds[fillerIds.length - 2];
    const [hi, lo] = positions(res.text, [last, secondLast]);
    expect(hi, 'tied filler listed on page one').toBeGreaterThan(-1);
    // ordering-is-the-contract: equal instants fall back to id descending.
    expect(hi).toBeLessThan(lo);
  });
});

describe('GET /media/member-galleries paging', () => {
  it('fills page one to the page size and links only forward', async () => {
    const res = await page(LIST);
    const shown = (res.text.match(/class="card-title"/g) ?? []).length;
    expect(shown).toBe(pageSize);
    // Handlebars escapes the `=` in an attribute value.
    expect(res.text).toContain(`href="${LIST}?page&#x3D;2" rel="next"`);
    expect(res.text).not.toContain('rel="prev"');
  });

  it('puts the two oldest galleries on page two, linking back to page one', async () => {
    const res = await page(`${LIST}?page=2`);
    expect(res.status).toBe(200);
    const shown = (res.text.match(/class="card-title"/g) ?? []).length;
    expect(shown).toBe(2);
    for (const id of fillerIds.slice(0, 2)) {
      expect(res.text, `${id} on page two`).toContain(`href="/media/${id}"`);
    }
    expect(res.text).toContain(`href="${LIST}" rel="prev"`);
    expect(res.text).not.toContain('rel="next"');
  });

  it('lists every gallery exactly once across the two pages', async () => {
    const [one, two] = await Promise.all([page(LIST), page(`${LIST}?page=2`)]);
    const all = ['gallery_order_a', 'gallery_order_b', 'gallery_order_c', 'gallery_order_d', ...fillerIds];
    for (const id of all) {
      const link = `href="/media/${id}"`;
      const count = one.text.split(link).length - 1 + two.text.split(link).length - 1;
      expect(count, `${id} listed once`).toBe(1);
    }
  });

  it('returns not found for a page past the last', async () => {
    const res = await page(`${LIST}?page=3`);
    expect(res.status).toBe(404);
  });

  it('reads a malformed or non-positive page as page one', async () => {
    const first = await page(LIST);
    for (const raw of ['abc', '0', '-2']) {
      const res = await page(`${LIST}?page=${raw}`);
      expect(res.status, `page=${raw}`).toBe(200);
      expect(res.text, `page=${raw} matches page one`).toBe(first.text);
    }
  });
});
