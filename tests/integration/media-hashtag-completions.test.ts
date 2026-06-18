/**
 * Media/hashtag completions:
 *   - An empty named gallery offers five site-wide popular tags as a teachable
 *     empty state.
 *   - The daily hashtag-statistics rebuild runs through the operations service
 *     and records one system_job_runs row per pass.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertTag, insertMediaItem } from '../fixtures/factories';
import { insertPersonaNamedGallery } from '../../src/testkit/personaRowBuilders';
import { expectLoggedError } from '../setup-env';

const { dbPath } = setTestEnv('3073');
const TS = '2025-01-01T00:00:00.000Z';

let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let mediaService: typeof import('../../src/services/mediaService').mediaService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let hashtagDiscoveryService: typeof import('../../src/services/hashtagDiscoveryService').hashtagDiscoveryService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let operationsPlatformService: typeof import('../../src/services/operationsPlatformService').operationsPlatformService;

function insertMediaTag(mediaId: string, tagId: string, tagDisplay: string): void {
  db.prepare(`
    INSERT INTO media_tags (id, created_at, created_by, updated_at, updated_by, version, media_id, tag_id, tag_display)
    VALUES (?, ?, 'test', ?, 'test', 1, ?, ?, ?)
  `).run(`mt-${mediaId}-${tagId}`, TS, TS, mediaId, tagId, tagDisplay);
}

beforeAll(async () => {
  db = createTestDb(dbPath);

  // A community tag (used by two members) so getPopularTags returns it after a
  // rebuild. The rebuild threshold for "popular" is distinct_member_count >= 2.
  const memberA = insertMember(db, { id: 'mhc-a', slug: 'mhc_a', login_email: 'a@mhc.test' });
  const memberB = insertMember(db, { id: 'mhc-b', slug: 'mhc_b', login_email: 'b@mhc.test' });
  const tagFreestyle = insertTag(db, { id: 'mhc-tag-fs', tag_normalized: '#freestyle', tag_display: '#Freestyle' });
  const mediaA = insertMediaItem(db, { uploader_member_id: memberA, caption: 'A' });
  const mediaB = insertMediaItem(db, { uploader_member_id: memberB, caption: 'B' });
  insertMediaTag(mediaA, tagFreestyle, '#Freestyle');
  insertMediaTag(mediaB, tagFreestyle, '#Freestyle');

  // An empty named gallery owned by member A (its sole criteria tag matches no
  // uploaded media, so the gallery renders empty).
  insertPersonaNamedGallery(db, {
    galleryId: 'mhc-empty-gallery',
    ownerMemberId: memberA,
    ownerSlug: 'mhc_a',
    name: 'Empty Gallery',
  });

  db.close();

  mediaService = (await import('../../src/services/mediaService')).mediaService;
  hashtagDiscoveryService = (await import('../../src/services/hashtagDiscoveryService')).hashtagDiscoveryService;
  operationsPlatformService = (await import('../../src/services/operationsPlatformService')).operationsPlatformService;
});

afterAll(() => cleanupTestDb(dbPath));

describe('empty named gallery offers popular tags', () => {
  it('an empty gallery carries site-wide popular tags; a populated one would not', () => {
    hashtagDiscoveryService.rebuildTagStats();

    const page = mediaService.getNamedGalleryPage('mhc-empty-gallery', undefined);
    expect(page.content.totalItems).toBe(0);
    expect(page.content.popularTags).toBeDefined();
    expect(page.content.popularTags!.map((t) => t.normalized)).toContain('#freestyle');
    expect(page.content.popularTags!.length).toBeLessThanOrEqual(5);
  });
});

describe('daily hashtag-stats rebuild via the operations service', () => {
  it('records one succeeded system_job_runs row with the upsert count', async () => {
    const result = await operationsPlatformService.runHashtagStatsRebuild(new Date('2026-06-15T12:00:00.000Z'));
    expect(result.rowsUpserted).toBeGreaterThanOrEqual(1);

    const probe = new BetterSqlite3(dbPath, { readonly: true });
    const row = probe.prepare(`
      SELECT status, details_json FROM system_job_runs
      WHERE job_name = 'SYS_Rebuild_Hashtag_Stats'
      ORDER BY started_at DESC LIMIT 1
    `).get() as { status: string; details_json: string };
    probe.close();

    expect(row.status).toBe('succeeded');
    expect(JSON.parse(row.details_json).rowsUpserted).toBe(result.rowsUpserted);
  });

  function countRebuildRuns(): number {
    const probe = new BetterSqlite3(dbPath, { readonly: true });
    const n = (probe.prepare(
      `SELECT COUNT(*) AS n FROM system_job_runs WHERE job_name = 'SYS_Rebuild_Hashtag_Stats'`,
    ).get() as { n: number }).n;
    probe.close();
    return n;
  }

  it('writes one job-run row per pass', async () => {
    const before = countRebuildRuns();
    await operationsPlatformService.runHashtagStatsRebuild(new Date('2026-06-16T12:00:00.000Z'));
    await operationsPlatformService.runHashtagStatsRebuild(new Date('2026-06-17T12:00:00.000Z'));
    expect(countRebuildRuns() - before).toBe(2);
  });

  it('a failed pass records a failed row with the error and logs it', async () => {
    expectLoggedError('SYS_Rebuild_Hashtag_Stats: failed');
    const before = countRebuildRuns();
    await expect(
      operationsPlatformService.recordJobRun('SYS_Rebuild_Hashtag_Stats', () => {
        throw new Error('synthetic rebuild failure');
      }),
    ).rejects.toThrow(/synthetic rebuild failure/);
    expect(countRebuildRuns() - before).toBe(1);

    const probe = new BetterSqlite3(dbPath, { readonly: true });
    const row = probe.prepare(`
      SELECT status, last_error FROM system_job_runs
      WHERE job_name = 'SYS_Rebuild_Hashtag_Stats' AND status = 'failed'
      ORDER BY started_at DESC LIMIT 1
    `).get() as { status: string; last_error: string };
    probe.close();
    expect(row.status).toBe('failed');
    expect(row.last_error).toContain('synthetic rebuild failure');
  });
});
