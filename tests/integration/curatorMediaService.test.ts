/**
 * Integration tests for curatorMediaService — admin upload of curator-attributed
 * photos and videos. Uses real SQLite, stub adapters for storage + image
 * worker + video transcoder so tests run hermetically (no S3, no Sharp,
 * no ffmpeg).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertCuratorUrlReference } from '../fixtures/factories';
import sharp from 'sharp';
import { promises as fsp } from 'fs';
import path from 'path';
import os from 'os';
import type { MediaStorageAdapter } from '../../src/adapters/mediaStorageAdapter';
import type { ImageProcessingAdapter } from '../../src/adapters/imageProcessingAdapter';
import type { TranscodedVideo } from '../../src/lib/videoProcessing';

const { dbPath } = setTestEnv('3091');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svcModule: typeof import('../../src/services/curatorMediaService');

const ADMIN_ID = 'admin-curator-001';
const SYSTEM_ID = 'member_footbag_hacky_test';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'curator_admin', is_admin: 1 });
  insertMember(db, { id: SYSTEM_ID, slug: 'footbag_hacky', is_system: 1, real_name: 'Footbag Hacky', display_name: 'Footbag Hacky' });
  db.close();
  svcModule = await import('../../src/services/curatorMediaService');
});

afterAll(() => cleanupTestDb(dbPath));

// audit_entries has BEFORE DELETE / BEFORE UPDATE triggers blocking row
// removal, so per-test truncation is impossible. Tests are self-isolating:
// each asserts on its own mediaId, unique caption, or unique tag string.
function openDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

// ── Stub adapters ──────────────────────────────────────────────────────────

interface StubStorage extends MediaStorageAdapter {
  puts: Array<{ key: string; bytes: number }>;
  deletes: string[];
  failOnNthPut: number | null;
  failOnDelete: boolean;
}

function makeStubStorage(): StubStorage {
  const puts: Array<{ key: string; bytes: number }> = [];
  const deletes: string[] = [];
  let failOn: number | null = null;
  let failDelete = false;
  const stub: StubStorage = {
    puts,
    deletes,
    get failOnNthPut() { return failOn; },
    set failOnNthPut(v: number | null) { failOn = v; },
    get failOnDelete() { return failDelete; },
    set failOnDelete(v: boolean) { failDelete = v; },
    async put(key, data) {
      if (failOn !== null && puts.length === failOn) {
        throw new Error('stub storage failure');
      }
      puts.push({ key, bytes: data.length });
    },
    async delete(key) {
      if (failDelete) throw new Error('stub storage delete failure');
      deletes.push(key);
    },
    constructURL(key) { return `/media/${key}`; },
    async exists() { return false; },
  };
  return stub;
}

function makeStubImageProcessor(): ImageProcessingAdapter & { calls: { method: 'avatar' | 'photo'; bytes: number }[] } {
  const calls: { method: 'avatar' | 'photo'; bytes: number }[] = [];
  return {
    calls,
    async processAvatar(data) {
      calls.push({ method: 'avatar', bytes: data.length });
      return { thumb: Buffer.from('thumb'), display: Buffer.from('display'), widthPx: 300, heightPx: 300 };
    },
    async processPhoto(data) {
      calls.push({ method: 'photo', bytes: data.length });
      return { thumb: Buffer.from('thumb'), display: Buffer.from('display'), widthPx: 1000, heightPx: 500 };
    },
  };
}

async function makeJpegBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 50, height: 50, channels: 3, background: { r: 80, g: 120, b: 160 } },
  }).jpeg().toBuffer();
}

// Minimal MP4 magic: bytes 4..8 = 'ftyp', 8..12 = anything not 'qt  '. ffmpeg
// is never invoked because we inject `videoTranscoder`.
function makeFakeMp4(): Buffer {
  const buf = Buffer.alloc(32);
  buf.write('ftyp', 4, 'ascii');
  buf.write('isom', 8, 'ascii');
  return buf;
}

function fakeTranscoder(): (buf: Buffer) => Promise<TranscodedVideo> {
  return async () => ({ bytes: Buffer.from('transcoded-mp4'), outputFormat: 'mp4' });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('curatorMediaService.uploadPhoto', () => {
  it('happy path: inserts media_items + media_tags + audit_entries with correct shape', async () => {
    const storage = makeStubStorage();
    const imageProcessor = makeStubImageProcessor();
    const svc = svcModule.createCuratorMediaService({ storage, imageProcessor });
    const jpeg = await makeJpegBuffer();

    const result = await svc.uploadPhoto({
      adminMemberId: ADMIN_ID,
      photoBuffer: jpeg,
      caption: 'A curated photo',
      tags: ['#event_2026_worlds_japan', '#illustration'],
    });

    expect(result.mediaId).toMatch(/^media_/);
    expect(result.displayUrl).toMatch(/^\/media\/.*-display\.jpg$/);
    expect(storage.puts).toHaveLength(2);
    expect(storage.puts[0].key).toMatch(/-thumb\.jpg$/);
    expect(storage.puts[1].key).toMatch(/-display\.jpg$/);

    const db = openDb();
    const mediaRow = db.prepare(`SELECT * FROM media_items WHERE id = ?`).get(result.mediaId) as Record<string, unknown>;
    expect(mediaRow.media_type).toBe('photo');
    expect(mediaRow.is_avatar).toBe(0);
    expect(mediaRow.uploader_member_id).toBe(SYSTEM_ID);
    expect(mediaRow.caption).toBe('A curated photo');
    expect(mediaRow.gallery_id).toBeNull();
    expect(mediaRow.moderation_status).toBe('active');

    const tags = db.prepare(`SELECT t.tag_normalized FROM media_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.media_id = ? ORDER BY t.tag_normalized`).all(result.mediaId);
    // #curated is auto-applied by curatorMediaService for every upload
    // (the FH/admin uploader marker; not hand-written by callers).
    expect(tags).toEqual([
      { tag_normalized: '#curated' },
      { tag_normalized: '#event_2026_worlds_japan' },
      { tag_normalized: '#illustration' },
    ]);

    const audit = db.prepare(`SELECT * FROM audit_entries WHERE entity_id = ?`).get(result.mediaId) as Record<string, unknown>;
    expect(audit.actor_type).toBe('admin');
    expect(audit.actor_member_id).toBe(ADMIN_ID);
    expect(audit.action_type).toBe('upload_curated_media');
    expect(audit.entity_type).toBe('media_item');
    db.close();
  });

  it('rejects caption longer than 500 chars', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    await expect(svc.uploadPhoto({
      adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: 'x'.repeat(501), tags: [],
    })).rejects.toThrow(/Caption must be 500/);
  });

  it('rejects tag without leading "#"', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    await expect(svc.uploadPhoto({
      adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: null, tags: ['no-hash'],
    })).rejects.toThrow(/must start with '#'/);
  });

  it('rejects tag with uppercase', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    await expect(svc.uploadPhoto({
      adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: null, tags: ['#WorldsJapan'],
    })).rejects.toThrow(/must be lowercase/);
  });

  it('rejects non-JPEG/PNG buffer; no storage.put called', async () => {
    const storage = makeStubStorage();
    const svc = svcModule.createCuratorMediaService({ storage, imageProcessor: makeStubImageProcessor() });
    await expect(svc.uploadPhoto({
      adminMemberId: ADMIN_ID, photoBuffer: Buffer.from('plaintext'), caption: null, tags: [],
    })).rejects.toThrow(/Only JPEG and PNG/);
    expect(storage.puts).toHaveLength(0);
  });

  it('rejects oversized photo (>25 MB)', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const oversized = Buffer.alloc(26 * 1024 * 1024);
    // Set valid JPEG magic so the size check fires first.
    oversized[0] = 0xff; oversized[1] = 0xd8; oversized[2] = 0xff;
    await expect(svc.uploadPhoto({
      adminMemberId: ADMIN_ID, photoBuffer: oversized, caption: null, tags: [],
    })).rejects.toThrow(/Photo is too large/);
  });

  it('reuses existing tag row when the same tag is uploaded twice', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    const sharedTag = `#idem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const r1 = await svc.uploadPhoto({ adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: null, tags: [sharedTag] });
    const r2 = await svc.uploadPhoto({ adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: null, tags: [sharedTag] });

    const db = openDb();
    const tagCount = db.prepare(`SELECT COUNT(*) AS n FROM tags WHERE tag_normalized = ?`).get(sharedTag) as { n: number };
    // Per-tag rows: one for sharedTag (across both uploads), one for #curated (auto-applied across both).
    const mediaTagSharedCount = db.prepare(`SELECT COUNT(*) AS n FROM media_tags WHERE media_id IN (?, ?) AND tag_id IN (SELECT id FROM tags WHERE tag_normalized = ?)`).get(r1.mediaId, r2.mediaId, sharedTag) as { n: number };
    expect(tagCount.n).toBe(1);
    expect(mediaTagSharedCount.n).toBe(2);
    db.close();
  });

  it('storage failure on second put leaves no DB rows (atomicity)', async () => {
    const storage = makeStubStorage();
    storage.failOnNthPut = 1; // fail on the second put (display variant)
    const svc = svcModule.createCuratorMediaService({ storage, imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    const uniqueCaption = `ATOMICITY_DOOMED_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const uniqueTag = `#atomicity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await expect(svc.uploadPhoto({
      adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: uniqueCaption, tags: [uniqueTag],
    })).rejects.toThrow(/stub storage failure/);

    const db = openDb();
    const mediaRow = db.prepare(`SELECT id FROM media_items WHERE caption = ?`).get(uniqueCaption);
    const tagRow = db.prepare(`SELECT id FROM tags WHERE tag_normalized = ?`).get(uniqueTag);
    const auditRow = db.prepare(`SELECT id FROM audit_entries WHERE entity_id IN (SELECT id FROM media_items WHERE caption = ?)`).get(uniqueCaption);
    expect(mediaRow).toBeUndefined();
    expect(tagRow).toBeUndefined();
    expect(auditRow).toBeUndefined();
    db.close();
  });

  it('throws non-ValidationError when system member row is missing', async () => {
    // Inject a resolver that simulates the missing-row case. We can't mutate
    // the seeded DB row here because the schema's three-branch credential
    // CHECK forbids flipping is_system=1 → 0 on a row with NULL credentials,
    // and hard-deleting the row trips FK references on existing audit rows.
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(),
      imageProcessor: makeStubImageProcessor(),
      findSystemMemberId: () => null,
    });
    const jpeg = await makeJpegBuffer();
    await expect(svc.uploadPhoto({
      adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: null, tags: [],
    })).rejects.toThrow(/system member/);
  });
});

describe('curatorMediaService.uploadVideo', () => {
  it('happy path: inserts video row with correct video_id + thumbnail_url + audit', async () => {
    const storage = makeStubStorage();
    const imageProcessor = makeStubImageProcessor();
    const svc = svcModule.createCuratorMediaService({
      storage, imageProcessor, videoTranscoder: fakeTranscoder(),
    });
    const mp4 = makeFakeMp4();
    const poster = await makeJpegBuffer();

    const result = await svc.uploadVideo({
      adminMemberId: ADMIN_ID, videoBuffer: mp4, posterBuffer: poster,
      caption: 'demo loop', tags: ['#demo_freestyle'],
    });

    expect(result.mediaId).toMatch(/^media_/);
    expect(storage.puts).toHaveLength(3);
    expect(storage.puts[0].key).toMatch(/-video\.mp4$/);
    expect(storage.puts[1].key).toMatch(/-poster-display\.jpg$/);
    expect(storage.puts[2].key).toMatch(/-poster-thumb\.jpg$/);

    const db = openDb();
    const row = db.prepare(`SELECT * FROM media_items WHERE id = ?`).get(result.mediaId) as Record<string, unknown>;
    expect(row.media_type).toBe('video');
    expect(row.video_platform).toBe('s3');
    expect(row.video_url).toBeNull();
    expect(row.video_id).toMatch(/-video\.mp4$/);
    expect(row.thumbnail_url).toMatch(/^\/media\/.*-poster-display\.jpg$/);
    expect(row.uploader_member_id).toBe(SYSTEM_ID);

    const audit = db.prepare(`SELECT * FROM audit_entries WHERE entity_id = ?`).get(result.mediaId) as Record<string, unknown>;
    expect(audit.actor_type).toBe('admin');
    expect(audit.actor_member_id).toBe(ADMIN_ID);
    expect(audit.action_type).toBe('upload_curated_media');
    db.close();
  });

  it('rejects unsupported video format; transcoder not invoked', async () => {
    let transcoderCalled = false;
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(), imageProcessor: makeStubImageProcessor(),
      videoTranscoder: async () => { transcoderCalled = true; return { bytes: Buffer.alloc(0), outputFormat: 'mp4' }; },
    });
    const poster = await makeJpegBuffer();
    await expect(svc.uploadVideo({
      adminMemberId: ADMIN_ID, videoBuffer: Buffer.from('not-a-video'), posterBuffer: poster,
      caption: null, tags: [],
    })).rejects.toThrow(/Only MP4, WebM, and MOV/);
    expect(transcoderCalled).toBe(false);
  });

  it('rejects non-image poster', async () => {
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(), imageProcessor: makeStubImageProcessor(),
      videoTranscoder: fakeTranscoder(),
    });
    await expect(svc.uploadVideo({
      adminMemberId: ADMIN_ID, videoBuffer: makeFakeMp4(), posterBuffer: Buffer.from('not-an-image'),
      caption: null, tags: [],
    })).rejects.toThrow(/Poster must be a JPEG or PNG/);
  });

  it('rejects oversized video (>150 MB)', async () => {
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(), imageProcessor: makeStubImageProcessor(),
      videoTranscoder: fakeTranscoder(),
    });
    const oversized = Buffer.alloc(151 * 1024 * 1024);
    // Valid mp4 magic so size check fires before format check.
    oversized.write('ftyp', 4, 'ascii');
    oversized.write('isom', 8, 'ascii');
    const poster = await makeJpegBuffer();
    await expect(svc.uploadVideo({
      adminMemberId: ADMIN_ID, videoBuffer: oversized, posterBuffer: poster, caption: null, tags: [],
    })).rejects.toThrow(/Video is too large/);
  });

  it('two parallel uploadVideo calls serialize via the slot-1 semaphore', async () => {
    const order: string[] = [];
    let firstStarted!: () => void;
    const firstStartedP = new Promise<void>((r) => { firstStarted = r; });
    let release!: () => void;
    const blocker = new Promise<void>((r) => { release = r; });

    const slowTranscoder = (label: string) => async () => {
      order.push(`start:${label}`);
      if (label === 'first') {
        firstStarted();
        await blocker;
      }
      order.push(`finish:${label}`);
      return { bytes: Buffer.from(`bytes:${label}`), outputFormat: 'mp4' as const };
    };

    const svcFirst = svcModule.createCuratorMediaService({
      storage: makeStubStorage(), imageProcessor: makeStubImageProcessor(),
      videoTranscoder: slowTranscoder('first'),
    });
    const svcSecond = svcModule.createCuratorMediaService({
      storage: makeStubStorage(), imageProcessor: makeStubImageProcessor(),
      videoTranscoder: slowTranscoder('second'),
    });

    const poster = await makeJpegBuffer();
    const firstP = svcFirst.uploadVideo({
      adminMemberId: ADMIN_ID, videoBuffer: makeFakeMp4(), posterBuffer: poster, caption: null, tags: [],
    });
    await firstStartedP;

    // Kick off second; it must wait at the semaphore.
    const secondP = svcSecond.uploadVideo({
      adminMemberId: ADMIN_ID, videoBuffer: makeFakeMp4(), posterBuffer: poster, caption: null, tags: [],
    });

    // Give the second a moment to potentially start (it should not).
    await new Promise((r) => setTimeout(r, 50));
    expect(order).toEqual(['start:first']);

    release();
    await Promise.all([firstP, secondP]);

    expect(order).toEqual(['start:first', 'finish:first', 'start:second', 'finish:second']);
  });
});

// ── #curated tag rules ─────────────────────────────────────────────────────

describe('curatorMediaService #curated rejection', () => {
  it('uploadPhoto rejects #curated in caller-supplied tags', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    await expect(svc.uploadPhoto({
      adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: null, tags: ['#curated'],
    })).rejects.toThrow(/#curated.*auto-applied/);
  });

  it('uploadVideo rejects #curated in caller-supplied tags', async () => {
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(), imageProcessor: makeStubImageProcessor(), videoTranscoder: fakeTranscoder(),
    });
    const poster = await makeJpegBuffer();
    await expect(svc.uploadVideo({
      adminMemberId: ADMIN_ID, videoBuffer: makeFakeMp4(), posterBuffer: poster,
      caption: null, tags: ['#curated'],
    })).rejects.toThrow(/#curated.*auto-applied/);
  });
});

// ── editMedia ──────────────────────────────────────────────────────────────

describe('curatorMediaService.editMedia', () => {
  it('updates caption only (no tag changes, no S3 traffic)', async () => {
    const storage = makeStubStorage();
    const svc = svcModule.createCuratorMediaService({ storage, imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    const initialCaption = `EDIT_CAPTION_INITIAL_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const r = await svc.uploadPhoto({ adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: initialCaption, tags: ['#alpha'] });
    storage.puts.length = 0;
    storage.deletes.length = 0;

    const updatedCaption = `EDIT_CAPTION_UPDATED_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const result = await svc.editMedia({ adminMemberId: ADMIN_ID, mediaId: r.mediaId, caption: updatedCaption });
    expect(result.mediaId).toBe(r.mediaId);
    expect(storage.puts).toHaveLength(0);
    expect(storage.deletes).toHaveLength(0);

    const db = openDb();
    const row = db.prepare(`SELECT caption FROM media_items WHERE id = ?`).get(r.mediaId) as { caption: string };
    expect(row.caption).toBe(updatedCaption);
    const tags = db.prepare(`SELECT t.tag_normalized FROM media_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.media_id = ? ORDER BY t.tag_normalized`).all(r.mediaId);
    expect(tags).toEqual([{ tag_normalized: '#alpha' }, { tag_normalized: '#curated' }]);
    db.close();
  });

  it('rewrites tags atomically when tags-only edit is supplied', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    const r = await svc.uploadPhoto({ adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: null, tags: ['#initial_a', '#initial_b'] });

    await svc.editMedia({ adminMemberId: ADMIN_ID, mediaId: r.mediaId, tags: ['#replaced_x', '#replaced_y'] });

    const db = openDb();
    const tags = db.prepare(`SELECT t.tag_normalized FROM media_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.media_id = ? ORDER BY t.tag_normalized`).all(r.mediaId);
    // Old tag rows should be gone for THIS media; #curated re-applied.
    expect(tags).toEqual([
      { tag_normalized: '#curated' },
      { tag_normalized: '#replaced_x' },
      { tag_normalized: '#replaced_y' },
    ]);
    db.close();
  });

  it('writes audit entry with edit_curated_media action_type', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    const r = await svc.uploadPhoto({ adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: 'before', tags: [] });

    await svc.editMedia({ adminMemberId: ADMIN_ID, mediaId: r.mediaId, caption: 'after' });

    const db = openDb();
    const audit = db.prepare(`SELECT * FROM audit_entries WHERE entity_id = ? AND action_type = 'edit_curated_media'`).get(r.mediaId) as Record<string, unknown>;
    expect(audit).toBeDefined();
    expect(audit.actor_member_id).toBe(ADMIN_ID);
    db.close();
  });

  it('throws NotFoundError when mediaId is unknown', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    await expect(svc.editMedia({ adminMemberId: ADMIN_ID, mediaId: 'media_does_not_exist', caption: 'x' }))
      .rejects.toThrow(/not found/i);
  });

  it('rejects #curated in caller-supplied tags', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    const r = await svc.uploadPhoto({ adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: null, tags: [] });
    await expect(svc.editMedia({ adminMemberId: ADMIN_ID, mediaId: r.mediaId, tags: ['#curated', '#another'] }))
      .rejects.toThrow(/#curated.*auto-applied/);
  });

  it('rejects oversized caption', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    const r = await svc.uploadPhoto({ adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: null, tags: [] });
    await expect(svc.editMedia({ adminMemberId: ADMIN_ID, mediaId: r.mediaId, caption: 'x'.repeat(501) }))
      .rejects.toThrow(/Caption must be 500/);
  });
});

// ── editMedia: sidecar-backed (URL-reference) ──────────────────────────────

describe('curatorMediaService.editMedia — sidecar-backed', () => {
  let curatedRoot: string;

  beforeEach(async () => {
    curatedRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'curator-edit-sidecar-'));
  });

  afterEach(async () => {
    await fsp.rm(curatedRoot, { recursive: true, force: true });
  });

  it('caption edit rewrites sidecar.title AND updates DB row inline', async () => {
    const db = openDb();
    const slug = `urledit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const url = `https://www.youtube.com/watch?v=YT_${slug}`;
    const { mediaId, sidecarPath, sidecarFilename } = insertCuratorUrlReference(db, {
      uploaderMemberId: SYSTEM_ID,
      curatedRoot,
      category: 'freestyle_tricks',
      primarySlug: slug,
      videoUrl: url,
      videoPlatform: 'youtube',
      videoId: `YT_${slug}`,
      caption: 'Original title',
      tier: 'CANONICAL_TUTORIAL',
      tags: ['#freestyle', '#trick', `#${slug}`],
    });
    db.close();

    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(), imageProcessor: makeStubImageProcessor(),
      curatedRootDir: curatedRoot,
    });
    const newCaption = 'Edited title';
    await svc.editMedia({ adminMemberId: ADMIN_ID, mediaId, caption: newCaption });

    const sidecar = JSON.parse(await fsp.readFile(sidecarPath, 'utf-8'));
    expect(sidecar.title).toBe(newCaption);
    expect(sidecar.videoUrl).toBe(url);
    expect(sidecar.tags).not.toContain('#curated');

    const db2 = openDb();
    const row = db2.prepare(`SELECT caption FROM media_items WHERE id = ?`).get(mediaId) as { caption: string };
    expect(row.caption).toBe(newCaption);
    const audit = db2.prepare(
      `SELECT entity_id, entity_type, action_type FROM audit_entries WHERE entity_id = ? AND action_type = 'edit_curated_url_reference'`,
    ).get(sidecarFilename) as Record<string, string>;
    expect(audit).toBeDefined();
    expect(audit.entity_type).toBe('curated_sidecar');
    db2.close();
  });

  it('tag edit rewrites sidecar.tags (sorted, deduped, #curated filtered)', async () => {
    const db = openDb();
    const slug = `urltags_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const url = `https://www.youtube.com/watch?v=TAGS_${slug}`;
    const { mediaId, sidecarPath } = insertCuratorUrlReference(db, {
      uploaderMemberId: SYSTEM_ID,
      curatedRoot,
      category: 'freestyle_tricks',
      primarySlug: slug,
      videoUrl: url,
      videoPlatform: 'youtube',
      videoId: `TAGS_${slug}`,
      caption: 'tags only',
      tags: ['#freestyle', '#trick', `#${slug}`],
    });
    db.close();

    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(), imageProcessor: makeStubImageProcessor(),
      curatedRootDir: curatedRoot,
    });
    await svc.editMedia({
      adminMemberId: ADMIN_ID, mediaId,
      tags: [`#${slug}`, '#freestyle', '#trick', `#${slug}`, '#new'],
    });

    const sidecar = JSON.parse(await fsp.readFile(sidecarPath, 'utf-8'));
    expect(sidecar.tags).toEqual(['#freestyle', '#new', '#trick', `#${slug}`].sort());
    expect(sidecar.tags).not.toContain('#curated');

    const db2 = openDb();
    const dbTags = db2.prepare(
      `SELECT t.tag_normalized FROM media_tags mt JOIN tags t ON t.id = mt.tag_id WHERE mt.media_id = ? ORDER BY t.tag_normalized`,
    ).all(mediaId);
    expect(dbTags.map((r: { tag_normalized: string }) => r.tag_normalized).sort()).toEqual(
      ['#curated', '#freestyle', '#new', '#trick', `#${slug}`].sort(),
    );
    db2.close();
  });

  it('throws when sidecar file is missing on disk (corruption guard)', async () => {
    const db = openDb();
    const slug = `nofile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const url = `https://www.youtube.com/watch?v=NOFILE_${slug}`;
    const { mediaId, sidecarPath } = insertCuratorUrlReference(db, {
      uploaderMemberId: SYSTEM_ID,
      curatedRoot,
      category: 'freestyle_tricks',
      primarySlug: slug,
      videoUrl: url,
      videoPlatform: 'youtube',
      videoId: `NOFILE_${slug}`,
      caption: 'will lose its sidecar',
      tags: ['#freestyle', '#trick', `#${slug}`],
    });
    db.close();
    await fsp.unlink(sidecarPath);

    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(), imageProcessor: makeStubImageProcessor(),
      curatedRootDir: curatedRoot,
    });
    await expect(svc.editMedia({ adminMemberId: ADMIN_ID, mediaId, caption: 'x' }))
      .rejects.toThrow(/sidecar file not found/);
  });
});

// ── deleteMedia ────────────────────────────────────────────────────────────

describe('curatorMediaService.deleteMedia', () => {
  it('cascades DB rows + deletes S3 keys for a photo', async () => {
    const storage = makeStubStorage();
    const svc = svcModule.createCuratorMediaService({ storage, imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    const r = await svc.uploadPhoto({ adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: 'will be deleted', tags: ['#del'] });
    storage.deletes.length = 0;

    await svc.deleteMedia({ adminMemberId: ADMIN_ID, mediaId: r.mediaId });

    const db = openDb();
    const row = db.prepare(`SELECT id FROM media_items WHERE id = ?`).get(r.mediaId);
    expect(row).toBeUndefined();
    const tagRows = db.prepare(`SELECT id FROM media_tags WHERE media_id = ?`).all(r.mediaId);
    expect(tagRows).toEqual([]);
    db.close();

    expect(storage.deletes.length).toBeGreaterThanOrEqual(2); // thumb + display
    expect(storage.deletes.some((k) => k.endsWith('-thumb.jpg'))).toBe(true);
    expect(storage.deletes.some((k) => k.endsWith('-display.jpg'))).toBe(true);
  });

  it('cascades DB rows + deletes S3 keys for a video (video + 2 poster variants)', async () => {
    const storage = makeStubStorage();
    const svc = svcModule.createCuratorMediaService({
      storage, imageProcessor: makeStubImageProcessor(), videoTranscoder: fakeTranscoder(),
    });
    const poster = await makeJpegBuffer();
    const r = await svc.uploadVideo({
      adminMemberId: ADMIN_ID, videoBuffer: makeFakeMp4(), posterBuffer: poster,
      caption: null, tags: ['#vid_delete'],
    });
    storage.deletes.length = 0;

    await svc.deleteMedia({ adminMemberId: ADMIN_ID, mediaId: r.mediaId });

    expect(storage.deletes.some((k) => k.endsWith('-video.mp4'))).toBe(true);
    expect(storage.deletes.some((k) => k.endsWith('-poster-display.jpg'))).toBe(true);
  });

  it('writes audit entry with delete_curated_media action_type', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    const r = await svc.uploadPhoto({ adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: null, tags: [] });
    await svc.deleteMedia({ adminMemberId: ADMIN_ID, mediaId: r.mediaId });

    const db = openDb();
    const audit = db.prepare(`SELECT * FROM audit_entries WHERE entity_id = ? AND action_type = 'delete_curated_media'`).get(r.mediaId) as Record<string, unknown>;
    expect(audit).toBeDefined();
    expect(audit.actor_member_id).toBe(ADMIN_ID);
    db.close();
  });

  it('throws NotFoundError when mediaId is unknown', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    await expect(svc.deleteMedia({ adminMemberId: ADMIN_ID, mediaId: 'media_nope_xyz' }))
      .rejects.toThrow(/not found/i);
  });

  it('still removes DB row when storage.delete fails (logs warning, does not throw)', async () => {
    const storage = makeStubStorage();
    const svc = svcModule.createCuratorMediaService({ storage, imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    const r = await svc.uploadPhoto({ adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: null, tags: [] });
    storage.failOnDelete = true;

    await expect(svc.deleteMedia({ adminMemberId: ADMIN_ID, mediaId: r.mediaId })).resolves.toEqual({ mediaId: r.mediaId });

    const db = openDb();
    const row = db.prepare(`SELECT id FROM media_items WHERE id = ?`).get(r.mediaId);
    expect(row).toBeUndefined();
    db.close();
  });
});

// ── deleteMedia: sidecar-backed (URL-reference) ────────────────────────────

describe('curatorMediaService.deleteMedia — sidecar-backed', () => {
  let curatedRoot: string;

  beforeEach(async () => {
    curatedRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'curator-del-sidecar-'));
  });

  afterEach(async () => {
    await fsp.rm(curatedRoot, { recursive: true, force: true });
  });

  it('removes sidecar file + DB row + audit-logs (no S3 traffic)', async () => {
    const db = openDb();
    const slug = `urldel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const url = `https://www.youtube.com/watch?v=DEL_${slug}`;
    const { mediaId, sidecarPath, sidecarFilename } = insertCuratorUrlReference(db, {
      uploaderMemberId: SYSTEM_ID,
      curatedRoot,
      category: 'freestyle_tricks',
      primarySlug: slug,
      videoUrl: url,
      videoPlatform: 'youtube',
      videoId: `DEL_${slug}`,
      caption: 'doomed',
      tags: ['#freestyle', '#trick', `#${slug}`],
    });
    db.close();
    expect(await fsp.access(sidecarPath).then(() => true).catch(() => false)).toBe(true);

    const storage = makeStubStorage();
    const svc = svcModule.createCuratorMediaService({
      storage, imageProcessor: makeStubImageProcessor(),
      curatedRootDir: curatedRoot,
    });
    await svc.deleteMedia({ adminMemberId: ADMIN_ID, mediaId });

    expect(await fsp.access(sidecarPath).then(() => true).catch(() => false)).toBe(false);
    expect(storage.deletes).toHaveLength(0);

    const db2 = openDb();
    const row = db2.prepare(`SELECT id FROM media_items WHERE id = ?`).get(mediaId);
    expect(row).toBeUndefined();
    const audit = db2.prepare(
      `SELECT entity_id, entity_type, action_type FROM audit_entries WHERE entity_id = ? AND action_type = 'delete_curated_url_reference'`,
    ).get(sidecarFilename) as Record<string, string>;
    expect(audit).toBeDefined();
    expect(audit.entity_type).toBe('curated_sidecar');
    db2.close();
  });

  it('still removes DB row + audit-logs when sidecar file is missing on disk (graceful)', async () => {
    const db = openDb();
    const slug = `delnofile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const url = `https://www.youtube.com/watch?v=DELNOFILE_${slug}`;
    const { mediaId, sidecarPath } = insertCuratorUrlReference(db, {
      uploaderMemberId: SYSTEM_ID,
      curatedRoot,
      category: 'freestyle_tricks',
      primarySlug: slug,
      videoUrl: url,
      videoPlatform: 'youtube',
      videoId: `DELNOFILE_${slug}`,
      caption: null,
      tags: ['#freestyle', '#trick', `#${slug}`],
    });
    db.close();
    await fsp.unlink(sidecarPath);

    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(), imageProcessor: makeStubImageProcessor(),
      curatedRootDir: curatedRoot,
    });
    await expect(svc.deleteMedia({ adminMemberId: ADMIN_ID, mediaId })).resolves.toEqual({ mediaId });

    const db2 = openDb();
    const row = db2.prepare(`SELECT id FROM media_items WHERE id = ?`).get(mediaId);
    expect(row).toBeUndefined();
    db2.close();
  });
});

// ── getMediaItem ───────────────────────────────────────────────────────────

describe('curatorMediaService.getMediaItem', () => {
  it('returns null for an unknown media id', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    expect(await svc.getMediaItem('media_does_not_exist_xyz')).toBeNull();
  });

  it('returns CuratorMediaListItem shape for a known FH-owned photo', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    const caption = `GET_ITEM_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tag = `#getitem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const r = await svc.uploadPhoto({ adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption, tags: [tag] });

    const item = await svc.getMediaItem(r.mediaId);
    expect(item).not.toBeNull();
    expect(item!.mediaId).toBe(r.mediaId);
    expect(item!.mediaType).toBe('photo');
    expect(item!.caption).toBe(caption);
    expect(item!.thumbnailUrl).toMatch(/^\/media\/.*-thumb\.jpg$/);
    expect(item!.tags.sort()).toEqual([tag, '#curated'].sort());
  });

  it('returns thumbnail_url field for a video item (uses stored thumbnail_url, not s3_key_thumb)', async () => {
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(), imageProcessor: makeStubImageProcessor(), videoTranscoder: fakeTranscoder(),
    });
    const poster = await makeJpegBuffer();
    const r = await svc.uploadVideo({
      adminMemberId: ADMIN_ID, videoBuffer: makeFakeMp4(), posterBuffer: poster,
      caption: null, tags: [],
    });
    const item = await svc.getMediaItem(r.mediaId);
    expect(item).not.toBeNull();
    expect(item!.mediaType).toBe('video');
    expect(item!.thumbnailUrl).toMatch(/^\/media\/.*-poster-display\.jpg$/);
  });

  it('photo upload: videoPlatform/videoId/videoUrl are all null in the shape', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    const r = await svc.uploadPhoto({
      adminMemberId: ADMIN_ID, photoBuffer: jpeg,
      caption: `VPLAT_NULL_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tags: [`#vplat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`],
    });
    const item = await svc.getMediaItem(r.mediaId);
    expect(item).not.toBeNull();
    expect(item!.videoPlatform).toBeNull();
    expect(item!.videoId).toBeNull();
    expect(item!.videoUrl).toBeNull();
  });

  it('s3 video upload: videoPlatform="s3", videoId is the S3 key, videoUrl is null', async () => {
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(), imageProcessor: makeStubImageProcessor(), videoTranscoder: fakeTranscoder(),
    });
    const r = await svc.uploadVideo({
      adminMemberId: ADMIN_ID, videoBuffer: makeFakeMp4(), posterBuffer: await makeJpegBuffer(),
      caption: null, tags: [],
    });
    const item = await svc.getMediaItem(r.mediaId);
    expect(item).not.toBeNull();
    expect(item!.videoPlatform).toBe('s3');
    expect(item!.videoId).toBeTruthy();
    expect(item!.videoUrl).toBeNull();
  });

  // YouTube URL-ref rows are written by the seeder, not by any service
  // method. Insert one directly via SQL to exercise the thumbnail
  // derivation in deriveListThumbnail (DD §6.8: render-time derivation
  // when thumbnail_url IS NULL).
  it('youtube row with NULL thumbnail_url: thumbnailUrl is derived as i.ytimg.com/vi/{video_id}/hqdefault.jpg', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const db = openDb();
    const now = new Date().toISOString();
    const mediaId = `media_yt_thumb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ytVideoId = 'abc12345xyz';
    db.prepare(`
      INSERT INTO media_items (
        id, created_at, created_by, updated_at, updated_by, version,
        uploader_member_id, media_type, is_avatar, caption, uploaded_at,
        video_platform, video_id, video_url, thumbnail_url,
        moderation_status
      ) VALUES (?, ?, 'seed', ?, 'seed', 1, ?, 'video', 0, NULL, ?, 'youtube', ?, ?, NULL, 'active')
    `).run(mediaId, now, now, SYSTEM_ID, now, ytVideoId, `https://www.youtube.com/watch?v=${ytVideoId}`);
    db.close();

    const item = await svc.getMediaItem(mediaId);
    expect(item).not.toBeNull();
    expect(item!.videoPlatform).toBe('youtube');
    expect(item!.videoId).toBe(ytVideoId);
    expect(item!.videoUrl).toBe(`https://www.youtube.com/watch?v=${ytVideoId}`);
    expect(item!.thumbnailUrl).toBe(`https://i.ytimg.com/vi/${ytVideoId}/hqdefault.jpg`);
  });

  it('vimeo row with sidecar-supplied thumbnail_url: thumbnailUrl uses the stored value (not derived)', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const db = openDb();
    const now = new Date().toISOString();
    const mediaId = `media_vimeo_thumb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const stored = 'https://i.vimeocdn.com/video/777_640.jpg';
    db.prepare(`
      INSERT INTO media_items (
        id, created_at, created_by, updated_at, updated_by, version,
        uploader_member_id, media_type, is_avatar, caption, uploaded_at,
        video_platform, video_id, video_url, thumbnail_url,
        moderation_status
      ) VALUES (?, ?, 'seed', ?, 'seed', 1, ?, 'video', 0, NULL, ?, 'vimeo', '777', 'https://vimeo.com/777', ?, 'active')
    `).run(mediaId, now, now, SYSTEM_ID, now, stored);
    db.close();

    const item = await svc.getMediaItem(mediaId);
    expect(item).not.toBeNull();
    expect(item!.thumbnailUrl).toBe(stored);
  });
});

// ── listMedia ──────────────────────────────────────────────────────────────

describe('curatorMediaService.listMedia', () => {
  it('returns paginated reverse-chrono list with tags joined', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    const uniqueTagA = `#listalpha_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const uniqueTagB = `#listbeta_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const r1 = await svc.uploadPhoto({ adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: 'first', tags: [uniqueTagA] });
    await new Promise((r) => setTimeout(r, 5));
    const r2 = await svc.uploadPhoto({ adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: 'second', tags: [uniqueTagA, uniqueTagB] });

    const result = svc.listMedia({ page: 1, pageSize: 100 });
    const idsInOrder = result.items.map((i) => i.mediaId);
    const idxR1 = idsInOrder.indexOf(r1.mediaId);
    const idxR2 = idsInOrder.indexOf(r2.mediaId);
    expect(idxR2).toBeLessThan(idxR1); // r2 uploaded after r1, should appear first
    expect(result.total).toBeGreaterThanOrEqual(2);

    const r2Item = result.items.find((i) => i.mediaId === r2.mediaId);
    expect(r2Item?.tags.sort()).toEqual([uniqueTagA, uniqueTagB, '#curated'].sort());
  });

  it('filters by tag when tagFilter is supplied', async () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const jpeg = await makeJpegBuffer();
    const filterTag = `#filter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await svc.uploadPhoto({ adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: 'unrelated', tags: ['#unrelated'] });
    const r = await svc.uploadPhoto({ adminMemberId: ADMIN_ID, photoBuffer: jpeg, caption: 'matched', tags: [filterTag] });

    const result = svc.listMedia({ page: 1, pageSize: 100, tagFilter: filterTag });
    const ids = result.items.map((i) => i.mediaId);
    expect(ids).toContain(r.mediaId);
    for (const item of result.items) {
      expect(item.tags).toContain(filterTag);
    }
  });

  it('rejects malformed tagFilter (must start with #)', () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    expect(() => svc.listMedia({ page: 1, pageSize: 10, tagFilter: 'no-hash' }))
      .toThrow(/must start with '#'/);
  });

  it('returns empty items when page is past the end', () => {
    const svc = svcModule.createCuratorMediaService({ storage: makeStubStorage(), imageProcessor: makeStubImageProcessor() });
    const result = svc.listMedia({ page: 9999, pageSize: 100 });
    expect(result.items).toEqual([]);
  });
});

// ── uploadUrlReference: writes sidecar files to /curated/{category}/ ──────
//
// URL-reference uploads are sidecar-first: no DB row written by the
// service. The seeder regenerates DB rows from sidecars on each run.
// Tests assert: oEmbed verification gating, sidecar file content,
// idempotent re-uploads, dynamic category dir creation.

import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function makeUrlVerifierStub(opts: {
  ok: boolean;
  status: number;
  body?: Record<string, unknown>;
}) {
  let calls = 0;
  return {
    impl: async (_url: string, _platform: 'youtube' | 'vimeo') => {
      calls++;
      const out: { ok: boolean; status: number; body?: Record<string, unknown> } = {
        ok: opts.ok,
        status: opts.status,
      };
      if (opts.body) out.body = opts.body;
      return out;
    },
    callCount: () => calls,
  };
}

describe('curatorMediaService.uploadUrlReference', () => {
  let curatedRoot: string;

  beforeEach(() => {
    // Mirrors repo state: only `freestyle_tricks/` pre-exists. Other
    // categories are created on demand by the auto-mkdir contract.
    curatedRoot = mkdtempSync(join(tmpdir(), 'url-ref-curated-'));
    mkdirSync(join(curatedRoot, 'freestyle_tricks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(curatedRoot, { recursive: true, force: true });
  });

  it('YouTube happy path: writes sidecar without thumbnailUrl, oEmbed verifier called, audit row written', async () => {
    const verifier = makeUrlVerifierStub({ ok: true, status: 200, body: { title: 'Demo' } });
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(),
      imageProcessor: makeStubImageProcessor(),
      videoUrlVerifier: verifier.impl,
      curatedRootDir: curatedRoot,
    });

    const result = await svc.uploadUrlReference({
      adminMemberId: ADMIN_ID,
      category: 'freestyle_tricks',
      videoUrl: 'https://www.youtube.com/watch?v=Dmr7zj_c7cY',
      videoPlatform: 'youtube',
      primarySlug: 'around-the-world',
      title: 'Around the world tutorial',
      creator: 'Kenny Shults',
      sourceId: 'tt_youtube',
      tier: 'CANONICAL_TUTORIAL',
      startSeconds: null,
      endSeconds: null,
      tags: ['#freestyle', '#trick', '#around-the-world'],
    });

    expect(verifier.callCount()).toBe(1);
    expect(result.category).toBe('freestyle_tricks');
    expect(result.filename).toMatch(/^around-the-world_[0-9a-f]{8}\.meta\.json$/);
    expect(result.overwritten).toBe(false);
    expect(existsSync(result.filePath)).toBe(true);

    const sidecar = JSON.parse(readFileSync(result.filePath, 'utf-8'));
    expect(sidecar).toMatchObject({
      videoUrl: 'https://www.youtube.com/watch?v=Dmr7zj_c7cY',
      videoPlatform: 'youtube',
      title: 'Around the world tutorial',
      creator: 'Kenny Shults',
      sourceId: 'tt_youtube',
      tier: 'CANONICAL_TUTORIAL',
    });
    expect(sidecar.thumbnailUrl).toBeUndefined();
    expect(sidecar.tags).toEqual(['#around-the-world', '#freestyle', '#trick']);

    const db = openDb();
    const audit = db.prepare(
      `SELECT * FROM audit_entries WHERE entity_id = ? AND action_type = 'upload_curated_url_reference'`,
    ).get(result.filename) as Record<string, unknown> | undefined;
    expect(audit).toBeDefined();
    expect(audit!.actor_member_id).toBe(ADMIN_ID);
    db.close();
  });

  it('Vimeo happy path: pulls thumbnail_url from oEmbed body and writes it into sidecar', async () => {
    const verifier = makeUrlVerifierStub({
      ok: true,
      status: 200,
      body: { title: 'Demo', thumbnail_url: 'https://i.vimeocdn.com/video/abc_640.jpg' },
    });
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(),
      imageProcessor: makeStubImageProcessor(),
      videoUrlVerifier: verifier.impl,
      curatedRootDir: curatedRoot,
    });

    const result = await svc.uploadUrlReference({
      adminMemberId: ADMIN_ID,
      category: 'freestyle_tricks',
      videoUrl: 'https://vimeo.com/123456',
      videoPlatform: 'vimeo',
      primarySlug: 'blender',
      title: 'Vimeo demo',
      creator: null,
      sourceId: null,
      tier: null,
      startSeconds: null,
      endSeconds: null,
      tags: ['#freestyle', '#trick', '#blender'],
    });

    const sidecar = JSON.parse(readFileSync(result.filePath, 'utf-8'));
    expect(sidecar.thumbnailUrl).toBe('https://i.vimeocdn.com/video/abc_640.jpg');
    expect(sidecar.videoPlatform).toBe('vimeo');
  });

  it('Dead URL (oEmbed returns 404): throws ValidationError, NO sidecar file written', async () => {
    const verifier = makeUrlVerifierStub({ ok: false, status: 404 });
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(),
      imageProcessor: makeStubImageProcessor(),
      videoUrlVerifier: verifier.impl,
      curatedRootDir: curatedRoot,
    });

    await expect(svc.uploadUrlReference({
      adminMemberId: ADMIN_ID,
      category: 'freestyle_tricks',
      videoUrl: 'https://www.youtube.com/watch?v=Dmr7zj_c7cY',
      videoPlatform: 'youtube',
      primarySlug: 'legover',
      title: 'Legover Variation',
      creator: null,
      sourceId: null,
      tier: null,
      startSeconds: null,
      endSeconds: null,
      tags: ['#freestyle', '#trick', '#legover'],
    })).rejects.toThrow(/oEmbed status 404/);

    const dirContents = readdirSync(join(curatedRoot, 'freestyle_tricks'));
    expect(dirContents.some((f) => f.startsWith('legover_'))).toBe(false);
  });

  it('Re-uploading the same URL is idempotent (overwritten=true, content matches)', async () => {
    const verifier = makeUrlVerifierStub({ ok: true, status: 200, body: { title: 'X' } });
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(),
      imageProcessor: makeStubImageProcessor(),
      videoUrlVerifier: verifier.impl,
      curatedRootDir: curatedRoot,
    });
    const input = {
      adminMemberId: ADMIN_ID,
      category: 'freestyle_tricks',
      videoUrl: 'https://www.youtube.com/watch?v=ZZZ12345678',
      videoPlatform: 'youtube' as const,
      primarySlug: 'mobius',
      title: 'first title',
      creator: null,
      sourceId: null,
      tier: null,
      startSeconds: null,
      endSeconds: null,
      tags: ['#freestyle', '#trick', '#mobius'],
    };

    const r1 = await svc.uploadUrlReference(input);
    expect(r1.overwritten).toBe(false);

    const r2 = await svc.uploadUrlReference({ ...input, title: 'second title' });
    expect(r2.overwritten).toBe(true);
    expect(r2.filename).toBe(r1.filename);
    const sidecar = JSON.parse(readFileSync(r2.filePath, 'utf-8'));
    expect(sidecar.title).toBe('second title');
  });

  it('New category (dir not yet exists): auto-mkdirs the dir and writes the sidecar', async () => {
    const verifier = makeUrlVerifierStub({ ok: true, status: 200, body: { title: 'New cat' } });
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(),
      imageProcessor: makeStubImageProcessor(),
      videoUrlVerifier: verifier.impl,
      curatedRootDir: curatedRoot,
    });

    expect(existsSync(join(curatedRoot, 'demos_2026'))).toBe(false);

    const result = await svc.uploadUrlReference({
      adminMemberId: ADMIN_ID,
      category: 'demos_2026',
      videoUrl: 'https://www.youtube.com/watch?v=NEWCAT12345',
      videoPlatform: 'youtube',
      primarySlug: 'pickup',
      title: 'Pickup demo',
      creator: null,
      sourceId: null,
      tier: null,
      startSeconds: null,
      endSeconds: null,
      tags: ['#freestyle', '#demo', '#pickup'],
    });

    expect(result.category).toBe('demos_2026');
    expect(existsSync(join(curatedRoot, 'demos_2026'))).toBe(true);
    expect(existsSync(result.filePath)).toBe(true);
  });

  it('Bad category name (slash, dot, uppercase): ValidationError, no fs write', async () => {
    const verifier = makeUrlVerifierStub({ ok: true, status: 200, body: { title: 'X' } });
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(),
      imageProcessor: makeStubImageProcessor(),
      videoUrlVerifier: verifier.impl,
      curatedRootDir: curatedRoot,
    });
    await expect(svc.uploadUrlReference({
      adminMemberId: ADMIN_ID,
      category: '..ev/il',
      videoUrl: 'https://www.youtube.com/watch?v=AAA12345678',
      videoPlatform: 'youtube',
      primarySlug: 'quantum',
      title: 'X',
      creator: null,
      sourceId: null,
      tier: null,
      startSeconds: null,
      endSeconds: null,
      tags: ['#freestyle', '#trick', '#quantum'],
    })).rejects.toThrow(/Category name must be lowercase letters, digits, or underscores/);
    expect(verifier.callCount()).toBe(0);
  });

  it('Vimeo with missing thumbnail_url in oEmbed body: ValidationError', async () => {
    const verifier = makeUrlVerifierStub({ ok: true, status: 200, body: { title: 'X' } });
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(),
      imageProcessor: makeStubImageProcessor(),
      videoUrlVerifier: verifier.impl,
      curatedRootDir: curatedRoot,
    });
    await expect(svc.uploadUrlReference({
      adminMemberId: ADMIN_ID,
      category: 'freestyle_tricks',
      videoUrl: 'https://vimeo.com/9999999',
      videoPlatform: 'vimeo',
      primarySlug: 'mirage',
      title: 'X',
      creator: null,
      sourceId: null,
      tier: null,
      startSeconds: null,
      endSeconds: null,
      tags: ['#freestyle', '#trick', '#mirage'],
    })).rejects.toThrow(/thumbnail_url/);
  });

  it('Invalid videoPlatform: ValidationError, verifier not called', async () => {
    const verifier = makeUrlVerifierStub({ ok: true, status: 200, body: { title: 'X' } });
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(),
      imageProcessor: makeStubImageProcessor(),
      videoUrlVerifier: verifier.impl,
      curatedRootDir: curatedRoot,
    });
    await expect(svc.uploadUrlReference({
      adminMemberId: ADMIN_ID,
      category: 'freestyle_tricks',
      videoUrl: 'https://example.com/x',
      // @ts-expect-error testing runtime validation of bad platform
      videoPlatform: 'tiktok',
      primarySlug: 'illusion',
      title: 'X',
      creator: null,
      sourceId: null,
      tier: null,
      startSeconds: null,
      endSeconds: null,
      tags: ['#freestyle', '#trick', '#illusion'],
    })).rejects.toThrow(/YouTube or Vimeo/);
    expect(verifier.callCount()).toBe(0);
  });

  it('Tags with #curated: ValidationError (auto-prepended at seed time)', async () => {
    const verifier = makeUrlVerifierStub({ ok: true, status: 200, body: { title: 'X' } });
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(),
      imageProcessor: makeStubImageProcessor(),
      videoUrlVerifier: verifier.impl,
      curatedRootDir: curatedRoot,
    });
    await expect(svc.uploadUrlReference({
      adminMemberId: ADMIN_ID,
      category: 'freestyle_tricks',
      videoUrl: 'https://www.youtube.com/watch?v=Dmr7zj_c7cY',
      videoPlatform: 'youtube',
      primarySlug: 'drifter',
      title: 'X',
      creator: null,
      sourceId: null,
      tier: null,
      startSeconds: null,
      endSeconds: null,
      tags: ['#curated', '#freestyle', '#trick', '#drifter'],
    })).rejects.toThrow(/#curated.*auto-applied/);
  });
});

describe('curatorMediaService.listExistingCategories', () => {
  it('returns sorted list of subdirectory names under the curated root', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'list-cat-test-'));
    try {
      mkdirSync(join(tmp, 'freestyle_tricks'));
      mkdirSync(join(tmp, 'demos_2026'));
      mkdirSync(join(tmp, 'admin'));
      // A file at the top level should NOT appear in the listing.
      require('fs').writeFileSync(join(tmp, 'top-level.jpg'), 'x');
      const svc = svcModule.createCuratorMediaService({
        storage: makeStubStorage(),
        imageProcessor: makeStubImageProcessor(),
        curatedRootDir: tmp,
      });
      const list = await svc.listExistingCategories();
      expect(list).toEqual(['admin', 'demos_2026', 'freestyle_tricks']);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('returns empty list when the curated root does not exist', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'list-cat-empty-'));
    rmSync(tmp, { recursive: true, force: true });
    const svc = svcModule.createCuratorMediaService({
      storage: makeStubStorage(),
      imageProcessor: makeStubImageProcessor(),
      curatedRootDir: tmp,
    });
    expect(await svc.listExistingCategories()).toEqual([]);
  });
});
