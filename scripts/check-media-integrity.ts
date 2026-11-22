/**
 * Media storage-integrity check (adapter-backed).
 *
 * Every media_items row that references stored bytes — a photo's thumbnail and
 * display variants, and an S3-hosted video's bytes and poster — must resolve
 * through the MediaStorageAdapter. This catches the metadata-without-bytes state
 * (rows present, objects absent), e.g. after a DB rebuild without the media
 * seed.
 *
 * Adapter-backed on purpose: it asks `adapter.exists(key)`, so it works against
 * S3 (production/staging) and the local store (dev) identically, with no
 * filesystem or `/curated` assumptions, and respects the dev curated read-lane.
 * Linked videos (YouTube, Vimeo, TikTok, Instagram) are skipped here — they have
 * no stored bytes (the video lives on the platform).
 *
 * It additionally asserts that every fixed site-content slot in the typed
 * registry (`src/content/siteMedia.ts`) resolves to a seeded FH media row of the
 * expected kind, carrying its expected tags, with its primary bytes present, so
 * a renamed or un-seeded landing/mosaic/promo asset fails here instead of
 * rendering an empty feature in production.
 *
 * It also holds every video link in the database to the site's video-platform
 * rule: each linked video in media_items, and each freestyle record's video
 * link, must be a YouTube, Vimeo, TikTok or Instagram video link by the shared
 * platform check, and a media row's stored platform must agree with its link.
 * Seeded rows reach the database without passing a form, so this is where an
 * off-platform link in a sidecar or the records file is refused.
 *
 * Read-only. Exits 0 when every referenced object resolves and every video
 * link is on an allowed platform, 1 when any object is missing or any link is
 * off-platform, 2 on a setup error.
 */
// Load the same `.env` the app uses, before any module that reads process.env
// (the storage adapter resolves its config — local store dir or S3 bucket — at
// import time, so this must come first).
import 'dotenv/config';
import BetterSqlite3 from 'better-sqlite3';
import { allSiteMediaSlots, siteMediaSlotIdentity } from '../src/content/siteMedia';
import { parseVideoLink } from '../src/lib/videoPlatforms';

const DB = process.env.FOOTBAG_DB_PATH ?? './database/footbag.db';

interface KeyRow { kind: string; id: string; key: string; }
interface SlotRow {
  id: string;
  media_type: 'photo' | 'video';
  video_id: string | null;
  s3_key_display: string | null;
}

async function main(): Promise<void> {
  const db = new BetterSqlite3(DB, { readonly: true });
  const rows = db.prepare(`
    SELECT 'photo-thumb'   AS kind, id, s3_key_thumb   AS key FROM media_items WHERE media_type='photo' AND moderation_status='active' AND s3_key_thumb   IS NOT NULL
    UNION ALL
    SELECT 'photo-display', id, s3_key_display FROM media_items WHERE media_type='photo' AND moderation_status='active' AND s3_key_display IS NOT NULL
    UNION ALL
    SELECT 's3-video',      id, video_id       FROM media_items WHERE media_type='video' AND moderation_status='active' AND video_platform='s3' AND video_id IS NOT NULL
    UNION ALL
    SELECT 's3-poster',     id, replace(thumbnail_url,'/media-store/','')
                                              FROM media_items WHERE media_type='video' AND moderation_status='active' AND video_platform='s3' AND thumbnail_url LIKE '/media-store/%'
  `).all() as KeyRow[];

  // Site-content slot resolution: each registry slot must resolve to one active
  // FH-owned (system member) media row, a stored slot by its stable source
  // filename and a linked slot by its platform and watch URL.
  const slotStmt = db.prepare(`
    SELECT mi.id, mi.media_type, mi.video_id, mi.s3_key_display
    FROM media_items mi
    JOIN members m ON m.id = mi.uploader_member_id
    WHERE mi.source_filename = ? AND m.is_system = 1 AND mi.moderation_status = 'active'
    LIMIT 1
  `);
  const linkedSlotStmt = db.prepare(`
    SELECT mi.id, mi.media_type, mi.video_id, mi.s3_key_display
    FROM media_items mi
    JOIN members m ON m.id = mi.uploader_member_id
    WHERE mi.video_platform = ? AND mi.video_url = ?
      AND m.is_system = 1 AND mi.moderation_status = 'active'
    ORDER BY mi.id
    LIMIT 1
  `);
  const tagStmt = db.prepare(`
    SELECT t.tag_normalized AS tag
    FROM media_tags mt JOIN tags t ON t.id = mt.tag_id
    WHERE mt.media_id = ?
  `);
  const slotChecks = allSiteMediaSlots().map((slot) => {
    const row = (slot.videoUrl !== undefined
      ? linkedSlotStmt.get(slot.videoPlatform, slot.videoUrl)
      : slotStmt.get(slot.sourceFilename)) as SlotRow | undefined;
    const tags = row ? (tagStmt.all(row.id) as { tag: string }[]).map((r) => r.tag) : [];
    return { slot, row, tags };
  });

  // Every linked video, member and curator alike, and every record video link.
  const linkFailures: string[] = [];
  const linkedVideos = db.prepare(`
    SELECT id, video_platform, video_url FROM media_items
    WHERE media_type = 'video' AND video_platform <> 's3'
  `).all() as { id: string; video_platform: string; video_url: string | null }[];
  for (const v of linkedVideos) {
    const parsed = v.video_url ? parseVideoLink(v.video_url) : null;
    if (!parsed) linkFailures.push(`  OFF-PLATFORM media ${v.id}  ->  ${v.video_url ?? '(no link)'}`);
    else if (parsed.platform !== v.video_platform) {
      linkFailures.push(`  PLATFORM MISMATCH media ${v.id}: stored ${v.video_platform}, link is ${parsed.platform}`);
    }
  }
  const hasRecords = db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'freestyle_records'`,
  ).get() !== undefined;
  const recordVideos = hasRecords
    ? db.prepare(`
        SELECT id, video_url FROM freestyle_records
        WHERE video_url IS NOT NULL AND trim(video_url) <> ''
      `).all() as { id: string; video_url: string }[]
    : [];
  for (const r of recordVideos) {
    if (!parseVideoLink(r.video_url)) linkFailures.push(`  OFF-PLATFORM record ${r.id}  ->  ${r.video_url}`);
  }
  db.close();

  // Imported here rather than at the top of the file so that a configuration
  // failure is caught below and exits 2, a setup error. The adapter resolves its
  // config when the module loads, so a top-level import threw before main ran,
  // the catch never saw it, and the process exited 1 — which is this script's own
  // code for "objects are missing". A caller acting on that told the operator the
  // database referenced absent objects when the check had not run at all.
  const { getMediaStorageAdapter } = await import('../src/adapters/mediaStorageAdapter');
  const adapter = getMediaStorageAdapter();
  let missing = 0;
  const samples: string[] = [];
  for (const r of rows) {
    if (!r.key) continue;
    const ok = await adapter.exists(r.key);
    if (!ok) {
      missing += 1;
      if (samples.length < 10) samples.push(`  MISSING ${r.kind}  ${r.id}  ->  ${r.key}`);
    }
  }

  const slotFailures: string[] = [];
  for (const { slot, row, tags } of slotChecks) {
    const label = siteMediaSlotIdentity(slot);
    if (!row) { slotFailures.push(`  SLOT ${label}: no active FH media row`); continue; }
    if (row.media_type !== slot.kind) {
      slotFailures.push(`  SLOT ${label}: expected ${slot.kind}, got ${row.media_type}`);
      continue;
    }
    const missingTags = slot.expectedTags.filter((t) => !tags.includes(t.toLowerCase()));
    if (missingTags.length > 0) {
      slotFailures.push(`  SLOT ${label}: missing tags ${missingTags.join(' ')}`);
    }
    // A linked slot's video lives on its platform, so it has no stored bytes.
    if (slot.videoUrl !== undefined) continue;
    const key = slot.kind === 'video' ? row.video_id : row.s3_key_display;
    if (!key) {
      slotFailures.push(`  SLOT ${label}: row has no stored-bytes key`);
      continue;
    }
    if (!(await adapter.exists(key))) {
      slotFailures.push(`  SLOT ${label}: bytes absent (${key})`);
    }
  }

  console.log(
    `check-media-integrity: checked=${rows.length}  missing=${missing}  ` +
    `site-slots=${slotChecks.length}  slot-failures=${slotFailures.length}  ` +
    `video-links=${linkedVideos.length + recordVideos.length}  off-platform=${linkFailures.length}  ` +
    `(linked videos have no stored bytes)`,
  );
  if (missing > 0 || slotFailures.length > 0 || linkFailures.length > 0) {
    if (samples.length > 0) console.error(samples.join('\n'));
    if (missing > 10) console.error(`  ... and ${missing - 10} more`);
    if (slotFailures.length > 0) console.error(slotFailures.join('\n'));
    if (linkFailures.length > 0) console.error(linkFailures.join('\n'));
    console.error(
      `check-media-integrity: FAIL — ${missing} stored media objects absent, ` +
      `${slotFailures.length} site-slot problems, ` +
      `${linkFailures.length} video links outside YouTube, Vimeo, TikTok and Instagram.`,
    );
    process.exit(1);
  }
  console.log('check-media-integrity: OK — every referenced object and site-content slot resolves through the adapter, and every video link is on an allowed platform.');
}

main().catch((err) => {
  console.error('check-media-integrity: error', err);
  process.exit(2);
});
