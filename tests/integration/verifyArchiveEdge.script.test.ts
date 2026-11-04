/**
 * Integration tests for scripts/verify-archive-edge.sh.
 *
 * The edge proof is the only thing that establishes a member can read the
 * archive through the distribution, and that nobody else can: a sync and an
 * invalidation that both report success say nothing about either. It runs at the
 * end of every archive publish, so a proof that cannot fail would wave through a
 * distribution that serves the archive to everyone or to no one.
 *
 * curl, Terraform and the AWS CLI are replaced through the script's named seams;
 * openssl is the real one, signing with a key generated here. The stand-in curl
 * plays the distribution: it reads the cookie header file the script hands it,
 * verifies the signature against the matching public key with openssl, and
 * answers from a table keyed by URL and by whether the request carried no
 * cookie, a valid one or an invalid one. So a case passes only when the script
 * signs a cookie the distribution would accept and corrupts one it would refuse.
 *
 * What the stand-in reads is contracted rather than scraped: curl's
 * `-w '%{http_code}'` prints the bare three-digit status by definition, the
 * cookie header is text the script itself wrote, and the robots check reads one
 * named HTTP response header.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'verify-archive-edge.sh');

const DOMAIN = 'archive.example.test';
const KEY_PAIR_ID = 'KSTUBKEYPAIRID';
const BUCKET = 'footbag-staging-archive-stub';

let dir: string;
let privateKeyPem: string;
let keyPath: string;

/** The distribution as it should behave when content is cookie-gated. */
const CORRECT_TABLE = [
  ['none', `https://${DOMAIN}/_gate/denied.html`, '200', 'the archive is for members'],
  ['none', '*', '403', 'Sign in to read the archive'],
  ['invalid', '*', '403', 'Sign in to read the archive'],
  ['valid', `https://${DOMAIN}/no-such-key-*`, '404', 'not found'],
  ['valid', '*', '200', '<h1>archive</h1>'],
];
const CORRECT_HEADERS =
  'HTTP/2 200\r\ncontent-type: text/html\r\nx-robots-tag: noindex, nofollow\r\n\r\n';

beforeAll(() => {
  dir = createScratchDir('verify-archive-edge');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  keyPath = join(dir, 'archive-signing-key-staging.pem');
  writeFileSync(keyPath, privateKeyPem, { mode: 0o600 });
  writeFileSync(join(dir, 'public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));

  const curl = join(dir, 'curl-stub.sh');
  writeFileSync(
    curl,
    [
      '#!/usr/bin/env bash',
      'printf "%s\\x1f" "$@" >> "$STUB_LOG"; printf "\\n" >> "$STUB_LOG"',
      'out=/dev/null; head=0; header=""; url=""',
      'while [[ $# -gt 0 ]]; do',
      '  case "$1" in',
      '    -sSI) head=1; shift ;;',
      '    -sS) shift ;;',
      '    -o) out="$2"; shift 2 ;;',
      '    -w) shift 2 ;;',
      '    -H) header="$2"; shift 2 ;;',
      '    *) url="$1"; shift ;;',
      '  esac',
      'done',
      'if [[ "$head" -eq 1 ]]; then printf "%b" "$(cat "$STUB_HEADERS")"; exit 0; fi',
      'state=none',
      'if [[ -n "$header" ]]; then',
      '  state=invalid',
      '  if [[ "$header" == @* ]]; then',
      '    line="$(cat "${header#@}")"',
      '    pol="$(sed -n "s/.*CloudFront-Policy=\\([^;]*\\).*/\\1/p" <<< "$line")"',
      '    sig="$(sed -n "s/.*CloudFront-Signature=\\([^;]*\\).*/\\1/p" <<< "$line")"',
      '    kp="$(sed -n "s/.*CloudFront-Key-Pair-Id=\\([^;]*\\).*/\\1/p" <<< "$line")"',
      '    printf "%s" "$pol" | tr -- "-_~" "+=/" | base64 -d > "$STUB_DIR/policy.$$" 2>/dev/null',
      '    printf "%s" "$sig" | tr -- "-_~" "+=/" | base64 -d > "$STUB_DIR/sig.$$" 2>/dev/null',
      '    if [[ "$kp" == "$STUB_KEY_PAIR_ID" ]] && openssl dgst -sha1 -verify "$STUB_DIR/public.pem" \\',
      '         -signature "$STUB_DIR/sig.$$" "$STUB_DIR/policy.$$" >/dev/null 2>&1; then',
      '      state=valid',
      '    fi',
      '    rm -f "$STUB_DIR/policy.$$" "$STUB_DIR/sig.$$"',
      '  fi',
      'fi',
      'while IFS=$\'\\t\' read -r s pattern code body; do',
      '  [[ "$s" == "$state" ]] || continue',
      '  # shellcheck disable=SC2053',
      '  [[ "$url" == $pattern ]] || continue',
      '  printf "%s" "$body" > "$out"; printf "%s" "$code"; exit 0',
      'done < "$STUB_TABLE"',
      'printf "no row" > "$out"; printf "000"',
    ].join('\n'),
  );
  chmodSync(curl, 0o755);

  writeFileSync(
    join(dir, 'terraform-stub.sh'),
    [
      '#!/usr/bin/env bash',
      'case "${@: -1}" in',
      `  archive_domain) printf '%s' ${DOMAIN} ;;`,
      `  archive_key_pair_id) printf '%s' ${KEY_PAIR_ID} ;;`,
      `  archive_bucket_name) printf '%s' ${BUCKET} ;;`,
      '  archive_requires_signed_cookies) printf true ;;',
      '  *) exit 1 ;;',
      'esac',
    ].join('\n'),
  );
  chmodSync(join(dir, 'terraform-stub.sh'), 0o755);

  // The archive already holds content, so the run never stands up a probe
  // object: the head-object answer is the only AWS call it makes.
  writeFileSync(
    join(dir, 'aws-stub.sh'),
    [
      '#!/usr/bin/env bash',
      'printf "%s\\x1f" "$@" >> "$STUB_LOG"; printf "\\n" >> "$STUB_LOG"',
      '[[ "$1 $2" == "s3api head-object" ]] && exit 0',
      'echo "unexpected aws invocation: $*" >&2; exit 64',
    ].join('\n'),
  );
  chmodSync(join(dir, 'aws-stub.sh'), 0o755);
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  calls: string[][];
}

/** How the aws CLI reports a failed call on stderr. */
const awsFailure = (code: string, op: string) =>
  `An error occurred (${code}) when calling the ${op} operation: stub`;

/**
 * An AWS stand-in for an archive that holds no content yet, so the run stands up
 * the probe object; its removal at the end succeeds or fails as the case says.
 */
function emptyArchiveAws(caseDir: string, removal: 'removed' | 'fails'): string {
  const path = join(caseDir, 'aws-empty-archive.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'printf "%s\\x1f" "$@" >> "$STUB_LOG"; printf "\\n" >> "$STUB_LOG"',
      'case "$1 $2" in',
      `  "s3api head-object") echo ${JSON.stringify(awsFailure('404', 'HeadObject'))} >&2; exit 254 ;;`,
      '  "s3 cp") exit 0 ;;',
      removal === 'fails'
        ? `  "s3 rm") echo ${JSON.stringify(`delete failed: s3://${BUCKET}/edge-proof/index.html ${awsFailure('AccessDenied', 'DeleteObject')}`)} >&2; exit 1 ;;`
        : `  "s3 rm") echo "delete: s3://${BUCKET}/edge-proof/index.html"; exit 0 ;;`,
      'esac',
      'echo "unexpected aws invocation: $*" >&2; exit 64',
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  return path;
}

/** The closing report's list of errors or warnings, so a case asserts what it lists. */
function listed(stderr: string, heading: 'Errors' | 'Warnings'): string {
  const at = stderr.search(new RegExp(`^${heading} \\(\\d+\\):$`, 'm'));
  if (at === -1) return '';
  const rest = stderr.slice(at);
  const end = rest.slice(1).search(/^(Errors|Warnings|Proven:|Not proven:|No errors)/m);
  return end === -1 ? rest : rest.slice(0, end + 1);
}

function run(
  opts: {
    table?: string[][];
    headers?: string;
    now?: number;
    /** Stand up the probe object, whose removal then succeeds or fails. */
    probe?: 'removed' | 'fails';
    /** A caller's report file, as a parent run on the closing-report library exports it. */
    reportTo?: string;
  } = {},
): Run {
  const caseDir = createScratchDir('verify-archive-edge-case');
  const log = join(caseDir, 'calls.log');
  const table = join(caseDir, 'table.tsv');
  const headers = join(caseDir, 'headers.txt');
  writeFileSync(table, (opts.table ?? CORRECT_TABLE).map((r) => r.join('\t')).join('\n') + '\n');
  writeFileSync(headers, JSON.stringify(opts.headers ?? CORRECT_HEADERS).slice(1, -1));

  let path = process.env.PATH ?? '';
  if (opts.now !== undefined) {
    // The cookie's expiry is the only input to the signature the test does not
    // otherwise own; a stand-in clock fixes it.
    const realDate = spawnSync('bash', ['-c', 'command -v date'], { encoding: 'utf-8', ...SPAWN_GUARD })
      .stdout.trim();
    const clock = join(caseDir, 'date');
    writeFileSync(
      clock,
      `#!/usr/bin/env bash\nif [[ "$*" == "+%s" ]]; then echo ${opts.now}; else exec ${realDate} "$@"; fi\n`,
    );
    chmodSync(clock, 0o755);
    path = `${dirname(clock)}:${path}`;
  }

  const res = spawnSync('bash', [SCRIPT, '--target', 'staging', '--signing-key', keyPath], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: path,
      ...awsIdentityStubEnv(caseDir),
      VERIFY_ARCHIVE_EDGE_CURL_BIN: join(dir, 'curl-stub.sh'),
      VERIFY_ARCHIVE_EDGE_TERRAFORM_BIN: join(dir, 'terraform-stub.sh'),
      VERIFY_ARCHIVE_EDGE_AWS_BIN: opts.probe ? emptyArchiveAws(caseDir, opts.probe) : join(dir, 'aws-stub.sh'),
      ...(opts.reportTo ? { FOOTBAG_CR_REPORT_TO: opts.reportTo } : {}),
      STUB_DIR: dir,
      STUB_LOG: log,
      STUB_TABLE: table,
      STUB_HEADERS: headers,
      STUB_KEY_PAIR_ID: KEY_PAIR_ID,
    },
    ...SPAWN_GUARD,
  });
  const calls = existsSync(log)
    ? readFileSync(log, 'utf-8')
        .split('\n')
        .filter((l) => l.length > 0)
        .map((l) => l.split('\x1f').slice(0, -1))
    : [];
  rmSync(caseDir, { recursive: true, force: true });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '', calls };
}

describe('verify-archive-edge.sh proves the archive edge or fails', () => {
  it('passes against a distribution that serves members and refuses everyone else', () => {
    // The baseline the refusals below are measured against: a correctly signed
    // cookie is accepted, a corrupted one is refused, and every row passes.
    const r = run();
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('EDGE PROOF PASSED');
    expect(r.stdout).not.toContain('FAIL');
    expect(r.stderr).toContain('using a stand-in for curl');
  });

  it('fails, naming the row, when a cookie-less request is served instead of refused', () => {
    // An archive served to anyone without a cookie is the members-only promise
    // broken; the body is the expected one, so only the status can catch it.
    const table = [
      ['none', `https://${DOMAIN}/`, '200', 'Sign in to read the archive'],
      ...CORRECT_TABLE,
    ];
    const r = run({ table });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/FAIL {2}root, no cookies\s+got 200, want 403/);
    expect(r.stderr).toContain('EDGE PROOF FAILED: 1 check(s).');
    // The operator reads the end of the run, so the failure is in its closing
    // report, not only in a row that scrolled past.
    expect(listed(r.stderr, 'Errors')).toContain('EDGE PROOF FAILED: 1 check(s).');
  });

  it('fails when the gate page does not carry a noindex robots header', () => {
    // Without it, search engines index the gate pages and the archive's
    // existence is advertised to anyone searching.
    const r = run({ headers: 'HTTP/2 200\r\ncontent-type: text/html\r\n\r\n' });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('FAIL  noindex on gate page');
  });

  it('hands the signed cookie to curl through a header file, never on the command line', () => {
    // The cookie is a bearer credential for the whole archive; on a command line
    // any process reader on the workstation can copy it.
    const r = run();
    const cookieArgs = r.calls.flatMap((c) => c.filter((a, i) => c[i - 1] === '-H'));
    expect(cookieArgs.length).toBeGreaterThan(0);
    for (const arg of cookieArgs) expect(arg.startsWith('@'), `cookie passed inline: ${arg}`).toBe(true);
    for (const call of r.calls) {
      for (const arg of call) expect(arg, `credential in argv: ${call.join(' ')}`).not.toMatch(/CloudFront-(Signature|Policy)=/);
    }
  });

  it('corrupts the signature even when its first two characters are equal', () => {
    // The corrupted-cookie row must present a signature the distribution
    // rejects. A corruption that swaps two characters leaves the signature
    // unchanged whenever they are equal, about one run in sixty-four, and the
    // proof then fails a healthy distribution on that row. The clock is chosen so
    // the signature starts with a repeated character.
    let now = 2_000_000_000;
    let found = false;
    for (let i = 0; i < 10_000 && !found; i += 1) {
      const policy =
        `{"Statement":[{"Resource":"https://${DOMAIN}/*",` +
        `"Condition":{"DateLessThan":{"AWS:EpochTime":${now + 3600}}}}]}`;
      const sig = sign('sha1', Buffer.from(policy), privateKeyPem).toString('base64');
      if (sig[0] === sig[1]) found = true;
      else now += 1;
    }
    expect(found, 'no clock value gave a signature with a repeated first character').toBe(true);
    const r = run({ now });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/PASS {2}corrupted signature/);
  });
});

describe('verify-archive-edge.sh: the probe object it stands up is never left behind unreported', () => {
  const PROBE = `s3://${BUCKET}/edge-proof/index.html`;
  const removals = (r: Run) => r.calls.filter((c) => c[0] === 's3' && c[1] === 'rm').map((c) => c[2]);

  // Defect caught: a probe object the run could not remove stays in the archive
  // bucket, served to members as a page of the archive, and the run reports a
  // clean pass, so nobody knows to delete it.
  it('lists a probe object it could not remove as a warning naming it and the AWS message', () => {
    const r = run({ probe: 'fails' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(removals(r)).toEqual([PROBE]);
    const warnings = listed(r.stderr, 'Warnings');
    expect(warnings).toContain(PROBE);
    expect(warnings).toContain('(AccessDenied)');
  });

  // Defect caught: the probe is never removed, or a removal that took is still
  // reported as a leftover.
  it('removes the probe object it stood up, with nothing to list', () => {
    const r = run({ probe: 'removed' });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(removals(r)).toEqual([PROBE]);
    expect(listed(r.stderr, 'Warnings')).toBe('');
    expect(r.stderr).not.toContain(PROBE);
  });

  // Defect caught: run by the archive publisher, the leftover probe is printed in
  // a report of its own that scrolls past, and the publisher's closing report,
  // the one the operator reads, says nothing about it.
  it('hands the leftover probe to the report of the run that started it', () => {
    const parent = createScratchDir('verify-archive-edge-parent');
    const reportTo = join(parent, 'nested');
    writeFileSync(reportTo, '');
    try {
      const r = run({ probe: 'fails', reportTo });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const handed = readFileSync(reportTo, 'utf-8');
      expect(handed).toMatch(new RegExp(`^WARN\\tverify-archive-edge\\.sh: .*${PROBE.replace(/[.]/g, '\\.')}`, 'm'));
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
