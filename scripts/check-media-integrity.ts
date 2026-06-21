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
 * YouTube/Vimeo videos are skipped — they have no stored bytes (the embed lives
 * on the platform; availability is the `#unavailable_embed` mechanism).
 *
 * It additionally asserts that every fixed site-content slot in the typed
 * registry (`src/content/siteMedia.ts`) resolves to a seeded FH media row of the
 * expected kind, carrying its expected tags, with its primary bytes present, so
 * a renamed or un-seeded landing/mosaic/promo asset fails here instead of
 * rendering an empty feature in production.
 *
 * Read-only. Exits 0 when every referenced object resolves, 1 when any are
 * missing, 2 on a setup error.
 */
// Load the same `.env` the app uses, before any module that reads process.env
// (the storage adapter resolves its config — local store dir or S3 bucket — at
// import time, so this must come first).
import 'dotenv/config';
import BetterSqlite3 from 'better-sqlite3';
import { getMediaStorageAdapter } from '../src/adapters/mediaStorageAdapter';
import { allSiteMediaSlots } from '../src/content/siteMedia';

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
  // FH-owned (system member) media row by its stable source filename.
  const slotStmt = db.prepare(`
    SELECT mi.id, mi.media_type, mi.video_id, mi.s3_key_display
    FROM media_items mi
    JOIN members m ON m.id = mi.uploader_member_id
    WHERE mi.source_filename = ? AND m.is_system = 1 AND mi.moderation_status = 'active'
    LIMIT 1
  `);
  const tagStmt = db.prepare(`
    SELECT t.tag_normalized AS tag
    FROM media_tags mt JOIN tags t ON t.id = mt.tag_id
    WHERE mt.media_id = ?
  `);
  const slotChecks = allSiteMediaSlots().map((slot) => {
    const row = slotStmt.get(slot.sourceFilename) as SlotRow | undefined;
    const tags = row ? (tagStmt.all(row.id) as { tag: string }[]).map((r) => r.tag) : [];
    return { slot, row, tags };
  });
  db.close();

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
    if (!row) { slotFailures.push(`  SLOT ${slot.sourceFilename}: no active FH media row`); continue; }
    if (row.media_type !== slot.kind) {
      slotFailures.push(`  SLOT ${slot.sourceFilename}: expected ${slot.kind}, got ${row.media_type}`);
      continue;
    }
    const missingTags = slot.expectedTags.filter((t) => !tags.includes(t.toLowerCase()));
    if (missingTags.length > 0) {
      slotFailures.push(`  SLOT ${slot.sourceFilename}: missing tags ${missingTags.join(' ')}`);
    }
    const key = slot.kind === 'video' ? row.video_id : row.s3_key_display;
    if (!key) {
      slotFailures.push(`  SLOT ${slot.sourceFilename}: row has no stored-bytes key`);
      continue;
    }
    if (!(await adapter.exists(key))) {
      slotFailures.push(`  SLOT ${slot.sourceFilename}: bytes absent (${key})`);
    }
  }

  console.log(
    `check-media-integrity: checked=${rows.length}  missing=${missing}  ` +
    `site-slots=${slotChecks.length}  slot-failures=${slotFailures.length}  ` +
    `(YouTube/Vimeo skipped — no stored bytes)`,
  );
  if (missing > 0 || slotFailures.length > 0) {
    if (samples.length > 0) console.error(samples.join('\n'));
    if (missing > 10) console.error(`  ... and ${missing - 10} more`);
    if (slotFailures.length > 0) console.error(slotFailures.join('\n'));
    console.error(
      `check-media-integrity: FAIL — ${missing} stored media objects absent, ` +
      `${slotFailures.length} site-slot problems.`,
    );
    process.exit(1);
  }
  console.log('check-media-integrity: OK — every referenced object and site-content slot resolves through the adapter.');
}

main().catch((err) => {
  console.error('check-media-integrity: error', err);
  process.exit(2);
});
