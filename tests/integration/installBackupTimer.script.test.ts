/**
 * scripts/install-backup-timer.sh — argument validation and command plan.
 *
 * The script installs the footbag-backup systemd pair on a remote host over
 * ssh with interactive sudo, which CI cannot exercise. The --dry-run mode
 * prints the exact remote command plan without connecting; these tests pin
 * that plan so a regression in the install sequence (unit paths, reload,
 * enable, first run) is caught without a live host.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
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
  it('plans the full install sequence in one sudo invocation', () => {
    const result = runScript(['--target', 'staging', '--dry-run']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/scp ops\/systemd\/footbag-backup\.service ops\/systemd\/footbag-backup\.timer footbag-staging:/);
    expect(result.stdout).toMatch(/install -m 0644 -o root -g root .*footbag-backup\.service \/etc\/systemd\/system\/footbag-backup\.service/);
    expect(result.stdout).toMatch(/install -m 0644 -o root -g root .*footbag-backup\.timer \/etc\/systemd\/system\/footbag-backup\.timer/);
    expect(result.stdout).toMatch(/systemctl daemon-reload/);
    expect(result.stdout).toMatch(/systemctl enable --now footbag-backup\.timer/);
    // The service runs once immediately so a missing BACKUP_S3_BUCKET or
    // absent CLI fails loudly at install time, not on the first timer tick.
    expect(result.stdout).toMatch(/systemctl start footbag-backup\.service/);
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
    expect(custom.stdout).toMatch(/scp .* my-host:/);
  });
});
