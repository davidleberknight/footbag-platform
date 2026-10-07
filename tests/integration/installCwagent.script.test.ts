/**
 * scripts/install-cwagent-staging.sh and install-cwagent-production.sh — the
 * refusals around retiring the monitoring publisher's access key.
 *
 * A rotation of this credential is three runs: mint the replacement alongside
 * the old key so metrics never stop, prove the new one is the one publishing,
 * then cut the predecessor. The last two were documented and had no code, so a
 * rotation ended with two live keys and retired nothing, which is the failure
 * the shared key library exists to close.
 *
 * The install half carries a credential to a host and belongs to an operator
 * with a real terminal; it is not exercised here. What is pinned is everything
 * that decides whether a live key changes state:
 *
 *   - minting and cutting are separate runs, and asking for both at once is
 *     refused rather than ordered arbitrarily;
 *   - a retirement reaches no host, so it does not fail on an unreachable one
 *     and leave the rotation stuck halfway;
 *   - a retirement is refused unless the three host metrics are bound and live,
 *     because a running agent proves nothing about which credential is
 *     publishing or whether the alarms are watching anything;
 *   - each environment's retirement proves that environment's own namespace;
 *   - deactivating and deleting each take a typed confirmation, and without a
 *     terminal to type it on the key is left alone.
 *
 * The aws CLI is stubbed through the scripts' own seams, so nothing here
 * reaches an account.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync, readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const INSTALLERS = [
  {
    environment: 'staging',
    script: 'scripts/install-cwagent-staging.sh',
    publisher: 'footbag-staging-cwagent-publisher',
    namespace: 'CWAgent',
  },
  {
    environment: 'production',
    script: 'scripts/install-cwagent-production.sh',
    publisher: 'footbag-production-cwagent-publisher',
    namespace: 'CWAgent/production',
  },
] as const;

let stubDir: string;

beforeEach(() => {
  stubDir = mkdtempSync(join(tmpdir(), 'footbag-test-cwagent-install-'));
});

afterEach(() => {
  rmSync(stubDir, { recursive: true, force: true });
});

/**
 * One stub serving both seams, because both scripts reach the same binary: the
 * verification child asks CloudWatch for datapoints and the key library asks
 * IAM for the key list. `datapoints` is what every metric query returns, so a
 * zero is the whole-estate "nothing is arriving" case the retirement must
 * refuse on.
 */
function awsStub(opts: { datapoints?: string; keyRows?: string } = {}): string {
  const datapoints = opts.datapoints ?? '3';
  const keyRows = opts.keyRows ?? 'AKIAOLD\\tActive\\nAKIANEW\\tActive\\n';
  const path = join(stubDir, 'aws-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `echo "$*" >> "${join(stubDir, 'calls.log')}"`,
      'case "$2" in',
      `  get-metric-statistics) echo "${datapoints}";;`,
      '  describe-alarms) echo 3;;',
      `  list-access-keys) printf '%b' "${keyRows}";;`,
      '  update-access-key) exit 0;;',
      '  delete-access-key) exit 0;;',
      'esac',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

function run(script: string, args: string[], stubOpts: Parameters<typeof awsStub>[0] = {}) {
  const stub = awsStub(stubOpts);
  const result = spawnSync('bash', [join(process.cwd(), script), ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      // The run settles and proves its operator identity before it mints a key.
      ...awsIdentityStubEnv(stubDir),
      IAM_KEY_AWS_BIN: stub,
      CWAGENT_VERIFY_AWS_BIN: stub,
    },
    ...SPAWN_GUARD,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function calls(): string[] {
  const log = join(stubDir, 'calls.log');
  if (!existsSync(log)) return [];
  return readFileSync(log, 'utf-8').trim().split('\n');
}

describe.each(INSTALLERS)(
  '$script — retirement guards',
  ({ environment, script, publisher, namespace }) => {
    it('refuses an unknown argument rather than ignoring it', () => {
      const r = run(script, ['--retire', 'AKIAOLD', '--nope']);
      expect(r.status).toBe(2);
      expect(r.stderr).toContain("unknown argument '--nope'");
    });

    it('refuses --retire with no key id', () => {
      const r = run(script, ['--retire']);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/--retire requires the key id/);
    });

    it('refuses --delete with no key id', () => {
      const r = run(script, ['--delete']);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/--delete requires the key id/);
    });

    it('refuses to mint and cut in one run', () => {
      // The window between them is the point: the old key stays active so
      // metrics never stop, and the operator watches before cutting it.
      const r = run(script, ['--rotate', '--retire', 'AKIAOLD']);
      expect(r.status).toBe(2);
      expect(r.stderr).toMatch(/separate/);
    });

    it('reaches no host on a retirement', () => {
      // A key retirement has nothing to do with whether the host is answering.
      // Failing it on an unreachable host would leave a rotation halfway, with
      // two live keys and nothing to say which is in service.
      const r = run(script, ['--retire', 'AKIAOLD'], { datapoints: '0' });
      expect(r.stdout).not.toContain('Deploy target');
      expect(r.stdout).not.toContain('SSH OK');
    });

    it('refuses to retire while the host metrics are not arriving', () => {
      const r = run(script, ['--retire', 'AKIAOLD'], { datapoints: '0' });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/Nothing retired/);
      // Refused before IAM was touched at all, not after reading the key list
      // and changing its mind.
      expect(calls().join('\n')).not.toMatch(/access-key/);
    });

    it(`proves ${environment}'s own metric namespace before retiring`, () => {
      // The agent publishes no instance dimension, so the namespace is the only
      // thing separating one environment's numbers from the other's. Proving
      // the wrong one would retire a production key on staging's evidence.
      run(script, ['--retire', 'AKIAOLD'], { datapoints: '0' });
      const queried = calls().filter((c) => c.includes('get-metric-statistics'));
      expect(queried.length).toBeGreaterThan(0);
      expect(queried.every((c) => c.includes(`--namespace ${namespace} `))).toBe(true);
    });

    it('leaves the key alone when there is no terminal to confirm on', () => {
      const r = run(script, ['--retire', 'AKIAOLD']);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/no terminal to confirm on/);
      expect(calls().join('\n')).not.toMatch(/update-access-key/);
    });

    it('takes a typed confirmation before deleting, and deletes nothing without one', () => {
      const r = run(script, ['--delete', 'AKIAOLD']);
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/no terminal to confirm on/);
      expect(calls().join('\n')).not.toMatch(/delete-access-key/);
    });

    it('names the publisher user it would act on, not a generic identity', () => {
      const r = run(script, ['--delete', 'AKIAOLD']);
      expect(r.stdout).toContain(publisher);
    });

    it('offers the retirement flags in its own usage text', () => {
      // The vault entry this script writes tells the operator to rotate with
      // these flags. A flag named in a credential record and absent from the
      // script is how a documented rotation stops halfway.
      const r = run(script, ['--help']);
      expect(r.stdout).toMatch(/--retire <id>/);
      expect(r.stdout).toMatch(/--delete <id>/);
    });
  },
);

/**
 * The install itself, end to end against stand-ins, for one property: of the
 * credential file redirected into the run, only the first line ever reaches a
 * host. Sudo consumes exactly one line and the remote bash executes everything
 * after it as root, so a second line in that file (a note, another credential)
 * forwarded down the pipe runs as a root command on the host.
 *
 * The run mints the key and shows it for vaulting on a terminal, which is the
 * real operator configuration, so it runs under a pseudo-terminal: standard
 * output and error are the terminal, the vault prompt is answered on it, and
 * standard input stays the credential file. The ssh client is the shared
 * library's announced stand-in, which records every session's stream and
 * answers the host's identity question.
 */
describe.each(INSTALLERS)('$script — the credential file reaches the host one line at a time', ({ environment, script }) => {
  it('sends only the password line of a three-line credential file, to every session', () => {
    const sessions = join(stubDir, 'sessions');
    const ssh = join(stubDir, 'ssh-stand-in.sh');
    writeFileSync(
      ssh,
      [
        '#!/usr/bin/env bash',
        `mkdir -p ${JSON.stringify(sessions)}`,
        `f="$(mktemp ${JSON.stringify(join(sessions, 'session.XXXXXX'))})"`,
        'cat > "$f"',
        'case "$*" in *footbag-host-identity*)',
        `  printf -- "---FOOTBAG-HOST-ENV---\\n${environment}\\n---FOOTBAG-HOST-URL---\\n\\n---FOOTBAG-END---\\n"`,
        'esac',
        'exit 0',
      ].join('\n'),
    );
    chmodSync(ssh, 0o755);

    const aws = join(stubDir, 'iam-stand-in.sh');
    writeFileSync(
      aws,
      [
        '#!/usr/bin/env bash',
        'case "$2" in',
        '  list-access-keys) echo 0 ;;',
        "  create-access-key) printf 'AKIAFIXTUREMINTED001\\tstub-secret-not-real\\n' ;;",
        'esac',
        'exit 0',
      ].join('\n'),
    );
    chmodSync(aws, 0o755);

    const knownHosts = join(stubDir, 'known_hosts');
    writeFileSync(knownHosts, `footbag-${environment} ssh-ed25519 AAAAstub\n`, { mode: 0o600 });
    const cred = join(stubDir, 'credential.txt');
    writeFileSync(cred, 'stub-sudo-pass\nSECOND-LINE-MARKER\nTHIRD-LINE-MARKER\n', { mode: 0o600 });

    // Standard input is the credential file; the controlling terminal, standard
    // output and standard error are a pseudo-terminal whose input already holds
    // the answer to the vault prompt.
    const harness = join(stubDir, 'pty-harness.py');
    writeFileSync(
      harness,
      [
        'import fcntl, os, sys, termios',
        'cred, script = sys.argv[1], sys.argv[2]',
        'master, slave = os.openpty()',
        'pid = os.fork()',
        'if pid == 0:',
        '    os.setsid()',
        '    fcntl.ioctl(slave, termios.TIOCSCTTY, 0)',
        '    fd = os.open(cred, os.O_RDONLY)',
        '    os.dup2(fd, 0); os.dup2(slave, 1); os.dup2(slave, 2)',
        '    os.close(master)',
        "    os.execvp('bash', ['bash', script])",
        'os.close(slave)',
        "os.write(master, b'VAULTED\\n')",
        "out = b''",
        'while True:',
        '    try:',
        '        chunk = os.read(master, 4096)',
        '    except OSError:',
        '        break',
        '    if not chunk:',
        '        break',
        '    out += chunk',
        '_, status = os.waitpid(pid, 0)',
        'sys.stdout.buffer.write(out)',
        'sys.exit(os.waitstatus_to_exitcode(status))',
      ].join('\n'),
    );

    const r = spawnSync(
      'python3',
      ['-I', harness, cred, join(process.cwd(), script)],
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
        env: {
          ...process.env,
          ...NO_AWS_CREDENTIALS,
          ...awsIdentityStubEnv(stubDir),
          IAM_KEY_AWS_BIN: aws,
          FOOTBAG_HOST_SSH_BIN: ssh,
          FOOTBAG_KNOWN_HOSTS: knownHosts,
        },
        ...SPAWN_GUARD,
      },
    );
    expect(r.status, r.stdout).toBe(0);

    const streams = readdirSync(sessions).map((f) => readFileSync(join(sessions, f), 'utf-8'));
    // Two sessions: the host's identity, then the install carrying the key.
    expect(streams).toHaveLength(2);
    expect(streams.some((s) => s.includes('CWAGENT_AKID=AKIAFIXTUREMINTED001'))).toBe(true);
    for (const s of streams) {
      expect(s.split('\n')[0]).toBe('stub-sudo-pass');
      expect(s).not.toContain('SECOND-LINE-MARKER');
      expect(s).not.toContain('THIRD-LINE-MARKER');
    }
  });
});
