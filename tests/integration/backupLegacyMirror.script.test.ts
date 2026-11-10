/**
 * scripts/backup-legacy-mirror.sh -- the cold copy of the whole legacy site
 * crawl, and its proof.
 *
 * The crawl is the only surviving copy of the legacy site, so what is pinned
 * here is what keeps the copy whole and recoverable: the refusals that stop a
 * copy going to the wrong place or vouching for files it cannot list, an upload
 * that never deletes and lands in the backup region's cold storage class, a file
 * list whose sizes and checksums are the crawl's own, and a verdict that comes
 * from reading the bucket back rather than from the upload's exit status.
 *
 * Hermetic: a stand-in AWS CLI that keeps a fake bucket in a scratch directory,
 * a stand-in Terraform that answers its outputs, and a tiny crawl under a
 * scratch directory, each through the script's announced seams.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { createScratchDir } from '../fixtures/scratchDir';
import { requireToolInCI } from '../fixtures/toolAvailability';

const SCRIPT = join(process.cwd(), 'scripts/backup-legacy-mirror.sh');
const HAS_SCRIPT = requireToolInCI('script', '--version');
const BUCKET = 'footbag-production-legacy-mirror-backup';

const scratch = createScratchDir('backup-legacy-mirror');
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let dir: string;
let mirror: string;
let bucketDir: string;
let callLog: string;
let caseNo = 0;

/** The crawl's files: the www subtree and the crawl's own manifests. */
const CRAWL: Record<string, string> = {
  'www.footbag.org/index.html': '<html>home</html>\n',
  'www.footbag.org/events/1999/results.html': 'results with a space name\n',
  'www.footbag.org/media/clip one.mp4': 'not really a video, but bytes\n',
  'sitemap.txt': 'sitemap\n',
  'redirect_map.json': '{}\n',
  'skipped_videos.json': '[]\n',
  'skipped_videos_summary.txt': 'none\n',
};

function writeCrawl(files: Record<string, string> = CRAWL): void {
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(mirror, rel, '..'), { recursive: true });
    writeFileSync(join(mirror, rel), body);
  }
}

/**
 * The AWS CLI, keeping a fake bucket as a directory. A sync copies every file
 * the bucket lacks or holds at another size, and a dry sync prints one line
 * per such file, as the real CLI does. FAKE_SYNC_SKIPS names a file the upload
 * silently fails to copy, and FAKE_LIST_OMITS one the listing leaves out, so
 * the verdict can be driven from each side.
 */
function writeAwsStub(): string {
  const path = join(dir, 'aws');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `bucket=${JSON.stringify(bucketDir)}`,
      `printf '%s\\n' "$*" >> ${JSON.stringify(callLog)}`,
      'if [[ "$1 $2" == "s3 sync" ]]; then',
      '  src="$3"; dest="$4"; dry=0',
      '  [[ " $* " == *" --dryrun "* ]] && dry=1',
      '  prefix="${dest#s3://*/}"',
      '  while IFS= read -r -d "" rel; do',
      '    have="$bucket/$prefix$rel"',
      '    if [[ -f "$have" && "$(stat -c %s "$have")" == "$(stat -c %s "$src/$rel")" ]]; then continue; fi',
      '    if (( dry )); then echo "(dryrun) upload: $src/$rel to $dest$rel"; continue; fi',
      '    [[ "$rel" == "${FAKE_SYNC_SKIPS:-}" ]] && continue',
      '    mkdir -p "$(dirname "$have")"; cp "$src/$rel" "$have"',
      '  done < <(cd "$src" && find . -type f -printf "%P\\0")',
      '  exit 0',
      'fi',
      'if [[ "$1 $2" == "s3 cp" ]]; then',
      '  key="${4#s3://*/}"; mkdir -p "$(dirname "$bucket/$key")"; cp "$3" "$bucket/$key"; exit 0',
      'fi',
      'if [[ "$1 $2" == "s3api list-objects-v2" ]]; then',
      '  [[ -d "$bucket/mirror" ]] || { echo None; exit 0; }',
      '  listing="$(cd "$bucket" && find mirror -type f -printf "%p\\t%s\\n")"',
      '  if [[ -n "${FAKE_LIST_OMITS:-}" ]]; then',
      '    listing="$(printf "%s\\n" "$listing" | grep -v -F "mirror/${FAKE_LIST_OMITS}"$\'\\t\')"',
      '  fi',
      '  if [[ -n "${FAKE_LIST_WRONG_SIZE:-}" ]]; then',
      '    listing="$(printf "%s\\n" "$listing" | sed "s#^mirror/${FAKE_LIST_WRONG_SIZE}\\t.*#mirror/${FAKE_LIST_WRONG_SIZE}\\t1#")"',
      '  fi',
      '  printf "%s\\n" "$listing"',
      '  exit 0',
      'fi',
      'echo "unexpected aws call: $*" >&2',
      'exit 64',
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  return path;
}

/** Terraform, answering `output -json` with the bucket output, null, or a failure. */
function writeTfStub(output: 'on' | 'off' | 'fails'): string {
  const path = join(dir, 'terraform');
  const json = output === 'on'
    ? JSON.stringify({ legacy_mirror_backup_bucket_name: { value: BUCKET } })
    : JSON.stringify({ legacy_mirror_backup_bucket_name: { value: null } });
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `printf 'terraform %s\\n' "$*" >> ${JSON.stringify(callLog)}`,
      output === 'fails'
        ? 'echo "Error: Failed to load state: AccessDenied" >&2; exit 1'
        : `printf '%s\\n' ${JSON.stringify(json)}`,
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  return path;
}

function env(tf: 'on' | 'off' | 'fails' = 'on', extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...awsIdentityStubEnv(dir),
    FOOTBAG_AWS_BIN: writeAwsStub(),
    FOOTBAG_TERRAFORM_BIN: writeTfStub(tf),
    BACKUP_LEGACY_MIRROR_ROOT: mirror,
    TMPDIR: dir,
    ...extra,
  };
}

function run(args: string[], tf: 'on' | 'off' | 'fails' = 'on', extra: Record<string, string> = {}) {
  const r = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf-8', input: '', env: env(tf, extra), ...SPAWN_GUARD });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** A production run at a terminal, typing the answer to the prompt. */
function atTerminal(typed: string, extra: Record<string, string> = {}) {
  const inner = `bash ${JSON.stringify(SCRIPT)} --target production </dev/null; echo "EXIT=$?"`;
  const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
    encoding: 'utf-8',
    input: `${typed}\n`,
    env: env('on', extra),
    ...SPAWN_GUARD,
  });
  const out = r.stdout ?? '';
  return { status: Number(out.match(/EXIT=(\d+)/)?.[1] ?? -1), out };
}

const calls = () => (existsSync(callLog) ? readFileSync(callLog, 'utf-8') : '');
const writes = () => calls().split('\n').filter((l) => /^s3 (sync|cp) /.test(l) && !l.includes('--dryrun'));

beforeEach(() => {
  caseNo += 1;
  dir = join(scratch, `case-${caseNo}`);
  mirror = join(dir, 'mirror_footbag_org');
  bucketDir = join(dir, 'bucket');
  callLog = join(dir, 'calls.log');
  mkdirSync(mirror, { recursive: true });
  mkdirSync(bucketDir, { recursive: true });
  writeCrawl();
});

describe('backup-legacy-mirror.sh: refused before anything is copied', () => {
  it('takes production only, with no default, beside a production dry run that goes through', () => {
    // Defect caught: a copy aimed by ambient state at a tree that declares no
    // such bucket, or a script that refuses everything and so proves nothing.
    expect(run(['--dry-run']).status).toBe(2);
    expect(run(['--target', 'staging', '--dry-run']).status).toBe(2);
    expect(calls()).toBe('');
    const ok = run(['--target', 'production', '--dry-run']);
    expect(ok.status, ok.stderr).toBe(0);
  });

  it('refuses --yes on a real copy, and accepts it beside --dry-run', () => {
    // Defect caught: a flag passed in advance standing in for the person a
    // production copy is confirmed by, so an unattended run writes the bucket.
    const r = run(['--target', 'production', '--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--yes does not carry/);
    expect(calls()).toBe('');
    expect(run(['--target', 'production', '--dry-run', '--yes']).status).toBe(0);
  });

  it('refuses while the gate is off, naming it, and reaches no bucket', () => {
    // Defect caught: an upload aimed at a bucket that does not exist, or a
    // failure that leaves the operator guessing which flag to turn on.
    const r = run(['--target', 'production', '--dry-run'], 'off');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/enable_legacy_mirror_backup is off/);
    expect(calls()).not.toMatch(/^s3/m);
  });

  it("carries Terraform's own error when the outputs cannot be read", () => {
    // Defect caught: an unreadable state reported as a gate that is off, which
    // sends the operator to apply a flag that is already on.
    const r = run(['--target', 'production', '--dry-run'], 'fails');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/AccessDenied/);
    expect(r.stderr).not.toMatch(/is off/);
    expect(calls()).not.toMatch(/^s3/m);
  });

  it('refuses a mirror root that is missing, or that holds no www subtree', () => {
    // Defect caught: an empty or mistaken directory copied and reported as the
    // backup of the legacy site.
    rmSync(mirror, { recursive: true, force: true });
    const missing = run(['--target', 'production', '--dry-run']);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/does not exist/);
    writeCrawl({ 'sitemap.txt': 'x\n' });
    const noWww = run(['--target', 'production', '--dry-run']);
    expect(noWww.status).toBe(1);
    expect(noWww.stderr).toMatch(/no www\.footbag\.org subtree/);
    expect(calls()).not.toMatch(/^s3/m);
  });

  it('refuses a symbolic link in the crawl', () => {
    // Defect caught: the upload follows a link to a file outside the crawl,
    // which the file list then claims as part of it.
    symlinkSync('/etc/hostname', join(mirror, 'www.footbag.org', 'outside'));
    const r = run(['--target', 'production', '--dry-run']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/symbolic link/);
    expect(calls()).not.toMatch(/^s3/m);
  });

  it('refuses a file name the list cannot record', () => {
    // Defect caught: a tab or newline in a name splits its line in the file
    // list, and a backslash makes the checksum tool escape the name, so a
    // restore checks the wrong file against the wrong checksum.
    for (const name of ['bad\tname.html', 'bad\nname.html', 'bad\\name.html']) {
      const bad = join(mirror, 'www.footbag.org', name);
      writeFileSync(bad, 'x');
      const r = run(['--target', 'production', '--dry-run']);
      expect(r.status, JSON.stringify(name)).toBe(1);
      expect(r.stderr, JSON.stringify(name)).toMatch(/cannot record unambiguously/);
      rmSync(bad);
    }
    expect(run(['--target', 'production', '--dry-run']).status).toBe(0);
  });

  it('warns, and still reports a clean dry run otherwise, when a crawl manifest is missing', () => {
    // Defect caught: an unfinished crawl copied with nothing said, so its gaps
    // are found only on the day it is restored.
    rmSync(join(mirror, 'redirect_map.json'));
    const r = run(['--target', 'production', '--dry-run']);
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/WARNING: the crawl manifest redirect_map\.json is missing/);
  });
});

describe('backup-legacy-mirror.sh: the dry run', () => {
  it('reports the files, bytes and pending uploads, and writes nothing', () => {
    // Defect caught: a rehearsal that uploads, or one that reports a number the
    // operator cannot check against the crawl.
    const bytes = Object.values(CRAWL).reduce((n, b) => n + Buffer.byteLength(b), 0);
    const r = run(['--target', 'production', '--dry-run']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`${Object.keys(CRAWL).length} files, ${bytes} bytes`);
    expect(r.stdout).toContain(`${Object.keys(CRAWL).length} file(s) new or changed`);
    expect(writes()).toEqual([]);
    expect(r.stderr).toMatch(/stand-in mirror root/);
    expect(r.stderr).toMatch(/stand-in for the AWS CLI/);
  });
});

describe.skipIf(!HAS_SCRIPT)('backup-legacy-mirror.sh: the copy', () => {
  it('uploads nothing without the typed word', () => {
    // Defect caught: a copy into production that runs on any answer.
    const r = atTerminal('no');
    expect(r.status).toBe(1);
    expect(writes()).toEqual([]);
  });

  it('copies the whole crawl incrementally into cold storage in the backup region, never deleting', () => {
    // Defect caught: a --delete that removes from the backup what was removed
    // locally, so a bad change cannot be rolled back; a copy in the standard
    // class or the primary region; a sync of only the published subtree.
    const r = atTerminal('APPLY');
    expect(r.status, r.out).toBe(0);
    const sync = writes().find((l) => l.startsWith('s3 sync'));
    expect(sync).toBeDefined();
    expect(sync).toContain(`${mirror} s3://${BUCKET}/mirror/`);
    expect(sync).toMatch(/--storage-class DEEP_ARCHIVE/);
    expect(sync).toMatch(/--region us-west-2/);
    expect(calls()).not.toMatch(/--delete/);
    for (const rel of Object.keys(CRAWL)) {
      expect(existsSync(join(bucketDir, 'mirror', rel)), rel).toBe(true);
    }
  });

  it('writes the file list with the crawl\'s own sizes and checksums, as a timestamped and a latest copy', () => {
    // Defect caught: a list that misstates a size or checksum, so a restore is
    // checked against the wrong bytes; or one written only once, so the latest
    // cannot be found without listing the bucket.
    const r = atTerminal('APPLY');
    expect(r.status, r.out).toBe(0);
    const latest = readFileSync(join(bucketDir, 'manifests', 'latest.tsv'), 'utf-8');
    const expected = Object.entries(CRAWL)
      .map(([rel, body]) => `${rel}\t${Buffer.byteLength(body)}\t${createHash('sha256').update(body).digest('hex')}`)
      .sort((a, b) => (a.split('\t')[0] < b.split('\t')[0] ? -1 : 1));
    expect(latest.trimEnd().split('\n')).toEqual(expected);
    const stamped = writes().find((l) => /manifests\/\d{8}T\d{6}Z\.tsv/.test(l));
    expect(stamped, 'a timestamped list was uploaded').toBeDefined();
  });

  it('is a no-op upload on a re-run, and still proves the bucket', () => {
    // Defect caught: a re-run that re-uploads the whole crawl, or one that
    // reports success without checking the bucket again.
    expect(atTerminal('APPLY').status).toBe(0);
    rmSync(callLog);
    const again = atTerminal('APPLY');
    expect(again.status, again.out).toBe(0);
    expect(again.out).toContain('0 file(s) new or changed');
    expect(calls()).toMatch(/^s3api list-objects-v2/m);
  });

  it('fails when the second dry sync still finds a file to upload', () => {
    // Defect caught: success judged by the upload's exit status, which a
    // partial copy can return.
    const r = atTerminal('APPLY', { FAKE_SYNC_SKIPS: 'www.footbag.org/index.html' });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/still not in the bucket/);
  });

  it('fails when a listed file is absent from the bucket listing', () => {
    // Defect caught: a verdict from the sync alone, which compares only what it
    // can see, so a file missing from the bucket goes unreported.
    const r = atTerminal('APPLY', { FAKE_LIST_OMITS: 'sitemap.txt' });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/absent from s3:\/\/.*mirror\/ or there at another size/);
    expect(r.out).toContain('sitemap.txt');
  });

  it('fails when a listed file is in the bucket at another size', () => {
    // Defect caught: a check on names alone, so a truncated upload passes as
    // a whole copy of the file.
    const r = atTerminal('APPLY', { FAKE_LIST_WRONG_SIZE: 'redirect_map.json' });
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/or there at another size/);
    expect(r.out).toContain('redirect_map.json');
  });
});
