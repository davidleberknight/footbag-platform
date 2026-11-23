/**
 * Integration tests for scripts/archive-edit.sh, the only way the archive
 * bucket changes once it is the source of truth.
 *
 * The push and the rollback decide what they write, and what they report, from
 * what S3 answers to each conditional write, so the suite drives both end to end
 * against a stand-in AWS CLI that keeps a versioned bucket on disk: every write
 * appends a version with its own ETag, a delete appends a delete marker, and a
 * conditional write whose condition fails is refused with S3's 412 error, the
 * way the AWS CLI reference describes --if-match and --if-none-match. The error
 * lines use botocore's "An error occurred (<Code>) when calling the <Op>
 * operation: <message>" shape, modelled on the reference rather than captured;
 * the script reads only the code in parentheses. Terraform, the pinned ffmpeg
 * and the edge proof are stand-ins too. The typed confirmation is answered under
 * a pseudo-terminal; the refusals run with no terminal.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { requireToolInCI } from '../fixtures/toolAvailability';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'archive-edit.sh');
const HAS_SCRIPT = requireToolInCI('script', '--version');
const BUCKET = 'footbag-archive-stub';
const SPAWN = { ...SPAWN_GUARD, timeout: 60_000 };
/**
 * Production's ffmpeg release, from the one version list, without Alpine's
 * package revision: what `ffmpeg -version` reports for the pinned build.
 */
const PINNED_FFMPEG = fs.readFileSync(path.join(REPO_ROOT, 'ops', 'tool-versions.env'), 'utf8')
  .match(/^FFMPEG_VERSION=([0-9.]+)/m)![1];

/**
 * The stand-in AWS CLI. state.json holds the parameter value and, per key, its
 * versions: { v, etag, blob (null for a delete marker), ct }. Every call is
 * appended to calls.log as one JSON array.
 */
const STUB_AWS = String.raw`#!/usr/bin/env python3
import hashlib, json, os, shutil, sys
from urllib.parse import unquote
here = os.environ['STUB_STATE']
state_path = os.path.join(here, 'state.json')
state = json.load(open(state_path))
args = sys.argv[1:]
with open(os.path.join(here, 'calls.log'), 'a') as log:
    log.write(json.dumps(args) + '\n')
def opt(name):
    return args[args.index(name) + 1] if name in args else None
def save():
    json.dump(state, open(state_path, 'w'))
def fail(code, op, msg, status=254):
    sys.stderr.write('An error occurred (%s) when calling the %s operation: %s\n' % (code, op, msg))
    sys.exit(status)
def current(key):
    vs = state['objects'].get(key) or []
    return vs[-1] if vs and vs[-1]['blob'] is not None else None
def add_version(key, src, ct):
    state['counter'] += 1
    v = 'v%d' % state['counter']
    blob = os.path.join(here, 'blobs', v)
    shutil.copyfile(src, blob)
    etag = '"%s"' % hashlib.md5(open(blob, 'rb').read()).hexdigest()
    state['objects'].setdefault(key, []).append({'v': v, 'etag': etag, 'blob': blob, 'ct': ct})
    return v, etag
def add_marker(key):
    state['counter'] += 1
    v = 'v%d' % state['counter']
    state['objects'].setdefault(key, []).append({'v': v, 'etag': None, 'blob': None, 'ct': None})
    return v
def conditions(key, op):
    cur = current(key)
    m, n = opt('--if-match'), opt('--if-none-match')
    if m is not None and (cur is None or cur['etag'] != m):
        fail('PreconditionFailed', op, 'At least one of the pre-conditions you specified did not hold', 254)
    if n is not None and cur is not None:
        fail('PreconditionFailed', op, 'At least one of the pre-conditions you specified did not hold', 254)
cmd = ' '.join(args[:2])
key = opt('--key')
if cmd == 'ssm get-parameter':
    if state.get('param') is None:
        fail('ParameterNotFound', 'GetParameter', '')
    print(state['param'])
elif cmd == 's3api list-objects-v2':
    keys = sorted(k for k in state['objects'] if current(k))
    print(json.dumps(keys or None))
elif cmd == 's3api get-object':
    cur = current(key)
    if cur is None:
        fail('NoSuchKey', 'GetObject', 'The specified key does not exist.')
    out = [a for a in args[2:] if not a.startswith('--') and a not in (opt('--bucket'), key, opt('--query'), opt('--output'))][0]
    shutil.copyfile(cur['blob'], out)
    version = 'None' if state.get('unversioned') else cur['v']
    print('%s\t%s\t%d' % (cur['etag'], version, os.path.getsize(cur['blob'])))
elif cmd == 's3api head-object':
    cur = current(key)
    if cur is None:
        fail('404', 'HeadObject', 'Not Found')
    print('%s\t%s' % (cur['v'], cur['etag']))
elif cmd == 's3api put-object':
    conditions(key, 'PutObject')
    v, etag = add_version(key, opt('--body'), opt('--content-type'))
    save()
    print('%s\t%s' % (etag, v))
elif cmd == 's3api delete-object':
    conditions(key, 'DeleteObject')
    v = add_marker(key)
    save()
    print(v)
elif cmd == 's3api copy-object':
    conditions(key, 'CopyObject')
    src_key, version = opt('--copy-source').split('?versionId=')
    src_key = unquote(src_key.split('/', 1)[1])
    src = [x for x in state['objects'][src_key] if x['v'] == version][0]
    v, etag = add_version(key, src['blob'], src['ct'])
    save()
    print(v)
elif cmd == 'cloudfront create-invalidation':
    print('I-STUBINVALIDATION')
else:
    sys.stderr.write('unexpected aws invocation: %s\n' % ' '.join(args))
    sys.exit(64)
`;

let work: string;
let stubState: string;
let bin: string;

function writeExec(file: string, body: string) {
  fs.writeFileSync(file, body, { mode: 0o755 });
}

function readState() {
  return JSON.parse(fs.readFileSync(path.join(stubState, 'state.json'), 'utf8'));
}
function writeState(s: unknown) {
  fs.writeFileSync(path.join(stubState, 'state.json'), JSON.stringify(s));
}

/** Put a version of a key into the stand-in bucket, as another writer would. */
function seed(key: string, body: string | Buffer, ct = 'text/html') {
  const src = path.join(work, 'seed-src');
  fs.writeFileSync(src, body);
  const s = readState();
  s.counter += 1;
  const v = `v${s.counter}`;
  const blob = path.join(stubState, 'blobs', v);
  fs.copyFileSync(src, blob);
  const etag = `"seed-${v}"`;
  (s.objects[key] ??= []).push({ v, etag, blob, ct });
  writeState(s);
  return v;
}

/** The key's current body in the stand-in bucket, or null when absent. */
function bucketBody(key: string): string | null {
  const vs = readState().objects[key] ?? [];
  const cur = vs[vs.length - 1];
  return cur && cur.blob ? fs.readFileSync(cur.blob, 'utf8') : null;
}
function versions(key: string): Array<{ v: string; blob: string | null; ct: string | null }> {
  return readState().objects[key] ?? [];
}

function calls(): string[][] {
  const f = path.join(stubState, 'calls.log');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
}
const callsOf = (op: string) => calls().filter((c) => `${c[0]} ${c[1]}` === op);
const edgeCalls = () => {
  const f = path.join(work, 'edge-calls.log');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : [];
};
const logLines = (name: string) => {
  const f = path.join(work, name);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean) : [];
};
/** Calls to the pinned still-image runner. */
const ffmpegCalls = () => logLines('ffmpeg-calls.log');
/** Calls the platform's video transcode made to the PATH ffmpeg. */
const videoCalls = () => logLines('video-calls.log');

const PAGE = (body: string) => `<html><head><meta charset="utf-8"></head><body>${body}</body></html>\n`;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jpeg body')]);

beforeEach(() => {
  work = createScratchDir('archive-edit');
  stubState = path.join(work, 'stub');
  bin = path.join(work, 'bin');
  fs.mkdirSync(path.join(stubState, 'blobs'), { recursive: true });
  fs.mkdirSync(bin);
  writeState({ counter: 0, param: 'bucket', objects: {} });
  writeExec(path.join(bin, 'aws'), STUB_AWS);
  writeExec(path.join(bin, 'terraform'), [
    '#!/usr/bin/env bash',
    'case "${*: -1}" in',
    `  archive_bucket_name) echo ${BUCKET} ;;`,
    '  archive_distribution_id) echo EDISTSTUB ;;',
    '  *) exit 1 ;;',
    'esac',
  ].join('\n') + '\n');
  writeExec(path.join(bin, 'edge'), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(path.join(work, 'edge-calls.log'))}\n`);
  // The ffmpeg the platform's own video transcode finds on the PATH. It answers
  // -version the way ffmpeg does ("ffmpeg version <release> Copyright ...") with
  // FAKE_FFMPEG_VERSION, and otherwise logs its arguments and writes its last
  // argument (the transcode's output) as the input plus a marker.
  fs.mkdirSync(path.join(work, 'pathbin'));
  writeExec(path.join(work, 'pathbin', 'ffmpeg'), [
    '#!/usr/bin/env bash',
    'if [[ "$1" == "-version" ]]; then echo "ffmpeg version ${FAKE_FFMPEG_VERSION} Copyright (c) 2000-2026 the FFmpeg developers"; exit 0; fi',
    `printf '%s\\n' "$*" >> ${JSON.stringify(path.join(work, 'video-calls.log'))}`,
    'in=""; prev=""; for a in "$@"; do [[ "$prev" == -i ]] && in="$a"; prev="$a"; done',
    'out="${*: -1}"',
    'grep -q BADMEDIA "$in" && { echo "Invalid data found when processing input" >&2; exit 1; }',
    '{ cat "$in"; printf "ENCODED"; } > "$out"',
  ].join('\n') + '\n');
  // The pinned still-image runner's interface: "<runner> ffmpeg ARGS". The stand-in copies
  // the input to the output and appends a marker, so a re-encoded file is
  // recognisable, and refuses an input carrying BADMEDIA as ffmpeg would.
  writeExec(path.join(bin, 'ffmpeg'), [
    '#!/usr/bin/env bash',
    `printf '%s\\n' "$*" >> ${JSON.stringify(path.join(work, 'ffmpeg-calls.log'))}`,
    'in=""; prev=""; for a in "$@"; do [[ "$prev" == -i ]] && in="$a"; prev="$a"; done',
    'out="${*: -1}"',
    'grep -q BADMEDIA "$in" && { echo "Invalid data found when processing input" >&2; exit 1; }',
    '{ cat "$in"; printf "ENCODED"; } > "$out"',
  ].join('\n') + '\n');
  seed('_gate/denied.html', PAGE('denied'));
  seed('index.html', PAGE('<a href="news/">news</a>'));
  seed('news/index.html', PAGE('<a href="old.html">old</a><a href="item.html">item</a>'));
  seed('news/item.html', PAGE('item'));
  seed('news/old.html', PAGE('old'));
  seed('news/photo.jpg', JPEG, 'image/jpeg');
});
afterEach(() => removeScratch(work));

function env(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    ...awsIdentityStubEnv(work),
    FOOTBAG_AWS_BIN: path.join(bin, 'aws'),
    FOOTBAG_TERRAFORM_BIN: path.join(bin, 'terraform'),
    ARCHIVE_EDIT_FFMPEG: path.join(bin, 'ffmpeg'),
    ARCHIVE_EDIT_EDGE_VERIFIER: path.join(bin, 'edge'),
    STUB_STATE: stubState,
    FOOTBAG_CR_REPORT_TO: '',
    FAKE_FFMPEG_VERSION: PINNED_FFMPEG,
    PATH: `${path.join(work, 'pathbin')}:${process.env.PATH}`,
    ...extra,
  };
}

/** No terminal attached: the condition of an agent session or a scheduled job. */
function run(args: string[], extra: Record<string, string> = {}) {
  const r = spawnSync('bash', [SCRIPT, ...args], { cwd: work, env: env(extra), encoding: 'utf-8', input: '', ...SPAWN });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** At a terminal, typing `typed`. */
function runAtTerminal(args: string[], typed = 'APPLY\n') {
  const inner = ['bash', JSON.stringify(SCRIPT), ...args.map((a) => JSON.stringify(a)), '</dev/null'].join(' ');
  const r = spawnSync('script', ['-qec', `${inner}; echo "EXIT=$?"`, '/dev/null'], {
    cwd: work, env: env(), encoding: 'utf-8', input: typed, ...SPAWN,
  });
  const out = r.stdout ?? '';
  const m = out.match(/EXIT=(\d+)/);
  return { status: m ? Number(m[1]) : -1, out };
}

const dest = () => path.join(work, 'edit');
const tree = (key: string) => path.join(dest(), 'tree', key);
const pull = (...extra: string[]) => run(['pull', '--target', 'staging', '--prefix', '', '--dest', dest(), ...extra]);

function writeList(name: string, keys: string[]) {
  const f = path.join(work, name);
  fs.writeFileSync(f, keys.map((k) => `${k}\n`).join(''));
  return f;
}

describe('archive-edit.sh: arguments', () => {
  it('requires a mode, and a target with no default for the modes that reach AWS', () => {
    // Defect caught: a forgotten flag lands an edit on whichever environment a default named.
    expect(run([]).status).toBe(2);
    expect(run(['push', '--dest', dest()]).status).toBe(2);
    expect(run(['push', '--target', 'prod', '--dest', dest()]).status).toBe(2);
    expect(run(['pull', '--target', 'staging', '--prefix', 'a', '--keys', 'f', '--dest', dest()]).status).toBe(2);
    expect(calls()).toEqual([]);
    const ok = pull();
    expect(ok.status, ok.out).toBe(0);
  });

  it('says on stderr that each stand-in is in use', () => {
    // Defect caught: a stubbed run read as proof about the estate.
    const res = pull();
    for (const seam of ['the AWS CLI', 'Terraform', 'the pinned ffmpeg', 'the edge proof']) {
      expect(res.out, seam).toContain(`NOTE: using a stand-in for ${seam}`);
    }
  });
});

describe('archive-edit.sh pull', () => {
  it('downloads every editable key with its ETag and version, into a private directory, and never _gate/', () => {
    const res = pull();
    expect(res.status, res.out).toBe(0);
    // Defect caught: members' contact details readable by other accounts on the workstation.
    expect(fs.statSync(dest()).mode & 0o777).toBe(0o700);
    const ledger = fs.readFileSync(path.join(dest(), 'state', 'ledger.tsv'), 'utf8').trim().split('\n').map((l) => l.split('\t'));
    // Defect caught: the Terraform-owned refusal pages pulled, and later pushed over.
    expect(ledger.map((r) => r[0]).sort()).toEqual(['index.html', 'news/index.html', 'news/item.html', 'news/old.html', 'news/photo.jpg']);
    expect(fs.existsSync(tree('_gate/denied.html'))).toBe(false);
    // Defect caught: a ledger without the pulled version, so nothing could be rolled back.
    const item = ledger.find((r) => r[0] === 'news/item.html')!;
    expect(item[1]).toBe('"seed-v4"');
    expect(item[2]).toBe('v4');
    expect(fs.readFileSync(tree('news/item.html'), 'utf8')).toBe(PAGE('item'));
    // The link check needs every bucket key, the reserved ones included.
    const listed = fs.readFileSync(path.join(dest(), 'state', 'bucket-keys.txt'), 'utf8');
    expect(listed).toContain('_gate/denied.html\n');
  });

  it('refuses a directory that already holds something, and touches nothing in it', () => {
    // Defect caught: a pull over an earlier edit silently replacing the operator's work.
    fs.mkdirSync(dest());
    fs.writeFileSync(path.join(dest(), 'mine.html'), 'work in progress');
    const res = pull();
    expect(res.status).toBe(1);
    expect(res.out).toContain('is not empty');
    expect(callsOf('s3api get-object')).toEqual([]);
    expect(fs.readFileSync(path.join(dest(), 'mine.html'), 'utf8')).toBe('work in progress');
  });

  it('refuses a destination inside the repository', () => {
    // Defect caught: archive pages carrying contact details landing where they could be committed.
    const res = run(['pull', '--target', 'staging', '--prefix', '', '--dest', path.join(REPO_ROOT, 'tmp', 'archive-edit-test')]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('inside the repository');
    expect(fs.existsSync(path.join(REPO_ROOT, 'tmp', 'archive-edit-test'))).toBe(false);
  });

  it('refuses a keys file naming a key the bucket lacks or a _gate/ key, and downloads nothing', () => {
    const res = run(['pull', '--target', 'staging', '--keys', writeList('keys.txt', ['news/item.html', 'news/nope.html', '_gate/denied.html']), '--dest', dest()]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('news/nope.html, which the bucket does not hold');
    expect(res.out).toContain('_gate/ prefix');
    expect(callsOf('s3api get-object')).toEqual([]);
    // The same file without the two bad keys pulls.
    fs.rmSync(dest(), { recursive: true, force: true });
    const ok = run(['pull', '--target', 'staging', '--keys', writeList('keys2.txt', ['news/item.html']), '--dest', dest()]);
    expect(ok.status, ok.out).toBe(0);
    expect(callsOf('s3api get-object').map((c) => c[c.indexOf('--key') + 1])).toEqual(['news/item.html']);
  });

  it('refuses an unversioned bucket, where no edit could be rolled back', () => {
    const s = readState();
    s.unversioned = true;
    writeState(s);
    const res = pull();
    expect(res.status).toBe(1);
    expect(res.out).toContain('not versioned');
  });
});

describe('archive-edit.sh check', () => {
  beforeEach(() => {
    const res = pull();
    expect(res.status, res.out).toBe(0);
  });
  function check(...args: Array<string | Record<string, string>>) {
    const flags = args.filter((a): a is string => typeof a === 'string');
    const extraEnv = Object.assign({}, ...args.filter((a) => typeof a !== 'string'));
    return run(['check', '--dest', dest(), ...flags], extraEnv);
  }

  it('passes a sound edit, re-encodes changed media with the sanitising settings, and stamps it', () => {
    fs.writeFileSync(tree('news/item.html'), PAGE('item, corrected'));
    fs.writeFileSync(tree('news/new.jpg'), Buffer.concat([JPEG, Buffer.from('new')]));
    fs.writeFileSync(tree('news/clip.mp4'), Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom clip')]));
    // A WebM recording is an input the platform's video transcode accepts.
    fs.writeFileSync(tree('news/webm.mp4'), Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('webm clip')]));
    const res = check();
    expect(res.status, res.out).toBe(0);
    const stamp = fs.readFileSync(path.join(dest(), 'state', 'check-stamp.tsv'), 'utf8');
    expect(stamp).toMatch(/^file\tnews\/item\.html\t[0-9a-f]{64}$/m);
    // Defect caught: an added photograph or video published with whatever it carried.
    expect(fs.readFileSync(tree('news/new.jpg'), 'utf8').endsWith('ENCODED')).toBe(true);
    expect(fs.readFileSync(tree('news/clip.mp4'), 'utf8').endsWith('ENCODED')).toBe(true);
    expect(fs.readFileSync(tree('news/webm.mp4'), 'utf8').endsWith('ENCODED')).toBe(true);
    // An unchanged pulled photograph is not re-encoded.
    expect(fs.readFileSync(tree('news/photo.jpg'))).toEqual(JPEG);
    // Defect caught: video encoded by a private copy of the ffmpeg options,
    // which drifts from the platform's transcode. The real transcode entry ran
    // (no stand-in is set for it), so the PATH ffmpeg saw the worker's own
    // stripping options, once per video.
    expect(res.out).not.toContain("stand-in for the platform's video transcode");
    expect(videoCalls()).toHaveLength(2);
    for (const call of videoCalls()) {
      for (const arg of ['-map_metadata -1', '-map_chapters -1', '-c:v libx264', '-movflags +faststart']) {
        expect(call, arg).toContain(arg);
      }
    }
    const still = ffmpegCalls().find((c) => c.includes('-q:v'))!;
    expect(still).toContain('-map_metadata -1');
    expect(still).toContain('-frames:v 1');

    // Defect caught: a second check re-encoding its own output, degrading it each time.
    const again = check();
    expect(again.status, again.out).toBe(0);
    expect(ffmpegCalls()).toHaveLength(1);
    expect(videoCalls()).toHaveLength(2);
  });

  it('refuses to encode video when the PATH ffmpeg is not production\'s pinned release', () => {
    // Defect caught: video encoded by a workstation's own ffmpeg release, whose
    // output says nothing about what production would produce.
    fs.writeFileSync(tree('news/clip.mp4'), Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom clip')]));
    const res = check({ FAKE_FFMPEG_VERSION: '6.1.1' });
    expect(res.status).toBe(1);
    expect(res.out).toContain("not production's pinned release");
    expect(res.out).toContain('ffmpeg 6.1.1 is installed');
    expect(videoCalls()).toEqual([]);
    expect(fs.existsSync(path.join(dest(), 'state', 'check-stamp.tsv'))).toBe(false);
    // The same edit passes once the pinned release is the one on the PATH.
    const ok = check();
    expect(ok.status, ok.out).toBe(0);
    expect(videoCalls()).toHaveLength(1);
  });

  it('runs a stand-in for the video transcode when one is named, and says so', () => {
    const stub = path.join(bin, 'transcode');
    writeExec(stub, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(path.join(work, 'transcode-calls.log'))}\n{ cat "$1"; printf ENCODED; } > "$2"\n`);
    fs.writeFileSync(tree('news/clip.mp4'), Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom clip')]));
    const res = check({ ARCHIVE_EDIT_TRANSCODE: stub });
    expect(res.status, res.out).toBe(0);
    expect(res.out).toContain("NOTE: using a stand-in for the platform's video transcode");
    // The transcode's interface: an input and an .mp4 output, nothing else.
    expect(logLines('transcode-calls.log')).toHaveLength(1);
    expect(logLines('transcode-calls.log')[0]).toMatch(/^\S+\/in\.mp4 \S+\/out\.mp4$/);
    expect(videoCalls()).toEqual([]);
  });

  it('refuses a changed page that breaks an archive promise, encodes nothing and leaves no stamp', () => {
    fs.writeFileSync(tree('news/item.html'), PAGE('<script>alert(1)</script>'));
    fs.writeFileSync(tree('news/new.jpg'), JPEG);
    const res = check();
    expect(res.status).toBe(1);
    expect(res.out).toContain('news/item.html: code: a <script> element');
    expect(fs.existsSync(path.join(dest(), 'state', 'check-stamp.tsv'))).toBe(false);
    expect(ffmpegCalls()).toEqual([]);
  });

  it('refuses media whose bytes are not what the name claims, and media the encoder rejects', () => {
    // Defect caught: an arbitrary file published under an image name.
    fs.writeFileSync(tree('news/fake.jpg'), 'MZ not a picture');
    fs.writeFileSync(tree('news/bad.jpg'), Buffer.concat([JPEG, Buffer.from('BADMEDIA')]));
    // A video's input is judged by the platform's transcode, which refuses non-video.
    fs.writeFileSync(tree('news/fake.mp4'), 'MZ this is not a video file');
    const res = check();
    expect(res.status).toBe(1);
    expect(res.out).toContain('news/fake.jpg: its bytes are not the format its name claims');
    expect(res.out).toMatch(/news\/fake\.mp4: the sanitising encode failed: .*unrecognized video format/);
    expect(videoCalls()).toEqual([]);
    expect(res.out).toMatch(/news\/bad\.jpg: the sanitising encode failed: Invalid data/);
    expect(fs.existsSync(path.join(dest(), 'state', 'check-stamp.tsv'))).toBe(false);
  });

  it('refuses a pulled file removed from the tree but not listed for deletion', () => {
    // Defect caught: an accidental local delete pushed as a withdrawal.
    fs.rmSync(tree('news/item.html'));
    const res = check();
    expect(res.status).toBe(1);
    expect(res.out).toContain('news/item.html was pulled and is missing from the tree, but is not on the delete list');
  });

  it('refuses a delete that a pulled page still links to, and passes it once the link is gone', () => {
    fs.rmSync(tree('news/old.html'));
    const list = writeList('delete.txt', ['news/old.html']);
    const res = check('--delete-list', list);
    expect(res.status).toBe(1);
    expect(res.out).toContain('news/index.html: links to a deleted key: old.html');
    fs.writeFileSync(tree('news/index.html'), PAGE('<a href="item.html">item</a>'));
    const ok = check('--delete-list', list);
    expect(ok.status, ok.out).toBe(0);
  });

  it('refuses a delete of a key still in the tree, or one never pulled', () => {
    const res = check('--delete-list', writeList('delete.txt', ['news/item.html', 'elsewhere/page.html']));
    expect(res.status).toBe(1);
    expect(res.out).toContain('news/item.html, which is still in the tree');
    expect(res.out).toContain('elsewhere/page.html, which was not pulled');
  });

  it('refuses a file under the reserved _gate/ prefix', () => {
    // Defect caught: an edit overwriting the Terraform-owned refusal pages.
    fs.mkdirSync(path.dirname(tree('_gate/denied.html')), { recursive: true });
    fs.writeFileSync(tree('_gate/denied.html'), PAGE('replaced'));
    const res = check();
    expect(res.status).toBe(1);
    expect(res.out).toContain('_gate/denied.html: a key under the reserved _gate/ prefix');
  });
});

describe('archive-edit.sh push', () => {
  /** Pull, make the standard edit, and check it. */
  function prepared() {
    expect(pull().status).toBe(0);
    fs.writeFileSync(tree('news/item.html'), PAGE('item, corrected'));
    fs.writeFileSync(tree('news/added.html'), PAGE('<a href="item.html">item</a>'));
    fs.rmSync(tree('news/old.html'));
    fs.writeFileSync(tree('news/index.html'), PAGE('<a href="item.html">item</a><a href="added.html">added</a>'));
    const list = writeList('delete.txt', ['news/old.html']);
    const c = run(['check', '--dest', dest(), '--delete-list', list]);
    expect(c.status, c.out).toBe(0);
    return list;
  }
  const push = (list: string) => runAtTerminal(['push', '--target', 'staging', '--dest', dest(), '--delete-list', list]);

  it.skipIf(!HAS_SCRIPT)('writes each change conditionally, invalidates exactly those paths, runs the edge proof and reports every version', () => {
    const list = prepared();
    const res = push(list);
    expect(res.status, res.out).toBe(0);

    const puts = callsOf('s3api put-object');
    const put = (key: string) => puts.find((c) => c[c.indexOf('--key') + 1] === key)!;
    // Defect caught: a changed key overwritten without proof it is still what was pulled.
    expect(put('news/item.html').slice(put('news/item.html').indexOf('--if-match'), put('news/item.html').indexOf('--if-match') + 2)).toEqual(['--if-match', '"seed-v4"']);
    // Defect caught: a new key silently replacing one another writer created meanwhile.
    expect(put('news/added.html')).toContain('--if-none-match');
    expect(put('news/added.html')[put('news/added.html').indexOf('--if-none-match') + 1]).toBe('*');
    // Defect caught: a page served with a guessed type, downloaded instead of shown.
    expect(versions('news/item.html').at(-1)!.ct).toBe('text/html');
    const del = callsOf('s3api delete-object')[0];
    expect(del[del.indexOf('--key') + 1]).toBe('news/old.html');
    expect(del[del.indexOf('--if-match') + 1]).toBe('"seed-v5"');
    // No whole-bucket operation of any kind.
    expect(calls().some((c) => c.includes('--delete') || c[1] === 'sync')).toBe(false);

    expect(bucketBody('news/item.html')).toBe(PAGE('item, corrected'));
    expect(bucketBody('news/old.html')).toBeNull();
    expect(bucketBody('_gate/denied.html')).toBe(PAGE('denied'));

    // Defect caught: the edge serving the old bytes for a year, or a whole-cache invalidation.
    const inv = callsOf('cloudfront create-invalidation');
    expect(inv).toHaveLength(1);
    const paths = inv[0].slice(inv[0].indexOf('--paths') + 1, inv[0].indexOf('--query')).sort();
    expect(paths).toEqual(['/news/added.html', '/news/index.html', '/news/item.html', '/news/old.html']);
    expect(edgeCalls()).toEqual(['--target staging']);

    // Defect caught: a push whose replaced versions are lost, so it cannot be rolled back.
    const reports = fs.readdirSync(path.join(dest(), 'state')).filter((f) => /^push-.*\.tsv$/.test(f));
    expect(reports).toHaveLength(1);
    const rows = fs.readFileSync(path.join(dest(), 'state', reports[0]), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'));
    const row = (key: string) => rows.find((r) => r[1] === key)!;
    expect(row('news/item.html').slice(0, 3)).toEqual(['change', 'news/item.html', 'v4']);
    expect(row('news/item.html')[4]).toBe(versions('news/item.html').at(-1)!.v);
    expect(row('news/added.html').slice(0, 3)).toEqual(['add', 'news/added.html', '-']);
    expect(row('news/old.html').slice(0, 3)).toEqual(['delete', 'news/old.html', 'v5']);

    // A second push from the same directory has nothing left to write.
    const again = push(list);
    expect(again.status, again.out).toBe(0);
    expect(again.out).toContain('Nothing to push');
    expect(callsOf('s3api put-object')).toHaveLength(3);
    // Defect caught: a key the push deleted reported as an accidental local
    // removal, so the directory can never be checked again.
    const recheck = run(['check', '--dest', dest(), '--delete-list', list]);
    expect(recheck.status, recheck.out).toBe(0);
  });

  it.skipIf(!HAS_SCRIPT)('stops at a key another writer changed since the pull, writes nothing past it, and reports it', () => {
    const list = prepared();
    seed('news/item.html', PAGE('someone else'));
    const res = push(list);
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/news\/item\.html: not written; .*\(PreconditionFailed\)/);
    // Defect caught: the other writer's change lost to a blind overwrite.
    expect(bucketBody('news/item.html')).toBe(PAGE('someone else'));
    // The run stops at the refusal: the delete after it never runs.
    expect(callsOf('s3api delete-object')).toEqual([]);
    expect(bucketBody('news/old.html')).toBe(PAGE('old'));
    // What did land before it (added keys first, then changes in key order) is
    // invalidated, and only that.
    const inv = callsOf('cloudfront create-invalidation');
    expect(inv.map((c) => c.slice(c.indexOf('--paths') + 1, c.indexOf('--query')))).toEqual([['/news/added.html', '/news/index.html']]);
  });

  it.skipIf(!HAS_SCRIPT)('refuses unless the archive-source parameter reads exactly "bucket"', () => {
    const list = prepared();
    for (const param of ['crawl', 'Bucket', null]) {
      const s = readState();
      s.param = param;
      writeState(s);
      const res = push(list);
      expect(res.status, String(param)).toBe(1);
      expect(res.out).toContain(param === null ? 'does not exist' : `reads '${param}', not 'bucket'`);
    }
    // Defect caught: an edit made before the cutover, overwritten by the next publish.
    expect(callsOf('s3api put-object')).toEqual([]);
  });

  it.skipIf(!HAS_SCRIPT)('refuses a tree changed after its check, and a different delete list', () => {
    const list = prepared();
    // Defect caught: unchecked bytes pushed because a check once passed.
    fs.writeFileSync(tree('news/item.html'), PAGE('<script>alert(1)</script>'));
    const res = push(list);
    expect(res.status).toBe(1);
    expect(res.out).toContain('news/item.html has changed since the last passing check');
    fs.writeFileSync(tree('news/item.html'), PAGE('item, corrected'));
    const other = push(writeList('other.txt', []));
    expect(other.status).toBe(1);
    expect(other.out).toContain('not the one the last check passed');
    expect(callsOf('s3api put-object')).toEqual([]);
  });

  it('refuses with no terminal to confirm on, even with the accept flag exported, and writes nothing', () => {
    const list = prepared();
    const res = run(['push', '--target', 'staging', '--dest', dest(), '--delete-list', list], { ASSUME_YES: 'yes' });
    expect(res.status).toBe(1);
    expect(res.out).toContain('no terminal to confirm on');
    expect(callsOf('s3api put-object')).toEqual([]);
    expect(callsOf('s3api delete-object')).toEqual([]);
  });

  it.skipIf(!HAS_SCRIPT)('writes nothing when the operator types anything but APPLY', () => {
    const list = prepared();
    const res = runAtTerminal(['push', '--target', 'staging', '--dest', dest(), '--delete-list', list], 'yes\n');
    expect(res.status).toBe(1);
    expect(callsOf('s3api put-object')).toEqual([]);
  });

  it('refuses a push to an environment other than the one pulled from', () => {
    const list = prepared();
    const res = run(['push', '--target', 'production', '--dest', dest(), '--delete-list', list]);
    expect(res.status).toBe(1);
    expect(res.out).toContain('was pulled from staging, not production');
    expect(callsOf('s3api put-object')).toEqual([]);
  });
});

describe('archive-edit.sh rollback', () => {
  function pushed() {
    expect(pull().status).toBe(0);
    fs.writeFileSync(tree('news/item.html'), PAGE('item, corrected'));
    fs.writeFileSync(tree('news/added.html'), PAGE('added'));
    fs.rmSync(tree('news/old.html'));
    fs.writeFileSync(tree('news/index.html'), PAGE('<a href="item.html">item</a>'));
    const list = writeList('delete.txt', ['news/old.html']);
    expect(run(['check', '--dest', dest(), '--delete-list', list]).status).toBe(0);
    const p = runAtTerminal(['push', '--target', 'staging', '--dest', dest(), '--delete-list', list]);
    expect(p.status, p.out).toBe(0);
    const name = fs.readdirSync(path.join(dest(), 'state')).find((f) => /^push-.*\.tsv$/.test(f))!;
    return path.join(dest(), 'state', name);
  }

  it.skipIf(!HAS_SCRIPT)('puts every replaced version back, removes what the push added and restores what it deleted', () => {
    const report = pushed();
    const before = callsOf('cloudfront create-invalidation').length;
    const res = runAtTerminal(['rollback', '--target', 'staging', '--report', report]);
    expect(res.status, res.out).toBe(0);
    // Defect caught: a bad edit that cannot be undone.
    expect(bucketBody('news/item.html')).toBe(PAGE('item'));
    expect(bucketBody('news/index.html')).toBe(PAGE('<a href="old.html">old</a><a href="item.html">item</a>'));
    expect(bucketBody('news/old.html')).toBe(PAGE('old'));
    expect(bucketBody('news/added.html')).toBeNull();
    // The pushed version of the added key stays recoverable under a delete marker.
    expect(versions('news/added.html').filter((v) => v.blob)).toHaveLength(1);
    // Each restore was conditional on the version the push wrote.
    const copy = callsOf('s3api copy-object').find((c) => c[c.indexOf('--key') + 1] === 'news/item.html')!;
    expect(copy).toContain('--if-match');
    expect(copy[copy.indexOf('--copy-source') + 1]).toBe(`${BUCKET}/news/item.html?versionId=v4`);
    const restore = callsOf('s3api copy-object').find((c) => c[c.indexOf('--key') + 1] === 'news/old.html')!;
    expect(restore[restore.indexOf('--if-none-match') + 1]).toBe('*');
    expect(callsOf('cloudfront create-invalidation').length).toBe(before + 1);

    // A second rollback reads back that it is done and changes nothing.
    const writes = callsOf('s3api copy-object').length;
    const again = runAtTerminal(['rollback', '--target', 'staging', '--report', report]);
    expect(again.status, again.out).toBe(0);
    expect(again.out).toContain('Nothing to roll back');
    expect(callsOf('s3api copy-object').length).toBe(writes);
  });

  it.skipIf(!HAS_SCRIPT)('refuses the whole rollback when a key changed after the push, and changes nothing', () => {
    const report = pushed();
    seed('news/item.html', PAGE('a later fix'));
    const res = runAtTerminal(['rollback', '--target', 'staging', '--report', report]);
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/news\/item\.html: not rolled back; its current version is v\d+, not v\d+/);
    // Defect caught: a rollback discarding a later, unrelated fix.
    expect(bucketBody('news/item.html')).toBe(PAGE('a later fix'));
    expect(callsOf('s3api copy-object')).toEqual([]);
    expect(bucketBody('news/old.html')).toBeNull();
  });
});

describe('archive-edit.sh preview', () => {
  it('prints a loopback-only server command for the pulled tree, and refuses a directory with none', () => {
    const none = run(['preview', '--dest', dest()]);
    expect(none.status).toBe(1);
    expect(pull().status).toBe(0);
    const res = run(['preview', '--dest', dest()]);
    expect(res.status, res.out).toBe(0);
    // Defect caught: members-only pages served to the local network.
    expect(res.out).toContain(`python3 -m http.server --bind 127.0.0.1 --directory ${path.join(dest(), 'tree')} 8000`);
  });
});
