/**
 * Setting the ssh daemon's posture on a deployed host without locking anyone out.
 *
 * What these pin. The root-side body writes root, password and keyboard-
 * interactive login off as one drop-in and reloads only after: the file
 * validates; with Match applied, sshd would refuse all three for root, the
 * connecting account and the break-glass account from inside and outside; the
 * connecting account's configuration changes in nothing else; no method list
 * requires a password; and the account holds a key. Until the reload succeeds,
 * any exit, a failed check, an interrupt or an error, puts back what was there.
 * A host whose file is already in place is still validated and reloaded, since a
 * file on disk does not prove the running daemon applies it. The operator half
 * refuses a missing target, a host recording another environment and an
 * unconfirmed production change; sends the password as the first line of the
 * stream and never in an argument; and after the change proves a fresh key
 * connection and that the running daemon refuses a password-only connection.
 *
 * The sshd stand-in applies the real first-match rule over the drop-ins in
 * sorted order and then the main file, accumulates ports from every file, and
 * evaluates a Match override for one named account when asked with -C.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { hostIdentityAnswer } from '../fixtures/hostIdentityStub';
import { requireToolInCI } from '../fixtures/toolAvailability';

const REMOTE_HALF = join(process.cwd(), 'scripts/internal/harden-sshd-remote.sh');
const OPERATOR_SCRIPT = join(process.cwd(), 'scripts/harden-sshd.sh');

let workDir: string;
let binDir: string;
let mainConfig: string;
let dropinDir: string;
let keysFile: string;
let callLog: string;

function imageMain(dir: string): string {
  return [
    `Include ${dir}/*.conf`,
    'Port 22',
    'Port 2222',
    'PermitRootLogin without-password',
    'PubkeyAuthentication yes',
    '',
  ].join('\n');
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-harden-sshd-'));
  binDir = join(workDir, 'bin');
  dropinDir = join(workDir, 'sshd_config.d');
  mkdirSync(binDir);
  mkdirSync(dropinDir);
  mainConfig = join(workDir, 'sshd_config');
  keysFile = join(workDir, 'authorized_keys');
  callLog = join(workDir, 'calls.log');
  writeFileSync(mainConfig, imageMain(dropinDir));
  writeFileSync(keysFile, 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE operator\n');

  // sshd. -t fails on a line containing "Bogus". -T prints effective values by
  // first match over the drop-ins in sorted order, then the main file; ports
  // accumulate from every file. With -C user=<MATCH_USER>, MATCH_KEY is forced
  // to MATCH_VALUE, as a Match block would. AUTH_METHODS sets the method list.
  // OTHER_CHANGES_WITH_OURS makes an unrelated setting differ once our file is
  // present, standing in for a change that reaches past the three keywords.
  writeFileSync(join(binDir, 'sshd'), [
    '#!/usr/bin/env bash',
    `echo "sshd $*" >> ${JSON.stringify(callLog)}`,
    'files=()',
    'for f in $(ls "$SSHD_DROPIN_DIR"/*.conf 2>/dev/null | sort); do files+=("$f"); done',
    'files+=("$SSHD_CONFIG")',
    'if [[ "$1" == "-t" ]]; then ! grep -q Bogus "${files[@]}"; exit $?; fi',
    'user=""; for a in "$@"; do [[ "$a" == user=* ]] && { user="${a#user=}"; user="${user%%,*}"; }; done',
    'first() { local k="$1" f v; for f in "${files[@]}"; do v="$(grep -i "^$k " "$f" | head -1 | cut -d" " -f2)"; [[ -n "$v" ]] && { echo "$v"; return; }; done; echo "$2"; }',
    'val() { local k="$1" d="$2"; if [[ -n "$user" && "$user" == "${MATCH_USER:-}" && "${MATCH_KEY:-}" == "$k" ]]; then echo "$MATCH_VALUE"; else first "$k" "$d"; fi; }',
    'cat "${files[@]}" | grep -i "^port " | tr "[:upper:]" "[:lower:]"',
    'echo "permitrootlogin $(val PermitRootLogin yes)"',
    'echo "passwordauthentication $(val PasswordAuthentication yes)"',
    'echo "kbdinteractiveauthentication $(val KbdInteractiveAuthentication yes)"',
    'echo "pubkeyauthentication $(val PubkeyAuthentication yes)"',
    'echo "authenticationmethods ${AUTH_METHODS:-any}"',
    'echo "trustedusercakeys /etc/ssh/lightsail_instance_ca.pub"',
    'if [[ -n "${OTHER_CHANGES_WITH_OURS:-}" && -e "$SSHD_DROPIN_DIR/10-footbag-hardening.conf" ]]; then echo "x11forwarding yes"; else echo "x11forwarding no"; fi',
  ].join('\n'));
  // systemctl. RELOAD_EXIT fails the reload; TERM_ON_RELOAD sends the body a
  // TERM while the reload runs, as an interrupt at the worst moment would.
  // systemctl. RELOAD_EXIT fails the reload; TERM_ON_RELOAD sends the body a
  // TERM while the reload runs, as an interrupt at the worst moment would. The
  // revert timer is a marker file: active while it exists, stopped by removing it.
  // The timer firing just before it is stopped is modelled at the stop: a start
  // job systemd had already queued is not cancelled by stopping the timer, so
  // STOP_FIRES_REVERT runs the revert script as that queued job would, and
  // STOP_REVERTS_PAST_CHECK runs it as a service that had already looked for
  // the confirmed marker before confirm wrote it, finishing during the stop.
  writeFileSync(join(binDir, 'systemctl'), [
    '#!/usr/bin/env bash',
    `echo "systemctl $*" >> ${JSON.stringify(callLog)}`,
    `timer=${JSON.stringify(join(workDir, 'revert-timer'))}`,
    'case "$1" in',
    '  reload)',
    '    if [[ -n "${TERM_ON_RELOAD:-}" ]]; then kill -TERM "$PPID"; fi',
    '    if [[ -n "${TERM_ON_EVERY_RELOAD:-}" ]]; then kill -TERM "$PPID"; kill -TERM "$PPID"; fi',
    '    exit "${RELOAD_EXIT:-0}" ;;',
    '  is-active) [[ -e "$timer" ]] && exit 0; exit 3 ;;',
    // The revert service's state, set by a test; show prints it as systemd does.
    `  show) echo "\${REVERT_SERVICE_STATE:-inactive}"; exit 0 ;;`,
    '  stop)',
    '    [[ -n "${STOP_FAILS:-}" ]] && exit 1',
    '    if [[ -n "${STOP_FIRES_REVERT:-}" && -e "$timer" ]]; then bash "$(cat "$timer")" >/dev/null 2>&1; fi',
    '    if [[ -n "${STOP_REVERTS_PAST_CHECK:-}" && -e "$timer" ]]; then grep -v "\\.confirmed" "$(cat "$timer")" | bash >/dev/null 2>&1; fi',
    '    rm -f "$timer"; exit 0 ;;',
    'esac',
    'exit 0',
  ].join('\n'));
  // systemd-run records the transient timer it was asked to set and the script
  // it would run; SYSTEMD_RUN_EXIT makes setting it fail.
  writeFileSync(join(binDir, 'systemd-run'), [
    '#!/usr/bin/env bash',
    `echo "systemd-run $*" >> ${JSON.stringify(callLog)}`,
    '[[ -n "${SYSTEMD_RUN_EXIT:-}" ]] && exit "$SYSTEMD_RUN_EXIT"',
    `printf '%s' "\${!#}" > ${JSON.stringify(join(workDir, 'revert-timer'))}`,
    'exit 0',
  ].join('\n'));
  chmodSync(join(binDir, 'systemd-run'), 0o755);
  chmodSync(join(binDir, 'sshd'), 0o755);
  chmodSync(join(binDir, 'systemctl'), 0o755);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const DROPIN = () => join(dropinDir, '10-footbag-hardening.conf');
const HARDENED = 'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n';

function remoteEnv(extraEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ''}`,
    SSHD_CONFIG: mainConfig,
    SSHD_DROPIN_DIR: dropinDir,
    LOGIN_USER: 'footbag',
    LOGIN_KEYS: keysFile,
    REVERT_SCRIPT: join(workDir, 'revert.sh'),
    ...extraEnv,
  };
}

function runRemote(mode: string, extraEnv: NodeJS.ProcessEnv = {}) {
  const res = spawnSync('bash', [REMOTE_HALF], {
    env: remoteEnv({ MODE: mode, ...extraEnv }),
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function calls(): string {
  return existsSync(callLog) ? readFileSync(callLog, 'utf8') : '';
}

const SAVED = () => join(dropinDir, '.10-footbag-hardening.conf.prev');
const TIMER = () => join(workDir, 'revert-timer');
const REVERT = () => join(workDir, 'revert.sh');

function reloads(): number {
  return calls().split('\n').filter((l) => l === 'systemctl reload sshd').length;
}

/** No staged file and nothing but real drop-ins in the directory. */
function dropinNames(): string[] {
  return readdirSync(dropinDir).sort();
}

describe('the root-side hardening', () => {
  it('turns root, password and keyboard-interactive login off, keeps the ports, then reloads', () => {
    const res = runRemote('apply');

    expect(res.status, res.stderr).toBe(0);
    expect(readFileSync(DROPIN(), 'utf8')).toMatch(/^PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no$/m);
    expect(readFileSync(DROPIN(), 'utf8')).not.toMatch(/^Port /m);
    expect(reloads()).toBe(1);
    expect(dropinNames()).toEqual(['10-footbag-hardening.conf']);
    expect(res.stdout).toMatch(/after the reload[\s\S]*port 2222/);
  });

  it('checks root, the connecting account and the break-glass account from inside and outside', () => {
    // Defect caught: a check that reads the configuration without Match, so a
    // Match block re-opening password login for some account goes unseen.
    runRemote('apply');
    for (const who of ['root', 'footbag', 'ec2-user']) {
      expect(calls(), who).toContain(`sshd -T -C user=${who},host=localhost,addr=127.0.0.1`);
      expect(calls(), who).toContain(`sshd -T -C user=${who},host=outside.invalid,addr=203.0.113.1`);
    }
  });

  it('reports a status without writing or reloading anything', () => {
    const res = runRemote('status');

    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('permitrootlogin without-password');
    expect(dropinNames()).toEqual([]);
    expect(reloads()).toBe(0);
  });

  it('validates and reloads again when the file is already in place, since a file is not proof the daemon applies it', () => {
    // Defect caught: a run cut off between writing and reloading, then a re-run
    // that sees the file and reports "already hardened" while the daemon still
    // allows root and password login.
    writeFileSync(DROPIN(), HARDENED);
    const res = runRemote('apply');

    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toContain('sshd -t');
    expect(reloads()).toBe(1);
    // The previous file is kept as what the self-revert would put back until
    // the change is confirmed.
    expect(readFileSync(SAVED(), 'utf8')).toBe(HARDENED);
  });

  it('takes the account to protect from sudo when it is not named', () => {
    // Defect caught: production always refusing because the account was read
    // from somewhere sudo does not set.
    const res = runRemote('apply', { LOGIN_USER: '', SUDO_USER: 'footbag' });

    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toContain('sshd -T -C user=footbag,host=localhost,addr=127.0.0.1');
  });

  // Each row is one way the change could be wrong while the daemon still runs
  // the old configuration. The run must refuse, leave no file of ours and no
  // staged file, and never reload.
  it.each([
    ['the new configuration does not validate', '20-other.conf', 'Bogus line\n', {}],
    ['an earlier drop-in keeps root login on', '05-image.conf', 'PermitRootLogin yes\n', {}],
    ['an earlier drop-in keeps password login on', '05-image.conf', 'PasswordAuthentication yes\n', {}],
    ['an earlier drop-in keeps keyboard-interactive login on', '05-image.conf', 'KbdInteractiveAuthentication yes\n', {}],
    ['a Match block re-opens password login for the break-glass account', '', '',
      { MATCH_USER: 'ec2-user', MATCH_KEY: 'PasswordAuthentication', MATCH_VALUE: 'yes' }],
    ['a Match block re-opens password login for the connecting account', '', '',
      { MATCH_USER: 'footbag', MATCH_KEY: 'PasswordAuthentication', MATCH_VALUE: 'yes' }],
    ['a Match block re-opens root login for root', '', '',
      { MATCH_USER: 'root', MATCH_KEY: 'PermitRootLogin', MATCH_VALUE: 'prohibit-password' }],
    ['the change would alter another setting for the connecting account', '', '', { OTHER_CHANGES_WITH_OURS: '1' }],
  ] as const)('refuses and restores, without reloading, when %s', (_label, otherFile, otherBody, env) => {
    if (otherFile) writeFileSync(join(dropinDir, otherFile), otherBody);
    const before = dropinNames().filter((n) => n !== '10-footbag-hardening.conf');
    const res = runRemote('apply', env);

    expect(res.status).toBe(1);
    expect(dropinNames()).toEqual(before);
    expect(reloads()).toBe(0);
    expect(res.stderr).toContain('previous sshd configuration file is back');
  });

  it.each([
    ['a method list makes a password a required second factor', { AUTH_METHODS: 'publickey,password' }, 'AuthenticationMethods'],
    ['the connecting account holds no key', { LOGIN_KEYS: '/nonexistent/authorized_keys' }, 'no authorized key'],
    ['it cannot tell which account it came in on', { LOGIN_USER: '', SUDO_USER: '' }, 'cannot tell which account'],
  ] as const)('refuses before writing anything when %s', (_label, env, message) => {
    const res = runRemote('apply', env);

    expect(res.status).toBe(1);
    expect(res.stderr).toContain(message);
    expect(dropinNames()).toEqual([]);
    expect(reloads()).toBe(0);
  });

  it('refuses when the main configuration does not read the drop-in directory', () => {
    // Defect caught: a file written where sshd never looks, and a run that
    // reports a posture the daemon does not apply.
    writeFileSync(mainConfig, imageMain(dropinDir).replace(/^Include .*\n/, ''));
    const res = runRemote('apply');

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('does not include');
    expect(dropinNames()).toEqual([]);
  });

  it('puts an existing drop-in back exactly when a check fails', () => {
    // Defect caught: a failed run that deletes the file an earlier run wrote,
    // silently re-opening what that run closed.
    const earlier = 'PermitRootLogin no\nPasswordAuthentication yes\n';
    writeFileSync(DROPIN(), earlier);
    const res = runRemote('apply', { MATCH_USER: 'ec2-user', MATCH_KEY: 'PasswordAuthentication', MATCH_VALUE: 'yes' });

    expect(res.status).toBe(1);
    expect(readFileSync(DROPIN(), 'utf8')).toBe(earlier);
  });

  it('puts the previous configuration back, and reloads to match it, when the reload fails', () => {
    const res = runRemote('apply', { RELOAD_EXIT: '1' });

    expect(res.status).toBe(1);
    expect(dropinNames()).toEqual([]);
    expect(reloads()).toBe(2);
    expect(res.stderr).toContain('reload of sshd failed');
  });

  it('restores the previous file, and reloads to match it, when interrupted during the reload', () => {
    // Defect caught: an interrupt handler that cleans up and lets the script
    // carry on; or one that restores the file after sshd was already signalled
    // to read the new one, leaving the daemon and the disk disagreeing until the
    // next reload silently re-opens what the run closed.
    const earlier = 'PermitRootLogin no\n';
    writeFileSync(DROPIN(), earlier);
    const res = runRemote('apply', { TERM_ON_RELOAD: '1' });

    expect(res.status).not.toBe(0);
    expect(readFileSync(DROPIN(), 'utf8')).toBe(earlier);
    expect(reloads()).toBe(2);
    expect(res.stdout).not.toContain('after the reload');
    expect(dropinNames()).toEqual(['10-footbag-hardening.conf']);
  });

  it('refuses, touching neither file, when an interrupted run left its saved copy behind', () => {
    // Defect caught: the only copy of the original, left by a killed run,
    // overwritten by the next run's backup or deleted by its cleanup.
    const original = 'PermitRootLogin prohibit-password\n';
    const saved = join(dropinDir, '.10-footbag-hardening.conf.prev');
    writeFileSync(saved, original);
    writeFileSync(DROPIN(), HARDENED);
    const res = runRemote('apply');

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('left from an interrupted run');
    expect(readFileSync(saved, 'utf8')).toBe(original);
    expect(readFileSync(DROPIN(), 'utf8')).toBe(HARDENED);
    expect(reloads()).toBe(0);
  });

  it('still reloads to match the restored file when its report has nowhere to go', () => {
    // Defect caught: the connection dropping mid-run, so the first write in the
    // restore raises SIGPIPE and ends it after the file is put back but before
    // the daemon, which may already have read the new file, is reloaded.
    const res = spawnSync('bash', ['-c', `bash ${JSON.stringify(REMOTE_HALF)} 2> >(exit 0)`], {
      env: { ...process.env, ...remoteEnv({ MODE: 'apply', RELOAD_EXIT: '1' }) },
      encoding: 'utf8',
      ...SPAWN_GUARD,
    });

    expect(res.status).not.toBe(0);
    expect(dropinNames()).toEqual([]);
    expect(reloads()).toBe(2);
  });

  it('refuses to confirm while the revert is already running, touching nothing', () => {
    // Defect caught: confirm cancelling a timer whose service has already
    // started, then deleting the saved copy that service is about to restore, so
    // the previous file is lost and the hardened one is deleted.
    writeFileSync(DROPIN(), 'PermitRootLogin no\n');
    expect(runRemote('apply').status).toBe(0);
    const res = runRemote('confirm', { REVERT_SERVICE_STATE: 'activating' });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('revert is running now');
    expect(existsSync(SAVED())).toBe(true);
    expect(existsSync(TIMER())).toBe(true);
  });

  it('refuses to confirm when the timer cannot be cancelled', () => {
    writeFileSync(DROPIN(), 'PermitRootLogin no\n');
    expect(runRemote('apply').status).toBe(0);
    const res = runRemote('confirm', { STOP_FAILS: '1' });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('could not cancel');
    expect(existsSync(SAVED())).toBe(true);
    // The refusal says the revert will still fire; a confirmed marker left
    // behind would make that revert quietly do nothing instead.
    expect(existsSync(`${REVERT()}.confirmed`)).toBe(false);
  });

  it('keeps the hardened file when the timer fires just as confirm cancels it', () => {
    // Defect caught: the timer elapsing a moment before the cancel, its queued
    // revert running once the cancel is done but before the confirmed marker is
    // written, so the previous file is back while the run reports "confirmed".
    writeFileSync(DROPIN(), 'PermitRootLogin no\n');
    expect(runRemote('apply').status).toBe(0);
    const before = reloads();
    const res = runRemote('confirm', { STOP_FIRES_REVERT: '1' });

    expect(res.status, res.stderr).toBe(0);
    expect(readFileSync(DROPIN(), 'utf8')).toContain('PasswordAuthentication no');
    expect(reloads()).toBe(before);
  });

  it('refuses to call a change confirmed when a revert already under way put the old file back', () => {
    // Defect caught: a revert that looked for the marker before confirm wrote it
    // and finished while confirm was cancelling the timer; with its service
    // already inactive, only the file shows the change is gone, and confirm
    // reports "confirmed" over an open host.
    writeFileSync(DROPIN(), 'PermitRootLogin no\n');
    expect(runRemote('apply').status).toBe(0);
    const res = runRemote('confirm', { STOP_REVERTS_PAST_CHECK: '1' });

    expect(res.status).toBe(1);
    expect(readFileSync(DROPIN(), 'utf8')).toBe('PermitRootLogin no\n');
    expect(res.stdout).not.toContain('the change is confirmed');
    expect(res.stderr).toContain('put the previous file back');
  });

  it('never lets a revert that started first undo a confirmed change', () => {
    // Defect caught: the same race seen from the other side. The service had
    // already started when confirm ran, and acts after the marker is written.
    writeFileSync(DROPIN(), 'PermitRootLogin no\n');
    expect(runRemote('apply').status).toBe(0);
    const script = readFileSync(REVERT(), 'utf8');
    expect(runRemote('confirm').status).toBe(0);
    writeFileSync(REVERT(), script);
    const before = reloads();
    const fired = spawnSync('bash', [REVERT()], { env: { ...process.env, ...remoteEnv({}) }, encoding: 'utf8', ...SPAWN_GUARD });

    expect(fired.status, fired.stderr).toBe(0);
    expect(readFileSync(DROPIN(), 'utf8')).toContain('PasswordAuthentication no');
    expect(reloads()).toBe(before);
  });

  it('lets the revert service report a failed reload as its own failure', () => {
    // Defect caught: a revert that restored the file but whose failed reload
    // left the daemon on the hardened settings with the unit reporting success.
    expect(runRemote('apply').status).toBe(0);
    const fired = spawnSync('bash', [REVERT()], {
      env: { ...process.env, ...remoteEnv({ RELOAD_EXIT: '1' }) }, encoding: 'utf8', ...SPAWN_GUARD,
    });

    expect(fired.status).toBe(1);
  });

  it('says so in status when a change is waiting to be confirmed', () => {
    expect(runRemote('apply').status).toBe(0);
    const res = runRemote('status');

    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('waiting to be confirmed');
    expect(runRemote('confirm').status).toBe(0);
    expect(runRemote('status').stdout).not.toContain('waiting to be confirmed');
  });

  it('points a leftover saved copy at the confirm run', () => {
    writeFileSync(join(dropinDir, '.10-footbag-hardening.conf.prev'), 'x\n');
    const res = runRemote('apply');

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('confirm run');
  });

  it('arms exactly the unit, delay and options it relies on', () => {
    // Defect caught: a timer set under a name the confirm and the pending check
    // never look at, so nothing could ever cancel it.
    expect(runRemote('apply', { REVERT_AFTER: '123' }).status).toBe(0);
    const line = calls().split('\n').find((l) => l.startsWith('systemd-run '))!;

    expect(line).toContain('--unit=footbag-sshd-revert');
    expect(line).toContain('--on-active=123s');
    expect(line).toContain('--collect');
    expect(line).toContain('--timer-property=AccuracySec=1s');
    expect(line).toContain('/bin/bash');
  });

  it('writes a revert script that survives a path with spaces', () => {
    // Defect caught: unquoted paths in the generated script, which would break
    // the revert exactly when it is needed.
    const spaced = join(workDir, 'dir with spaces');
    mkdirSync(spaced);
    const script = join(spaced, 'revert.sh');
    expect(runRemote('apply', { REVERT_SCRIPT: script }).status).toBe(0);
    const fired = spawnSync('bash', [script], {
      env: { ...process.env, ...remoteEnv({ REVERT_SCRIPT: script }) }, encoding: 'utf8', ...SPAWN_GUARD,
    });

    expect(fired.status, fired.stderr).toBe(0);
    expect(existsSync(script)).toBe(false);
  });

  it('finishes its restore even when interrupted again while restoring', () => {
    // Defect caught: a second interrupt landing inside the restore and ending it
    // before it reports, or before the file is back.
    writeFileSync(DROPIN(), 'PermitRootLogin no\n');
    const res = runRemote('apply', { TERM_ON_EVERY_RELOAD: '1' });

    expect(res.status).not.toBe(0);
    expect(readFileSync(DROPIN(), 'utf8')).toBe('PermitRootLogin no\n');
    expect(reloads()).toBe(2);
    expect(res.stderr).toContain('previous sshd configuration file is back');
  });

  it('reports success, not failure, when the connection closes after the change is live', () => {
    // Defect caught: the reload succeeded and the change is in force, but the
    // closed connection kills the report and the run exits as a failure.
    const res = spawnSync('bash', ['-c', [
      `bash ${JSON.stringify(REMOTE_HALF)} | sed '/systemctl reload/q' >/dev/null`,
      'echo "rc=${PIPESTATUS[0]}"',
    ].join('\n')], {
      env: { ...process.env, ...remoteEnv({ MODE: 'apply' }) },
      encoding: 'utf8',
      ...SPAWN_GUARD,
    });

    expect(res.stdout).toContain('rc=0');
    expect(dropinNames()).toEqual(['10-footbag-hardening.conf']);
    expect(reloads()).toBe(1);
  });

  it('sets the self-revert before the reload, and keeps it set after', () => {
    // Defect caught: a change made live with nothing that will undo it if the
    // operator can never reach the host again.
    const res = runRemote('apply');

    expect(res.status, res.stderr).toBe(0);
    const log = calls().split('\n');
    const armedAt = log.findIndex((l) => l.startsWith('systemd-run '));
    const reloadAt = log.findIndex((l) => l === 'systemctl reload sshd');
    expect(armedAt).toBeGreaterThanOrEqual(0);
    expect(armedAt).toBeLessThan(reloadAt);
    expect(log[armedAt]).toContain('--on-active=300s');
    expect(readFileSync(TIMER(), 'utf8')).toBe(REVERT());
    expect(existsSync(REVERT())).toBe(true);
  });

  it.each([
    ['there was no file before', null],
    ['there was a file before', 'PermitRootLogin no\n'],
  ] as const)('reverts by itself, unconfirmed, when %s', (_label, previous) => {
    // Defect caught: the timer firing and leaving the change in place, or
    // removing a file that was there before, or not reloading afterwards.
    if (previous !== null) writeFileSync(DROPIN(), previous);
    expect(runRemote('apply').status).toBe(0);
    const before = reloads();
    const fired = spawnSync('bash', [REVERT()], { env: { ...process.env, ...remoteEnv({}) }, encoding: 'utf8', ...SPAWN_GUARD });

    expect(fired.status, fired.stderr).toBe(0);
    if (previous === null) expect(dropinNames()).toEqual([]);
    else expect(readFileSync(DROPIN(), 'utf8')).toBe(previous);
    expect(existsSync(SAVED())).toBe(false);
    expect(reloads()).toBe(before + 1);
    expect(existsSync(REVERT())).toBe(false);
  });

  it('confirms by cancelling the revert and keeping the hardened file', () => {
    writeFileSync(DROPIN(), 'PermitRootLogin no\n');
    expect(runRemote('apply').status).toBe(0);
    const res = runRemote('confirm');

    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(TIMER())).toBe(false);
    expect(existsSync(SAVED())).toBe(false);
    expect(existsSync(REVERT())).toBe(false);
    expect(readFileSync(DROPIN(), 'utf8')).toContain('PasswordAuthentication no');
  });

  it('refuses to call a change confirmed once it has already reverted', () => {
    // Defect caught: a run told "confirmed" about a host whose timer already put
    // the old, open configuration back.
    expect(runRemote('apply').status).toBe(0);
    spawnSync('bash', [REVERT()], { env: { ...process.env, ...remoteEnv({}) }, encoding: 'utf8', ...SPAWN_GUARD });
    rmSync(TIMER(), { force: true });
    const res = runRemote('confirm');

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('already reverted');
  });

  it('refuses a new change while an earlier one is still waiting to be confirmed', () => {
    expect(runRemote('apply').status).toBe(0);
    const res = runRemote('apply');

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('still waiting to be confirmed');
  });

  it('makes nothing live when the self-revert cannot be set', () => {
    // Defect caught: a reload with no revert behind it because the timer
    // quietly failed to start.
    const res = runRemote('apply', { SYSTEMD_RUN_EXIT: '1' });

    expect(res.status).toBe(1);
    expect(reloads()).toBe(0);
    expect(dropinNames()).toEqual([]);
    expect(existsSync(REVERT())).toBe(false);
  });

  it('cancels the self-revert when a later step fails before the change is kept', () => {
    // Defect caught: a stray timer left armed after a failed run, firing later
    // and undoing a change made since.
    const res = runRemote('apply', { RELOAD_EXIT: '1' });

    expect(res.status).toBe(1);
    expect(existsSync(TIMER())).toBe(false);
    expect(existsSync(REVERT())).toBe(false);
  });

  it('finds the connecting account\'s keys in its home directory', () => {
    // Defect caught: the key lookup reading the wrong field of the account
    // record, so every real run refuses with "no authorized key".
    const home = join(workDir, 'home-footbag');
    mkdirSync(join(home, '.ssh'), { recursive: true });
    writeFileSync(join(home, '.ssh', 'authorized_keys'), 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE operator\n');
    writeFileSync(join(binDir, 'getent'), [
      '#!/usr/bin/env bash',
      `[[ "$1 $2" == "passwd footbag" ]] && echo "footbag:x:1000:1000:Footbag operator:${home}:/bin/bash"`,
    ].join('\n'));
    chmodSync(join(binDir, 'getent'), 0o755);

    expect(runRemote('apply', { LOGIN_KEYS: '' }).status).toBe(0);
    rmSync(join(home, '.ssh', 'authorized_keys'));
    const refused = runRemote('apply', { LOGIN_KEYS: '' });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain(`no authorized key at ${home}/.ssh/authorized_keys`);
  });

  it('runs to completion when its body arrives on stdin, as it does over the wire', () => {
    // Defect caught: a command inside the body reading stdin and swallowing the
    // rest of the script, which ends the run early and quietly.
    const body = readFileSync(REMOTE_HALF, 'utf8');
    const res = spawnSync('bash', [], {
      env: { ...process.env, ...remoteEnv({}) },
      input: `MODE=apply\n${body}`,
      encoding: 'utf8',
      ...SPAWN_GUARD,
    });

    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('root, password and keyboard-interactive login off');
    expect(reloads()).toBe(1);
  });
});

describe('the operator-facing run', () => {
  /** A stand-in ssh: answers the alias and identity questions, records every
   *  session's stdin and every invocation in order, and answers the two proofs. */
  function standInHost(recorded?: string): { env: NodeJS.ProcessEnv; sessions: string; order: string } {
    const stubDir = join(workDir, 'host-bin');
    mkdirSync(stubDir, { recursive: true });
    const sessions = join(workDir, 'sessions.log');
    const order = join(workDir, 'order.log');
    writeFileSync(join(stubDir, 'ssh'), [
      '#!/usr/bin/env bash',
      hostIdentityAnswer(recorded),
      'for a in "$@"; do',
      '  if [[ "$a" == "-G" ]]; then printf "hostname 203.0.113.40\\nuser footbag\\n"; exit 0; fi',
      'done',
      `printf '%s\\n' "$*" >> "${order}"`,
      'if [[ "${!#}" == "true" ]]; then',
      '  if [[ " $* " == *"PubkeyAuthentication=no"* ]]; then',
      '    [[ -n "${PASSWORD_ACCEPTED:-}" ]] && exit 0',
      `    if [[ -n "\${FIRST_PROBE_REFUSED:-}" && ! -e "${order}.probed" ]]; then`,
      `      : > "${order}.probed"`,
      '      echo "ssh: connect to host 203.0.113.40 port 22: Connection refused" >&2',
      '      exit 255',
      '    fi',
      '    echo "footbag@203.0.113.40: ${PASSWORD_REFUSAL:-Permission denied (publickey).}" >&2',
      '    exit 255',
      '  fi',
      '  exit "${FRESH_EXIT:-0}"',
      'fi',
      `{ cat; echo "=== end of session"; } >> "${sessions}"`,
      // CONFIRM_FAILS fails only the session whose body carries MODE=confirm.
      `if [[ -n "\${CONFIRM_FAILS:-}" ]] && tail -n 400 "${sessions}" | grep -q '^MODE=confirm$'; then exit 1; fi`,
      'exit 0',
    ].join('\n'));
    chmodSync(join(stubDir, 'ssh'), 0o755);
    const pin = join(workDir, 'pin');
    writeFileSync(pin, '[203.0.113.40]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE\n');
    return {
      env: { ...process.env, PATH: `${stubDir}:${process.env.PATH ?? ''}`, FOOTBAG_KNOWN_HOSTS: pin },
      sessions,
      order,
    };
  }

  function runOperator(args: string[], env: NodeJS.ProcessEnv) {
    const res = spawnSync('setsid', ['bash', OPERATOR_SCRIPT, ...args], {
      encoding: 'utf8',
      input: 'fixture-sudo-password\n',
      env,
      ...SPAWN_GUARD,
    });
    return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }

  function read(path: string): string {
    return existsSync(path) ? readFileSync(path, 'utf8') : '';
  }

  it('refuses a missing or unknown target before reaching any host', () => {
    const { env, sessions } = standInHost();
    for (const args of [['--apply'], ['--target', 'prod', '--apply']]) {
      const res = runOperator(args, env);
      expect(res.status, args.join(' ')).toBe(1);
      expect(res.stderr).toContain('--target must be production or staging');
    }
    expect(read(sessions)).toBe('');
  });

  it('reads the posture without --apply, and proves nothing it did not change', () => {
    const { env, sessions, order } = standInHost();
    const res = runOperator(['--target', 'staging'], env);

    expect(res.status, res.stderr).toBe(0);
    expect(read(sessions)).toMatch(/^MODE=status$/m);
    expect(read(sessions)).not.toMatch(/^MODE=apply$/m);
    expect(read(order)).not.toMatch(/ true$/m);
  });

  it('sends the password as the first line of the stream and never as an argument', () => {
    // Defect caught: the password reaching a process list, or a stream whose
    // first line is not the one sudo consumes.
    const { env, sessions, order } = standInHost();
    runOperator(['--target', 'staging', '--apply'], env);

    expect(read(sessions).split('\n')[0]).toBe('fixture-sudo-password');
    expect(read(order)).not.toContain('fixture-sudo-password');
  });

  it('hardens staging, then proves a fresh key connection and a refused password, in that order', () => {
    // Defect caught: a success reported over the session that made the change,
    // which a reload never cuts, or a proof run before the change it proves.
    const { env, order } = standInHost();
    const res = runOperator(['--target', 'staging', '--apply'], env);

    expect(res.status, res.stderr).toBe(0);
    const lines = read(order).trim().split('\n');
    const applyAt = lines.findIndex((l) => l.endsWith('sudo -k -S -p "" bash'));
    const freshAt = lines.findIndex((l) => l.endsWith(' true') && !l.includes('PubkeyAuthentication=no'));
    const passwordAt = lines.findIndex((l) => l.includes('PubkeyAuthentication=no'));
    expect(applyAt).toBeGreaterThanOrEqual(0);
    expect(freshAt).toBeGreaterThan(applyAt);
    expect(passwordAt).toBeGreaterThan(freshAt);
    for (const at of [freshAt, passwordAt]) {
      expect(lines[at]).toContain('ControlPath=none');
      expect(lines[at]).toContain('BatchMode=yes');
      expect(lines[at]).toContain('UserKnownHostsFile=');
    }
    // The probe must offer only the two methods it is proving are gone, or a
    // refusal could be about some other method.
    expect(lines[passwordAt]).toContain('PreferredAuthentications=password,keyboard-interactive');
    expect(res.stdout).toContain('password login refused');
  });

  it('retries the password probe when sshd refuses the connection while it re-executes', () => {
    // Defect caught: a host that did harden reported as failed, because the one
    // probe landed in the moment the reloaded daemon was not yet listening.
    const { env } = standInHost();
    const res = runOperator(['--target', 'staging', '--apply'], { ...env, FIRST_PROBE_REFUSED: '1' });

    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('password login refused');
  });

  it('leaves the change unconfirmed, for the host to revert, when no fresh connection succeeds', () => {
    // Defect caught: a lockout the operator has to repair through break-glass,
    // where the host could have undone the change by itself.
    const { env, order, sessions } = standInHost();
    const res = runOperator(['--target', 'staging', '--apply'], { ...env, FRESH_EXIT: '255' });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('NEW connection');
    expect(res.stderr).toContain('NOT confirmed');
    expect(read(order).split('\n').filter((l) => l.endsWith(' true')).length).toBe(3);
    expect(read(sessions)).not.toMatch(/^MODE=confirm$/m);
  });

  it('confirms the change only after both proofs pass', () => {
    // Defect caught: the self-revert cancelled before the host is proved
    // reachable, which removes the one safety net a lockout would need.
    const { env, order, sessions } = standInHost();
    const res = runOperator(['--target', 'staging', '--apply'], env);

    expect(res.status, res.stderr).toBe(0);
    const lines = read(order).trim().split('\n');
    const passwordAt = lines.findIndex((l) => l.includes('PubkeyAuthentication=no'));
    // Exactly two privileged sessions, the change and then its confirmation, and
    // the confirmation comes after the password proof.
    const sessionsAt = lines.map((l, i) => (l.endsWith('sudo -k -S -p "" bash') ? i : -1)).filter((i) => i >= 0);
    expect(sessionsAt).toHaveLength(2);
    expect(sessionsAt[1]).toBeGreaterThan(passwordAt);
    expect(read(sessions)).toMatch(/^MODE=confirm$/m);
  });

  it('says the state is uncertain, and what to read, when confirming fails', () => {
    // Defect caught: a message claiming the host will revert, when the failure
    // may have come after the timer was cancelled and the change is kept.
    const { env, sessions } = standInHost();
    const res = runOperator(['--target', 'staging', '--apply'], { ...env, CONFIRM_FAILS: '1' });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('state is not certain');
    expect(res.stderr).toContain('--confirm');
    expect(res.stderr).not.toContain('will put the previous configuration back within');
    expect(read(sessions)).toMatch(/^MODE=confirm$/m);
  });

  it('finishes an unconfirmed change with --confirm, asking at a terminal first', () => {
    const { env, sessions } = standInHost();
    const res = runOperator(['--target', 'staging', '--confirm'], env);

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('not confirmed');
    expect(read(sessions)).not.toMatch(/^MODE=confirm$/m);
    expect(read(sessions)).not.toMatch(/^MODE=apply$/m);
  });

  /** Through `script`, so the run has a terminal to confirm on; the sudo
   *  password is redirected in from a file, as the usage line documents. */
  function runOperatorInTerminal(args: string[], typed: string, env: NodeJS.ProcessEnv) {
    const cred = join(workDir, 'cred');
    writeFileSync(cred, 'fixture-sudo-password\n', { mode: 0o600 });
    const inner = ['bash', JSON.stringify(OPERATOR_SCRIPT), ...args.map((a) => JSON.stringify(a)), '<', JSON.stringify(cred)].join(' ');
    const res = spawnSync('script', ['-qec', inner, '/dev/null'], {
      encoding: 'utf8',
      input: typed,
      env,
      ...SPAWN_GUARD,
    });
    return { status: res.status ?? -1, out: res.stdout ?? '' };
  }

  describe.skipIf(!requireToolInCI('script', '--version'))('finishing an unconfirmed change at a terminal', () => {
    it('reads the posture, proves both things, then confirms, and never applies again', () => {
      // Defect caught: --confirm re-running the change itself, which re-arms a
      // revert and reloads a host the operator only meant to finish; or the
      // confirmation sent before the key and password proofs it depends on.
      const { env, sessions, order } = standInHost();
      const res = runOperatorInTerminal(['--target', 'staging', '--confirm'], 'APPLY\n', env);

      expect(res.status, res.out).toBe(0);
      const modes = read(sessions).split('\n').filter((l) => l.startsWith('MODE='));
      expect(modes).toEqual(['MODE=status', 'MODE=confirm']);
      const lines = read(order).trim().split('\n');
      const sessionsAt = lines.map((l, i) => (l.endsWith('sudo -k -S -p "" bash') ? i : -1)).filter((i) => i >= 0);
      const freshAt = lines.findIndex((l) => l.endsWith(' true') && !l.includes('PubkeyAuthentication=no'));
      const passwordAt = lines.findIndex((l) => l.includes('PubkeyAuthentication=no'));
      expect(sessionsAt).toHaveLength(2);
      expect(freshAt).toBeGreaterThan(sessionsAt[0]);
      expect(passwordAt).toBeGreaterThan(freshAt);
      expect(sessionsAt[1]).toBeGreaterThan(passwordAt);
    });

    it('confirms nothing, and proves nothing, when the typed word is not exactly APPLY', () => {
      // Defect caught: a case-insensitive or prefix match that lets a casual
      // answer cancel the host's self-revert.
      const { env, sessions, order } = standInHost();
      const res = runOperatorInTerminal(['--target', 'staging', '--confirm'], 'apply\n', env);

      expect(res.status).toBe(1);
      expect(res.out).toContain('not confirmed');
      expect(read(sessions)).not.toMatch(/^MODE=confirm$/m);
      expect(read(order)).not.toMatch(/ true$/m);
    });

    it('does not promise a self-revert when the host it is finishing has already reverted', () => {
      // Defect caught: an operator told to wait for the host to put its previous
      // configuration back, about a host that already did, so the open posture
      // is left as it is instead of being hardened again with --apply.
      const { env, sessions } = standInHost();
      const res = runOperatorInTerminal(['--target', 'staging', '--confirm'], 'APPLY\n',
        { ...env, PASSWORD_REFUSAL: 'Permission denied (publickey,password).' });

      expect(res.status).toBe(1);
      expect(res.out).toContain('still offers');
      expect(res.out).not.toContain('reloads by itself');
      expect(res.out).not.toContain('the reload did not take effect');
      expect(res.out).toContain('--apply');
      expect(read(sessions)).not.toMatch(/^MODE=confirm$/m);
    });
  });

  it('does not confirm when the running daemon still takes a password', () => {
    const { env, sessions } = standInHost();
    const res = runOperator(['--target', 'staging', '--apply'], { ...env, PASSWORD_ACCEPTED: '1' });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('NOT confirmed');
    expect(read(sessions)).not.toMatch(/^MODE=confirm$/m);
  });

  it.each([
    ['the daemon accepts a password-only connection', { PASSWORD_ACCEPTED: '1' }, 'was accepted'],
    ['the daemon still offers password login', { PASSWORD_REFUSAL: 'Permission denied (publickey,password).' }, 'still offers'],
    ['the daemon still offers keyboard-interactive login', { PASSWORD_REFUSAL: 'Permission denied (publickey,keyboard-interactive).' }, 'still offers'],
    ['the refusal names no methods', { PASSWORD_REFUSAL: 'Connection closed by remote host' }, 'could not read'],
  ] as const)('fails when %s', (_label, extra, message) => {
    // Defect caught: success reported from the file on disk while the running
    // daemon, which never reloaded, still takes a password.
    const { env } = standInHost();
    const res = runOperator(['--target', 'staging', '--apply'], { ...env, ...extra });

    expect(res.status).toBe(1);
    expect(res.stderr).toContain(message);
  });

  it('refuses a production change nobody confirmed at a terminal, after showing the posture', () => {
    const { env, sessions } = standInHost();
    const res = runOperator(['--target', 'production', '--apply'], env);

    expect(res.status).toBe(1);
    expect(res.stderr).toContain('not confirmed');
    expect(read(sessions)).toMatch(/^MODE=status$/m);
    expect(read(sessions)).not.toMatch(/^MODE=apply$/m);
  });

  it('refuses a host that records another environment before changing anything', () => {
    const { env, sessions } = standInHost('production');
    const res = runOperator(['--target', 'staging', '--apply'], env);

    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/records FOOTBAG_ENV=production, but this run is --target staging/);
    expect(read(sessions)).not.toMatch(/^MODE=apply$/m);
  });
});
