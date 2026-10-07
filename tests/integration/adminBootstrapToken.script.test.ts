/**
 * Integration tests for scripts/admin-bootstrap-token.sh.
 *
 * The script mints the single-shot credential that turns a registered account
 * into the first administrator, stores it in the parameter store and shows it
 * once. Each guard here protects a live admin credential:
 *
 * - provisioning never overwrites a parameter that already exists, because a
 *   live token means a handoff may be in flight;
 * - with no terminal to show the token on, nothing is minted or stored, because
 *   a credential nobody can read is a live credential needing cleanup;
 * - cleanup with nothing to remove deletes nothing and succeeds;
 * - cleanup of a present token deletes nothing without a typed confirmation on a
 *   terminal, and an exported accept-without-asking variable does not stand in
 *   for it, because the token may be one a first admin is about to use;
 * - the token reaches the parameter store only through the restricted request
 *   file, never on any command line, where any process reader could see it.
 *
 * The AWS CLI is replaced through the script's named seam. The stand-in records
 * every argument vector it receives and copies the request file it is handed, so
 * the suite can compare the token in the request with every argument any call
 * carried. Nothing it parses is tool output: the script judges the parameter's
 * existence on the CLI's exit status alone, which is the contracted part.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';
import { requireToolInCI } from '../fixtures/toolAvailability';

const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'admin-bootstrap-token.sh');
const PARAM = '/footbag/staging/app/bootstrap/admin_token';

/**
 * The no-terminal case has to create its own absence of a terminal. A developer
 * running the suite from a shell hands a controlling terminal to every spawned
 * process, and the script would then mint a token and write it to that
 * developer's terminal. `setsid` gives the run a session with no controlling
 * terminal; `--wait` keeps its exit status.
 */
const SETSID = requireToolInCI('setsid', '--version');

let dir: string;

beforeAll(() => {
  dir = createScratchDir('admin-bootstrap-token');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Every argument vector the stand-in AWS CLI received, one array per call. */
  calls: string[][];
  /** The request file's content as the stand-in read it, when put-parameter ran. */
  request: string | null;
  /** The request file's path as the script named it. */
  requestPath: string | null;
}

function run(
  args: string[],
  opts: { parameterExists?: boolean; noTerminal?: boolean; extraEnv?: Record<string, string> } = {},
): Run {
  const caseDir = createScratchDir('admin-bootstrap-token-case');
  const log = join(caseDir, 'calls.log');
  const capture = join(caseDir, 'request.json');
  const capturedPath = join(caseDir, 'request.path');
  const exists = join(caseDir, 'exists');
  if (opts.parameterExists) writeFileSync(exists, '');

  const stub = join(caseDir, 'aws-stub.sh');
  writeFileSync(
    stub,
    [
      '#!/usr/bin/env bash',
      // One call per line, arguments separated by a unit separator so an
      // argument carrying spaces stays one argument.
      'printf "%s\\x1f" "$@" >> "$STUB_LOG"; printf "\\n" >> "$STUB_LOG"',
      'case "$1 $2" in',
      '  "ssm get-parameter") [[ -f "$STUB_EXISTS" ]] && exit 0; echo "ParameterNotFound" >&2; exit 254 ;;',
      '  "ssm put-parameter")',
      '    for a in "$@"; do',
      '      if [[ "$a" == file://* ]]; then',
      '        cp "${a#file://}" "$STUB_CAPTURE"; printf "%s" "${a#file://}" > "$STUB_CAPTURED_PATH"',
      '      fi',
      '    done',
      '    exit 0 ;;',
      '  "ssm delete-parameter") exit 0 ;;',
      'esac',
      'echo "unexpected aws invocation: $*" >&2',
      'exit 64',
    ].join('\n'),
  );
  chmodSync(stub, 0o755);

  const env = {
    ...process.env,
    ...awsIdentityStubEnv(caseDir),
    ADMIN_BOOTSTRAP_AWS_BIN: stub,
    STUB_LOG: log,
    STUB_EXISTS: exists,
    STUB_CAPTURE: capture,
    STUB_CAPTURED_PATH: capturedPath,
    ...opts.extraEnv,
  };
  const [command, argv] = opts.noTerminal
    ? ['setsid', ['--wait', 'bash', SCRIPT, ...args]]
    : ['bash', [SCRIPT, ...args]];
  const res = spawnSync(command as string, argv as string[], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });

  const calls = existsSync(log)
    ? readFileSync(log, 'utf-8')
        .split('\n')
        .filter((l) => l.length > 0)
        .map((l) => l.split('\x1f').slice(0, -1))
    : [];
  const result: Run = {
    status: res.status,
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    calls,
    request: existsSync(capture) ? readFileSync(capture, 'utf-8') : null,
    requestPath: existsSync(capturedPath) ? readFileSync(capturedPath, 'utf-8') : null,
  };
  rmSync(caseDir, { recursive: true, force: true });
  return result;
}

const verbs = (r: Run) => r.calls.map((c) => `${c[0]} ${c[1]}`);

describe('admin-bootstrap-token.sh guards the first-admin credential', () => {
  it('refuses to provision over an existing parameter and writes nothing', () => {
    // An overwrite would kill a token already handed to the intended first admin
    // and replace it with one nobody holds.
    const r = run(['--target', 'staging', 'provision'], { parameterExists: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`REFUSING: ${PARAM} already exists`);
    expect(verbs(r)).not.toContain('ssm put-parameter');
  });

  it.skipIf(!SETSID)('refuses with no terminal before anything is minted or stored', () => {
    // The token is shown once, on the terminal. Stored with no terminal to show
    // it on, it would be a live admin credential that nobody can read.
    const r = run(['--target', 'staging', 'provision'], { noTerminal: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no terminal to display the token on');
    expect(verbs(r)).not.toContain('ssm put-parameter');
    expect(r.request).toBeNull();
  });

  it('cleanup with nothing present deletes nothing and succeeds', () => {
    // A cleanup run after the app already self-deleted the parameter is the
    // ordinary case, not an error.
    const r = run(['--target', 'staging', 'cleanup']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`Nothing to do: ${PARAM} does not exist`);
    expect(verbs(r)).not.toContain('ssm delete-parameter');
  });

  it.skipIf(!SETSID)('refuses to delete a present token with no terminal to confirm on', () => {
    // An unconfirmed delete kills a token already handed to the intended first
    // admin, who then cannot claim the role.
    const r = run(['--target', 'staging', 'cleanup'], { parameterExists: true, noTerminal: true });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Not confirmed; nothing was deleted.');
    expect(verbs(r)).toContain('ssm get-parameter');
    expect(verbs(r)).not.toContain('ssm delete-parameter');
  });

  it.skipIf(!SETSID)('an exported ASSUME_YES does not confirm the delete', () => {
    // A variable left in the operator's shell by another tool must not answer a
    // prompt guarding a live credential.
    const r = run(['--target', 'staging', 'cleanup'], {
      parameterExists: true,
      noTerminal: true,
      extraEnv: { ASSUME_YES: 'yes' },
    });
    expect(r.status).toBe(1);
    expect(verbs(r)).not.toContain('ssm delete-parameter');
  });

  it('stores the token only through the restricted request file, never on a command line', () => {
    // Any process reader on the workstation sees every argument vector, so a
    // token passed as an argument is a leaked admin credential.
    const r = run(['--target', 'staging', '--print-to-stdout', 'provision']);
    expect(r.status, r.stderr).toBe(0);

    const put = r.calls.filter((c) => c[0] === 'ssm' && c[1] === 'put-parameter');
    expect(put).toHaveLength(1);
    expect(r.request, 'the stand-in never received a file:// request').not.toBeNull();
    const request = JSON.parse(r.request as string) as { Name: string; Type: string; Value: string };
    expect(request.Name).toBe(PARAM);
    expect(request.Type).toBe('SecureString');
    expect(request.Value).toMatch(/^[0-9a-f]{64}$/);

    // The handoff line carries the token that was stored, not some other value.
    expect(r.stdout).toContain(`  ${request.Value}`);
    for (const call of r.calls) {
      for (const arg of call) {
        expect(arg, `token reached an argument: aws ${call.join(' ')}`).not.toContain(request.Value);
      }
    }
    // The request file does not outlive the run.
    expect(r.requestPath).not.toBeNull();
    expect(existsSync(r.requestPath as string)).toBe(false);
  });

  it('says on stderr that its AWS CLI is a stand-in', () => {
    // A stubbed run proves nothing about the account, so it must not read like a
    // real one in a log an operator later trusts.
    const r = run(['--target', 'staging', 'cleanup']);
    expect(r.stderr).toContain('using a stand-in for the AWS CLI');
  });
});
