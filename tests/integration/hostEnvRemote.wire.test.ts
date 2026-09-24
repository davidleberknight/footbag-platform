/**
 * scripts/lib/host-env-remote.sh and its two root-side bodies — the wire itself,
 * executed rather than described.
 *
 * Every other script suite exercises the synthetic --env-file and --dry-run
 * modes, which is to say the paths that never open a connection. Those prove
 * the rewrite logic and leave the transport untested, and the transport is
 * where a host env file full of secrets actually travels.
 *
 * This suite runs the real stream against a stand-in `ssh` on PATH that does
 * what the remote end does: consume the first stdin line the way `sudo -S`
 * does, then execute the rest with bash. What is being verified is everything
 * between the caller and the root-side body — that the password really is line
 * one and really is consumed, that the assignments bind before the body runs,
 * that the payload survives the base64 round trip byte for byte, that the
 * sentinel parsing picks the right block, and that a refusal in the body
 * reaches the caller as a non-zero exit rather than a silent empty file.
 *
 * What it cannot cover: the network, and a body genuinely running as uid 0.
 * The `install` stand-in exists for exactly that reason and does nothing but
 * drop the ownership flags a non-root process cannot honour.
 *
 * Every connection-opening function refuses to run without a pinned host-key
 * file, so the suite supplies its own inside the throwaway work directory. It
 * must never read the operator's pin: a suite that does passes on the one
 * machine that has it installed and fails everywhere else.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  chmodSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const LIB = join(process.cwd(), 'scripts/lib/host-env-remote.sh');

const PASSWORD = 'correct horse battery staple';

let workDir: string;
let binDir: string;
let pinFile: string;
let capturedFirstLine: string;

/**
 * A stand-in for the operator's pinned host-key file. The stand-in `ssh`
 * ignores the verification options entirely, so the content only has to look
 * like a known-hosts line; what the suite needs from it is that the pin
 * resolves and carries a mode the pin check accepts.
 */
const PIN_LINE = '[203.0.113.10]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITESTKEYFORWIRESUITE\n';

/**
 * Stands in for `ssh <opts> <alias> 'sudo -k -S -p "" bash'`. It records and
 * discards the first stdin line, which is what sudo does with the password,
 * then runs the remainder as a shell script. Recording it is the point: the
 * test can then assert the password was line one exactly and that nothing else
 * was consumed with it.
 */
const FAKE_SSH = `#!/usr/bin/env bash
set -euo pipefail
# \`ssh -G\` is a configuration query rather than a connection, and it is where the
# credential rule reads the account an alias connects as. Answering it here is what
# keeps this suite's verdict off whichever ~/.ssh/config the developer happens to
# have: FAKE_SSH_USER is the account under test, and the shared one is the default
# because that is what every case here that is not about the rule assumes.
# An explicitly empty FAKE_SSH_USER prints no user line at all, which is what a
# config ssh cannot parse looks like from the caller's side.
if [[ "\${1:-}" == "-G" ]]; then
  if [[ -n "\${FAKE_SSH_USER-footbag}" ]]; then
    printf 'user %s\\n' "\${FAKE_SSH_USER-footbag}"
  fi
  printf 'hostname 203.0.113.10\\n'
  exit 0
fi
IFS= read -r first_line || true
printf '%s' "$first_line" > "$FAKE_SSH_FIRST_LINE"
exec bash
`;

/**
 * Stands in for root. The root-side write body promotes its temp file with
 * `install -o root -g root`, which a test process cannot do; this drops those
 * two flags and forwards everything else to the real install, so the mode, the
 * atomic swap and the destination path are all still exercised.
 */
const FAKE_INSTALL = `#!/usr/bin/env bash
set -euo pipefail
args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|-g) shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
exec /usr/bin/install "\${args[@]}"
`;

/**
 * The same stand-in reason, for the same reason. The root-side write body now
 * promotes with an atomic rename rather than `install`, because `install`
 * unlinks the destination before writing the new content and so carries the
 * partial-write window the body exists to close. Setting the owner explicitly
 * before that rename is something a test process cannot do, so this accepts the
 * call and succeeds without changing anything; the mode, the rename and the
 * destination path are all still exercised for real.
 */
const FAKE_CHOWN = `#!/usr/bin/env bash
exit 0
`;

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs one shell snippet with the library sourced and the stand-ins on PATH.
 * The capture file is cleared first, so an empty `capturedFirstLine` means this
 * run never reached the stand-in rather than that some earlier run did.
 */
function runWithLib(
  snippet: string,
  stdin: string,
  envOverrides: Record<string, string> = {},
): RunResult {
  const firstLine = join(workDir, 'first-line');
  rmSync(firstLine, { force: true });
  const r = spawnSync('bash', ['-c', `source "${LIB}"\n${snippet}`], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: stdin,
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      FAKE_SSH_FIRST_LINE: firstLine,
      FOOTBAG_KNOWN_HOSTS: pinFile,
      ...envOverrides,
    },
    ...SPAWN_GUARD,
  });
  capturedFirstLine = existsSync(firstLine) ? readFileSync(firstLine, 'utf-8') : '';
  return { exitCode: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

beforeAll(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-hostwire-'));
  binDir = join(workDir, 'bin');
  spawnSync('mkdir', ['-p', binDir], SPAWN_GUARD);

  writeFileSync(join(binDir, 'ssh'), FAKE_SSH, 'utf-8');
  chmodSync(join(binDir, 'ssh'), 0o755);
  writeFileSync(join(binDir, 'install'), FAKE_INSTALL, 'utf-8');
  chmodSync(join(binDir, 'install'), 0o755);
  writeFileSync(join(binDir, 'chown'), FAKE_CHOWN, 'utf-8');
  chmodSync(join(binDir, 'chown'), 0o755);

  pinFile = join(workDir, 'known_hosts');
  writeFileSync(pinFile, PIN_LINE, 'utf-8');
  chmodSync(pinFile, 0o600);
});

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

describe('the wire carries the password as stdin line one, and nothing else', () => {
  it('consumes exactly the password line and leaves the body to bash', () => {
    const src = join(workDir, 'env-a');
    const dest = join(workDir, 'out-a');
    writeFileSync(src, 'TRUST_PROXY=2\nSTRIPE_WEBHOOK_SECRET=whsec_abc\n', 'utf-8');

    const r = runWithLib(
      `require_operator_stdin "x" host staging && host_env_fetch host "${dest}" "" "${src}"`,
      `${PASSWORD}\n`,
    );
    expect(r.exitCode).toBe(0);
    // The stand-in recorded what the remote sudo would have eaten. Anything
    // other than the password here means a line of the operator's credential
    // file went somewhere it should not have.
    expect(capturedFirstLine).toBe(PASSWORD);
  });

  it('round-trips the file byte for byte, including quotes, spaces and unicode', () => {
    const src = join(workDir, 'env-b');
    const dest = join(workDir, 'out-b');
    // A secret set is arbitrary bytes. Anything that mangles them installs a
    // host configuration that differs from the one the operator was shown.
    const content =
      'A=plain\n' +
      'B="double quoted"\n' +
      "C='single quoted'\n" +
      'D=has spaces and $DOLLAR and `backtick`\n' +
      'E=émoji-🦶-and-ünïcode\n' +
      'F=trailing-backslash\\\n' +
      'G=\n';
    writeFileSync(src, content, 'utf-8');

    const r = runWithLib(
      `require_operator_stdin "x" host staging && host_env_fetch host "${dest}" "" "${src}"`,
      `${PASSWORD}\n`,
    );
    expect(r.exitCode).toBe(0);
    expect(readFileSync(dest, 'utf-8')).toBe(content);
  });

  it('keeps the fetched copy readable only by its owner', () => {
    const src = join(workDir, 'env-c');
    const dest = join(workDir, 'out-c');
    writeFileSync(src, 'SECRET=1\n', 'utf-8');

    const r = runWithLib(
      `require_operator_stdin "x" host staging && host_env_fetch host "${dest}" "" "${src}"`,
      `${PASSWORD}\n`,
    );
    expect(r.exitCode).toBe(0);
    const mode = spawnSync('stat', ['-c', '%a', dest], { encoding: 'utf-8', ...SPAWN_GUARD });
    expect(mode.stdout.trim()).toBe('600');
  });

  it('separates the host report from the env payload', () => {
    const src = join(workDir, 'env-d');
    const dest = join(workDir, 'out-d');
    const report = join(workDir, 'report-d');
    writeFileSync(src, 'TRUST_PROXY=2\n', 'utf-8');

    const r = runWithLib(
      `require_operator_stdin "x" host staging && host_env_fetch host "${dest}" "${report}" "${src}"`,
      `${PASSWORD}\n`,
    );
    expect(r.exitCode).toBe(0);
    expect(readFileSync(dest, 'utf-8')).toBe('TRUST_PROXY=2\n');
    // The report block is separately delimited, so a diagnostic or a container
    // listing can never be parsed as an env assignment.
    expect(readFileSync(report, 'utf-8')).toContain('---');
    expect(readFileSync(report, 'utf-8')).not.toContain('TRUST_PROXY');
  });

  it('fails loudly when the file is absent rather than returning an empty one', () => {
    const dest = join(workDir, 'out-e');
    const r = runWithLib(
      `require_operator_stdin "x" host staging && host_env_fetch host "${dest}" "" "${join(workDir, 'no-such-file')}"`,
      `${PASSWORD}\n`,
    );
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/does not exist or is unreadable/);
  });
});

/**
 * What the destination holds right now, which is what the install compares
 * against before it overwrites. On a real run this is what host_env_fetch left
 * in HOST_ENV_FETCHED_SHA256; here the suite wrote the file itself, so it can
 * take the digest directly and the two are the same fact.
 */
function digestOf(path: string): string {
  const r = spawnSync('sha256sum', [path], { encoding: 'utf-8', ...SPAWN_GUARD });
  if (r.status !== 0) throw new Error(`sha256sum failed: ${r.stderr}`);
  return (r.stdout ?? '').trim().split(/\s+/)[0];
}

describe('the wire installs a rewritten file without staging it on the host', () => {
  it('installs the new content at mode 0600', () => {
    const dest = join(workDir, 'install-a');
    const staged = join(workDir, 'new-a');
    writeFileSync(dest, 'OLD=1\n', 'utf-8');
    writeFileSync(staged, 'NEW=2\nSECRET=shhh\n', 'utf-8');

    const r = runWithLib(
      `require_operator_stdin "x" host staging && host_env_install host "${staged}" "${dest}" "${digestOf(dest)}"`,
      `${PASSWORD}\n`,
    );
    expect(r.exitCode).toBe(0);
    expect(readFileSync(dest, 'utf-8')).toBe('NEW=2\nSECRET=shhh\n');
    const mode = spawnSync('stat', ['-c', '%a', dest], { encoding: 'utf-8', ...SPAWN_GUARD });
    expect(mode.stdout.trim()).toBe('600');
  });

  it('leaves no backup beside the installed file', () => {
    const dest = join(workDir, 'install-b');
    const staged = join(workDir, 'new-b');
    writeFileSync(dest, 'OLD=1\n', 'utf-8');
    writeFileSync(staged, 'NEW=2\n', 'utf-8');

    const r = runWithLib(
      `require_operator_stdin "x" host staging && host_env_install host "${staged}" "${dest}" "${digestOf(dest)}"`,
      `${PASSWORD}\n`,
    );
    expect(r.exitCode).toBe(0);
    // A backup is a second, staler copy of the whole secret set at rest for as
    // long as nobody remembers to delete it.
    expect(existsSync(`${dest}.bak`)).toBe(false);
  });

  it('refuses to install an empty file over a live configuration', () => {
    const dest = join(workDir, 'install-c');
    const staged = join(workDir, 'new-c');
    writeFileSync(dest, 'KEEP=1\n', 'utf-8');
    writeFileSync(staged, '', 'utf-8');

    // The digest is correct here on purpose. Without it this case would refuse
    // for want of a digest and pass while proving nothing about empty content,
    // which is the shape of a test that survives a change to something else.
    const r = runWithLib(
      `require_operator_stdin "x" host staging && host_env_install host "${staged}" "${dest}" "${digestOf(dest)}"`,
      `${PASSWORD}\n`,
    );
    expect(r.exitCode).not.toBe(0);
    // Installing it would take the host's whole configuration away, and the
    // next restart would fail on a missing secret rather than on this step.
    expect(readFileSync(dest, 'utf-8')).toBe('KEEP=1\n');
  });

  it('survives a full fetch-rewrite-install cycle unchanged apart from the edit', () => {
    const host = join(workDir, 'cycle-env');
    const fetched = join(workDir, 'cycle-fetched');
    const rewritten = join(workDir, 'cycle-rewritten');
    const original = 'A=1\nB="two words"\nC=🦶\n';
    writeFileSync(host, original, 'utf-8');

    const fetch = runWithLib(
      `require_operator_stdin "x" host staging && host_env_fetch host "${fetched}" "" "${host}"`,
      `${PASSWORD}\n`,
    );
    expect(fetch.exitCode).toBe(0);
    writeFileSync(rewritten, `${readFileSync(fetched, 'utf-8')}D=added\n`, 'utf-8');

    // Taken after the fetch and before the edit, which is where a caller takes
    // it: the two runs are separate shells, so the library's own variable does
    // not survive between them and the digest has to be carried across.
    const install = runWithLib(
      `require_operator_stdin "x" host staging && host_env_install host "${rewritten}" "${host}" "${digestOf(host)}"`,
      `${PASSWORD}\n`,
    );
    expect(install.exitCode).toBe(0);
    expect(readFileSync(host, 'utf-8')).toBe(`${original}D=added\n`);
  });
});

describe('the host-key pin gates the connection', () => {
  it('stops a fetch before the pipe opens when no pin is installed', () => {
    const src = join(workDir, 'env-pin');
    const dest = join(workDir, 'out-pin');
    writeFileSync(src, 'SECRET=1\n', 'utf-8');

    const r = runWithLib(
      `require_operator_stdin "x" host staging && host_env_fetch host "${dest}" "" "${src}"`,
      `${PASSWORD}\n`,
      { FOOTBAG_KNOWN_HOSTS: join(workDir, 'no-such-pin') },
    );

    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain(join(workDir, 'no-such-pin'));
    // The whole point of the pin is that the sudo password never reaches a
    // host nobody vetted, so the refusal has to land before anything is
    // written to the stream, not after.
    expect(capturedFirstLine).toBe('');
    expect(existsSync(dest)).toBe(false);
  });

  it('stops an install before the pipe opens when no pin is installed', () => {
    const dest = join(workDir, 'install-pin');
    const staged = join(workDir, 'new-pin');
    writeFileSync(dest, 'KEEP=1\n', 'utf-8');
    writeFileSync(staged, 'NEW=2\n', 'utf-8');

    // A correct digest, so the refusal under test is the missing pin and not an
    // argument this case is not about. Without one it would still exit non-zero
    // and still look green while proving nothing about the pin.
    const r = runWithLib(
      `require_operator_stdin "x" host staging && host_env_install host "${staged}" "${dest}" "${digestOf(dest)}"`,
      `${PASSWORD}\n`,
      { FOOTBAG_KNOWN_HOSTS: join(workDir, 'no-such-pin') },
    );

    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain(join(workDir, 'no-such-pin'));
    expect(capturedFirstLine).toBe('');
    expect(readFileSync(dest, 'utf-8')).toBe('KEEP=1\n');
  });
});

describe('the credential guard', () => {
  it('refuses an empty first line and names the invocation that supplies one', () => {
    const r = runWithLib(
      `require_operator_stdin "scripts/example.sh --target staging" host staging`,
      '\n',
    );
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/expected the host sudo password/);
    expect(r.stderr).toMatch(/scripts\/example\.sh --target staging/);
  });

  it('takes only the first line, leaving the rest of the credential file unread', () => {
    // Operator credential files hold more than the sudo password. Consuming a
    // second line here would mean some other secret silently became part of a
    // remote command stream.
    const r = runWithLib(
      `require_operator_stdin "x" host staging && printf 'GOT=[%s]\\n' "$SUDO_PASS"`,
      `${PASSWORD}\nAWS_SECRET=do-not-read-me\nMORE=nor-me\n`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(`GOT=[${PASSWORD}]`);
    expect(r.stdout).not.toContain('do-not-read-me');
  });
});

/**
 * Which of the four credential files a run reads.
 *
 * The rule is mechanical and the operator chooses nothing: the account the ssh
 * alias connects as picks the pair, the environment picks the file within it,
 * and each file holds one credential permanently. The failure it exists to
 * prevent is quiet — a named operator's run reading the shared account's
 * password succeeds at the connection and fails at sudo, which reads as a broken
 * account or a mistyped password and is neither.
 *
 * Every case here supplies its own account through the stand-in ssh and its own
 * home directory, because both are otherwise properties of the machine the suite
 * happens to run on, and the branch that matters would be unreachable on the one
 * that has them.
 */
describe('the credential file follows the account the alias connects as', () => {
  function select(user: string, target: string, home = workDir) {
    return runWithLib(
      `operator_credential_select host ${target} && printf '%s|%s\\n' ` +
        `"$OPERATOR_CREDENTIAL_NAME" "$OPERATOR_CREDENTIAL_ACCOUNT"`,
      '',
      { FAKE_SSH_USER: user, HOME: home },
    );
  }

  it('reads the shared account pair when the alias connects as the shared account', () => {
    expect(select('footbag', 'staging').stdout.trim()).toBe('AWS_OPERATOR.txt|footbag');
    expect(select('footbag', 'production').stdout.trim()).toBe(
      'AWS_OPERATOR_PRODUCTION.txt|footbag',
    );
  });

  it('reads the personal pair when the alias connects as a named account', () => {
    expect(select('ada_lovelace', 'staging').stdout.trim()).toBe(
      'HOST_OPERATOR.txt|ada_lovelace',
    );
    expect(select('ada_lovelace', 'production').stdout.trim()).toBe(
      'HOST_OPERATOR_PRODUCTION.txt|ada_lovelace',
    );
  });

  it('refuses a target that is neither environment rather than picking one', () => {
    // Otherwise a caller passing something unexpected gets the staging file by
    // falling off the end of the condition, and a production run reads a
    // staging credential.
    const r = select('footbag', 'prod');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/needs 'staging' or 'production'/);
  });

  it('refuses when the alias names no account rather than assuming the shared one', () => {
    const r = runWithLib(`operator_credential_select host staging`, '', {
      FAKE_SSH_USER: '',
      HOME: workDir,
    });
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/could not read which account/);
  });
});

/**
 * The same rule asked from the other direction. Most runs ask which file holds
 * the password for whoever the alias connects as. The provisioner asks which
 * file should hold the password an account has just been given, and at that
 * moment the alias still connects as somebody else, because the account being
 * created is the one that does not exist yet. Two doors, one rule, and the last
 * case here is the one that holds them together.
 */
describe('the naming rule also answers about an account the caller already knows', () => {
  function fileFor(account: string, target: string) {
    return runWithLib(
      `operator_credential_file_for "${account}" ${target} && printf '%s|%s\\n' ` +
        `"$OPERATOR_CREDENTIAL_NAME" "$OPERATOR_CREDENTIAL_ACCOUNT"`,
      '',
      { HOME: workDir },
    );
  }

  it('names the shared pair for the shared account', () => {
    expect(fileFor('footbag', 'staging').stdout.trim()).toBe('AWS_OPERATOR.txt|footbag');
    expect(fileFor('footbag', 'production').stdout.trim()).toBe(
      'AWS_OPERATOR_PRODUCTION.txt|footbag',
    );
  });

  it('names the personal pair for anybody else', () => {
    expect(fileFor('ada_lovelace', 'staging').stdout.trim()).toBe(
      'HOST_OPERATOR.txt|ada_lovelace',
    );
    expect(fileFor('ada_lovelace', 'production').stdout.trim()).toBe(
      'HOST_OPERATOR_PRODUCTION.txt|ada_lovelace',
    );
  });

  it('refuses a target that is neither environment', () => {
    const r = fileFor('ada_lovelace', 'prod');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/needs 'staging' or 'production'/);
  });

  it('refuses an empty account rather than choosing a pair for nobody', () => {
    const r = fileFor('', 'staging');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/needs an account name/);
  });

  it('agrees with the alias-driven selection for the same account', () => {
    // If these two ever disagree, a password is filed under one name and looked
    // for under another, and the failure arrives as a sudo error on the host.
    const viaAlias = runWithLib(
      `operator_credential_select host staging && printf '%s\\n' "$OPERATOR_CREDENTIAL_FILE"`,
      '',
      { FAKE_SSH_USER: 'ada_lovelace', HOME: workDir },
    );
    const viaAccount = runWithLib(
      `operator_credential_file_for ada_lovelace staging && printf '%s\\n' "$OPERATOR_CREDENTIAL_FILE"`,
      '',
      { HOME: workDir },
    );
    expect(viaAccount.stdout.trim()).toBe(viaAlias.stdout.trim());
    expect(viaAlias.stdout.trim()).not.toBe('');
  });
});

describe('the credential file is refused by name, never swapped for the other pair', () => {
  let home: string;

  function writeCredential(name: string, mode: number): string {
    const dir = join(home, 'AWS');
    mkdirSync(dir, { recursive: true });
    // The directory's own mode is a precondition of reading anything inside it,
    // so a fixture left at whatever the umask gives is refused before the file
    // rule under test is reached. A real workstation's is 700.
    chmodSync(dir, 0o700);
    const path = join(dir, name);
    writeFileSync(path, `${PASSWORD}\n`, 'utf-8');
    chmodSync(path, mode);
    return path;
  }

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'footbag-test-hostcred-'));
  });

  afterEach(() => rmSync(home, { recursive: true, force: true }));

  function require_(user: string, target: string) {
    return runWithLib(`require_operator_credential host ${target}`, '', {
      FAKE_SSH_USER: user,
      HOME: home,
    });
  }

  it('accepts the selected file at mode 600 and says which one it read', () => {
    writeCredential('HOST_OPERATOR.txt', 0o600);
    const r = require_('ada_lovelace', 'staging');
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('~/AWS/HOST_OPERATOR.txt');
    expect(r.stderr).toContain('ada_lovelace');
  });

  it('accepts mode 400, which is the same credential with one fewer way to change it', () => {
    writeCredential('AWS_OPERATOR.txt', 0o400);
    expect(require_('footbag', 'staging').exitCode).toBe(0);
  });

  it('refuses a mode anything else can read, and says to rotate rather than chmod', () => {
    // Narrowing the mode afterwards undoes nothing: whatever could read the file
    // has read it. A message that says to fix the permissions leaves a live
    // credential in place and reads like the problem was solved.
    writeCredential('AWS_OPERATOR.txt', 0o644);
    const r = require_('footbag', 'staging');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/must be 600 or 400/);
    expect(r.stderr).toMatch(/Rotate the password/);
  });

  it('refuses by name when the selected file is absent, with the other pair sitting right there', () => {
    // The whole point. A fallback would run as one identity under another's
    // credential, the sudo failure would land on the host rather than here, and
    // nothing afterwards would record which identity the run meant.
    writeCredential('AWS_OPERATOR.txt', 0o600);
    const r = require_('ada_lovelace', 'staging');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('~/AWS/HOST_OPERATOR.txt');
    expect(r.stderr).toMatch(/Nothing else is read in its place/);
    expect(r.stderr).not.toContain('AWS_OPERATOR.txt (');
  });

  it('refuses the shared file when the alias connects as the shared account and it is absent', () => {
    writeCredential('HOST_OPERATOR.txt', 0o600);
    const r = require_('footbag', 'staging');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain('~/AWS/AWS_OPERATOR.txt');
  });
});

describe('the stdin guard names the file it expects and does not claim to have checked it', () => {
  it('prints the selected file on a successful read', () => {
    // The library never opens the credential file: the password arrives on
    // stdin. Printing what the rule chose is the only thing that makes a run
    // unambiguous about which identity it meant.
    const r = runWithLib(`require_operator_stdin "x" host staging`, `${PASSWORD}\n`, {
      FAKE_SSH_USER: 'ada_lovelace',
    });
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('~/AWS/HOST_OPERATOR.txt');
    expect(r.stderr).toMatch(/not checked against it/);
  });

  it('refuses a call that passes no alias, because there is then nothing to select from', () => {
    // A caller that forgets the alias would otherwise fall back to a guess, and
    // the guess would be right for the shared account and silently wrong for
    // everybody else.
    const r = runWithLib(`require_operator_stdin "x"`, `${PASSWORD}\n`);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/needs the ssh alias and the target/);
    expect(r.stderr).toMatch(/defect in the calling script/);
  });
});
