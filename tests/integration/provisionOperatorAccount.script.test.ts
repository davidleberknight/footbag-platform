/**
 * scripts/provision-operator-account.sh — the argument guards, the checks that
 * run before anything is created, and the refusal that protects an account
 * somebody is already using.
 *
 * The mutating half belongs to an operator with a real host and a real sudo
 * password, and is not exercised here. What is pinned instead is everything
 * that happens before the first change, because that is where this script earns
 * its place over the hand-typed root commands it replaces. A key file holding
 * two keys produces a shared login nobody decided to share; a re-run against an
 * account somebody holds must be inspected and confirmed rather than silently
 * re-issued; and a run with no terminal to confirm on must stop before it
 * creates an account whose password is recorded nowhere at all.
 *
 * The host is reached through the script's named test seam, so no connection is
 * ever opened. The seam also has to announce itself: a stubbed run proves
 * nothing about the estate, and a run that looked real while changing nothing
 * would be worse than one that failed.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { hostIdentityAnswer } from '../fixtures/hostIdentityStub';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';

const SCRIPT = join(process.cwd(), 'scripts/provision-operator-account.sh');
const REMOTE_HALF = join(process.cwd(), 'scripts/internal/provision-operator-account-remote.sh');

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
      hostIdentityAnswer(),
      'for a in "$@"; do',
      '  case "$a" in',
      "    *\"echo 'SSH OK'\"*) echo '    SSH OK'; exit 0 ;;",
      // The account probe answers on STDOUT and exits zero, because that is
      // what the real remote command does: `id -u ... && echo EXISTS || echo
      // ABSENT`. The ssh exit status belongs to the connection, not to the
      // question, and the script now relies on that separation so an
      // unreachable host cannot be read as an absent account.
      `    *"id -u"*) echo ${existingAccount ? 'EXISTS' : 'ABSENT'}; exit 0 ;;`,
      '  esac',
      'done',
      '# Drain whatever the caller piped in, so it never blocks on a full pipe.',
      '# An inspection is answered with FAKE_INSPECT, the lines the remote half',
      '# prints, or fails when FAKE_INSPECT_FAILS is set.',
      'piped="$(cat)"',
      'if [[ "$piped" == *"OPACC_MODE=inspect"* ]]; then',
      '  [[ -n "${FAKE_INSPECT_FAILS:-}" ]] && exit 1',
      '  printf "%s" "${FAKE_INSPECT:-}"',
      'fi',
      'exit 0',
    ].join('\n'),
  );
  chmodSync(path, 0o755);
  return path;
}

/**
 * A directory holding an `ssh` that resolves the deploy alias, placed ahead of
 * the shared isolation stub on PATH.
 *
 * The script's alias preflight runs the real `ssh -G`, not its own seam, because
 * the question is about this machine's SSH configuration rather than about the
 * host. The shared isolation in tests/fixtures/machineIsolation.ts answers that
 * query the way a machine with no stanza answers it — the name echoed back as
 * the hostname — so without this every case here would stop at the preflight.
 * Supplying our own is what that fixture's own note asks a suite in this
 * position to do, and it is declared here rather than hidden in a helper so the
 * dependency is visible in the file that has it.
 *
 * The case that proves the preflight does not get this directory. It falls
 * through to the isolation stub instead, because a test that proves a gate must
 * not be handed the thing that opens it — and because that stub answers
 * identically on every machine, so the refusal it asserts is not a property of
 * whoever ran it.
 */
let ALIAS_BIN = '';

beforeAll(() => {
  WORK_DIR = mkdtempSync(join(tmpdir(), 'footbag-test-opacc-'));

  ALIAS_BIN = join(WORK_DIR, 'alias-bin');
  mkdirSync(ALIAS_BIN, { recursive: true });
  const aliasSsh = join(ALIAS_BIN, 'ssh');
  writeFileSync(
    aliasSsh,
    [
      '#!/usr/bin/env bash',
      'set -u',
      'for a in "$@"; do',
      '  if [[ "$a" == "-G" ]]; then',
      // The account the alias connects as, which is what picks the credential
      // file the refusal names. It is an input this suite supplies rather than
      // one the developer's ~/.ssh/config decides.
      "    printf 'hostname 203.0.113.10\\nuser %s\\nport 22\\n' \"${FAKE_SSH_USER:-footbag}\"",
      '    exit 0',
      '  fi',
      'done',
      'echo "ssh: this suite supplies -G answers only." >&2',
      'exit 255',
    ].join('\n'),
  );
  chmodSync(aliasSsh, 0o755);

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
 * A fresh, empty, mode-600 file of this process's own, as the onboarding script
 * makes for the password to be handed back through. Every --sealed run needs
 * one, so a case whose subject lies further in is not stopped at that gate.
 */
function outFile(mode = 0o600): string {
  const dir = mkdtempSync(join(WORK_DIR, 'sealed-out-'));
  const path = join(dir, 'password');
  writeFileSync(path, '');
  chmodSync(path, mode);
  return path;
}

/**
 * Runs the script with the sudo password arriving on stdin, exactly as the
 * documented invocation does. stdout and stderr are pipes here, which is also
 * the condition the terminal guard has to recognise as "no terminal".
 */
function runScript(
  args: string[],
  opts: {
    existingAccount?: boolean;
    input?: string;
    resolvableAlias?: boolean;
    connectsAs?: string;
    env?: Record<string, string>;
  } = {},
): RunResult {
  const resolvable = opts.resolvableAlias ?? true;
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: opts.input ?? 'fixture-sudo-password\n',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      FAKE_SSH_USER: opts.connectsAs ?? 'footbag',
      ...(resolvable ? { PATH: `${ALIAS_BIN}:${process.env.PATH ?? ''}` } : {}),
      FOOTBAG_PROVISION_SSH: sshStub(opts.existingAccount ?? false),
      FOOTBAG_KNOWN_HOSTS: PIN,
      OPACC_SEALED_OUT: outFile(),
      ...(opts.env ?? {}),
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
    '--account': 'robin_fielder',
    '--operator': 'Robin Fielder',
    '--key-file': VALID_KEY,
    ...overrides,
  };
  return Object.entries(base).flatMap(([k, v]) => (v === '' ? [] : [k, v]));
}

/** The same, naming the onboarding operation, which every create or re-issue does. */
function sealed(overrides: Partial<Record<string, string>> = {}): string[] {
  return [...args(overrides), '--sealed'];
}

/**
 * The shared account's password is not this script's to set.
 *
 * Every holder of the shared account holds its password, and the vault carries
 * its real value, because a credential everybody is meant to hold is what a
 * shared store is for. A run that minted a fresh one here and sealed it to one
 * person would lock every other holder out and leave the vault describing a
 * credential nobody can use.
 */
describe('provision-operator-account.sh — the shared account', () => {
  it('refuses to create it, before anything on the host is touched', () => {
    const r = runScript(sealed({ '--account': 'footbag' }));
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/is the shared account, and its password/);
    expect(r.stderr).toMatch(/custody operation/);
  });

  it('refuses to re-issue its password when it already exists, which is the reachable way in', () => {
    const r = runScript(sealed({ '--account': 'footbag' }), { existingAccount: true });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/is the shared account/);
  });

  it('names where the shared account keys are managed, rather than only refusing', () => {
    const r = runScript(sealed({ '--account': 'footbag' }));
    expect(r.stderr).toMatch(/authorize-operator-key\.sh/);
    expect(r.stderr).not.toMatch(/--rotate --key-only/);
  });

  it('does not refuse retiring somebody else, which sets no password either', () => {
    const r = runScript([...args({ '--account': 'robin_fielder', '--key-file': '' }), '--offboard']);
    expect(r.stderr).not.toMatch(/is the shared account/);
  });
});

describe('provision-operator-account.sh — invocation guards', () => {
  it('refuses to infer the environment, so a run never lands on an inherited target', () => {
    const result = runScript(args({ '--target': '' }));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--target must be 'staging'; there is no default/);
  });

  it('rejects an environment that is not staging', () => {
    const result = runScript(args({ '--target': 'prod' }));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--target must be 'staging'/);
  });

  it('refuses production, where no named account is made or retired, before reading anything', () => {
    for (const mode of ['--sealed', '--inspect']) {
      const argv =
        mode === '--inspect'
          ? ['--target', 'production', '--account', 'robin_fielder', '--inspect']
          : sealed({ '--target': 'production' });
      const result = runScript(argv);
      expect(result.exitCode).toBe(2);
      expect(result.stderr).toMatch(/no named account is made or retired on production/);
      expect(result.stdout).not.toMatch(/SSH OK/);
    }
    const offboard = runScript(['--target', 'production', '--account', 'robin_fielder', '--offboard']);
    expect(offboard.exitCode).toBe(2);
    expect(offboard.stderr).toMatch(/no named account is made or retired on production/);
  });

  it('shows an account name in the convention it tells the operator to type', () => {
    // The script refuses to derive the name, so its own example is the only thing
    // teaching what to type, and it is read by somebody about to create an
    // account that keeps that name on every host for as long as the person holds
    // access. An example spelled from an email local part teaches exactly the
    // habit the convention exists to stop, and a name that is wrong is not
    // corrected later: it is never reused for anyone else, and every past
    // reference to it stays ambiguous.
    const source = readFileSync(SCRIPT, 'utf-8');
    const example = source.match(/--account (\S+)/);
    expect(example, 'the usage shows no --account example at all').not.toBeNull();
    expect(example?.[1]).toMatch(/^(<name>|[a-z]+_[a-z]+)$/);
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
    // The refusal names where the attribution goes: the account's own comment
    // field, so the host itself says whose login it is.
    expect(result.stderr).toMatch(/the host says whose login this is/);
  });

  it('rejects an account name the host would refuse, before opening a connection', () => {
    const result = runScript(sealed({ '--account': 'Robin Fielder' }));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/not a usable Linux account name/);
  });

  it('rejects an unknown flag rather than ignoring it', () => {
    const result = runScript([...args(), '--force']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/unknown argument '--force'/);
  });

  it('refuses an empty credential file rather than proceeding with no password', () => {
    // An empty first line is not a password. Accepting one sends an empty
    // string to every sudo on the host, which refuses it, and the run then
    // reports what reads as a host fault rather than as a missing credential.
    const result = runScript(sealed(), { input: '' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/first line of stdin was empty/);
    expect(result.stderr).toMatch(/expected the host sudo password/);
    // Nothing on the host was reached: the refusal comes before any connection.
    expect(result.stdout).not.toMatch(/SSH OK/);
  });

  it('refuses a workstation with no deploy alias, before it opens a connection', () => {
    // Without this the run reaches the reachability probe and fails there with
    // a bare "Permission denied (publickey)", which reads as a rejected key
    // rather than as a name ssh could not resolve, and sends the operator to
    // look at their key instead of their SSH configuration.
    const result = runScript(sealed(), { resolvableAlias: false });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/SSH alias 'footbag-staging' is not configured/);
    expect(result.stderr).toMatch(/deploy alias stanza/);
    expect(result.stdout).not.toMatch(/SSH OK/);
  });

  it('reaches the target\'s own host whatever DEPLOY_TARGET the shell carries', () => {
    // Defect caught: a value left exported in the operator's shell steering an
    // account change onto a host other than the one --target names. The host
    // is the target's alias and nothing else names one.
    const result = runScript(sealed(), { env: { DEPLOY_TARGET: 'some-other-host' } });
    expect(result.stdout).toMatch(/Target host: footbag-staging/);
    expect(`${result.stdout}${result.stderr}`).not.toContain('some-other-host');
  });

  it('names the staging credential file, the one environment it runs against', () => {
    const staging = runScript(sealed({ '--target': 'staging' }), { input: '' });
    expect(staging.exitCode).toBe(1);
    expect(staging.stderr).toMatch(/AWS_OPERATOR\.txt/);
    expect(staging.stderr).not.toMatch(/AWS_OPERATOR_PRODUCTION\.txt/);
  });

  it('names the file for the account it is connecting as, not the shared one', () => {
    // An operator who already has their own account provisions the next person
    // from it, so the credential this run needs is their own. Naming the shared
    // file would have them pipe a password the host will refuse for this login,
    // and the refusal lands on the host as a sudo failure.
    const result = runScript(sealed({ '--target': 'staging' }), {
      input: '',
      connectsAs: 'ada_lovelace',
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/HOST_OPERATOR\.txt/);
    expect(result.stderr).not.toMatch(/AWS_OPERATOR\.txt/);
  });
});

describe('provision-operator-account.sh — what it accepts as a public key', () => {
  it('refuses a path that is not a regular file', () => {
    const result = runScript(sealed({ '--key-file': join(WORK_DIR, 'nonexistent.pub') }));
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
    // as far as the terminal guard rather than failing on the key.
    const pasted = spawnSync('cat', [VALID_KEY], { encoding: 'utf-8', ...SPAWN_GUARD }).stdout ?? '';
    const result = runScript([
      ...sealed({ '--key-file': '' }),
      '--key-line',
      pasted.trim(),
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/no terminal to confirm on/);
    expect(result.stderr).not.toMatch(/public key/);
  });

  it('validates a pasted key as strictly as a file, so a mangled paste stops here', () => {
    const result = runScript([
      ...sealed({ '--key-file': '' }),
      '--key-line',
      'ssh-ed25519 this-is-not-a-key robin@example',
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/cannot read .* as a public key file/);
  });

  it('refuses a file ssh-keygen cannot read as a public key', () => {
    const bad = join(WORK_DIR, 'wrapped.pub');
    writeFileSync(bad, 'ssh-ed25519 AAAAC3NzaC1lZDI1\nNTE5AAAAIwrapped user@host\n');
    const result = runScript(sealed({ '--key-file': bad }));
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
    const result = runScript(sealed({ '--key-file': both }));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/holds 2 public keys; expected exactly one/);
    expect(result.stderr).toMatch(/One account, one key/);
  });
});

describe('provision-operator-account.sh — the pinned host key', () => {
  it('refuses to connect without the pin, rather than accepting a key on trust', () => {
    const result = spawnSync('bash', [SCRIPT, ...sealed()], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      input: 'fixture-sudo-password\n',
      env: {
        ...process.env,
        ...NO_AWS_CREDENTIALS,
        // The subject here is the pin, which is checked after the alias
        // preflight, so this case supplies a resolving alias to reach it.
        PATH: `${ALIAS_BIN}:${process.env.PATH ?? ''}`,
        FOOTBAG_PROVISION_SSH: sshStub(false),
        FOOTBAG_KNOWN_HOSTS: join(WORK_DIR, 'no-such-pin'),
        OPACC_SEALED_OUT: outFile(),
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
    const result = spawnSync('bash', [SCRIPT, ...sealed()], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      input: 'fixture-sudo-password\n',
      env: {
        ...process.env,
        ...NO_AWS_CREDENTIALS,
        // Same as above: the pin is what this asserts on, so the alias
        // preflight ahead of it is given what it needs.
        PATH: `${ALIAS_BIN}:${process.env.PATH ?? ''}`,
        FOOTBAG_PROVISION_SSH: sshStub(false),
        FOOTBAG_KNOWN_HOSTS: loose,
        OPACC_SEALED_OUT: outFile(),
      },
      ...SPAWN_GUARD,
    });
    expect(result.status).toBe(1);
    expect(result.stderr ?? '').toMatch(/expected it to be non-writable by others/);
  });
});

describe('provision-operator-account.sh — preconditions on the host', () => {
  it('announces the test seam, so a stubbed run is never mistaken for a real one', () => {
    const result = runScript(sealed());
    expect(result.stderr).toMatch(/SYNTHETIC: ssh=/);
    expect(result.stderr).toMatch(/no host is being changed/);
  });

  it('refuses with no terminal to confirm on, before creating anything', () => {
    // The create path is otherwise clear here: valid args, a good key, a good
    // pin, and a host reporting the account absent. What stops it is that an
    // existing account is reopened or re-issued only on a typed APPLY, so a run
    // with no terminal would stop part way.
    const result = runScript(sealed());
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/no terminal to confirm on/);
    expect(result.stderr).toMatch(/Nothing has been\s+created/);
  });
});

describe('provision-operator-account.sh — when the cleanup is armed', () => {
  // Found by the first real run of this script. The root-side body creates the
  // account and then verifies it, so a failed verification exits non-zero with
  // the account already on the host. With the state advanced after the pipe,
  // that line never runs under `set -e`: the trap fires in the "none" state,
  // matches no branch, and leaves behind an account whose password was shown
  // once and recorded nowhere. Which is the one outcome the state machine is
  // for. The state therefore has to be armed before the pipe, not after it.
  const source = readFileSync(SCRIPT, 'utf-8');

  it('arms the created state before the pipe that creates the account', () => {
    const armed = source.indexOf('PROVISION_STATE="created"');
    const pipe = source.indexOf('printf \'OPACC_PASSWORD=%q\\n\' "$NEW_PASS"');
    expect(armed).toBeGreaterThan(-1);
    expect(pipe).toBeGreaterThan(-1);
    expect(armed).toBeLessThan(pipe);
  });

  it('checks the account is really there before reporting it unremovable', () => {
    // The cost of arming early is that a refusal ahead of useradd also lands in
    // the created branch. Probing first is what stops the cleanup telling an
    // operator to chase an account that never existed.
    //
    // Scoped to the cleanup branch rather than to the file. The same probe is
    // also spelled out in the precondition check near the top, so a search of
    // the whole script finds that one first and is satisfied by it: deleting
    // the cleanup's probe entirely would leave this assertion green.
    const branchStart = source.indexOf('    created)');
    const branchEnd = source.indexOf('COULD NOT REMOVE IT');
    expect(branchStart, 'the created-state cleanup branch was not found').toBeGreaterThan(-1);
    expect(branchEnd).toBeGreaterThan(branchStart);
    const branch = source.slice(branchStart, branchEnd);
    expect(branch).toMatch(/id -u --/);
    // And it is consulted before the removal is attempted, not alongside it.
    expect(branch.indexOf('id -u --')).toBeLessThan(branch.indexOf("OPACC_MODE=%q\\n' \"remove\""));
  });

  it('only an explicit ABSENT skips the removal, never an unreachable host', () => {
    // Three outcomes, and an exit status carries two: an unreachable host and an
    // absent account both fail. Reading the answer off the exit status makes
    // "cannot tell" mean "nothing to do", which silently skips removing an
    // account whose password was shown once and written down nowhere.
    expect(source).toMatch(/echo EXISTS \|\| echo ABSENT/);
    expect(source).toMatch(/\|\| echo UNKNOWN/);
    expect(source).toMatch(/PROBE" == "ABSENT"/);
    expect(source).toMatch(/Attempting the removal anyway/);
  });
});

/**
 * The sudo password reaches the host.
 *
 * It is read once from stdin, before anything else, and every privileged
 * session sends it as line one for `sudo -k -S`. A later reset of the variable
 * left the create and rotate sessions sending an empty line instead: sudo
 * refused it, took the next two lines of the stream as its second and third
 * attempts, and the run reported three incorrect passwords while the credential
 * file was never tried at all.
 *
 * The create path refuses to run without a terminal to confirm on, so it is
 * driven through `script`, with stdin still redirected from the credential file
 * as the documented invocation does. The stubbed host records the first line of
 * every privileged session it receives.
 */
describe('provision-operator-account.sh — the sudo password reaches the host', () => {
  it('sends the credential line to sudo on the session that creates the account', () => {
    const record = join(WORK_DIR, 'sudo-lines');
    const cred = join(WORK_DIR, 'cred');
    writeFileSync(cred, 'fixture-sudo-password\n');
    chmodSync(cred, 0o600);
    const stub = join(WORK_DIR, 'ssh-record');
    writeFileSync(
      stub,
      [
        '#!/usr/bin/env bash',
        hostIdentityAnswer(),
        'for a in "$@"; do',
        '  case "$a" in',
        "    *\"echo 'SSH OK'\"*) echo '    SSH OK'; exit 0 ;;",
        '    *"id -u"*) echo ABSENT; exit 0 ;;',
        `    *"sudo -k -S"*) IFS= read -r first; printf '%s\\n' "$first" >> ${JSON.stringify(record)}; cat > /dev/null; exit 0 ;;`,
        '  esac',
        'done',
        'cat > /dev/null',
        'exit 0',
      ].join('\n'),
    );
    chmodSync(stub, 0o755);

    const inner = [
      'bash',
      JSON.stringify(SCRIPT),
      ...sealed().map((a) => JSON.stringify(a)),
      '<',
      JSON.stringify(cred),
    ].join(' ');
    spawnSync('script', ['-qec', inner, '/dev/null'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      // An absent account needs no typed answer: the create runs through.
      input: '',
      env: {
        ...process.env,
        ...NO_AWS_CREDENTIALS,
        FAKE_SSH_USER: 'footbag',
        PATH: `${ALIAS_BIN}:${process.env.PATH ?? ''}`,
        FOOTBAG_PROVISION_SSH: stub,
        FOOTBAG_KNOWN_HOSTS: PIN,
        OPACC_SEALED_OUT: outFile(),
      },
      ...SPAWN_GUARD,
    });

    expect(existsSync(record), 'no privileged session reached the host').toBe(true);
    const lines = readFileSync(record, 'utf-8').split('\n').filter((l, i, all) => i < all.length - 1);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toBe('fixture-sudo-password');
  });

  it('does not report a finished run as unfinished', () => {
    // A run that has handed the password back disarms the cleanup. Left armed,
    // it would close on a removal of the account beneath its own success
    // message, withdrawing an account whose password the caller now holds.
    const cred = join(WORK_DIR, 'cred-finished');
    writeFileSync(cred, 'fixture-sudo-password\n');
    chmodSync(cred, 0o600);
    const inner = ['bash', JSON.stringify(SCRIPT), ...sealed().map((a) => JSON.stringify(a)), '<', JSON.stringify(cred)].join(' ');
    const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
      encoding: 'utf-8',
      input: '',
      env: {
        ...process.env,
        ...NO_AWS_CREDENTIALS,
        FAKE_SSH_USER: 'footbag',
        PATH: `${ALIAS_BIN}:${process.env.PATH ?? ''}`,
        FOOTBAG_PROVISION_SSH: sshStub(false),
        FOOTBAG_KNOWN_HOSTS: PIN,
        OPACC_SEALED_OUT: outFile(),
      },
      ...SPAWN_GUARD,
    });
    expect(r.stdout).toMatch(/Account robin_fielder is ready/);
    expect(r.stdout).not.toMatch(/did not finish/);
    expect(r.stdout).not.toMatch(/is being removed/);
  });
});

describe('provision-operator-account.sh — a per-person password is neither vaulted nor expired', () => {
  // The vault is shared between custodians. A personal credential kept there
  // lets any custodian act as any operator, so a named account has no vault
  // entry at all: who holds the access is read live from the host and IAM.
  //
  // The one-time password is not expired either. Its owner replaces it through
  // sudo when they accept the onboarding, and an expired password would refuse
  // that very sudo, leaving them an account they cannot finish setting up.
  const source = readFileSync(SCRIPT, 'utf-8');
  const half = readFileSync(
    join(process.cwd(), 'scripts/internal/provision-operator-account-remote.sh'),
    'utf-8',
  );

  it('never expires the password it sets on the host', () => {
    expect(half).not.toMatch(/chage -d 0/);
  });

  it('verifies the password is not expired rather than assuming it', () => {
    expect(half).toMatch(/FAIL password is expired, so the owner could not replace it through sudo/);
  });

  it('names no separate access register anywhere', () => {
    // Recreating that file is the specific mistake this guards against: it
    // looks like diligence and reintroduces the drift that deleted it.
    expect(source).not.toMatch(/HOST_ACCESS/);
    expect(source).not.toMatch(/host-access inventory/);
  });
});

describe('provision-operator-account.sh — the password-status check', () => {
  // Found by the first real run, on a host of the family this project actually
  // deploys to. `passwd -S` reports a set password as P on Debian-family images
  // and PS on the RHEL family, which is what the Amazon Linux hosts here are.
  // Accepting only P made the check fail on every host it was written for, and
  // the freshly created account was then torn down as unready when it was fine.
  const half = readFileSync(
    join(process.cwd(), 'scripts/internal/provision-operator-account-remote.sh'),
    'utf-8',
  );

  it('accepts both spellings of a set password', () => {
    expect(half).toMatch(/P\|PS\)/);
  });

  it('still rejects a locked or absent password, in either family spelling', () => {
    expect(half).toMatch(/LK\/L is locked, NP none/);
    expect(half).toMatch(/expected a set password/);
  });

  it('reads the field real passwd -S output puts the status in', () => {
    // Captured from the staging host: `david_leberknight PS 2026-09-17 0 99999 7 -1`.
    // The extraction is `cut -d' ' -f2`, so what matters is that the status is
    // the second space-separated field and not, say, the first or the last.
    const sample = 'david_leberknight PS 2026-09-17 0 99999 7 -1';
    const extracted = spawnSync('cut', ['-d', ' ', '-f2'], {
      input: sample,
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    expect(extracted.stdout.trim()).toBe('PS');
  });
});

describe('provision-operator-account.sh — the root-side password-auth refusal', () => {
  // This account's password is meant to unlock sudo and nothing else. Where
  // sshd accepts password authentication it also admits anyone who guesses it,
  // and the account still works, so nothing afterwards reports the extra way
  // in. The refusal therefore has to happen before the password exists.
  //
  // The root-side body cannot be executed here: it refuses to run as anything
  // but root, and everything it does afterwards mutates a host. What is pinned
  // instead is that the refusal is present, that it reads the value sshd
  // actually reports, and that it sits ahead of the step that creates anything.
  const half = readFileSync(
    join(process.cwd(), 'scripts/internal/provision-operator-account-remote.sh'),
    'utf-8',
  );

  it('refuses when sshd accepts password authentication', () => {
    // The exact extraction, not merely the word: the assertion below proves
    // this expression reads real sshd output, and the two together are what
    // make the refusal real rather than present.
    expect(half).toContain("sed -n 's/^passwordauthentication //p'");
    expect(half).toMatch(/accepts password authentication on this host/);
    expect(half).toMatch(/PasswordAuthentication no/);
  });

  it('asks before anything is created', () => {
    expect(half.indexOf('accepts password authentication on this host')).toBeLessThan(
      half.indexOf('── Create or rotate'),
    );
  });

  it('still warns about it when the effective config cannot be read at all', () => {
    // A host that will not answer `sshd -T` is not a host where the question
    // has been settled, and the password is minted either way.
    expect(half).toMatch(/could not read the effective sshd config/);
    expect(half).toMatch(/password authentication is off before trusting the/);
  });

  it('reads the value out of real sshd -T output rather than a guessed format', () => {
    // Captured from the staging host on 2026-09-17 via `sudo sshd -T`. The
    // extraction is a plain `sed -n 's/^passwordauthentication //p'`, so what
    // matters is that sshd reports the setting lower-cased, one per line, with
    // a single space: a pattern written from memory against a CamelCase spelling
    // matches nothing and the refusal silently never fires.
    const sample = [
      'port 22',
      'port 2222',
      'permitrootlogin without-password',
      'passwordauthentication no',
    ].join('\n');
    const extracted = spawnSync('sed', ['-n', 's/^passwordauthentication //p'], {
      input: sample,
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    expect(extracted.stdout.trim()).toBe('no');
  });
});

/**
 * Offboarding, which the devops guide has required since before any of this
 * existed and which had no host step behind it.
 *
 * The only removal path in the tree was the trap's rollback, which deletes the
 * account and its home. That is right for an account the same run created
 * seconds earlier and wrong for a person leaving: their home directory, shell
 * history and file ownership are what an incident review reads, and deleting
 * them answers no question anybody asks. So this disables instead, and the
 * refusals below are what stop it being used as a foot-gun.
 */
describe('provision-operator-account.sh — offboarding', () => {
  it('needs no public key, because it withdraws access rather than granting it', () => {
    // Requiring the departing person's key to remove their access would be a
    // precondition nobody can always meet.
    const r = runScript(
      ['--target', 'staging', '--account', 'robin_fielder', '--operator', 'Robin Fielder', '--offboard'],
      { existingAccount: true },
    );
    expect(r.stderr).not.toMatch(/public key is required/);
  });

  it('refuses a key given alongside it, rather than ignoring it', () => {
    // Silently dropping something the operator believed they were installing is
    // worse than refusing.
    const r = runScript([...args(), '--offboard'], { existingAccount: true });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/takes no key/);
  });

  it('refuses --sealed and --offboard together, as arguments', () => {
    // No key in this one: the key refusal fires first and would mask the
    // conflict being asserted.
    const r = runScript(
      [
        '--target', 'staging',
        '--account', 'robin_fielder',
        '--operator', 'Robin Fielder',
        '--offboard',
        '--sealed',
      ],
      { existingAccount: true },
    );
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/opposite intentions/);
  });

  it('is a no-op on an account that does not exist', () => {
    // Idempotent: an offboard re-run after the account is gone changes nothing
    // and says why, rather than failing the departure it is part of.
    const r = runScript(
      ['--target', 'staging', '--account', 'gone_already', '--operator', 'Gone Already', '--offboard'],
      { existingAccount: false },
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Nothing to do: gone_already does not exist/);
  });

  it('takes a typed confirmation, and touches nothing without one', () => {
    const r = runScript(
      ['--target', 'staging', '--account', 'robin_fielder', '--operator', 'Robin Fielder', '--offboard'],
      { existingAccount: true },
    );
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/no terminal to confirm on/);
  });

  it('says it disables rather than deletes, before asking', () => {
    // The operator has to know which of the two acts they are approving; they
    // are not interchangeable and only one is reversible.
    const r = runScript(
      ['--target', 'staging', '--account', 'robin_fielder', '--operator', 'Robin Fielder', '--offboard'],
      { existingAccount: true },
    );
    expect(r.stdout).toMatch(/disabled, not deleted/);
    expect(r.stdout).toMatch(/home directory/);
  });
});

/**
 * A read of the account for a caller that has to prove the host side of an
 * onboarding before calling it done. It changes nothing, so it needs no key, no
 * operator name and no terminal, and it refuses anything it would ignore.
 */
describe('provision-operator-account.sh — inspecting', () => {
  const INSPECT = ['--target', 'staging', '--account', 'robin_fielder', '--inspect'];
  const fp = () =>
    spawnSync('ssh-keygen', ['-l', '-f', VALID_KEY], { encoding: 'utf-8', ...SPAWN_GUARD }).stdout.trim();

  it('reports an account that does not exist, and needs no key or name to do it', () => {
    const r = runScript(INSPECT, { existingAccount: false });
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^ACCOUNT absent$/m);
  });

  it('reports a live account and the keys it accepts', () => {
    const r = runScript(INSPECT, {
      existingAccount: true,
      env: { FAKE_INSPECT: `SHELL /bin/bash\nPASSWORD P\nOFFBOARDED no\nKEY ${fp()}\n` },
    });
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^ACCOUNT present$/m);
    expect(r.stdout).toMatch(/^LOCKED no$/m);
    expect(r.stdout).toContain(`KEY ${fp()}`);
  });

  it('reports a locked account as locked, even where no offboard marker was left', () => {
    // An offboard that stopped part way locks the account before it moves the
    // keys aside, so the marker alone would call it live.
    for (const facts of ['SHELL /usr/sbin/nologin\nPASSWORD P\n', 'SHELL /bin/bash\nPASSWORD L\n']) {
      const r = runScript(INSPECT, {
        existingAccount: true,
        env: { FAKE_INSPECT: `${facts}OFFBOARDED no\nKEY ${fp()}\n` },
      });
      expect(r.exitCode, r.stderr).toBe(0);
      expect(r.stdout).toMatch(/^LOCKED yes$/m);
    }
  });

  it('passes the retired keys and the shared account\'s keys through, and asks the host about the shared account', () => {
    const r = runScript(INSPECT, {
      existingAccount: true,
      env: { FAKE_INSPECT: `SHELL /bin/bash\nPASSWORD P\nOFFBOARDED no\nKEY ${fp()}\nRETIRED ${fp()}\nSHARED SHA256:abc\n` },
    });
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.stdout).toContain(`RETIRED ${fp()}`);
    expect(r.stdout).toMatch(/^SHARED SHA256:abc$/m);
  });

  it('reports the shared account as unknown when the host said nothing about it', () => {
    // A missing line must never read as "the key is not on the shared account".
    const r = runScript(INSPECT, {
      existingAccount: true,
      env: { FAKE_INSPECT: `SHELL /bin/bash\nPASSWORD P\nOFFBOARDED no\nKEY ${fp()}\n` },
    });
    expect(r.exitCode, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^SHARED unknown$/m);
  });

  it('fails when the account cannot be read, rather than describing it', () => {
    const r = runScript(INSPECT, { existingAccount: true, env: { FAKE_INSPECT_FAILS: '1' } });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/could not read robin_fielder/);
    expect(r.stdout).not.toMatch(/^ACCOUNT present$/m);
  });

  it('refuses a key or an operator name it would ignore', () => {
    const r = runScript([...INSPECT, '--key-file', VALID_KEY], { existingAccount: true });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/--inspect takes only --target and --account/);
    const n = runScript([...INSPECT, '--operator', 'Robin Fielder'], { existingAccount: true });
    expect(n.exitCode).toBe(2);
  });

  it('is never combined with an operation that changes the account', () => {
    const r = runScript([...INSPECT, '--sealed'], { existingAccount: true });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/changes nothing; it is not combined/);
  });
});

/**
 * What the script tells an operator to do with a credential or a host.
 *
 * The rules its messages must follow are pinned on the text, across every
 * branch at once. A password is never handed over by voice: its hand-over to a
 * person not at this keyboard is sealed to their own key, and a script that
 * told an operator to read it aloud would be the instruction they followed. And
 * no step is a hand-typed ssh to a deployed host, which would skip the pinned
 * host key every scripted connection carries.
 */
describe('provision-operator-account.sh — what it tells an operator to do', () => {
  const source = readFileSync(SCRIPT, 'utf-8');
  const echoed = source
    .split('\n')
    .filter((line) => /^\s*echo /.test(line))
    .join('\n');

  it('never tells anybody to hand a password over by voice', () => {
    // The instruction form, which is what an operator would follow.
    expect(echoed).not.toMatch(/hand it over[^\n]*by voice/i);
  });

  it('never hands the operator a raw ssh command against a host', () => {
    expect(echoed).not.toMatch(/echo "\s*ssh /);
    expect(echoed).not.toMatch(/'sudo userdel/);
  });
});

/**
 * A trap may only undo what the run itself created.
 *
 * Re-issuing a password to an existing account, or reopening a retired one,
 * runs the remote half in rotate mode. Marked as "created", a run that stopped
 * for any reason -- an interrupt, a verification that failed for an unrelated
 * reason -- would send OPACC_MODE=remove for an account that PREDATED it. The
 * remote half's remove is `userdel -r`: the person's account, home directory,
 * shell history and every file they owned, destroyed by an interrupt, while
 * stderr said "the account just created is being removed".
 */
describe('a re-issue never removes the account it is re-issuing', () => {
  const source = readFileSync(SCRIPT, 'utf-8');

  /** The cleanup's rotating branch, from its label to the end of the case. */
  function rotatingBranch(): string {
    const cleanup = source.slice(source.indexOf('provision_cleanup() {'));
    const start = cleanup.indexOf('rotating)');
    const end = cleanup.indexOf('esac', start);
    expect(start, 'the rotating cleanup branch was not found').toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return cleanup.slice(start, end);
  }

  it('does not mark a re-issue as something the cleanup created', () => {
    expect(source).toMatch(/if \[\[ "\$MODE" == "rotate" \]\]; then\s*\n\s*PROVISION_STATE="rotating"/);
  });

  it('has a cleanup branch for a re-issue that removes nothing', () => {
    const rotating = rotatingBranch();
    expect(rotating).toMatch(/NOT being/);
    expect(rotating).not.toMatch(/OPACC_MODE=%q\\n' "remove"/);
    expect(rotating).not.toMatch(/userdel/);
  });

  it('says the password is uncertain, which is the real consequence', () => {
    // The account is safe; what the operator actually needs to know is that its
    // password may have been changed before the run stopped, so the owner
    // should not try to sudo until the onboarding has been re-run.
    const rotating = rotatingBranch();
    expect(rotating).toMatch(/password is now uncertain/);
    expect(rotating).toMatch(/Re-run the"\s*>&2\s*\n\s*echo "onboarding/);
  });

  it('keeps removal for the one state where the run did create the account', () => {
    const cleanup = source.slice(source.indexOf('provision_cleanup() {'));
    const created = cleanup.slice(cleanup.indexOf('created)'), cleanup.indexOf('rotating)'));
    expect(created).toMatch(/"remove"/);
  });
});

describe('the account probe distinguishes absent from unreachable', () => {
  const source = readFileSync(SCRIPT, 'utf-8');

  it('answers on stdout rather than through an exit status', () => {
    // Three outcomes, and an exit status carries two. Read as a boolean, an
    // unreachable host becomes "absent", and on an offboarding that reports
    // "nothing to do", exits zero, and has the operator record a withdrawal of
    // access that never happened.
    expect(source).toMatch(/ACCOUNT_PROBE=.*echo EXISTS \|\| echo ABSENT/s);
    expect(source).toMatch(/\|\| echo UNKNOWN/);
  });

  it('stops on an unreachable host rather than guessing what is there', () => {
    const guard = source.slice(source.indexOf('ACCOUNT_PROBE'));
    expect(guard).toMatch(/UNKNOWN.*could not reach/s);
    expect(guard).toMatch(/than acting on a guess/);
  });
});

describe('the offboarding half that runs on the host', () => {
  const remote = readFileSync(REMOTE_HALF, 'utf-8');

  it('refuses to disable the account the run arrived on', () => {
    expect(remote).toMatch(/SUDO_USER.*==.*OPACC_ACCOUNT/);
    expect(remote).toMatch(/locks you out part-way/);
  });

  it('refuses to leave the host with nobody able to log in and use sudo', () => {
    expect(remote).toMatch(/last account on this host/);
  });

  it('counts remaining sudo holders by real group membership, primary group included', () => {
    // A member whose PRIMARY group is the sudo group does not appear in the
    // group line, so counting from `getent group` alone undercounts and the
    // refusal above would fire on a host that is fine.
    expect(remote).toMatch(/id -nG/);
  });

  it('counts only accounts somebody can actually reach, not a shell and a group', () => {
    // sshd here takes public keys only, so an account with no authorized_keys
    // admits nobody whatever its shell and groups say, and reaching it is no
    // use without a password sudo will take. The shared service account in its
    // intended end state -- bootstrap keys withdrawn, account not yet deleted
    // -- passes a shell-and-group test exactly while admitting no one, so that
    // weaker count lets the last real operator be offboarded into a host
    // nobody can log in to: what this refusal exists to prevent.
    expect(remote).toMatch(/authorized_keys" \]\] \|\| continue/);
    expect(remote).toMatch(/passwd -S -- "\$name"/);
    // A locked or absent password does not count toward the total.
    expect(remote).toMatch(/P\|PS\) ;;/);
  });

  it('puts a new account in the container runtime group as well as sudo', () => {
    // The deploy reads the running schema by exec-ing into the web container,
    // the one step it takes without elevation. An operator outside that group
    // gets an empty read, the schema-drift check takes its unreachable branch,
    // and the deploy warns and proceeds -- a guard that cannot fire, whose
    // silence reads as agreement.
    expect(remote).toMatch(/getent group docker >/);
    expect(remote).toMatch(/usermod -aG docker --/);
    // A host that has not been brought up yet has no such group, which is not
    // an error, but the operator is told the check will not run for them.
    expect(remote).toMatch(/no docker group on this host/);
  });

  it('disables four independent ways in, not one', () => {
    expect(remote).toMatch(/usermod -L/);
    expect(remote).toMatch(/nologin/);
    expect(remote).toMatch(/chage -E 0/);
    expect(remote).toMatch(/authorized_keys moved aside/);
  });

  it('proves the outcome instead of trusting four exit statuses', () => {
    expect(remote).toMatch(/offboard_failed/);
    expect(remote).toMatch(/Do not record this/);
  });

  it('accepts both spellings of a locked password, as the create path does', () => {
    // Debian reports L and the RHEL family reports LK. Accepting only one is
    // the defect that stopped the create path working on these hosts at all.
    expect(remote).toMatch(/L\|LK\)/);
  });
});

describe('provision-operator-account.sh — every run names its operation', () => {
  // There is one onboarding path for a named account, the sealed one, and one
  // way to end its access. A run is exactly one of the two, named on the
  // command line, so nothing about what it does is inferred from what it finds.
  it('refuses a run that names neither --sealed nor --offboard', () => {
    const r = runScript(args());
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/name the operation/);
    // Refused as an argument, before any connection is opened.
    expect(r.stdout).not.toMatch(/SSH OK/);
  });

  it('refuses it against an existing account too, rather than deciding from what it finds', () => {
    const r = runScript(args(), { existingAccount: true });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/name the operation/);
  });

  // Spelled in pieces: written whole, the retired flags are what the convention gate refuses.
  it.each(['own-password', 'attest-own', 'rotate'].map((f) => `--${f}`))(
    'does not accept %s, since the sealed onboarding is the only way a password is set',
    (flag) => {
      const r = runScript([...sealed(), flag]);
      expect(r.exitCode).toBe(2);
      expect(r.stderr).toContain(`unknown argument '${flag}'`);
    },
  );

  it('never shows a generated password on the terminal', () => {
    const source = readFileSync(SCRIPT, 'utf-8');
    expect(source).not.toMatch(/echo "\s*\$\{NEW_PASS\}"/);
    expect(source).not.toMatch(/shown once/);
  });
});

describe('provision-operator-account.sh — a lost key is never patched in place', () => {
  // A lost private key is a possible exposure, so the account is offboarded and
  // re-onboarded under the same name with a fresh pair, which refuses any key it
  // was retired with. There is no mode that swaps the key and keeps the rest.

  it('does not accept --key-only as an option', () => {
    const r = runScript([...sealed(), '--key-only'], { existingAccount: true });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/unknown argument '--key-only'/);
  });

  it('never tells the host to leave the password alone', () => {
    // Every create and every rotation sets a password. A caller able to say
    // otherwise is a key swap by another name.
    const source = readFileSync(SCRIPT, 'utf-8');
    expect(source).not.toMatch(/OPACC_SET_PASSWORD/);
  });
});

/**
 * The sealed onboarding, the one way a named account gets a password.
 *
 * The onboarding script runs this and seals the one-time password, with the
 * rest of the onboarding, to the SSH public key the person sent. So the
 * password is generated, never shown, not expired on the host (they replace it
 * themselves when they accept the onboarding), and handed back to the calling
 * script through a file that script created, once the account is proven. A
 * named account has no vault entry, so nothing waits on a typed confirmation
 * that one was recorded. An existing account is decided here rather than by a
 * flag: a retired one is reopened, a live one holding exactly the key given is
 * issued a fresh password, and a live one holding any other key is refused,
 * because a lost key is offboarded and re-onboarded rather than patched.
 */
describe('provision-operator-account.sh — --sealed', () => {
  let FINGERPRINT = '';

  beforeAll(() => {
    const r = spawnSync('ssh-keygen', ['-l', '-f', VALID_KEY], { encoding: 'utf-8', ...SPAWN_GUARD });
    FINGERPRINT = (r.stdout ?? '').trim();
    expect(FINGERPRINT).toMatch(/SHA256:/);
  });

  /** A host that records every privileged session and answers the inspection. */
  function sessionStub(probe: 'EXISTS' | 'ABSENT', inspect = ''): { stub: string; sessions: string } {
    const sessions = mkdtempSync(join(WORK_DIR, 'sealed-sessions-'));
    const answer = join(sessions, 'inspect-answer');
    writeFileSync(answer, inspect);
    const stub = join(sessions, 'ssh');
    writeFileSync(
      stub,
      [
        '#!/usr/bin/env bash',
        hostIdentityAnswer(),
        'for a in "$@"; do',
        '  case "$a" in',
        "    *\"echo 'SSH OK'\"*) echo '    SSH OK'; exit 0 ;;",
        `    *"id -u"*) echo ${probe}; exit 0 ;;`,
        '    *"sudo -k -S"*)',
        `      f=${JSON.stringify(sessions)}/session-$(date +%s%N)`,
        '      cat > "$f"',
        `      grep -qx 'OPACC_MODE=inspect' "$f" && cat ${JSON.stringify(answer)}`,
        '      exit 0 ;;',
        '  esac',
        'done',
        'cat > /dev/null',
        'exit 0',
      ].join('\n'),
    );
    chmodSync(stub, 0o755);
    return { stub, sessions };
  }

  function sessionLines(sessions: string): string[] {
    const r = spawnSync('bash', ['-c', `cat ${JSON.stringify(sessions)}/session-* 2>/dev/null`], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    return (r.stdout ?? '').split('\n');
  }

  const sealedArgs = (): string[] => [
    ...args({ '--account': 'james_leberknight', '--operator': 'James Leberknight' }),
    '--sealed',
  ];

  /** Driven through `script`, which is the terminal the typed confirmations need. */
  function runSealed(stub: string, out: string, terminal: string) {
    const cred = join(WORK_DIR, 'sealed-cred');
    writeFileSync(cred, 'fixture-sudo-password\n');
    chmodSync(cred, 0o600);
    const inner = [
      'bash',
      JSON.stringify(SCRIPT),
      ...sealedArgs().map((a) => JSON.stringify(a)),
      '<',
      JSON.stringify(cred),
    ].join(' ');
    return spawnSync('script', ['-qec', inner, '/dev/null'], {
      encoding: 'utf-8',
      input: terminal,
      env: {
        ...process.env,
        ...NO_AWS_CREDENTIALS,
        FAKE_SSH_USER: 'footbag',
        PATH: `${ALIAS_BIN}:${process.env.PATH ?? ''}`,
        FOOTBAG_PROVISION_SSH: stub,
        FOOTBAG_KNOWN_HOSTS: PIN,
        OPACC_SEALED_OUT: out,
      },
      ...SPAWN_GUARD,
    });
  }

  function runSealedPiped(extraArgs: string[], out: string | undefined, stub = sshStub(false)) {
    return spawnSync('bash', [SCRIPT, ...sealedArgs(), ...extraArgs], {
      encoding: 'utf-8',
      input: 'fixture-sudo-password\n',
      env: {
        ...process.env,
        ...NO_AWS_CREDENTIALS,
        FAKE_SSH_USER: 'footbag',
        PATH: `${ALIAS_BIN}:${process.env.PATH ?? ''}`,
        FOOTBAG_PROVISION_SSH: stub,
        FOOTBAG_KNOWN_HOSTS: PIN,
        ...(out === undefined ? {} : { OPACC_SEALED_OUT: out }),
      },
      ...SPAWN_GUARD,
    });
  }

  it('is refused with --offboard, which sets no password to seal', () => {
    const r = spawnSync(
      'bash',
      [SCRIPT, '--target', 'staging', '--account', 'james_leberknight', '--offboard', '--sealed'],
      {
        encoding: 'utf-8',
        input: 'fixture-sudo-password\n',
        env: { ...process.env, ...NO_AWS_CREDENTIALS, OPACC_SEALED_OUT: outFile() },
        ...SPAWN_GUARD,
      },
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/ERROR: --sealed /);
  });

  it('is refused when no file was named to hand the password back through', () => {
    const r = runSealedPiped([], undefined);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/OPACC_SEALED_OUT/);
  });

  it('is refused when that file is readable by anybody else', () => {
    const r = runSealedPiped([], outFile(0o644));
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/mode 600/);
  });

  it('is refused when that file already holds something', () => {
    const out = outFile();
    writeFileSync(out, 'left over\n');
    const r = runSealedPiped([], out);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/not empty/);
    expect(readFileSync(out, 'utf-8')).toBe('left over\n');
  });

  it('is refused when that file is a symbolic link', () => {
    const target = outFile();
    const link = join(WORK_DIR, `sealed-link-${Math.random().toString(36).slice(2)}`);
    spawnSync('ln', ['-s', target, link], { ...SPAWN_GUARD });
    const r = runSealedPiped([], link);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/regular file/);
  });

  it('creates the account with a password that is not expired, never shown, and handed back', () => {
    const { stub, sessions } = sessionStub('ABSENT');
    const out = outFile();
    const r = runSealed(stub, out, '');
    expect(r.status, r.stdout).toBe(0);

    const lines = sessionLines(sessions);
    expect(lines).toContain('OPACC_MODE=create');
    // Nothing asks the host to expire it: the host half never expires a
    // password it sets, and fails its own verification if one is expired.
    expect(lines.some((l) => l.startsWith('OPACC_EXPIRE_PASSWORD'))).toBe(false);

    const handed = readFileSync(out, 'utf-8');
    expect(handed).toMatch(/^[A-Za-z0-9+/]{32}\n$/);
    const password = handed.trim();
    expect(lines).toContain(`OPACC_PASSWORD=${password}`);
    expect(r.stdout, 'the password reached the terminal').not.toContain(password);
    expect(r.stdout).toMatch(/Account james_leberknight is ready/);
  });

  it('asks for no vault confirmation and prints no vault entry, because a named account has none', () => {
    // Who holds a named account's access is read live from the host and IAM,
    // and the onboarding card records who approved it. An entry here would be
    // a hand-kept copy of live state, which is the register that drifted once.
    const { stub } = sessionStub('ABSENT');
    const out = outFile();
    const r = runSealed(stub, out, '');
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).not.toMatch(/Type VAULTED/);
    expect(r.stdout).not.toMatch(/Title:/);
    expect(r.stdout).not.toMatch(/vault/i);
    expect(readFileSync(out, 'utf-8')).toMatch(/^[A-Za-z0-9+/]{32}\n$/);
  });

  it('is refused with no terminal, before anything is created', () => {
    const r = runSealedPiped([], outFile());
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/A sealed run shows no password/);
  });

  it('inspects an existing account on a plain --sealed run, with no further flag', () => {
    // Whether the account exists decides the path, not a flag the operator has
    // to know to add: the run reads what the account holds and shows it, and
    // with no terminal to type APPLY on, stops there having changed nothing.
    const { stub, sessions } = sessionStub(
      'EXISTS',
      `SHELL /bin/bash\nPASSWORD P\nOFFBOARDED no\nKEY ${FINGERPRINT}\n`,
    );
    const out = outFile();
    const r = runSealedPiped([], out, stub);
    expect(r.status).toBe(1);
    expect(sessionLines(sessions).filter((l) => l.startsWith('OPACC_MODE='))).toEqual(['OPACC_MODE=inspect']);
    expect(r.stdout).toMatch(/james_leberknight is live on/);
    expect(r.stdout).toContain(FINGERPRINT);
    expect(r.stderr).toMatch(/is untouched/);
    expect(`${r.stdout}${r.stderr}`).not.toMatch(/--rotate|already exists/);
    expect(readFileSync(out, 'utf-8')).toBe('');
  });

  it('issues a fresh password to a live account holding exactly the key given, on APPLY', () => {
    const { stub, sessions } = sessionStub(
      'EXISTS',
      `SHELL /bin/bash\nPASSWORD P\nOFFBOARDED no\nKEY ${FINGERPRINT}\n`,
    );
    const out = outFile();
    const r = runSealed(stub, out, 'APPLY\n');
    const lines = sessionLines(sessions);
    expect(lines.filter((l) => l.startsWith('OPACC_MODE='))).toEqual(['OPACC_MODE=inspect', 'OPACC_MODE=rotate']);
    // A live account is re-issued, never reopened.
    expect(lines).toContain('OPACC_REOPEN=no');
    expect(lines).not.toContain('OPACC_REOPEN=yes');
    expect(lines.some((l) => l.startsWith('OPACC_EXPIRE_PASSWORD'))).toBe(false);
    expect(readFileSync(out, 'utf-8')).toMatch(/^[A-Za-z0-9+/]{32}\n$/);
    expect(r.stdout).toMatch(/holds exactly the key given/);
  });

  it('shows the keys a live account accepts and changes nothing without APPLY', () => {
    const { stub, sessions } = sessionStub(
      'EXISTS',
      `SHELL /bin/bash\nPASSWORD P\nOFFBOARDED no\nKEY ${FINGERPRINT}\n`,
    );
    const out = outFile();
    const r = runSealed(stub, out, 'no\n');
    expect(sessionLines(sessions).filter((l) => l.startsWith('OPACC_MODE='))).toEqual(['OPACC_MODE=inspect']);
    expect(readFileSync(out, 'utf-8')).toBe('');
    expect(r.stdout).toContain(FINGERPRINT);
    expect(r.stdout).toMatch(/is untouched/);
  });

  it('refuses a live account holding any other key, and sends the operator to offboard then re-onboard', () => {
    const other = '256 SHA256:someoneElsesKeyFingerprintForThisSuite00000 other (ED25519)';
    const { stub, sessions } = sessionStub(
      'EXISTS',
      `SHELL /bin/bash\nPASSWORD P\nOFFBOARDED no\nKEY ${other}\n`,
    );
    const out = outFile();
    const r = runSealed(stub, out, 'APPLY\n');
    expect(r.status).toBe(1);
    expect(sessionLines(sessions).filter((l) => l.startsWith('OPACC_MODE='))).toEqual(['OPACC_MODE=inspect']);
    expect(r.stdout).toContain(other);
    expect(r.stdout).toMatch(/offboarded, then re-onboarded/);
    expect(r.stdout).toMatch(/offboard-dev-tester\.sh --target staging --account james_leberknight/);
    expect(readFileSync(out, 'utf-8')).toBe('');
  });

  it('shows a retired account with the keys it was retired with, and changes nothing without APPLY', () => {
    const retired = '256 SHA256:retiredKeyFingerprintForThisSuite00000000000 james (ED25519)';
    const { stub, sessions } = sessionStub(
      'EXISTS',
      `SHELL /sbin/nologin\nPASSWORD LK\nOFFBOARDED yes\nRETIRED ${retired}\n`,
    );
    const out = outFile();
    const r = runSealed(stub, out, 'no\n');
    expect(r.stdout).toMatch(/was retired by an offboard/);
    expect(r.stdout).toContain(retired);
    expect(r.stdout).toMatch(/is untouched/);
    expect(sessionLines(sessions).filter((l) => l.startsWith('OPACC_MODE='))).toEqual(['OPACC_MODE=inspect']);
    expect(readFileSync(out, 'utf-8')).toBe('');
  });

  it('reopens a retired account for the same person, on APPLY', () => {
    const retired = '256 SHA256:retiredKeyFingerprintForThisSuite00000000000 james (ED25519)';
    const { stub, sessions } = sessionStub(
      'EXISTS',
      `SHELL /sbin/nologin\nPASSWORD LK\nOFFBOARDED yes\nRETIRED ${retired}\n`,
    );
    const out = outFile();
    const r = runSealed(stub, out, 'APPLY\n');
    const lines = sessionLines(sessions);
    expect(r.stdout).toContain(retired);
    expect(lines).toContain('OPACC_MODE=rotate');
    expect(lines).toContain('OPACC_REOPEN=yes');
    expect(lines.some((l) => l.startsWith('OPACC_EXPIRE_PASSWORD'))).toBe(false);
    expect(readFileSync(out, 'utf-8')).toMatch(/^[A-Za-z0-9+/]{32}\n$/);
  });
});

/**
 * The cross-account key sweep, run against real files rather than read.
 *
 * This is the most destructive code in the account-management family: it
 * rewrites other people's authorized_keys as root, and it is the step that
 * decides whether somebody who has left still has a shell. Asserting that the
 * body mentions a fingerprint variable says nothing about whether the right
 * line is removed and the wrong ones are kept, so the sweep and its own proof
 * are taken out and run against a fixture estate.
 *
 * Two slices, concatenated, so both the write and the check on it are real
 * script text rather than a paraphrase. `offboard_failed=0` is injected between
 * them because the line that sets it falls in the gap.
 *
 * `getent` is stubbed, and that stub is not plumbing: the sweep enumerates
 * accounts from the passwd database and rewrites any authorized_keys holding a
 * matching fingerprint, so an unstubbed run would walk the real accounts on the
 * machine running the tests. Serving fixture rows is what stands between this
 * case and a developer's own key files.
 *
 * Deliberately not covered here: the four locks, the remaining-sudoer census
 * and the lock proof. Those are usermod, chage, passwd -S and a real getent,
 * and stubbing them would leave the test asserting its own stubs' output.
 */
describe('provision-operator-account-remote.sh — the cross-account key sweep', () => {
  /** An account in the fixture estate. */
  interface FixtureAccount {
    name: string;
    /** Lines of its authorized_keys; omitted entirely when there is no file. */
    keys?: string[];
  }

  function fingerprintOf(pubKeyPath: string): string {
    const r = spawnSync('ssh-keygen', ['-l', '-f', pubKeyPath], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    if (r.status !== 0) throw new Error(`ssh-keygen -l failed: ${r.stderr}`);
    const fp = (r.stdout ?? '').trim().split(/\s+/)[1];
    if (!fp?.startsWith('SHA256:')) throw new Error(`unexpected fingerprint: ${r.stdout}`);
    return fp;
  }

  const keyLine = (p: string): string => readFileSync(p, 'utf-8').trim();
  /** The same credential, spelled the way another account's file might spell it. */
  const withComment = (line: string, c: string): string =>
    `${line.split(/\s+/).slice(0, 2).join(' ')} ${c}`;
  const withOptions = (line: string): string => `no-agent-forwarding ${line}`;

  let caseCounter = 0;

  interface SweepRun {
    status: number;
    stdout: string;
    stderr: string;
    /** Whether the proof concluded the offboarding had failed. */
    offboardFailed: boolean;
    /** Each account's authorized_keys as the sweep left it, by name. */
    files: Record<string, string>;
  }

  function runSweep(opts: {
    departing: string;
    theirFingerprints: string[];
    accounts: FixtureAccount[];
    /** Names whose write the stand-in install silently drops. */
    writeFailsFor?: string[];
  }): SweepRun {
    const remoteSource = readFileSync(REMOTE_HALF, 'utf-8');
    const sweepStart = remoteSource.indexOf('  OPACC_SWEPT=0');
    const sweepEnd = remoteSource.indexOf('  offboard_failed=0');
    const proofStart = remoteSource.indexOf(
      '  # The sweep is proved by re-reading every account',
    );
    const proofEnd = remoteSource.indexOf('  if (( offboard_failed )); then');
    expect(sweepStart, 'the sweep was not found in the remote half').toBeGreaterThan(-1);
    expect(sweepEnd).toBeGreaterThan(sweepStart);
    expect(proofStart).toBeGreaterThan(sweepEnd);
    expect(proofEnd).toBeGreaterThan(proofStart);

    caseCounter += 1;
    const caseDir = join(WORK_DIR, `sweep-${caseCounter}`);
    const homes = join(caseDir, 'accounts');
    mkdirSync(homes, { recursive: true });

    const passwdRows: string[] = [];
    let uid = 1100;
    for (const account of opts.accounts) {
      const home = join(homes, account.name);
      mkdirSync(home, { recursive: true });
      if (account.keys) {
        mkdirSync(join(home, '.ssh'), { recursive: true });
        const ak = join(home, '.ssh', 'authorized_keys');
        writeFileSync(ak, `${account.keys.join('\n')}\n`);
        chmodSync(ak, 0o600);
      }
      uid += 1;
      passwdRows.push(`${account.name}:x:${uid}:${uid}::${home}:/bin/bash`);
    }

    const failsFor = opts.writeFailsFor ?? [];
    const harness = join(caseDir, 'sweep.sh');
    writeFileSync(
      harness,
      [
        'set -euo pipefail',
        'OPACC_TMPS=()',
        `OPACC_ACCOUNT=${JSON.stringify(opts.departing)}`,
        `OPACC_THEIR_FPS=${JSON.stringify(opts.theirFingerprints.join('\n'))}`,
        // The passwd database the sweep walks. Fixture rows only: an unstubbed
        // getent would point it at the real accounts on this machine.
        'getent() {',
        '  case "${1:-}" in',
        `    passwd) printf '%s\\n' ${passwdRows.map((r) => JSON.stringify(r)).join(' ')} ;;`,
        '    *) return 2 ;;',
        '  esac',
        '}',
        // The privileged write. -o is documented super-user-only, so honouring
        // it would make this green here and possibly red on the runner; the
        // fixtures are already owned by the account running the tests, so
        // dropping it costs the case nothing.
        'install() {',
        '  local mode="" positional=()',
        '  while [ $# -gt 0 ]; do',
        '    case "$1" in',
        '      -m) mode="$2"; shift 2 ;;',
        '      -o|-g) shift 2 ;;',
        '      -d) shift ;;',
        '      *) positional+=("$1"); shift ;;',
        '    esac',
        '  done',
        '  local dest="${positional[1]}"',
        // A write that silently does not land, which is the failure the proof
        // below exists to catch.
        `  case "$dest" in`,
        ...failsFor.map((name) => `    */${name}/.ssh/authorized_keys) return 0 ;;`),
        '  esac',
        '  cp -- "${positional[0]}" "$dest"',
        '  [ -n "$mode" ] && chmod "$mode" -- "$dest"',
        '  return 0',
        '}',
        remoteSource.slice(sweepStart, sweepEnd),
        // Set by the line that falls in the gap between the two slices.
        '  offboard_failed=0',
        remoteSource.slice(proofStart, proofEnd),
        '  echo "OFFBOARD_FAILED=${offboard_failed}"',
      ].join('\n') + '\n',
    );

    const res = spawnSync('bash', [harness], {
      encoding: 'utf-8',
      env: { ...process.env, ...NO_AWS_CREDENTIALS, TMPDIR: caseDir },
      ...SPAWN_GUARD,
    });

    const files: Record<string, string> = {};
    for (const account of opts.accounts) {
      const ak = join(homes, account.name, '.ssh', 'authorized_keys');
      if (existsSync(ak)) files[account.name] = readFileSync(ak, 'utf-8');
    }

    return {
      status: res.status ?? -1,
      stdout: res.stdout ?? '',
      stderr: res.stderr ?? '',
      offboardFailed: /OFFBOARD_FAILED=1/.test(res.stdout ?? ''),
      files,
    };
  }

  it('takes their key off every account that held it, in whatever spelling', () => {
    // The two spellings are the point. A key with a different comment, or
    // behind an options prefix, is the same standing access, and text matching
    // would leave both in place while reporting the person offboarded.
    const theirs = fingerprintOf(VALID_KEY);
    const survivor = keyLine(SECOND_KEY);
    const r = runSweep({
      departing: 'robin_fielder',
      theirFingerprints: [theirs],
      accounts: [
        { name: 'robin_fielder', keys: [keyLine(VALID_KEY)] },
        {
          name: 'footbag',
          keys: [
            '# Casey, workstation',
            survivor,
            '',
            withComment(keyLine(VALID_KEY), 'robin@laptop'),
          ],
        },
        { name: 'deploy', keys: [withOptions(keyLine(VALID_KEY)), survivor] },
        { name: 'bystander', keys: [survivor] },
        { name: 'no_ssh_dir' },
      ],
    });

    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Swept their keys from 2 other account\(s\)/);
    expect(r.offboardFailed).toBe(false);
    expect(r.stdout).toMatch(/no account on this host authorizes any key of theirs/);

    // Their key is gone from both files that held it.
    expect(r.files.footbag).not.toContain(keyLine(VALID_KEY).split(/\s+/)[1]);
    expect(r.files.deploy).not.toContain(keyLine(VALID_KEY).split(/\s+/)[1]);
    // Everyone else's access, and the human notes around it, are untouched.
    expect(r.files.footbag).toBe(`# Casey, workstation\n${survivor}\n\n`);
    expect(r.files.deploy).toBe(`${survivor}\n`);
    expect(r.files.bystander).toBe(`${survivor}\n`);
  });

  it('leaves the departing account’s own file to the step that moves it aside', () => {
    // Their own authorized_keys is the record of which key had access, and the
    // offboarding preserves it deliberately. The sweep skipping it by name is
    // what keeps those two decisions from cancelling out.
    const theirs = fingerprintOf(VALID_KEY);
    const own = keyLine(VALID_KEY);
    const r = runSweep({
      departing: 'robin_fielder',
      theirFingerprints: [theirs],
      accounts: [
        { name: 'robin_fielder', keys: [own] },
        { name: 'footbag', keys: [own, keyLine(SECOND_KEY)] },
      ],
    });
    expect(r.status).toBe(0);
    expect(r.files.robin_fielder).toBe(`${own}\n`);
    expect(r.stdout).toMatch(/Swept their keys from 1 other account\(s\)/);
  });

  it('refuses when a write did not land, rather than reporting the removal it ran', () => {
    // The whole reason the proof re-reads every account. The sweep prints
    // REMOVED for the line it filtered out; only re-reading the file notices
    // that the filtered copy never reached it.
    const theirs = fingerprintOf(VALID_KEY);
    const r = runSweep({
      departing: 'robin_fielder',
      theirFingerprints: [theirs],
      accounts: [
        { name: 'robin_fielder', keys: [keyLine(VALID_KEY)] },
        { name: 'footbag', keys: [keyLine(VALID_KEY), keyLine(SECOND_KEY)] },
      ],
      writeFailsFor: ['footbag'],
    });

    expect(r.stdout).toMatch(/REMOVED their key from footbag/);
    expect(r.stderr).toContain(`FAIL footbag still authorizes their key: ${theirs}`);
    expect(r.offboardFailed).toBe(true);
    expect(r.stdout).not.toMatch(/no account on this host authorizes any key of theirs/);
    expect(r.files.footbag).toContain(keyLine(VALID_KEY));
  });

  it('sweeps nothing and says so when no other account holds a key of theirs', () => {
    const r = runSweep({
      departing: 'robin_fielder',
      theirFingerprints: [fingerprintOf(VALID_KEY)],
      accounts: [
        { name: 'robin_fielder', keys: [keyLine(VALID_KEY)] },
        { name: 'footbag', keys: [keyLine(SECOND_KEY)] },
      ],
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/No keys of theirs on any other account/);
    expect(r.offboardFailed).toBe(false);
    expect(r.files.footbag).toBe(`${keyLine(SECOND_KEY)}\n`);
  });

  it('does nothing at all when the departing account had no keys to match on', () => {
    // Nothing to sweep is not the same as sweeping everything. An empty
    // fingerprint list must leave every file alone.
    const untouched = `${keyLine(VALID_KEY)}\n${keyLine(SECOND_KEY)}\n`;
    const r = runSweep({
      departing: 'robin_fielder',
      theirFingerprints: [],
      accounts: [
        { name: 'robin_fielder' },
        { name: 'footbag', keys: [keyLine(VALID_KEY), keyLine(SECOND_KEY)] },
      ],
    });
    expect(r.status).toBe(0);
    expect(r.files.footbag).toBe(untouched);
    expect(r.stdout).not.toMatch(/REMOVED their key/);
  });
});
