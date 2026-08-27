/**
 * Every hashtag chip on the /media/browse landing leads somewhere with content.
 * The landing is a discovery surface, so a chip that resolves to an empty
 * gallery, or to a tag the platform does not even hold, is the worst possible
 * first click. This crawls the landing and follows every chip it offers:
 * Popular Tags, All Tags and the recent-events highlight alike. A tag only one
 * ordinary member uses stays off the landing entirely, so one person's private
 * vocabulary never becomes a public entry point.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertTag, insertFreeformTag, insertMediaItem, attachMediaTag } from '../fixtures/factories';

const { dbPath } = setTestEnv('3424');

let createApp: Awaited<ReturnType<typeof importApp>>;

/** The two ways a tag page tells the visitor it holds nothing: an empty result
 *  set, and a token the platform has no tag row for at all. */
const DEAD_END_MARKERS = ['No photos or videos found.', 'No media found for:'];

/** Every distinct hashtag destination the landing offers. Handlebars escapes the
 *  '=' in a rendered href, so the entities come back out before matching. */
function chipHrefs(html: string): string[] {
  const decoded = html.replace(/&#x3D;/g, '=').replace(/&amp;/g, '&');
  const found = new Set<string>();
  for (const m of decoded.matchAll(/href="(\/media\/browse\?tag=[^"]+)"/g)) found.add(m[1]);
  return [...found];
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // A curator tag: public because it rides system-owned content, though only
  // one member account carries it.
  const curator = insertMember(db, {
    id: 'member-curator', slug: 'footbag_hacky', is_system: 1,
    login_email: 'curator@example.com', real_name: 'Footbag Hacky', display_name: 'Footbag Hacky',
  });
  const curatorTag = insertFreeformTag(db, { tag_normalized: '#passback_records', tag_display: '#passback_records' });
  attachMediaTag(db, insertMediaItem(db, { uploader_member_id: curator, caption: 'curated' }), curatorTag);

  // A community tag: two distinct ordinary members share it.
  const memberA = insertMember(db, { id: 'member-a', slug: 'player_a', login_email: 'a@example.com', real_name: 'Player A', display_name: 'Player A' });
  const memberB = insertMember(db, { id: 'member-b', slug: 'player_b', login_email: 'b@example.com', real_name: 'Player B', display_name: 'Player B' });
  const communityTag = insertFreeformTag(db, { tag_normalized: '#community_fav', tag_display: '#community_fav' });
  attachMediaTag(db, insertMediaItem(db, { uploader_member_id: memberA, caption: 'a' }), communityTag);
  attachMediaTag(db, insertMediaItem(db, { uploader_member_id: memberB, caption: 'b' }), communityTag);

  // An event tag carrying media, so the recent-events highlight has something
  // to render and its chips are crawled too.
  const eventTag = insertTag(db, { tag_normalized: '#event_2099_test_open', tag_display: '#event_2099_test_open', standard_type: 'event' });
  attachMediaTag(db, insertMediaItem(db, { uploader_member_id: memberA, caption: 'event shot' }), eventTag);

  // One ordinary member's own tag. It carries media, so a live-media check
  // alone would admit it; discovery withholds it because it is personal.
  const personalTag = insertFreeformTag(db, { tag_normalized: '#solo_only', tag_display: '#solo_only' });
  attachMediaTag(db, insertMediaItem(db, { uploader_member_id: memberA, caption: 'mine' }), personalTag);

  db.close();

  createApp = await importApp();
  const mod = await import('../../src/services/hashtagDiscoveryService');
  mod.hashtagDiscoveryService.rebuildTagStats();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media/browse landing — every chip leads to content', () => {
  it('offers the tags real content carries', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(res.status).toBe(200);
    const hrefs = chipHrefs(res.text);
    expect(hrefs).toContain('/media/browse?tag=community_fav');
    expect(hrefs).toContain('/media/browse?tag=passback_records');
    expect(hrefs).toContain('/media/browse?tag=event_2099_test_open');
  });

  it('keeps one member\'s personal tag off the landing', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(chipHrefs(res.text)).not.toContain('/media/browse?tag=solo_only');
  });

  it('follows every chip it offers and finds media behind each one', async () => {
    const landing = await request(createApp()).get('/media/browse');
    const hrefs = chipHrefs(landing.text);
    expect(hrefs.length).toBeGreaterThan(0);

    for (const href of hrefs) {
      const followed = await request(createApp()).get(href);
      expect(followed.status, `${href} did not render`).toBe(200);
      for (const marker of DEAD_END_MARKERS) {
        expect(followed.text, `${href} is a dead end: "${marker}"`).not.toContain(marker);
      }
    }
  });
});
