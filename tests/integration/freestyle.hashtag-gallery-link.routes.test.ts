/**
 * A freestyle set, family or modifier page carries no hashtag of its own and no
 * gallery line: only a trick has a hashtag. Media still tagged with the
 * prefixed forms those pages once showed (a set, family or operator prefix)
 * must not bring a hashtag or a gallery link back onto them.
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
import { seedStagedSets } from '../fixtures/stagedSets';

const { dbPath } = setTestEnv('4393');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

const UPLOADER = 'member-hashtag-link-001';

let clip = 0;
function clipTagged(db: BetterSqlite3.Database, display: string): void {
  clip += 1;
  const id = `media-hashtag-link-${clip}`;
  insertMemberSubmittedVideo(db, {
    id, uploader_member_id: UPLOADER, caption: `clip ${clip}`, videoId: `vid${clip}`,
    moderation_status: 'active',
  });
  const normalized = display.toLowerCase();
  const tagId = insertFreeformTag(db, {
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

  // Visible media carrying each prefixed form the pages once showed.
  clipTagged(db, '#set_pixie');
  clipTagged(db, '#family_whirl');
  clipTagged(db, '#operator_spinning');
  clipTagged(db, '#operator_wbstub');
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('freestyle set, family and modifier pages carry no hashtag', () => {
  // Defect caught: a set, family or modifier page shows a hashtag, or a gallery
  // link built on one, as if the page had media of its own.
  it.each([
    ['a set page', '/freestyle/sets/pixie', '#set_pixie'],
    ['a family page', '/freestyle/families/whirl', '#family_whirl'],
    ['a modifier teaching page', '/freestyle/modifier/spinning', '#operator_spinning'],
    ['a modifier page with no teaching essay', '/freestyle/modifier/wbstub', '#operator_wbstub'],
  ])('%s renders no media line and no hashtag, though media carries its old tag', async (_label, url, tag) => {
    const res = await page(url);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="media-line"');
    expect(res.text).not.toContain(tag);
    expect(res.text).not.toContain(`context=${tag.slice(1)}`);
  });

  // Defect caught: the operators index shows a prefixed hashtag beside each
  // modifier.
  it('lists the operators without a hashtag beside any of them', async () => {
    const res = await page('/freestyle/operators');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/#(operator|set)_/);
  });
});
