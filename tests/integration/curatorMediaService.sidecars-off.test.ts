/**
 * Curator media edit and delete where the authoring tree is not writable.
 *
 * This is the shape every deployed host runs: the `/curated/` tree is not in the
 * container image, not mounted, and never shipped, so the database is the only
 * source of truth and no filesystem path is touched. An edit must therefore
 * complete against the row alone and persist every field the edit surface
 * offers, and a delete must record the row as the entity it removed rather than
 * a file it never opened.
 *
 * Companion to `admin.curator.media.routes.test.ts`, which covers the developer
 * shape where the tree is writable and the sidecar is rewritten alongside the
 * row. The flag is read once per process, so the two shapes cannot share a file.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertCuratorUrlReference, insertMediaSource } from '../fixtures/factories';
import type { MediaStorageAdapter } from '../../src/adapters/mediaStorageAdapter';
import type { ImageProcessingAdapter } from '../../src/adapters/imageProcessingAdapter';

const { dbPath } = setTestEnv('3101');
// The fixture defaults this on to mirror a developer machine. Clear it before
// the service module loads, since config freezes its value at module load.
process.env.ALLOW_CURATED_SIDECAR_WRITES = '0';

const ADMIN_ID = 'member_admin_sidecars_off';
const SYSTEM_ID = 'member_footbag_hacky_sidecars_off';
const SOURCE_ID = 'src_sidecars_off';
const OTHER_SOURCE_ID = 'src_sidecars_off_other';

let svcModule: typeof import('../../src/services/curatorMediaService');
// Names a directory that does not exist, which is what `process.cwd()/curated`
// resolves to on a deployed host.
let absentCuratedRoot: string;
let mediaId: string;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'admin_sidecars_off', is_admin: 1 });
  insertMember(db, {
    id: SYSTEM_ID, slug: 'footbag_hacky_sidecars_off', is_system: 1,
    real_name: 'Footbag Hacky', display_name: 'Footbag Hacky',
  });
  insertMediaSource(db, SOURCE_ID);
  insertMediaSource(db, OTHER_SOURCE_ID);

  // Build the row the way the seeder would have, then take the tree away: the
  // row outlives the authoring files on every host that never received them.
  const seedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-curated-off-seed-'));
  ({ mediaId } = insertCuratorUrlReference(db, {
    uploaderMemberId: SYSTEM_ID,
    curatedRoot: seedRoot,
    category: 'freestyle_tricks',
    primarySlug: 'blender',
    videoUrl: 'https://www.youtube.com/watch?v=SIDECARS_OFF',
    videoPlatform: 'youtube',
    videoId: 'SIDECARS_OFF',
    caption: 'Original caption',
    sourceId: SOURCE_ID,
    startSeconds: 10,
    endSeconds: 20,
    tags: ['#freestyle', '#trick', '#blender'],
  }));
  db.close();
  fs.rmSync(seedRoot, { recursive: true, force: true });

  absentCuratedRoot = path.join(os.tmpdir(), `footbag-test-curated-off-absent-${Date.now()}`);
  svcModule = await import('../../src/services/curatorMediaService');
});

afterAll(() => cleanupTestDb(dbPath));

const noopStorage = {} as unknown as MediaStorageAdapter;
const noopImage = {} as unknown as ImageProcessingAdapter;

function buildService() {
  return svcModule.createCuratorMediaService({
    storage: noopStorage, imageProcessor: noopImage, curatedRootDir: absentCuratedRoot,
  });
}

function readRow(): Record<string, unknown> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(`
    SELECT caption, source_id, start_seconds, end_seconds, thumbnail_url
    FROM media_items WHERE id = ?
  `).get(mediaId) as Record<string, unknown>;
  db.close();
  return row;
}

describe('curator media with the authoring tree unwritable', () => {
  it('edits a URL-reference item against the row alone, persisting every offered field', async () => {
    const svc = buildService();

    await expect(svc.editMedia({
      adminMemberId: ADMIN_ID,
      mediaId,
      caption: 'Edited caption',
      sourceId: OTHER_SOURCE_ID,
      startSeconds: 30,
      endSeconds: 45,
      thumbnailUrl: 'https://example.com/poster.jpg',
    })).resolves.toBeDefined();

    const row = readRow();
    expect(row.caption).toBe('Edited caption');
    expect(row.source_id).toBe(OTHER_SOURCE_ID);
    expect(row.start_seconds).toBe(30);
    expect(row.end_seconds).toBe(45);
    expect(row.thumbnail_url).toBe('https://example.com/poster.jpg');

    // The edit reached no filesystem path: nothing created the tree it would
    // have written into.
    expect(fs.existsSync(absentCuratedRoot)).toBe(false);
  });

  it('rejects a provenance id that names no registered source', async () => {
    const svc = buildService();

    await expect(svc.editMedia({
      adminMemberId: ADMIN_ID,
      mediaId,
      sourceId: 'src_never_registered',
    })).rejects.toThrow(/Unknown source id/);

    expect(readRow().source_id).toBe(OTHER_SOURCE_ID);
  });

  it('edits one clip bound without disturbing the other', async () => {
    const svc = buildService();

    await svc.editMedia({ adminMemberId: ADMIN_ID, mediaId, startSeconds: 5 });

    const row = readRow();
    expect(row.start_seconds).toBe(5);
    expect(row.end_seconds).toBe(45);
  });
});
