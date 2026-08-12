/**
 * Media-existence parity between the dictionary browse rows and the trick
 * detail page.
 *
 * Whether a trick has media is one fact, and both surfaces must give the same
 * answer. They ask it in different places — the browse rows through the
 * per-trick coverage query, the detail page through its reference-media query —
 * so the two read one shared view of watchable video rather than each filtering
 * the media table its own way.
 *
 * What "watchable" means, pinned here:
 *   - a member-uploaded clip counts exactly as a curator-published one does;
 *     carrying no media source is not a reason to hide it;
 *   - a clip whose embed has been taken down (tagged '#unavailable_embed')
 *     counts on neither surface, so no control advertises an empty gallery;
 *   - a clip from the competition-records source counts on both, because it
 *     sits in the trick's gallery like any other tagged clip, even though the
 *     detail page keeps it out of the reference-media buckets to avoid
 *     rendering it twice;
 *   - a trick whose only footage lives on a competition record row rather than
 *     in the media library still renders a plain, non-clickable token, because
 *     that gallery genuinely is empty.
 *
 * The tier vocabulary the browse chip classifies on survives all of this and is
 * pinned separately below.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertFreestyleTrick,
  insertFreestyleRecord,
  insertTtLesson,
  insertMemberSubmittedVideo,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3791');
let createApp: Awaited<ReturnType<typeof importApp>>;

// Single-token slugs: the browse row scoping below matches on the slug, and a
// slug that is a prefix of another would make those matches ambiguous.
const MEMBER_ONLY   = 'memberclipstrick';
const UNAVAILABLE   = 'deadembedtrick';
const CURATED       = 'curatedmediatrick';
const RECORD_SOURCE = 'recordsourcetrick';
const RECORD_ONLY   = 'recordonlytrick';
const NO_MEDIA      = 'nomediatrick';

function trick(slug: string) {
  return {
    slug,
    canonical_name: slug,
    adds: '3',
    base_trick: slug,
    trick_family: slug,
    category: 'compound',
    review_status: 'expert_reviewed',
    is_active: 1 as const,
    operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
  };
}

/**
 * The gallery href as Handlebars renders it, with the '=' escaped. Asserting
 * the escaped form proves a rendered link rather than the slug appearing in
 * incidental page text.
 */
function galleryHref(slug: string): string {
  return `/media/browse?context&#x3D;${slug}`;
}

/** The one browse row for a trick, so row assertions cannot match a neighbour. */
function browseRow(html: string, slug: string): string {
  const match = html.match(
    new RegExp(`<article class="dict-trick-row[^>]*data-trick-slug="${slug}"[^>]*>[\\s\\S]*?</article>`),
  );
  if (!match) throw new Error(`no browse row rendered for ${slug}`);
  return match[0];
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  const uploader = insertMember(db, { id: 'm-mcp1', slug: 'mcp1_uploader' });

  insertFreestyleTrick(db, trick(MEMBER_ONLY));
  insertFreestyleTrick(db, trick(UNAVAILABLE));
  insertFreestyleTrick(db, trick(CURATED));
  insertFreestyleTrick(db, trick(RECORD_SOURCE));
  insertFreestyleTrick(db, trick(RECORD_ONLY));
  insertFreestyleTrick(db, trick(NO_MEDIA));

  // Only footage is a member upload: no media source at all.
  insertMemberSubmittedVideo(db, {
    uploader_member_id: uploader,
    videoId: 'membervid1',
    tags: [`#${MEMBER_ONLY}`, '#freestyle', '#trick'],
  });

  // Tutorial-tier source, but the embed has been taken down.
  insertTtLesson(db, {
    uploader_member_id: uploader,
    ttNumber: 2,
    trickSlug: UNAVAILABLE,
    videoId: 'deadvid1',
    extraTags: ['#unavailable_embed'],
  });

  // Ordinary curated tutorial clip.
  insertTtLesson(db, {
    uploader_member_id: uploader,
    ttNumber: 1,
    trickSlug: CURATED,
    videoId: 'curatedvid1',
  });

  // A gallery item whose source is the competition-records channel.
  insertTtLesson(db, {
    uploader_member_id: uploader,
    ttNumber: 3,
    trickSlug: RECORD_SOURCE,
    videoId: 'recordsourcevid1',
    source_id: 'passback_records',
  });

  // Footage on the record row itself; nothing in the media library.
  insertFreestyleRecord(db, {
    trick_name: RECORD_ONLY,
    video_url: 'https://www.youtube.com/watch?v=recordvid1',
    value_numeric: 42,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('trick media coverage agrees between the dictionary browse rows and the trick detail page', () => {
  it('links a trick whose only clip is a member upload, on both surfaces', async () => {
    const app = createApp();

    const browse = await request(app).get('/freestyle/tricks?view=add');
    expect(browse.status).toBe(200);
    const row = browseRow(browse.text, MEMBER_ONLY);
    expect(row).toContain('hashtag--media');
    expect(row).toContain(galleryHref(MEMBER_ONLY));

    const detail = await request(app).get(`/freestyle/tricks/${MEMBER_ONLY}`);
    expect(detail.status).toBe(200);
    expect(detail.text).toContain(galleryHref(MEMBER_ONLY));
    expect(detail.text).toContain('See All Videos for');
  });

  it('renders a plain token when the only clip has an unavailable embed, on both surfaces', async () => {
    const app = createApp();

    const browse = await request(app).get('/freestyle/tricks?view=add');
    const row = browseRow(browse.text, UNAVAILABLE);
    expect(row).not.toContain('hashtag--media');
    expect(row).not.toContain(galleryHref(UNAVAILABLE));
    expect(row).toContain('<span class="hashtag"');

    const detail = await request(app).get(`/freestyle/tricks/${UNAVAILABLE}`);
    expect(detail.status).toBe(200);
    expect(detail.text).not.toContain(galleryHref(UNAVAILABLE));
    expect(detail.text).not.toContain('See All Videos for');
  });

  it('links a trick whose clip comes from the competition-records source, on both surfaces', async () => {
    const app = createApp();

    const browse = await request(app).get('/freestyle/tricks?view=add');
    const row = browseRow(browse.text, RECORD_SOURCE);
    expect(row).toContain('hashtag--media');
    expect(row).toContain(galleryHref(RECORD_SOURCE));

    const detail = await request(app).get(`/freestyle/tricks/${RECORD_SOURCE}`);
    expect(detail.status).toBe(200);
    expect(detail.text).toContain(galleryHref(RECORD_SOURCE));
    expect(detail.text).toContain('See All Videos for');
  });

  it('links nothing for a trick with no footage at all, on both surfaces', async () => {
    const app = createApp();

    const browse = await request(app).get('/freestyle/tricks?view=add');
    const row = browseRow(browse.text, NO_MEDIA);
    expect(row).toContain('data-media-coverage="none"');
    expect(row).not.toContain(galleryHref(NO_MEDIA));

    const detail = await request(app).get(`/freestyle/tricks/${NO_MEDIA}`);
    expect(detail.status).toBe(200);
    expect(detail.text).not.toContain(galleryHref(NO_MEDIA));
  });
});

describe('the media-coverage tier vocabulary survives the unified existence check', () => {
  it('classifies a curated tutorial clip as tutorial coverage and links it', async () => {
    const browse = await request(createApp()).get('/freestyle/tricks?view=add');
    const row = browseRow(browse.text, CURATED);
    expect(row).toContain('data-media-coverage="tutorial"');
    expect(row).toContain(galleryHref(CURATED));
  });

  it('classifies a source-less member upload as demo coverage, never tutorial', async () => {
    const browse = await request(createApp()).get('/freestyle/tricks?view=add');
    const row = browseRow(browse.text, MEMBER_ONLY);
    expect(row).toContain('data-media-coverage="demo"');
  });

  it('keeps a record-row-only trick on the record lane, with no gallery link', async () => {
    const browse = await request(createApp()).get('/freestyle/tricks?view=add');
    const row = browseRow(browse.text, RECORD_ONLY);
    expect(row).toContain('data-media-coverage="record"');
    expect(row).not.toContain('hashtag--media');
    expect(row).not.toContain(galleryHref(RECORD_ONLY));
  });
});
