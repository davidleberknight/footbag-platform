/**
 * Integration tests for a trick's Media section (GET /freestyle/tricks/:slug).
 * The trick page does not embed reference videos or an in-page filter; it links
 * to the trick's video gallery, where the clips are watched and filtered. The
 * link uses the locked `?context=<slug>` convention (matching club / event /
 * member gallery links).
 *
 * Covers: the Media section links to the gallery when the trick has reference
 * media (single- or multi-clip); no inline clips, filter bar, or embedded
 * players render on the trick page itself.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertFreestyleTrick, insertTtLesson } from '../fixtures/factories';

const { dbPath } = setTestEnv('3141');

let createApp: Awaited<ReturnType<typeof importApp>>;
const TS = '2026-04-29T12:00:00.000Z';

function upsertTag(db: BetterSqlite3.Database, display: string): string {
  const normalized = display.toLowerCase();
  const id = `tag-${normalized.replace(/[^a-z0-9]/g, '_')}`;
  db.prepare(`
    INSERT OR IGNORE INTO tags (id, created_at, created_by, updated_at, updated_by, version, tag_normalized, tag_display)
    VALUES (?, ?, 'test', ?, 'test', 1, ?, ?)
  `).run(id, TS, TS, normalized, display);
  return id;
}

function attachTag(db: BetterSqlite3.Database, mediaId: string, display: string): void {
  const tagId = upsertTag(db, display);
  db.prepare(`
    INSERT INTO media_tags (id, created_at, created_by, updated_at, updated_by, version, media_id, tag_id, tag_display)
    VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?)
  `).run(`mt-${mediaId}-${tagId}`, TS, TS, mediaId, tagId, display);
}

// A member-uploaded YouTube clip: no curator source_id and no #curated tag,
// carrying the trick slug plus the uploader marker.
function insertMemberClip(db: BetterSqlite3.Database, o: { id: string; uploader: string; slug: string; bySlug: string; caption: string; videoId: string }): void {
  db.prepare(`
    INSERT INTO media_items (
      id, created_at, created_by, updated_at, updated_by, version,
      uploader_member_id, media_type, is_avatar, caption, uploaded_at,
      video_platform, video_id, video_url, thumbnail_url, moderation_status
    ) VALUES (?, ?, 'test', ?, 'test', 1, ?, 'video', 0, ?, ?, 'youtube', ?, ?, NULL, 'active')
  `).run(o.id, TS, TS, o.uploader, o.caption, TS, o.videoId, `https://www.youtube.com/watch?v=${o.videoId}`);
  attachTag(db, o.id, `#${o.slug}`);
  attachTag(db, o.id, `#by_${o.bySlug}`);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const curator = insertMember(db, { id: 'member-reffilter-sys-001', slug: 'reffilter_system', is_system: 1, display_name: 'Footbag Hacky' });
  const member = insertMember(db, { id: 'member-reffilter-reg-001', slug: 'reffilter_regular', display_name: 'Ref Filter Regular' });

  insertFreestyleTrick(db, { slug: 'ripwalk', canonical_name: 'ripwalk', adds: '3', description: 'core ripwalk', notation: 'RIPWALK', sort_order: 40 });

  // Seed the curator clip's media-source row with creator + URL so the
  // attribution join surfaces them (insertTtLesson's OR IGNORE keeps this row).
  db.prepare(`
    INSERT OR IGNORE INTO media_sources (source_id, source_name, source_type, url, creator)
    VALUES ('tt_youtube', 'Tricks of the Trade', 'youtube', 'https://example.com/tt', 'Honza Weber')
  `).run();

  // Curator clips (TT tutorial-tier, carry #curated). The first carries the
  // attribution source; several so the reference set is content-worthy (the
  // filter only shows when the set is large enough and #curated splits it).
  const curated = insertTtLesson(db, { uploader_member_id: curator, ttNumber: 800, trickSlug: 'ripwalk', videoId: 'rw-curated', lessonTitle: 'Ripwalk Curated' });
  attachTag(db, curated, '#curated');
  for (let i = 1; i <= 4; i++) {
    const c = insertTtLesson(db, { uploader_member_id: curator, ttNumber: 800 + i, trickSlug: 'ripwalk', videoId: `rw-curated-${i}`, lessonTitle: `Ripwalk Curated ${i}` });
    attachTag(db, c, '#curated');
  }

  // Member upload tagged with the trick (no curator source, no #curated): the
  // community side of the curated-vs-community split.
  insertMemberClip(db, { id: 'media-reffilter-member-001', uploader: member, slug: 'ripwalk', bySlug: 'reffilter_regular', caption: 'member-ripwalk-clip', videoId: 'rw-member' });

  // A trick with a single reference video: the filter must NOT render (nothing
  // to split, set too small) — the one-video-trick noise regression.
  insertFreestyleTrick(db, { slug: 'lonely-trick', canonical_name: 'lonely trick', adds: '2', description: 'one clip', notation: 'LONELY', sort_order: 41 });
  const lonely = insertTtLesson(db, { uploader_member_id: curator, ttNumber: 900, trickSlug: 'lonely-trick', videoId: 'lonely-1', lessonTitle: 'Lonely Clip' });
  attachTag(db, lonely, '#curated');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — Media section links to the gallery', () => {
  it('links to the trick gallery (?context=<slug>) with no inline media, filter bar, or embedded player', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/ripwalk');
    expect(res.status).toBe(200);
    // Links to the trick's full video gallery using the locked-context convention.
    expect(res.text).toContain('See All Videos for');
    expect(res.text).toContain('href="/media/browse?context&#x3D;ripwalk"');
    // The trick page no longer embeds clips, an in-page filter, or players.
    expect(res.text).not.toContain('class="tag-filter-bar"');
    expect(res.text).not.toContain('Ripwalk Curated');
    expect(res.text).not.toContain('member-ripwalk-clip');
    expect(res.text).not.toContain('youtube-nocookie');
  });

  it('links to the gallery even for a single-video trick (still no inline clip)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/lonely-trick');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/media/browse?context&#x3D;lonely-trick"');
    expect(res.text).not.toContain('Lonely Clip');
    expect(res.text).not.toContain('class="tag-filter-bar"');
  });
});
