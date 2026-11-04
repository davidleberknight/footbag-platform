/**
 * scripts/install-backup-timer.sh — argument validation, command plan, and the
 * root-side install sequence.
 *
 * The script installs the footbag-backup systemd pair on a remote host, which
 * CI cannot exercise: no live host, and the privileged half runs as root. Two
 * things are pinned instead. The --dry-run mode prints the command plan without
 * connecting, and the root-side body is a standalone file whose text can be
 * asserted directly, so a regression in the install sequence (unit paths,
 * reload, enable, first run) is caught without a host. And the send itself is
 * run end to end against a stand-in ssh client and stand-in system tools,
 * because what the run reports depends on what the host half marks.
 *
 * The wrapper must also refuse an interactive stdin rather than hanging: the
 * sudo password arrives as line one of the pipe, and a script that waits for a
 * password nobody is going to type is a script that parks a terminal.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { connectingAs, SHARED_ACCOUNT, NAMED_ACCOUNT } from '../fixtures/sshConfigStub';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts/install-backup-timer.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runScript(args: string[], extraEnv: NodeJS.ProcessEnv = {}): RunResult {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env, ...extraEnv },
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
    // host-side artifact the script does not create.
    expect(result.stdout).not.toMatch(/\bscp\b/);
    expect(result.stdout).toMatch(/Nothing is staged on the host/);
    // The follow-up is the script that makes the change, never a hand edit of
    // the values file.
    expect(result.stdout).toMatch(/set-terraform-gate\.sh --target staging --gate enable_backup_alarm --state on/);
    expect(result.stdout).not.toMatch(/terraform\.tfvars/);
  });

  it('reaches the target\'s own alias, and takes no other', () => {
    // Defect caught: a run labelled one environment installing on the other's
    // host, because a separate flag chose the host and nothing compared the two.
    const prod = runScript(['--target', 'production', '--dry-run']);
    expect(prod.exitCode).toBe(0);
    expect(prod.stdout).toMatch(/ssh alias: footbag-production/);
    expect(prod.stdout).toMatch(/set-terraform-gate\.sh --target production --gate enable_backup_alarm/);

    const overridden = runScript(['--target', 'staging', '--ssh-alias', 'footbag-production', '--dry-run']);
    expect(overridden.exitCode).toBe(2);
    expect(overridden.stderr).toMatch(/unknown argument '--ssh-alias'/);
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
    const result = runScript(['--target', 'staging'], connectingAs(SHARED_ACCOUNT));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/expected the host sudo password/);
    // The remedy names the actual credential file rather than a placeholder, so
    // the line can be pasted. A placeholder here is what sent an operator to the
    // source to find out where the file lives.
    expect(result.stderr).toMatch(/~\/AWS\/AWS_OPERATOR\.txt/);
    expect(result.stderr).toMatch(/install-backup-timer\.sh --target staging/);
  });

  it('names the personal file when the alias connects as a named account', () => {
    // The pasteable line is the whole value of naming a file, and pasting the
    // shared account's file while connected as a person pipes one identity's
    // password into another's sudo. That fails on the host, where it reads as a
    // broken account rather than as the wrong file.
    const result = runScript(['--target', 'staging'], connectingAs(NAMED_ACCOUNT));
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/~\/AWS\/DEV_TESTER_HOST\.txt/);
    expect(result.stderr).not.toMatch(/~\/AWS\/AWS_OPERATOR\.txt/);
  });
});

describe('install-backup-timer.sh — the host half\'s problems reach the closing report', () => {
  /**
   * The whole send, run: a stand-in ssh client confirms the host is staging,
   * then consumes the password line and runs the rest of the stream (the
   * remote report helper and the root-side body) with bash. The system tools
   * the body calls are stand-ins on PATH; the journal holds the backup's own
   * lines, which are strings backup-db.sh prints.
   */
  let work: string;
  beforeEach(() => {
    work = createScratchDir('backup-timer');
  });
  afterEach(() => removeScratch(work));

  function runInstall(opts: { startFails: boolean; journal: string[] }) {
    const bin = join(work, 'bin');
    mkdirSync(bin);
    const passSeen = join(work, 'pass-seen');
    const journal = join(work, 'journal');
    writeFileSync(journal, opts.journal.join('\n') + '\n');
    const exec = (name: string, lines: string[]) =>
      writeFileSync(join(bin, name), ['#!/usr/bin/env bash', ...lines].join('\n') + '\n', { mode: 0o755 });
    exec('install', ['exit 0']);
    exec('systemctl', [
      'case "$1" in',
      opts.startFails
        ? '  start) echo "Job for footbag-backup.service failed because the control process exited with error code." >&2; exit 1 ;;'
        : '  start) exit 0 ;;',
      '  *) exit 0 ;;',
      'esac',
    ]);
    exec('journalctl', [`cat ${JSON.stringify(journal)}`]);
    const ssh = join(work, 'ssh-host.sh');
    writeFileSync(ssh, [
      '#!/usr/bin/env bash',
      'case "$*" in',
      '  *footbag-host-identity*) cat >/dev/null; printf -- "---FOOTBAG-HOST-ENV---\\nstaging\\n---FOOTBAG-HOST-URL---\\n\\n---FOOTBAG-END---\\n"; exit 0 ;;',
      'esac',
      'IFS= read -r pass',
      `printf '%s\\n' "$pass" > ${JSON.stringify(passSeen)}`,
      `PATH=${JSON.stringify(bin)}:$PATH exec bash`,
    ].join('\n'), { mode: 0o755 });
    const pin = join(work, 'known_hosts');
    writeFileSync(pin, 'footbag-staging ssh-ed25519 AAAAstub\n', { mode: 0o600 });
    const r = spawnSync('bash', [SCRIPT, '--target', 'staging'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      input: 'stub-sudo-pass\n',
      env: {
        ...process.env,
        ...connectingAs(SHARED_ACCOUNT, work),
        FOOTBAG_HOST_SSH_BIN: ssh,
        FOOTBAG_KNOWN_HOSTS: pin,
        FOOTBAG_CR_REPORT_TO: '',
      },
      ...SPAWN_GUARD,
    });
    const stderr = r.stderr ?? '';
    return {
      status: r.status,
      stdout: r.stdout ?? '',
      stderr,
      report: stderr.slice(stderr.indexOf('==== Closing report')),
      passSeen: existsSync(passSeen) ? readFileSync(passSeen, 'utf-8') : '',
    };
  }

  it('fails the run on a first backup that refused, naming the backup\'s own reason', () => {
    // Defect caught: the backup's refusal was only in a journal tail printed
    // above the last line, so the operator read a failed install without its
    // cause, and had to ssh in to find it.
    const reason = 'backup-db: FAILURE (1 consecutive): BACKUP_S3_BUCKET is not set';
    // systemd closes a failed run with its own line, so the reason is never
    // the last thing the host printed.
    const r = runInstall({
      startFails: true,
      journal: [
        `Nov 04 07:00:01 host bash[123]: ${reason}`,
        "Nov 04 07:00:01 host systemd[1]: footbag-backup.service: Main process exited, code=exited, status=1/FAILURE",
      ],
    });
    expect(r.status, r.stderr).toBe(1);
    expect(r.report).toContain(reason);
    expect(r.stdout).not.toMatch(/installed and active/);
    // The password went to sudo's line and nowhere else.
    expect(r.passSeen).toBe('stub-sudo-pass\n');
  });

  it('passes a first backup that recovered on a retry, listing the retry as a warning', () => {
    // Defect caught: a run whose upload only succeeded on a retry ended with no
    // sign of it, so a host with a flaky path to the bucket read as healthy.
    const retry = 'backup-db: upload attempt 1/3 failed';
    const r = runInstall({
      startFails: false,
      journal: [
        `Nov 04 07:00:01 host bash[123]: ${retry}`,
        'Nov 04 07:00:05 host bash[123]: backup-db: uploaded s3://bucket/key (age since previous: 5m)',
      ],
    });
    expect(r.status, r.stderr).toBe(0);
    expect(r.report).toMatch(/Warnings \(1\):/);
    expect(r.report).toContain(retry);
    expect(r.report).not.toMatch(/Errors \(/);
    expect(r.stdout).toMatch(/installed and active/);
  });
});
