/**
 * media_items (source_id, video_url) uniqueness — the ux_media_items_source_video
 * partial index.
 *
 * A media source's video URL identifies one active media item: two active rows
 * must not share the same (source_id, video_url) when both are set. The curator
 * seed path upserts by a deterministic id, so it never duplicates by
 * construction; this index is the deterministic guard for every other write
 * path. Member-submitted URL videos leave source_id NULL and sit outside the
 * pair, so the guard never blocks a member submission.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertTtLesson, insertMemberSubmittedVideo } from '../fixtures/factories';

const { dbPath } = setTestEnv('3172');

let db: ReturnType<typeof createTestDb>;
let uploader: string;

beforeAll(() => {
  db = createTestDb(dbPath);
  uploader = insertMember(db, { id: 'mem-uploader', slug: 'uploader' });
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('media_items (source_id, video_url) uniqueness', () => {
  it('rejects a second active row with the same non-null (source_id, video_url)', () => {
    insertTtLesson(db, { uploader_member_id: uploader, ttNumber: 1, trickSlug: 'knee-stall', videoId: 'DUPVID', id: 'm1' });
    // Same source (tt_youtube) + same video URL, different id -> the partial
    // unique index rejects it (not a PK collision).
    expect(() =>
      insertTtLesson(db, { uploader_member_id: uploader, ttNumber: 2, trickSlug: 'toe-stall', videoId: 'DUPVID', id: 'm2' }),
    ).toThrow(/UNIQUE constraint failed/i);
  });

  it('allows a distinct video_url under the same source', () => {
    expect(() =>
      insertTtLesson(db, { uploader_member_id: uploader, ttNumber: 3, trickSlug: 'clipper', videoId: 'OTHERVID', id: 'm3' }),
    ).not.toThrow();
  });

  it('does not constrain member submissions (source_id NULL): two NULL-source rows with the same URL both land', () => {
    insertMemberSubmittedVideo(db, { uploader_member_id: uploader, videoId: 'MEMBERVID', id: 'mv1' });
    expect(() =>
      insertMemberSubmittedVideo(db, { uploader_member_id: uploader, videoId: 'MEMBERVID', id: 'mv2' }),
    ).not.toThrow();
    const row = db.prepare('SELECT COUNT(*) AS c FROM media_items WHERE video_url = ?')
      .get('https://www.youtube.com/watch?v=MEMBERVID') as { c: number };
    expect(row.c).toBe(2);
  });

  it('guards a member submission that DOES set a non-null source_id (a future write path)', () => {
    insertMemberSubmittedVideo(db, { uploader_member_id: uploader, videoId: 'SRCVID', source_id: 'anz_trikz', id: 'sv1' });
    expect(() =>
      insertMemberSubmittedVideo(db, { uploader_member_id: uploader, videoId: 'SRCVID', source_id: 'anz_trikz', id: 'sv2' }),
    ).toThrow(/UNIQUE constraint failed/i);
  });

  it('does not block re-adding a URL after the prior row is no longer active', () => {
    insertMemberSubmittedVideo(db, { uploader_member_id: uploader, videoId: 'READDVID', source_id: 'anz_trikz', id: 'ra1', moderation_status: 'removed_by_admin' });
    // The active-scoped index ignores the non-active row, so an active row with
    // the same (source_id, video_url) is allowed.
    expect(() =>
      insertMemberSubmittedVideo(db, { uploader_member_id: uploader, videoId: 'READDVID', source_id: 'anz_trikz', id: 'ra2' }),
    ).not.toThrow();
  });
});
