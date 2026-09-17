/**
 * scripts/provision-turnstile-key.sh and scripts/lib/vendor-secret.sh — a
 * secret that comes off somebody else's dashboard.
 *
 * Production refuses to boot without a live captcha, and until now the only
 * instruction for getting its secret half into Parameter Store was a hand-typed
 * `aws ssm put-parameter` in a runbook. That put the value in argv, where every
 * process on the machine can read it; it retyped the KMS alias each time; and
 * nothing read the parameter back, so a write that left the Terraform
 * placeholder in place looked identical to one that worked.
 *
 * What is pinned here:
 *
 *   - staging is refused, because the parameter is declared in production's
 *     Terraform only and writing it elsewhere creates a live vendor secret that
 *     no apply and no inventory knows about;
 *   - the value never reaches argv;
 *   - a write is proved by reading it back, and a parameter still holding the
 *     placeholder counts as a failure rather than a success;
 *   - status reads the value to answer and prints none of it.
 *
 * The typing half needs a terminal and belongs to the operator; what is driven
 * here is everything around it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  chmodSync,
  readFileSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { NO_AWS_CREDENTIALS } from '../fixtures/awsIsolation';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const SCRIPT = join(process.cwd(), 'scripts/provision-turnstile-key.sh');
const LIB = join(process.cwd(), 'scripts/lib/vendor-secret.sh');

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-turnstile-'));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

/** An aws stub that records its arguments and answers get-parameter. */
function awsStub(storedValue: string | null): string {
  const path = join(workDir, 'aws-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `echo "$*" >> "${join(workDir, 'calls.log')}"`,
      'case "$2" in',
      '  get-parameter)',
      // `absent` and `unreadable` are different answers and the stub has to be
      // able to produce both, because conflating them is the defect these cases
      // pin: a credential fault used to be reported as "not applied yet".
      storedValue === null
        ? '    echo "An error occurred (ParameterNotFound) when calling the GetParameter operation" >&2; exit 255'
        : storedValue === '__DENIED__'
          ? '    echo "An error occurred (AccessDeniedException): not authorized to perform: ssm:GetParameter" >&2; exit 255'
          : `    printf '%s\\n' ${JSON.stringify(storedValue)}`,
      '    ;;',
      '  put-parameter) : ;;',
      'esac',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

function run(args: string[], storedValue: string | null = null) {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input: '',
    env: {
      ...process.env,
      ...NO_AWS_CREDENTIALS,
      // The run settles and proves its identity before it reads the parameter.
      ...awsIdentityStubEnv(workDir),
      VENDOR_SECRET_AWS_BIN: awsStub(storedValue),
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function calls(): string {
  const log = join(workDir, 'calls.log');
  return existsSync(log) ? readFileSync(log, 'utf-8') : '';
}

describe('provision-turnstile-key.sh — where it will and will not write', () => {
  it('refuses staging, and says why rather than just refusing', () => {
    // The parameter is declared in production's Terraform only. Creating it in
    // staging would put a live vendor secret outside every apply and every
    // inventory, where nothing reads it and nothing knows it exists.
    const r = run(['--env', 'staging', 'store']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/staging holds no Turnstile secret, by design/);
    expect(r.stderr).toMatch(/stub captcha adapter/);
    expect(calls()).not.toMatch(/put-parameter/);
  });

  it('refuses an unknown environment', () => {
    const r = run(['--env', 'sandbox', 'status']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/must be 'production'/);
  });

  it('refuses without an environment, and offers no default', () => {
    const r = run(['status']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--env is required/);
  });

  it('refuses without an action', () => {
    const r = run(['--env', 'production']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/name an action/);
  });

  it('refuses an unknown argument rather than ignoring it', () => {
    const r = run(['--env', 'production', '--nope']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--nope'");
  });

  it('announces the stub, so a stubbed run is never mistaken for a real one', () => {
    const r = run(['--env', 'production', 'status'], 'a-real-value');
    expect(r.stderr).toMatch(/SYNTHETIC:.*proves nothing about the estate/);
  });
});

describe('provision-turnstile-key.sh — status', () => {
  it('reports a set value without printing it', () => {
    const secret = 'the-actual-turnstile-secret';
    const r = run(['--env', 'production', 'status'], secret);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/state:\s+set/);
    expect(r.stdout).not.toContain(secret);
    expect(r.stderr).not.toContain(secret);
  });

  it('separates a placeholder from a real value, and fails on it', () => {
    // The parameter existing and being readable is not the same as it holding
    // anything. Production refuses to boot on the placeholder.
    const r = run(['--env', 'production', 'status'], 'TODO-set-me');
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/state:\s+placeholder/);
    expect(r.stdout).toMatch(/refuse to boot/);
  });

  it('separates absent from placeholder, and names the real cause', () => {
    // Absent means Terraform has not been applied, since Terraform declares it.
    // Telling the operator to store a value would send them the wrong way.
    const r = run(['--env', 'production', 'status'], null);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/state:\s+absent/);
    expect(r.stdout).toMatch(/has not been applied/);
  });

  it('separates a credential fault from an absent parameter', () => {
    // Every non-zero exit used to become "absent", and the caller then told the
    // operator that Terraform had not been applied and to apply it. A
    // deactivated key therefore produced an instruction to run a production
    // apply, which is the wrong move made on the wrong evidence.
    const r = run(['--env', 'production', 'status'], '__DENIED__');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/could not be read, which is not the same as it/);
    expect(r.stderr).toMatch(/AccessDenied/);
    expect(r.stderr).toMatch(/Do NOT read this as 'apply Terraform'/);
    expect(r.stdout).not.toMatch(/has not been applied/);
  });

  it('does not claim a stored value is the current one', () => {
    // Nothing here can know what the vendor dashboard shows today.
    const r = run(['--env', 'production', 'status'], 'a-real-value');
    expect(r.stdout).toMatch(/says nothing about whether it is the/);
  });
});

describe('vendor-secret.sh — the value never reaches argv', () => {
  const lib = readFileSync(LIB, 'utf-8');

  it('passes the value to the CLI through a file, not on the command line', () => {
    // `--value "$SECRET"` is readable by every process on the machine with ps,
    // for as long as the call takes.
    expect(lib).toMatch(/--value "file:\/\/\$\{tmp\}"/);
    expect(lib).not.toMatch(/--value "\$value"/);
  });

  it('mode-restricts that file at creation and destroys it on every exit', () => {
    expect(lib).toMatch(/umask 077 && mktemp/);
    expect(lib).toMatch(/secret_file_destroy/);
  });

  it('reads the typed value with echo off, from the terminal', () => {
    expect(lib).toMatch(/read -rs first < \/dev\/tty/);
    expect(lib).toMatch(/terminal_present --with-stdin/);
  });

  it('asks twice, because a hidden paste hides its own truncation', () => {
    expect(lib).toMatch(/Again, to confirm/);
    expect(lib).toMatch(/the two entries differ/);
  });

  it('treats a write that left the placeholder in place as a failure', () => {
    expect(lib).toMatch(/still holds the Terraform placeholder after the write/);
  });

  it('reads the value back and compares it, rather than trusting the put', () => {
    expect(lib).toMatch(/reads back as something other than what was written/);
  });

  it('destroys that file when the put is interrupted rather than returning', () => {
    // The file exists from the moment the value is written into it until the
    // put returns. The library's own cleanup runs on return, which an interrupt
    // never reaches, so what covers a Ctrl-C mid-call is the path being
    // registered for the caller's trap to sweep.
    //
    // Parked by standing in for the CLI, so the interrupt lands while the value
    // is genuinely on disk with the call in flight.
    const value = 'turnstile-secret-not-a-real-one';
    const harness = join(workDir, 'interrupt.sh');
    writeFileSync(
      harness,
      [
        'set -euo pipefail',
        `source ${JSON.stringify(LIB)}`,
        // The handler ends the run, the way an uncaught interrupt would. That
        // matters: let the function return instead and its own return-time
        // cleanup accounts for the file, and the case proves nothing about the
        // interrupt path. Ending here leaves the sweep as the only explanation.
        "trap 'secret_file_sweep; exit 130' INT TERM",
        `VENDOR_SECRET_AWS_BIN=${JSON.stringify(join(workDir, 'aws-park'))}`,
        `vendor_secret_put /footbag/turnstile alias/footbag ${JSON.stringify(value)}`,
      ].join('\n') + '\n',
      'utf-8',
    );
    const park = join(workDir, 'aws-park');
    // Bash defers a trap until the foreground command it is running returns, so
    // the signal is raised and the stub then exits: the handler fires with the
    // call still in flight from the function's point of view, which is where an
    // operator's Ctrl-C lands.
    writeFileSync(
      park,
      ['#!/usr/bin/env bash', 'kill -INT "$PPID"', 'sleep 1', 'exit 130'].join('\n') + '\n',
    );
    chmodSync(park, 0o755);

    const res = spawnSync('bash', [harness], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        TMPDIR: workDir,
        ...NO_AWS_CREDENTIALS,
        ...awsIdentityStubEnv(workDir),
      },
      ...SPAWN_GUARD,
    });
    expect(res.status).not.toBe(0);

    const holders = readdirSync(workDir)
      .filter((name) => name !== 'interrupt.sh')
      .filter((name) => readFileSync(join(workDir, name), 'utf-8').includes(value));
    expect(holders).toEqual([]);
  });
});

describe('provision-turnstile-key.sh — the run sweeps what the library registered', () => {
  it('installs a cleanup trap that covers the interrupt as well as the exits', () => {
    // Run rather than read: a trap line naming the helper proves nothing about
    // whether the helper reaches the file.
    const script = readFileSync(SCRIPT, 'utf-8');
    expect(script).toMatch(/trap secret_file_sweep EXIT INT TERM/);

    const registered = join(workDir, 'registered-secret');
    const harness = join(workDir, 'sweep.sh');
    writeFileSync(
      harness,
      [
        'set -euo pipefail',
        `source ${JSON.stringify(LIB)}`,
        'trap secret_file_sweep EXIT INT TERM',
        `printf 'a-vendor-secret' > ${JSON.stringify(registered)}`,
        `secret_file_register ${JSON.stringify(registered)}`,
      ].join('\n') + '\n',
      'utf-8',
    );
    const res = spawnSync('bash', [harness], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        TMPDIR: workDir,
        ...NO_AWS_CREDENTIALS,
        ...awsIdentityStubEnv(workDir),
      },
      ...SPAWN_GUARD,
    });
    // The trap settles on an explicit zero, so a successful run stays successful.
    expect(res.status).toBe(0);
    expect(existsSync(registered)).toBe(false);
  });
});
