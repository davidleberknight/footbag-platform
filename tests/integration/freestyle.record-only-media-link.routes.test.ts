/**
 * A media hashtag on a browse card is clickable only when the trick has curated
 * tutorial or demo media in its gallery. A trick whose only footage is a
 * competition record's own video has no curated gallery item, so its hashtag
 * renders as a plain, non-clickable token; making it a link would dead-end on an
 * empty gallery. A trick with curated media keeps its clickable hashtag, and the
 * destination it points at holds at least one media item. This mirrors the
 * trick-detail page, which links its gallery only when a non-record reference
 * media item exists.
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
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3779');

let createApp: Awaited<ReturnType<typeof importApp>>;

// Three coverage states, each a single-token slug so the record's trick_name
// slugifies back onto its trick with no abbreviation ambiguity.
const RECORD_ONLY = 'recordonlytrick';
const CURATED     = 'curatedmediatrick';
const NO_MEDIA    = 'nomediatrick';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const uploader = insertMember(db, { id: 'm-fbh1', slug: 'fbh1_uploader' });

  for (const slug of [RECORD_ONLY, CURATED, NO_MEDIA]) {
    insertFreestyleTrick(db, {
      slug, canonical_name: slug, adds: '3',
      base_trick: slug, trick_family: slug, category: 'compound',
      review_status: 'expert_reviewed', is_active: 1,
      operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
    });
  }

  // Record-only: a competition record carries its own video, but no curated
  // media item is tagged to the trick. Coverage classifies as 'record'.
  insertFreestyleRecord(db, {
    trick_name: RECORD_ONLY,
    video_url: 'https://www.youtube.com/watch?v=recordvid1',
    value_numeric: 42,
  });

  // Curated: a tutorial-tier media item tagged to the trick. Coverage is
  // 'tutorial', so the gallery is non-empty and the hashtag links to it.
  insertTtLesson(db, {
    uploader_member_id: uploader,
    ttNumber: 1,
    trickSlug: CURATED,
    videoId: 'curatedvid1',
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

describe('GET /freestyle/tricks — browse-card media hashtag reflects curated coverage', () => {
  it('a record-only trick renders its hashtag as a plain token, not a gallery link', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // The trick appears (its hashtag token is present) ...
    expect(res.text).toContain(`#${RECORD_ONLY}`);
    // ... but the token is not a clickable gallery link, because a record's own
    // video is not curated gallery media.
    expect(res.text).not.toContain(galleryHref(RECORD_ONLY));
  });

  it('a curated-media trick keeps its clickable gallery hashtag', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toContain(galleryHref(CURATED));
  });

  it('a no-media trick shows no clickable media signal', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toContain(`#${NO_MEDIA}`);
    expect(res.text).not.toContain(galleryHref(NO_MEDIA));
  });

  it('the destination reached from a clickable hashtag holds at least one media item', async () => {
    const res = await request(await createApp()).get(`/media/browse?context=${CURATED}`);
    expect(res.status).toBe(200);
    // The curated gallery for this trick surfaces its tutorial clip.
    expect(res.text).toContain('curatedvid1');
  });
});
