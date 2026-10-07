/**
 * scripts/provision-ssm-secret.sh — the guards that stand between an operator
 * and an accidental production rotation.
 *
 * This script exists because a Terraform-generated secret is written into state
 * in plaintext, so the values it provisions are deliberately outside Terraform's
 * ownership. That moves a rotation from `terraform apply -replace` to a bare
 * command, and a bare command that signs every member out of the live site
 * needs its refusals to be real rather than documented. These tests pin the
 * refusals that need no AWS: the argument guards, the allowlist that stops a
 * typo creating a parameter nothing declared, and the terminal requirement on a
 * rotation. The store path runs against a stand-in aws on PATH answering from a
 * file, which is how a rotation is proved here: confirmed on a terminal, written
 * by file reference, read back, and its temporary file gone.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/provision-ssm-secret.sh');

function run(args: string[]) {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('provision-ssm-secret.sh — argument guards', () => {
  it('refuses without an environment, rather than defaulting to one', () => {
    const result = run(['--secret', 'session_secret', 'status']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/--target is required/);
  });

  it('refuses an unknown environment', () => {
    const result = run(['--target', 'prod', '--secret', 'session_secret', 'status']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/--target must be 'staging' or 'production'/);
  });

  it('has no "both" mode, because each environment needs its own distinct value', () => {
    const result = run(['--target', 'both', '--secret', 'session_secret', 'status']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/--target must be 'staging' or 'production'/);
  });

  it('refuses without a secret name', () => {
    const result = run(['--target', 'staging', 'status']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/--secret is required/);
  });

  it('refuses an action it was not given', () => {
    const result = run(['--target', 'staging', '--secret', 'session_secret']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/name an action/);
  });
});

describe('provision-ssm-secret.sh — the secret allowlist', () => {
  // The allowlist is a safety property rather than tidiness: a free-form name
  // would let a typo create a parameter Terraform never declared, sitting
  // outside every apply and every inventory, holding a live secret nothing
  // reads. The refusal has to come before any AWS call for that to hold.
  it('refuses a secret name it does not provision, before touching AWS', () => {
    const result = run(['--target', 'production', '--secret', 'sesion_secret', 'store']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/is not one this script provisions/);
    expect(result.stderr).toMatch(/session_secret/);
  });

  it('names the supported secrets when refusing', () => {
    const result = run(['--target', 'production', '--secret', 'stripe_secret_key', 'store']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/Supported: session_secret/);
  });
});

describe('provision-ssm-secret.sh — refusals that do not reach AWS', () => {
  it('rejects an unknown flag rather than ignoring it', () => {
    const result = run(['--target', 'staging', '--secret', 'session_secret', '--force', 'store']);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/unknown argument/);
  });

  it('prints its own header as usage, so the help cannot drift from the script', () => {
    const result = run(['--help']);

    expect(result.stdout).toMatch(/provision-ssm-secret\.sh/);
    expect(result.stdout).toMatch(/status/);
    expect(result.stdout).toMatch(/store/);
    // The value the whole shape exists for: it must be findable from the help.
    expect(result.stdout).toMatch(/state/);
  });
});

describe('provision-ssm-secret.sh — storing and rotating', () => {
  const REAL = 'c'.repeat(64);
  let workDir: string;
  let binDir: string;
  let valueFile: string;
  let writtenFrom: string;
  let callLog: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'footbag-test-ssm-secret-'));
    binDir = join(workDir, 'bin');
    valueFile = join(workDir, 'value');
    writtenFrom = join(workDir, 'written-from');
    callLog = join(workDir, 'calls.log');
    mkdirSync(binDir);
    // The parameter store, answering from one file. A put copies whatever the
    // file reference names, unless the case asks for a write that does not
    // read back as sent.
    writeFileSync(join(binDir, 'aws'), [
      '#!/usr/bin/env bash',
      `echo "aws $*" >> ${JSON.stringify(callLog)}`,
      `vfile=${JSON.stringify(valueFile)}`,
      'case "$1 $2" in',
      '  "ssm get-parameter")',
      '    [[ -e "$vfile" ]] || exit 254',
      '    [[ " $* " == *" --with-decryption "* ]] && cat "$vfile"',
      '    exit 0 ;;',
      '  "ssm put-parameter")',
      '    prev=""; src=""',
      '    for a in "$@"; do [[ "$prev" == --value ]] && src="$a"; prev="$a"; done',
      '    src="${src#file://}"',
      `    printf '%s' "$src" > ${JSON.stringify(writtenFrom)}`,
      '    if [[ -n "${READBACK_SHORT:-}" ]]; then printf short > "$vfile"; else cp "$src" "$vfile"; fi',
      '    exit 0 ;;',
      'esac',
      'exit 64',
    ].join('\n'));
    chmodSync(join(binDir, 'aws'), 0o755);
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  const ARGS = ['--target', 'staging', '--secret', 'session_secret', '--profile', 'test-profile', 'store'];

  /** No controlling terminal at all, as under an agent, a CI runner or a pipe. */
  function runDetached(extraEnv: NodeJS.ProcessEnv = {}) {
    const res = spawnSync('setsid', ['bash', SCRIPT, ...ARGS], {
      env: { ...process.env, PATH: `${binDir}:${process.env.PATH ?? ''}`, ...extraEnv },
      encoding: 'utf-8',
      input: '',
      ...SPAWN_GUARD,
    });
    return { status: res.status ?? -1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
  }

  /** A pseudo-terminal answering the rotation prompt, as an operator would. */
  function runAtTerminal(answer: string) {
    const inner = [`PATH=${JSON.stringify(`${binDir}:${process.env.PATH ?? ''}`)}`, 'bash', SCRIPT, ...ARGS]
      .map((a, i) => (i < 2 ? a : JSON.stringify(a))).join(' ');
    const res = spawnSync('script', ['-qec', inner, '/dev/null'], {
      env: { ...process.env },
      encoding: 'utf-8',
      input: `${answer}\n`,
      ...SPAWN_GUARD,
    });
    return { status: res.status ?? -1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
  }

  function calls(): string {
    return existsSync(callLog) ? readFileSync(callLog, 'utf8') : '';
  }

  it('provisions over the placeholder without asking, by file reference, and leaves no copy behind', () => {
    // Defect caught: the value reaching the process list or the output, or the
    // temporary file holding it surviving the run as a live secret in /tmp.
    writeFileSync(valueFile, 'TODO-placeholder');
    const r = runDetached();

    expect(r.status, r.out).toBe(0);
    const stored = readFileSync(valueFile, 'utf8');
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(calls()).toMatch(/put-parameter .*--value file:\/\//);
    expect(calls()).not.toContain(stored);
    expect(r.out).not.toContain(stored);
    expect(existsSync(readFileSync(writtenFrom, 'utf8'))).toBe(false);
  });

  it('refuses a rotation with no terminal to confirm it, writing nothing', () => {
    // Defect caught: a rotation that signs every member out going through
    // unattended, from a pipe or an agent session nobody is watching.
    writeFileSync(valueFile, REAL);
    const r = runDetached();

    expect(r.status).toBe(1);
    expect(r.out).toContain('needs a typed');
    expect(calls()).not.toContain('put-parameter');
    expect(readFileSync(valueFile, 'utf8')).toBe(REAL);
  });

  it('rotates a real value once ROTATE is typed at the terminal', () => {
    writeFileSync(valueFile, REAL);
    const r = runAtTerminal('ROTATE');

    expect(r.status, r.out).toBe(0);
    const stored = readFileSync(valueFile, 'utf8');
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toBe(REAL);
  });

  it('aborts a rotation on any other answer, writing nothing', () => {
    // Defect caught: a prompt that accepts a near miss, or treats an empty
    // answer as consent.
    writeFileSync(valueFile, REAL);
    const r = runAtTerminal('rotate');

    expect(r.status).toBe(1);
    expect(r.out).toContain('Aborted');
    expect(calls()).not.toContain('put-parameter');
    expect(readFileSync(valueFile, 'utf8')).toBe(REAL);
  });

  it('fails when the parameter does not read back as written', () => {
    // Defect caught: a truncated or misdirected write reported as stored, and
    // the next deploy shipping a value the application refuses at boot.
    writeFileSync(valueFile, 'TODO-placeholder');
    const r = runDetached({ READBACK_SHORT: '1' });

    expect(r.status).toBe(1);
    expect(r.out).toContain('read it back');
  });

  it('refuses before generating anything when the parameter does not exist', () => {
    // Defect caught: a value minted for a parameter that cannot take it, a live
    // credential with nowhere to go.
    const r = runDetached();

    expect(r.status).toBe(1);
    expect(r.out).toContain('is not readable');
    expect(calls()).not.toContain('put-parameter');
  });
});
