/**
 * scripts/restore-legacy-mirror.sh -- the way back out of the legacy crawl's
 * cold backup: restore requests, their status, and a download checked file by
 * file against the list the backup wrote.
 *
 * The crawl is the only surviving copy of the legacy site, so what is pinned
 * here is what makes a restore whole and harmless: the refusals that keep a
 * download away from the real crawl and from any non-empty directory, a
 * request that asks only for what is neither restored nor in flight, a
 * download that waits until every listed file is readable, and a verdict that
 * comes from checking every downloaded byte against the list.
 *
 * Hermetic. The file list and the bucket are made by running the real backup
 * script over a tiny scratch crawl, so the list format is the writer's own and
 * not a copy of it. A stand-in AWS CLI keeps the fake bucket in a scratch
 * directory, with each object's storage class and restore state beside it, and
 * a stand-in Terraform answers its outputs, each through the scripts'
 * announced seams.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { createScratchDir } from '../fixtures/scratchDir';
import { requireToolInCI } from '../fixtures/toolAvailability';

const SCRIPT = join(process.cwd(), 'scripts/restore-legacy-mirror.sh');
const BACKUP_SCRIPT = join(process.cwd(), 'scripts/backup-legacy-mirror.sh');
/** The real crawl's path: only ever passed as an argument the script must refuse, never written. */
const REAL_MIRROR = join(process.cwd(), 'legacy_data/legacy_mirror/mirror_footbag_org');
const HAS_SCRIPT = requireToolInCI('script', '--version');
const BUCKET = 'footbag-production-legacy-mirror-backup';

const scratch = createScratchDir('restore-legacy-mirror');
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** The crawl the backup copies: the www subtree, a name with a space, and the crawl's own manifests. */
const CRAWL: Record<string, string> = {
  'www.footbag.org/index.html': '<html>home</html>\n',
  'www.footbag.org/events/1999/results.html': 'results\n',
  'www.footbag.org/media/clip one.mp4': 'not really a video, but bytes\n',
  'sitemap.txt': 'sitemap\n',
  'redirect_map.json': '{}\n',
  'skipped_videos.json': '[]\n',
  'skipped_videos_summary.txt': 'none\n',
};
const PATHS = Object.keys(CRAWL);
const BYTES = Object.values(CRAWL).reduce((n, b) => n + Buffer.byteLength(b), 0);

/**
 * The AWS CLI, keeping a fake bucket as a directory. The two calls the backup
 * makes (sync and cp up, and its text listing) behave as in its own suite, and
 * record each object's storage class under .class/. The restore's calls read
 * and write each object's restore state under .restore/: a restore request
 * marks it in flight, a second one while in flight answers AWS's
 * RestoreAlreadyInProgress, the JSON listing reports RestoreStatus as S3 does
 * (absent when never restored), and a recursive download refuses a Deep
 * Archive object that is not restored, or that it was not forced to fetch.
 * FAKE_RACE names a file whose request loses to another run's, FAKE_CORRUPT one
 * whose download arrives altered.
 *
 * The error lines follow the CLI's own shape, the error code in parentheses:
 * botocore's ClientError template is "An error occurred ({error_code}) when
 * calling the {operation_name} operation{retry_info}: {error_message}". A real
 * line captured from AWS CLI v2 on 2026-11-10, a head-object on a missing key:
 *   aws: [ERROR]: An error occurred (404) when calling the HeadObject operation: Not Found
 */
function writeAwsStub(dir: string, bucketDir: string, callLog: string): string {
  const path = join(dir, 'aws');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `bucket=${JSON.stringify(bucketDir)}`,
      `printf '%s\\n' "$*" >> ${JSON.stringify(callLog)}`,
      'args=("$@")',
      'has() { local a; for a in "${args[@]}"; do [[ "$a" == "$1" ]] && return 0; done; return 1; }',
      'argval() { local i; for ((i = 0; i < ${#args[@]}; i++)); do [[ "${args[i]}" == "$1" ]] && { printf "%s" "${args[i+1]}"; return 0; }; done; return 1; }',
      'class_of() { cat "$bucket/.class/$1" 2>/dev/null || echo STANDARD; }',
      'state_of() { cat "$bucket/.restore/$1" 2>/dev/null || echo none; }',
      'if [[ "$1 $2" == "s3 sync" ]]; then',
      '  src="$3"; dest="$4"; dry=0',
      '  [[ " $* " == *" --dryrun "* ]] && dry=1',
      '  prefix="${dest#s3://*/}"',
      '  class="$(argval --storage-class || echo STANDARD)"',
      '  while IFS= read -r -d "" rel; do',
      '    have="$bucket/$prefix$rel"',
      '    if [[ -f "$have" && "$(stat -c %s "$have")" == "$(stat -c %s "$src/$rel")" ]]; then continue; fi',
      '    if (( dry )); then echo "(dryrun) upload: $src/$rel to $dest$rel"; continue; fi',
      '    mkdir -p "$(dirname "$have")" "$(dirname "$bucket/.class/$prefix$rel")"',
      '    cp "$src/$rel" "$have"; printf "%s" "$class" > "$bucket/.class/$prefix$rel"',
      '  done < <(cd "$src" && find . -type f -printf "%P\\0")',
      '  exit 0',
      'fi',
      'if [[ "$1 $2" == "s3 cp" && "$3" == s3://* ]]; then',
      '  key="${3#s3://*/}"; dest="$4"',
      '  if ! has --recursive; then',
      '    [[ -f "$bucket/$key" ]] || { echo "fatal error: An error occurred (404) when calling the HeadObject operation: Key \\"$key\\" does not exist" >&2; exit 1; }',
      '    cp "$bucket/$key" "$dest"; exit 0',
      '  fi',
      '  rc=0',
      '  while IFS= read -r -d "" rel; do',
      '    skip=0',
      '    for ((i = 0; i < ${#args[@]}; i++)); do',
      '      [[ "${args[i]}" == --exclude && "$rel" == ${args[i+1]} ]] && skip=1',
      '    done',
      '    (( skip )) && continue',
      '    if [[ "$(class_of "$key$rel")" == DEEP_ARCHIVE ]]; then',
      '      if ! has --force-glacier-transfer; then',
      '        echo "warning: Skipping file s3://x/$key$rel. Object is of storage class GLACIER. Unable to perform download operations on GLACIER objects." >&2; rc=2; continue',
      '      fi',
      '      if [[ "$(state_of "$key$rel")" != ready ]]; then',
      '        echo "download failed: s3://x/$key$rel An error occurred (InvalidObjectState) when calling the GetObject operation" >&2; rc=1; continue',
      '      fi',
      '    fi',
      '    mkdir -p "$(dirname "$dest$rel")"; cp "$bucket/$key$rel" "$dest$rel"',
      '    [[ "$rel" == "${FAKE_CORRUPT:-}" ]] && printf "X" >> "$dest$rel"',
      '  done < <(cd "$bucket/$key" && find . -type f -printf "%P\\0")',
      '  exit "$rc"',
      'fi',
      'if [[ "$1 $2" == "s3 cp" ]]; then',
      '  key="${4#s3://*/}"; mkdir -p "$(dirname "$bucket/$key")"; cp "$3" "$bucket/$key"; exit 0',
      'fi',
      'if [[ "$1 $2" == "s3api list-objects-v2" ]] && has --optional-object-attributes; then',
      '  [[ -d "$bucket/mirror" ]] || { echo "{\\"Prefix\\": \\"mirror/\\"}"; exit 0; }',
      '  (cd "$bucket" && find mirror -type f -printf "%p\\t%s\\n") | while IFS=$\'\\t\' read -r k s; do',
      '    jq -nc --arg k "$k" --argjson s "$s" --arg c "$(class_of "$k")" --arg r "$(state_of "$k")" \\',
      '      \'{Key: $k, Size: $s, StorageClass: $c} + (if $r == "inflight" then {RestoreStatus: {IsRestoreInProgress: true}} elif $r == "ready" then {RestoreStatus: {IsRestoreInProgress: false, RestoreExpiryDate: "2026-11-17T00:00:00+00:00"}} else {} end)\'',
      '  done | jq -s \'{Contents: .}\'',
      '  exit 0',
      'fi',
      'if [[ "$1 $2" == "s3api list-objects-v2" ]]; then',
      '  [[ -d "$bucket/mirror" ]] || { echo None; exit 0; }',
      '  (cd "$bucket" && find mirror -type f -printf "%p\\t%s\\n")',
      '  exit 0',
      'fi',
      'if [[ "$1 $2" == "s3api restore-object" ]]; then',
      '  key="$(argval --key)"',
      '  [[ -f "$bucket/$key" ]] || { echo "An error occurred (NoSuchKey) when calling the RestoreObject operation: The specified key does not exist." >&2; exit 254; }',
      '  mkdir -p "$(dirname "$bucket/.restore/$key")"',
      '  if [[ "$(state_of "$key")" == inflight || "$key" == "mirror/${FAKE_RACE:-}" ]]; then',
      '    printf inflight > "$bucket/.restore/$key"',
      '    echo "An error occurred (RestoreAlreadyInProgress) when calling the RestoreObject operation: Object restore is already in progress" >&2; exit 254',
      '  fi',
      '  [[ "$(state_of "$key")" == ready ]] && exit 0',
      '  printf inflight > "$bucket/.restore/$key"; exit 0',
      'fi',
      'echo "unexpected aws call: $*" >&2',
      'exit 64',
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  return path;
}

type TfState = 'on' | 'null' | 'absent' | 'fails';

/** Terraform, answering `output -json` with the bucket output, a null one, none at all, or a failure. */
function writeTfStub(dir: string, state: TfState, callLog: string): string {
  const path = join(dir, 'terraform');
  const outputs =
    state === 'on' ? { legacy_mirror_backup_bucket_name: { value: BUCKET } }
      : state === 'null' ? { legacy_mirror_backup_bucket_name: { value: null } }
        : { archive_bucket_name: { value: 'something-else' } };
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `printf 'terraform %s\\n' "$*" >> ${JSON.stringify(callLog)}`,
      state === 'fails'
        ? 'echo "Error: Failed to load state: AccessDenied" >&2; exit 1'
        : `printf '%s\\n' ${JSON.stringify(JSON.stringify(outputs))}`,
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  return path;
}

/** The bucket as the real backup leaves it, made once and copied into each case. */
let templateBucket: string;

beforeAll(() => {
  if (!HAS_SCRIPT) return;
  const base = join(scratch, 'backup');
  const crawl = join(base, 'mirror_footbag_org');
  templateBucket = join(base, 'bucket');
  mkdirSync(templateBucket, { recursive: true });
  for (const [rel, body] of Object.entries(CRAWL)) {
    mkdirSync(join(crawl, rel, '..'), { recursive: true });
    writeFileSync(join(crawl, rel), body);
  }
  const log = join(base, 'calls.log');
  const inner = `bash ${JSON.stringify(BACKUP_SCRIPT)} --target production </dev/null; echo "EXIT=$?"`;
  const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
    encoding: 'utf-8',
    input: 'APPLY\n',
    env: {
      ...process.env,
      ...awsIdentityStubEnv(base),
      FOOTBAG_AWS_BIN: writeAwsStub(base, templateBucket, log),
      FOOTBAG_TERRAFORM_BIN: writeTfStub(base, 'on', log),
      BACKUP_LEGACY_MIRROR_ROOT: crawl,
      TMPDIR: base,
    },
    ...SPAWN_GUARD,
  });
  expect(r.stdout, 'the backup that makes the fixture bucket succeeded').toContain('EXIT=0');
});

let dir: string;
let bucketDir: string;
let callLog: string;
let caseNo = 0;

beforeEach(() => {
  if (!HAS_SCRIPT) return;
  caseNo += 1;
  dir = join(scratch, `case-${caseNo}`);
  bucketDir = join(dir, 'bucket');
  callLog = join(dir, 'calls.log');
  mkdirSync(dir, { recursive: true });
  cpSync(templateBucket, bucketDir, { recursive: true });
});

/** Sets a listed file's restore state in the fake bucket. */
function setRestore(rel: string, state: 'inflight' | 'ready'): void {
  const f = join(bucketDir, '.restore', 'mirror', rel);
  mkdirSync(join(f, '..'), { recursive: true });
  writeFileSync(f, state);
}
const restoreAll = () => PATHS.forEach((p) => setRestore(p, 'ready'));

function env(tf: TfState = 'on', extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...awsIdentityStubEnv(dir),
    RESTORE_LEGACY_MIRROR_AWS_BIN: writeAwsStub(dir, bucketDir, callLog),
    RESTORE_LEGACY_MIRROR_TF_BIN: writeTfStub(dir, tf, callLog),
    TMPDIR: dir,
    ...extra,
  };
}

function run(args: string[], tf: TfState = 'on', extra: Record<string, string> = {}) {
  const r = spawnSync('bash', [SCRIPT, '--target', 'production', ...args], {
    encoding: 'utf-8', input: '', env: env(tf, extra), ...SPAWN_GUARD,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/** A run at a terminal, typing the answer to the prompt. */
function atTerminal(args: string[], typed: string, extra: Record<string, string> = {}) {
  const quoted = [SCRIPT, '--target', 'production', ...args].map((a) => JSON.stringify(a)).join(' ');
  const r = spawnSync('script', ['-qec', `bash ${quoted} </dev/null; echo "EXIT=$?"`, '/dev/null'], {
    encoding: 'utf-8', input: `${typed}\n`, env: env('on', extra), ...SPAWN_GUARD,
  });
  const out = r.stdout ?? '';
  return { status: Number(out.match(/EXIT=(\d+)/)?.[1] ?? -1), out };
}

const calls = () => (existsSync(callLog) ? readFileSync(callLog, 'utf-8') : '');
const restoreCalls = () => calls().split('\n').filter((l) => l.startsWith('s3api restore-object'));
const downloadCalls = () => calls().split('\n').filter((l) => /^s3 cp s3:\/\/\S+\/mirror\//.test(l));
const requestedKeys = () => restoreCalls().map((l) => l.match(/--key mirror\/(.*) --region/)?.[1]);

describe.skipIf(!HAS_SCRIPT)('restore-legacy-mirror.sh: refused before anything is read', () => {
  it('takes production only, with no default, beside a production dry run that goes through', () => {
    // Defect caught: a restore aimed by ambient state at a tree that declares
    // no such bucket, or a script that refuses everything and so proves nothing.
    const none = spawnSync('bash', [SCRIPT, '--dry-run'], { encoding: 'utf-8', env: env(), ...SPAWN_GUARD });
    expect(none.status).toBe(2);
    const staging = spawnSync('bash', [SCRIPT, '--target', 'staging', '--dry-run'], { encoding: 'utf-8', env: env(), ...SPAWN_GUARD });
    expect(staging.status).toBe(2);
    expect(calls()).toBe('');
    const ok = run(['--dry-run']);
    expect(ok.status, ok.stderr).toBe(0);
  });

  it('takes exactly one mode', () => {
    // Defect caught: a run with no mode, or two, doing one of them silently.
    expect(run([]).status).toBe(2);
    expect(run(['--dry-run', '--request']).status).toBe(2);
    expect(calls()).toBe('');
    expect(run(['--status']).status).toBe(3);
  });

  it('refuses a tier Deep Archive lacks and days that are not a whole count, beside ones it takes', () => {
    // Defect caught: an Expedited or misspelt tier, or zero or fractional days,
    // reaching AWS as a request that fails per object, or one that restores
    // nothing readable.
    for (const bad of [['--tier', 'Expedited'], ['--tier', 'bulk'], ['--days', '0'], ['--days', '1.5'], ['--days', 'x']]) {
      const r = run(['--request', ...bad]);
      expect(r.status, bad.join(' ')).toBe(2);
    }
    expect(run(['--dry-run', '--tier', 'Standard']).status, '--tier outside --request').toBe(2);
    expect(calls()).toBe('');
    const ok = atTerminal(['--request', '--tier', 'Standard', '--days', '3'], 'APPLY');
    expect(ok.status, ok.out).toBe(0);
    expect(restoreCalls().length).toBe(PATHS.length);
    for (const l of restoreCalls()) {
      expect(l).toContain('{"Days":3,"GlacierJobParameters":{"Tier":"Standard"}}');
    }
  });

  it('refuses --yes on a request, and accepts it beside --dry-run', () => {
    // Defect caught: a flag passed in advance standing in for the person who
    // confirms a billed retrieval, so an unattended run requests it.
    const r = run(['--request', '--yes']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--yes does not carry/);
    expect(calls()).toBe('');
    expect(run(['--dry-run', '--yes']).status).toBe(0);
  });

  it('refuses while the gate is off, naming it, whether the output is null or absent', () => {
    // Defect caught: a restore aimed at a bucket that does not exist, or a
    // failure that leaves the operator guessing which flag to turn on.
    for (const tf of ['null', 'absent'] as const) {
      const r = run(['--dry-run'], tf);
      expect(r.status, tf).toBe(1);
      expect(r.stderr, tf).toMatch(/enable_legacy_mirror_backup is off/);
    }
    expect(calls()).not.toMatch(/^s3/m);
  });

  it("carries Terraform's own error when the outputs cannot be read", () => {
    // Defect caught: an unreadable state reported as a gate that is off, which
    // sends the operator to apply a flag that is already on.
    const r = run(['--dry-run'], 'fails');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/AccessDenied/);
    expect(r.stderr).not.toMatch(/is off/);
    expect(calls()).not.toMatch(/^s3/m);
  });

  it('refuses a bucket with no file list', () => {
    // Defect caught: a restore with nothing to check the files against,
    // reported as a restore of the crawl.
    rmSync(join(bucketDir, 'manifests'), { recursive: true });
    const r = run(['--dry-run']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/holds no manifests\/latest\.tsv/);
  });
});

describe.skipIf(!HAS_SCRIPT)('restore-legacy-mirror.sh: the dry run and the status', () => {
  it('reports the listed files, bytes and each restore state, and changes nothing', () => {
    // Defect caught: a rehearsal that requests or downloads, or a count the
    // operator cannot check against the list.
    setRestore('sitemap.txt', 'ready');
    setRestore('redirect_map.json', 'inflight');
    const r = run(['--dry-run']);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`${PATHS.length} files, ${BYTES} bytes`);
    expect(r.stdout).toMatch(/restored, readable: +1 \(/);
    expect(r.stdout).toMatch(/restore in flight: +1 \(/);
    expect(r.stdout).toMatch(new RegExp(`not yet requested: +${PATHS.length - 2} \\(`));
    expect(restoreCalls()).toEqual([]);
    expect(downloadCalls()).toEqual([]);
    expect(r.stderr).toMatch(/TEST SEAM RESTORE_LEGACY_MIRROR_AWS_BIN/);
    expect(r.stderr).toMatch(/TEST SEAM RESTORE_LEGACY_MIRROR_TF_BIN/);
  });

  it('says NOT READY with exit 3 while one file is in flight, and READY with exit 0 once all are restored', () => {
    // Defect caught: a status that reports ready while a file is still in
    // Deep Archive, so the operator downloads into a refusal; or one that
    // never says ready.
    restoreAll();
    setRestore('sitemap.txt', 'inflight');
    const pending = run(['--status']);
    expect(pending.status).toBe(3);
    expect(pending.stderr).toMatch(/NOT READY/);
    setRestore('sitemap.txt', 'ready');
    const ready = run(['--status']);
    expect(ready.status, ready.stderr).toBe(0);
    expect(ready.stderr).toMatch(/READY/);
  });
});

describe.skipIf(!HAS_SCRIPT)('restore-legacy-mirror.sh: the request', () => {
  it('requests nothing without the typed word', () => {
    // Defect caught: a billed retrieval that runs on any answer.
    const r = atTerminal(['--request'], 'no');
    expect(r.status).toBe(1);
    expect(restoreCalls()).toEqual([]);
  });

  it('asks only for files neither restored nor in flight, at Bulk for 7 days by default, and proves each is in flight', () => {
    // Defect caught: a request repeated for a file already restored or in
    // flight, which is billed again or refused by AWS; a default tier dearer
    // than asked for; a verdict taken from the answers instead of the bucket.
    setRestore('sitemap.txt', 'ready');
    setRestore('redirect_map.json', 'inflight');
    const r = atTerminal(['--request'], 'APPLY');
    expect(r.status, r.out).toBe(0);
    const want = PATHS.filter((p) => p !== 'sitemap.txt' && p !== 'redirect_map.json').sort();
    expect(requestedKeys().sort()).toEqual(want);
    for (const l of restoreCalls()) {
      expect(l).toContain('{"Days":7,"GlacierJobParameters":{"Tier":"Bulk"}}');
      expect(l).toContain(`--bucket ${BUCKET}`);
      expect(l).toContain('--region us-west-2');
    }
    expect(r.out).toMatch(/every listed file now reads back as restored or in flight/);
  });

  it('is a no-op on a re-run, asking AWS for nothing', () => {
    // Defect caught: a re-run that requests every file again.
    expect(atTerminal(['--request'], 'APPLY').status).toBe(0);
    rmSync(callLog);
    const again = run(['--request']);
    expect(again.status, again.stderr).toBe(0);
    expect(again.stderr).toMatch(/NOTHING TO REQUEST/);
    expect(restoreCalls()).toEqual([]);
  });

  it('counts a request another run beat to it as in flight, not as a failure', () => {
    // Defect caught: AWS's documented answer for a restore already in
    // progress failing the run, when the file is exactly where it should be.
    const r = atTerminal(['--request'], 'APPLY', { FAKE_RACE: 'sitemap.txt' });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/1 already in flight from elsewhere, 0 failed/);
  });
});

describe.skipIf(!HAS_SCRIPT)('restore-legacy-mirror.sh: the download', () => {
  it('refuses while any listed file is not restored, and writes nothing', () => {
    // Defect caught: a download that starts on a half-restored bucket and
    // leaves a partial crawl that looks whole.
    restoreAll();
    setRestore('www.footbag.org/index.html', 'inflight');
    const dest = join(dir, 'out');
    const r = run(['--download', '--dest', dest]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/1 listed file\(s\) are not restored yet/);
    expect(existsSync(dest)).toBe(false);
    expect(downloadCalls()).toEqual([]);
  });

  it('downloads the whole crawl once every file is restored, matching the list byte for byte', () => {
    // Defect caught: a download that skips Deep Archive objects (the copy was
    // not forced past the storage class), lands under an extra mirror/ level,
    // or misses a file.
    restoreAll();
    const dest = join(dir, 'out');
    const r = run(['--download', '--dest', dest]);
    expect(r.status, r.stderr).toBe(0);
    for (const [rel, body] of Object.entries(CRAWL)) {
      expect(readFileSync(join(dest, rel), 'utf-8'), rel).toBe(body);
    }
    expect(r.stderr).toMatch(new RegExp(`all ${PATHS.length} listed files are in`));
  });

  it('leaves out an object the list does not hold, without blocking on it', () => {
    // Defect caught: a file since removed from the crawl, never restored,
    // failing the download or coming back as part of the crawl.
    restoreAll();
    const gone = join(bucketDir, 'mirror', 'www.footbag.org', 'removed.html');
    writeFileSync(gone, 'old\n');
    writeFileSync(join(bucketDir, '.class', 'mirror', 'www.footbag.org', 'removed.html'), 'DEEP_ARCHIVE');
    const dest = join(dir, 'out');
    const r = run(['--download', '--dest', dest]);
    expect(r.status, r.stderr).toBe(0);
    expect(existsSync(join(dest, 'www.footbag.org', 'removed.html'))).toBe(false);
  });

  it('fails on a file whose bytes differ from the list, naming it, and removes the download', () => {
    // Defect caught: a corrupted or substituted file accepted because its
    // name and size look right, and left behind as if it were the crawl.
    restoreAll();
    const dest = join(dir, 'out');
    const r = run(['--download', '--dest', dest], 'on', { FAKE_CORRUPT: 'redirect_map.json' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/differ from the list in size or SHA-256/);
    expect(r.stderr).toContain('redirect_map.json');
    expect(existsSync(dest)).toBe(false);
  });

  it('refuses a destination that is not empty, beside an empty one it fills', () => {
    // Defect caught: a download writing over whatever a directory holds.
    restoreAll();
    const full = join(dir, 'full');
    mkdirSync(full);
    writeFileSync(join(full, 'keep.txt'), 'mine\n');
    const r = run(['--download', '--dest', full]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/is not empty/);
    expect(readdirSync(full)).toEqual(['keep.txt']);
    expect(calls()).toBe('');
    const empty = join(dir, 'empty');
    mkdirSync(empty);
    const ok = run(['--download', '--dest', empty]);
    expect(ok.status, ok.stderr).toBe(0);
    expect(existsSync(join(empty, 'sitemap.txt'))).toBe(true);
  });

  it('refuses the real crawl, a path inside it and a path holding it, whether or not the crawl is there', () => {
    // Defect caught: a download aimed at the one irreplaceable copy of the
    // legacy site. The bucket here is never restored, so even with the guard
    // gone the run would stop at the readiness check before writing anything.
    for (const dest of [REAL_MIRROR, `${REAL_MIRROR}/`, join(REAL_MIRROR, 'footbag-test-probe'), join(REAL_MIRROR, '..')]) {
      const r = run(['--download', '--dest', dest]);
      expect(r.status, dest).toBe(2);
      expect(r.stderr, dest).toMatch(/holds the real crawl/);
    }
    expect(calls()).toBe('');
  });
});
