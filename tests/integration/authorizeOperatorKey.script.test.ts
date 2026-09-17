/**
 * scripts/authorize-operator-key.sh — the argument guards, the key checks that
 * run before anything is changed, and the properties the root-side body must
 * hold when it edits a file other people's access lives in.
 *
 * This script is the unblocker for a new operator: these hosts accept
 * public-key authentication only, so somebody whose key is in no
 * authorized_keys file cannot reach a shell at all, whatever password they
 * hold. Once their key is on the shared account they can provision their own
 * named account themselves and choose their own password, so the only thing
 * that ever travels between two people is a public key.
 *
 * The mutating half belongs to an operator with a real host and a real sudo
 * password and is not exercised here. What is pinned is everything before the
 * first change, plus the root-side invariants that a hand-run would never
 * check: that the file is appended to rather than rebuilt, that exactly one key
 * moves, and that every key belonging to somebody else survives. Those are the
 * failures that report success and lock an unrelated operator out.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';

const SCRIPT = join(process.cwd(), 'scripts/authorize-operator-key.sh');
const REMOTE_HALF = join(process.cwd(), 'scripts/internal/authorize-operator-key-remote.sh');

let VALID_KEY = '';
let SECOND_KEY = '';
// A third key so a fixture can carry somebody else's access alongside both the
// subject and whatever a wrong write adds.
let THIRD_KEY = '';
let WORK_DIR = '';
let PIN = '';
let SSH_STUB = '';

beforeAll(() => {
  WORK_DIR = mkdtempSync(join(tmpdir(), 'footbag-test-authkey-'));

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
  THIRD_KEY = keygen('bystander-key');

  PIN = join(WORK_DIR, 'footbag_known_hosts');
  writeFileSync(PIN, '# pinned host keys fixture\n');
  chmodSync(PIN, 0o600);

  SSH_STUB = join(WORK_DIR, 'ssh-stub');
  writeFileSync(
    SSH_STUB,
    ['#!/usr/bin/env bash', 'cat > /dev/null', 'exit 0'].join('\n'),
  );
  chmodSync(SSH_STUB, 0o755);
});

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Runs the script with the sudo password on stdin, as the documented form does. */
function runScript(args: string[]): RunResult {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: 'fixture-sudo-password\n',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      FOOTBAG_AUTHKEY_SSH: SSH_STUB,
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
    '--account': 'footbag',
    '--operator': 'Julie Symons',
    '--key-file': VALID_KEY,
  };
  const merged = { ...base, ...overrides };
  return Object.entries(merged).flatMap(([k, v]) => (v === '' ? [] : [k, v]));
}

describe('authorize-operator-key.sh — invocation guards', () => {
  it('refuses to infer the environment', () => {
    const r = runScript(args({ '--target': '' }));
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/'staging' or 'production'/);
  });

  it('refuses an unknown environment', () => {
    const r = runScript(args({ '--target': 'prod' }));
    expect(r.exitCode).toBe(2);
  });

  it('refuses to guess which account gains a way in', () => {
    // The whole decision this script makes. A default here would quietly pick
    // the account somebody gets access to.
    const r = runScript(args({ '--account': '' }));
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/--account is required and has no default/);
  });

  it('refuses a key with nobody named against it', () => {
    // A bootstrap key nobody is named against is an access nobody will think
    // to withdraw.
    const r = runScript(args({ '--operator': '' }));
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/--operator is required/);
  });

  it('refuses an account name the host would reject', () => {
    const r = runScript(args({ '--account': 'Julie Symons' }));
    expect(r.exitCode).toBe(2);
  });

  it('refuses an unknown flag rather than ignoring it', () => {
    const r = runScript([...args(), '--force']);
    expect(r.exitCode).toBe(2);
  });
});

describe('authorize-operator-key.sh — what it accepts as a public key', () => {
  it('requires a key at all', () => {
    const r = runScript(args({ '--key-file': '' }));
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/the key is required/);
  });

  it('refuses both spellings at once, rather than silently picking one', () => {
    const r = runScript([...args(), '--key-line', 'ssh-ed25519 AAAA test@host']);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/not both/);
  });

  it('refuses a key file it cannot read', () => {
    const r = runScript(args({ '--key-file': join(WORK_DIR, 'nope.pub') }));
    expect(r.exitCode).toBe(2);
  });

  it('refuses a file holding two keys, which would authorize a second person', () => {
    const both = join(WORK_DIR, 'two.pub');
    writeFileSync(both, `${readFileSync(VALID_KEY, 'utf-8')}${readFileSync(SECOND_KEY, 'utf-8')}`);
    const r = runScript(args({ '--key-file': both }));
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/expected exactly one key/);
  });

  it('refuses a key ssh-keygen cannot parse', () => {
    // An unparseable key installs cleanly and fails every login afterwards as
    // "Permission denied (publickey)", which reads as the key owner's problem.
    const bad = join(WORK_DIR, 'bad.pub');
    writeFileSync(bad, 'ssh-ed25519 this-is-not-base64 broken@host\n');
    const r = runScript(args({ '--key-file': bad }));
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/cannot parse that key/);
  });
});

describe('authorize-operator-key.sh — preconditions before anything changes', () => {
  it('refuses when the sudo password is not on stdin', () => {
    const r = spawnSync('bash', [SCRIPT, ...args()], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      input: '',
      env: { ...process.env, ...NO_AWS_CREDENTIALS, FOOTBAG_KNOWN_HOSTS: PIN },
      ...SPAWN_GUARD,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/host sudo password/);
  });

  it('announces the ssh stub, because a stubbed run proves nothing about the host', () => {
    const r = runScript(args());
    expect(r.stderr).toMatch(/stubbed via FOOTBAG_AUTHKEY_SSH/);
  });

  it('will not change anything without a typed confirmation', () => {
    // stdin carries the credential, so the confirmation is read from the
    // terminal device; there is none here, which must refuse rather than
    // proceed.
    const r = runScript(args());
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toMatch(/no terminal to confirm on/);
  });
});

describe('authorize-operator-key.sh — what it says it is doing', () => {
  const source = readFileSync(SCRIPT, 'utf-8');

  it('creates no account and mints no password', () => {
    // The distinction from provision-operator-account.sh. This grants a second
    // way into an identity that exists; it never grants a new identity.
    expect(source).not.toMatch(/useradd/);
    expect(source).not.toMatch(/chpasswd/);
    expect(source).not.toMatch(/openssl rand/);
  });

  it('names the bootstrap as a loan and tells the operator to withdraw it', () => {
    // A key left in a shared account means an action taken as that account
    // could have been any of them, which is the attribution named accounts
    // exist to create.
    expect(source).toMatch(/--remove/);
    expect(source).toMatch(/THEN COME BACK AND WITHDRAW THIS KEY/);
  });

  it('hands the newcomer the self-service command, with --own-password', () => {
    // The point of the whole script: the only thing that travelled was a
    // public key, and they choose their own password.
    expect(source).toMatch(/provision-operator-account\.sh/);
    expect(source).toMatch(/--own-password/);
  });

  it('carries the sudo password over the wire pattern rather than argv', () => {
    expect(source).toMatch(/printf '%s\\n' "\$SUDO_PASS"/);
    expect(source).toMatch(/sudo -k -S -p "" bash/);
  });
});

describe('authorize-operator-key.sh — the root-side invariants', () => {
  const remote = readFileSync(REMOTE_HALF, 'utf-8');

  it('appends rather than rebuilding the file', () => {
    // Every other key in authorized_keys is somebody else's access. Rewriting
    // the file to add one line is how an unrelated operator is locked out by a
    // run that reports success.
    expect(remote).toMatch(/cat "\$AUTH_FILE" > "\$WORK"/);
  });

  it('matches on fingerprint, not on key text', () => {
    // A different comment, different whitespace or an options prefix is the
    // same credential. Text comparison would authorize a duplicate on add and
    // miss the key on remove.
    expect(remote).toMatch(/AUTHKEY_FINGERPRINT/);
    expect(remote).toMatch(/ssh-keygen -l/);
  });

  it('is idempotent on add and on remove', () => {
    expect(remote).toMatch(/Already authorized/);
    expect(remote).toMatch(/nothing to remove/);
  });

  it('asserts exactly one key moved', () => {
    // The check an eyeball never makes, and the one that catches a rebuild
    // that dropped somebody.
    expect(remote).toMatch(/exactly one changed/);
  });

  it('asserts every pre-existing key survived, which a count alone would miss', () => {
    // A count is satisfied by a swap: one key lost, one gained.
    expect(remote).toMatch(/a pre-existing key is gone/);
  });

  it('asserts the mode and owner sshd requires', () => {
    // sshd silently ignores a group- or world-writable authorized_keys, with
    // nothing in the client output to say so.
    expect(remote).toMatch(/sshd will ignore it/);
  });

  it('refuses an account that does not exist rather than creating one', () => {
    expect(remote).toMatch(/does not exist on this host/);
    expect(remote).toMatch(/never creates one/);
  });

  it('cleans up its temp files on interrupt as well as exit', () => {
    expect(remote).toMatch(/trap authkey_cleanup EXIT INT TERM/);
  });

});

/**
 * The root-side body, run against real files rather than read.
 *
 * Everything above this point asserts that the body SAYS the right things. That
 * is not the same as doing them, and the difference is measurable: change the
 * `+ 1` in `WANT=$(( BEFORE_COUNT + 1 ))` to `+ 2` and the invariant that
 * exactly one key moved is gone, while every text assertion still passes,
 * because what they check is that the phrase "exactly one changed" appears in
 * the file. This block is what notices.
 *
 * The body is taken in two slices so the real helpers run as themselves:
 *
 *   - the helpers, which bring the cleanup trap, `install_via_tmp` and
 *     `fingerprints_of` in intact;
 *   - the core, from the before-state through both mode branches, the write and
 *     the whole verification block.
 *
 * What is skipped between them is the root check, the account-existence probe
 * and the `getent passwd` home lookup, none of which is the logic under test —
 * and the home lookup is the reason the cut lands where it does. It resolves
 * the account's home from the real passwd database and builds AUTH_FILE from
 * it, so a slice taken any earlier, with the account set to the login running
 * the tests, would rewrite the developer's own ~/.ssh/authorized_keys. Starting
 * after it and supplying AUTH_FILE here makes that impossible.
 *
 * `install` is a shell function in the preamble rather than the real binary.
 * The body writes through `install -m … -o … -g …`, and `-o` is documented
 * super-user-only, so a test resting on it would be green here and possibly red
 * on the runner. The stand-in honours the mode and drops the ownership flags,
 * and the account is this test's own login, so the closing assertion that the
 * file ends up 600 owned by that account still passes honestly rather than
 * being stubbed past.
 */
describe('authorize-operator-key-remote.sh — what it does to a real file', () => {
  /** How the privileged write behaves, so a wrong outcome can be driven. */
  type WriteBehaviour = 'faithful' | 'adds-a-second-key' | 'drops-a-survivor';

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

  function keyLine(pubKeyPath: string): string {
    return readFileSync(pubKeyPath, 'utf-8').trim();
  }

  /** The same credential, spelled the way somebody else's file might spell it. */
  function withComment(line: string, comment: string): string {
    return `${line.split(/\s+/).slice(0, 2).join(' ')} ${comment}`;
  }

  function withOptions(line: string): string {
    return `no-agent-forwarding,no-X11-forwarding ${line}`;
  }

  function installStub(behaviour: WriteBehaviour, extraKeyLine: string): string[] {
    const tamper =
      behaviour === 'adds-a-second-key'
        ? [`  printf '%s\\n' ${JSON.stringify(extraKeyLine)} >> "$dest"`]
        : behaviour === 'drops-a-survivor'
          ? ['  sed -i "1d" -- "$dest"']
          : [];
    return [
      'install() {',
      '  local mode="" positional=()',
      '  while [ $# -gt 0 ]; do',
      '    case "$1" in',
      '      -m) mode="$2"; shift 2 ;;',
      // Dropped rather than honoured: chown is super-user-only, and the fixture
      // is already owned by the account the body is asked about.
      '      -o|-g) shift 2 ;;',
      '      -d) shift ;;',
      '      *) positional+=("$1"); shift ;;',
      '    esac',
      '  done',
      '  cp -- "${positional[0]}" "${positional[1]}"',
      '  local dest="${positional[1]}"',
      ...tamper,
      '  [ -n "$mode" ] && chmod "$mode" -- "$dest"',
      '  return 0',
      '}',
    ];
  }

  interface CoreRun {
    status: number;
    stdout: string;
    stderr: string;
    /** The authorized_keys file as the body left it. */
    after: string;
    /** One fingerprint per parseable key in that file, in order. */
    afterFingerprints: string[];
  }

  let caseCounter = 0;

  function runCore(opts: {
    mode: 'add' | 'remove';
    authorizedKeys: string;
    subject: string;
    write?: WriteBehaviour;
    /** Overrides the line written in, so a different spelling can be added. */
    keyLineOverride?: string;
  }): CoreRun {
    const remoteSource = readFileSync(REMOTE_HALF, 'utf-8');
    const helpersStart = remoteSource.indexOf('AUTHKEY_TMPS=()');
    const helpersEnd = remoteSource.indexOf('if ! id -u -- "$AUTHKEY_ACCOUNT"');
    const coreStart = remoteSource.indexOf('BEFORE_LIST="$(fingerprints_of "$AUTH_FILE")"');
    expect(helpersStart, 'the helper block was not found').toBeGreaterThan(-1);
    expect(helpersEnd).toBeGreaterThan(helpersStart);
    expect(coreStart).toBeGreaterThan(helpersEnd);

    caseCounter += 1;
    const caseDir = join(WORK_DIR, `core-${caseCounter}`);
    mkdirSync(caseDir);
    const authFile = join(caseDir, 'authorized_keys');
    writeFileSync(authFile, opts.authorizedKeys);
    chmodSync(authFile, 0o600);

    const line = opts.keyLineOverride ?? keyLine(opts.subject);
    const harness = join(caseDir, 'core.sh');
    writeFileSync(
      harness,
      [
        'set -euo pipefail',
        // The account is this login, so the ownership assertion at the end is a
        // real check against a real file rather than one the stub answered.
        'AUTHKEY_ACCOUNT="$(id -un)"',
        'PRIMARY_GROUP="$(id -gn)"',
        `AUTH_FILE=${JSON.stringify(authFile)}`,
        `AUTHKEY_MODE=${JSON.stringify(opts.mode)}`,
        `AUTHKEY_OPERATOR='Julie Symons'`,
        `AUTHKEY_KEY_LINE=${JSON.stringify(line)}`,
        `AUTHKEY_FINGERPRINT=${JSON.stringify(fingerprintOf(opts.subject))}`,
        ...installStub(opts.write ?? 'faithful', keyLine(SECOND_KEY)),
        remoteSource.slice(helpersStart, helpersEnd),
        remoteSource.slice(coreStart),
      ].join('\n') + '\n',
    );

    const res = spawnSync('bash', [harness], {
      encoding: 'utf-8',
      env: { ...process.env, ...NO_AWS_CREDENTIALS, TMPDIR: caseDir },
      ...SPAWN_GUARD,
    });

    const after = readFileSync(authFile, 'utf-8');
    const listing = spawnSync('ssh-keygen', ['-l', '-f', authFile], {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
    const afterFingerprints = (listing.stdout ?? '')
      .split('\n')
      .filter((l) => l.trim() !== '')
      .map((l) => l.trim().split(/\s+/)[1]);

    return {
      status: res.status ?? -1,
      stdout: res.stdout ?? '',
      stderr: res.stderr ?? '',
      after,
      afterFingerprints,
    };
  }

  // ── the two invariants the text assertions only claimed to make ───────────

  it('refuses a run in which a second key moved as well as the subject', () => {
    // The check an eyeball never makes. A write that added somebody else's key
    // alongside the intended one satisfies every other assertion in the body:
    // the subject is present, the mode and owner are right, and no pre-existing
    // key is missing. Only the count catches it.
    const r = runCore({
      mode: 'add',
      authorizedKeys: `${keyLine(THIRD_KEY)}\n`,
      subject: VALID_KEY,
      write: 'adds-a-second-key',
    });
    expect(r.status).toBe(1);
    // The refusals go to stderr; the OK lines are the ones on stdout.
    expect(r.stderr).toMatch(/FAIL expected 2 key\(s\) after this change, found 3/);
    expect(r.stdout).toMatch(/authorize_failed/);
    expect(r.stdout).not.toMatch(/exactly one changed/);
    expect(r.afterFingerprints).toHaveLength(3);
  });

  it('refuses a run in which a pre-existing key vanished', () => {
    // A count alone is satisfied by a swap: one key lost, one gained. This is
    // the failure that reports success and locks an unrelated operator out.
    const survivor = fingerprintOf(THIRD_KEY);
    const r = runCore({
      mode: 'add',
      authorizedKeys: `${keyLine(THIRD_KEY)}\n${keyLine(SECOND_KEY)}\n`,
      subject: VALID_KEY,
      write: 'drops-a-survivor',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`FAIL a pre-existing key is gone: ${survivor}`);
    expect(r.stdout).not.toMatch(/every other key that was here is still here/);
    expect(r.afterFingerprints).not.toContain(survivor);
  });

  // ── the ordinary paths, proved by what is in the file afterwards ──────────

  it('authorizes the key and leaves every other one where it was', () => {
    const before = [keyLine(THIRD_KEY), keyLine(SECOND_KEY)];
    const r = runCore({
      mode: 'add',
      authorizedKeys: `${before.join('\n')}\n`,
      subject: VALID_KEY,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/All checks passed/);
    expect(r.afterFingerprints).toEqual([
      fingerprintOf(THIRD_KEY),
      fingerprintOf(SECOND_KEY),
      fingerprintOf(VALID_KEY),
    ]);
    // Appended, not rebuilt: the earlier lines are unchanged byte for byte.
    expect(r.after.startsWith(`${before.join('\n')}\n`)).toBe(true);
  });

  it('does not fuse two keys into one line when the file has no trailing newline', () => {
    // Without the newline guard the new key is concatenated onto the last
    // existing line, producing one entry that parses as neither key: two
    // people's access lost by one append.
    const r = runCore({
      mode: 'add',
      authorizedKeys: keyLine(THIRD_KEY), // deliberately unterminated
      subject: VALID_KEY,
    });
    expect(r.status).toBe(0);
    expect(r.afterFingerprints).toEqual([fingerprintOf(THIRD_KEY), fingerprintOf(VALID_KEY)]);
  });

  it('adds nothing on a second run', () => {
    const r = runCore({
      mode: 'add',
      authorizedKeys: `${keyLine(THIRD_KEY)}\n${keyLine(VALID_KEY)}\n`,
      subject: VALID_KEY,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Already authorized/);
    expect(r.afterFingerprints).toEqual([fingerprintOf(THIRD_KEY), fingerprintOf(VALID_KEY)]);
  });

  it('recognises the same key under a different comment as already authorized', () => {
    // The comment is not part of the credential. Text comparison would install
    // a duplicate.
    const stored = withComment(keyLine(VALID_KEY), 'julie@her-laptop');
    const r = runCore({ mode: 'add', authorizedKeys: `${stored}\n`, subject: VALID_KEY });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Already authorized/);
    expect(r.afterFingerprints).toEqual([fingerprintOf(VALID_KEY)]);
  });

  it('recognises the same key behind an options prefix as already authorized', () => {
    const stored = withOptions(keyLine(VALID_KEY));
    const r = runCore({ mode: 'add', authorizedKeys: `${stored}\n`, subject: VALID_KEY });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Already authorized/);
    expect(r.after.trim()).toBe(stored);
  });

  it('withdraws the key when the stored line is spelled differently', () => {
    // A removal has to find the credential however it was written, or the key
    // stays behind while the run reports it withdrawn.
    const stored = withOptions(withComment(keyLine(VALID_KEY), 'pasted-by-hand'));
    const r = runCore({
      mode: 'remove',
      authorizedKeys: `${keyLine(THIRD_KEY)}\n${stored}\n`,
      subject: VALID_KEY,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/OK   key withdrawn/);
    expect(r.afterFingerprints).toEqual([fingerprintOf(THIRD_KEY)]);
  });

  it('keeps comments and blank lines through a withdrawal', () => {
    // They may be somebody's note about whose key follows, and losing them
    // makes the file harder to read every time afterwards.
    const r = runCore({
      mode: 'remove',
      authorizedKeys:
        `# Dave, workstation\n${keyLine(THIRD_KEY)}\n\n# Julie, bootstrap loan\n${keyLine(VALID_KEY)}\n`,
      subject: VALID_KEY,
    });
    expect(r.status).toBe(0);
    expect(r.after).toBe(`# Dave, workstation\n${keyLine(THIRD_KEY)}\n\n# Julie, bootstrap loan\n`);
    expect(r.afterFingerprints).toEqual([fingerprintOf(THIRD_KEY)]);
  });

  it('changes nothing when asked to withdraw a key that is not there', () => {
    const original = `${keyLine(THIRD_KEY)}\n`;
    const r = runCore({ mode: 'remove', authorizedKeys: original, subject: VALID_KEY });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/nothing to remove/);
    expect(r.after).toBe(original);
  });

  it('leaves the file at the mode sshd requires', () => {
    // sshd silently ignores a group- or world-writable authorized_keys, with
    // nothing in the client output to say so.
    const r = runCore({
      mode: 'add',
      authorizedKeys: `${keyLine(THIRD_KEY)}\n`,
      subject: VALID_KEY,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/is 600 and owned by/);
  });

  it('destroys its temp files and still reports a successful run as successful', () => {
    // Under set -e the exit status of an EXIT trap's last command replaces the
    // script's own. Temp files here are destroyed as soon as they are consumed,
    // so the final loop pass routinely tests one that is already gone; a
    // cleanup ending on that false test turns every successful run into a
    // failure, and the caller, reading a failed pipe, aborts before printing
    // what the operator does next — including the reminder to withdraw the
    // bootstrap key.
    const r = runCore({
      mode: 'add',
      authorizedKeys: `${keyLine(THIRD_KEY)}\n`,
      subject: VALID_KEY,
    });
    expect(r.status).toBe(0);
    const leftovers = readdirSync(join(WORK_DIR, `core-${caseCounter}`)).filter((name) =>
      name.startsWith('tmp.'),
    );
    expect(leftovers).toEqual([]);
  });
});
