/**
 * Integration tests for scripts/check-media-integrity.sh and the TypeScript
 * check behind it.
 *
 * The check is a blocking piece of the deploy verification and had no coverage
 * of any kind, so nothing proved it could fail — and a media-integrity check
 * that cannot fail waves through exactly the metadata-without-bytes state it
 * exists to catch. What is pinned here is its exit contract, both failure
 * directions of it:
 *
 *   1  something referenced is missing (rows or site-content slots)
 *   2  the check could not even run
 *
 * The fully green path needs every registry site slot seeded with real FH
 * media, which is the deploy's own state and not a fixture worth faking here;
 * the deploy exercises it on every run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { SITE_MEDIA_SLOTS } from '../../src/content/siteMedia';
import { insertMember, insertVideoMediaItem, insertFreestyleRecord } from '../fixtures/factories';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_SQL = fs.readFileSync(path.join(REPO_ROOT, 'database', 'schema.sql'), 'utf8');

let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-media-integrity-'));
});

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

/**
 * A schema-only fixture database on disk. The schema commits each of its ~460
 * statements separately, so the default durability costs a disk flush per
 * statement and seconds per test; a throwaway fixture has nothing to survive.
 */
function buildSchemaDb(dbPath: string): void {
  const db = new BetterSqlite3(dbPath);
  db.pragma('synchronous = OFF');
  db.exec(SCHEMA_SQL);
  db.close();
}

function run(dbPath: string) {
  return spawnSync('bash', ['scripts/check-media-integrity.sh'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: { ...process.env, FOOTBAG_DB_PATH: dbPath },
    ...SPAWN_GUARD,
  });
}

describe('check-media-integrity.sh exit contract', () => {
  it('exits 1 on a database whose site-content slots are unseeded', () => {
    // A schema-only database is the canonical metadata-without-bytes state:
    // every fixed site slot in the registry resolves to nothing. The check must
    // fail it, name the slots, and use the exit code the deploy gate reads.
    const dbPath = path.join(workDir, 'fixture.db');
    buildSchemaDb(dbPath);

    const res = run(dbPath);
    expect(res.status, res.stdout + res.stderr).toBe(1);
    expect(res.stderr).toContain('no active FH media row');
    expect(res.stderr).toContain('check-media-integrity: FAIL');
    // A slot hosted on YouTube is checked too, named by its watch URL; skipping
    // it would let a page lose a featured video with the deploy gate green.
    expect(res.stderr).toContain(`SLOT ${SITE_MEDIA_SLOTS.net_singles.videoUrl}: no active FH media row`);
  });

  // Defect caught: a seeded record or curated sidecar carrying a video link
  // outside YouTube, Vimeo, TikTok and Instagram reaches the site, because
  // seeded rows never pass a form. An allowed link must not be named.
  it('names every off-platform video link and platform mismatch, and no allowed link', () => {
    const dbPath = path.join(workDir, 'fixture.db');
    buildSchemaDb(dbPath);
    const db = new BetterSqlite3(dbPath);
    insertMember(db, { id: 'member-integrity-fh', slug: 'integrity_fh', is_system: 1 });
    insertVideoMediaItem(db, {
      id: 'media-ok-instagram', uploader_member_id: 'member-integrity-fh',
      video_platform: 'instagram', video_id: 'DGlbm3quyxE', video_url: 'https://www.instagram.com/p/DGlbm3quyxE/',
    });
    insertVideoMediaItem(db, {
      id: 'media-mismatch', uploader_member_id: 'member-integrity-fh',
      video_platform: 'youtube', video_id: 'DGlbm3quyxE', video_url: 'https://www.instagram.com/p/DGlbm3quyxE/',
    });
    insertFreestyleRecord(db, { id: 'rec-facebook', video_url: 'https://www.facebook.com/watch/?v=1234567890' });
    insertFreestyleRecord(db, { id: 'rec-short', video_url: 'https://www.youtube.com/shorts/nLm3UtIzOc4' });
    db.close();

    const res = run(dbPath);
    expect(res.status, res.stdout + res.stderr).toBe(1);
    expect(res.stderr).toContain('OFF-PLATFORM record rec-facebook');
    expect(res.stderr).toContain('PLATFORM MISMATCH media media-mismatch');
    expect(res.stderr).not.toContain('rec-short');
    expect(res.stderr).not.toContain('media-ok-instagram');
    expect(res.stderr).toContain('2 video links outside YouTube, Vimeo, TikTok and Instagram');
  });

  it('exits 2 when it cannot open the database at all', () => {
    // Failure to run and failure of the data are different verdicts, and the
    // deploy treats them differently; conflating them would let a mispointed
    // path read as a media problem.
    const res = run(path.join(workDir, 'absent.db'));
    expect(res.status, res.stdout + res.stderr).toBe(2);
    expect(res.stderr).toContain('check-media-integrity: error');
  });

  it('exits 2 when the storage adapter cannot be configured', () => {
    // The adapter resolves its configuration as its module loads, so a bad
    // configuration threw before main ran: the catch above never saw it and the
    // process exited 1, which is the code that means referenced objects are absent.
    // A caller reading that told the operator the database pointed at missing media
    // when nothing had been compared. Deferring the import makes a configuration
    // failure land where it belongs, as the setup error the exit contract promises.
    const dbPath = path.join(workDir, 'fixture.db');
    buildSchemaDb(dbPath);

    const res = spawnSync('bash', ['scripts/check-media-integrity.sh'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      env: { ...process.env, FOOTBAG_DB_PATH: dbPath, MEDIA_STORAGE_ADAPTER: 'not-an-adapter' },
      ...SPAWN_GUARD,
    });
    expect(res.status, res.stdout + res.stderr).toBe(2);
    expect(res.stderr).toContain('check-media-integrity: error');
    expect(res.stderr).toContain("MEDIA_STORAGE_ADAPTER must be 's3' or 'local'");
  });
});
