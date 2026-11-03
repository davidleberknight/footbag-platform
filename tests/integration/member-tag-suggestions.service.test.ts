/**
 * The popular tags a member's upload and edit forms suggest.
 *
 * `#curated` marks the curator's media and is applied automatically; a member's
 * tag input refuses it. It is also among the most used tags on the site, so a
 * suggestion list built from usage alone would offer a member a tag that their
 * save then rejects. The shared type-ahead ranking keeps it, because on the
 * public browse filters it narrows to the curator's media.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertTag, insertMediaItem, attachMediaTag } from '../fixtures/factories';

const { dbPath } = setTestEnv('4687');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let hashtagDiscoveryService: typeof import('../../src/services/hashtagDiscoveryService').hashtagDiscoveryService;

// Five community tags, each shared by two members: exactly the number of
// suggestions a member is offered, so dropping `#curated` must not cost one.
const COMMUNITY_TAGS = ['#mts_one', '#mts_two', '#mts_three', '#mts_four', '#mts_five'];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const memberA = insertMember(db, { id: 'mts-a', slug: 'mts_a', login_email: 'a@mts.test' });
  const memberB = insertMember(db, { id: 'mts-b', slug: 'mts_b', login_email: 'b@mts.test' });
  const system = insertMember(db, { id: 'mts-system', slug: 'mts_hacky', login_email: 'hacky@mts.test', is_system: 1 });

  const itemA = insertMediaItem(db, { uploader_member_id: memberA, caption: 'A' });
  const itemB = insertMediaItem(db, { uploader_member_id: memberB, caption: 'B' });
  for (const tag of COMMUNITY_TAGS) {
    const tagId = insertTag(db, { tag_normalized: tag, tag_display: tag });
    attachMediaTag(db, itemA, tagId);
    attachMediaTag(db, itemB, tagId);
  }

  // A tag that merely begins "#by" is an ordinary tag; "#by_" alone marks an
  // uploader. Each is on one member's item only, so neither joins the popular set.
  attachMediaTag(db, itemA, insertTag(db, { tag_normalized: '#bypass_kick', tag_display: '#bypass_kick' }));
  attachMediaTag(db, itemA, insertTag(db, { tag_normalized: '#by_mts_a', tag_display: '#by_mts_a' }));

  // The most used tag of all, carried only by the curator's media.
  const curatedTag = insertTag(db, { tag_normalized: '#curated', tag_display: '#curated' });
  for (const caption of ['C1', 'C2', 'C3']) {
    attachMediaTag(db, insertMediaItem(db, { uploader_member_id: system, caption }), curatedTag);
  }
  db.close();

  hashtagDiscoveryService = (await import('../../src/services/hashtagDiscoveryService')).hashtagDiscoveryService;
  hashtagDiscoveryService.rebuildTagStats();
});

afterAll(() => cleanupTestDb(dbPath));

describe('popular tags suggested to a member', () => {
  it('never offers #curated, and still offers the full set of community tags', () => {
    const offered = hashtagDiscoveryService
      .getTagSuggestionsForMember('mts-a', 'mts_a')
      .popularTags.map((t) => t.normalized);
    expect(offered).not.toContain('#curated');
    expect([...offered].sort()).toEqual([...COMMUNITY_TAGS].sort());
  });

  // An underscore is a wildcard in SQL LIKE, so an unescaped "#by_" pattern hid
  // every tag beginning "#by" plus one more character, not only uploader tags.
  it('offers a tag that begins "#by" and never an uploader "#by_" tag', () => {
    const offered = hashtagDiscoveryService.suggestTags('by', 10).map((t) => t.normalized);
    expect(offered).toContain('#bypass_kick');
    expect(offered).not.toContain('#by_mts_a');
  });

  // An entry field asks the type-ahead to leave out what a member cannot apply,
  // while a search field keeps it.
  it('leaves #curated out of the type-ahead for an entry field only', () => {
    expect(hashtagDiscoveryService.suggestTags('cur', 10, { entry: true }).map((t) => t.normalized))
      .not.toContain('#curated');
    expect(hashtagDiscoveryService.suggestTags('cur', 10).map((t) => t.normalized)).toContain('#curated');
  });

  // The same usage ranking feeds the tag type-ahead the public browse filters
  // share, where #curated is a legitimate filter to the curator's media.
  it('leaves #curated in the shared type-ahead ranking the browse filters use', () => {
    const shared = hashtagDiscoveryService.suggestTags('', 10).map((t) => t.normalized);
    expect(shared).toContain('#curated');
  });
});
