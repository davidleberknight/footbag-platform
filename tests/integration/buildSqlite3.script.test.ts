/**
 * Building the pinned sqlite3 command-line tool.
 *
 * The backup, the restore and the deploy call sqlite3 on the hosts, and the
 * tests call it on workstations and in CI, so the binary this builds is what
 * every one of them runs. The contract: it installs only a binary built from a
 * download whose zip matches its pinned digest and whose sqlite3.c matches the
 * digest the publisher lists for the release; it installs only a binary that
 * reports the pinned version; a re-run over an installed pin changes nothing;
 * and it leaves no download or build directory behind.
 *
 * The download and the container build are replaced by stand-ins. The stand-in
 * build writes a small script that reports whatever version the case chooses,
 * so a wrong-version build is reachable without compiling anything.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/build-sqlite3.sh');
const VERSION = '3.51.2';

let dir: string;
let zipPath: string;
let fetchLog: string;

function sha3(path: string): string {
  return createHash('sha3-256').update(readFileSync(path)).digest('hex');
}

/** A zip holding an amalgamation-shaped directory with the given sqlite3.c text. */
function makeSourceZip(sqliteC: string): { zipSha3: string; cSha3: string } {
  const src = join(dir, 'zipsrc', 'sqlite-amalgamation-3510200');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'sqlite3.c'), sqliteC);
  writeFileSync(join(src, 'shell.c'), '/* shell */\n');
  const res = spawnSync('python3', ['-I', '-c',
    'import sys, zipfile, os\n'
    + 'root = sys.argv[2]\n'
    + 'with zipfile.ZipFile(sys.argv[1], "w") as z:\n'
    + '    for name in sorted(os.listdir(root)):\n'
    + '        z.write(os.path.join(root, name), "sqlite-amalgamation-3510200/" + name)\n',
    zipPath, src], { encoding: 'utf8', ...SPAWN_GUARD });
  expect(res.status, res.stderr).toBe(0);
  return { zipSha3: sha3(zipPath), cSha3: sha3(join(src, 'sqlite3.c')) };
}

function writeList(zipSha3: string, cSha3: string): string {
  const p = join(dir, 'tool-versions.env');
  writeFileSync(p, [
    `SQLITE_VERSION=${VERSION}`,
    'SQLITE_SOURCE_URL=https://example.invalid/sqlite-amalgamation-3510200.zip',
    `SQLITE_SOURCE_SHA3_256=${zipSha3}`,
    `SQLITE_AMALGAMATION_SHA3_256=${cSha3}`,
    'SQLITE_BUILD_GCC=gcc=0.0.0-r0',
    'SQLITE_BUILD_MUSL_DEV=musl-dev=0.0.0-r0',
  ].join('\n') + '\n');
  return p;
}

beforeEach(() => {
  dir = createScratchDir('build-sqlite3');
  zipPath = join(dir, 'source.zip');
  fetchLog = join(dir, 'fetch.log');
  writeFileSync(join(dir, 'fetch'), [
    '#!/usr/bin/env bash',
    `echo "$1" >> ${JSON.stringify(fetchLog)}`,
    `cat ${JSON.stringify(zipPath)}`,
  ].join('\n'));
  // The stand-in build writes, into the directory mounted at /out, a binary
  // that reports STUB_SQLITE_VERSION the way sqlite3 --version does.
  writeFileSync(join(dir, 'docker'), [
    '#!/usr/bin/env bash',
    'out=""',
    'while (( $# )); do',
    '  if [[ "$1" == "-v" && "$2" == *:/out ]]; then out="${2%:/out}"; fi',
    '  shift',
    'done',
    'printf \'#!/usr/bin/env bash\\necho "%s 2026-01-09 17:27:48 stub (64-bit)"\\n\' "$STUB_SQLITE_VERSION" > "$out/sqlite3"',
    'chmod +x "$out/sqlite3"',
  ].join('\n'));
  chmodSync(join(dir, 'fetch'), 0o755);
  chmodSync(join(dir, 'docker'), 0o755);
});

afterEach(() => removeScratch(dir));

function run(list: string, opts: { builtVersion?: string } = {}): { status: number; stdout: string; stderr: string } {
  const tmp = join(dir, 'tmp');
  mkdirSync(tmp, { recursive: true });
  const res = spawnSync('bash', [SCRIPT, '--install-dir', join(dir, 'bin')], {
    env: {
      ...process.env,
      TMPDIR: tmp,
      FOOTBAG_TOOL_VERSIONS: list,
      FOOTBAG_BUILD_SQLITE_FETCH: join(dir, 'fetch'),
      FOOTBAG_BUILD_SQLITE_DOCKER: join(dir, 'docker'),
      STUB_SQLITE_VERSION: opts.builtVersion ?? VERSION,
    },
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const installed = (): boolean => existsSync(join(dir, 'bin', 'sqlite3'));
const leftovers = (): string[] => readdirSync(join(dir, 'tmp')).filter((n) => n.startsWith('footbag-sqlite-build.'));

describe('building the pinned sqlite3', () => {
  it('installs a binary that reports the pinned version, and leaves nothing behind', () => {
    const { zipSha3, cSha3 } = makeSourceZip('/* the amalgamation */\n');

    const res = run(writeList(zipSha3, cSha3));

    expect(res.status, res.stderr).toBe(0);
    const v = spawnSync(join(dir, 'bin', 'sqlite3'), ['--version'], { encoding: 'utf8', ...SPAWN_GUARD });
    expect(v.stdout.split(' ')[0]).toBe(VERSION);
    expect(leftovers()).toEqual([]);
  });

  // Defect caught: a re-run downloaded and rebuilt over a binary already at the
  // pin, so every setup run cost a full build and a network fetch.
  it('changes nothing when the pinned version is already installed', () => {
    const { zipSha3, cSha3 } = makeSourceZip('/* the amalgamation */\n');
    const list = writeList(zipSha3, cSha3);
    expect(run(list).status).toBe(0);

    const again = run(list);

    expect(again.status).toBe(0);
    expect(again.stdout).toContain('nothing rebuilt');
    expect(readFileSync(fetchLog, 'utf8').trim().split('\n')).toHaveLength(1);
  });

  // Defect caught: a download altered in transit or at the source was compiled
  // and installed, so every machine would run a binary nobody checked.
  it('refuses a download whose zip does not match its pinned digest', () => {
    const { cSha3 } = makeSourceZip('/* the amalgamation */\n');

    const res = run(writeList('b'.repeat(64), cSha3));

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('SQLITE_SOURCE_SHA3_256');
    expect(installed()).toBe(false);
    expect(leftovers()).toEqual([]);
  });

  // Defect caught: a zip whose own digest was recomputed to match a tampered
  // file still installed, because nothing tied the source to what the
  // publisher lists for the release.
  it('refuses a source whose sqlite3.c does not match the published digest', () => {
    const { zipSha3 } = makeSourceZip('/* not the published amalgamation */\n');

    const res = run(writeList(zipSha3, 'c'.repeat(64)));

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('publishes');
    expect(installed()).toBe(false);
  });

  // Defect caught: a build that produced some other version was installed, so
  // the hosts would read and write the database with a different engine than
  // the one the app bundles.
  it('refuses to install a build that reports any version but the pin', () => {
    const { zipSha3, cSha3 } = makeSourceZip('/* the amalgamation */\n');

    const res = run(writeList(zipSha3, cSha3), { builtVersion: '3.40.0' });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain(`does not report sqlite3 ${VERSION}`);
    expect(installed()).toBe(false);
  });
});
