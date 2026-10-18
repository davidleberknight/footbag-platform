/**
 * scripts/provision-url-screening-key.sh — argument validation, the refusals
 * that run before any AWS call, and the documented handling of the key file.
 *
 * Everything before the first AWS call is pinned by exit status and message,
 * because that is where this script earns its place. A key stored with a
 * trailing newline authenticates nowhere and fails at the first member
 * submission rather than at the command that stored it; a key file left behind
 * at the default mode is readable by every account on the workstation; and
 * destroying the file when a write fails costs the operator the key, since the
 * vault is the only other copy.
 *
 * The write path is driven end to end against a stand-in `aws` that records
 * every call and fails or interrupts where a case tells it to, because the
 * script's own reading of each call decides what it writes next, what it
 * shreds and what it reports. The prompt path runs through a pseudo-terminal.
 * No account is reached: credential resolution is broken and the stub is first
 * on PATH.
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
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/provision-url-screening-key.sh');

/**
 * The script settles and proves an AWS identity before it reads or writes the
 * parameter, so every spawn here supplies one. It grants no access: the refusals
 * under test are still the script's own.
 */
const IDENTITY_ENV = awsIdentityStubEnv(mkdtempSync(join(tmpdir(), 'footbag-test-sb-identity-')));

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runScript(args: string[]): RunResult {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env, ...NO_AWS_CREDENTIALS, ...IDENTITY_ENV },
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
    const result = runScript(['--target', 'prod', 'status']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--target must be 'staging', 'production' or 'both'/);
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
    const result = spawnSync('setsid', ['bash', SCRIPT, '--target', 'staging', 'store'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      env: { ...process.env, ...NO_AWS_CREDENTIALS, ...IDENTITY_ENV },
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
    const result = runScript(['--target', 'staging', '--key-file', '/nonexistent/sb-key', 'store']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/is not a regular file/);
  });

  it('refuses a directory, whose shape checks would otherwise all pass', () => {
    // Readable and non-empty are both true of a directory, and the greps error
    // rather than match, so without this refusal a directory reached AWS.
    const dir = mkdtempSync(join(tmpdir(), 'footbag-test-sb-dir-'));
    mkdirSync(join(dir, 'inner'));
    const result = runScript(['--target', 'staging', '--key-file', join(dir, 'inner'), 'store']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/is not a regular file/);
  });

  it('refuses a symlink, which the shred would follow to another file', () => {
    const target = keyFile('AIzaSyExampleKeyValue');
    const link = `${target}-link`;
    symlinkSync(target, link);
    const result = runScript(['--target', 'staging', '--key-file', link, 'store']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/is a symlink/);
    // The target survives: refusing happens before anything destructive.
    expect(existsSync(target)).toBe(true);
  });

  it('refuses a key file the rest of the workstation can read', () => {
    const path = keyFile('AIzaSyExampleKeyValue', 0o644);
    const result = runScript(['--target', 'staging', '--key-file', path, 'store']);
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
    const result = runScript(['--target', 'staging', '--key-file', path, 'store']);
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
    const result = runScript(['--target', 'staging', '--key-file', path, 'store']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/is empty/);
  });

  it('refuses a newline, which would be stored as part of the key', () => {
    const path = keyFile('AIzaSyExampleKeyValue\n');
    const result = runScript(['--target', 'staging', '--key-file', path, 'store']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/contains a newline/);
    // The remedy is named, because the obvious way to write a file adds one,
    // and it keeps the key out of shell history.
    expect(result.stderr).toMatch(/printf %s/);
    expect(result.stderr).toMatch(/not recording history/);
  });

  it('refuses embedded whitespace', () => {
    const path = keyFile('AIzaSy Example Key');
    const result = runScript(['--target', 'staging', '--key-file', path, 'store']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/contains whitespace/);
  });

  it("refuses Terraform's placeholder, which is not a key", () => {
    const path = keyFile('TODO-set-via-cli-after-apply');
    const result = runScript(['--target', 'staging', '--key-file', path, 'store']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/holds Terraform's placeholder/);
  });

  it('leaves the key file alone when a check refuses it', () => {
    // A refused file is still the operator's to correct, and destroying it
    // would make a typo cost them the key.
    const path = keyFile('AIzaSy Example Key');
    runScript(['--target', 'staging', '--key-file', path, 'store']);
    expect(existsSync(path)).toBe(true);
  });
});

/**
 * The write path, driven end to end against a stand-in `aws` that records every
 * call it receives and misbehaves where a case tells it to. The script's own
 * reading of each call's outcome decides what it writes next, what it shreds
 * and what it reports, so the verdict has to come from a real run. Nothing
 * real is reached: the stub is first on PATH, credential resolution is broken,
 * and `--profile` names a profile the stub never looks at.
 */
interface AwsStubBehaviour {
  /** Fail `get-parameter` on a parameter whose name contains this. */
  failGet?: string;
  /** Fail `put-parameter` on a parameter whose name contains this. */
  failPut?: string;
  /** Send the calling script a signal (INT unless named) on the first call of this kind to a parameter containing this. */
  interruptOn?: { call: 'get-parameter' | 'put-parameter'; param: string; signal?: 'INT' | 'TERM' };
  /** The decrypted value `get-parameter --with-decryption` returns. */
  value?: string;
}

function awsStub(behaviour: AwsStubBehaviour = {}): { log: string; env: NodeJS.ProcessEnv } {
  const dir = mkdtempSync(join(tmpdir(), 'footbag-test-sb-aws-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const log = join(dir, 'calls.txt');
  const { interruptOn } = behaviour;
  writeFileSync(join(bin, 'aws'), [
    '#!/usr/bin/env bash',
    `printf '%s\\n' "$*" >> ${JSON.stringify(log)}`,
    'name=""; decrypt=0; call="$2"',
    'while (( $# )); do',
    '  case "$1" in --name) name="$2"; shift ;; --with-decryption) decrypt=1 ;; esac',
    '  shift',
    'done',
    interruptOn
      ? `if [[ "$call" == ${JSON.stringify(interruptOn.call)} && "$name" == *${JSON.stringify(interruptOn.param)}* ]]; then kill -${interruptOn.signal ?? 'INT'} "$PPID"; exit 1; fi`
      : '',
    behaviour.failGet !== undefined
      ? `if [[ "$call" == get-parameter && "$name" == *${JSON.stringify(behaviour.failGet)}* ]]; then echo "ParameterNotFound" >&2; exit 254; fi`
      : '',
    behaviour.failPut !== undefined
      ? `if [[ "$call" == put-parameter && "$name" == *${JSON.stringify(behaviour.failPut)}* ]]; then echo "AccessDeniedException" >&2; exit 254; fi`
      : '',
    `if [[ "$call" == get-parameter && $decrypt == 1 ]]; then printf '%s\\n' ${JSON.stringify(behaviour.value ?? 'TODO-set-via-cli-after-apply')}; exit 0; fi`,
    'if [[ "$call" == get-parameter ]]; then printf "%s\\n" "armed"; exit 0; fi',
    'exit 0',
  ].join('\n'));
  chmodSync(join(bin, 'aws'), 0o755);
  return {
    log,
    env: { ...process.env, ...NO_AWS_CREDENTIALS, PATH: `${bin}:${process.env.PATH ?? ''}` },
  };
}

function calls(log: string): string[] {
  return existsSync(log) ? readFileSync(log, 'utf-8').trimEnd().split('\n') : [];
}

function runStore(args: string[], env: NodeJS.ProcessEnv): RunResult {
  const result = spawnSync('setsid', ['bash', SCRIPT, '--profile', 'fixture-profile', ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    ...SPAWN_GUARD,
  });
  return { exitCode: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** Files the prompt path creates, so a run can be checked for leaving one behind. */
function promptedKeyFiles(): string[] {
  return readdirSync('/tmp').filter((name) => name.startsWith('footbag-sb-key.'));
}

describe('provision-url-screening-key.sh — the write path against a stand-in', () => {
  const KEY = 'AIzaSyExampleKeyValue0123456789';

  it('stores the key by file reference under each environment own KMS key, checking every destination first, then shreds the file', () => {
    // Defect caught: the key reaching the process list as an argument; one
    // environment keyed under the other's KMS key; or a write landing before
    // the second destination was known to exist, leaving a partial state.
    const path = keyFile(KEY);
    const aws = awsStub();
    const result = runStore(['--target', 'both', '--key-file', path, 'store'], aws.env);
    expect(result.exitCode, result.stderr).toBe(0);

    const made = calls(aws.log);
    const puts = made.filter((c) => c.startsWith('ssm put-parameter'));
    const gets = made.filter((c) => c.startsWith('ssm get-parameter'));
    expect(puts).toHaveLength(2);
    expect(gets).toHaveLength(2);
    expect(Math.max(...gets.map((g) => made.indexOf(g)))).toBeLessThan(made.indexOf(puts[0]));
    expect(puts[0]).toContain('--name /footbag/staging/secrets/safe_browsing_api_key');
    expect(puts[0]).toContain('--key-id alias/footbag-staging');
    expect(puts[1]).toContain('--name /footbag/production/secrets/safe_browsing_api_key');
    expect(puts[1]).toContain('--key-id alias/footbag-production');
    for (const put of puts) {
      expect(put).toContain(`--value file://${path}`);
      expect(put).not.toContain(KEY);
    }
    expect(existsSync(path)).toBe(false);
    expect(result.stdout).toMatch(/Shredded/);
    // The two-step opt-in is the whole safety property: a key in Parameter
    // Store with the switch still dark stays in standby rather than in use.
    expect(result.stdout).toMatch(/Storing a key does not turn screening on/);
  });

  it('keeps the key file when asked to', () => {
    const path = keyFile(KEY);
    const result = runStore(['--target', 'staging', '--key-file', path, '--keep-key-file', 'store'], awsStub().env);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(existsSync(path)).toBe(true);
    expect(result.stdout).not.toMatch(/Shredded/);
  });

  it('writes nothing when any destination is unreadable', () => {
    // Defect caught: --target both keying staging, then discovering production
    // was never applied, leaving the operator a partial state and a remedy
    // that names the wrong environment.
    const path = keyFile(KEY);
    const aws = awsStub({ failGet: 'production' });
    const result = runStore(['--target', 'both', '--key-file', path, 'store'], aws.env);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/\/footbag\/production\/secrets\/safe_browsing_api_key is not readable/);
    expect(result.stderr).toMatch(/Nothing was written/);
    expect(calls(aws.log).filter((c) => c.startsWith('ssm put-parameter'))).toHaveLength(0);
    expect(existsSync(path)).toBe(true);
  });

  it('leaves the key file in place when a later write fails, naming what was already written', () => {
    // Defect caught: a failed second write shredding the operator's only local
    // copy, so the retry needs a trip back to the vendor console.
    const path = keyFile(KEY);
    const aws = awsStub({ failPut: 'production' });
    const result = runStore(['--target', 'both', '--key-file', path, 'store'], aws.env);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/writing \/footbag\/production\/secrets\/safe_browsing_api_key failed/);
    expect(result.stderr).toMatch(/Already written: \/footbag\/staging\/secrets\/safe_browsing_api_key/);
    expect(result.stderr).toMatch(/The key file is left in place so you can re-run/);
    // Staging's write and production's refused attempt; nothing after the refusal.
    expect(calls(aws.log).filter((c) => c.startsWith('ssm put-parameter'))).toHaveLength(2);
    expect(existsSync(path)).toBe(true);
  });

  it('reports a stored key by length only', () => {
    // Defect caught: status printing the live vendor key into a terminal or a
    // captured log.
    const aws = awsStub({ value: KEY });
    const result = runStore(['--target', 'staging', 'status'], aws.env);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toMatch(new RegExp(`set \\(${KEY.length} characters\\); value not shown`));
    expect(result.stdout).not.toContain(KEY);
    expect(result.stderr).not.toContain(KEY);
  });
});

/**
 * The prompt path needs a terminal by design, so these drive it through a
 * pseudo-terminal, typing the key where an operator would. An interrupt arrives
 * from the stand-in `aws` at the point under test, as ctrl-c would.
 */
describe('provision-url-screening-key.sh — an interrupt leaves nothing behind that a clean run would not', () => {
  const KEY = 'AIzaSyExampleKeyValue0123456789';

  function runPrompted(aws: ReturnType<typeof awsStub>, extra: string[] = []) {
    const inner = ['bash', SCRIPT, '--profile', 'fixture-profile', '--target', 'both', ...extra, 'store'].join(' ');
    return spawnSync('script', ['-qec', inner, '/dev/null'], {
      cwd: process.cwd(),
      env: { ...process.env, ...aws.env },
      input: `${KEY}\n`,
      encoding: 'utf-8',
      ...SPAWN_GUARD,
    });
  }

  it('shreds a file it created from the prompt when interrupted before the key reached any environment', () => {
    // Defect caught: an interrupt between the prompt and the first write leaving
    // a live vendor key in a shared temp directory with nothing to collect it.
    const before = promptedKeyFiles();
    const aws = awsStub({ interruptOn: { call: 'get-parameter', param: 'production' } });
    const result = runPrompted(aws);
    expect(result.status).toBe(130);
    expect(result.stdout).toMatch(/Interrupted before the key reached any environment/);
    expect(calls(aws.log).filter((c) => c.startsWith('ssm put-parameter'))).toHaveLength(0);
    expect(promptedKeyFiles().filter((f) => !before.includes(f))).toEqual([]);
  });

  it('treats a termination signal the same way as an interrupt', () => {
    // Defect caught: a closed terminal or a `kill` leaving the prompted live key
    // in the shared temp directory, where ctrl-c would have shredded it.
    const before = promptedKeyFiles();
    const aws = awsStub({ interruptOn: { call: 'get-parameter', param: 'production', signal: 'TERM' } });
    const result = runPrompted(aws);
    expect(result.status).toBe(130);
    expect(result.stdout).toMatch(/Interrupted before the key reached any environment/);
    expect(promptedKeyFiles().filter((f) => !before.includes(f))).toEqual([]);
  });

  it('always shreds a file it created from the prompt once every destination took it, even when asked to keep it', () => {
    // Defect caught: --keep-key-file leaving a live vendor key in the shared temp
    // directory that the operator never asked to exist and does not know about.
    const before = promptedKeyFiles();
    const aws = awsStub();
    const result = runPrompted(aws, ['--keep-key-file']);
    expect(result.status, result.stdout).toBe(0);
    expect(calls(aws.log).filter((c) => c.startsWith('ssm put-parameter'))).toHaveLength(2);
    expect(promptedKeyFiles().filter((f) => !before.includes(f))).toEqual([]);
  });

  it('stops shredding once the key has reached an environment', () => {
    // Defect caught: destroying the only local copy over an unreachable second
    // environment, turning a retry into a trip back to the vendor console.
    const aws = awsStub({ interruptOn: { call: 'put-parameter', param: 'production' } });
    const result = runPrompted(aws);
    expect(result.status).toBe(130);
    expect(result.stdout).toMatch(/Interrupted after the key reached at least one environment/);
    expect(result.stdout).toMatch(/in place so you can re-run; delete it yourself/);
    const put = calls(aws.log).find((c) => c.startsWith('ssm put-parameter')) ?? '';
    const path = put.slice(put.indexOf('file://') + 'file://'.length).split(' ')[0];
    expect(existsSync(path)).toBe(true);
    rmSync(path, { force: true });
  });

  it('never shreds a file the operator supplied', () => {
    // Defect caught: the script deleting somebody else's data because they
    // pressed ctrl-c.
    const path = keyFile(KEY);
    const aws = awsStub({ interruptOn: { call: 'get-parameter', param: 'staging' } });
    const result = runStore(['--target', 'both', '--key-file', path, 'store'], aws.env);
    expect(result.exitCode).toBe(130);
    expect(result.stderr).not.toMatch(/was shredded/);
    expect(existsSync(path)).toBe(true);
  });
});
