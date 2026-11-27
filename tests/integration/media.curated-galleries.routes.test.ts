/**
 * The /media hub Curated galleries card and the curated-galleries list page.
 *
 * The list holds the system member's named galleries that have at least one
 * matching item, entry for entry like the member-galleries list but with no
 * owner line, and never a member's gallery, a default gallery or an empty
 * one. The member-galleries list in turn never shows a curated gallery. The
 * literal path is served as the list, never read as a gallery id.
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

const { dbPath } = setTestEnv('7502');

const LIST = '/media/curated-galleries';
const MEMBER_LIST = '/media/member-galleries';
const SYSTEM_ID = 'curated-list-system';
const MEMBER_ID = 'curated-list-member';
const MEMBER_NAME = 'Curated List Member';

const CURATED_FULL = 'gallery_curated_full';
const CURATED_FULL_DESCRIPTION = 'Seeded description of the full curated gallery';
const CURATED_EMPTY = 'gallery_curated_empty';
const CURATED_DEFAULT = 'gallery_curated_default';
const MEMBER_FULL = 'gallery_member_full';

let createApp: Awaited<ReturnType<typeof importApp>>;
let page: (path: string) => Promise<request.Response>;
let fillerIds: string[] = [];

// One gallery whose only criterion is its own tag, holding `items` matching
// photos uploaded by the gallery's owner. Returns the gallery id.
function seedGallery(
  db: BetterSqlite3.Database,
  o: { id: string; owner: string; items: number; description?: string; isDefault?: 0 | 1; at?: string },
): string {
  const tagId = insertFreeformTag(db, { tag_normalized: `#${o.id}`, tag_display: `#${o.id}` });
  insertMemberGallery(db, {
    id: o.id, owner_member_id: o.owner, created_by: o.owner, name: `Name ${o.id}`,
    description: o.description ?? '', is_default: o.isDefault ?? 0,
  });
  insertGalleryCriterionTag(db, o.id, tagId);
  for (let i = 0; i < o.items; i++) {
    const mediaId = insertMediaItem(db, { uploader_member_id: o.owner, uploaded_at: o.at ?? '2025-01-01T00:00:00.000Z' });
    attachMediaTag(db, mediaId, tagId);
  }
  return o.id;
}

// The card on a list page that links the given gallery by its title, or ''.
function cardFor(html: string, id: string): string {
  const title = html.indexOf(`href="/media/${id}" class="card-title card-link"`);
  if (title < 0) return '';
  const start = html.lastIndexOf('<div class="card">', title);
  const end = html.indexOf('</div>', title);
  return html.slice(start, end);
}

function titleLinkCount(html: string, id: string): number {
  return html.split(`href="/media/${id}" class="card-title card-link"`).length - 1;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: SYSTEM_ID, slug: 'curated_list_system', is_system: 1, onboarding: 'none' });
  insertMember(db, { id: MEMBER_ID, slug: 'curated_list_member', display_name: MEMBER_NAME });

  // Its newest upload is the latest of all, so it heads page one.
  seedGallery(db, { id: CURATED_FULL, owner: SYSTEM_ID, items: 1, description: CURATED_FULL_DESCRIPTION, at: '2026-06-01T00:00:00.000Z' });
  seedGallery(db, { id: CURATED_EMPTY, owner: SYSTEM_ID, items: 0 });
  seedGallery(db, { id: CURATED_DEFAULT, owner: SYSTEM_ID, items: 1, isDefault: 1 });
  seedGallery(db, { id: MEMBER_FULL, owner: MEMBER_ID, items: 2 });

  // Enough older curated galleries that exactly one spills onto page two. The
  // page size is the service's own, read after the test database is in place.
  const { DEFAULT_MEDIA_PAGE_SIZE: pageSize } = await import('../../src/services/mediaService');
  fillerIds = [];
  for (let i = 0; i < pageSize; i++) {
    const n = String(i).padStart(2, '0');
    const at = new Date(Date.UTC(2020, 0, i + 1)).toISOString();
    fillerIds.push(seedGallery(db, { id: `gallery_curated_filler_${n}`, owner: SYSTEM_ID, items: 1, at }));
  }
  db.close();
  createApp = await importApp();
  page = cachedGet(() => createApp());
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media (hub) with a curated gallery that has items', () => {
  it('links the Curated galleries card to the curated-galleries list', async () => {
    const res = await page('/media');
    expect(res.status).toBe(200);
    // Catches: curated galleries with content but no way to reach their list from the hub.
    expect(res.text).toContain(`href="${LIST}"`);
    // Catches: the new card displacing the member-galleries card it sits beside.
    expect(res.text).toContain(`href="${MEMBER_LIST}"`);
  });
});

describe('GET /media/curated-galleries', () => {
  it('serves the list at the literal path rather than as a gallery id', async () => {
    const res = await page(LIST);
    // Catches: the route registered after /media/:galleryId, so the list 404s as an unknown gallery.
    expect(res.status).toBe(200);
    expect(titleLinkCount(res.text, CURATED_FULL), 'the newest curated gallery heads page one').toBe(1);
  });

  it('shows a curated gallery with its description and item count, and no owner line', async () => {
    const card = cardFor((await page(LIST)).text, CURATED_FULL);
    // Catches: a curated gallery's description never reaching visitors.
    expect(card).toContain(CURATED_FULL_DESCRIPTION);
    // Catches: a curated gallery credited to the system account as if a member owned it.
    expect(card).toMatch(/<p class="card-meta">1 item<\/p>/);
  });

  it('shows the curated gallery\'s cover photo', async () => {
    const card = cardFor((await page(LIST)).text, CURATED_FULL);
    // Catches: curated cards drawn without the cover every gallery list shows.
    expect(card).toContain('class="card-cover"');
  });

  it('leaves out member, default and empty galleries across every page', async () => {
    const [one, two] = await Promise.all([page(LIST), page(`${LIST}?page=2`)]);
    for (const id of [MEMBER_FULL, CURATED_DEFAULT, CURATED_EMPTY]) {
      // Catches: a member's gallery, the auto default gallery or an empty gallery on the curated list.
      expect(titleLinkCount(one.text, id) + titleLinkCount(two.text, id), `${id} not listed`).toBe(0);
    }
    for (const id of [CURATED_FULL, ...fillerIds]) {
      // Catches: a non-empty curated gallery dropped, or shown on both pages.
      expect(titleLinkCount(one.text, id) + titleLinkCount(two.text, id), `${id} listed once`).toBe(1);
    }
  });

  it('pages at the shared page size, oldest gallery on page two, and 404s past the last page', async () => {
    const two = await page(`${LIST}?page=2`);
    expect(two.status).toBe(200);
    // Catches: the curated list ignoring the shared page size or its order.
    expect(titleLinkCount(two.text, fillerIds[0]), 'oldest filler on page two').toBe(1);
    expect((two.text.match(/class="card-title card-link"/g) ?? []).length).toBe(1);
    expect(two.text).toContain(`href="${LIST}" rel="prev"`);
    // Catches: a page past the last rendering an empty list instead of not found.
    expect((await page(`${LIST}?page=3`)).status).toBe(404);
  });
});

describe('GET /media/member-galleries beside curated galleries', () => {
  it('lists the member gallery with its owner and never a curated gallery', async () => {
    const res = await page(MEMBER_LIST);
    expect(res.status).toBe(200);
    // Catches: the shared shaping dropping the member list's owner attribution.
    expect(cardFor(res.text, MEMBER_FULL)).toContain(`2 items by ${MEMBER_NAME}`);
    for (const id of [CURATED_FULL, ...fillerIds]) {
      // Catches: the owner-kind parameter inverted or ignored, mixing curated galleries into the member list.
      expect(titleLinkCount(res.text, id), `${id} not on the member list`).toBe(0);
    }
  });
});
