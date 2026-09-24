/**
 * scripts/provision-operator-account.sh — the argument guards, the checks that
 * run before anything is created, and the refusal that protects an account
 * somebody is already using.
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
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
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
      'cat > /dev/null',
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
 * Runs the script with the sudo password arriving on stdin, exactly as the
 * documented invocation does. stdout and stderr are pipes here, which is also
 * the condition the display guard has to recognise as "no terminal".
 */
function runScript(
  args: string[],
  opts: {
    existingAccount?: boolean;
    input?: string;
    resolvableAlias?: boolean;
    connectsAs?: string;
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

/**
 * The shared account's password is not this script's to set.
 *
 * Everything this script prints about a vault entry is written for a named
 * operator: a redacted password, and a note saying the account belongs to one
 * person and is not shared. For the shared account every word of that is
 * backwards — its entry carries the real value, because a credential everybody
 * is meant to hold is what a shared store is for. A run that set it here would
 * tell the custodian to redact a value that must be kept, leaving the vault
 * describing a credential nobody can retrieve.
 */
describe('provision-operator-account.sh — the shared account', () => {
  it('refuses to create it, before anything on the host is touched', () => {
    const r = runScript(args({ '--account': 'footbag' }));
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/is the shared account, and its password/);
    expect(r.stderr).toMatch(/custody operation/);
  });

  it('refuses to rotate its password, which is the reachable way in', () => {
    const r = runScript([...args({ '--account': 'footbag' }), '--rotate']);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/is the shared account/);
  });

  it('refuses it with --own-password too, where the operator types the value', () => {
    const r = runScript([...args({ '--account': 'footbag' }), '--own-password']);
    expect(r.exitCode).toBe(2);
  });

  it('names where the shared account keys are managed, rather than only refusing', () => {
    const r = runScript(args({ '--account': 'footbag' }));
    expect(r.stderr).toMatch(/authorize-operator-key\.sh/);
    expect(r.stderr).not.toMatch(/--rotate --key-only/);
  });

  it('refuses replacing its keys, which would remove every other holder key', () => {
    // Several holders' keys sit on the shared account, and a rotation writes
    // authorized_keys whole with the one key it was given. Refused before any
    // connection, so nothing on the host is reached.
    const r = runScript([...args({ '--account': 'footbag' }), '--rotate', '--key-only'], {
      existingAccount: true,
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/its keys are not\s+replaced from here/);
    expect(r.stderr).toMatch(/would remove every other holder's key/);
    expect(r.stderr).toMatch(/authorize-operator-key\.sh/);
    expect(r.stderr).toMatch(/Nothing done\./);
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
    expect(result.stderr).toMatch(/--target must be 'staging' or 'production'; there is no default/);
  });

  it('rejects an environment that is neither staging nor production', () => {
    const result = runScript(args({ '--target': 'prod' }));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--target must be 'staging' or 'production'/);
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
    // The refusal names where the attribution would have gone. That used to be
    // a separate register; it is the vault entry now, and the entry is the only
    // record that anybody holds the access at all.
    expect(result.stderr).toMatch(/recorded in the vault/);
  });

  it('rejects an account name the host would refuse, before opening a connection', () => {
    const result = runScript(args({ '--account': 'Robin Fielder' }));
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
    const result = runScript(args(), { input: '' });
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
    const result = runScript(args(), { resolvableAlias: false });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/SSH alias 'footbag-staging' is not configured/);
    expect(result.stderr).toMatch(/deploy alias stanza/);
    expect(result.stdout).not.toMatch(/SSH OK/);
  });

  it('honours DEPLOY_TARGET when naming the alias it could not resolve', () => {
    // The alias is not always derived from --target, so a refusal that named
    // the derived one would send the operator to fix a stanza they were not
    // using.
    const result = spawnSync('bash', [SCRIPT, ...args()], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      input: 'fixture-sudo-password\n',
      env: {
        ...process.env,
        ...NO_AWS_CREDENTIALS,
        DEPLOY_TARGET: 'some-other-host',
        FOOTBAG_PROVISION_SSH: sshStub(false),
        FOOTBAG_KNOWN_HOSTS: PIN,
      },
      ...SPAWN_GUARD,
    });
    expect(result.status).toBe(1);
    expect(result.stderr ?? '').toMatch(/SSH alias 'some-other-host' is not configured/);
  });

  it('names the credential file for the target it was actually given', () => {
    // A production run refused with the staging file named is a refusal the
    // operator cannot act on: they re-run with the file the message gave, and
    // it fails the same way.
    const result = runScript(args({ '--target': 'production' }), { input: '' });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/AWS_OPERATOR_PRODUCTION\.txt/);

    const staging = runScript(args({ '--target': 'staging' }), { input: '' });
    expect(staging.stderr).toMatch(/AWS_OPERATOR\.txt/);
    expect(staging.stderr).not.toMatch(/AWS_OPERATOR_PRODUCTION\.txt/);
  });

  it('names the file for the account it is connecting as, not the shared one', () => {
    // An operator who already has their own account provisions the next person
    // from it, so the credential this run needs is their own. Naming the shared
    // file would have them pipe a password the host will refuse for this login,
    // and the refusal lands on the host as a sudo failure.
    const result = runScript(args({ '--target': 'staging' }), {
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
      'ssh-ed25519 this-is-not-a-key robin@example',
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
        // The subject here is the pin, which is checked after the alias
        // preflight, so this case supplies a resolving alias to reach it.
        PATH: `${ALIAS_BIN}:${process.env.PATH ?? ''}`,
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
        // Same as above: the pin is what this asserts on, so the alias
        // preflight ahead of it is given what it needs.
        PATH: `${ALIAS_BIN}:${process.env.PATH ?? ''}`,
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
    // The reason matters more than the refusal: the risk is to the password
    // its owner is already using, not to the host.
    expect(result.stderr).toMatch(/may already be using the password it holds/);
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
 * The create path needs a terminal to display the minted password on, so it is
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
      ...args().map((a) => JSON.stringify(a)),
      '<',
      JSON.stringify(cred),
    ].join(' ');
    spawnSync('script', ['-qec', inner, '/dev/null'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      // Declines the vault prompt, so the run ends without a proof login.
      input: 'no\n',
      env: {
        ...process.env,
        ...NO_AWS_CREDENTIALS,
        FAKE_SSH_USER: 'footbag',
        PATH: `${ALIAS_BIN}:${process.env.PATH ?? ''}`,
        FOOTBAG_PROVISION_SSH: stub,
        FOOTBAG_KNOWN_HOSTS: PIN,
      },
      ...SPAWN_GUARD,
    });

    expect(existsSync(record), 'no privileged session reached the host').toBe(true);
    const lines = readFileSync(record, 'utf-8').split('\n').filter((l, i, all) => i < all.length - 1);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toBe('fixture-sudo-password');
  });

  it('does not report a finished run as unfinished', () => {
    // A run that reached VAULTED and finished used to leave the cleanup armed,
    // so it closed on "The run did not finish" beneath its own success message.
    const cred = join(WORK_DIR, 'cred-finished');
    writeFileSync(cred, 'fixture-sudo-password\n');
    chmodSync(cred, 0o600);
    const inner = ['bash', JSON.stringify(SCRIPT), ...args().map((a) => JSON.stringify(a)), '<', JSON.stringify(cred)].join(' ');
    const r = spawnSync('script', ['-qec', inner, '/dev/null'], {
      encoding: 'utf-8',
      input: 'VAULTED\n',
      env: {
        ...process.env,
        ...NO_AWS_CREDENTIALS,
        FAKE_SSH_USER: 'footbag',
        PATH: `${ALIAS_BIN}:${process.env.PATH ?? ''}`,
        FOOTBAG_PROVISION_SSH: sshStub(false),
        FOOTBAG_KNOWN_HOSTS: PIN,
      },
      ...SPAWN_GUARD,
    });
    expect(r.stdout).toMatch(/Account robin_fielder is ready/);
    expect(r.stdout).not.toMatch(/The run did not finish/);
  });
});

/**
 * Your own account, existing, and reached by no key you hold: the key was lost.
 *
 * Nothing on this machine can tell a lost key of yours from somebody else's
 * account under your name, so the run reads what the account accepts, shows
 * it, and rotates only on the operator's typed attestation. The read changes
 * nothing, a retired account is refused, and a missing APPLY changes nothing.
 */
describe('provision-operator-account.sh — attesting an unreachable account is yours', () => {
  const LOST_KEY = '256 SHA256:lostKeyFingerprintForThisSuite0000000000000 david_leberknight (ED25519)';

  /** A host that reports the account as existing and answers the inspection. */
  function attestStub(inspect: string): { stub: string; sessions: string } {
    const sessions = join(WORK_DIR, `sessions-${Math.random().toString(36).slice(2)}`);
    mkdirSync(sessions);
    const answer = join(sessions, 'inspect-answer');
    writeFileSync(answer, inspect);
    const stub = join(sessions, 'ssh');
    writeFileSync(
      stub,
      [
        '#!/usr/bin/env bash',
        'for a in "$@"; do',
        '  case "$a" in',
        "    *\"echo 'SSH OK'\"*) echo '    SSH OK'; exit 0 ;;",
        '    *"id -u"*) echo EXISTS; exit 0 ;;',
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

  function sessionModes(sessions: string): string[] {
    const r = spawnSync('bash', ['-c', `cat ${JSON.stringify(sessions)}/session-* 2>/dev/null | grep '^OPACC_MODE='`], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    return (r.stdout ?? '').split('\n').filter(Boolean);
  }

  /** Every line every privileged session received, for the assignments it carried. */
  function sessionLines(sessions: string): string[] {
    const r = spawnSync('bash', ['-c', `cat ${JSON.stringify(sessions)}/session-* 2>/dev/null`], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    return (r.stdout ?? '').split('\n');
  }

  function runAttest(stub: string, opts: { terminal?: string } = {}) {
    const argv = [...args({ '--account': 'david_leberknight', '--operator': 'David Leberknight' }), '--own-password', '--attest-own'];
    const env = {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      FAKE_SSH_USER: 'footbag',
      PATH: `${ALIAS_BIN}:${process.env.PATH ?? ''}`,
      FOOTBAG_PROVISION_SSH: stub,
      FOOTBAG_KNOWN_HOSTS: PIN,
    };
    if (opts.terminal === undefined) {
      return spawnSync('bash', [SCRIPT, ...argv], {
        encoding: 'utf-8',
        input: 'fixture-sudo-password\n',
        env,
        ...SPAWN_GUARD,
      });
    }
    const cred = join(WORK_DIR, 'attest-cred');
    writeFileSync(cred, 'fixture-sudo-password\n');
    chmodSync(cred, 0o600);
    const inner = ['bash', JSON.stringify(SCRIPT), ...argv.map((a) => JSON.stringify(a)), '<', JSON.stringify(cred)].join(' ');
    return spawnSync('script', ['-qec', inner, '/dev/null'], {
      encoding: 'utf-8',
      input: opts.terminal,
      env,
      ...SPAWN_GUARD,
    });
  }

  it('is refused without --own-password, since only your own account can be attested', () => {
    const r = runScript([...args(), '--attest-own']);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/--attest-own needs --own-password/);
  });

  it('is refused alongside --rotate, since it decides the rotation itself', () => {
    const r = runScript([...args(), '--own-password', '--attest-own', '--rotate']);
    expect(r.exitCode).toBe(2);
  });

  const RETIRED_KEY = '256 SHA256:retiredKeyFingerprintForThisSuite00000000000 david_leberknight (ED25519)';
  const RETIRED = `SHELL /sbin/nologin\nPASSWORD LK\nOFFBOARDED yes\nRETIRED ${RETIRED_KEY}\n`;

  it('shows a retired account with the keys it was retired with, and changes nothing without APPLY', () => {
    const { stub, sessions } = attestStub(RETIRED);
    const r = runAttest(stub);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/was retired by an offboard/);
    expect(r.stdout).toContain(RETIRED_KEY);
    expect(r.stderr).toMatch(/is untouched/);
    expect(sessionModes(sessions)).toEqual(['OPACC_MODE=inspect']);
  });

  it('reopens a retired account for its own person once the operator types APPLY', () => {
    const { stub, sessions } = attestStub(RETIRED);
    runAttest(stub, { terminal: 'APPLY\nfixture-own-password-1\nfixture-own-password-1\nno\n' });
    expect(sessionModes(sessions)).toEqual(['OPACC_MODE=inspect', 'OPACC_MODE=rotate']);
    expect(sessionLines(sessions)).toContain('OPACC_REOPEN=yes');
  });

  it('does not reopen an account that was never retired', () => {
    const { stub, sessions } = attestStub(`SHELL /bin/bash\nPASSWORD P\nOFFBOARDED no\nKEY ${LOST_KEY}\n`);
    runAttest(stub, { terminal: 'APPLY\nfixture-own-password-1\nfixture-own-password-1\nno\n' });
    expect(sessionLines(sessions)).toContain('OPACC_REOPEN=no');
    expect(sessionLines(sessions)).not.toContain('OPACC_REOPEN=yes');
  });

  it('shows the keys the account accepts and changes nothing without a typed APPLY', () => {
    const { stub, sessions } = attestStub(`SHELL /bin/bash\nPASSWORD P\nOFFBOARDED no\nKEY ${LOST_KEY}\n`);
    const r = runAttest(stub);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(LOST_KEY);
    expect(r.stderr).toMatch(/is untouched/);
    expect(sessionModes(sessions)).toEqual(['OPACC_MODE=inspect']);
  });

  it('rotates the account once the operator types APPLY', () => {
    const { stub, sessions } = attestStub(`SHELL /bin/bash\nPASSWORD P\nOFFBOARDED no\nKEY ${LOST_KEY}\n`);
    // APPLY, the new password twice, then a declined vault prompt, which leaves
    // a rotated account in place rather than removing it.
    const r = runAttest(stub, { terminal: 'APPLY\nfixture-own-password-1\nfixture-own-password-1\nno\n' });
    expect(r.stdout).toContain(LOST_KEY);
    expect(sessionModes(sessions)).toEqual(['OPACC_MODE=inspect', 'OPACC_MODE=rotate']);
  });
});

describe('provision-operator-account.sh — a per-person password is not vaulted', () => {
  // The vault is shared between custodians. A personal credential kept there
  // lets any custodian act as any operator, so an access record naming one of
  // them records nothing, and the attribution a named account exists to create
  // is gone. The governance rule already says the vault records who holds
  // access and never their personal credential; a sudo password is that.
  //
  // What makes it safe rather than merely principled is the expiry: the minted
  // value admits one login, which must replace it, so the standing password
  // ends up known to its owner alone and there is nothing worth vaulting.
  const source = readFileSync(SCRIPT, 'utf-8');
  const half = readFileSync(
    join(process.cwd(), 'scripts/internal/provision-operator-account-remote.sh'),
    'utf-8',
  );

  it('expires the minted password on the host, so it is one-time', () => {
    expect(half).toMatch(/chage -d 0 -- "\$OPACC_ACCOUNT"/);
  });

  it('verifies the expiry rather than assuming the command worked', () => {
    expect(half).toMatch(/password must be changed/);
    expect(half).toMatch(/FAIL password is not expired/);
  });

  it('still writes a vault entry, carrying everything except the password', () => {
    // The entry is the access record and belongs in the shared store. What it
    // must not carry is the credential, so the password field says REDACTED and
    // the notes say why, rather than the field going blank and reading as an
    // oversight the next person helpfully fills in.
    expect(source).toMatch(/Title:     \$\{VAULT_ENTRY\}/);
    expect(source).toMatch(/Password:  REDACTED/);
    expect(source).toMatch(/NOT held here and must not be added/);
    expect(source).toMatch(/Public key fingerprint/);
  });

  it('shows the one-time password separately and marks it as not for the vault', () => {
    expect(source).toMatch(/NOT for the vault/);
    expect(source).not.toMatch(/echo "  Password:  \$\{NEW_PASS\}"/);
  });

  it('names a recovery path that does not depend on a stored secret', () => {
    // A vault entry with no password is only workable if forgetting it has an
    // answer. The owner typing a new one is that answer, and saying so is what
    // stops someone adding the password back for convenience. A bare --rotate
    // would mint an expired one-time password, which is not a sanctioned path.
    expect(source).toMatch(/Forgotten password/);
    expect(source).toMatch(/their own with --rotate --own-password/);
    expect(source).not.toMatch(/--rotate, which issues a fresh/);
  });

  it('still refuses to leave an unrecorded account behind', () => {
    expect(source).toMatch(/Type VAULTED once the entry is recorded/);
    expect(source).toMatch(/an unrecorded account is access that no review will ever see/);
  });

  it('puts the approval date in the vault entry, since that entry is the whole record', () => {
    // There was a separate register holding the operator, account, fingerprint,
    // environment and two dates. Four of those six duplicated the vault entry,
    // the two drifted within a day, and the register was deleted. The approval
    // date is the one field it held that the entry did not, so the entry took
    // it on rather than losing it.
    expect(source).toMatch(/Access approved: \$\{TODAY\}/);
  });

  it('records a rotation as a key replacement, never as a new approval of access', () => {
    // A rotation reinstalls the key; it does not approve the access again. So the
    // approval date already in the entry stays, and the rotation adds its own
    // date beside it. The approval-dated line is printed only on a create.
    const rotateBranch = source.slice(
      source.indexOf('if [[ "$MODE" == "rotate" ]]; then\n    # A rotation reinstalls the key'),
    );
    expect(rotateBranch).toMatch(/Access approved: keep the date already recorded in the entry\./);
    expect(rotateBranch).toMatch(/Key replaced: \$\{TODAY\}\./);
    const approvedToday = source.indexOf('Access approved: ${TODAY}');
    const rotateCheck = source.indexOf('# A rotation reinstalls the key; it does not approve');
    expect(rotateCheck).toBeGreaterThan(0);
    expect(approvedToday).toBeGreaterThan(rotateCheck);
    expect(source).toMatch(/The entry already exists\. Update it: replace its fingerprint/);
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

  it('refuses --rotate and --offboard together, as arguments', () => {
    // No key in this one: the key refusal fires first and would mask the
    // conflict being asserted.
    const r = runScript(
      [
        '--target', 'staging',
        '--account', 'robin_fielder',
        '--operator', 'Robin Fielder',
        '--offboard',
        '--rotate',
      ],
      { existingAccount: true },
    );
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/opposite intentions/);
  });

  it('is a no-op on an account that does not exist, and says what is still owed', () => {
    // Idempotent, and it still points at the register: the row is the thing
    // that outlives the account.
    const r = runScript(
      ['--target', 'staging', '--account', 'gone_already', '--operator', 'Gone Already', '--offboard'],
      { existingAccount: false },
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/does not exist/);
    // It still points at the record, which outlives the account: the vault
    // entry is the only trace that the access was ever held.
    expect(r.stdout).toMatch(/vault entry host-/);
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
 * A trap may only undo what the run itself created.
 *
 * The state was set to "created" unconditionally, rotate mode included, so a
 * --rotate run that stopped for any reason -- an interrupt, a declined vault
 * prompt, a verification that failed for an unrelated reason -- sent
 * OPACC_MODE=remove for an account that PREDATED it. The remote half's remove is
 * `userdel -r`: the person's account, home directory, shell history and every
 * file they owned, destroyed by declining a prompt, while stderr said "the
 * account just created is being removed".
 */
/**
 * What the script tells an operator to do with a credential or a host.
 *
 * The branch that shows a one-time password needs a real terminal, so its
 * output cannot be driven here, and the rules it must follow are pinned on the
 * text instead. A password is never handed over by voice: its delivery to a
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
    // The instruction form, which is what an operator would follow. The script
    // does name voice, in order to rule it out.
    expect(echoed).not.toMatch(/hand it over[^\n]*by voice/i);
    expect(echoed).toMatch(/never handed over by voice or in any readable form/);
  });

  it('never hands the operator a raw ssh command against a host', () => {
    expect(echoed).not.toMatch(/echo "\s*ssh /);
    expect(echoed).not.toMatch(/'sudo userdel/);
  });
});

/**
 * Provisioning your OWN account.
 *
 * The default flow generates a password, prints it, and expires it on the host
 * so the first login must replace it. That is right when provisioning somebody
 * else: nobody here is entitled to choose another person's password, and the
 * generated one is a bootstrap token rather than a credential.
 *
 * It is a ceremony with no security content when the account is your own. It
 * puts a credential on your screen and in your scrollback for no reason, makes
 * you invent a second password minutes later, and leaves the account depending
 * on a change prompt appearing at the right moment on a host where you may be
 * the only person who can log in.
 */
describe('provision-operator-account.sh — --own-password', () => {
  const source = readFileSync(SCRIPT, 'utf-8');
  const remote = readFileSync(REMOTE_HALF, 'utf-8');

  it('reads the password from the terminal, hidden, and asks twice', () => {
    // Twice because it is not echoed, so a typo is invisible at the moment it
    // happens and would surface as a locked-out account.
    expect(source).toMatch(/read -rs NEW_PASS < \/dev\/tty/);
    expect(source).toMatch(/read -rs NEW_PASS_CONFIRM < \/dev\/tty/);
    expect(source).toMatch(/the two entries differ/);
  });

  it('never generates and never displays a password in that mode', () => {
    const own = source.slice(source.indexOf('if (( OWN_PASSWORD )); then'));
    const branch = own.slice(0, own.indexOf('else'));
    expect(branch).not.toMatch(/openssl rand/);
    expect(branch).not.toMatch(/echo "      \$\{NEW_PASS\}"/);
  });

  it('refuses a password too short to stand alone', () => {
    // It is not vaulted, so nothing else recovers the account if it is guessed.
    expect(source).toMatch(/shorter than 12 characters/);
    expect(source).toMatch(/not vaulted, so nothing else/);
  });

  it('tells the host not to expire a password the owner chose', () => {
    expect(source).toMatch(/OPACC_EXPIRE_PASSWORD=%q/);
    expect(remote).toMatch(/OPACC_EXPIRE_PASSWORD:-yes/);
  });

  it('asserts the opposite outcome rather than skipping the check', () => {
    // An expired password here would send the operator to a change prompt for a
    // password they had just chosen, and if it did not appear they could not
    // sudo at all. So the verification branches rather than going quiet.
    expect(remote).toMatch(/password is expired, but the operator chose it themselves/);
  });

  it('proves the account end to end, which it cannot do for somebody else', () => {
    // Both halves are on this machine in this case: the private key and the
    // password. The hand-off in the other branch exists because neither is.
    expect(source).toMatch(/Proving the account end to end/);
    expect(source).toMatch(/-o "User=\$\{ACCOUNT\}"/);
    expect(source).toMatch(/sudo -k -S -p "" -v/);
  });

  it('does not remove the account when that proof fails, because it is vaulted by then', () => {
    const proof = source.slice(source.indexOf('Proving the account end to end'));
    expect(proof).toMatch(/NOT being removed/);
    expect(proof).toMatch(/re-run with --rotate/);
  });

  it('files the password into the credential file, since nothing else ever sees it', () => {
    // It is typed straight into this script and never displayed or returned, so
    // an operator asked to create that file afterwards would be retyping a
    // secret from memory into a path they also have to get right. One character
    // wrong in either arrives days later as a sudo failure on the host, which
    // reads as a broken account and is neither.
    const proof = source.slice(source.indexOf('Proving the account end to end'));
    expect(proof).toMatch(/operator_credential_file_for "\$ACCOUNT" "\$TARGET"/);
    expect(proof).toMatch(/umask 077/);
    expect(proof).toMatch(/chmod 600/);
  });

  it('files it only after the proofs, so the value on disk is one shown to work', () => {
    const proof = source.slice(source.indexOf('Proving the account end to end'));
    const filing = proof.indexOf('operator_credential_file_for');
    const sudoProof = proof.indexOf('sudo -k -S -p "" -v');
    expect(sudoProof).toBeGreaterThan(-1);
    expect(filing).toBeGreaterThan(sudoProof);
    // And never on a run whose proofs failed.
    expect(proof.slice(filing - 200, filing)).toMatch(/! PROOF_FAILED/);
  });

  it('takes the file name from the shared rule rather than spelling one here', () => {
    // Two callers derive this name from different directions, and a second
    // spelling is how a password comes to be filed under one name and looked
    // for under another.
    const proof = source.slice(source.indexOf('Proving the account end to end'));
    expect(proof).not.toMatch(/HOST_OPERATOR.*\.txt/);
  });

  it('does not file the shared account password, which is not one person to file', () => {
    // It is the host's way back in, every footbag-operator holder holds it, and the vault is
    // its canonical copy. Writing it from one operator's run would put a shared
    // credential on one machine and leave the vault describing a password that
    // is no longer in use.
    const proof = source.slice(source.indexOf('Proving the account end to end'));
    const filing = proof.indexOf('operator_credential_file_for');
    expect(proof.slice(0, filing)).toMatch(/ACCOUNT" == "\$OPERATOR_SHARED_ACCOUNT/);
    expect(proof).toMatch(/is not filed here/);
  });

  it('does not file a password minted for somebody else', () => {
    // That one is a bootstrap token for a machine which is not this one, and
    // filing it here would leave their credential on the provisioner's disk.
    const handOff = source.slice(source.indexOf('The next two checks run from'));
    expect(handOff).not.toMatch(/operator_credential_file_for/);
  });

  it('wipes the password from memory on both paths once it is done with it', () => {
    const after = source.slice(source.indexOf('Proving the account end to end'));
    expect(after.match(/^\s*NEW_PASS=""$/gm)?.length).toBeGreaterThanOrEqual(2);
  });

  it('refuses --offboard alongside it, which sets no password at all', () => {
    const r = runScript(
      ['--target', 'staging', '--account', 'x_y', '--operator', 'X Y', '--offboard', '--own-password'],
      { existingAccount: true },
    );
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/has nothing to do/);
  });

  it('still keeps the password out of the vault, which is the rule that does not move', () => {
    // The vault is shared. A personal credential in it lets any custodian act
    // as any operator, whoever chose it.
    const own = source.slice(source.indexOf('if (( OWN_PASSWORD )); then'));
    expect(own).toMatch(/is not in\n.*the vault|not in the vault|is not vaulted/);
  });
});

describe('a rotation never removes the account it is rotating', () => {
  const source = readFileSync(SCRIPT, 'utf-8');

  it('does not mark a rotation as something the cleanup created', () => {
    expect(source).toMatch(/if \[\[ "\$MODE" == "rotate" \]\]; then\s*\n\s*PROVISION_STATE="rotating"/);
  });

  it('has a cleanup branch for a rotation that removes nothing', () => {
    const cleanup = source.slice(source.indexOf('provision_cleanup() {'));
    const rotating = cleanup.slice(cleanup.indexOf('rotating)'), cleanup.indexOf('vaulted)'));
    expect(rotating).toMatch(/NOT being/);
    expect(rotating).not.toMatch(/OPACC_MODE=%q\\n' "remove"/);
    expect(rotating).not.toMatch(/userdel/);
  });

  it('says the password is uncertain, which is the real consequence', () => {
    // The account is safe; what the operator actually needs to know is that its
    // password may have been changed before the run stopped, so the owner
    // should not try to sudo until it has been re-run.
    const cleanup = source.slice(source.indexOf('provision_cleanup() {'));
    const rotating = cleanup.slice(cleanup.indexOf('rotating)'), cleanup.indexOf('vaulted)'));
    expect(rotating).toMatch(/password is now uncertain/);
    expect(rotating).toMatch(/--rotate/);
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

describe('provision-operator-account.sh — replacing only the key', () => {
  // The two credentials fail independently. A lost or compromised private key
  // says nothing about the password, so forcing a new password to replace a key
  // costs a one-time value travelling between two people and a first-login
  // ceremony, to fix something that was not broken.

  it('refuses --key-only without --rotate, because a new account needs a password', () => {
    const r = runScript([...args(), '--key-only'], { existingAccount: false });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/--key-only narrows --rotate/);
  });

  it('refuses --key-only with --own-password, which sets the password it leaves alone', () => {
    const r = runScript([...args(), '--rotate', '--key-only', '--own-password'], {
      existingAccount: true,
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/opposite intentions/);
  });

  it('refuses --key-only with --offboard, which ends the access it renews', () => {
    const r = runScript(
      [
        '--target', 'staging',
        '--account', 'robin_fielder',
        '--operator', 'Robin Fielder',
        '--offboard',
        '--key-only',
      ],
      { existingAccount: true },
    );
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/opposite intentions/);
  });

  it('tells the remote half not to set a password, and the remote half obeys', () => {
    const source = readFileSync(SCRIPT, 'utf-8');
    const remote = readFileSync(REMOTE_HALF, 'utf-8');
    // The caller sends the decision rather than the remote half inferring it
    // from an empty password, which would make an accidental empty value look
    // like a deliberate key-only run.
    expect(source).toMatch(/OPACC_SET_PASSWORD=%q/);
    expect(remote).toMatch(/OPACC_SET_PASSWORD:-yes/);
    expect(remote).toMatch(/password was not touched/);
  });

  it('drops the expiry assertion with the password, rather than asserting either way', () => {
    // Whether this account's existing password is expired was decided before
    // this run. Asserting "not expired" would fail a correct key-only rotation
    // against an owner who has never logged in; asserting "expired" would fail
    // every other one.
    const remote = readFileSync(REMOTE_HALF, 'utf-8');
    expect(remote).toMatch(/password untouched by this run/);
  });

  it('still demands the vault entry, because the recorded fingerprint is now wrong', () => {
    // A fingerprint that no longer matches the host is worse than none: it
    // reads as evidence and is not.
    const source = readFileSync(SCRIPT, 'utf-8');
    expect(source).toMatch(/fingerprint recorded in it is now/);
    expect(source).toMatch(/Type VAULTED/);
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
