/**
 * scripts/install-backup-timer.sh — argument validation, command plan, and the
 * root-side install sequence.
 *
 * The script installs the footbag-backup systemd pair on a remote host, which
 * CI cannot exercise: no live host, and the privileged half runs as root. Two
 * things are pinned instead. The --dry-run mode prints the command plan without
 * connecting, and the root-side body is a standalone file whose text can be
 * asserted directly, so a regression in the install sequence (unit paths,
 * reload, enable, first run) is caught without a host.
 *
 * The wrapper must also refuse an interactive stdin rather than hanging: the
 * sudo password arrives as line one of the pipe, and a script that waits for a
 * password nobody is going to type is a script that parks a terminal.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts/install-backup-timer.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runScript(args: string[]): RunResult {
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

describe('install-backup-timer.sh — argument validation', () => {
  it('rejects an unknown argument', () => {
    const result = runScript(['--bogus']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/unknown argument/);
  });

  it('rejects an invalid target', () => {
    const result = runScript(['--target', 'dev', '--dry-run']);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/--target must be 'staging' or 'production'/);
  });

  it('--help prints usage and exits 0', () => {
    const result = runScript(['--help']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/install-backup-timer\.sh/);
    expect(result.stdout).not.toMatch(/set -euo/);
  });
});

describe('install-backup-timer.sh — dry-run command plan', () => {
  it('describes the piped install and states that the host is left clean', () => {
    const result = runScript(['--target', 'staging', '--dry-run']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/sudo password from stdin, line 1/);
    expect(result.stdout).toMatch(/internal\/install-backup-timer-remote\.sh/);
    // The units ride the pipe, so no staging directory is created and none has
    // to be cleaned up; a plan that still mentioned scp would be describing a
    // host-side artifact the script no longer creates.
    expect(result.stdout).not.toMatch(/\bscp\b/);
    expect(result.stdout).toMatch(/Nothing is staged on the host/);
    expect(result.stdout).toMatch(/enable_backup_alarm = true in terraform\/staging\/terraform\.tfvars/);
  });

  it('defaults the ssh alias from the target and honors --ssh-alias', () => {
    const prod = runScript(['--target', 'production', '--dry-run']);
    expect(prod.exitCode).toBe(0);
    expect(prod.stdout).toMatch(/ssh alias: footbag-production/);
    expect(prod.stdout).toMatch(/terraform\/production\/terraform\.tfvars/);

    const custom = runScript(['--target', 'staging', '--ssh-alias', 'my-host', '--dry-run']);
    expect(custom.exitCode).toBe(0);
    expect(custom.stdout).toMatch(/ssh alias: my-host/);
  });
});

describe('install-backup-timer.sh — the root-side install sequence', () => {
  const remoteHalf = readFileSync(
    join(process.cwd(), 'scripts/internal/install-backup-timer-remote.sh'),
    'utf-8',
  );

  it('installs both units to /etc/systemd/system as root-owned 0644', () => {
    expect(remoteHalf).toMatch(
      /install -m 0644 -o root -g root .*footbag-backup\.service.*\/etc\/systemd\/system\/footbag-backup\.service/,
    );
    expect(remoteHalf).toMatch(
      /install -m 0644 -o root -g root .*footbag-backup\.timer.*\/etc\/systemd\/system\/footbag-backup\.timer/,
    );
  });

  it('reloads systemd and enables the timer, so an installed unit is a running one', () => {
    expect(remoteHalf).toMatch(/systemctl daemon-reload/);
    expect(remoteHalf).toMatch(/systemctl enable --now footbag-backup\.timer/);
  });

  it('runs the service once immediately', () => {
    // A missing BACKUP_S3_BUCKET or an absent CLI must fail loudly at install
    // time. Left to the first timer tick, the timer reports active while the
    // service refuses on every run and the snapshots bucket stays empty.
    expect(remoteHalf).toMatch(/systemctl start footbag-backup\.service/);
  });

  it('refuses a unit file that decoded empty rather than installing it', () => {
    // An empty unit file installs cleanly and disables the backup silently.
    expect(remoteHalf).toMatch(/decoded empty; nothing was installed/);
  });

  it('requires both unit payloads as variables from the wrapper', () => {
    expect(remoteHalf).toMatch(/\$\{UNIT_SERVICE_B64:\?/);
    expect(remoteHalf).toMatch(/\$\{UNIT_TIMER_B64:\?/);
  });
});

describe('install-backup-timer.sh — credential handling', () => {
  it('refuses without a credential line, naming the invocation that supplies one', () => {
    // Not --dry-run: the real path is the one that needs the credential file.
    // A spawned process has no terminal, so this exercises the empty-stdin
    // refusal; the interactive-stdin refusal is the same guard's other branch
    // and cannot be reached without a tty. Both must name the remedy, because
    // a script that refuses without saying how to satisfy it sends the
    // operator back to the source to find out.
    const result = runScript(['--target', 'staging']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/expected the host sudo password/);
    expect(result.stderr).toMatch(/operator credential file/);
    expect(result.stderr).toMatch(/install-backup-timer\.sh --target staging/);
  });
});
