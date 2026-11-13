/**
 * The media line on a freestyle set, family and modifier page: the page's own
 * hashtag, linked to the hashtag's gallery with a gallery link beside it when
 * visible media carries the tag, and a plain token otherwise. Media that is not
 * visible, such as a removed item, does not count.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { cachedGet } from '../fixtures/cachedGet';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedStagedFamilies } from '../fixtures/stagedFamilies';
import {
  insertMember,
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreeformTag,
  attachMediaTag,
  insertMemberSubmittedVideo,
} from '../fixtures/factories';
import { hashtagForRole, modifierSurfaceHashtag } from '../../src/services/freestyleRecordShaping';
import { seedStagedSets, stagedSet } from '../fixtures/stagedSets';

const { dbPath } = setTestEnv('4393');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

const UPLOADER = 'member-hashtag-link-001';
const setTag = (slug: string): string => `#set_${stagedSet(slug).slug}`;
const FAMILY_TAG = hashtagForRole('whirl', 'family');
const TEACHING_TAG = modifierSurfaceHashtag('spinning', 'body');
const STUB_TAG = modifierSurfaceHashtag('wbstub', 'body');

let clip = 0;
function clipTagged(db: BetterSqlite3.Database, display: string, moderation: 'active' | 'removed_by_admin'): void {
  clip += 1;
  const id = `media-hashtag-link-${clip}`;
  insertMemberSubmittedVideo(db, {
    id, uploader_member_id: UPLOADER, caption: `clip ${clip}`, videoId: `vid${clip}`,
    moderation_status: moderation,
  });
  const normalized = display.toLowerCase();
  const existing = db.prepare('SELECT id FROM tags WHERE tag_normalized = ?').get(normalized) as { id: string } | undefined;
  const tagId = existing?.id ?? insertFreeformTag(db, {
    id: `tag-${normalized.replace(/[^a-z0-9]/g, '_')}`, tag_normalized: normalized, tag_display: display,
  });
  attachMediaTag(db, id, tagId);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);
  seedStagedSets(db);
  insertMember(db, { id: UPLOADER, slug: 'hashtag_link_uploader', display_name: 'Hashtag Link Uploader' });
  insertFreestyleTrick(db, { slug: 'whirl', canonical_name: 'whirl', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning-whirl', canonical_name: 'spinning whirl', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'wbstub', modifier_name: 'Wbstub', modifier_type: 'body' });

  clipTagged(db, setTag('pixie'), 'active');
  // Only a removed clip carries the fairy set's tag.
  clipTagged(db, setTag('fairy'), 'removed_by_admin');
  clipTagged(db, FAMILY_TAG, 'active');
  clipTagged(db, TEACHING_TAG, 'active');
  clipTagged(db, STUB_TAG, 'active');
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function mediaLineOf(html: string): string {
  return html.match(/<p class="media-line"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
}
const galleryOf = (tag: string): string => `/media/browse?context=${encodeURIComponent(tag.replace(/^#/, '').toLowerCase())}`;

describe('the media line on freestyle set, family and modifier pages', () => {
  // Defect caught: a visitor on a page whose hashtag media carries cannot reach
  // those clips, because the hashtag is plain text with no gallery link.
  it.each([
    ['a set page', '/freestyle/sets/pixie', setTag('pixie')],
    ['a family page', '/freestyle/families/whirl', FAMILY_TAG],
    ['a modifier teaching page', '/freestyle/modifier/spinning', TEACHING_TAG],
    ['a modifier page with no teaching essay', '/freestyle/modifier/wbstub', STUB_TAG],
  ])('links the hashtag and the gallery on %s when media carries it', async (_label, url, tag) => {
    const res = await page(url);
    expect(res.status).toBe(200);
    const line = mediaLineOf(res.text);
    const links = [...line.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replace(/&#x3D;/g, '=').replace(/&amp;/g, '&'));
    expect(line).toContain(tag);
    expect(links).toEqual([galleryOf(tag), galleryOf(tag)]);
  });

  // Defect caught: a hashtag no visible media carries links to an empty
  // gallery, or one only a removed clip carries promises footage that is gone.
  it.each([
    ['nothing carries', '/freestyle/sets/atomic', setTag('atomic')],
    ['only a removed clip carries', '/freestyle/sets/fairy', setTag('fairy')],
  ])('shows the hashtag as a plain token when %s it', async (_label, url, tag) => {
    const res = await page(url);
    expect(res.status).toBe(200);
    const line = mediaLineOf(res.text);
    expect(line).toContain(tag);
    expect(line).not.toContain('href=');
  });

  // Defect caught: the hashtag is still drawn in the hero, where the page rules
  // forbid it, so it shows twice or out of the media line.
  it('draws the hashtag in the media line only, never in the hero', async () => {
    const res = await page('/freestyle/sets/pixie');
    const hero = res.text.match(/<div class="hero[^"]*">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? '';
    expect(hero).not.toContain(setTag('pixie'));
  });
});
