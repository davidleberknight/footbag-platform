/**
 * scripts/provision-url-screening-key.sh — argument validation, the refusals
 * that run before any AWS call, and the documented handling of the key file.
 *
 * CI cannot exercise the AWS half: there is no account to write to and no
 * parameter to read. What is pinned instead is everything that happens before
 * the first AWS call, because that is where this script earns its place. A key
 * stored with a trailing newline authenticates nowhere and fails at the first
 * member submission rather than at the command that stored it; a key file left
 * behind at the default mode is readable by every account on the workstation;
 * and destroying the file when a write fails costs the operator the key, since
 * the vault is the only other copy.
 *
 * The refusals are asserted by exit status and message rather than by mocking
 * the AWS CLI: each fires before any call is made, so an environment with no
 * credentials reaches them exactly as a real run would.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  chmodSync,
  symlinkSync,
  mkdirSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';

const SCRIPT = join(process.cwd(), 'scripts/provision-url-screening-key.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runScript(args: string[]): RunResult {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env, ...NO_AWS_CREDENTIALS },
    ...SPAWN_GUARD,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/** A key file in the shape the script demands: regular, mode 600, no newline. */
function keyFile(contents: string, mode = 0o600): string {
  const dir = mkdtempSync(join(tmpdir(), 'footbag-test-sb-key-'));
  const path = join(dir, 'sb-key');
  writeFileSync(path, contents);
  chmodSync(path, mode);
  return path;
}

describe('provision-url-screening-key.sh — invocation', () => {
  it('refuses an unnamed action rather than guessing one', () => {
    const result = runScript([]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/name an action: status or store/);
  });

  it('refuses an environment that is not staging, production or both', () => {
    const result = runScript(['--env', 'prod', 'status']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--env must be 'staging', 'production' or 'both'/);
  });

  it('defaults to both environments, so one is never keyed and the other forgotten', () => {
    const help = runScript(['--help']);
    expect(help.stdout).toMatch(/Default: both/);
    expect(help.stdout).toMatch(/writing one and forgetting the other/);
  });

  it('refuses to prompt when there is no terminal, rather than reading the key off stdin', () => {
    // Run in a new session so the child has no controlling terminal at all. A
    // plain spawn inherits this one, and the script would correctly prompt on it
    // and block; the condition under test is the unattended run, where reading a
    // key from stdin would be worse than refusing, because a caller redirecting
    // a credential file in would have its first line consumed as the key.
    const result = spawnSync('setsid', ['bash', SCRIPT, '--env', 'staging', 'store'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      env: { ...process.env, ...NO_AWS_CREDENTIALS },
      stdio: ['ignore', 'pipe', 'pipe'],
      ...SPAWN_GUARD,
    });
    expect(result.status).toBe(2);
    expect(result.stderr ?? '').toMatch(/no terminal to prompt on, and no --key-file given/);
    // The fallback it names is the one that costs shell history, and it says so.
    expect(result.stderr ?? '').toMatch(/records the key in shell history/);
  });
});

describe('provision-url-screening-key.sh — what it accepts as a key file', () => {
  it('refuses a path that does not exist', () => {
    const result = runScript(['--env', 'staging', '--key-file', '/nonexistent/sb-key', 'store']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/is not a regular file/);
  });

  it('refuses a directory, whose shape checks would otherwise all pass', () => {
    // Readable and non-empty are both true of a directory, and the greps error
    // rather than match, so without this refusal a directory reached AWS.
    const dir = mkdtempSync(join(tmpdir(), 'footbag-test-sb-dir-'));
    mkdirSync(join(dir, 'inner'));
    const result = runScript(['--env', 'staging', '--key-file', join(dir, 'inner'), 'store']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/is not a regular file/);
  });

  it('refuses a symlink, which the shred would follow to another file', () => {
    const target = keyFile('AIzaSyExampleKeyValue');
    const link = `${target}-link`;
    symlinkSync(target, link);
    const result = runScript(['--env', 'staging', '--key-file', link, 'store']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/is a symlink/);
    // The target survives: refusing happens before anything destructive.
    expect(existsSync(target)).toBe(true);
  });

  it('refuses a key file the rest of the workstation can read', () => {
    const path = keyFile('AIzaSyExampleKeyValue', 0o644);
    const result = runScript(['--env', 'staging', '--key-file', path, 'store']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/has mode 644; expected 600 or 400/);
    // The remedy creates it restricted rather than fixing it afterwards.
    expect(result.stderr).toMatch(/umask 077/);
  });

  it('accepts mode 400 as well as 600', () => {
    // Read-only is stricter, not wrong. This case is the one that gets past
    // every local check, so it is the case that would reach the write. It runs
    // with credential resolution broken, and the assertion is that it failed at
    // the AWS call rather than at any local refusal: that is the boundary this
    // suite can safely test up to.
    const path = keyFile('AIzaSyExampleKeyValue', 0o400);
    const result = runScript(['--env', 'staging', '--key-file', path, 'store']);
    expect(result.stderr).not.toMatch(/expected 600 or 400/);
    expect(result.stderr).not.toMatch(/is not a regular file/);
    expect(result.stderr).not.toMatch(/contains a newline|contains whitespace|is empty/);
    // It got as far as the destination check and stopped there, unauthenticated.
    expect(result.stderr).toMatch(/is not readable/);
    // And the key file survives, because nothing was written anywhere.
    expect(existsSync(path)).toBe(true);
  });
});

describe('provision-url-screening-key.sh — key shape checks before any write', () => {
  it('refuses an empty key file', () => {
    const path = keyFile('');
    const result = runScript(['--env', 'staging', '--key-file', path, 'store']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/is empty/);
  });

  it('refuses a newline, which would be stored as part of the key', () => {
    const path = keyFile('AIzaSyExampleKeyValue\n');
    const result = runScript(['--env', 'staging', '--key-file', path, 'store']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/contains a newline/);
    // The remedy is named, because the obvious way to write a file adds one,
    // and it keeps the key out of shell history.
    expect(result.stderr).toMatch(/printf %s/);
    expect(result.stderr).toMatch(/not recording history/);
  });

  it('refuses embedded whitespace', () => {
    const path = keyFile('AIzaSy Example Key');
    const result = runScript(['--env', 'staging', '--key-file', path, 'store']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/contains whitespace/);
  });

  it("refuses Terraform's placeholder, which is not a key", () => {
    const path = keyFile('TODO-set-via-cli-after-apply');
    const result = runScript(['--env', 'staging', '--key-file', path, 'store']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/holds Terraform's placeholder/);
  });

  it('leaves the key file alone when a check refuses it', () => {
    // A refused file is still the operator's to correct, and destroying it
    // would make a typo cost them the key.
    const path = keyFile('AIzaSy Example Key');
    runScript(['--env', 'staging', '--key-file', path, 'store']);
    expect(existsSync(path)).toBe(true);
  });
});

describe('provision-url-screening-key.sh — documented contract', () => {
  const source = readFileSync(SCRIPT, 'utf-8');

  it('passes the key by file reference, never as an argument', () => {
    // An argument reaches the process list, where any account on the box can
    // read it, and the shell history file.
    expect(source).toMatch(/--value "file:\/\/\$\{KEY_FILE\}"/);
    expect(source).not.toMatch(/--value "\$\(cat/);
  });

  it('encrypts under each environment own KMS key even when the plaintext is shared', () => {
    expect(source).toMatch(/kms_for\(\) \{ echo "alias\/footbag-\$1"; \}/);
  });

  it('checks every destination before writing any of them', () => {
    // Otherwise --env both can write one environment, fail on the second, and
    // leave the operator with a partial state and a misleading remedy.
    const checkLoop = source.indexOf('Every destination is checked before any of them is written');
    const putAt = source.indexOf('aws ssm put-parameter');
    expect(checkLoop).toBeGreaterThan(-1);
    expect(putAt).toBeGreaterThan(checkLoop);
  });

  it('shreds the key file only after every destination has taken it', () => {
    // The vault is the only other copy, so shredding on a failed run costs the
    // operator a trip back to the console.
    const shredCall = source.indexOf('shred_key_file\n');
    const putAt = source.indexOf('aws ssm put-parameter');
    expect(shredCall).toBeGreaterThan(putAt);
    expect(source).not.toMatch(/trap .*shred/);
    expect(source).toMatch(/The key file is left in place so you can re-run/);
  });

  it('never prints the stored value, reporting only its length', () => {
    expect(source).toMatch(/value not shown/);
    expect(source).not.toMatch(/echo "\$value"/);
  });

  it('says plainly that storing a key does not arm screening', () => {
    // The two-step opt-in is the whole safety property: a key in Parameter
    // Store with the switch still dark stays in standby rather than in use.
    expect(source).toMatch(/Storing a key does not turn screening on/);
  });
});
