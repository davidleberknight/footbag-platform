/**
 * Whether a trick has media is one fact, and every surface must give the same
 * answer. The dictionary browse rows and the trick detail page each decide it
 * from their own query, so this suite pins the two together on the cases where
 * they can drift apart.
 *
 * A member-uploaded clip carries no curated source, and it is trick media
 * exactly as a curator-published clip is: it lands in the trick's gallery, so
 * the hashtag must link on both surfaces. A clip whose embed the host has taken
 * down is tagged unavailable and is watchable nowhere, so the hashtag must be a
 * plain token on both surfaces even though the row still exists.
 *
 * The tier vocabulary the chip is classified on is unchanged by any of this,
 * so the suite re-asserts it in the same fixture: a tutorial-source clip still
 * reads as tutorial coverage, and a trick whose only footage is a competition
 * record's own video still renders a plain token, because a record video is not
 * a gallery item and the link would dead-end.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertMember,
  insertFreestyleTrick,
  insertFreestyleRecord,
  insertTtLesson,
  insertMemberSubmittedVideo,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3791');

let createApp: Awaited<ReturnType<typeof importApp>>;

// Single-token slugs so a record's trick_name slugifies back onto its trick
// with no abbreviation ambiguity.
const MEMBER_ONLY   = 'memberclipstrick';
const UNAVAILABLE   = 'deadembedtrick';
const CURATED       = 'curatedmediatrick';
const RECORD_SOURCE = 'recordsourcetrick';
const RECORD_ONLY   = 'recordonlytrick';
const NO_MEDIA      = 'nomediatrick';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const uploader = insertMember(db, { id: 'm-mcp1', slug: 'mcp1_uploader' });

  for (const slug of [MEMBER_ONLY, UNAVAILABLE, CURATED, RECORD_SOURCE, RECORD_ONLY, NO_MEDIA]) {
    insertFreestyleTrick(db, {
      slug, canonical_name: slug, adds: '3',
      base_trick: slug, trick_family: slug, category: 'compound',
      review_status: 'expert_reviewed', is_active: 1,
      operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
    });
  }

  // Member upload: no curated source, tagged with the trick's slug. It is the
  // trick's only footage and it does sit in the trick's gallery.
  insertMemberSubmittedVideo(db, {
    uploader_member_id: uploader,
    videoId: 'membervid1',
    tags: [`#${MEMBER_ONLY}`, '#freestyle', '#trick'],
  });

  // Curated clip whose embed has been taken down. The row survives so a curator
  // can see why it is suppressed, but nothing is watchable behind it.
  insertTtLesson(db, {
    uploader_member_id: uploader,
    ttNumber: 2,
    trickSlug: UNAVAILABLE,
    videoId: 'deadvid1',
    extraTags: ['#unavailable_embed'],
  });

  // Tutorial-tier curated clip: the unchanged baseline for the tier vocabulary.
  insertTtLesson(db, {
    uploader_member_id: uploader,
    ttNumber: 1,
    trickSlug: CURATED,
    videoId: 'curatedvid1',
  });

  // A clip from the competition-records source, tagged to the trick. It is a
  // gallery item like any other, so it counts as the trick's media even though
  // it renders in the records table rather than the reference-media buckets.
  insertTtLesson(db, {
    uploader_member_id: uploader,
    ttNumber: 3,
    trickSlug: RECORD_SOURCE,
    videoId: 'recordsourcevid1',
    source_id: 'passback_records',
  });

  // A competition record carries its own video, but no media item is tagged to
  // the trick, so its gallery is empty.
  insertFreestyleRecord(db, {
    trick_name: RECORD_ONLY,
    video_url: 'https://www.youtube.com/watch?v=recordvid1',
    value_numeric: 42,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Handlebars HTML-escapes '=' to '&#x3D;', so a rendered gallery-link href
// reads href="/media/browse?context&#x3D;<slug>". Matching that exact escaped
// form is what distinguishes a live link from a plain token; the unescaped
// "context=<slug>" never appears in the HTML and would pass vacuously.
const galleryHref = (slug: string) => `/media/browse?context&#x3D;${slug}`;

// The browse row for one trick, so an assertion cannot be satisfied by markup
// belonging to a different trick on the same page.
function browseRow(html: string, slug: string): string {
  const match = html.match(
    new RegExp(`<article class="dict-trick-row[^>]*data-trick-slug="${slug}"[\\s\\S]*?</article>`),
  );
  expect(match, `no browse row rendered for ${slug}`).not.toBeNull();
  return match![0];
}

describe('trick media coverage agrees between the dictionary browse rows and the trick detail page', () => {
  it('a trick whose only clip is a member upload links its hashtag on both surfaces', async () => {
    const app = createApp();

    const browse = await request(app).get('/freestyle/tricks?view=add');
    expect(browse.status).toBe(200);
    const row = browseRow(browse.text, MEMBER_ONLY);
    expect(row).toContain('dict-trick-row-hashtag--media');
    expect(row).toContain(galleryHref(MEMBER_ONLY));

    const detail = await request(app).get(`/freestyle/tricks/${MEMBER_ONLY}`);
    expect(detail.status).toBe(200);
    expect(detail.text).toContain(galleryHref(MEMBER_ONLY));
    expect(detail.text).toContain('See All Videos for');
  });

  it('a trick whose only clip has an unavailable embed renders a plain hashtag on both surfaces', async () => {
    const app = createApp();

    const browse = await request(app).get('/freestyle/tricks?view=add');
    const row = browseRow(browse.text, UNAVAILABLE);
    expect(row).not.toContain('dict-trick-row-hashtag--media');
    expect(row).not.toContain(galleryHref(UNAVAILABLE));
    expect(row).toContain('<span class="dict-trick-row-hashtag"');

    const detail = await request(app).get(`/freestyle/tricks/${UNAVAILABLE}`);
    expect(detail.status).toBe(200);
    expect(detail.text).not.toContain(galleryHref(UNAVAILABLE));
    expect(detail.text).not.toContain('See All Videos for');
  });

  it('a trick whose only clip comes from the competition-records source links its hashtag on both surfaces', async () => {
    const app = createApp();

    const browse = await request(app).get('/freestyle/tricks?view=add');
    const row = browseRow(browse.text, RECORD_SOURCE);
    expect(row).toContain('dict-trick-row-hashtag--media');
    expect(row).toContain(galleryHref(RECORD_SOURCE));

    const detail = await request(app).get(`/freestyle/tricks/${RECORD_SOURCE}`);
    expect(detail.status).toBe(200);
    expect(detail.text).toContain(galleryHref(RECORD_SOURCE));
    expect(detail.text).toContain('See All Videos for');
  });

  it('a trick with no footage at all links nothing on either surface', async () => {
    const app = createApp();

    const browse = await request(app).get('/freestyle/tricks?view=add');
    const row = browseRow(browse.text, NO_MEDIA);
    expect(row).toContain('data-media-coverage="none"');
    expect(row).not.toContain(galleryHref(NO_MEDIA));

    const detail = await request(app).get(`/freestyle/tricks/${NO_MEDIA}`);
    expect(detail.text).not.toContain(galleryHref(NO_MEDIA));
  });
});

describe('the media-coverage tier vocabulary survives the unified existence check', () => {
  it('a tutorial-source clip still classifies as tutorial coverage and links its gallery', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    const row = browseRow(res.text, CURATED);
    expect(row).toContain('data-media-coverage="tutorial"');
    expect(row).toContain(galleryHref(CURATED));
  });

  it('a member upload classifies as demo coverage, never tutorial', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    const row = browseRow(res.text, MEMBER_ONLY);
    expect(row).toContain('data-media-coverage="demo"');
  });

  it('a trick whose only footage is a record video keeps its plain hashtag', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    const row = browseRow(res.text, RECORD_ONLY);
    expect(row).toContain('data-media-coverage="record"');
    expect(row).not.toContain('dict-trick-row-hashtag--media');
    expect(row).not.toContain(galleryHref(RECORD_ONLY));
  });
});
