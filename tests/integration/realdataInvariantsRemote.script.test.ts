/**
 * The root-side body of the staging real-data leg, run directly against
 * fixture databases the way it runs on the host.
 *
 * What may leave the host is the governance point of this body: counts,
 * PASS/FAIL gate lines and one opaque legacy id, and nothing is written. So the
 * cases pin exactly that: every stdout line is a gate line or a known key, the
 * database file is byte-identical afterwards, a mirror-only load reports the
 * distinct status the runner turns into "no authoritative load", and the probe
 * names the same target the crawl would choose for itself.
 *
 * The check scripts reach the body the way the workstation half sends them, as
 * base64 on the stream, so the streamed form of both scripts is what runs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { createTestDb } from '../fixtures/testDb';
import { insertHistoricalPerson, insertLegacyMember } from '../fixtures/factories';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REMOTE_HALF = path.join(REPO_ROOT, 'scripts/internal/realdata-invariants-remote.sh');
const GATES_B64 = fs.readFileSync(path.join(REPO_ROOT, 'scripts/validate-legacy-import-gates.sh')).toString('base64');
const RI_B64 = fs.readFileSync(path.join(REPO_ROOT, 'scripts/validate-realdata-ri.sh')).toString('base64');

let scratch: string;

interface Host {
  envFile: string;
  dbFile: string;
}

/**
 * A host: a database directory holding footbag.db, and an env file naming that
 * directory, which is how the body finds the database on the real host.
 */
function buildHost(
  label: string,
  seed: (db: ReturnType<typeof createTestDb>) => void,
  running = true,
): Host {
  const dir = path.join(scratch, label);
  fs.mkdirSync(dir);
  const dbFile = path.join(dir, 'footbag.db');
  const db = createTestDb(dbFile);
  seed(db);
  // Closing checkpoints the log into the main file and removes both sidecars,
  // which is the state a stopped site leaves.
  db.close();
  if (running) {
    // A running site holds the database open in WAL mode, so its -shm and -wal
    // sidecars exist. A connection held for the whole file stands in for it.
    const site = new BetterSqlite3(dbFile);
    site.prepare('SELECT COUNT(*) FROM legacy_members').get();
    siteConnections.push(site);
  }
  const envFile = path.join(dir, 'env');
  fs.writeFileSync(envFile, `FOOTBAG_ENV=staging\nFOOTBAG_DB_DIR=${dir}\n`);
  return { envFile, dbFile };
}

const siteConnections: BetterSqlite3.Database[] = [];

function listing(dir: string): string[] {
  return fs.readdirSync(dir).sort();
}

function run(host: Host, mode: string) {
  return spawnSync('bash', [REMOTE_HALF], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      RDI_MODE: mode,
      GATES_B64,
      RI_B64,
      REMOTE_ENV_PATH: host.envFile,
    },
    ...SPAWN_GUARD,
  });
}

function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function stdoutLines(out: string): string[] {
  return out.split('\n').filter((l) => l !== '');
}

let mirrorOnly: Host;
let authoritative: Host;

beforeAll(() => {
  scratch = createScratchDir('realdata-remote');

  // A mirror-derived population: no row the footbag.org export wrote. Honorees
  // are seeded out of id order so the probe's choice is decided by its own
  // ordering rather than by insertion order.
  mirrorOnly = buildHost('mirror', (db) => {
    insertLegacyMember(db, { legacy_member_id: '920002', real_name: null, display_name: 'Mirror Two', import_source: 'mirror' });
    insertLegacyMember(db, { legacy_member_id: '920001', real_name: null, display_name: 'Mirror One', import_source: 'mirror' });
    insertHistoricalPerson(db, { legacy_member_id: '920002', hof_member: 1 });
    insertHistoricalPerson(db, { legacy_member_id: '920001', hof_member: 1 });
    insertHistoricalPerson(db, { legacy_member_id: null, hof_member: 1 });
  });

  // A population the export has written, carrying an address, so any leak of a
  // contact field onto stdout would be visible as an '@'.
  authoritative = buildHost('authoritative', (db) => {
    insertLegacyMember(db, {
      legacy_member_id: '930001', real_name: 'Exported Person', country: 'US',
      legacy_email: 'exported.person@example.com', is_hof: 1, legacy_ever_paid_tier2: 1,
      import_source: 'legacy_site_data',
    });
    insertHistoricalPerson(db, { legacy_member_id: '930001', hof_member: 1 });
  });
});

afterAll(() => {
  for (const site of siteConnections) site.close();
  removeScratch(scratch);
});

describe('realdata-invariants-remote.sh probe', () => {
  // Defect caught: the crawl on staging targets a different record from the one
  // it would choose itself, or a count drifts from the query the runner's
  // thresholds were set against.
  it('reports the counts and the lowest Hall-of-Fame legacy id, and nothing else', () => {
    const res = run(mirrorOnly, 'probe');
    expect(res.status, res.stderr).toBe(0);
    expect(stdoutLines(res.stdout)).toEqual([
      'RDI_MEMBERS=2',
      'RDI_AUTHORITATIVE=0',
      'RDI_CLAIMABLE=2',
      'RDI_TARGET_ID=920001',
    ]);
  });
});

describe('realdata-invariants-remote.sh invariants', () => {
  // Defect caught: a mirror-only staging load is reported as an ordinary gate
  // failure, or as a pass, instead of as "no authoritative load".
  it('reports the mirror-only status from the streamed import gates', () => {
    const res = run(mirrorOnly, 'invariants');
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('RDI_GATES_RC=78');
    expect(res.stdout).toMatch(/^GATE: RI1 PASS/m);
  });

  // Defect caught: a member's name or address, or any diagnostic carrying
  // one, leaves the host on stdout, or the run writes to the live database.
  it('prints only gate lines and known keys, and leaves the database and its directory unchanged', () => {
    const dir = path.dirname(authoritative.dbFile);
    const before = sha256(authoritative.dbFile);
    const namesBefore = listing(dir);
    const res = run(authoritative, 'invariants');
    const after = sha256(authoritative.dbFile);
    expect(listing(dir), 'files in the database directory').toEqual(namesBefore);

    expect(res.status, res.stderr).toBe(0);
    const lines = stdoutLines(res.stdout);
    const stray = lines.filter((l) => !/^(GATE: |RDI_)/.test(l));
    expect(stray, 'lines that are neither gate lines nor RDI_ keys').toEqual([]);
    expect(lines.filter((l) => l.startsWith('GATE: G')).length, 'the six import gates ran').toBe(6);
    expect(lines.filter((l) => l.startsWith('GATE: RI')).length, 'the three RI checks ran').toBe(3);
    expect(res.stdout).not.toContain('@');
    expect(lines).toContain('RDI_RI_RC=0');
    expect(after).toBe(before);
  });
});

describe('realdata-invariants-remote.sh refusals', () => {
  // Defect caught: a host whose env file names a directory with no database
  // reports empty counts as though it had checked something.
  it('refuses when the database file is absent', () => {
    const dir = path.join(scratch, 'empty');
    fs.mkdirSync(dir);
    const envFile = path.join(dir, 'env');
    fs.writeFileSync(envFile, `FOOTBAG_DB_DIR=${dir}\n`);
    const res = run({ envFile, dbFile: path.join(dir, 'footbag.db') }, 'probe');
    expect(res.status).toBe(1);
    expect(res.stdout).toBe('');
    expect(res.stderr).toContain('no database file');
  });

  // Defect caught: a read against a stopped site's database creates root-owned
  // write-ahead-log sidecars, and the site's own account cannot open its
  // database on the next start.
  it('refuses, reading nothing and creating nothing, when the sidecars are absent', () => {
    const stopped = buildHost('stopped', (db) => {
      insertLegacyMember(db, { legacy_member_id: '950001', import_source: 'mirror' });
    }, false);
    const dir = path.dirname(stopped.dbFile);
    const namesBefore = listing(dir);
    expect(namesBefore).not.toContain('footbag.db-wal');
    for (const mode of ['probe', 'invariants']) {
      const res = run(stopped, mode);
      expect(res.status, mode).toBe(3);
      expect(res.stdout, mode).toBe('');
      expect(res.stderr, mode).toContain('sidecars are absent');
      expect(listing(dir), `${mode}: files in the database directory`).toEqual(namesBefore);
    }
  });

  // Defect caught: an unknown mode falls through to one of the real ones.
  it('refuses an unknown mode', () => {
    const res = run(mirrorOnly, 'dump');
    expect(res.status).toBe(2);
    expect(res.stdout).toBe('');
  });
});
