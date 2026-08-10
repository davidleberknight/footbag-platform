/**
 * The hashtag index on the /media/browse landing.
 *
 * There is one place on the site to find media by hashtag. The landing carries
 * the search form, then the hashtag index: Popular tags, a recent-events and
 * tutorials highlight, and an alphabetical All tags list.
 *
 * Two tag populations sit on one page and must not be confused. Popular tags is
 * the public set: a tag shared by two or more distinct members, OR a tag riding
 * curator-published content, so the curated catalog surfaces even though one
 * system account owns it. All tags is narrower, community only, so an
 * alphabetical index is the vocabulary people actually share rather than a dump
 * of the catalog. A tag one ordinary member uses, however often, is personal and
 * appears in neither. Uploader marker tags never appear at all.
 *
 * Event hashtags carry their year, so newest-first is a descending sort on the
 * tag. An event or club hashtag nobody has tagged media with has no gallery
 * behind it, so it is never offered as a destination.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertTag,
  insertFreeformTag,
  attachMediaTag,
  insertMediaItem,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4042');

let createApp: Awaited<ReturnType<typeof importApp>>;

/** The index blocks, in render order, so a test can slice one block out. */
const POPULAR_HEADING = 'id="browse-popular-heading"';
const HIGHLIGHT_HEADING = 'id="browse-highlight-heading"';
const ALL_HEADING = 'id="browse-all-heading"';
const HELP_HEADING = 'id="browse-tags-help-heading"';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  const curator = insertMember(db, {
    id: 'member-curator', slug: 'footbag_hacky', is_system: 1,
    login_email: 'curator@example.com', real_name: 'Footbag Hacky', display_name: 'Footbag Hacky',
  });
  const memberA = insertMember(db, { id: 'member-a', slug: 'member_a', login_email: 'a@example.com', display_name: 'Member A' });
  const memberB = insertMember(db, { id: 'member-b', slug: 'member_b', login_email: 'b@example.com', display_name: 'Member B' });

  // Shared by two members: community, so it belongs in both lists.
  const tagShared = insertFreeformTag(db, { tag_normalized: '#zulu_combo', tag_display: '#zulu_combo' });
  // A second community tag whose normalized form sorts first, to pin ordering.
  const tagSharedEarly = insertFreeformTag(db, { tag_normalized: '#alpha_combo', tag_display: '#alpha_combo' });
  // Curator-published: public, so Popular yes, All tags no.
  const tagCurated = insertFreeformTag(db, { tag_normalized: '#passback_records', tag_display: '#passback_records' });
  // One ordinary member only: personal, so neither list.
  const tagPersonal = insertFreeformTag(db, { tag_normalized: '#my_private_tag', tag_display: '#my_private_tag' });
  // Uploader marker: never in any discovery surface.
  const tagBy = insertFreeformTag(db, { tag_normalized: '#by_member_a', tag_display: '#by_member_a' });
  // Tutorial hashtag, carried by real media.
  const tagTutorial = insertFreeformTag(db, { tag_normalized: '#tutorial', tag_display: '#tutorial' });

  const tagEventOld = insertTag(db, { tag_normalized: '#event_2019_early_open', tag_display: '#event_2019_early_open', standard_type: 'event' });
  const tagEventNew = insertTag(db, { tag_normalized: '#event_2026_late_open', tag_display: '#event_2026_late_open', standard_type: 'event' });
  // An event tag nobody has tagged media with: no gallery behind it, so it is
  // not offered as a destination.
  insertTag(db, { tag_normalized: '#event_2022_unused_open', tag_display: '#event_2022_unused_open', standard_type: 'event' });
  // A club tag with media: the highlight names events and tutorials, not clubs.
  const tagClub = insertTag(db, { tag_normalized: '#club_dunedin', tag_display: '#club_dunedin', standard_type: 'club' });

  const curatedItem = insertMediaItem(db, { uploader_member_id: curator, caption: 'curated-item' });
  attachMediaTag(db, curatedItem, tagCurated);
  attachMediaTag(db, curatedItem, tagTutorial);
  attachMediaTag(db, curatedItem, tagEventOld);
  attachMediaTag(db, curatedItem, tagEventNew);
  attachMediaTag(db, curatedItem, tagClub);

  const itemA = insertMediaItem(db, { uploader_member_id: memberA, caption: 'a-item' });
  const itemB = insertMediaItem(db, { uploader_member_id: memberB, caption: 'b-item' });
  attachMediaTag(db, itemA, tagShared);
  attachMediaTag(db, itemB, tagShared);
  attachMediaTag(db, itemA, tagSharedEarly);
  attachMediaTag(db, itemB, tagSharedEarly);
  attachMediaTag(db, itemA, tagPersonal);
  attachMediaTag(db, itemA, tagBy);

  db.close();

  const mod = await import('../../src/services/hashtagDiscoveryService');
  mod.hashtagDiscoveryService.rebuildTagStats();

  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /media/browse — Popular tags', () => {
  it('serves the index to a signed-out visitor', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(res.status).toBe(200);
    expect(res.text).toContain(POPULAR_HEADING);
  });

  it('includes a curator-published tag even though one system account owns it', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(res.text).toContain('#passback_records');
  });

  it('includes a tag two different members share', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(res.text).toContain('#zulu_combo');
  });

  it('excludes a single member\'s personal tag and every uploader marker', async () => {
    const res = await request(createApp()).get('/media/browse');
    expect(res.text).not.toContain('#my_private_tag');
    expect(res.text).not.toContain('#by_member_a');
  });

  it('links each tag to its media gallery', async () => {
    const res = await request(createApp()).get('/media/browse');
    // Handlebars escapes the query separator, so the rendered attribute carries
    // the entity rather than a bare "=".
    expect(res.text).toContain('href="/media/browse?tag&#x3D;zulu_combo"');
  });
});

describe('GET /media/browse — All tags', () => {
  it('lists community tags alphabetically', async () => {
    const res = await request(createApp()).get('/media/browse');
    const start = res.text.indexOf(ALL_HEADING);
    const end = res.text.indexOf(HELP_HEADING);
    expect(start).toBeGreaterThan(-1);
    const section = res.text.slice(start, end);

    expect(section).toContain('#alpha_combo');
    expect(section).toContain('#zulu_combo');
    expect(section.indexOf('#alpha_combo')).toBeLessThan(section.indexOf('#zulu_combo'));
  });

  it('keeps curator-published tags out, so the index is the shared vocabulary', async () => {
    const res = await request(createApp()).get('/media/browse');
    const start = res.text.indexOf(ALL_HEADING);
    const end = res.text.indexOf(HELP_HEADING);
    const section = res.text.slice(start, end);

    // Public enough for Popular tags, but one uploader is not a community.
    expect(section).not.toContain('#passback_records');
    expect(section).not.toContain('#my_private_tag');
  });
});

describe('GET /media/browse — recent events and tutorials highlight', () => {
  it('orders event hashtags newest first and carries the tutorial tag beside them', async () => {
    const res = await request(createApp()).get('/media/browse');
    const start = res.text.indexOf(HIGHLIGHT_HEADING);
    const end = res.text.indexOf(ALL_HEADING);
    expect(start).toBeGreaterThan(-1);
    const section = res.text.slice(start, end);

    expect(section.indexOf('#event_2026_late_open')).toBeLessThan(section.indexOf('#event_2019_early_open'));
    expect(section).toContain('#tutorial');
  });

  it('omits an event hashtag with no media, and every club hashtag', async () => {
    const res = await request(createApp()).get('/media/browse');
    const start = res.text.indexOf(HIGHLIGHT_HEADING);
    const end = res.text.indexOf(ALL_HEADING);
    const section = res.text.slice(start, end);

    expect(section).not.toContain('#event_2022_unused_open');
    expect(section).not.toContain('#club_dunedin');
  });
});

describe('the hashtag index has one home', () => {
  it('sends the retired index path to the browse landing', async () => {
    const res = await request(createApp()).get('/tags');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/media/browse');
  });

  it('does not capture the autocomplete endpoint', async () => {
    const res = await request(createApp()).get('/tags/suggest?q=zulu');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('lists the browse landing in the XML sitemap, and not the retired path', async () => {
    const res = await request(createApp()).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/media/browse<');
    expect(res.text).not.toContain('/tags<');
  });
});
