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
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from 'node:fs';
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
      `require_operator_stdin "x" && host_env_fetch host "${dest}" "" "${src}"`,
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
      `require_operator_stdin "x" && host_env_fetch host "${dest}" "" "${src}"`,
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
      `require_operator_stdin "x" && host_env_fetch host "${dest}" "" "${src}"`,
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
      `require_operator_stdin "x" && host_env_fetch host "${dest}" "${report}" "${src}"`,
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
      `require_operator_stdin "x" && host_env_fetch host "${dest}" "" "${join(workDir, 'no-such-file')}"`,
      `${PASSWORD}\n`,
    );
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/does not exist or is unreadable/);
  });
});

describe('the wire installs a rewritten file without staging it on the host', () => {
  it('installs the new content at mode 0600', () => {
    const dest = join(workDir, 'install-a');
    const staged = join(workDir, 'new-a');
    writeFileSync(dest, 'OLD=1\n', 'utf-8');
    writeFileSync(staged, 'NEW=2\nSECRET=shhh\n', 'utf-8');

    const r = runWithLib(
      `require_operator_stdin "x" && host_env_install host "${staged}" "${dest}"`,
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
      `require_operator_stdin "x" && host_env_install host "${staged}" "${dest}"`,
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

    const r = runWithLib(
      `require_operator_stdin "x" && host_env_install host "${staged}" "${dest}"`,
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
      `require_operator_stdin "x" && host_env_fetch host "${fetched}" "" "${host}"`,
      `${PASSWORD}\n`,
    );
    expect(fetch.exitCode).toBe(0);
    writeFileSync(rewritten, `${readFileSync(fetched, 'utf-8')}D=added\n`, 'utf-8');

    const install = runWithLib(
      `require_operator_stdin "x" && host_env_install host "${rewritten}" "${host}"`,
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
      `require_operator_stdin "x" && host_env_fetch host "${dest}" "" "${src}"`,
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

    const r = runWithLib(
      `require_operator_stdin "x" && host_env_install host "${staged}" "${dest}"`,
      `${PASSWORD}\n`,
      { FOOTBAG_KNOWN_HOSTS: join(workDir, 'no-such-pin') },
    );

    expect(r.exitCode).not.toBe(0);
    expect(capturedFirstLine).toBe('');
    expect(readFileSync(dest, 'utf-8')).toBe('KEEP=1\n');
  });
});

describe('the credential guard', () => {
  it('refuses an empty first line and names the invocation that supplies one', () => {
    const r = runWithLib(`require_operator_stdin "scripts/example.sh --target staging"`, '\n');
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toMatch(/expected the host sudo password/);
    expect(r.stderr).toMatch(/scripts\/example\.sh --target staging/);
  });

  it('takes only the first line, leaving the rest of the credential file unread', () => {
    // Operator credential files hold more than the sudo password. Consuming a
    // second line here would mean some other secret silently became part of a
    // remote command stream.
    const r = runWithLib(
      `require_operator_stdin "x" && printf 'GOT=[%s]\\n' "$SUDO_PASS"`,
      `${PASSWORD}\nAWS_SECRET=do-not-read-me\nMORE=nor-me\n`,
    );
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain(`GOT=[${PASSWORD}]`);
    expect(r.stdout).not.toContain('do-not-read-me');
  });
});
