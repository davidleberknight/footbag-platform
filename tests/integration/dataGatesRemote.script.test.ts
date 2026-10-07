/**
 * The root-side body of the pre-cutover checklist's data checks, run directly
 * against fixture databases the way it runs on the host.
 *
 * Production member data never leaves AWS, so the checks travel to the data and
 * only their verdicts come back. What these pin: every stdout line is a gate
 * line or an exit-status line and nothing a check prints besides its verdict
 * reaches stdout; the live database and the snapshot are byte-identical
 * afterwards; the snapshot copy is matched to its manifest checksum, read only
 * from the snapshot directory, and leaves no scratch behind; a stopped site is
 * refused before any read; a check that prints no verdict still yields one.
 *
 * The check scripts reach the body the way the workstation half sends them, as
 * base64 on the stream, so the streamed form is what runs.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import * as fs from 'node:fs';
import * as path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { createTestDb } from '../fixtures/testDb';
import { insertLegacyMember, insertNameVariant } from '../fixtures/factories';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REMOTE_HALF = path.join(REPO_ROOT, 'scripts/internal/data-gates-remote.sh');

const CHECKS: Record<string, string> = {
  G1_6: 'scripts/validate-legacy-import-gates.sh',
  CLUBS: 'scripts/validate-club-candidates.sh',
  LEADERS: 'scripts/validate-bootstrap-leaders.sh',
  VARIANTS: 'scripts/validate-name-variants.sh',
  AUDIT: 'scripts/audit-dev-shortcuts.sh',
  SHOWCASE: 'scripts/validate-showcase-presence.sh',
};
const REAL_BODIES: Record<string, string> = Object.fromEntries(
  Object.entries(CHECKS).map(([label, file]) => [
    `DG_${label}_B64`, fs.readFileSync(path.join(REPO_ROOT, file)).toString('base64'),
  ]),
);

const MEMBER_NAME = 'Exported Person';
const ALLOWED_LINE =/^(GATE: [A-Z0-9-]+ (PASS|FAIL): .+|DG_[A-Z0-9_]+_RC=\d+)$/;

let scratch: string;
let siteDir: string;
let liveDb: string;
let envFile: string;
let snapshotRoot: string;
let snapshotFile: string;
let snapshotSha: string;
let tmpRoot: string;
let site: BetterSqlite3.Database;

beforeAll(() => {
  scratch = createScratchDir('data-gates-remote');

  // A database carrying an address, so any leak of a contact field onto stdout
  // would show as an '@'.
  siteDir = path.join(scratch, 'db');
  fs.mkdirSync(siteDir);
  liveDb = path.join(siteDir, 'footbag.db');
  const db = createTestDb(liveDb);
  insertLegacyMember(db, {
    legacy_member_id: '940001', real_name: MEMBER_NAME, country: 'US',
    legacy_email: 'exported.person@example.com', is_hof: 1, legacy_ever_paid_tier2: 1,
    import_source: 'legacy_site_data',
  });
  db.close();

  // The snapshot the checklist's snapshot step would leave on the host: the same
  // database, gzipped, with its uncompressed checksum recorded.
  snapshotRoot = path.join(scratch, 'snapshots');
  fs.mkdirSync(snapshotRoot);
  const raw = fs.readFileSync(liveDb);
  snapshotSha = createHash('sha256').update(raw).digest('hex');
  snapshotFile = path.join(snapshotRoot, 'precutover-test.db.gz');
  fs.writeFileSync(snapshotFile, gzipSync(raw));

  // A running site holds the database open in WAL mode, so its sidecars exist.
  site = new BetterSqlite3(liveDb);
  site.prepare('SELECT COUNT(*) FROM legacy_members').get();

  envFile = path.join(scratch, 'env');
  fs.writeFileSync(envFile, `FOOTBAG_ENV=production\nFOOTBAG_DB_DIR=${siteDir}\n`);
});

afterAll(() => {
  site.close();
  removeScratch(scratch);
});

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(scratch, 'tmp-'));
});

function run(extraEnv: NodeJS.ProcessEnv) {
  const res = spawnSync('bash', [REMOTE_HALF], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...REAL_BODIES,
      REMOTE_ENV_PATH: envFile,
      DG_SNAPSHOT_ROOT: snapshotRoot,
      TMPDIR: tmpRoot,
      ...extraEnv,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function sha256(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function lines(out: string): string[] {
  return out.split('\n').filter((l) => l !== '');
}

function b64(body: string): string {
  return Buffer.from(body).toString('base64');
}

describe('the data checks on the host', () => {
  it('reads the live database read-only, prints only verdicts, and changes nothing', () => {
    const before = { db: sha256(liveDb), listing: fs.readdirSync(siteDir).sort() };
    const res = run({ DG_SUBJECT: 'live' });

    expect(lines(res.stdout).length).toBeGreaterThan(0);
    for (const line of lines(res.stdout)) expect(line, line).toMatch(ALLOWED_LINE);
    expect(res.stdout).not.toContain('@');
    // No filter recognises a name, so the checks themselves must never print
    // one: the fixture member's name reaching stdout leaves the host with it.
    expect(res.stdout).not.toContain(MEMBER_NAME);
    for (const label of Object.keys(CHECKS)) expect(res.stdout).toMatch(new RegExp(`^DG_${label}_RC=\\d+$`, 'm'));
    expect(sha256(liveDb)).toBe(before.db);
    expect(fs.readdirSync(siteDir).sort()).toEqual(before.listing);
  });

  it('checks the snapshot copy, leaves the snapshot untouched, and leaves no scratch', () => {
    // Defect caught: a copy of the member database left in a temp directory on
    // the host, or the rollback artifact itself altered by the checks.
    const before = sha256(snapshotFile);
    const res = run({ DG_SUBJECT: 'snapshot', DG_SNAPSHOT_PATH: snapshotFile, DG_SNAPSHOT_SHA256: snapshotSha });

    expect(res.stderr).not.toContain('ERROR');
    for (const label of Object.keys(CHECKS)) expect(res.stdout).toMatch(new RegExp(`^DG_${label}_RC=\\d+$`, 'm'));
    for (const line of lines(res.stdout)) expect(line, line).toMatch(ALLOWED_LINE);
    expect(res.stdout).not.toContain(MEMBER_NAME);
    expect(sha256(snapshotFile)).toBe(before);
    expect(fs.readdirSync(tmpRoot)).toEqual([]);
  });

  it('refuses a snapshot whose copy does not match the manifest, checking nothing', () => {
    // Defect caught: the gates certifying some other object than the one a
    // rollback would restore.
    const res = run({ DG_SUBJECT: 'snapshot', DG_SNAPSHOT_PATH: snapshotFile, DG_SNAPSHOT_SHA256: 'a'.repeat(64) });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('does not match the manifest');
    expect(res.stdout).toBe('');
    expect(fs.readdirSync(tmpRoot)).toEqual([]);
  });

  it.each([
    ['outside the snapshot directory', () => path.join(scratch, 'elsewhere', 'precutover-test.db.gz')],
    ['climbing out of it', () => path.join(snapshotRoot, '..', 'elsewhere', 'precutover-test.db.gz')],
    ['absent', () => ''],
    ['inside the directory but not a compressed snapshot', () => {
      const plain = path.join(snapshotRoot, 'precutover-test.db');
      fs.writeFileSync(plain, fs.readFileSync(liveDb));
      return plain;
    }],
  ])('refuses a snapshot path %s', (_label, snap) => {
    // Defect caught: a path chosen on the stream turning the body into a reader
    // of any file on the host. The file outside is a valid snapshot with the
    // right checksum, so only the path rule stands in the way.
    fs.mkdirSync(path.join(scratch, 'elsewhere'), { recursive: true });
    fs.copyFileSync(snapshotFile, path.join(scratch, 'elsewhere', 'precutover-test.db.gz'));
    const res = run({ DG_SUBJECT: 'snapshot', DG_SNAPSHOT_PATH: snap(), DG_SNAPSHOT_SHA256: snapshotSha });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('not a snapshot file under the host\'s snapshot directory');
    expect(res.stdout).toBe('');
  });

  it('refuses a stopped site before any read, rather than create its sidecars as root', () => {
    const stopped = path.join(scratch, 'stopped');
    fs.mkdirSync(stopped);
    const db = createTestDb(path.join(stopped, 'footbag.db'));
    db.close();
    const stoppedEnv = path.join(scratch, 'stopped-env');
    fs.writeFileSync(stoppedEnv, `FOOTBAG_DB_DIR=${stopped}\n`);
    const before = fs.readdirSync(stopped).sort();
    const res = run({ DG_SUBJECT: 'live', REMOTE_ENV_PATH: stoppedEnv });

    expect(res.status).toBe(3);
    expect(res.stdout).toBe('');
    expect(fs.readdirSync(stopped).sort()).toEqual(before);
  });

  it('passes on a check\'s verdict and nothing else it prints', () => {
    // Defect caught: a check that prints a member's name or address beside its
    // verdict, relayed off the host with it.
    // The bare name carries no '@', so only the GATE:-line selection keeps it
    // back.
    const leaky = [
      'echo "Jane Doe jane.doe@example.com"',
      'echo "Jane Doe"',
      'echo "GATE: G11 PASS: ok"',
      'echo "jane.doe@example.com" >&2',
    ].join('\n');
    const res = run({ DG_SUBJECT: 'live', DG_VARIANTS_B64: b64(leaky) });

    expect(res.stdout).toContain('GATE: G11 PASS: ok');
    expect(res.stdout).not.toContain('@');
    expect(res.stdout).not.toContain('Jane Doe');
    expect(res.stderr).not.toContain('@');
  });

  it('gives a check that prints no verdict one from its exit status', () => {
    // Defect caught: a check that crashed before printing being counted as
    // nothing at all, so the summary never shows it failed.
    const res = run({ DG_SUBJECT: 'live', DG_LEADERS_B64: b64('exit 4') });

    expect(res.stdout).toMatch(/^GATE: G8 FAIL: exit 4$/m);
    expect(res.stdout).toMatch(/^DG_LEADERS_RC=4$/m);
  });

  it('refuses when a check did not arrive on the stream', () => {
    const res = run({ DG_SUBJECT: 'live', DG_SHOWCASE_B64: '' });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('SHOWCASE check was not on the stream');
  });

  it('refuses an unknown subject', () => {
    const res = run({ DG_SUBJECT: 'workstation' });

    expect(res.status).toBe(2);
    expect(res.stdout).toBe('');
  });
});

describe('the name-variants check names no member, passing or failing', () => {
  // Its sampled row is a member's name and its verdict leaves the host, so
  // neither verdict may carry the name. A name holding the '|' the check joins
  // the pair with is the one input that makes the sample fail to read back,
  // which is how the failing side is reached.
  function runVariants(canonical: string, variant: string) {
    const db = path.join(fs.mkdtempSync(path.join(scratch, 'variants-')), 'footbag.db');
    const handle = createTestDb(db);
    insertNameVariant(handle, { canonical_normalized: canonical, variant_normalized: variant });
    handle.close();
    const res = spawnSync('bash', [path.join(REPO_ROOT, CHECKS.VARIANTS)], {
      encoding: 'utf-8',
      env: { ...process.env, FOOTBAG_DB_PATH: db, FOOTBAG_NAME_VARIANTS_MIN: '1' },
      ...SPAWN_GUARD,
    });
    return { status: res.status ?? -1, out: (res.stdout ?? '') + (res.stderr ?? '') };
  }

  it('passes a pair that reads back, printing counts only', () => {
    const res = runVariants('roberta quist', 'bobbie quist');
    expect(res.status, res.out).toBe(0);
    expect(res.out).toMatch(/^GATE: G11 PASS: 1 rows /m);
    expect(res.out).not.toContain('quist');
  });

  it('fails a pair that does not read back, without printing it', () => {
    const res = runVariants('roberta|ann quist', 'bobbie quist');
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/^GATE: G11 FAIL: /m);
    expect(res.out).not.toContain('quist');
    expect(res.out).not.toContain('roberta');
  });
});
