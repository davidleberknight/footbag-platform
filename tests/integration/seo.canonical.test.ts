/**
 * The canonical address a public page declares in its head. A paged list or a
 * hashtag result is its own page, so it names itself, keeping only the query
 * parameters that pick it out (the page number and the hashtags that select
 * its set) in one fixed order, and dropping every other parameter. A page with
 * no paging or hashtag selection names its path alone.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';
import { canonicalOf } from '../fixtures/crawl/oracles';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertFreeformTag, insertMediaItem, attachMediaTag, insertSystemConfig,
  insertMemberGallery, insertGalleryCriterionTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3197');
const ORIGIN = 'http://localhost:3197';

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

const OWNER_ID = 'member-canon-owner-001';
// One more item, and one more gallery, than the smallest page size the media
// pages allow, so every list here spans exactly two pages.
const PAGE_SIZE = 12;
const SET_SIZE = PAGE_SIZE + 1;
const FIRST_ITEM = 'media_canon_00';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertSystemConfig(db, {
    config_key: 'media_page_size', value_json: String(PAGE_SIZE), effective_start_at: '2020-01-01T00:00:00.000Z',
  });
  insertMember(db, { id: OWNER_ID, slug: 'canon_owner', display_name: 'Canon Owner' });
  const canonTag = insertFreeformTag(db, { tag_normalized: '#canon', tag_display: '#canon' });
  insertFreeformTag(db, { tag_normalized: '#other', tag_display: '#other' });
  const uploaderTag = insertFreeformTag(db, { tag_normalized: '#by_canon_owner', tag_display: '#by_canon_owner' });

  for (let i = 0; i < SET_SIZE; i++) {
    const id = `media_canon_${String(i).padStart(2, '0')}`;
    insertMediaItem(db, {
      id,
      uploader_member_id: OWNER_ID,
      is_avatar: 0,
      uploaded_at: `2027-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      s3_key_thumb: `${OWNER_ID}/detached/${id}-thumb.jpg`,
      s3_key_display: `${OWNER_ID}/detached/${id}-display.jpg`,
      width_px: 1000,
      height_px: 600,
      moderation_status: 'active',
    });
    attachMediaTag(db, id, canonTag);
    attachMediaTag(db, id, uploaderTag);
    const galleryId = i === 0 ? 'gallery_canon' : `gallery_canon_${String(i).padStart(2, '0')}`;
    insertMemberGallery(db, { id: galleryId, owner_member_id: OWNER_ID, created_by: OWNER_ID, name: `Canon Gallery ${i}` });
    insertGalleryCriterionTag(db, galleryId, canonTag);
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

/** The canonical href as a browser reads it, with the layout's HTML escaping undone. */
async function canonicalFor(path: string): Promise<{ status: number; canonical: string | null; ogUrl: string | null }> {
  const res = await page(path);
  const decode = (s: string | null) => s === null ? null : s
    .replace(/&#x3D;/g, '=').replace(/&amp;/g, '&');
  const og = /<meta\b[^>]*\bproperty="og:url"[^>]*\bcontent="([^"]*)"/i.exec(res.text);
  return { status: res.status, canonical: decode(canonicalOf(res.text)), ogUrl: decode(og ? og[1] : null) };
}

describe('canonical address of paged and hashtag-filtered media pages', () => {
  // Defect caught: page 2 of a hashtag result names the bare browse landing as
  // its canonical, so a search engine drops every hashtag result and every
  // later page, and a share link's tracking parameters leak into the head.
  it('a later page of a hashtag result names itself, without tracking parameters', async () => {
    const r = await canonicalFor('/media/browse?tag=canon&page=2&utm_source=newsletter&fbclid=abc');
    expect(r.status).toBe(200);
    expect(r.canonical).toBe(`${ORIGIN}/media/browse?tag=canon&page=2`);
    expect(r.ogUrl).toBe(r.canonical);
  });

  // Defect caught: two spellings of one result (parameters reordered, a tag
  // repeated or capitalised) declare two canonicals, splitting one page in two.
  it('one result reached by differently spelled addresses names one canonical, in the fixed order', async () => {
    const a = await canonicalFor('/media/browse?exclude=other&tag=Canon&tag=canon');
    const b = await canonicalFor('/media/browse?tag=canon&exclude=other');
    expect(a.status).toBe(200);
    expect(a.canonical).toBe(`${ORIGIN}/media/browse?tag=canon&exclude=other`);
    expect(b.canonical).toBe(a.canonical);
  });

  // Defect caught: an explicit first page declares a second address for the
  // page the pager links to without a page number.
  it('an explicit first page names the address without a page number', async () => {
    const r = await canonicalFor('/media/browse?tag=canon&page=1');
    expect(r.canonical).toBe(`${ORIGIN}/media/browse?tag=canon`);
  });

  // Defect caught: a club, event or trick gallery (a locked context hashtag)
  // names the bare landing, so it is never indexed as its own page.
  it('a context gallery keeps its context hashtag', async () => {
    const r = await canonicalFor('/media/browse?context=canon&page=2');
    expect(r.status).toBe(200);
    expect(r.canonical).toBe(`${ORIGIN}/media/browse?context=canon&page=2`);
  });

  // Defect caught: a named gallery's later pages name its first page, and a
  // parameter that selects nothing is written into the head.
  it('a later page of a named gallery names itself and drops parameters that select nothing', async () => {
    const r = await canonicalFor('/media/gallery_canon?page=2&curated=1&utm_campaign=x');
    expect(r.status).toBe(200);
    expect(r.canonical).toBe(`${ORIGIN}/media/gallery_canon?page=2`);
  });

  // Defect caught: the member-galleries list's later pages name its first page.
  it('a later page of the member-galleries list names itself', async () => {
    const r = await canonicalFor('/media/member-galleries?page=2&ref=home');
    expect(r.status).toBe(200);
    expect(r.canonical).toBe(`${ORIGIN}/media/member-galleries?page=2`);
  });
});

describe('tab title of a hashtag result', () => {
  const titleOf = async (path: string) => /<title>([^<]*)<\/title>/.exec((await page(path)).text)?.[1] ?? null;

  // Defect caught: every hashtag result, each now its own canonical page, shares
  // the landing's tab title, so a search engine reads them as duplicates.
  it('names the hashtags and exclusions that select the result, distinct from the landing', async () => {
    const landing = await titleOf('/media/browse');
    const included = await titleOf('/media/browse?tag=canon');
    const excluded = await titleOf('/media/browse?tag=canon&exclude=other');
    expect(included).toBe('Footbag Browse Media #canon');
    expect(excluded).toBe('Footbag Browse Media #canon without #other');
    expect(new Set([landing, included, excluded]).size).toBe(3);
  });

  // Defect caught: one member's uploads are titled by the raw uploader tag
  // instead of the name the result's header shows every visitor.
  it("names the uploader for one member's uploads", async () => {
    expect(await titleOf('/media/browse?tag=by_canon_owner')).toBe('Footbag Browse Media Canon Owner');
  });
});

describe('canonical address of pages with no paging or hashtag selection', () => {
  // Defect caught: a tracking parameter on the browse landing, which selects
  // no hashtag, is kept and creates a second indexed copy of the landing.
  it('the browse landing names its bare path', async () => {
    const r = await canonicalFor('/media/browse?utm_source=x');
    expect(r.status).toBe(200);
    expect(r.canonical).toBe(`${ORIGIN}/media/browse`);
  });

  // Defect caught: one item reached through different galleries and sort
  // orders declares a canonical per route in, so the item competes with itself.
  it('a media item reached with its gallery context names the item alone', async () => {
    const r = await canonicalFor(`/media/item/${FIRST_ITEM}?tag=canon&sort=upload_desc`);
    expect(r.status).toBe(200);
    expect(r.canonical).toBe(`${ORIGIN}/media/item/${FIRST_ITEM}`);
  });
});
