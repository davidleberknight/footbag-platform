/**
 * Stepping a host to the pinned Amazon Linux release.
 *
 * The contract. The root-side body judges a step by the outcome, not by the
 * package manager's exit status: the release the host then reports, an empty
 * list of packages still to install at that release, and a reboot decision that
 * is never "yes" by default. Every problem it meets, including a scriptlet error
 * dnf printed and then exited 0 over, reaches the operator's closing report and
 * fails the run.
 *
 * The operator half refuses a missing or unknown target, a host recording
 * another environment, and a production step outside the release gate, each
 * before anything is sent. On a host that needs stepping it takes the recovery
 * points first (a complete snapshot, the service stopped and a backup newer than
 * the stop), then steps, reboots when told to, and reports success only once the
 * stack is healthy and the host matches the pins. A failure after the stop
 * leaves the service stopped and says so in the report.
 *
 * The root-side bodies run here with the host's tools stubbed. The operator half
 * runs against a stand-in ssh that executes each privileged stream locally, as
 * the host would, so the real remote halves run end to end.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { hostIdentityAnswer } from '../fixtures/hostIdentityStub';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const REMOTE_HALF = join(process.cwd(), 'scripts/internal/step-amazon-linux-remote.sh');
const REPORT_LIB = join(process.cwd(), 'scripts/lib/closing-report-remote.sh');
const DNF_PARSER = join(process.cwd(), 'scripts/internal/dnf-check-update-remote.sh');
const OPERATOR_SCRIPT = join(process.cwd(), 'scripts/step-amazon-linux.sh');
const PINS = readFileSync(join(process.cwd(), 'ops/tool-versions.env'), 'utf8');
const pin = (k: string): string => {
  const m = PINS.match(new RegExp(`^${k}=(.*)$`, 'm'));
  if (!m) throw new Error(`no ${k} in ops/tool-versions.env`);
  return m[1].trim();
};
const PIN = pin('AMAZON_LINUX_RELEASE');
const OLD = '2023.6.20241010';

let dir: string;
let hostBin: string;
let state: string;
let releaseFile: string;
let callLog: string;

beforeEach(() => {
  dir = createScratchDir('step-al');
  hostBin = join(dir, 'host-bin');
  state = join(dir, 'state');
  mkdirSync(hostBin);
  mkdirSync(state);
  releaseFile = join(dir, 'amazon-linux-release');
  callLog = join(dir, 'calls.log');
  writeFileSync(releaseFile, `Amazon Linux release ${OLD} (Amazon Linux)\n`);
  writeHostTools();
});

afterEach(() => removeScratch(dir));

function exe(path: string, lines: string[]): void {
  writeFileSync(path, ['#!/usr/bin/env bash', ...lines, ''].join('\n'));
  chmodSync(path, 0o755);
}

/**
 * The host's tools. Each records its call; its behaviour is steered by files in
 * the state directory, so one case can change one thing.
 */
function writeHostTools(): void {
  const log = JSON.stringify(callLog);
  const st = JSON.stringify(state);
  exe(join(hostBin, 'dnf'), [
    `echo "dnf $*" >> ${log}`,
    'case "$*" in',
    '  *check-update*)',
    `    if [[ -e ${st}/upgraded && ! -e ${st}/left-behind ]]; then exit 0; fi`,
    `    [[ -e ${st}/check-update-fails ]] && { echo "Error: repo unreachable"; exit 1; }`,
    `    [[ -e ${st}/check-update-listing ]] && { cat ${st}/check-update-listing; exit 100; }`,
    '    echo "docker.x86_64   25.0.16-1.amzn2023.0.5   amazonlinux"',
    '    echo "kernel.x86_64   6.1.150-1.amzn2023       amazonlinux"',
    '    exit 100 ;;',
    '  *check-release-update*) exit 0 ;;',
    '  *upgrade*)',
    `    echo "Upgrading 2 packages"`,
    `    [[ -e ${st}/scriptlet-error ]] && echo "warning: %post(docker) scriptlet failed, exit status 1"`,
    `    [[ -e ${st}/upgrade-misses ]] || echo "Amazon Linux release ${PIN} (Amazon Linux)" > ${JSON.stringify(releaseFile)}`,
    `    touch ${st}/upgraded`,
    '    exit 0 ;;',
    `  *needs-restarting*) exit "$(cat ${st}/needs-restarting-rc 2>/dev/null || echo 0)" ;;`,
    'esac',
    'exit 0',
  ]);
  // The service is active from a restart until the next stop, unless a case
  // makes the stop not take.
  exe(join(hostBin, 'systemctl'), [
    `echo "systemctl $*" >> ${log}`,
    'case "$1" in',
    `  stop) rm -f ${st}/running ;;`,
    `  restart) touch ${st}/running; [[ -e ${st}/restart-prints-error ]] && echo "Error: stand-in failure printed by the restart" ;;`,
    `  is-active) [[ -e ${st}/stays-active || -e ${st}/running ]] && exit 0; exit 3 ;;`,
    'esac',
    'exit 0',
  ]);
  exe(join(hostBin, 'systemd-run'), [
    `echo "systemd-run $*" >> ${log}`,
    // The reboot half schedules a reboot; a "reboot" here gives the host a new
    // boot id for the operator side's poll to find.
    `case "$*" in *--on-active*) echo "booted-again" > ${st}/boot-id; exit 0 ;; esac`,
    'while [[ "$1" == -* ]]; do shift; done',
    'exec "$@"',
  ]);
  exe(join(hostBin, 'df'), [
    'echo "Filesystem 1048576-blocks Used Available Capacity Mounted on"',
    `echo "/dev/root 40000 10000 $(cat ${st}/free-mb 2>/dev/null || echo 30000) 25% /"`,
  ]);
  // The restart body's compose calls: every container running and healthy, and
  // readiness answering.
  exe(join(hostBin, 'docker'), [
    `echo "docker $*" >> ${log}`,
    'case "$*" in',
    '  *"ps --all --format"*) echo "web running healthy"; echo "nginx running " ;;',
    `  *"compose version --short"*) echo "${pin('COMPOSE_VERSION').replace(/^v/, '')}" ;;`,
    'esac',
    'exit 0',
  ]);
  exe(join(hostBin, 'sqlite3'), [`echo "${pin('SQLITE_VERSION')} 2026-01-01 00:00:00 fixture"`]);
  exe(join(hostBin, 'rpm'), [`printf '%s' "$(cat ${st}/docker-version 2>/dev/null || echo ${pin('DOCKER_ENGINE_HOST')})"`]);
}

function hostEnv(): NodeJS.ProcessEnv {
  const envFile = join(dir, 'host-env');
  writeFileSync(envFile, 'FOOTBAG_ENV=staging\n');
  return {
    PATH: `${hostBin}:${process.env.PATH ?? ''}`,
    AL_RELEASE_FILE: releaseFile,
    REBOOT_HINT_MARKER: join(state, 'reboot-hint-marker'),
    MIN_FREE_MB: '1024',
    ENV_PATH: envFile,
    POLL_TRIES: '1',
    HOST_SQLITE3_BIN: join(hostBin, 'sqlite3'),
    HOST_RPM_BIN: join(hostBin, 'rpm'),
  };
}

function runRemote(mode: string, extra: string[] = []) {
  const stream = [`MODE=${mode}`, `AMAZON_LINUX_RELEASE=${PIN}`, ...extra].join('\n') + '\n'
    + readFileSync(REPORT_LIB, 'utf-8') + '\n' + readFileSync(DNF_PARSER, 'utf-8') + '\n'
    + readFileSync(REMOTE_HALF, 'utf-8');
  const r = spawnSync('bash', ['-s'], {
    input: stream, encoding: 'utf-8', env: { ...process.env, ...hostEnv() }, ...SPAWN_GUARD,
  });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}
const calls = (): string => (existsSync(callLog) ? readFileSync(callLog, 'utf-8') : '');
const flag = (name: string, value = ''): void => writeFileSync(join(state, name), value);

describe('the root-side step', () => {
  it('stops the service, upgrades as a transient unit, and proves the release and an empty install list', () => {
    // Defect caught: an upgrade run inside the ssh session, which a dropped
    // connection cuts short half way, or one run with the service still serving.
    const r = runRemote('step');
    expect(r.status, r.out).toBe(0);
    const c = calls();
    expect(c).toMatch(/systemctl stop footbag-backup\.timer footbag-backup\.service footbag\.service/);
    expect(c).toMatch(new RegExp(`systemd-run --wait --pipe --collect .*dnf upgrade -y --releasever=${PIN.replace(/\./g, '\\.')}`));
    expect(c.indexOf('systemctl stop')).toBeLessThan(c.indexOf('dnf upgrade'));
    expect(r.out).toContain('---FOOTBAG-REBOOT--- not-needed');
    expect(r.out).not.toContain('---FOOTBAG-PROBLEM--- ERROR');
  });

  it('fails when the upgrade did not land the pinned release', () => {
    // Defect caught: the step reads done because dnf exited 0, while the host
    // still runs the old release and its old packages.
    flag('upgrade-misses');
    const r = runRemote('step');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(new RegExp(`---FOOTBAG-PROBLEM--- ERROR .*${OLD.replace(/\./g, '\\.')}.*not ${PIN.replace(/\./g, '\\.')}`));
  });

  it('fails on a scriptlet failure dnf printed and then exited 0 over', () => {
    // Defect caught: a package whose install script failed, streamed past and
    // never listed, as the host bootstrap once did.
    flag('scriptlet-error');
    const r = runRemote('step');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/---FOOTBAG-PROBLEM--- ERROR dnf upgrade: .*scriptlet failed/);
  });

  it('fails when packages at the pin are still not installed after the upgrade', () => {
    // Defect caught: a transaction that stopped part way, judged done because
    // the release file had already moved.
    flag('left-behind');
    const r = runRemote('step');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/still not installed/);
  });

  it('refuses to step with too little free disk, or with the service still running', () => {
    // Defect caught: a release step that fills the root filesystem mid
    // transaction, or one that restarts docker under live traffic.
    flag('free-mb', '200');
    const low = runRemote('step');
    expect(low.status).toBe(1);
    expect(low.out).toMatch(/only 200 MB free/);
    flag('free-mb', '30000');
    flag('stays-active');
    const active = runRemote('step');
    expect(active.status).toBe(1);
    expect(active.out).toMatch(/still active after the stop/);
    expect(calls()).not.toMatch(/dnf upgrade/);
  });

  it('says a reboot is needed when dnf says so or smart-restart left its marker, and never guesses one', () => {
    // Defect caught: a needed reboot forgotten, so the old kernel keeps running;
    // or a failed probe read as "reboot needed" and the host rebooted for nothing.
    flag('needs-restarting-rc', '1');
    expect(runRemote('step').out).toContain('---FOOTBAG-REBOOT--- needed');
    flag('needs-restarting-rc', '0');
    flag('reboot-hint-marker');
    expect(runRemote('status').out).toContain('---FOOTBAG-REBOOT--- needed');
    rmFlag('reboot-hint-marker');
    flag('needs-restarting-rc', '2');
    const unknown = runRemote('status');
    expect(unknown.status).toBe(1);
    expect(unknown.out).not.toContain('---FOOTBAG-REBOOT--- needed');
    expect(unknown.out).toMatch(/could not tell whether a reboot is needed/);
  });

  it('counts what a step would change without changing anything, and reports a failed count', () => {
    // Defect caught: a confirmation prompt showing a number nobody read, or a
    // repository error read as "nothing to do".
    const r = runRemote('preview');
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('---FOOTBAG-PREVIEW--- 2');
    expect(calls()).not.toMatch(/dnf upgrade|systemctl stop/);
    flag('check-update-fails');
    const failed = runRemote('preview');
    expect(failed.status).toBe(1);
    expect(failed.out).not.toContain('---FOOTBAG-PREVIEW---');
  });

  it('fails, rather than counts nothing, when dnf says updates exist in a listing it cannot read', () => {
    // Defect caught: after the upgrade, dnf still lists packages at the pin in a
    // layout the count does not match, the count comes back empty with no error,
    // and the step is reported complete over a transaction that did not finish;
    // before it, the confirmation shows no number at all and says nothing why.
    flag('left-behind');
    flag('check-update-listing', 'Some layout this parser has never seen\n');
    const step = runRemote('step');
    expect(step.status, step.out).toBe(1);
    expect(step.out).toMatch(/^---FOOTBAG-PROBLEM--- ERROR .*listed none this parser can count/m);
    const preview = runRemote('preview');
    expect(preview.status).toBe(1);
    expect(preview.out).not.toContain('---FOOTBAG-PREVIEW---');
    expect(preview.out).toMatch(/^---FOOTBAG-PROBLEM--- ERROR .*listed none this parser can count/m);
  });

  it('reports the host against the pins, each difference an error', () => {
    // Defect caught: a step reported done on a host whose docker is not the
    // version the pins name.
    const helper = readFileSync(join(process.cwd(), 'scripts/internal/host-tool-versions-remote.sh'), 'utf8');
    const expected = [
      `EXPECTED_SQLITE_VERSION=${pin('SQLITE_VERSION')}`,
      `EXPECTED_DOCKER_ENGINE=${pin('DOCKER_ENGINE_HOST')}`,
      `EXPECTED_AMAZON_LINUX_RELEASE=${PIN}`,
      `EXPECTED_COMPOSE_VERSION=${pin('COMPOSE_VERSION')}`,
    ];
    writeFileSync(releaseFile, `Amazon Linux release ${PIN} (Amazon Linux)\n`);
    flag('docker-version', '24.0.0-1.amzn2023');
    const stream = ['MODE=prove', `AMAZON_LINUX_RELEASE=${PIN}`, ...expected].join('\n') + '\n'
      + readFileSync(REPORT_LIB, 'utf-8') + '\n' + readFileSync(DNF_PARSER, 'utf-8') + '\n'
      + helper + '\n' + readFileSync(REMOTE_HALF, 'utf-8');
    const r = spawnSync('bash', ['-s'], { input: stream, encoding: 'utf-8', env: { ...process.env, ...hostEnv() }, ...SPAWN_GUARD });
    expect(r.status).toBe(1);
    expect((r.stdout ?? '') + (r.stderr ?? '')).toMatch(/---FOOTBAG-PROBLEM--- ERROR .*docker package is 24\.0\.0/);
  });
});

function rmFlag(name: string): void {
  spawnSync('rm', ['-f', join(state, name)], SPAWN_GUARD);
}

describe('the operator half', () => {
  /**
   * A stand-in ssh. It answers the identity question and the alias lookup, and
   * runs each privileged stream locally as the host would: the password line is
   * dropped and the rest goes to bash with the host's tools first on the path.
   */
  /**
   * `printsOwnLine` makes every privileged session print an unmarked line of its
   * own on stdout, and the backup read (after the reads and the stop) copies what
   * the run kept of those sessions into `onDisk`.
   */
  function standInHost(recorded?: string, printsOwnLine = false): { env: NodeJS.ProcessEnv; sessions: string; onDisk: string } {
    const bin = join(dir, 'bin');
    mkdirSync(bin, { recursive: true });
    const tmp = join(dir, 'tmp');
    mkdirSync(tmp, { recursive: true });
    const onDisk = join(dir, 'sessions-on-disk.txt');
    const sessions = join(dir, 'sessions.log');
    const host = hostEnv();
    exe(join(bin, 'ssh'), [
      hostIdentityAnswer(recorded),
      'for a in "$@"; do',
      '  if [[ "$a" == "-G" ]]; then printf "hostname 203.0.113.30\\nuser footbag\\n"; exit 0; fi',
      'done',
      `case "\${@: -1}" in *boot_id*) cat ${JSON.stringify(join(state, 'boot-id'))} 2>/dev/null; exit 0 ;; esac`,
      'IFS= read -r _password',
      `body="$(mktemp ${JSON.stringify(join(dir, 'session.XXXXXX'))})"`,
      'cat > "$body"',
      `cat "$body" >> ${JSON.stringify(sessions)}`,
      ...Object.entries(host).map(([k, v]) => `export ${k}=${JSON.stringify(v)}`),
      printsOwnLine ? 'echo "SESSION-ONLY-LINE from the host"' : ':',
      'bash "$body"; rc=$?',
      // The stop session ends as a dropped connection does, after its body ran.
      `[[ -e ${JSON.stringify(join(state, 'stop-session-drops'))} ]] && grep -q '^MODE=stop' "$body" && exit 255`,
      'exit "$rc"',
    ]);
    const known = join(dir, 'pin');
    writeFileSync(known, '[203.0.113.30]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE\n');
    exe(join(dir, 'aws'), [
      `echo "aws $*" >> ${JSON.stringify(callLog)}`,
      printsOwnLine
        ? `[[ "$*" == *list-objects-v2* ]] && cat "$TMPDIR"/*/send.* "$TMPDIR"/*/quiesce.* > ${JSON.stringify(onDisk)}`
        : ':',
      'case "$*" in',
      '  *create-instance-snapshot*) exit 0 ;;',
      `  *get-instance-snapshot*) [[ -e ${JSON.stringify(join(state, 'snapshot-error'))} ]] && { printf 'error\\t%s\\n' "$(date -u +%FT%TZ)"; exit 0; }`,
      `    [[ -e ${JSON.stringify(join(state, 'snapshot-old'))} ]] && { printf 'available\\t%s\\n' "$(date -u -d '-5 hours' +%FT%TZ)"; exit 0; }`,
      `    printf 'available\\t%s\\n' "$(date -u +%FT%TZ)" ;;`,
      `  *list-objects-v2*) [[ -e ${JSON.stringify(join(state, 'backup-old'))} ]] && { date -u -d '-10 min' +%FT%TZ; exit 0; }; date -u -d '+1 min' +%FT%TZ ;;`,
      '  *) echo "unexpected aws call: $*" >&2; exit 64 ;;',
      'esac',
    ]);
    exe(join(dir, 'terraform'), [
      'case "${@: -1}" in',
      '  lightsail_instance_name) echo footbag-staging-web ;;',
      '  snapshots_bucket_name) echo footbag-staging-snapshots ;;',
      '  *) exit 1 ;;',
      'esac',
    ]);
    return {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        FOOTBAG_KNOWN_HOSTS: known,
        FOOTBAG_STEP_AL_AWS_BIN: join(dir, 'aws'),
        FOOTBAG_STEP_AL_POLL_SECS: '0',
        TF_OUTPUT_BIN: join(dir, 'terraform'),
        ...awsIdentityStubEnv(dir),
        ...(printsOwnLine ? { TMPDIR: tmp } : {}),
      },
      sessions,
      onDisk,
    };
  }
  function runOperator(args: string[], env: NodeJS.ProcessEnv, script = OPERATOR_SCRIPT) {
    const r = spawnSync('setsid', ['bash', script, ...args], {
      encoding: 'utf8', input: 'fixture-sudo-password\n', env, ...SPAWN_GUARD,
    });
    return { status: r.status ?? -1, out: (r.stdout ?? '') + (r.stderr ?? ''), stderr: r.stderr ?? '' };
  }
  const sent = (s: string): string => (existsSync(s) ? readFileSync(s, 'utf8') : '');
  const report = (out: string): string => out.slice(Math.max(0, out.lastIndexOf('Closing report')));

  it('refuses a missing or unknown target before reaching any host', () => {
    const { env, sessions } = standInHost();
    for (const args of [[], ['--target', 'prod']]) {
      const r = runOperator(args, env);
      expect(r.status, args.join(' ')).toBe(1);
      expect(r.stderr).toContain('--target must be production or staging');
    }
    expect(existsSync(sessions)).toBe(false);
  });

  it('refuses a host recording another environment', () => {
    // Defect caught: a staging alias pointing at production steps the live host
    // under a staging label.
    const wrong = standInHost('production');
    const r = runOperator(['--target', 'staging'], wrong.env);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/records FOOTBAG_ENV=production, but this run is --target staging/);
    expect(sent(wrong.sessions)).not.toContain('MODE=step');
  });

  it('steps staging end to end: snapshot, stop and proved backup, step, start, and the pins proved', () => {
    // Defect caught: a host stepped with no way back, or a step reported done
    // before the stack came back healthy on the pinned versions.
    const { env, sessions } = standInHost();
    const r = runOperator(['--target', 'staging'], env);
    expect(r.status, r.out).toBe(0);
    const c = calls();
    const order = ['create-instance-snapshot', 'systemctl stop footbag\n', 'list-objects-v2', 'dnf upgrade', 'systemctl start footbag-backup.timer', 'systemctl restart footbag'];
    let at = -1;
    for (const step of order) {
      const next = c.indexOf(step.trim(), at + 1);
      expect(next, `${step} after the step before it`).toBeGreaterThan(at);
      at = next;
    }
    expect(sent(sessions)).toContain('MODE=prove');
    expect(report(r.out)).toMatch(/match the pins/);
    expect(report(r.out)).toMatch(/footbag-staging-web-pre-step-/);
  });

  it('keeps only the marked lines of each privileged session on disk', () => {
    // Defect caught: a session's whole stdout, which can carry anything the
    // privileged stream held, kept in a temp file for the rest of the run.
    const { env, onDisk } = standInHost(undefined, true);
    const r = runOperator(['--target', 'staging'], env);
    expect(r.status, r.out).toBe(0);
    const kept = readFileSync(onDisk, 'utf8').trim().split('\n');
    // The positive control: the values the run parses were kept.
    expect(kept).toContain('---FOOTBAG-QUIESCED---');
    const unmarked = kept.filter((l) => !/^---FOOTBAG-[A-Z0-9-]+---( |$)/.test(l));
    expect(unmarked).toEqual([]);
    // Shown to the operator as it arrived, though never written down.
    expect(r.out).toMatch(/SESSION-ONLY-LINE from the host/);
  });

  it('does not step when the stop session fails, even after it reported the backup done', () => {
    // Defect caught: a failed privileged session judged by its completion marker
    // alone, so the host is stepped and the closing report never names the failure.
    flag('stop-session-drops');
    const { env } = standInHost();
    const r = runOperator(['--target', 'staging'], env);
    expect(r.status).toBe(1);
    expect(report(r.out)).toMatch(/stop and back up: exit 255/);
    expect(calls()).not.toMatch(/dnf upgrade/);
  });

  it('fails the run on a problem the restart printed over a healthy stack', () => {
    // Defect caught: an error line from the unmarked restart body streamed past
    // and the run reporting success because the stack then came back healthy.
    flag('restart-prints-error');
    const { env } = standInHost();
    const r = runOperator(['--target', 'staging'], env);
    expect(r.status).toBe(1);
    expect(report(r.out)).toMatch(/start and prove the stack: Error: stand-in failure printed by the restart/);
  });

  it('reboots when the step says the host needs one, and proves it by a new boot id', () => {
    // Defect caught: a needed reboot printed and forgotten, so the old kernel
    // keeps running under a "done" report.
    flag('needs-restarting-rc', '1');
    const { env } = standInHost();
    const r = runOperator(['--target', 'staging'], env);
    expect(r.status, r.out).toBe(0);
    expect(calls()).toMatch(/systemd-run .*--on-active=5 .*systemctl reboot/);
    expect(report(r.out)).toMatch(/rebooted \(boot id booted-again\)/);
  });

  it('leaves the service stopped and says so when the step fails after the stop', () => {
    // Defect caught: a failed step that restarts the service on a half-upgraded
    // host, or one that ends with the site down and no line saying it is.
    flag('scriptlet-error');
    const { env } = standInHost();
    const r = runOperator(['--target', 'staging'], env);
    expect(r.status).toBe(1);
    const rep = report(r.out);
    expect(rep).toMatch(/scriptlet failed/);
    expect(rep).toMatch(/still STOPPED, deliberately/);
    expect(calls()).not.toMatch(/systemctl restart footbag/);
  });

  it('touches nothing on the host when the snapshot does not complete', () => {
    // Defect caught: a release stepped with no way back because the snapshot
    // failed and the run carried on.
    flag('snapshot-error');
    const { env } = standInHost();
    const r = runOperator(['--target', 'staging'], env);
    expect(r.status).toBe(1);
    expect(report(r.out)).toMatch(/not complete/);
    expect(calls()).not.toMatch(/systemctl stop|dnf upgrade/);
  });

  it('touches nothing on the host when the snapshot completes too late to trust', () => {
    // Defect caught: a snapshot started hours ago, past the limit the run sets,
    // accepted as the way back.
    flag('snapshot-old');
    const { env } = standInHost();
    const r = runOperator(['--target', 'staging'], env);
    expect(r.status).toBe(1);
    expect(report(r.out)).toMatch(/minutes old, past the/);
    expect(calls()).not.toMatch(/systemctl stop|dnf upgrade/);
  });

  it('does not step when the newest backup predates the stop', () => {
    // Defect caught: an older backup accepted as the last one, so writes made
    // between it and the stop live only on a host about to be changed.
    flag('backup-old');
    const { env } = standInHost();
    const r = runOperator(['--target', 'staging'], env);
    expect(r.status).toBe(1);
    expect(report(r.out)).toMatch(/newer than the stop/);
    expect(calls()).not.toMatch(/dnf upgrade/);
  });

  it('still reboots a host at the pin whose reboot is pending', () => {
    // Defect caught: a host that took its packages on an earlier run but never
    // rebooted, declared "nothing to do" while it runs the old kernel.
    writeFileSync(releaseFile, `Amazon Linux release ${PIN} (Amazon Linux)\n`);
    flag('upgraded');
    flag('needs-restarting-rc', '1');
    const { env } = standInHost();
    const r = runOperator(['--target', 'staging'], env);
    expect(r.status, r.out).toBe(0);
    expect(calls()).toMatch(/systemctl reboot/);
  });

  it('changes nothing on a host already at the pin with nothing left and no reboot pending', () => {
    // Defect caught: a re-run that snapshots and stops production for nothing.
    writeFileSync(releaseFile, `Amazon Linux release ${PIN} (Amazon Linux)\n`);
    flag('upgraded');
    const { env } = standInHost();
    const r = runOperator(['--target', 'staging'], env);
    expect(r.status, r.out).toBe(0);
    expect(calls()).not.toMatch(/create-instance-snapshot|systemctl stop|dnf upgrade/);
  });

  it('refuses a production step outside the release gate before anything is sent', () => {
    // Defect caught: production's operating system stepped to a pin no CI run
    // proved. The tree here is a copy with no repository behind it, which the
    // gate refuses as unreadable.
    const tree = join(dir, 'tree');
    cpSync(join(process.cwd(), 'scripts'), join(tree, 'scripts'), { recursive: true });
    mkdirSync(join(tree, 'ops'));
    cpSync(join(process.cwd(), 'ops/tool-versions.env'), join(tree, 'ops/tool-versions.env'));
    const { env, sessions } = standInHost();
    const r = runOperator(['--target', 'production'], { ...env, GIT_CEILING_DIRECTORIES: dir }, join(tree, 'scripts/step-amazon-linux.sh'));
    expect(r.status).toBe(1);
    expect(report(r.out)).toMatch(/release gate refuses/);
    expect(sent(sessions)).not.toMatch(/MODE=(preview|step)/);
  });
});

describe('step-amazon-linux.sh: proving visitors are served again after the restart', () => {
  // The check runs only on production, behind the release gate, so it is lifted
  // out of the script by name and run against a stand-in curl.
  function served(curl: string) {
    const src = readFileSync(join(process.cwd(), 'scripts/step-amazon-linux.sh'), 'utf-8');
    const fn = /^edge_served_again\(\) \{[\s\S]*?^\}$/m.exec(src)?.[0];
    expect(fn, 'edge_served_again is defined in the script').toBeTruthy();
    const stub = join(dir, 'curl-stand-in');
    writeFileSync(stub, ['#!/usr/bin/env bash', curl, ''].join('\n'));
    chmodSync(stub, 0o755);
    const body = [
      'set -euo pipefail',
      `source '${join(process.cwd(), 'scripts/lib/closing-report.sh')}'`,
      `CURL_BIN='${stub}'`,
      fn,
      'edge_served_again edge.example.test',
      'cr_finish',
      '',
    ].join('\n');
    const res = spawnSync('bash', ['-c', body], { encoding: 'utf-8', ...SPAWN_GUARD });
    const err = res.stderr ?? '';
    return err.slice(Math.max(0, err.lastIndexOf('Closing report')));
  }

  it('never proves an outage recovered when the edge cannot be read', () => {
    // Defect caught: curl failing prints status 000 and the run records that
    // visitors are served again, over a site nobody can reach.
    const r = served('echo "curl: (6) Could not resolve host: edge.example.test" >&2; printf 000; exit 6');
    expect(r).not.toMatch(/Proven:/);
    expect(r).toMatch(/could not be read after the restart.*Could not resolve host/);
  });

  it('does not prove a status that is not a page', () => {
    // Defect caught: an origin error after the restart recorded as recovery.
    const r = served('printf 502');
    expect(r).not.toMatch(/Proven:/);
    expect(r).toMatch(/answers 502 after the restart, not a page/);
  });

  it('warns on a cached 503 and proves a page answer', () => {
    // Defect caught: a branch that can never prove, or never warn.
    expect(served('printf 503')).toMatch(/still answers 503/);
    expect(served('printf 200')).toMatch(/Proven:[\s\S]*answers 200 again/);
  });
});
