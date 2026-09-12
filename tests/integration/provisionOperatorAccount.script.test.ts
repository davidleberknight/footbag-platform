/**
 * scripts/provision-operator-account.sh — the argument guards, the checks that
 * run before anything is created, and the refusal that protects an account
 * somebody is already working from.
 *
 * The mutating half belongs to an operator with a real host and a real sudo
 * password, and is not exercised here. What is pinned instead is everything
 * that happens before the first change, because that is where this script earns
 * its place over the hand-typed root commands it replaces. A key file holding
 * two keys produces a shared login nobody decided to share; a re-run that
 * silently reset the password would invalidate a vault entry its owner is
 * already using; and a run with nowhere to display the generated password would
 * leave a live credential on the host recorded nowhere at all.
 *
 * The host is reached through the script's named test seam, so no connection is
 * ever opened. The seam also has to announce itself: a stubbed run proves
 * nothing about the estate, and a run that looked real while changing nothing
 * would be worse than one that failed.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';

const SCRIPT = join(process.cwd(), 'scripts/provision-operator-account.sh');

/** A syntactically valid ed25519 public key, generated once for this suite. */
let VALID_KEY = '';
let SECOND_KEY = '';
let WORK_DIR = '';

/** Pinned host-key file in the shape require_pinned_known_hosts demands. */
let PIN = '';

/**
 * Stand-in for ssh. It answers the reachability probe and reports the account as
 * absent, which is the state the create path expects; `existingAccount` flips
 * the second answer so the already-exists refusal can be reached.
 */
function sshStub(existingAccount: boolean): string {
  const path = join(WORK_DIR, existingAccount ? 'ssh-exists' : 'ssh-absent');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      'for a in "$@"; do',
      '  case "$a" in',
      "    *\"echo 'SSH OK'\"*) echo '    SSH OK'; exit 0 ;;",
      `    *"id -u"*) exit ${existingAccount ? '0' : '1'} ;;`,
      '  esac',
      'done',
      '# Drain whatever the caller piped in, so it never blocks on a full pipe.',
      'cat > /dev/null',
      'exit 0',
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  return path;
}

beforeAll(() => {
  WORK_DIR = mkdtempSync(join(tmpdir(), 'footbag-test-opacc-'));

  const keygen = (name: string): string => {
    const out = join(WORK_DIR, name);
    const res = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', name, '-f', out], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    if (res.status !== 0) throw new Error(`ssh-keygen failed: ${res.stderr}`);
    return `${out}.pub`;
  };
  VALID_KEY = keygen('operator-key');
  SECOND_KEY = keygen('other-key');

  PIN = join(WORK_DIR, 'footbag_known_hosts');
  writeFileSync(PIN, '# pinned host keys fixture\n');
  chmodSync(PIN, 0o600);
});

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs the script with the sudo password arriving on stdin, exactly as the
 * documented invocation does. stdout and stderr are pipes here, which is also
 * the condition the display guard has to recognise as "no terminal".
 */
function runScript(args: string[], opts: { existingAccount?: boolean } = {}): RunResult {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: 'fixture-sudo-password\n',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      FOOTBAG_PROVISION_SSH: sshStub(opts.existingAccount ?? false),
      FOOTBAG_KNOWN_HOSTS: PIN,
    },
    ...SPAWN_GUARD,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** The full valid argument set, so each case can vary one thing. */
function args(overrides: Partial<Record<string, string>> = {}): string[] {
  const base: Record<string, string> = {
    '--target': 'staging',
    '--account': 'jsymons',
    '--operator': 'Julie Symons',
    '--key-file': VALID_KEY,
    ...overrides,
  };
  return Object.entries(base).flatMap(([k, v]) => (v === '' ? [] : [k, v]));
}

describe('provision-operator-account.sh — invocation guards', () => {
  it('refuses to infer the environment, so a run never lands on an inherited target', () => {
    const result = runScript(args({ '--target': '' }));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--target must be 'staging' or 'production'; there is no default/);
  });

  it('rejects an environment that is neither staging nor production', () => {
    const result = runScript(args({ '--target': 'prod' }));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--target must be 'staging' or 'production'/);
  });

  it('will not derive the account name itself, because that is a human decision', () => {
    const result = runScript(args({ '--account': '' }));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--account is required/);
    expect(result.stderr).toMatch(/human decision/);
  });

  it('requires the operator name, so no account lands unattributable', () => {
    const result = runScript(args({ '--operator': '' }));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--operator is required/);
    expect(result.stderr).toMatch(/host-access inventory/);
  });

  it('rejects an account name the host would refuse, before opening a connection', () => {
    const result = runScript(args({ '--account': 'Julie Symons' }));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/not a usable Linux account name/);
  });

  it('rejects an unknown flag rather than ignoring it', () => {
    const result = runScript([...args(), '--force']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/unknown argument '--force'/);
  });
});

describe('provision-operator-account.sh — what it accepts as a public key', () => {
  it('refuses a path that is not a regular file', () => {
    const result = runScript(args({ '--key-file': join(WORK_DIR, 'nonexistent.pub') }));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/is not a regular file/);
  });

  it('requires a key, naming both ways of supplying one', () => {
    const result = runScript(args({ '--key-file': '' }));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/public key is required/);
    expect(result.stderr).toMatch(/--key-line/);
  });

  it('refuses two sources for one key, so the installed key is the checked one', () => {
    const result = runScript([...args(), '--key-line', 'ssh-ed25519 AAAAC3Nza other@host']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/either --key-line or --key-file, not both/);
  });

  it('takes a pasted key without the operator staging a file for it', () => {
    // The whole point of --key-line: a key arrives as text, and asking an
    // operator to place a file first leaves them a file to remember to remove.
    // It reaches exactly the same validation as a file would, so this run gets
    // as far as the display guard rather than failing on the key.
    const pasted = spawnSync('cat', [VALID_KEY], { encoding: 'utf-8', ...SPAWN_GUARD }).stdout ?? '';
    const result = runScript([
      ...args({ '--key-file': '' }),
      '--key-line',
      pasted.trim(),
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/no terminal to show the new account password on/);
    expect(result.stderr).not.toMatch(/public key/);
  });

  it('validates a pasted key as strictly as a file, so a mangled paste stops here', () => {
    const result = runScript([
      ...args({ '--key-file': '' }),
      '--key-line',
      'ssh-ed25519 this-is-not-a-key julie@example',
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/cannot read .* as a public key file/);
  });

  it('refuses a file ssh-keygen cannot read as a public key', () => {
    const bad = join(WORK_DIR, 'wrapped.pub');
    writeFileSync(bad, 'ssh-ed25519 AAAAC3NzaC1lZDI1\nNTE5AAAAIwrapped user@host\n');
    const result = runScript(args({ '--key-file': bad }));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/cannot read .* as a public key file/);
    // The likeliest cause is named, because a key mangled in transit looks fine.
    expect(result.stderr).toMatch(/wrapped across lines/);
  });

  it('refuses a file holding two keys, which is how a login stops being attributable', () => {
    const both = join(WORK_DIR, 'two.pub');
    const first = spawnSync('cat', [VALID_KEY], { encoding: 'utf-8', ...SPAWN_GUARD }).stdout ?? '';
    const second = spawnSync('cat', [SECOND_KEY], { encoding: 'utf-8', ...SPAWN_GUARD }).stdout ?? '';
    writeFileSync(both, `${first}${second}`);
    const result = runScript(args({ '--key-file': both }));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/holds 2 public keys; expected exactly one/);
    expect(result.stderr).toMatch(/One account, one key/);
  });
});

describe('provision-operator-account.sh — the pinned host key', () => {
  it('refuses to connect without the pin, rather than accepting a key on trust', () => {
    const result = spawnSync('bash', [SCRIPT, ...args()], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      input: 'fixture-sudo-password\n',
      env: {
        ...process.env,
        ...NO_AWS_CREDENTIALS,
        FOOTBAG_PROVISION_SSH: sshStub(false),
        FOOTBAG_KNOWN_HOSTS: join(WORK_DIR, 'no-such-pin'),
      },
      ...SPAWN_GUARD,
    });
    expect(result.status).toBe(1);
    expect(result.stderr ?? '').toMatch(/pinned host-key file not found/);
  });

  it('refuses a pin other accounts could rewrite', () => {
    const loose = join(WORK_DIR, 'loose_known_hosts');
    writeFileSync(loose, '# pinned host keys fixture\n');
    chmodSync(loose, 0o666);
    const result = spawnSync('bash', [SCRIPT, ...args()], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      input: 'fixture-sudo-password\n',
      env: {
        ...process.env,
        ...NO_AWS_CREDENTIALS,
        FOOTBAG_PROVISION_SSH: sshStub(false),
        FOOTBAG_KNOWN_HOSTS: loose,
      },
      ...SPAWN_GUARD,
    });
    expect(result.status).toBe(1);
    expect(result.stderr ?? '').toMatch(/expected it to be non-writable by others/);
  });
});

describe('provision-operator-account.sh — preconditions on the host', () => {
  it('announces the test seam, so a stubbed run is never mistaken for a real one', () => {
    const result = runScript(args());
    expect(result.stderr).toMatch(/SYNTHETIC: ssh=/);
    expect(result.stderr).toMatch(/no host is being changed/);
  });

  it('stops rather than resetting the password of an account that already exists', () => {
    const result = runScript(args(), { existingAccount: true });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/already exists on/);
    // The reason matters more than the refusal: the risk is to a vault entry
    // somebody else is working from, not to the host.
    expect(result.stderr).toMatch(/may already be working from the vault entry/);
    expect(result.stderr).toMatch(/re-run with --rotate/);
  });

  it('refuses --rotate against an account that is not there', () => {
    const result = runScript([...args(), '--rotate'], { existingAccount: false });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/--rotate was given but .* does not exist/);
  });

  it('refuses to mint a password it has nowhere to display, before creating anything', () => {
    // The create path is otherwise clear here: valid args, a good key, a good
    // pin, and a host reporting the account absent. What stops it is that a
    // captured stream is not somewhere a once-shown credential may land.
    const result = runScript(args());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/no terminal to show the new account password on/);
    expect(result.stderr).toMatch(/Nothing has been created/);
  });
});
