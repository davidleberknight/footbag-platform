/**
 * scripts/host-diagnostics.sh — running the host diagnostics from a workstation.
 *
 * The diagnostics were always a script; getting them onto the host was not. The
 * runbook handed an operator an `scp` and then an `ssh`, with a note to upload
 * the file every time rather than reuse a copy already sitting in the home
 * directory, because the deploy ships only the scripts the host itself invokes
 * and any other copy is as old as the last hand upload.
 *
 * Two defects in one step, and this script exists to remove both. A remembered
 * instruction is one that gets skipped under pressure, and then a stale host's
 * answer is read as the current one. And a hand-typed ssh carries none of the
 * host-key pinning the scripts pass on their own command line, so the command
 * somebody ran to inspect a host was the one connection on the whole path with
 * nothing verifying which host had answered.
 *
 * What is pinned here is the refusal surface, and the wire: the one session the
 * script opens is driven against a stand-in host that records what it was sent,
 * so the password's place in the stream, the body it carries and the quoting of
 * the pass-through arguments come from a real run. No host is reached.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { connectingAs, SHARED_ACCOUNT, NAMED_ACCOUNT } from '../fixtures/sshConfigStub';
import { hostIdentityAnswer } from '../fixtures/hostIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/host-diagnostics.sh');

let fakeHome: string;

function run(args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      HOME: fakeHome,
      FOOTBAG_KNOWN_HOSTS: join(fakeHome, 'AWS', 'footbag_known_hosts'),
      // The stand-in ssh answers the one question the credential rule asks: the
      // developer's own ~/.ssh/config would otherwise decide the verdict here.
      ...connectingAs(SHARED_ACCOUNT, fakeHome),
      ...extraEnv,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

/**
 * `who` is the account the alias connects as, not a file name: the rule derives
 * the name, so a fixture that named the file directly could not catch the rule
 * getting it wrong.
 */
function writeCredential(
  target: 'staging' | 'production',
  contents: string,
  who: 'shared' | 'named' = 'shared',
): void {
  mkdirSync(join(fakeHome, 'AWS'), { recursive: true });
  const pair = who === 'shared' ? 'AWS_OPERATOR' : 'DEV_TESTER_HOST';
  const name = target === 'production' ? `${pair}_PRODUCTION.txt` : `${pair}.txt`;
  const path = join(fakeHome, 'AWS', name);
  writeFileSync(path, contents, 'utf-8');
  chmodSync(path, 0o600);
}

function writePin(): void {
  mkdirSync(join(fakeHome, 'AWS'), { recursive: true });
  const pin = join(fakeHome, 'AWS', 'footbag_known_hosts');
  writeFileSync(pin, '203.0.113.10 ssh-ed25519 AAAATESTKEY\n', 'utf-8');
  chmodSync(pin, 0o600);
}

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), 'footbag-test-hostdiag-'));
  connectingAs(SHARED_ACCOUNT, fakeHome);
});

afterEach(() => {
  rmSync(fakeHome, { recursive: true, force: true });
});

describe('host-diagnostics.sh — argument guards', () => {
  it('requires a target rather than defaulting to one', () => {
    // Which host a diagnostic describes is never inherited from ambient state:
    // reading production's state while believing it is staging's is the whole
    // failure this prevents.
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--target is required \('staging' or 'production'\)/);
    expect(r.stderr).toMatch(/deliberately no default/);
  });

  it('refuses a target that is neither environment', () => {
    const r = run(['--target', 'prod']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/must be 'staging' or 'production'/);
  });

  it('refuses an unknown flag rather than ignoring it', () => {
    const r = run(['--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown flag '--nope'");
  });

  it('takes a subcommand as a positional, so it can be passed through', () => {
    // Anything after the flags belongs to the diagnostics script, not to this
    // wrapper, and must not be mistaken for an unknown flag.
    writeCredential('staging', 'pw\n');
    const r = run(['--target', 'staging', 'host-access']);
    expect(r.stderr).not.toMatch(/unknown flag/);
  });
});

describe('host-diagnostics.sh — what it refuses before connecting', () => {
  it('refuses without the operator credential file', () => {
    // The diagnostics use sudo on the host, so they need the sudo password of
    // whatever account the alias connects as.
    writePin();
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/AWS_OPERATOR\.txt is missing or unreadable/);
  });

  it('reads the personal file, not the shared one, when the alias connects as a person', () => {
    // The failure this prevents is quiet: connecting as a named account and
    // piping the shared account's password succeeds at the connection and fails
    // at sudo, on the host, which reads as a broken account and is not one.
    writePin();
    writeCredential('staging', 'pw\n', 'shared');
    const r = run(['--target', 'staging'], { FAKE_SSH_USER: NAMED_ACCOUNT });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/DEV_TESTER_HOST\.txt is missing or unreadable/);
    expect(r.stderr).toMatch(/Nothing else is read in its place/);
  });

  it('refuses a credential file anything else on the machine can read', () => {
    writePin();
    writeCredential('staging', 'pw\n');
    chmodSync(join(fakeHome, 'AWS', 'AWS_OPERATOR.txt'), 0o644);
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/must be 600 or 400/);
    expect(r.stderr).toMatch(/Rotate the password/);
  });

  it('refuses on an empty credential file rather than sending a blank password', () => {
    writePin();
    writeCredential('staging', '\n');
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/first line of .* is empty/);
  });

  it('refuses without the pinned host-key file, as the deploy does', () => {
    // The same refusal for the same reason: the sudo password goes out as line
    // one of the stream, so a connection to an unverified host would hand it
    // over before anything about that host had been checked.
    writeCredential('staging', 'pw\n');
    const r = run(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/pinned host-key file not found/);
  });

  it('reads the production credential file when the target is production', () => {
    // Different hosts, different passwords. Writing only staging's and asking
    // for production must not quietly succeed against the wrong one.
    writePin();
    writeCredential('staging', 'pw\n');
    const r = run(['--target', 'production']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/AWS_OPERATOR_PRODUCTION\.txt is missing or unreadable/);
  });
});

describe('host-diagnostics.sh — the shape of the run', () => {
  const PASSWORD = 'fixture-sudo-password';
  const DIAGNOSTICS = readFileSync(join(process.cwd(), 'scripts/staging_diagnostics.sh'), 'utf-8');

  /**
   * A stand-in host that records the one session the script opens: its argv
   * and the stream it is sent. It answers the configuration query and the
   * identity question first, as every host does, and an `scp` beside it
   * records that it was reached at all.
   */
  function recordingHost(sessionExit = 0): { argv: string; stream: string; scp: string; env: NodeJS.ProcessEnv } {
    const bin = join(fakeHome, 'recordbin');
    mkdirSync(bin, { recursive: true });
    const argv = join(fakeHome, 'session-argv.txt');
    const stream = join(fakeHome, 'session-stream.txt');
    const scp = join(fakeHome, 'scp-reached.txt');
    writeFileSync(join(bin, 'ssh'), [
      '#!/usr/bin/env bash',
      'if [[ "${1:-}" == "-G" ]]; then',
      '  printf "user footbag\\nhostname 203.0.113.10\\nport 2222\\n"; exit 0',
      'fi',
      hostIdentityAnswer(),
      `printf '%s\\n' "$@" > "${argv}"`,
      `cat > "${stream}"`,
      `exit ${sessionExit}`,
    ].join('\n'), 'utf-8');
    chmodSync(join(bin, 'ssh'), 0o755);
    writeFileSync(join(bin, 'scp'), `#!/usr/bin/env bash\necho "$*" > "${scp}"\nexit 1\n`, 'utf-8');
    chmodSync(join(bin, 'scp'), 0o755);
    return { argv, stream, scp, env: { PATH: `${bin}:${process.env.PATH ?? ''}` } };
  }

  it('streams the password as line one and the diagnostics body into one root shell, uploading nothing', () => {
    // Defect caught: the password reaching the host in argv, where every process
    // on the workstation can read it; or the body uploaded as a file, which
    // leaves a copy for the next run to read stale. The stream is the only
    // carrier, so it is read back whole.
    writePin();
    writeCredential('staging', `${PASSWORD}\n`);
    const host = recordingHost();
    const r = run(['--target', 'staging'], host.env);
    expect(r.status, r.stderr).toBe(0);
    const argv = readFileSync(host.argv, 'utf-8');
    expect(argv).not.toContain(PASSWORD);
    expect(argv).toMatch(/sudo -k -S -p '' bash -s --\n$/);
    expect(readFileSync(host.stream, 'utf-8')).toBe(`${PASSWORD}\n${DIAGNOSTICS}`);
    expect(existsSync(host.scp)).toBe(false);
  });

  it('reports the host session failing as its own failure', () => {
    // Defect caught: a sudo refusal or a diagnostics failure on the host read as
    // a clean run, because the wrapper exits 0 whatever the session returned.
    writePin();
    writeCredential('staging', `${PASSWORD}\n`);
    const host = recordingHost(3);
    const r = run(['--target', 'staging'], host.env);
    expect(r.status).toBe(3);
  });

  it('quotes pass-through arguments so the host receives them unsplit', () => {
    // Defect caught: an argument carrying a space arriving as two, so the
    // diagnostics run a different subcommand from the one the operator typed.
    writePin();
    writeCredential('staging', `${PASSWORD}\n`);
    const host = recordingHost();
    const r = run(['--target', 'staging', 'host-access', 'two words'], host.env);
    expect(r.status, r.stderr).toBe(0);
    const command = readFileSync(host.argv, 'utf-8').trimEnd().split('\n').pop() ?? '';
    expect(command).toBe("sudo -k -S -p '' bash -s -- host-access two\\ words");
    // The quoting round-trips: a shell reading that command sees the two
    // arguments the operator gave, not three.
    const parsed = spawnSync('bash', ['-c', `set -- ${command.slice(command.indexOf('-- ') + 3)}; printf '%s\\n' "$@"`], {
      encoding: 'utf-8', ...SPAWN_GUARD,
    });
    expect(parsed.stdout).toBe('host-access\ntwo words\n');
  });
});
