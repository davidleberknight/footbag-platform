/**
 * Integration tests for curatorSeedService.reconcile — walks a /curated/-style
 * directory, pairs media files with sidecar .meta.json siblings, drives the
 * curator media lifecycle (create / update / unchanged / delete-orphan).
 *
 * Uses real SQLite + a temp source directory; stubs storage + image processor
 * + video transcoder so the test is hermetic.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import BetterSqlite3 from 'better-sqlite3';
import sharp from 'sharp';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';
import type { MediaStorageAdapter } from '../../src/adapters/mediaStorageAdapter';
import type { ImageProcessingAdapter } from '../../src/adapters/imageProcessingAdapter';
import type { VideoTranscodingAdapter } from '../../src/adapters/videoTranscodingAdapter';

const { dbPath } = setTestEnv('3092');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let mediaSvcModule: typeof import('../../src/services/curatorMediaService');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let seedSvcModule: typeof import('../../src/services/curatorSeedService');

const ADMIN_ID = 'admin-seed-001';
const SYSTEM_ID = 'member_seed_test_system';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'seed_admin', is_admin: 1 });
  insertMember(db, {
    id: SYSTEM_ID, slug: 'seed_system', is_system: 1,
    real_name: 'Seed System', display_name: 'Seed System',
  });
  db.close();
  mediaSvcModule = await import('../../src/services/curatorMediaService');
  seedSvcModule = await import('../../src/services/curatorSeedService');
});

afterAll(() => cleanupTestDb(dbPath));

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'curated-seed-test-')); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

function openDb(): BetterSqlite3.Database { return new BetterSqlite3(dbPath); }

// ── Stubs ────────────────────────────────────────────────────────────────

interface StubStorage extends MediaStorageAdapter { puts: string[]; deletes: string[] }
function makeStubStorage(): StubStorage {
  const puts: string[] = [];
  const deletes: string[] = [];
  return {
    puts, deletes,
    async put(key) { puts.push(key); },
    async delete(key) { deletes.push(key); },
    constructURL(key) { return `/media-store/${key}`; },
    async exists() { return false; },
  };
}

function makeStubImageProcessor(): ImageProcessingAdapter {
  return {
    async processAvatar() { return { thumb: Buffer.from('t'), display: Buffer.from('d'), widthPx: 300, heightPx: 300 }; },
    async processPhoto() { return { thumb: Buffer.from('t'), display: Buffer.from('d'), widthPx: 800, heightPx: 600 }; },
  };
}

function fakeTranscoder(): VideoTranscodingAdapter {
  return {
    transcode: async () => ({ bytes: Buffer.from('mp4'), outputFormat: 'mp4' }),
  };
}

async function makeJpegBuffer(): Promise<Buffer> {
  return sharp({ create: { width: 50, height: 50, channels: 3, background: { r: 1, g: 2, b: 3 } } })
    .jpeg().toBuffer();
}
function makeFakeMp4(): Buffer {
  const buf = Buffer.alloc(32);
  buf.write('ftyp', 4, 'ascii'); buf.write('isom', 8, 'ascii');
  return buf;
}

function makeServices(storage: StubStorage = makeStubStorage()) {
  const mediaSvc = mediaSvcModule.createCuratorMediaService({
    storage,
    imageProcessor: makeStubImageProcessor(),
    videoTranscoder: fakeTranscoder(),
  });
  const seedSvc = seedSvcModule.createCuratorSeedService({ curatorMediaService: mediaSvc });
  return { mediaSvc, seedSvc, storage };
}

async function dropPhoto(name: string, sidecar: object): Promise<void> {
  const buf = await makeJpegBuffer();
  writeFileSync(join(tmp, name), buf);
  const base = name.replace(/\.[^.]+$/, '');
  writeFileSync(join(tmp, `${base}.meta.json`), JSON.stringify(sidecar));
}

function dropVideo(name: string, posterName: string, sidecar: object): void {
  writeFileSync(join(tmp, name), makeFakeMp4());
  // posterName is treated as a sibling poster file; mark it with .poster. so
  // the seed service's POSTER_SUFFIX_PATTERN skips it as a primary entry.
  writeFileSync(join(tmp, posterName), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 'J'.charCodeAt(0), 'F'.charCodeAt(0), 'I'.charCodeAt(0), 'F'.charCodeAt(0), 0]));
  const base = name.replace(/\.[^.]+$/, '');
  writeFileSync(join(tmp, `${base}.meta.json`), JSON.stringify(sidecar));
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('curatorSeedService.reconcile — empty source dir', () => {
  it('returns an empty report when the directory has no media files', async () => {
    const { seedSvc } = makeServices();
    const report = await seedSvc.reconcile({ sourceDir: tmp, actorMemberId: ADMIN_ID });
    expect(report).toEqual({ created: [], updated: [], unchanged: [], deleted: [], errors: [] });
  });
});

describe('curatorSeedService.reconcile — fresh files', () => {
  it('classifies all new media files as created and inserts media_items rows', async () => {
    const { seedSvc, storage } = makeServices();
    const uniqueSuffix = `_seed_fresh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await dropPhoto(`fh-avatar${uniqueSuffix}.jpg`, { caption: 'avatar', tags: [`#avatar${uniqueSuffix}`] });
    await dropPhoto(`banner${uniqueSuffix}.jpg`, { caption: 'banner', tags: [] });

    const report = await seedSvc.reconcile({ sourceDir: tmp, actorMemberId: ADMIN_ID });
    expect(report.created.sort()).toEqual([`banner${uniqueSuffix}.jpg`, `fh-avatar${uniqueSuffix}.jpg`].sort());
    expect(report.updated).toEqual([]);
    expect(report.deleted).toEqual([]);
    expect(report.errors).toEqual([]);

    const db = openDb();
    const rows = db.prepare(`SELECT source_filename, caption FROM media_items WHERE uploader_member_id = ? AND source_filename LIKE ?`).all(SYSTEM_ID, `%${uniqueSuffix}.jpg`);
    expect(rows).toHaveLength(2);
    db.close();

    expect(storage.puts.length).toBeGreaterThan(0);
  });
});

describe('curatorSeedService.reconcile — unchanged dir', () => {
  it('reports unchanged for files with no caption/tag diffs', async () => {
    const { seedSvc, storage } = makeServices();
    const uniqueSuffix = `_seed_unchanged_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await dropPhoto(`shot${uniqueSuffix}.jpg`, { caption: 'shot', tags: [`#tag${uniqueSuffix}`] });

    await seedSvc.reconcile({ sourceDir: tmp, actorMemberId: ADMIN_ID });
    storage.puts.length = 0;

    const second = await seedSvc.reconcile({ sourceDir: tmp, actorMemberId: ADMIN_ID });
    expect(second.unchanged).toEqual([`shot${uniqueSuffix}.jpg`]);
    expect(second.created).toEqual([]);
    expect(second.updated).toEqual([]);
    expect(storage.puts).toEqual([]); // no S3 traffic on unchanged
  });
});

describe('curatorSeedService.reconcile — caption change', () => {
  it('updates caption-only diff via editMedia (no S3 traffic)', async () => {
    const { seedSvc, storage } = makeServices();
    const uniqueSuffix = `_seed_capedit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await dropPhoto(`capedit${uniqueSuffix}.jpg`, { caption: 'before', tags: [] });
    await seedSvc.reconcile({ sourceDir: tmp, actorMemberId: ADMIN_ID });
    storage.puts.length = 0;

    // Rewrite sidecar with new caption.
    writeFileSync(join(tmp, `capedit${uniqueSuffix}.meta.json`), JSON.stringify({ caption: 'after', tags: [] }));
    const report = await seedSvc.reconcile({ sourceDir: tmp, actorMemberId: ADMIN_ID });
    expect(report.updated).toEqual([`capedit${uniqueSuffix}.jpg`]);
    expect(storage.puts).toEqual([]);

    const db = openDb();
    const row = db.prepare(`SELECT caption FROM media_items WHERE source_filename = ? AND uploader_member_id = ?`).get(`capedit${uniqueSuffix}.jpg`, SYSTEM_ID) as { caption: string };
    expect(row.caption).toBe('after');
    db.close();
  });
});

describe('curatorSeedService.reconcile — tags change', () => {
  it('updates tag-only diff via editMedia', async () => {
    const { seedSvc } = makeServices();
    const uniqueSuffix = `_seed_tagedit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await dropPhoto(`tagedit${uniqueSuffix}.jpg`, { caption: null, tags: [`#initial${uniqueSuffix}`] });
    await seedSvc.reconcile({ sourceDir: tmp, actorMemberId: ADMIN_ID });

    writeFileSync(join(tmp, `tagedit${uniqueSuffix}.meta.json`), JSON.stringify({ caption: null, tags: [`#replaced${uniqueSuffix}`] }));
    const report = await seedSvc.reconcile({ sourceDir: tmp, actorMemberId: ADMIN_ID });
    expect(report.updated).toEqual([`tagedit${uniqueSuffix}.jpg`]);

    const db = openDb();
    const tags = db.prepare(`
      SELECT t.tag_normalized
      FROM media_tags mt JOIN tags t ON t.id = mt.tag_id
      JOIN media_items mi ON mi.id = mt.media_id
      WHERE mi.source_filename = ? AND mi.uploader_member_id = ?
      ORDER BY t.tag_normalized
    `).all(`tagedit${uniqueSuffix}.jpg`, SYSTEM_ID);
    expect(tags).toEqual([
      { tag_normalized: '#curated' },
      { tag_normalized: `#replaced${uniqueSuffix}` },
    ]);
    db.close();
  });
});

describe('curatorSeedService.reconcile — orphan cleanup', () => {
  it('deletes media when its source file disappears from the dir', async () => {
    const { seedSvc, storage } = makeServices();
    const uniqueSuffix = `_seed_orphan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await dropPhoto(`orphan${uniqueSuffix}.jpg`, { caption: 'soon to be gone', tags: [] });
    await seedSvc.reconcile({ sourceDir: tmp, actorMemberId: ADMIN_ID });
    storage.deletes.length = 0;

    // Remove both source + sidecar.
    rmSync(join(tmp, `orphan${uniqueSuffix}.jpg`));
    rmSync(join(tmp, `orphan${uniqueSuffix}.meta.json`));

    const report = await seedSvc.reconcile({ sourceDir: tmp, actorMemberId: ADMIN_ID });
    expect(report.deleted).toContain(`orphan${uniqueSuffix}.jpg`);

    const db = openDb();
    const row = db.prepare(`SELECT id FROM media_items WHERE source_filename = ? AND uploader_member_id = ?`).get(`orphan${uniqueSuffix}.jpg`, SYSTEM_ID);
    expect(row).toBeUndefined();
    db.close();

    expect(storage.deletes.length).toBeGreaterThan(0);
  });
});

describe('curatorSeedService.reconcile — error handling', () => {
  it('reports per-file error when sidecar is missing; continues processing other files', async () => {
    const { seedSvc } = makeServices();
    const uniqueSuffix = `_seed_err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // File 1: source without sidecar
    writeFileSync(join(tmp, `noside${uniqueSuffix}.jpg`), await makeJpegBuffer());
    // File 2: valid pair
    await dropPhoto(`okfile${uniqueSuffix}.jpg`, { caption: 'ok', tags: [] });

    const report = await seedSvc.reconcile({ sourceDir: tmp, actorMemberId: ADMIN_ID });
    expect(report.created).toEqual([`okfile${uniqueSuffix}.jpg`]);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].sourceFilename).toBe(`noside${uniqueSuffix}.jpg`);
    expect(report.errors[0].message).toMatch(/Sidecar missing/);
  });

  it('reports per-file error when sidecar JSON is malformed', async () => {
    const { seedSvc } = makeServices();
    const uniqueSuffix = `_seed_badjson_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    writeFileSync(join(tmp, `bad${uniqueSuffix}.jpg`), await makeJpegBuffer());
    writeFileSync(join(tmp, `bad${uniqueSuffix}.meta.json`), '{ not json');

    const report = await seedSvc.reconcile({ sourceDir: tmp, actorMemberId: ADMIN_ID });
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].message).toMatch(/JSON parse failed/);
  });

  it('reports per-file error when video sidecar lacks poster field', async () => {
    const { seedSvc } = makeServices();
    const uniqueSuffix = `_seed_noposter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    dropVideo(`vid${uniqueSuffix}.mp4`, `vid${uniqueSuffix}.poster.jpg`, {
      caption: null, tags: [], // poster field intentionally missing
    });

    const report = await seedSvc.reconcile({ sourceDir: tmp, actorMemberId: ADMIN_ID });
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].message).toMatch(/poster/i);
  });
});
